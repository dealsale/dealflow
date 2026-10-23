/**
 * Novedades de guías de Effi: problemas en la entrega que reporta la
 * transportadora (cliente ausente, dirección errada, coordinar entrega…).
 *
 *  1. Detectar: cada ciclo de despachos consultamos en Effi las novedades que
 *     "requieren solución de la empresa" y las pegamos al pedido por la guía.
 *     El pedido queda en estado Novedad con el motivo exacto.
 *  2. Avisar al cliente por WhatsApp (texto si la ventana de 24 h está abierta;
 *     si no, con la plantilla aprobada `novedad_envio_pedido`).
 *  3. El bot recoge lo que el cliente prefiere (volver a ofrecer, otra dirección
 *     o devolver) y deja la solución lista; según la config, se envía sola a Effi
 *     o el dueño la confirma con un botón.
 *  4. Seguimiento: leemos de Effi el estado de cada gestión (aprobada, pendiente,
 *     rechazada) y cuándo la novedad se cierra.
 */
import { db, registrarLog, uid, pj } from './db.js';
import { cfgEffi, effi, mensajeError, type NovedadesCfg } from './effiApi.js';
import { conPedido, trazar } from './trazabilidad.js';
import { sendWhatsappTemplate, sendWhatsappText } from './wa.js';
import { chatDelPedido, plantillaAprobada } from './avisoGuia.js';
import { idiomaDe } from './idioma.js';
import { nombreTransportadora } from './transportadoras.js';
import { FINALES } from './estadosPedido.js';

export const PLANTILLA_NOVEDAD = 'novedad_envio_pedido';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());

export type TipoSolucion = 'ofrecer' | 'redireccionar' | 'devolver';
export interface Propuesta { solucion: TipoSolucion; fecha?: string; recibe?: string; direccion?: string; telefono?: string; nota?: string; origen?: 'bot' | 'panel' }

/** Fecha de hoy en Colombia (YYYY-MM-DD) desplazada `dias`. */
export function fechaCO(dias = 0): string {
  return new Date(Date.now() - 5 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);
}

// ── 1. Detectar ─────────────────────────────────────────────────────────

interface NovedadEffi {
  id: string; empresa: string; guia_novedad: string; guia: string; est_novedad: string; estado_novedad: string; t_novedad: string;
  transportadora_efficommerce: string; nombre_transportadora_efficommerce: string; nombre_transportadora: string;
  nombre_novedad: string; aclaracion: string; cant_gestion: string; fecha_trans_transportadora: string; url_foto: string;
  guia_adicional?: string; sucursal_guia?: string; id_guia?: string; nombre_destinatario?: string;
}

/** Última revisión de novedades por tienda (para mostrar si Effi respondió con error). */
db.exec(`CREATE TABLE IF NOT EXISTS novedades_sync (store_id TEXT PRIMARY KEY, ts TEXT NOT NULL DEFAULT (datetime('now')), error TEXT NOT NULL DEFAULT '', leidas INTEGER NOT NULL DEFAULT 0)`);
for (const col of ["tipo INTEGER NOT NULL DEFAULT 2", "destinatario TEXT NOT NULL DEFAULT ''"]) { try { db.exec(`ALTER TABLE novedades ADD COLUMN ${col}`); } catch { /* ya existe */ } }
function estadoSync(storeId: string, error: string, leidas = 0): void {
  const antes = db.prepare('SELECT error FROM novedades_sync WHERE store_id = ?').get(storeId) as { error: string } | undefined;
  db.prepare("INSERT INTO novedades_sync (store_id, ts, error, leidas) VALUES (?, datetime('now'), ?, ?) ON CONFLICT(store_id) DO UPDATE SET ts = excluded.ts, error = excluded.error, leidas = excluded.leidas").run(storeId, error, leidas);
  // El error se anota en el registro solo cuando aparece (no cada 4 minutos).
  if (error && antes?.error !== error) registrarLog(storeId, 'error', 'novedad', `No pudimos leer las novedades de Effi: ${error} Revisa que el usuario de la API key tenga permiso de consulta en "Novedades de guías de transporte".`);
}
try { db.exec("ALTER TABLE novedades ADD COLUMN oculta INTEGER NOT NULL DEFAULT 0"); } catch { /* ya existe */ }

/** Oculta de la bandeja una novedad que no se va a gestionar desde DealFlow. */
export function ocultarNovedad(storeId: string, novedadId: string): boolean {
  return db.prepare('UPDATE novedades SET oculta = 1 WHERE id = ? AND store_id = ?').run(novedadId, storeId).changes > 0;
}

/** Une a mano una novedad (y su guía) con un pedido de DealFlow por su número (DF-1234). */
export function vincularNovedad(storeId: string, novedadId: string, numero: number): { ok: true; orderId: string } | { error: string } {
  const n = db.prepare('SELECT * FROM novedades WHERE id = ? AND store_id = ?').get(novedadId, storeId) as Fila | undefined;
  if (!n) return { error: 'Novedad no encontrada.' };
  const o = db.prepare('SELECT id, numero, guia, estado FROM orders WHERE store_id = ? AND numero = ?').get(storeId, numero) as Fila | undefined;
  if (!o) return { error: `No existe el pedido DF-${numero}.` };
  if (txt(o.guia) && txt(o.guia).replace(/^0+/, '') !== txt(n.guia).replace(/^0+/, '')) return { error: `El pedido DF-${numero} ya tiene otra guía (${txt(o.guia)}).` };
  db.prepare("UPDATE orders SET guia = ?, transportadora = CASE WHEN ? != '' THEN ? ELSE transportadora END, despacho_proveedor = CASE WHEN COALESCE(despacho_proveedor,'') = '' THEN 'effi' ELSE despacho_proveedor END, guia_avisada = 1 WHERE id = ?")
    .run(txt(n.guia), txt(n.transportadora), txt(n.transportadora), txt(o.id));
  db.prepare('UPDATE novedades SET order_id = ? WHERE id = ?').run(txt(o.id), novedadId);
  if (Number(n.abierta) && !FINALES.includes(txt(o.estado))) db.prepare("UPDATE orders SET estado = 'Novedad', estado_woo = ? WHERE id = ?").run(`Novedad: ${txt(n.nombre)}`.slice(0, 60), txt(o.id));
  trazar(storeId, txt(o.id), { etapa: 'vinculo', nivel: 'info', titulo: `Guía ${txt(n.guia)} y su novedad unidas a mano a este pedido` });
  return { ok: true, orderId: txt(o.id) };
}

export function estadoNovedades(storeId: string): { ts: string; error: string; leidas: number; sinPedido: NovedadPanel[] } {
  const e = db.prepare('SELECT ts, error, leidas FROM novedades_sync WHERE store_id = ?').get(storeId) as { ts: string; error: string; leidas: number } | undefined;
  const sinPedido = (db.prepare('SELECT * FROM novedades WHERE store_id = ? AND order_id IS NULL AND abierta = 1 AND oculta = 0 ORDER BY created_at').all(storeId) as Fila[]).map(aPanel);
  return { ts: e?.ts || '', error: e?.error || '', leidas: e?.leidas || 0, sinPedido };
}

/** Pedido por el id interno de la guía en Effi (guardado al crear la guía desde DealFlow). */
function pedidoDeGuiaEffi(storeId: string, sucursal: string, idGuia: string): Fila | undefined {
  if (!idGuia) return undefined;
  const cands = db.prepare("SELECT * FROM orders WHERE store_id = ? AND COALESCE(effi_guia,'') != ''").all(storeId) as Fila[];
  return cands.find((o) => { const g = pj<Fila>(txt(o.effi_guia), {}); return txt(g.id) === idGuia && (!sucursal || !txt(g.sucursal) || txt(g.sucursal) === sucursal); });
}

/** Pedido de la tienda al que pertenece la guía. */
function pedidoDeGuia(storeId: string, ...guias: string[]): Fila | undefined {
  for (const g of guias.map(txt).filter(Boolean)) {
    // Tolerante a ceros a la izquierda y espacios ("014164499260" = "14164499260").
    const o = db.prepare("SELECT * FROM orders WHERE store_id = ? AND (guia = ? OR LTRIM(REPLACE(guia,' ',''),'0') = LTRIM(?,'0')) ORDER BY created_at DESC LIMIT 1").get(storeId, g, g.replace(/\s/g, '')) as Fila | undefined;
    if (o) return o;
  }
  return undefined;
}

/** Consulta en Effi las novedades recientes de una tienda y actualiza pedidos. */
export async function sincronizarNovedades(storeId: string, forzar = false): Promise<{ abiertas: number; nuevas: number } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  const desde = fechaCO(-25); const hasta = fechaCO(1);
  // Antes: unir las guías hechas a mano en Effi con sus pedidos (para que las novedades encuentren su pedido).
  await import('./effiExtras.js').then((m) => m.unirGuiasDeEffi(storeId, forzar)).catch(() => {});
  const filas: NovedadEffi[] = [];
  // Las dos clases: 2 = requiere solución de la empresa (se resuelve desde DealFlow)
  // y 1 = operativa de la transportadora (informativa: la gestiona ella).
  for (const tipo of [2, 1]) {
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r = await effi<NovedadEffi[]>(c.apiKey, 'GET', '/api/novedad_guia_transporte', { query: { desde, hasta, t_novedad: tipo, vigente: 1, pagina, por_pagina: 100 } });
      if (!r.ok) {
        if (pagina === 1 && tipo === 2) { const e = mensajeError(r); estadoSync(storeId, e); return { error: e }; }
        break;
      }
      filas.push(...(r.body.data || []).map((x) => ({ ...x, t_novedad: x.t_novedad || String(tipo) })));
      const pg = r.body.paginacion;
      if (!pg || pagina >= pg.total_paginas) break;
    }
  }
  let nuevas = 0;
  const sel = db.prepare('SELECT * FROM novedades WHERE id = ?');
  for (const n of filas) {
    const id = `${storeId}:${txt(n.empresa)}:${txt(n.id)}`;
    const antes = sel.get(id) as Fila | undefined;
    const est = Number(n.est_novedad) || 1;
    const abierta = est === 1 || est === 2 ? 1 : 0;
    const orden = antes?.order_id ? db.prepare('SELECT * FROM orders WHERE id = ?').get(txt(antes.order_id)) as Fila | undefined
      : pedidoDeGuia(storeId, n.guia_novedad, n.guia, txt(n.guia_adicional)) || pedidoDeGuiaEffi(storeId, txt(n.sucursal_guia), txt(n.id_guia));
    const recienLigada = !!orden && (!antes || !txt(antes.order_id));
    const transp = nombreTransportadora(txt(n.nombre_transportadora_efficommerce) || txt(n.nombre_transportadora)) || txt(n.nombre_transportadora_efficommerce);
    if (!antes) {
      db.prepare(`INSERT INTO novedades (id, store_id, order_id, effi_id, empresa, guia, nombre, aclaracion, est, estado_txt, transportadora, transp_effi, fecha_reporte, url_foto, cant_gestion, abierta, tipo, destinatario)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, storeId, orden ? txt(orden.id) : null, txt(n.id), txt(n.empresa), txt(n.guia_novedad) || txt(n.guia),
        txt(n.nombre_novedad), txt(n.aclaracion), est, txt(n.estado_novedad), transp, txt(n.transportadora_efficommerce), txt(n.fecha_trans_transportadora), txt(n.url_foto), Number(n.cant_gestion) || 0, abierta,
        Number(n.t_novedad) || 2, txt(n.nombre_destinatario));
      if (abierta) nuevas++;
    } else {
      db.prepare(`UPDATE novedades SET order_id = COALESCE(order_id, ?), nombre = ?, aclaracion = ?, est = ?, estado_txt = ?, transportadora = ?, cant_gestion = ?, url_foto = ?, abierta = ?, tipo = ?, destinatario = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(orden ? txt(orden.id) : null, txt(n.nombre_novedad), txt(n.aclaracion), est, txt(n.estado_novedad), transp, Number(n.cant_gestion) || 0, txt(n.url_foto), abierta, Number(n.t_novedad) || 2, txt(n.nombre_destinatario), id);
    }
    if (!orden) continue;
    const orderId = txt(orden.id);
    const motivo = txt(n.nombre_novedad) || 'novedad en la entrega';
    if (recienLigada && abierta) {
      // Pedido en Novedad con el motivo de la transportadora.
      if (!FINALES.includes(txt(orden.estado))) db.prepare("UPDATE orders SET estado = 'Novedad', estado_woo = ? WHERE id = ?").run(`Novedad: ${motivo}`.slice(0, 60), orderId);
      trazar(storeId, orderId, { etapa: 'novedad', nivel: 'warn', titulo: `Novedad de ${transp || 'la transportadora'}: ${motivo}`, detalle: txt(n.aclaracion), datos: n });
      registrarLog(storeId, 'warn', 'novedad', `El pedido DF-${txt(orden.numero)} tiene una novedad: ${motivo}. Resuélvela en Pedidos → Novedades.`);
      void import('./correo.js').then((c) => c.correoATienda(storeId, 'novedades', `Novedad en DF-${txt(orden.numero)}: ${motivo}`.slice(0, 120), `📦 Novedad en el pedido DF-${txt(orden.numero)}`, [`<b>${c.escHtml(transp || 'La transportadora')}</b> reportó: <b>${c.escHtml(motivo)}</b>.`, ...(txt(n.aclaracion) ? [c.escHtml(txt(n.aclaracion))] : []), 'Resuélvela en DealFlow → Logística Effi para que el envío no se devuelva.'])).catch(() => {});
      // Al cliente solo le escribimos si la novedad es reciente (las viejas que se unen tarde, no).
      const reciente = !txt(n.fecha_trans_transportadora) || Date.now() - new Date(txt(n.fecha_trans_transportadora).replace(' ', 'T') + 'Z').getTime() < 2 * 86400_000;
      if (c.novedades.avisarCliente && reciente && (Number(n.t_novedad) || 2) === 2) await avisarNovedadCliente(storeId, id).catch((e) => console.warn('[novedad] aviso falló', e));
    } else if (antes && Number(antes.abierta) && !abierta) {
      trazar(storeId, orderId, { etapa: 'novedad', nivel: est === 3 ? 'ok' : 'info', titulo: `Novedad cerrada en Effi: ${txt(n.estado_novedad)}` });
    }
  }
  await sincronizarGestiones(storeId, c.apiKey, desde, hasta);
  estadoSync(storeId, '', filas.length);
  const abiertas = (db.prepare('SELECT COUNT(*) n FROM novedades WHERE store_id = ? AND abierta = 1').get(storeId) as { n: number }).n;
  return { abiertas, nuevas };
}

interface GestionEffi { id: string; empresa: string; id_gestion: string; est_gestion: string; estado_gestion: string; id_solucion: string; nombre_solucion: string; comentario_rechazar: string; transportadora_efficommerce: string; est_novedad: string; estado_novedad: string }

/** Estado de las soluciones enviadas y catálogo de soluciones por transportadora. */
async function sincronizarGestiones(storeId: string, apiKey: string, desde: string, hasta: string): Promise<void> {
  const r = await effi<GestionEffi[]>(apiKey, 'GET', '/api/gestion_novedad_guia_transporte', { query: { desde, hasta, pagina: 1, por_pagina: 100 } });
  if (!r.ok) return;
  const cat = db.prepare('INSERT OR REPLACE INTO effi_soluciones (store_id, transp_effi, id_solucion, nombre) VALUES (?,?,?,?)');
  for (const g of r.body.data || []) {
    if (txt(g.id_solucion) && txt(g.nombre_solucion)) cat.run(storeId, txt(g.transportadora_efficommerce), txt(g.id_solucion), txt(g.nombre_solucion));
    const id = `${storeId}:${txt(g.empresa)}:${txt(g.id)}`;
    const nov = db.prepare('SELECT order_id, gestion_id, gestion_est FROM novedades WHERE id = ?').get(id) as Fila | undefined;
    if (!nov) continue;
    // Solo la última gestión de la novedad (la de id_gestion mayor).
    if (txt(nov.gestion_id) && Number(g.id_gestion) < Number(nov.gestion_id)) continue;
    const est = Number(g.est_gestion) || 0;
    if (est !== Number(nov.gestion_est) && txt(nov.order_id)) {
      trazar(storeId, txt(nov.order_id), { etapa: 'novedad', nivel: est === 3 ? 'warn' : est === 2 ? 'ok' : 'info', titulo: `Solución en Effi: ${txt(g.estado_gestion)}${txt(g.comentario_rechazar) ? ` · ${txt(g.comentario_rechazar)}` : ''}` });
    }
    db.prepare("UPDATE novedades SET gestion_id = ?, gestion_est = ?, gestion_txt = ?, gestion_msg = ?, propuesta_estado = CASE WHEN propuesta_estado IN ('', 'lista', 'error') THEN 'enviada' ELSE propuesta_estado END, updated_at = datetime('now') WHERE id = ?")
      .run(txt(g.id_gestion), est, txt(g.estado_gestion), txt(g.comentario_rechazar), id);
  }
}

/** Todas las tiendas con Effi (lo llama el ciclo de despachos). */
export async function sincronizarNovedadesTodas(): Promise<void> {
  const tiendas = db.prepare("SELECT store_id FROM store_integrations WHERE tipo = 'effi_api'").all() as { store_id: string }[];
  for (const t of tiendas) {
    if (!cfgEffi(t.store_id)?.apiKey) continue;
    try { await sincronizarNovedades(t.store_id); } catch (e) { console.warn('[novedades] sync falló', t.store_id, e); }
  }
}

// ── 2. Avisar al cliente ────────────────────────────────────────────────

function textoAviso(idi: 'es' | 'en', nombre: string, numDF: string, transp: string, motivo: string, ciudad: string): string {
  if (idi === 'en') return `Hi ${nombre} 👋 ${transp || 'The carrier'} reported an issue with your order ${numDF}: *${motivo}*.\n\nSo you get it without trouble, tell us what you prefer:\n1️⃣ Deliver it again to the same address (tell us which day works for you)\n2️⃣ Deliver it to another address in ${ciudad || 'your city'}\n\nReply here and we'll sort it out right away 🙌`;
  return `Hola ${nombre} 👋 La transportadora ${transp || ''} nos reportó una novedad con tu pedido ${numDF}: *${motivo}*.\n\nPara que te llegue sin problema, cuéntanos qué prefieres:\n1️⃣ Que te lo vuelvan a llevar a la misma dirección (dinos qué día te queda bien)\n2️⃣ Que lo lleven a otra dirección en ${ciudad || 'tu ciudad'}\n\nRespóndenos por aquí y lo gestionamos de inmediato 🙌`.replace('transportadora  nos', 'transportadora nos');
}

/** Le escribe al cliente por el chat del pedido (texto o, fuera de 24 h, plantilla). */
export async function avisarNovedadCliente(storeId: string, novedadId: string): Promise<{ ok: boolean; via: string; error?: string }> {
  const nov = db.prepare('SELECT * FROM novedades WHERE id = ? AND store_id = ?').get(novedadId, storeId) as Fila | undefined;
  if (!nov?.order_id) return { ok: false, via: '', error: 'La novedad no está ligada a un pedido.' };
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(txt(nov.order_id)) as Fila | undefined;
  if (!o) return { ok: false, via: '', error: 'Pedido no encontrado.' };
  const chat = chatDelPedido(storeId, o);
  const numDF = `DF-${txt(o.numero)}`;
  const nombre = txt(o.cliente).split(' ')[0] || 'cliente';
  const motivo = (txt(nov.nombre) || 'novedad en la entrega').toLowerCase();
  const transp = txt(nov.transportadora);
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || 'nuestra tienda';
  const marcar = (via: string) => db.prepare("UPDATE novedades SET aviso = ?, propuesta_estado = CASE WHEN propuesta_estado = '' THEN 'esperando_cliente' ELSE propuesta_estado END, updated_at = datetime('now') WHERE id = ?").run(via, novedadId);
  const fin = (r: { ok: boolean; via: string; error?: string }) => {
    trazar(storeId, txt(o.id), { etapa: 'aviso', nivel: r.ok ? 'ok' : 'warn', titulo: r.ok ? `Novedad avisada al cliente (${r.via})` : `No se pudo avisar la novedad: ${r.error}` });
    return r;
  };
  if (!chat) return fin({ ok: false, via: '', error: 'No encontramos el chat del cliente.' });
  const { puedeEscribirle, contarProactivo } = await import('./calidad.js');
  const permiso = puedeEscribirle(storeId, chat.tel, chat.id);
  if (!permiso.ok) return fin({ ok: false, via: '', error: `No le escribimos: ${permiso.motivo}.` });
  const destino = chat.wa_id || chat.tel;
  const texto = textoAviso(idiomaDe(storeId, chat.id), nombre, numDF, transp, motivo, txt(o.ciudad));
  const envio = await sendWhatsappText(storeId, destino, texto, chat.tel);
  if (envio.ok) {
    db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado) VALUES (?,?,'bot',?,'enviado')").run(uid(), chat.id, texto);
    marcar('texto'); contarProactivo(storeId, chat.tel);
    return fin({ ok: true, via: 'texto' });
  }
  if (!envio.bloqueadoVentana) return fin({ ok: false, via: '', error: envio.error || 'WhatsApp no envió el mensaje.' });
  // Ventana de 24 h cerrada: solo se puede escribir con plantilla aprobada.
  const tpl = plantillaAprobada(storeId, PLANTILLA_NOVEDAD);
  if (!tpl) return fin({ ok: false, via: '', error: `El cliente no escribe hace más de 24 h y la plantilla "${PLANTILLA_NOVEDAD}" aún no está aprobada para la tienda.` });
  const r = await sendWhatsappTemplate(storeId, destino, tpl, [nombre, tienda, numDF, transp || 'la transportadora', motivo], chat.tel);
  if (!r.ok) return fin({ ok: false, via: '', error: r.error || 'Meta rechazó la plantilla.' });
  db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado) VALUES (?,?,'bot',?,'enviado')").run(uid(), chat.id, r.textoRender || `[Plantilla: ${PLANTILLA_NOVEDAD}]`);
  marcar('plantilla'); contarProactivo(storeId, chat.tel);
  return fin({ ok: true, via: 'plantilla' });
}

// ── 3. El bot y la solución ─────────────────────────────────────────────

/** Novedad abierta del pedido de este chat (la más reciente), si la hay. */
export function novedadAbiertaDelLead(storeId: string, leadId: string): Fila | undefined {
  const lead = db.prepare('SELECT tel FROM leads WHERE id = ?').get(leadId) as { tel: string } | undefined;
  const diez = String(lead?.tel || '').replace(/\D/g, '').slice(-10);
  return db.prepare(
    `SELECT n.*, o.numero, o.cliente, o.ciudad, o.direccion, o.tel AS tel_pedido FROM novedades n JOIN orders o ON o.id = n.order_id
      WHERE n.store_id = ? AND n.abierta = 1 AND n.tipo = 2 AND (o.lead_id = ? OR (? != '' AND REPLACE(REPLACE(o.tel,' ',''),'+','') LIKE ?))
      ORDER BY n.created_at DESC LIMIT 1`,
  ).get(storeId, leadId, diez, `%${diez}`) as Fila | undefined;
}

/** Instrucciones para la IA cuando el cliente tiene una novedad abierta. */
export function directivaNovedad(storeId: string, leadId: string): string {
  const c = cfgEffi(storeId);
  if (!c?.novedades.botGestiona) return '';
  const n = novedadAbiertaDelLead(storeId, leadId);
  if (!n) return '';
  const numDF = `DF-${txt(n.numero)}`;
  const pe = txt(n.propuesta_estado);
  if (pe === 'lista' || pe === 'enviada') {
    return `\n\nNOVEDAD DE ENVÍO EN GESTIÓN: el pedido ${numDF} tuvo una novedad ("${txt(n.nombre)}") y la solución ya quedó ${pe === 'enviada' ? 'enviada a la transportadora' : 'registrada; el equipo la está gestionando con la transportadora'}. Si el cliente pregunta, dile con calma que ya está en gestión y que la transportadora retomará la entrega; no vuelvas a pedirle los datos ni pongas el marcador ##NOVEDAD.`;
  }
  return `\n\nNOVEDAD DE ENVÍO (PRIORIDAD ALTA): el pedido ${numDF} de este cliente tiene una novedad reportada por la transportadora ${txt(n.transportadora)}: "${txt(n.nombre)}"${txt(n.aclaracion) ? ` (${txt(n.aclaracion)})` : ''}. Dirección actual: ${txt(n.direccion)}, ${txt(n.ciudad)}. Tu objetivo ahora es que reciba su pedido:
- Opciones: (a) VOLVER A OFRECER en la misma dirección otro día; (b) REDIRECCIONAR a otra dirección DENTRO DE ${txt(n.ciudad) || 'la misma ciudad'} (no se puede cambiar de ciudad); (c) DEVOLVER, solo si el cliente ya no quiere el pedido (antes intenta con amabilidad salvar la entrega).
- Para (a) y (b) necesitas: la fecha de entrega (entre ${fechaCO(1)} y ${fechaCO(5)}; hoy es ${fechaCO(0)}), el nombre de quien recibe, la dirección completa (en (a) es la actual) y un celular de contacto. Pregunta solo lo que falte; si dice "mañana" o un día de la semana, conviértelo tú a la fecha exacta.
- Cuando tengas todo y el cliente lo confirme, agrega al final, en una línea sola, este marcador (el cliente no lo ve):
##NOVEDAD solucion="ofrecer"; fecha="YYYY-MM-DD"; recibe="Nombre"; direccion="Dirección"; telefono="3001234567"##
  (solucion es ofrecer, redireccionar o devolver; para devolver no pongas fecha ni dirección).
- En ese mismo mensaje dile que ya quedó registrado y que la transportadora retomará la entrega. No prometas horas exactas.`;
}

/** Lee el marcador ##NOVEDAD que puso la IA. */
export function leerMarcadorNovedad(bruto: string): Propuesta | null {
  const m = bruto.match(/##\s*NOVEDAD\b([^\n]*)/i);
  if (!m) return null;
  const campos: Record<string, string> = {};
  for (const x of m[1].matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) campos[x[1].toLowerCase()] = x[2].trim();
  const s = (campos.solucion || '').toLowerCase();
  const solucion: TipoSolucion = /devol/.test(s) ? 'devolver' : /redirec|otra/.test(s) ? 'redireccionar' : 'ofrecer';
  return { solucion, fecha: campos.fecha, recibe: campos.recibe, direccion: campos.direccion, telefono: campos.telefono, origen: 'bot' };
}
export const quitarMarcadorNovedad = (t: string) => t.replace(/[^\n]*##\s*NOVEDAD\b[^\n]*/gi, '');

/** Valida la propuesta (lo mismo que exige Effi). Devuelve el error o ''. */
export function validarPropuesta(p: Propuesta): string {
  if (p.solucion === 'devolver') return '';
  if (!p.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) return 'Falta la fecha de la nueva entrega.';
  if (p.fecha < fechaCO(1) || p.fecha > fechaCO(5)) return `La fecha debe estar entre ${fechaCO(1)} y ${fechaCO(5)} (de 1 a 5 días desde hoy).`;
  if (!txt(p.recibe)) return 'Falta el nombre de quien recibe.';
  if (!txt(p.direccion)) return 'Falta la dirección de entrega.';
  const tel = String(p.telefono || '').replace(/[^\d ]/g, '').trim();
  if (tel.length < 7) return 'Falta un teléfono de contacto válido.';
  return '';
}

/** El bot acordó la solución con el cliente: se guarda y, si está configurado, se envía. */
export async function registrarPropuestaBot(storeId: string, leadId: string, p: Propuesta): Promise<void> {
  const n = novedadAbiertaDelLead(storeId, leadId);
  if (!n) return;
  // Volver a ofrecer = la dirección actual del pedido si el bot no la puso.
  if (p.solucion === 'ofrecer' && !txt(p.direccion)) p.direccion = txt(n.direccion);
  if (!txt(p.telefono)) p.telefono = String(n.tel_pedido || '').replace(/\D/g, '').slice(-10);
  if (!txt(p.recibe)) p.recibe = txt(n.cliente);
  const err = validarPropuesta(p);
  db.prepare("UPDATE novedades SET propuesta = ?, propuesta_estado = ?, gestion_msg = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(p), err ? 'error' : 'lista', err, txt(n.id));
  trazar(storeId, txt(n.order_id), { etapa: 'novedad', nivel: err ? 'warn' : 'info', titulo: `El cliente eligió: ${NOMBRE_SOLUCION[p.solucion]}${p.fecha ? ` el ${p.fecha}` : ''}`, detalle: err || [p.recibe, p.direccion, p.telefono].filter(Boolean).join(' · '), datos: p });
  const c = cfgEffi(storeId);
  if (!err && c?.novedades.autoEnviar) {
    const r = await enviarSolucion(storeId, txt(n.id), p);
    if ('error' in r) registrarLog(storeId, 'warn', 'novedad', `No se pudo enviar a Effi la solución de DF-${txt(n.numero)}: ${r.error}`, leadId);
  } else {
    registrarLog(storeId, 'warn', 'novedad', err
      ? `El cliente respondió la novedad de DF-${txt(n.numero)}, pero falta un dato: ${err} Complétalo en el pedido.`
      : `El cliente respondió la novedad de DF-${txt(n.numero)} (${NOMBRE_SOLUCION[p.solucion]}). Revísala y envíala a Effi desde el pedido.`, leadId);
  }
}

export const NOMBRE_SOLUCION: Record<TipoSolucion, string> = { ofrecer: 'Volver a ofrecer', redireccionar: 'Redireccionar en la misma ciudad', devolver: 'Devolver al remitente' };
const RE_SOLUCION: Record<TipoSolucion, RegExp> = { ofrecer: /ofrec|reintent|nueva entrega/i, redireccionar: /redirec|otra direc|cambio de direc/i, devolver: /devol|remitente/i };
const ID_POR_DEFECTO: Record<TipoSolucion, string> = { ofrecer: '1', redireccionar: '2', devolver: '3' };

/** Id de la solución en el catálogo de la transportadora (aprendido) o el habitual. */
function idSolucion(storeId: string, transpEffi: string, tipo: TipoSolucion): string {
  const cat = db.prepare('SELECT id_solucion, nombre FROM effi_soluciones WHERE store_id = ? AND transp_effi = ?').all(storeId, transpEffi) as { id_solucion: string; nombre: string }[];
  return cat.find((x) => RE_SOLUCION[tipo].test(x.nombre))?.id_solucion || ID_POR_DEFECTO[tipo];
}

/** Envía la solución a Effi (crea la gestión). Evita duplicar si ya hay una pendiente. */
export async function enviarSolucion(storeId: string, novedadId: string, p: Propuesta): Promise<{ ok: true; estado: string } | { error: string }> {
  const n = db.prepare('SELECT * FROM novedades WHERE id = ? AND store_id = ?').get(novedadId, storeId) as Fila | undefined;
  if (!n) return { error: 'Novedad no encontrada.' };
  if (!Number(n.abierta)) return { error: 'Esta novedad ya está cerrada en Effi.' };
  if (Number(n.tipo) === 1) return { error: 'Es una novedad operativa: la gestiona la transportadora, no necesita solución tuya.' };
  if (Number(n.est) === 2 && [1, 2, 4].includes(Number(n.gestion_est))) return { error: 'Ya hay una solución enviada esperando respuesta de la transportadora.' };
  const err = validarPropuesta(p);
  if (err) return { error: err };
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  const orderId = txt(n.order_id);
  return conPedido(storeId, orderId, async () => {
    const body: Record<string, unknown> = {
      id_novedad: Number(n.effi_id),
      gestion: (p.nota || `${NOMBRE_SOLUCION[p.solucion]} · acordado con el cliente por WhatsApp (DealFlow)`).slice(0, 1024),
      id_solucion: Number(idSolucion(storeId, txt(n.transp_effi), p.solucion)),
    };
    if (txt(n.empresa)) body.empresa_novedad = Number(n.empresa);
    if (p.solucion !== 'devolver') {
      body.fecha_nueva_entrega = p.fecha;
      body.destinatario = txt(p.recibe).slice(0, 50);
      body.direccion = txt(p.direccion).slice(0, 100);
      body.telefonos = String(p.telefono || '').slice(0, 40);
    }
    const r = await effi<Fila>(c.apiKey, 'POST', '/api/gestion_novedad_guia_transporte', { body });
    if (!r.ok || !r.body.data) {
      const msg = mensajeError(r);
      db.prepare("UPDATE novedades SET propuesta = ?, propuesta_estado = 'error', gestion_msg = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(p), msg, novedadId);
      trazar(storeId, orderId, { etapa: 'novedad', nivel: 'error', titulo: `Effi no aceptó la solución: ${msg}` });
      return { error: msg };
    }
    const d = r.body.data;
    db.prepare("UPDATE novedades SET propuesta = ?, propuesta_estado = 'enviada', gestion_id = ?, gestion_est = ?, gestion_txt = ?, gestion_msg = '', est = COALESCE(?, est), estado_txt = CASE WHEN ? = 2 THEN 'Pendiente de aprobación de solución' WHEN ? = 3 THEN 'Solucionada' ELSE estado_txt END, cant_gestion = cant_gestion + 1, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(p), txt(d.id), Number(d.est_gestion) || 1, txt(d.estado_gestion), Number(d.est_novedad) || null, Number(d.est_novedad) || 0, Number(d.est_novedad) || 0, novedadId);
    trazar(storeId, orderId, { etapa: 'novedad', nivel: 'ok', titulo: `Solución enviada a Effi: ${NOMBRE_SOLUCION[p.solucion]}${p.fecha ? ` el ${p.fecha}` : ''} · ${txt(d.estado_gestion)}`, datos: d });
    return { ok: true as const, estado: txt(d.estado_gestion) };
  });
}

// ── Para el panel ───────────────────────────────────────────────────────

export interface NovedadPanel {
  id: string; orderId: string; nombre: string; aclaracion: string; estado: string; est: number; abierta: boolean; transportadora: string;
  fechaReporte: string; foto: string; aviso: string; propuesta: Propuesta | null; propuestaEstado: string;
  gestionTxt: string; gestionEst: number; gestionMsg: string; cantGestion: number; dias: number;
  /** 2 = requiere solución de la empresa; 1 = operativa de la transportadora (informativa). */
  tipo: number; guia: string; destinatario: string;
}
export function aPanel(n: Fila): NovedadPanel {
  const f = txt(n.fecha_reporte) || txt(n.created_at);
  return {
    id: txt(n.id), orderId: txt(n.order_id), nombre: txt(n.nombre), aclaracion: txt(n.aclaracion), estado: txt(n.estado_txt), est: Number(n.est) || 0,
    abierta: !!Number(n.abierta), transportadora: txt(n.transportadora), fechaReporte: f, foto: txt(n.url_foto), aviso: txt(n.aviso),
    propuesta: pj<Propuesta | null>(txt(n.propuesta), null), propuestaEstado: txt(n.propuesta_estado),
    gestionTxt: txt(n.gestion_txt), gestionEst: Number(n.gestion_est) || 0, gestionMsg: txt(n.gestion_msg), cantGestion: Number(n.cant_gestion) || 0,
    tipo: Number(n.tipo) || 2, guia: txt(n.guia), destinatario: txt(n.destinatario),
    dias: f ? Math.max(0, Math.floor((Date.now() - new Date(f.replace(' ', 'T') + 'Z').getTime()) / 86400_000)) : 0,
  };
}
/** Última novedad de cada pedido (abiertas primero) para la lista de pedidos. */
export function novedadesPorPedido(storeId: string): Map<string, NovedadPanel> {
  const m = new Map<string, NovedadPanel>();
  const filas = db.prepare("SELECT * FROM novedades WHERE store_id = ? AND order_id IS NOT NULL AND (abierta = 1 OR updated_at > datetime('now','-15 days')) ORDER BY abierta ASC, created_at ASC").all(storeId) as Fila[];
  for (const f of filas) m.set(txt(f.order_id), aPanel(f)); // la última escrita gana (abiertas al final)
  return m;
}
export type { NovedadesCfg };
