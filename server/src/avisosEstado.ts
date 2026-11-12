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
 *  - Seguimiento: al día siguiente y a los dos días del pedido se le cuenta al cliente cómo va
 *    (aunque el estado no haya cambiado), con las mismas reglas de cuidado del número.
 *  - Pedidos sin chat (landing, Shopify…): se le escribe con la plantilla al celular del pedido.
 */
import { db, registrarLog, uid } from './db.js';
import { trazar } from './trazabilidad.js';
import { fraseEstadoPlantilla, textoEstadoChat } from './mensajesEstado.js';

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
      titulo: txt(a.origen).startsWith('seguimiento')
        ? (ok ? `Seguimiento ${txt(a.origen) === 'seguimiento-2' ? 'de los 2 días' : 'del día siguiente'} enviado al cliente (${resultado === 'plantilla' ? 'con plantilla' : 'por el chat'})` : resultado === 'fallido' ? 'No se pudo enviar el seguimiento al cliente' : 'Seguimiento no enviado')
        : ok ? `Aviso "${txt(a.estado)}" enviado al cliente (${resultado === 'plantilla' ? 'con plantilla' : 'por el chat'})` : resultado === 'fallido' ? `No se pudo avisar "${txt(a.estado)}" al cliente` : `Aviso "${txt(a.estado)}" no enviado`,
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
  const storeId = txt(a.store_id);
  const seguimiento = txt(a.origen).startsWith('seguimiento');
  let o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(txt(a.order_id), storeId) as Fila | undefined;
  if (!o) return cerrar(a, 'omitido', 'El pedido ya no existe.');
  // Seguimiento: primero se pregunta a la transportadora dónde va DE VERDAD el pedido. Si no,
  // con un estado viejo («Guía generada») se le decía «está empacado en nuestra bodega» a un
  // cliente cuyo pedido ya iba en reparto, y no lo esperaba ese día.
  if (seguimiento && txt(o.guia)) {
    const antes = txt(o.estado);
    try {
      if (txt(o.despacho_proveedor) === 'effi') { const { rastrearGuia } = await import('./effiExtras.js'); await rastrearGuia(storeId, txt(o.id), 30); }
      else if (txt(o.dropi_order_id)) { const { sincronizarPedidoDropi } = await import('./despachos.js'); await sincronizarPedidoDropi(storeId, txt(o.id)); }
    } catch { /* se sigue con lo que hay */ }
    o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(txt(a.order_id), storeId) as Fila | undefined;
    if (!o) return cerrar(a, 'omitido', 'El pedido ya no existe.');
    if (txt(o.estado) !== antes) return cerrar(a, 'omitido', `El envío avanzó a "${txt(o.estado)}": se le avisa ese cambio en vez del seguimiento.`);
  }
  // El seguimiento cuenta el estado de HOY; los avisos de cambio, el estado que cambió.
  const estado = seguimiento ? txt(o.estado) : txt(a.estado);
  if (seguimiento) {
    if (!ESTADOS_SEGUIMIENTO.includes(estado)) return cerrar(a, 'omitido', `El pedido ya está en "${estado}": no necesita seguimiento.`);
    if (txt(o.confirmacion) === 'no') return cerrar(a, 'omitido', 'El cliente dijo que No al resumen del pedido.');
    // Si ya se le escribió del pedido hace poco (otro aviso, la guía…), no se repite.
    const reciente = db.prepare("SELECT 1 FROM avisos_estado WHERE order_id = ? AND id != ? AND resultado IN ('enviado','plantilla') AND enviado_at > datetime('now','-12 hours')").get(txt(o.id), a.id as number);
    if (reciente) return cerrar(a, 'omitido', 'Ya se le escribió de este pedido en las últimas 12 horas.');
    const av = (() => { try { return JSON.parse(txt(o.guia_aviso) || '{}') as { ok?: boolean; at?: string }; } catch { return {}; } })();
    if (av.ok && av.at && Date.now() - new Date(av.at).getTime() < 12 * 3600_000) return cerrar(a, 'omitido', 'Hace menos de 12 horas le llegó el mensaje con la guía.');
    db.prepare('UPDATE avisos_estado SET estado = ? WHERE id = ?').run(estado, a.id as number);
    a.estado = estado;
  } else if (txt(o.estado) !== estado) {
    // El estado cambió antes de enviar (p. ej. pasó de "En reparto" a "Entregado"): se avisa el último.
    return cerrar(a, 'omitido', `El pedido ya está en "${txt(o.estado)}"; se avisa ese estado.`);
  }
  const creado = new Date(txt(o.created_at).replace(' ', 'T') + 'Z').getTime();
  if (creado && Date.now() - creado > 60 * 86400_000) return cerrar(a, 'omitido', 'Pedido de hace más de 60 días.');
  // El mismo estado ya se avisó hace poco (la transportadora a veces lo repite).
  const ya = !seguimiento && db.prepare("SELECT 1 FROM avisos_estado WHERE order_id = ? AND estado = ? AND id != ? AND resultado IN ('enviado','plantilla') AND enviado_at > datetime('now','-12 hours')").get(txt(o.id), estado, a.id as number);
  if (ya) return cerrar(a, 'omitido', 'Este estado ya se le avisó en las últimas 12 horas.');
  // "En tránsito" justo después del mensaje con la guía sobra: ese mensaje ya dice que va en camino.
  if (estado === 'En tránsito' && !seguimiento) {
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
  const { puedeEscribirle, contarProactivo, frenoActivo, MOTIVO_FRENO } = await import('./calidad.js');
  // El seguimiento D+1/D+2 es opcional: si Meta bajó la calidad, no sale (los avisos de cambio de estado sí).
  if (seguimiento && frenoActivo(storeId)) return cerrar(a, 'omitido', `Seguimiento ${MOTIVO_FRENO}.`);
  const { sendWhatsappText, sendWhatsappTemplate } = await import('./wa.js');
  const { idiomaDe } = await import('./idioma.js');
  const { nombreTransportadora } = await import('./transportadoras.js');

  const chat = chatDelPedido(storeId, o);
  // Sin chat (pedido de la landing, Shopify…): se le escribe con plantilla al celular del pedido.
  const celular = diez(txt(o.tel));
  if (!chat && celular.length !== 10) return cerrar(a, 'omitido', 'El pedido no tiene chat ni un celular válido de 10 dígitos.');
  const permiso = puedeEscribirle(storeId, chat ? chat.tel : celular, chat ? chat.id : null);
  if (!permiso.ok) return cerrar(a, 'omitido', `No se le escribe: ${permiso.motivo}.`);

  const numDF = `DF-${txt(o.numero)}`;
  const guia = txt(o.guia).trim();
  const crudoT = txt(o.transportadora).trim() && !(txt(o.transportadora) === 'Dropi' && txt(o.despacho_proveedor) !== 'dropi') ? txt(o.transportadora) : '';
  const transp = nombreTransportadora(crudoT) || '';
  const nombre = txt(o.cliente).trim().split(/\s+/)[0] || '';
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || '';
  const idi = idiomaDe(storeId, chat?.id);
  // Textos simples: dónde está el pedido y qué sigue (ver mensajesEstado.ts).
  const pagado = /\bPagado\b/.test(txt(o.nota));
  const datosE = {
    nombre, numDF, guia, transp, pagado,
    total: Number(o.total) > 0 ? '$' + Number(o.total).toLocaleString('es-CO') : '',
    motivo: estado === 'Novedad' ? txt(o.estado_woo).replace(/^novedad:?\s*/i, '').trim().toLowerCase().slice(0, 80) : '',
  };
  const texto = textoEstadoChat(idi, estado, datosE, seguimiento);
  const telDestino = chat ? chat.tel : '57' + celular;
  const destino = chat ? (chat.wa_id || chat.tel) : telDestino;

  // 1) Ventana abierta → mensaje del bot (solo si hay chat: sin chat no hay ventana).
  if (chat) {
    const envio = await sendWhatsappText(storeId, destino, texto, chat.tel);
    if (envio.ok) {
      if (!envio.repetido) {
        db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado, wa_msg_id) VALUES (?,?,'bot',?,'enviado',?)").run(uid(), chat.id, texto, envio.wamid || null);
        contarProactivo(storeId, chat.tel, seguimiento ? 'seguimiento_pedido' : 'estado');
      }
      if (envio.wamid) db.prepare('UPDATE avisos_estado SET wamid = ? WHERE id = ?').run(envio.wamid, a.id as number);
      return cerrar(a, 'enviado', seguimiento ? `Seguimiento por el chat (pedido en "${estado}").` : 'Mensaje del bot al chat.');
    }
    if (!envio.bloqueadoVentana) return reintentar(a, envio.error || 'WhatsApp no envió el mensaje.');
  }

  // 2) Ventana cerrada (o sin chat) → plantilla aprobada, con datos reales (si falta uno, no se inventa).
  let tpl = plantillaAprobada(storeId, PLANTILLA_ESTADO);
  let params: string[] = [];
  if (tpl) params = [nombre, tienda, numDF, fraseEstadoPlantilla('es', estado, datosE), guia || (estado === 'Confirmado' ? 'te la mandamos cuando la tengamos' : numDF)];
  else if (estado === 'En tránsito' && guia && (tpl = plantillaAprobada(storeId, PLANTILLA_GUIA))) params = [nombre, tienda, numDF, transp || 'la transportadora', guia];
  else if (estado === 'Novedad' && (tpl = plantillaAprobada(storeId, 'novedad_envio_pedido'))) params = [nombre, tienda, numDF, transp || 'la transportadora', (txt(o.estado_woo).replace(/^novedad:?\s*/i, '') || 'novedad en la entrega').toLowerCase()];
  if (!tpl) return reintentar(a, `${chat ? 'El cliente no escribe hace más de 24 h' : 'El pedido no tiene chat'} y la plantilla "${PLANTILLA_ESTADO}" aún no está aprobada por Meta para tu WhatsApp. Apenas se apruebe, sale sola.`);
  const falta = params.findIndex((p) => !p.trim());
  if (falta >= 0) return cerrar(a, 'fallido', `Falta el ${['nombre del cliente', 'nombre de la tienda', 'número del pedido', 'estado', 'número de guía'][falta] || 'dato'} en el pedido: no se envía la plantilla con datos inventados.`);
  const r = await sendWhatsappTemplate(storeId, destino, tpl, params, telDestino);
  if (!r.ok) return reintentar(a, r.error || 'Meta rechazó la plantilla.');
  if (!r.repetido) {
    if (chat) db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado, wa_msg_id) VALUES (?,?,'bot',?,'enviado',?)").run(uid(), chat.id, r.textoRender || `[Plantilla: ${tpl.nombre}]`, r.wamid || null);
    contarProactivo(storeId, telDestino, seguimiento ? 'seguimiento_pedido' : 'estado');
  }
  if (r.wamid) db.prepare('UPDATE avisos_estado SET wamid = ? WHERE id = ?').run(r.wamid, a.id as number);
  const porque = chat ? 'el cliente no escribía hace más de 24 h' : `al celular del pedido ${celular}: no tiene chat`;
  return cerrar(a, 'plantilla', `${seguimiento ? `Seguimiento (pedido en "${estado}") con plantilla` : `Plantilla "${tpl.nombre}"`} (${porque}).`);
}

const diez = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d; };

/** Estados en los que vale la pena contarle al cliente cómo va su pedido. */
export const ESTADOS_SEGUIMIENTO = ['Confirmado', 'Guía generada', 'En tránsito', 'En reparto', 'Novedad'];

/**
 * Seguimiento del pedido: a las 24 h (D+1) y a las 48 h (D+2) de creado, se encola un aviso
 * con el estado del día. Solo pedidos confirmados y en camino (no Nuevo, Entregado,
 * Devuelto ni Cancelado) de tiendas con WhatsApp conectado. Si el pedido ya pasó las 48 h
 * sin el primero (p. ej. tras un despliegue), solo sale el de D+2: nunca dos el mismo día.
 */
export function programarSeguimientos(): number {
  const filas = db.prepare(
    `SELECT o.id, o.store_id, o.estado, (julianday('now') - julianday(o.created_at)) * 24 horas FROM orders o
      JOIN whatsapp w ON w.store_id = o.store_id AND w.conectado = 1
     WHERE o.created_at <= datetime('now','-24 hours') AND o.created_at >= datetime('now','-72 hours')
       AND o.estado IN (${ESTADOS_SEGUIMIENTO.map(() => '?').join(',')}) AND COALESCE(o.confirmacion,'') != 'no'`,
  ).all(...ESTADOS_SEGUIMIENTO) as { id: string; store_id: string; estado: string; horas: number }[];
  const yaTiene = db.prepare('SELECT 1 FROM avisos_estado WHERE order_id = ? AND origen = ?');
  const insertar = db.prepare('INSERT INTO avisos_estado (store_id, order_id, estado, origen) VALUES (?,?,?,?)');
  let n = 0;
  for (const f of filas) {
    const origen = f.horas >= 48 ? 'seguimiento-2' : 'seguimiento-1';
    if (yaTiene.get(f.id, origen)) continue;
    insertar.run(f.store_id, f.id, f.estado, origen); n++;
  }
  return n;
}

/** Motivo legible y agrupable (sin "Reintento N:" ni números de pedido o celular). */
function motivoCorto(detalle: string): string {
  return detalle.replace(/^Reintento \d+:\s*/i, '').replace(/DF-\d+/g, 'DF-…').replace(/\b\d{7,}\b/g, '…').replace(/"(En tránsito|En reparto|Entregado|Novedad|Confirmado|Guía generada|Cancelado|Devuelto)"/g, '"…"').slice(0, 160);
}

/** Omisiones que son la regla funcionando (no un problema): ya se avisó algo más nuevo o reciente. */
const OMISION_NORMAL = /ya está en|ya se le avisó|ya se le escribió|le llegó el mensaje con la guía|módulo de Novedades|no necesita seguimiento|dijo que No|más de 60 días|ya no existe/i;

/** Resumen de los avisos al cliente para el admin: por tienda y motivos de lo que no salió. */
export function resumenAvisos(dias: number, storeId: string, verOcultas: boolean) {
  const filas = db.prepare(
    `SELECT a.store_id, s.nombre tienda, a.resultado, a.detalle, a.origen FROM avisos_estado a JOIN stores s ON s.id = a.store_id
      WHERE a.creado >= datetime('now', ?)${storeId ? ' AND a.store_id = ?' : ''}${verOcultas ? '' : ' AND COALESCE(s.oculta,0) = 0'}`,
  ).all(`-${dias} days`, ...(storeId ? [storeId] : [])) as { store_id: string; tienda: string; resultado: string; detalle: string; origen: string }[];
  const plantilla = db.prepare(
    `SELECT p.estado FROM meta_template_pub p JOIN meta_templates t ON t.id = p.template_id WHERE p.store_id = ? AND t.nombre = ?`,
  );
  const tiendas = new Map<string, { storeId: string; tienda: string; total: number; enviados: number; seguimientos: number; omitidos: number; normales: number; fallidos: number; pendientes: number; plantilla: string }>();
  const motivos = new Map<string, { motivo: string; n: number; tiendas: Set<string> }>();
  for (const f of filas) {
    let t = tiendas.get(f.store_id);
    if (!t) {
      const pl = plantilla.get(f.store_id, PLANTILLA_ESTADO) as { estado: string } | undefined;
      t = { storeId: f.store_id, tienda: f.tienda, total: 0, enviados: 0, seguimientos: 0, omitidos: 0, normales: 0, fallidos: 0, pendientes: 0, plantilla: pl?.estado || 'sin publicar' };
      tiendas.set(f.store_id, t);
    }
    t.total++;
    const ok = f.resultado === 'enviado' || f.resultado === 'plantilla';
    if (ok) { t.enviados++; if (f.origen.startsWith('seguimiento')) t.seguimientos++; }
    else if (f.resultado === 'omitido' && OMISION_NORMAL.test(f.detalle)) { t.normales++; continue; }
    else if (f.resultado === 'omitido') t.omitidos++;
    else if (f.resultado === 'fallido') t.fallidos++;
    else t.pendientes++;
    if (!ok && f.detalle) {
      const m = motivoCorto(f.detalle);
      const x = motivos.get(m) || { motivo: m, n: 0, tiendas: new Set<string>() };
      x.n++; x.tiendas.add(f.tienda); motivos.set(m, x);
    }
  }
  return {
    dias,
    tiendas: [...tiendas.values()].sort((a, b) => (b.omitidos + b.fallidos + b.pendientes) - (a.omitidos + a.fallidos + a.pendientes) || b.total - a.total),
    motivos: [...motivos.values()].sort((a, b) => b.n - a.n).slice(0, 12).map((m) => ({ motivo: m.motivo, n: m.n, tiendas: [...m.tiendas].slice(0, 6), totalTiendas: m.tiendas.size })),
  };
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
  const procesar = () => void import('./rendimiento.js').then((m) => m.trabajo('avisos.estado', procesarAvisos));
  setTimeout(procesar, 30_000).unref?.();
  setInterval(procesar, 60_000).unref?.();
  // Seguimiento D+1 / D+2: se revisa cada 10 minutos (la cola lo envía en el siguiente ciclo).
  const seguir = () => void import('./rendimiento.js').then((m) => m.trabajo('avisos.seguimiento', () => { const n = programarSeguimientos(); if (n) console.log(`[avisos] seguimiento de pedidos encolado: ${n}`); }));
  setTimeout(seguir, 45_000).unref?.();
  setInterval(seguir, 10 * 60_000).unref?.();
  // La plantilla de avisos de estado se manda a Meta en todas las tiendas con WhatsApp oficial
  // (una sola vez; las tiendas que conecten después la reciben al conectar).
  if (process.env.NODE_ENV === 'production') {
    setTimeout(async () => {
      // También la guía con foto (guia_envio_imagen): sin ella, a quien no escribe hace 24 h le llega solo el texto.
      for (const nombre of [PLANTILLA_ESTADO, 'guia_envio_imagen', 'confirmacion_pedido_v2', 'guia_pedido_v2', 'guia_pedido_imagen_v2', 'novedad_pedido_v2']) {
        const t = db.prepare('SELECT id FROM meta_templates WHERE nombre = ?').get(nombre) as { id: string } | undefined;
        if (!t) continue;
        const n = (db.prepare("SELECT COUNT(*) n FROM meta_template_pub WHERE template_id = ? AND estado != 'error'").get(t.id) as { n: number }).n;
        if (n) continue;
        try {
          const m = await import('./metaTemplates.js');
          const r = await m.publicarEnTodas(t.id);
          console.log(`[avisos] plantilla ${nombre} enviada a Meta: ${r.exitosas}/${r.total}${r.errores ? ` (${r.errores} con error)` : ''}`);
        } catch (e) { console.warn(`[avisos] no se pudo publicar la plantilla ${nombre}`, e); }
      }
    }, 3 * 60_000).unref?.();
  }
  console.log('[avisos] avisos de estado del envío al cliente: activos (cola persistente, cada minuto) · seguimiento D+1 y D+2');
}
