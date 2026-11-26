/**
 * Agente de cambios de pedido: que un cliente que YA tiene un pedido en marcha no termine con
 * un pedido duplicado cuando pide un cambio.
 *
 * Si el cliente tiene un pedido «protegido» (con guía, remisión u orden de Dropi, ya despachado,
 * o que viene de Shopify / creado a mano) y el asistente intenta registrar otro distinto:
 *   1. No se crea. Se le recuerda su pedido (y su guía) y se le pregunta si quiere un pedido
 *      NUEVO aparte o MODIFICAR el que tiene.
 *   2. «Nuevo» → el asistente arma el pedido nuevo normal (resumen y confirmación).
 *   3. «Modificar» →
 *      - ya despachado (va en camino, en reparto, entregado…) → no se puede modificar;
 *      - guía generada hace más de 24 h → no se puede modificar;
 *      - guía de menos de 24 h (o sin guía todavía) → se le avisa a la TIENDA para que anule la
 *        guía en Effi y lo corrija; el pedido queda marcado con el cambio que pidió el cliente.
 */
import { db, pj, registrarLog } from './db.js';
import { trazar } from './trazabilidad.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Cuándo se generó la guía (lo llena la base sola, venga de Effi, Dropi o a mano).
try { db.exec("ALTER TABLE orders ADD COLUMN guia_at TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
try { db.exec("ALTER TABLE orders ADD COLUMN cambio_cliente TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
try { db.exec("ALTER TABLE leads ADD COLUMN cambio_pedido TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
try { db.exec('ALTER TABLE orders ADD COLUMN repetido_ok INTEGER NOT NULL DEFAULT 0'); } catch { /* ya existe */ }
db.exec(`CREATE TRIGGER IF NOT EXISTS orders_guia_at AFTER UPDATE OF guia ON orders
  WHEN COALESCE(OLD.guia,'') = '' AND COALESCE(NEW.guia,'') != '' AND COALESCE(NEW.guia_at,'') = ''
  BEGIN UPDATE orders SET guia_at = datetime('now') WHERE id = NEW.id; END`);

const ESTADOS_DESPACHADO = ['En tránsito', 'En reparto', 'En oficina', 'Entregado', 'Novedad', 'Devuelto'];
const d10 = (t: unknown) => txt(t).replace(/\D/g, '').slice(-10);

/** Pedido reciente del cliente que el asistente NO debe tocar ni duplicar solo. */
export function pedidoProtegido(storeId: string, leadId: string, tels: string[]): Fila | undefined {
  const t = tels.filter((x) => x.length === 10);
  return db.prepare(
    `SELECT * FROM orders WHERE store_id = ? AND estado NOT IN ('Cancelado','Entregado','Devuelto')
       AND created_at > datetime('now','-10 days')
       AND (COALESCE(origen,'') IN ('shopify','manual') OR COALESCE(guia,'') != '' OR COALESCE(effi_remision,'') != '' OR COALESCE(dropi_order_id,'') != ''
            OR COALESCE(woo_id,'') != '' OR estado NOT IN ('Nuevo','Confirmado'))
       AND (lead_id = ? ${t.map(() => "OR substr(REPLACE(REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-',''),'(',''), -10) = ?").join(' ')})
     ORDER BY created_at DESC LIMIT 1`,
  ).get(storeId, leadId, ...t) as Fila | undefined;
}

interface Estado { orderId: string; numero: string; marcador: string; at: number; decision?: 'nuevo'; decisionAt?: number }
const leer = (leadId: string): Estado | null => {
  const r = db.prepare('SELECT cambio_pedido FROM leads WHERE id = ?').get(leadId) as { cambio_pedido: string } | undefined;
  const e = pj<Estado | null>(txt(r?.cambio_pedido), null);
  return e && Date.now() - (e.at || 0) < 48 * 3600e3 ? e : null;
};
const guardar = (leadId: string, e: Estado | null) => db.prepare('UPDATE leads SET cambio_pedido = ? WHERE id = ?').run(e ? JSON.stringify(e) : '', leadId);

/** El cliente ya dijo «pedido nuevo» (en las últimas 2 h): se deja crear el pedido adicional. */
export function permiteNuevo(leadId: string): boolean {
  const e = leer(leadId);
  return !!e && e.decision === 'nuevo' && Date.now() - (e.decisionAt || 0) < 2 * 3600e3;
}
export function usarPermisoNuevo(leadId: string) { guardar(leadId, null); }

const itemsDe = (orderId: string) => (db.prepare('SELECT qty, nombre FROM order_items WHERE order_id = ?').all(orderId) as { qty: number; nombre: string }[]);
const resumenItems = (its: { qty: number; nombre: string }[]) => its.map((i) => `${i.qty}× ${i.nombre}`).join(', ');

/** Mensaje al cliente: le recuerda su pedido y le pregunta si es nuevo o modificar. */
export function preguntaNuevoOModificar(storeId: string, leadId: string, o: Fila, marcador: string): string {
  guardar(leadId, { orderId: txt(o.id), numero: txt(o.numero), marcador, at: Date.now() });
  const guia = txt(o.guia);
  const transp = txt(o.transportadora);
  const nombre = txt(o.cliente).split(' ')[0];
  trazar(storeId, txt(o.id), { etapa: 'pedido', nivel: 'warn', titulo: 'El cliente pidió otra cosa: se le preguntó si es un pedido nuevo o un cambio', detalle: 'No se creó un pedido duplicado.', datos: { marcador } });
  return `${nombre ? `${nombre}, ` : ''}veo que ya tienes el pedido *DF-${txt(o.numero)}* (${resumenItems(itemsDe(txt(o.id)))})${guia ? ` con la guía *${guia}*${transp && transp !== 'Dropi' ? ` de ${transp}` : ''}` : ''}.\n\n¿Quieres hacer un *pedido nuevo* aparte, o *modificar* el que ya tienes? Respóndeme «nuevo» o «modificar».`;
}

/** ¿Qué decidió el cliente? */
export function clasificarDecision(texto: string): 'nuevo' | 'modificar' | '' {
  const t = norm(texto);
  if (!t) return '';
  const nuevo = /\b(nuevo|otro pedido|pedido aparte|aparte|adicional|otro mas|uno mas|ademas|tambien quiero|quiero otro|agregar otro|hacer otro)\b/.test(t);
  const mod = /\b(modific|cambi|edit|corregir|correg|en vez|en lugar|reemplaz|actualiz|ese mismo|el mismo pedido|el que tengo|el que ya tengo)/.test(t);
  if (nuevo && !mod) return 'nuevo';
  if (mod && !nuevo) return 'modificar';
  return '';
}

/** Horas desde que se generó la guía (null = no tiene guía). */
function horasDesdeGuia(o: Fila): number | null {
  const tieneGuia = !!txt(o.guia) || !!pj<Fila>(txt(o.effi_guia), {}).id;
  if (!tieneGuia) return null;
  let at = txt(o.guia_at);
  if (!at) {
    const ev = db.prepare("SELECT MIN(created_at) t FROM order_eventos WHERE order_id = ? AND nivel = 'ok' AND (etapa = 'guia' OR (etapa = 'despacho' AND titulo LIKE '%guía%'))").get(txt(o.id)) as { t: string | null } | undefined;
    at = ev?.t || txt(o.created_at);
  }
  const ms = new Date(at.replace(' ', 'T') + (at.includes('Z') ? '' : 'Z')).getTime();
  return Number.isFinite(ms) ? (Date.now() - ms) / 3600e3 : 999;
}

/**
 * El cliente respondió a «¿nuevo o modificar?». Devuelve el mensaje para el cliente si el sistema
 * lo resolvió (modificar), o '' si sigue el asistente (nuevo, o no se entendió).
 */
export function resolverDecision(storeId: string, leadId: string, texto: string, ultimaPregunta = false): { respuesta: string; decision: 'nuevo' | 'modificar' | '' } {
  let e = leer(leadId);
  // El asistente mismo pudo hacer la pregunta (sin estado guardado): se toma su pedido protegido.
  if (!e && ultimaPregunta) {
    const lead = db.prepare('SELECT tel, wa_id FROM leads WHERE id = ?').get(leadId) as { tel: string; wa_id: string } | undefined;
    const o = pedidoProtegido(storeId, leadId, [d10(lead?.tel), d10(lead?.wa_id)]);
    if (o) e = { orderId: txt(o.id), numero: txt(o.numero), marcador: '', at: Date.now() };
  }
  if (!e) return { respuesta: '', decision: '' };
  let d = clasificarDecision(texto);
  // A «¿quieres un pedido nuevo igual a ese?» un «sí / claro / dale» es «nuevo».
  if (!d && /^(si|sii+|claro|dale|listo|de una|bueno|ok|okey|correcto|asi es|por favor|porfa)\b/.test(norm(texto))) {
    const ult = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'bot' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(leadId) as { texto: string } | undefined;
    if (/igual a ese\?/.test(norm(ult?.texto || ''))) d = 'nuevo';
  }
  if (!d) return { respuesta: '', decision: '' };
  if (d === 'nuevo') {
    guardar(leadId, { ...e, decision: 'nuevo', decisionAt: Date.now() });
    trazar(storeId, e.orderId, { etapa: 'pedido', nivel: 'info', titulo: 'El cliente quiere un pedido NUEVO aparte', detalle: 'El asistente arma el pedido nuevo (con resumen y confirmación).' });
    return { respuesta: '', decision: 'nuevo' };
  }
  guardar(leadId, null);
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(e.orderId, storeId) as Fila | undefined;
  if (!o) return { respuesta: '', decision: '' };
  const num = `DF-${txt(o.numero)}`;
  const guia = txt(o.guia); const transp = txt(o.transportadora);
  const despachado = ESTADOS_DESPACHADO.includes(txt(o.estado));
  const horas = horasDesdeGuia(o);
  // Lo que pidió cambiar: lo que el asistente iba a registrar, o lo último que escribió el cliente.
  const pidio = e.marcador ? (/items="([^"]*)"/i.exec(e.marcador)?.[1] || '') : '';
  const ultimos = (db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'cliente' AND TRIM(COALESCE(texto,'')) != '' ORDER BY created_at DESC LIMIT 4").all(leadId) as { texto: string }[]).reverse().map((m) => m.texto.replace(/\s+/g, ' ').slice(0, 160));
  const detalle = pidio ? `Quiere: ${pidio}` : `Escribió: «${ultimos.join(' / ')}»`;
  if (despachado) {
    trazar(storeId, txt(o.id), { etapa: 'pedido', nivel: 'warn', titulo: 'El cliente quiso modificar el pedido ya despachado: no se puede', detalle });
    return { decision: 'modificar', respuesta: `Tu pedido *${num}* ya fue despachado${transp && transp !== 'Dropi' ? ` con ${transp}` : ''}${guia ? ` (guía *${guia}*)` : ''}, así que ya no se puede modificar. 🙏 Si quieres, te ayudo con un *pedido nuevo*.` };
  }
  if (horas !== null && horas > 24) {
    trazar(storeId, txt(o.id), { etapa: 'pedido', nivel: 'warn', titulo: 'El cliente quiso modificar el pedido con guía de más de 24 h: no se puede', detalle });
    return { decision: 'modificar', respuesta: `La guía de tu pedido *${num}*${guia ? ` (*${guia}*)` : ''} se generó hace más de 24 horas, así que ya no se puede modificar. 🙏 Si quieres, te ayudo con un *pedido nuevo*.` };
  }
  // Todavía se puede: se le avisa a la tienda (anular la guía en Effi y corregir).
  const anular = horas !== null || !!txt(o.effi_remision) || !!txt(o.dropi_order_id);
  const cambio = { at: new Date().toISOString(), detalle, anular, guia };
  db.prepare('UPDATE orders SET cambio_cliente = ? WHERE id = ?').run(JSON.stringify(cambio), txt(o.id));
  const queHacer = anular ? (txt(o.dropi_order_id) ? 'cancela la orden en Dropi y corrígelo' : 'anula la guía/remisión en Effi (desde el pedido) y corrígelo') : 'corrígelo en el pedido';
  trazar(storeId, txt(o.id), { etapa: 'pedido', nivel: 'warn', titulo: 'El cliente pidió MODIFICAR el pedido: aviso a la tienda', detalle: `${detalle}. → ${queHacer}.` });
  registrarLog(storeId, 'warn', 'pedido', `${num}: el cliente pidió modificar su pedido. ${detalle}. → ${queHacer[0].toUpperCase()}${queHacer.slice(1)}.`, leadId);
  void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `${num}: el cliente pide un cambio ✏️`, `${detalle.slice(0, 120)} · ${queHacer}.`, { url: '/' })).catch(() => {});
  void import('./correo.js').then((c) => c.correoATienda(storeId, 'pedidos', `${num}: el cliente pide modificar el pedido`, `✏️ ${num}: cambio pedido por el cliente`, [c.escHtml(detalle), `Qué hacer: ${queHacer}. Así no se crea un pedido duplicado.`])).catch(() => {});
  return { decision: 'modificar', respuesta: `Listo, le pasé tu cambio a la tienda para tu pedido *${num}*${guia ? ' (todavía se alcanza a corregir la guía)' : ''}. Apenas quede te confirmamos por aquí. 🙌` };
}

/** Lo que el asistente debe saber cuando hay una pregunta pendiente o el cliente eligió «nuevo». */
export function directivaCambio(leadId: string): string {
  const e = leer(leadId);
  if (!e) return '';
  if (e.decision === 'nuevo') return `\n\nEL CLIENTE QUIERE UN PEDIDO NUEVO aparte del DF-${e.numero}: arma el pedido nuevo normalmente (resumen con sus datos y "¿Confirmas?") y pon ##PEDIDO cuando confirme. No modifiques el DF-${e.numero}.`;
  return `\n\nPREGUNTA PENDIENTE: le preguntamos al cliente si quiere un PEDIDO NUEVO aparte o MODIFICAR su pedido DF-${e.numero}. Si todavía no lo dice claro, pregúntaselo de nuevo con amabilidad («¿nuevo o modificar?»). NO pongas ##PEDIDO hasta que diga que es un pedido nuevo, y NO le digas que su pedido quedó cambiado.`;
}

/** ¿El último mensaje del bot fue la pregunta «nuevo o modificar»? */
export function ultimaFuePregunta(leadId: string): boolean {
  const m = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'bot' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(leadId) as { texto: string } | undefined;
  const t = norm(m?.texto || '');
  return /pedido nuevo/.test(t) && /modific/.test(t);
}

/**
 * Entrada desde el webhook (antes del asistente): si el cliente responde «nuevo» o «modificar»
 * a la pregunta, se resuelve aquí. Devuelve true si ya se le respondió (no contesta la IA).
 */
export async function respuestaCambioPedido(storeId: string, leadId: string, texto: string): Promise<boolean> {
  if (!leer(leadId) && !ultimaFuePregunta(leadId)) return false;
  const r = resolverDecision(storeId, leadId, texto, ultimaFuePregunta(leadId));
  if (r.decision !== 'modificar' || !r.respuesta) return false;
  const { sendWhatsappText, marcarEnviado } = await import('./wa.js');
  const { uid } = await import('./db.js');
  const lead = db.prepare('SELECT wa_id, tel FROM leads WHERE id = ?').get(leadId) as { wa_id: string; tel: string } | undefined;
  if (!lead) return false;
  const mid = uid();
  db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'bot', ?)").run(mid, leadId, r.respuesta);
  marcarEnviado(mid, await sendWhatsappText(storeId, lead.wa_id || lead.tel, r.respuesta, lead.tel));
  return true;
}

// ── Pedido repetido: los mismos productos de un pedido que ya salió o ya se entregó ───────────

/** Productos del pedido como conjunto (por producto, sin cantidad ni talla/color). */
function claveProductos(its: { nombre: string; productId?: string | null }[]): string {
  return [...new Set(its.map((i) => (i.productId ? `#${i.productId}` : norm(String(i.nombre || '').split('(')[0].split(/\s[—–-]\s/)[0]))).filter(Boolean))].sort().join('|');
}

/**
 * ¿El cliente ya tiene, de los últimos 20 días, un pedido con guía / despachado / ENTREGADO con los
 * mismos productos? Entonces lo que el asistente quiere registrar es casi seguro el mismo pedido
 * otra vez (pasó con el «sí, gracias» al aviso de entrega: salían dos guías al mismo cliente).
 */
export function pedidoRepetido(storeId: string, leadId: string, tels: string[], items: { nombre: string; productId?: string | null }[]): Fila | undefined {
  const t = tels.filter((x) => x.length === 10);
  const nueva = claveProductos(items);
  if (!nueva) return undefined;
  const cands = db.prepare(
    `SELECT * FROM orders WHERE store_id = ? AND estado NOT IN ('Cancelado','Devuelto') AND created_at > datetime('now','-20 days')
       AND (COALESCE(guia,'') != '' OR COALESCE(effi_remision,'') != '' OR COALESCE(dropi_order_id,'') != '' OR estado NOT IN ('Nuevo','Confirmado'))
       AND (lead_id = ? ${t.map(() => "OR substr(REPLACE(REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-',''),'(',''), -10) = ?").join(' ')})
     ORDER BY created_at DESC LIMIT 5`,
  ).all(storeId, leadId, ...t) as Fila[];
  return cands.find((o) => {
    const its = db.prepare('SELECT nombre, product_id AS productId FROM order_items WHERE order_id = ?').all(txt(o.id)) as { nombre: string; productId: string | null }[];
    if (claveProductos(its) === nueva) return true;
    // Por si un lado tiene el producto enlazado y el otro no: se compara por nombre.
    return claveProductos(its.map((i) => ({ nombre: i.nombre }))) === claveProductos(items.map((i) => ({ nombre: i.nombre })));
  });
}

export interface ParRepetido {
  repetido: { id: string; numero: string; estado: string; total: number; creado: string; guia: string; donde: string; items: string };
  original: { id: string; numero: string; estado: string; total: number; creado: string; guia: string; items: string };
  cliente: string; tel: string; leadId: string;
}

const dondeSale = (o: Fila) => (txt(o.dropi_order_id) ? 'dropi' : txt(o.effi_remision) || pj<Fila>(txt(o.effi_guia), {}).id ? 'effi' : txt(o.despacho_proveedor) === 'bodega_df' ? 'bodega' : txt(o.guia) ? 'guia' : '');

/**
 * Pedidos de los últimos 30 días que parecen la MISMA compra repetida: el asistente creó un pedido con
 * los mismos productos que otro del mismo cliente que ya tenía guía o ya iba en camino/entregado
 * (de 1 hora a 20 días antes). Para que la tienda cancele las guías que salieron de más.
 */
export function pedidosRepetidos(storeId: string): ParRepetido[] {
  const nuevos = db.prepare(
    `SELECT * FROM orders WHERE store_id = ? AND estado NOT IN ('Cancelado','Devuelto') AND created_at > datetime('now','-30 days')
       AND COALESCE(origen,'') IN ('whatsapp','instagram','messenger','web','') AND COALESCE(repetido_ok,0) = 0
     ORDER BY created_at DESC LIMIT 1500`,
  ).all(storeId) as Fila[];
  const its = (id: string) => db.prepare('SELECT nombre, qty, product_id AS productId FROM order_items WHERE order_id = ?').all(id) as { nombre: string; qty: number; productId: string | null }[];
  const out: ParRepetido[] = [];
  const vistos = new Set<string>();
  for (const o of nuevos) {
    const t = d10(o.tel);
    if (t.length !== 10 && !txt(o.lead_id)) continue;
    const previos = db.prepare(
      `SELECT * FROM orders WHERE store_id = ? AND id != ? AND estado NOT IN ('Cancelado','Devuelto')
         AND created_at < datetime(?, '-1 hours') AND created_at > datetime(?, '-20 days')
         AND (COALESCE(guia,'') != '' OR COALESCE(effi_remision,'') != '' OR COALESCE(dropi_order_id,'') != '' OR estado NOT IN ('Nuevo','Confirmado'))
         AND ((? != '' AND lead_id = ?) OR (? != '' AND substr(REPLACE(REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-',''),'(',''), -10) = ?))
       ORDER BY created_at DESC LIMIT 5`,
    ).all(storeId, txt(o.id), txt(o.created_at), txt(o.created_at), txt(o.lead_id), txt(o.lead_id), t.length === 10 ? t : '', t) as Fila[];
    if (!previos.length) continue;
    const itsO = its(txt(o.id));
    const clave = claveProductos(itsO), claveN = claveProductos(itsO.map((i) => ({ nombre: i.nombre })));
    const orig = previos.find((p) => { const x = its(txt(p.id)); return claveProductos(x) === clave || claveProductos(x.map((i) => ({ nombre: i.nombre }))) === claveN; });
    if (!orig || vistos.has(txt(o.id))) continue;
    vistos.add(txt(o.id));
    const linea = (x: { nombre: string; qty: number }[]) => x.map((i) => `${i.qty}× ${i.nombre}`).join(', ');
    out.push({
      repetido: { id: txt(o.id), numero: txt(o.numero), estado: txt(o.estado), total: Number(o.total) || 0, creado: txt(o.created_at), guia: txt(o.guia), donde: dondeSale(o), items: linea(itsO) },
      original: { id: txt(orig.id), numero: txt(orig.numero), estado: txt(orig.estado), total: Number(orig.total) || 0, creado: txt(orig.created_at), guia: txt(orig.guia), items: linea(its(txt(orig.id))) },
      cliente: txt(o.cliente), tel: txt(o.tel), leadId: txt(o.lead_id),
    });
  }
  return out;
}

/** «No es repetido»: la tienda revisó y era una compra de verdad; no vuelve a salir en la lista. */
export function marcarNoRepetido(storeId: string, orderId: string): boolean {
  return db.prepare('UPDATE orders SET repetido_ok = 1 WHERE id = ? AND store_id = ?').run(orderId, storeId).changes > 0;
}

/**
 * Cancela el pedido repetido SIN avisarle al cliente (no tiene sentido decirle «tu pedido fue
 * cancelado» si su compra de verdad sigue en camino). Si salió por Effi intenta anular la guía y la
 * remisión; en Dropi la orden hay que cancelarla allá (se le dice a la tienda).
 */
export async function cancelarRepetido(storeId: string, orderId: string, quien: string): Promise<{ ok: true; nota: string } | { error: string }> {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  if (txt(o.estado) === 'Cancelado') return { ok: true, nota: 'Ya estaba cancelado.' };
  if (['Entregado', 'Devuelto'].includes(txt(o.estado))) return { error: `El pedido DF-${txt(o.numero)} ya está ${txt(o.estado).toLowerCase()}: no se puede cancelar.` };
  let nota = '';
  const donde = dondeSale(o);
  if (donde === 'effi') {
    const r = await (await import('./effiApi.js')).anularEnEffi(storeId, orderId, 'Pedido repetido');
    if ('error' in r) return { error: r.error };
    nota = `Se anuló en Effi${r.guias.length ? ` la guía ${r.guias.join(', ')}` : ''} y la remisión ${r.remision}.`;
  } else if (donde === 'dropi') nota = `Cancela también la orden ${txt(o.dropi_order_id)} en Dropi: desde DealFlow no se puede cancelar allá.`;
  else if (donde === 'guia') nota = `Tenía la guía ${txt(o.guia)}: anúlala en la transportadora si todavía no la recogen.`;
  // La Bodega DealFlow cancela su envío sola cuando ve el pedido cancelado (y devuelve la plata).
  db.prepare("UPDATE orders SET estado = 'Cancelado' WHERE id = ?").run(orderId);
  trazar(storeId, orderId, { etapa: 'estado', nivel: 'warn', titulo: `Pedido repetido cancelado (${txt(o.estado)} → Cancelado)`, detalle: `Por ${quien}. No se le avisó al cliente. ${nota}`.trim() });
  registrarLog(storeId, 'info', 'pedido', `DF-${txt(o.numero)} cancelado por repetido (${quien}). ${nota}`.trim(), txt(o.lead_id) || undefined);
  return { ok: true, nota };
}

/** ¿El cliente dijo claramente que quiere OTRO (otra vez, uno más, para un regalo…) después de ese pedido? */
export function pideOtraVez(leadId: string, desde: string): boolean {
  const msgs = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'cliente' AND created_at > ? AND TRIM(COALESCE(texto,'')) != '' ORDER BY created_at DESC LIMIT 12").all(leadId, desde) as { texto: string }[];
  return msgs.some((m) => /\b(otro|otra|otros|otras|de nuevo|nuevamente|otra vez|volver a (pedir|comprar)|uno mas|una mas|dos mas|mas unidades|adicional|nuevo pedido|pedido nuevo|para regalar|regalo|para mi (amig|herman|mama|papa|espos|hij|vecin|prim)\w*)\b/.test(norm(m.texto)));
}

/** Pregunta al cliente si de verdad quiere un pedido nuevo igual al que ya salió. */
export function preguntaPedidoRepetido(storeId: string, leadId: string, o: Fila, marcador: string): string {
  guardar(leadId, { orderId: txt(o.id), numero: txt(o.numero), marcador, at: Date.now() });
  const nombre = txt(o.cliente).split(' ')[0];
  const entregado = txt(o.estado) === 'Entregado';
  const guia = txt(o.guia);
  trazar(storeId, txt(o.id), { etapa: 'pedido', nivel: 'warn', titulo: 'Posible pedido repetido: se le preguntó al cliente si quiere otro igual', detalle: 'No se creó otro pedido todavía.', datos: { marcador } });
  return `${nombre ? `${nombre}, ` : ''}tu pedido *DF-${txt(o.numero)}* (${resumenItems(itemsDe(txt(o.id)))}) ${entregado ? 'ya te fue entregado' : `ya va en camino${guia ? ` con la guía *${guia}*` : ''}`}. 😊\n\n¿Quieres hacer un *pedido nuevo* aparte, igual a ese? Respóndeme «nuevo» y te lo registro.`;
}

// ── Freno: que un «ok» a un aviso, o un reclamo, no se conviertan en un pedido nuevo ──────────

/** Mensaje del bot que es un aviso sobre un pedido que ya existe (guía, en camino, en oficina, entregado…). */
export function esAvisoDePedido(texto: string): boolean {
  const t = norm(texto);
  if (!t || /resumen de tu pedido|¿?confirmas|lo que pediste|vas a pagar/.test(t)) return false;
  return /tenemos noticias de tu pedido|disponible para recoger|en la oficina de la transportadora|foto de tu guia|numero de guia|tu guia|guia de envio|ya te fue entregado|fue entregado|ya lo recogio|va en camino|esta en camino|en reparto|novedad|tu pedido (ya|df-)|ya fue despachado|ya tiene guia|\[plantilla: (pedido_|guia_|estado_|novedad_)|^guia \S+ \(df-/.test(t);
}

/** Respuesta corta que solo acusa recibo («ok», «gracias», «ya lo recogí»), sin pedir nada nuevo. */
export function esAcuseDeRecibo(texto: string): boolean {
  const t = norm(texto);
  if (!t || t.length > 160) return false;
  return !/\b(quiero|quisiera|necesito|otro|otra|otros|mas|pedir|pido|comprar|compro|pack|paquete|talla|color|unidades|nuevo|nueva|aparte|enviame|mandame|me (envia|envian|manda|mandan)|agrega|agregar|adicional)\b/.test(t);
}

const RECLAMO = /\b(reclamo|reclamar|reclamacion|me llego|me llegaron|llegaron|llego (mal|roto|danad\w*|incomplet\w*|otro|otra)|no es lo que (pedi|ped\w*)|no son los que|defectuos\w*|danad\w*|roto|rota|garantia|devoluci\w*|devolver|mi plata|reembols\w*|estafa\w*|boletiar|boletear|denunci\w*|ratas?|ladron\w*|no sirve|incomplet\w*|faltan|falto|equivocad\w*)\b/;

/**
 * ¿Hay que frenar el pedido nuevo? El cliente ya tiene un pedido despachado o entregado y:
 *  - 'aviso': lo último que hizo fue responder con un «ok/gracias» a un aviso de ese pedido; o
 *  - 'reclamo': en los últimos 3 días se quejó del pedido (le llegó mal, garantía, devolución…).
 * En los dos casos no es una compra nueva: el asistente no la registra sola.
 */
export function frenoPedidoNuevo(storeId: string, leadId: string, tels: string[]): { motivo: 'aviso' | 'reclamo'; pedido: Fila } | null {
  const t = tels.filter((x) => x.length === 10);
  const pedido = db.prepare(
    `SELECT * FROM orders WHERE store_id = ? AND estado != 'Cancelado' AND created_at > datetime('now','-45 days')
       AND (COALESCE(guia,'') != '' OR COALESCE(effi_remision,'') != '' OR COALESCE(dropi_order_id,'') != '' OR estado NOT IN ('Nuevo','Confirmado'))
       AND (lead_id = ? ${t.map(() => "OR substr(REPLACE(REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-',''),'(',''), -10) = ?").join(' ')})
     ORDER BY created_at DESC LIMIT 1`,
  ).get(storeId, leadId, ...t) as Fila | undefined;
  if (!pedido) return null;
  const msgs = (db.prepare("SELECT de, texto, created_at FROM messages WHERE lead_id = ? AND TRIM(COALESCE(texto,'')) != '' ORDER BY created_at DESC, rowid DESC LIMIT 14").all(leadId) as { de: string; texto: string; created_at: string }[]);
  const iCliente = msgs.findIndex((m) => m.de === 'cliente');
  if (iCliente < 0) return null;
  const ultCliente = msgs[iCliente].texto;
  // 1) Respondió un aviso del pedido con un «ok/gracias» (si pide algo nuevo, «quiero otro pack», no es acuse).
  const botAntes = msgs.slice(iCliente + 1).find((m) => m.de === 'bot');
  if (botAntes && esAvisoDePedido(botAntes.texto) && esAcuseDeRecibo(ultCliente)) return { motivo: 'aviso', pedido };
  // 1b) La charla siguió después del aviso («entregado» → «todo perfecto, gracias» → el bot: «¡qué
  // alegría!» → «claro que sí, mil gracias»): si TODO lo que el cliente escribió desde el último aviso
  // son agradecimientos u «ok», tampoco es una compra nueva (DF-2823 se registró y despachó así).
  const iAviso = msgs.findIndex((m) => m.de === 'bot' && esAvisoDePedido(m.texto));
  if (iAviso > 0) {
    const desdeAviso = msgs.slice(0, iAviso).filter((m) => m.de === 'cliente');
    if (desdeAviso.length && desdeAviso.every((m) => esAcuseDeRecibo(m.texto))) return { motivo: 'aviso', pedido };
  }
  // 2) Reclamo reciente (aunque diga «necesito solución» o «sí»): mensajes del cliente de los últimos 3 días.
  const hace3 = Date.now() - 3 * 86400e3;
  const recientes = msgs.filter((m) => m.de === 'cliente' && new Date(String(m.created_at).replace(' ', 'T') + 'Z').getTime() > hace3);
  if (recientes.some((m) => RECLAMO.test(norm(m.texto)))) return { motivo: 'reclamo', pedido };
  return null;
}
