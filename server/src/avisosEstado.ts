/**
 * Avisos de ESTADO DEL ENVÍO al cliente (en tránsito, en reparto, novedad, entregado…).
 *
 * Diseñado para no perderse nunca:
 *  - Un trigger de SQLite anota cada cambio de estado del pedido en la cola `avisos_estado`,
 *    venga de donde venga (webhook de Effi, consulta de Effi, Dropi, cambio a mano…).
 *  - Un ciclo cada minuto toma la cola y envía. Si el servidor se reinicia, la cola sigue ahí.
 *  - Si el cliente escribió en las últimas 24 h, el aviso sale como mensaje del bot.
 *    Si no, sale con la plantilla aprobada `estado_envio_pedido` (o la de guía / novedad).
 *  - Si algo falla (Meta caído, plantilla aún sin aprobar…), se reintenta con espera creciente
 *    hasta 48 h; si de verdad no se puede, queda en el registro del pedido con el motivo.
 *  - De noche (9 p. m. a 7 a. m. hora Colombia) no se escribe: el aviso sale a las 7 a. m.
 *  - Los datos van SIEMPRE del pedido real; nunca se usan los ejemplos de la plantilla.
 */
import { db, registrarLog, uid } from './db.js';
import { trazar } from './trazabilidad.js';

export const PLANTILLA_ESTADO = 'estado_envio_pedido';
/** Estados que se avisan solos (los cambia la transportadora). "Guía generada" la avisa avisoGuia.ts. */
export const ESTADOS_AVISADOS = ['En tránsito', 'En reparto', 'Novedad', 'Entregado'];

db.exec(`CREATE TABLE IF NOT EXISTS avisos_estado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  estado TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'auto',
  resultado TEXT NOT NULL DEFAULT '',
  detalle TEXT NOT NULL DEFAULT '',
  intentos INTEGER NOT NULL DEFAULT 0,
  proximo TEXT NOT NULL DEFAULT (datetime('now')),
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  enviado_at TEXT
)`);
try { db.exec("ALTER TABLE avisos_estado ADD COLUMN wamid TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
db.exec("CREATE INDEX IF NOT EXISTS idx_avisos_estado_pend ON avisos_estado(resultado, proximo)");
db.exec('CREATE INDEX IF NOT EXISTS idx_avisos_estado_orden ON avisos_estado(order_id, estado)');
db.exec(`CREATE TRIGGER IF NOT EXISTS trg_orders_aviso_estado AFTER UPDATE OF estado ON orders
  FOR EACH ROW WHEN NEW.estado IS NOT OLD.estado AND NEW.estado IN (${ESTADOS_AVISADOS.map((e) => `'${e}'`).join(',')})
  BEGIN
    INSERT INTO avisos_estado (store_id, order_id, estado) VALUES (NEW.store_id, NEW.id, NEW.estado);
  END`);

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

/** Encola un aviso a mano (p. ej. "Confirmado" o "Cancelado" cambiados desde el panel). */
export function encolarAviso(storeId: string, orderId: string, estado: string, origen = 'manual'): void {
  db.prepare('INSERT INTO avisos_estado (store_id, order_id, estado, origen) VALUES (?,?,?,?)').run(storeId, orderId, estado, origen);
  setTimeout(() => void procesarAvisos().catch(() => {}), 1500).unref?.();
}

/** Frase del estado para la plantilla (una sola línea: WhatsApp no deja saltos en variables). */
function fraseEstado(estado: string, transp: string): string {
  switch (estado) {
    case 'Confirmado': return 'quedó confirmado ✅ y ya lo estamos preparando para enviártelo';
    case 'En tránsito': return `va en camino 🚚${transp ? ` con ${transp}` : ''}`;
    case 'En reparto': return 'salió a reparto 🛵: hoy te lo entregan, ten el celular a mano';
    case 'Novedad': return `tiene una novedad en la entrega ⚠️${transp ? ` reportada por ${transp}` : ''}: respóndenos para ayudarte a recibirlo`;
    case 'Entregado': return 'fue entregado 🎉 Muchas gracias por tu compra';
    case 'Cancelado': return 'fue cancelado ❌ Si fue un error, respóndenos y lo retomamos';
    default: return `cambió de estado: ${estado}`;
  }
}

/** Mensaje del bot (ventana de 24 h abierta): más completo que la plantilla. */
function textoEstado(idi: 'es' | 'en', estado: string, d: { nombre: string; numDF: string; guia: string; transp: string }, base: string): string {
  const extra = d.guia && !['Confirmado', 'Cancelado'].includes(estado)
    ? (idi === 'en' ? `\n\n🧾 Tracking: ${d.guia}${d.transp ? ` (${d.transp})` : ''}` : `\n\n🧾 Guía: ${d.guia}${d.transp ? ` (${d.transp})` : ''}`)
    : '';
  return `${base}${extra}`;
}

const horaCO = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })) % 24;
/** Próximas 7 a. m. de Colombia, en formato de SQLite (UTC). */
function siguientes7am(): string {
  const ahora = new Date();
  const h = horaCO();
  const horas = h >= 21 ? 24 - h + 7 : 7 - h;
  const t = new Date(ahora.getTime() + horas * 3600_000);
  t.setUTCMinutes(Math.floor(Math.random() * 20), 0, 0); // 7:00–7:20, no todos de golpe
  return t.toISOString().replace('T', ' ').slice(0, 19);
}
const enMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString().replace('T', ' ').slice(0, 19);
const ESPERAS = [2, 5, 15, 30, 60, 120, 240, 480, 720, 1440]; // minutos entre reintentos (≈48 h en total)

function cerrar(a: Fila, resultado: 'enviado' | 'plantilla' | 'omitido' | 'fallido', detalle: string): void {
  db.prepare("UPDATE avisos_estado SET resultado = ?, detalle = ?, enviado_at = CASE WHEN ? IN ('enviado','plantilla') THEN datetime('now') ELSE enviado_at END WHERE id = ?")
    .run(resultado, detalle.slice(0, 400), resultado, a.id as number);
  const ok = resultado === 'enviado' || resultado === 'plantilla';
  if (resultado !== 'omitido' || /pidió que no|sin chat/.test(detalle)) {
    trazar(txt(a.store_id), txt(a.order_id), {
      etapa: 'aviso', nivel: ok ? 'ok' : resultado === 'fallido' ? 'warn' : 'info',
      titulo: ok ? `Aviso "${txt(a.estado)}" enviado al cliente (${resultado === 'plantilla' ? 'con plantilla' : 'por el chat'})` : resultado === 'fallido' ? `No se pudo avisar "${txt(a.estado)}" al cliente` : `Aviso "${txt(a.estado)}" no enviado`,
      detalle,
    });
  }
  if (resultado === 'fallido') registrarLog(txt(a.store_id), 'warn', 'envio', `No se pudo avisar al cliente que su pedido está "${txt(a.estado)}": ${detalle}`);
}
function reintentar(a: Fila, motivo: string): void {
  const n = Number(a.intentos) || 0;
  if (n >= ESPERAS.length) { cerrar(a, 'fallido', motivo); return; }
  db.prepare('UPDATE avisos_estado SET intentos = intentos + 1, detalle = ?, proximo = ? WHERE id = ?').run(`Reintento ${n + 1}: ${motivo}`.slice(0, 400), enMin(ESPERAS[n]), a.id as number);
}

/** Envía UN aviso de la cola. */
async function enviarAviso(a: Fila): Promise<void> {
  const storeId = txt(a.store_id); const estado = txt(a.estado);
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(txt(a.order_id), storeId) as Fila | undefined;
  if (!o) return cerrar(a, 'omitido', 'El pedido ya no existe.');
  // El estado cambió antes de enviar (p. ej. pasó de "En reparto" a "Entregado"): se avisa el último.
  if (txt(o.estado) !== estado) return cerrar(a, 'omitido', `El pedido ya está en "${txt(o.estado)}"; se avisa ese estado.`);
  const creado = new Date(txt(o.created_at).replace(' ', 'T') + 'Z').getTime();
  if (creado && Date.now() - creado > 60 * 86400_000) return cerrar(a, 'omitido', 'Pedido de hace más de 60 días.');
  // El mismo estado ya se avisó hace poco (la transportadora a veces lo repite).
  const ya = db.prepare("SELECT 1 FROM avisos_estado WHERE order_id = ? AND estado = ? AND id != ? AND resultado IN ('enviado','plantilla') AND enviado_at > datetime('now','-12 hours')").get(txt(o.id), estado, a.id as number);
  if (ya) return cerrar(a, 'omitido', 'Este estado ya se le avisó en las últimas 12 horas.');
  // "En tránsito" justo después del mensaje con la guía sobra: ese mensaje ya dice que va en camino.
  if (estado === 'En tránsito') {
    const av = (() => { try { return JSON.parse(txt(o.guia_aviso) || '{}') as { ok?: boolean; at?: string }; } catch { return {}; } })();
    if (av.ok && av.at && Date.now() - new Date(av.at).getTime() < 6 * 3600_000) return cerrar(a, 'omitido', 'Hace menos de 6 horas le llegó el mensaje con la guía (ya dice que va en camino).');
  }
  // Novedades de Effi: las avisa el módulo de novedades (con el motivo y la solución).
  if (estado === 'Novedad' && txt(o.despacho_proveedor) === 'effi') {
    const { cfgEffi } = await import('./effiApi.js');
    if (cfgEffi(storeId)?.novedades.avisarCliente) return cerrar(a, 'omitido', 'La novedad la avisa el módulo de Novedades de Effi (con el motivo).');
  }
  // De noche no se escribe.
  const h = horaCO();
  if (h >= 21 || h < 7) {
    db.prepare('UPDATE avisos_estado SET proximo = ?, detalle = ? WHERE id = ?').run(siguientes7am(), 'Programado para las 7 a. m. (de noche no se le escribe al cliente).', a.id as number);
    return;
  }

  const { chatDelPedido, plantillaAprobada, PLANTILLA_GUIA } = await import('./avisoGuia.js');
  const { puedeEscribirle, contarProactivo } = await import('./calidad.js');
  const { sendWhatsappText, sendWhatsappTemplate } = await import('./wa.js');
  const { idiomaDe, MSG_ESTADO } = await import('./idioma.js');
  const { nombreTransportadora } = await import('./transportadoras.js');

  const chat = chatDelPedido(storeId, o);
  if (!chat) return cerrar(a, 'omitido', 'No hay chat de WhatsApp de este cliente (sin chat no se le escribe en frío).');
  const permiso = puedeEscribirle(storeId, chat.tel, chat.id);
  if (!permiso.ok) return cerrar(a, 'omitido', `No se le escribe: ${permiso.motivo}.`);

  const numDF = `DF-${txt(o.numero)}`;
  const guia = txt(o.guia).trim();
  const crudoT = txt(o.transportadora).trim() && !(txt(o.transportadora) === 'Dropi' && txt(o.despacho_proveedor) !== 'dropi') ? txt(o.transportadora) : '';
  const transp = nombreTransportadora(crudoT) || '';
  const nombre = txt(o.cliente).trim().split(/\s+/)[0] || '';
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || '';
  const idi = idiomaDe(storeId, chat.id);
  const base = MSG_ESTADO[idi][estado]?.(Number(o.numero)) || `Tu pedido #${numDF}: ${estado}.`;
  const texto = textoEstado(idi, estado, { nombre, numDF, guia, transp }, base);
  const destino = chat.wa_id || chat.tel;

  // 1) Ventana abierta → mensaje del bot.
  const envio = await sendWhatsappText(storeId, destino, texto, chat.tel);
  if (envio.ok) {
    if (!envio.repetido) {
      db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado, wa_msg_id) VALUES (?,?,'bot',?,'enviado',?)").run(uid(), chat.id, texto, envio.wamid || null);
      contarProactivo(storeId, chat.tel);
    }
    if (envio.wamid) db.prepare('UPDATE avisos_estado SET wamid = ? WHERE id = ?').run(envio.wamid, a.id as number);
    return cerrar(a, 'enviado', 'Mensaje del bot al chat.');
  }
  if (!envio.bloqueadoVentana) return reintentar(a, envio.error || 'WhatsApp no envió el mensaje.');

  // 2) Ventana cerrada → plantilla aprobada, con datos reales (si falta uno, no se inventa).
  let tpl = plantillaAprobada(storeId, PLANTILLA_ESTADO);
  let params: string[] = [];
  if (tpl) params = [nombre, tienda, numDF, fraseEstado(estado, transp), guia || numDF];
  else if (estado === 'En tránsito' && guia && (tpl = plantillaAprobada(storeId, PLANTILLA_GUIA))) params = [nombre, tienda, numDF, transp || 'la transportadora', guia];
  else if (estado === 'Novedad' && (tpl = plantillaAprobada(storeId, 'novedad_envio_pedido'))) params = [nombre, tienda, numDF, transp || 'la transportadora', (txt(o.estado_woo).replace(/^novedad:?\s*/i, '') || 'novedad en la entrega').toLowerCase()];
  if (!tpl) return reintentar(a, `El cliente no escribe hace más de 24 h y la plantilla "${PLANTILLA_ESTADO}" aún no está aprobada por Meta para tu WhatsApp. Apenas se apruebe, sale sola.`);
  const falta = params.findIndex((p) => !p.trim());
  if (falta >= 0) return cerrar(a, 'fallido', `Falta el ${['nombre del cliente', 'nombre de la tienda', 'número del pedido', 'estado', 'número de guía'][falta] || 'dato'} en el pedido: no se envía la plantilla con datos inventados.`);
  const r = await sendWhatsappTemplate(storeId, destino, tpl, params, chat.tel);
  if (!r.ok) return reintentar(a, r.error || 'Meta rechazó la plantilla.');
  if (!r.repetido) {
    db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado, wa_msg_id) VALUES (?,?,'bot',?,'enviado',?)").run(uid(), chat.id, r.textoRender || `[Plantilla: ${tpl.nombre}]`, r.wamid || null);
    contarProactivo(storeId, chat.tel);
  }
  if (r.wamid) db.prepare('UPDATE avisos_estado SET wamid = ? WHERE id = ?').run(r.wamid, a.id as number);
  return cerrar(a, 'plantilla', `Plantilla "${tpl.nombre}" (el cliente no escribía hace más de 24 h).`);
}

let corriendo = false;
/** Procesa la cola (cada minuto y justo después de encolar a mano). */
export async function procesarAvisos(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    const filas = db.prepare("SELECT * FROM avisos_estado WHERE resultado = '' AND proximo <= datetime('now') ORDER BY id LIMIT 60").all() as Fila[];
    for (const a of filas) {
      try { await enviarAviso(a); } catch (e) { reintentar(a, (e as Error).message || 'error inesperado'); }
    }
    // Limpieza: lo resuelto de hace más de 90 días.
    db.prepare("DELETE FROM avisos_estado WHERE resultado != '' AND creado < datetime('now','-90 days')").run();
  } finally { corriendo = false; }
}

/** Avisos de un pedido (para el detalle del pedido). */
export function avisosDePedido(storeId: string, orderId: string) {
  return (db.prepare('SELECT estado, resultado, detalle, intentos, creado, enviado_at, proximo FROM avisos_estado WHERE store_id = ? AND order_id = ? ORDER BY id DESC LIMIT 20').all(storeId, orderId) as Fila[])
    .map((r) => ({ estado: txt(r.estado), resultado: txt(r.resultado) || 'pendiente', detalle: txt(r.detalle), intentos: Number(r.intentos) || 0, creado: txt(r.creado), enviadoAt: txt(r.enviado_at), proximo: txt(r.proximo) }));
}

export function iniciarAvisosEstado(): void {
  setTimeout(() => void procesarAvisos().catch(() => {}), 30_000).unref?.();
  setInterval(() => void procesarAvisos().catch(() => {}), 60_000).unref?.();
  // La plantilla de avisos de estado se manda a Meta en todas las tiendas con WhatsApp oficial
  // (una sola vez; las tiendas que conecten después la reciben al conectar).
  if (process.env.NODE_ENV === 'production') {
    setTimeout(() => {
      const t = db.prepare('SELECT id FROM meta_templates WHERE nombre = ?').get(PLANTILLA_ESTADO) as { id: string } | undefined;
      if (!t) return;
      const n = (db.prepare('SELECT COUNT(*) n FROM meta_template_pub WHERE template_id = ?').get(t.id) as { n: number }).n;
      if (n) return;
      void import('./metaTemplates.js').then((m) => m.publicarEnTodas(t.id)).then((r) => console.log(`[avisos] plantilla ${PLANTILLA_ESTADO} enviada a Meta: ${r.exitosas}/${r.total}`)).catch((e) => console.warn('[avisos] no se pudo publicar la plantilla', e));
    }, 3 * 60_000).unref?.();
  }
  console.log('[avisos] avisos de estado del envío al cliente: activos (cola persistente, cada minuto)');
}
