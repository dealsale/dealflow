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
db.exec(`CREATE TRIGGER IF NOT EXISTS orders_guia_at AFTER UPDATE OF guia ON orders
  WHEN COALESCE(OLD.guia,'') = '' AND COALESCE(NEW.guia,'') != '' AND COALESCE(NEW.guia_at,'') = ''
  BEGIN UPDATE orders SET guia_at = datetime('now') WHERE id = NEW.id; END`);

const ESTADOS_DESPACHADO = ['En tránsito', 'En reparto', 'Entregado', 'Novedad', 'Devuelto'];
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
  const d = clasificarDecision(texto);
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
