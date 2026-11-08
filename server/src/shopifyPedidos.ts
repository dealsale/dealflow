/**
 * Etapa 2 de la app de Shopify: pedido de Shopify → DealFlow → confirmación por
 * WhatsApp → despacho → guía de vuelta a Shopify.
 *
 *  1. orders/create (webhook) crea el pedido en DealFlow con origen "shopify", los
 *     datos del comprador y cada producto vinculado a su variante (por SKU o nombre).
 *     Es idempotente: el mismo pedido de Shopify nunca se crea dos veces.
 *  2. Al comprador le llega la plantilla "confirmacion_pedido_tienda" (Sí / No).
 *  3. "Sí" → pedido Confirmado, etiqueta "confirmado-whatsapp" en Shopify y despacho
 *     automático (Effi por API). "No" → etiqueta "no-confirmado", el chat pasa al
 *     equipo y se avisa al dueño. Otra cosa → se le pide una vez que elija Sí o No.
 *  4. Cuando el pedido tiene guía, se marca enviado en Shopify con el número de guía
 *     (Shopify le manda al comprador su correo de seguimiento).
 *
 * Modo prueba (para la revisión de Shopify): no crea remisiones ni guías reales,
 * simula el despacho con una guía de prueba.
 */
import { db, pj, uid, registrarLog, siguienteNumeroPedido } from './db.js';
import { trazar } from './trazabilidad.js';
import { idsDeItem } from './emparejar.js';
import { desempacar, corregirPacksAntiguos } from './packs.js';

// Pedidos que ya entraron con packs contados como 1 unidad: se corrigen una vez al arrancar.
setTimeout(corregirPacksAntiguos, 15_000);

for (const col of ["shopify_id TEXT NOT NULL DEFAULT ''", "shopify_shop TEXT NOT NULL DEFAULT ''", "shopify_gid TEXT NOT NULL DEFAULT ''", "confirmacion TEXT NOT NULL DEFAULT ''", "shopify_fulfilled INTEGER NOT NULL DEFAULT 0", "confirmacion_error TEXT NOT NULL DEFAULT ''", "confirmacion_intentos INTEGER NOT NULL DEFAULT 0"]) {
  try { db.exec(`ALTER TABLE orders ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_shopify ON orders(store_id, shopify_id)");
// Pedidos de Shopify que la tienda ELIMINÓ en DealFlow: no se vuelven a importar nunca (ni por la
// revisión cada 5 min, ni por el webhook, ni por el botón «Traer pedidos»).
db.exec(`CREATE TABLE IF NOT EXISTS shopify_descartados (
  store_id TEXT NOT NULL, shopify_id TEXT NOT NULL, numero TEXT NOT NULL DEFAULT '', at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, shopify_id))`);

/** Al eliminar un pedido en DealFlow: si vino de Shopify, recordarlo para no traerlo otra vez. */
export function descartarPedidoShopify(storeId: string, orderId: string): void {
  const o = db.prepare("SELECT shopify_id, numero FROM orders WHERE id = ? AND store_id = ? AND COALESCE(shopify_id,'') != ''").get(orderId, storeId) as { shopify_id: string; numero: string } | undefined;
  if (!o) return;
  db.prepare('INSERT OR IGNORE INTO shopify_descartados (store_id, shopify_id, numero) VALUES (?,?,?)').run(storeId, o.shopify_id, String(o.numero || ''));
}
const descartado = (storeId: string, shopifyId: string) => !!db.prepare('SELECT 1 FROM shopify_descartados WHERE store_id = ? AND shopify_id = ?').get(storeId, shopifyId);
try { db.exec("ALTER TABLE orders ADD COLUMN confirmacion_at TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
// Cancelado por el cliente (para reactivarlo si cambia de opinión) y cancelación pedida de un pedido ya despachado.
for (const col of ["cancelado_cliente_at TEXT NOT NULL DEFAULT ''", "cancelacion_pedida_at TEXT NOT NULL DEFAULT ''"]) {
  try { db.exec(`ALTER TABLE orders ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
// Cuándo se le pidió el «sí» al cliente (lo usa la revisión de confirmaciones perdidas).
db.exec(`CREATE TRIGGER IF NOT EXISTS trg_orders_confirmacion_at AFTER UPDATE OF confirmacion ON orders
  FOR EACH ROW WHEN NEW.confirmacion = 'esperando' AND OLD.confirmacion IS NOT 'esperando'
  BEGIN UPDATE orders SET confirmacion_at = datetime('now') WHERE id = NEW.id; END`);

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
export const PLANTILLA_CONFIRMACION = 'confirmacion_pedido_tienda';
/** Con todos los datos del pedido (como el resumen del bot); se usa apenas Meta la apruebe. */
export const PLANTILLA_CONFIRMACION_COMPLETA = 'confirmacion_pedido_completa';

export interface CfgPedidosShopify { confirmar: boolean; autoDespacho: boolean; modoPrueba: boolean }
export function cfgPedidosShopify(storeId: string): CfgPedidosShopify {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { config: string } | undefined;
  const c = pj<Record<string, unknown>>(r?.config || '', {});
  return { confirmar: c.confirmar !== false, autoDespacho: c.autoDespacho !== false, modoPrueba: c.modoPrueba === true };
}
export function guardarCfgPedidosShopify(storeId: string, parcial: Partial<CfgPedidosShopify>): CfgPedidosShopify | null {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { config: string } | undefined;
  if (!r) return null;
  const c = pj<Record<string, unknown>>(r.config, {});
  for (const k of ['confirmar', 'autoDespacho', 'modoPrueba'] as const) if (typeof parcial[k] === 'boolean') c[k] = parcial[k];
  db.prepare("UPDATE store_integrations SET config = ?, updated_at = datetime('now') WHERE store_id = ? AND tipo = 'shopify'").run(JSON.stringify(c), storeId);
  return cfgPedidosShopify(storeId);
}

/** Celular colombiano en formato WhatsApp (57 + 10 dígitos). */
function waDe(tel: string): string {
  const d = txt(tel).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) return '57' + d;
  if (d.length === 12 && d.startsWith('57')) return d;
  return d.length >= 10 ? d : '';
}

/** Variante de DealFlow para una línea de Shopify: por SKU (refs.shopify o sku) y, si no, por nombre. */
function varianteDeLinea(storeId: string, li: Fila): { productId: string; variantId: string } {
  const sku = txt(li.sku).trim();
  if (sku) {
    const v = db.prepare(`SELECT v.id, v.product_id FROM variants v JOIN products p ON p.id = v.product_id
      WHERE p.store_id = ? AND (json_extract(v.refs,'$.shopify') = ? OR v.sku = ?) LIMIT 1`).get(storeId, sku, sku) as { id: string; product_id: string } | undefined;
    if (v) return { productId: v.product_id, variantId: v.id };
  }
  const nombre = txt(li.title) + (txt(li.variant_title) ? ` (${txt(li.variant_title).replace(/\s*\/\s*/g, ' · ')})` : '');
  return idsDeItem(storeId, nombre);
}

/** Crea en DealFlow el pedido que llegó de Shopify (orders/create). Nunca lanza. */
export async function importarPedido(storeId: string, shop: string, o: Fila, confirmar = true): Promise<string | null> {
  try {
    const sid = txt(o.id);
    if (!sid) return null;
    const ya = db.prepare('SELECT id FROM orders WHERE store_id = ? AND shopify_id = ?').get(storeId, sid) as { id: string } | undefined;
    if (ya) return ya.id; // ya importado (Shopify reintenta webhooks)
    if (descartado(storeId, sid)) return null; // la tienda lo eliminó en DealFlow: no se vuelve a traer
    const env = (o.shipping_address || o.billing_address || {}) as Fila;
    const cust = (o.customer || {}) as Fila;
    const cliente = (txt(env.name) || `${txt(cust.first_name)} ${txt(cust.last_name)}`).trim() || 'Cliente Shopify';
    const tel = txt(env.phone) || txt(o.phone) || txt(cust.phone) || txt(((o.billing_address || {}) as Fila).phone);
    const direccion = [txt(env.address1), txt(env.address2)].filter(Boolean).join(', ');
    const lineas = (Array.isArray(o.line_items) ? o.line_items : []) as Fila[];
    const envio = (Array.isArray(o.shipping_lines) ? o.shipping_lines as Fila[] : []).reduce((a, s) => a + (Number(s.price) || 0), 0);
    const total = Math.round(Number(o.total_price) || 0);
    const pagado = txt(o.financial_status) === 'paid';
    const numero = siguienteNumeroPedido(storeId);
    const oid = uid();
    db.prepare(`INSERT INTO orders (id, store_id, numero, cliente, ciudad, departamento, tel, direccion, estado, transportadora, total, envio, nota, origen, shopify_id, shopify_shop, shopify_gid)
      VALUES (?,?,?,?,?,?,?,?,'Nuevo','',?,?,?,'shopify',?,?,?)`)
      .run(oid, storeId, numero, cliente, txt(env.city), txt(env.province), tel, direccion, total, Math.round(envio),
        [`Shopify ${txt(o.name)}`, pagado ? 'Pagado' : 'Contra entrega', txt(o.note)].filter(Boolean).join(' · '), sid, shop, txt(o.admin_graphql_api_id) || `gid://shopify/Order/${sid}`);
    const packs: string[] = [];
    for (const li of lineas) {
      const nombre = txt(li.title) + (txt(li.variant_title) ? ` (${txt(li.variant_title).replace(/\s*\/\s*/g, ' · ')})` : '');
      const ids = varianteDeLinea(storeId, li);
      // "Pack x6" con cantidad 1 → 6 unidades del producto (precio por unidad).
      const props = (Array.isArray(li.properties) ? li.properties as Fila[] : []).map((p) => `${txt(p.name)} ${txt(p.value)}`).join(' · ');
      const l = desempacar(storeId, { qty: Math.max(1, Number(li.quantity) || 1), precio: Math.round(Number(li.price) || 0), nombre, ...ids }, [txt(li.variant_title), props].filter(Boolean).join(' · '));
      if (l.unidadesPorPack > 1) packs.push(`${txt(li.quantity) || 1}× ${nombre} → ${l.qty} unidades`);
      db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio, product_id, variant_id) VALUES (?,?,?,?,?,?,?)')
        .run(uid(), oid, l.qty, l.nombre, l.precio, l.productId, l.variantId);
    }
    trazar(storeId, oid, { etapa: 'pedido', nivel: 'ok', titulo: `Pedido DF-${numero} creado desde Shopify ${txt(o.name)}`, detalle: `Origen: shopify (${shop})`, datos: { cliente, tel, ciudad: txt(env.city), total, envio, productos: lineas.map((l) => `${txt(l.quantity)}× ${txt(l.title)} ${txt(l.variant_title)} [${txt(l.sku)}]`) } });
    void import('./historialCliente.js').then((h) => h.avisarSiRiesgo(storeId, oid, tel, numero)).catch(() => {});
    if (packs.length) trazar(storeId, oid, { etapa: 'pedido', nivel: 'info', titulo: 'Packs convertidos a unidades', detalle: packs.join(' · ') });
    registrarLog(storeId, 'info', 'pedido', `Pedido DF-${numero} llegó de Shopify ${txt(o.name)} (${cliente}).`);
    void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `Nuevo pedido de Shopify DF-${numero} 🛍️`, `${cliente} · ${pesos(total)}`, { url: '/' })).catch(() => {});
    void import('./correo.js').then((c) => c.correoPedidoNuevo(storeId, oid, 'Shopify')).catch(() => {});
    void import('./metaCapi.js').then((c) => c.avisarCapi(storeId)).catch(() => {});
    if (!tel) trazar(storeId, oid, { etapa: 'pedido', nivel: 'warn', titulo: 'El pedido de Shopify llegó sin teléfono', detalle: 'No se puede confirmar por WhatsApp. ¿Falta aprobar el acceso a datos de clientes en Shopify, o el checkout no pide el teléfono?' });
    else if (confirmar && cfgPedidosShopify(storeId).confirmar) await enviarConfirmacion(storeId, oid);
    else if (!confirmar) trazar(storeId, oid, { etapa: 'pedido', nivel: 'info', titulo: 'Pedido antiguo: no se envió confirmación automática', detalle: 'Se trajo de Shopify más de 24 h después de creado. Puedes enviar la confirmación con el botón del pedido.' });
    return oid;
  } catch (e) {
    console.error('[shopify] importando pedido', e);
    return null;
  }
}

/**
 * Resumen completo del pedido (productos, total y datos de envío) para el cliente. Es el
 * MISMO para todos los pedidos (bot, landing, Shopify, a mano): con pregunta de Sí/No o
 * como "quedó registrado" cuando el cliente ya lo confirmó en la conversación.
 */
export function textoResumenPedido(storeId: string, orderId: string, modo: 'preguntar' | 'registrado', idioma: 'es' | 'en' = 'es'): string {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Fila | undefined;
  if (!o) return '';
  const items = db.prepare('SELECT qty, nombre FROM order_items WHERE order_id = ?').all(orderId) as { qty: number; nombre: string }[];
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || '';
  const linea = (v: unknown, max = 200) => txt(v).replace(/\s+/g, ' ').trim().slice(0, max) || '—';
  const nombre = txt(o.cliente).trim().split(/\s+/)[0] || '';
  const num = `DF-${txt(o.numero)}`;
  const celular = txt(o.tel).replace(/\D/g, '').slice(-10) || '—';
  const pagado = /\bPagado\b/.test(txt(o.nota));
  const prods = items.map((i) => `• ${i.qty}× ${i.nombre}`).join('\n') || '• —';
  // Escrito simple: qué pidió, cuánto paga, a dónde va y qué tiene que hacer el cliente.
  // (Se conservan las palabras «resumen» y «Dirección»: así se reconoce el resumen en el chat.)
  if (idioma === 'en') {
    const datosEn = `🛍️ What you ordered:\n${prods}\n💰 You pay: ${pesos(Number(o.total) || 0)}${pagado ? ' (already paid)' : ' when it arrives (cash on delivery)'}\n\n📦 Where we send it:\n👤 Name: ${linea(o.cliente, 80)}\n📞 Phone: ${celular}\n🏠 Address: ${linea(o.direccion)}\n🏙️ City: ${linea(o.ciudad, 60)}\n📍 State: ${linea(o.departamento, 60)}`;
    if (modo === 'registrado') return `✅ Done${nombre ? ', ' + nombre : ''}! Your order ${num} is confirmed${tienda ? ` at ${tienda}` : ''}. This is the summary:\n\n${datosEn}\n\nWhat happens next?\n1️⃣ We pack your order.\n2️⃣ We create the shipping label and send it to you here.\n3️⃣ The carrier picks it up and brings it to you.\n\nIf any detail is wrong, just tell us and we fix it.`;
    return `Hi${nombre ? ' ' + nombre : ''} 👋 This is the summary of your order ${num}${tienda ? ` at ${tienda}` : ''}:\n\n${datosEn}\n\nPlease check that everything is right.\n✅ If it is all good, reply *Yes*.\n✏️ If something is wrong, tell us what to change and we fix it.`;
  }
  const datos = `🛍️ Lo que pediste:\n${prods}\n💰 Vas a pagar: ${pesos(Number(o.total) || 0)}${pagado ? ' (ya está pagado)' : ' cuando te llegue (pago contra entrega)'}\n\n📦 A dónde lo enviamos:\n👤 Nombre: ${linea(o.cliente, 80)}\n📞 Celular: ${celular}\n🏠 Dirección: ${linea(o.direccion)}\n🏙️ Ciudad: ${linea(o.ciudad, 60)}\n📍 Departamento: ${linea(o.departamento, 60)}`;
  if (modo === 'registrado') return `✅ ¡Listo${nombre ? ', ' + nombre : ''}! Tu pedido ${num} quedó confirmado${tienda ? ` en ${tienda}` : ''}. Este es el resumen:\n\n${datos}\n\n¿Qué sigue?\n1️⃣ Empacamos tu pedido.\n2️⃣ Creamos la guía de envío y te la mandamos por aquí.\n3️⃣ La transportadora lo recoge y te lo lleva.\n\nSi algún dato está mal, escríbenos y lo corregimos.`;
  return `Hola${nombre ? ' ' + nombre : ''} 👋 Este es el resumen de tu pedido ${num}${tienda ? ` en ${tienda}` : ''}:\n\n${datos}\n\nRevisa que todo esté bien.\n✅ Si todo está bien, responde *Sí*.\n✏️ Si algo está mal, dinos qué cambiar y lo corregimos.`;
}

/**
 * Pedido que el asistente acaba de crear en la conversación: SIEMPRE le llega al cliente el
 * resumen completo. Si en el chat ya vio el resumen y dijo que sí, va como "quedó
 * registrado"; si no (la IA se saltó el resumen), va con la pregunta Sí/No y el pedido NO
 * se despacha hasta que confirme. Devuelve si ya estaba confirmado.
 */
export async function resumenPedidoDelBot(storeId: string, orderId: string, leadId: string, destino: string, pn: string | undefined, idioma: 'es' | 'en'): Promise<{ confirmado: boolean }> {
  // ¿El bot mostró un resumen y el cliente respondió después? (en las últimas 6 h)
  const ult = db.prepare("SELECT de, texto FROM messages WHERE lead_id = ? AND created_at > datetime('now','-6 hours') ORDER BY created_at DESC, rowid DESC LIMIT 40").all(leadId) as { de: string; texto: string }[];
  const iRes = ult.findIndex((m) => m.de === 'bot' && /(resumen|summary)/i.test(m.texto) && /(direcci|address|ciudad|city)/i.test(m.texto));
  const confirmado = iRes > 0 && ult.slice(0, iRes).some((m) => m.de === 'cliente');
  const texto = textoResumenPedido(storeId, orderId, confirmado ? 'registrado' : 'preguntar', idioma);
  const { sendWhatsappText, marcarEnviado } = await import('./wa.js');
  const mid = uid();
  db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'bot', ?)").run(mid, leadId, texto);
  const r = await sendWhatsappText(storeId, destino, texto, pn);
  marcarEnviado(mid, r);
  db.prepare('UPDATE orders SET confirmacion = ?, confirmacion_error = ?, lead_id = COALESCE(NULLIF(lead_id, \'\'), ?) WHERE id = ?')
    .run(r.ok ? (confirmado ? 'si' : 'esperando') : 'fallo', r.ok ? '' : `No salió el resumen por WhatsApp: ${r.error || 'error desconocido'}`, leadId, orderId);
  trazar(storeId, orderId, {
    etapa: 'pedido', nivel: r.ok ? 'ok' : 'warn',
    titulo: !r.ok ? 'No se pudo enviar el resumen del pedido' : confirmado ? 'Resumen enviado: el cliente ya lo había confirmado en el chat' : 'Resumen enviado con la pregunta Sí / No (el asistente no lo había mostrado)',
    detalle: r.ok ? (confirmado ? '' : 'El pedido se despacha cuando el cliente responda Sí.') : r.error,
  });
  return { confirmado };
}

/** Envía la plantilla de confirmación (Sí / No) al comprador. */
export async function enviarConfirmacion(storeId: string, orderId: string): Promise<{ ok: boolean; detalle: string }> {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { ok: false, detalle: 'Pedido no encontrado.' };
  const wa = waDe(txt(o.tel));
  if (!wa) return { ok: false, detalle: 'El teléfono del pedido no es un celular válido.' };
  const items = db.prepare('SELECT qty, nombre FROM order_items WHERE order_id = ?').all(orderId) as { qty: number; nombre: string }[];
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || 'nuestra tienda';
  const nombre = txt(o.cliente).split(' ')[0] || 'hola';
  const productos = items.map((i) => `${i.qty}× ${i.nombre}`).join(', ').slice(0, 300) || 'tu pedido';
  const total = `${pesos(Number(o.total) || 0)}${/\bPagado\b/.test(txt(o.nota)) ? ' (ya pagado)' : ' · pago contra entrega'}`;

  const { ensureLead, sendWhatsappTemplate, sendWhatsappText, marcarEnviado } = await import('./wa.js');
  const { id: leadId } = ensureLead(storeId, wa, txt(o.cliente), '+' + wa);
  // "Esperando" solo cuando el mensaje SÍ salió; si no salió, queda "fallo" con el motivo.
  db.prepare('UPDATE orders SET lead_id = ? WHERE id = ?').run(leadId, orderId);
  const fallo = (motivo: string) => db.prepare("UPDATE orders SET confirmacion = 'fallo', confirmacion_error = ? WHERE id = ?").run(motivo.slice(0, 400), orderId);
  db.prepare("UPDATE leads SET asignado = 'Asistente (bot)', etiqueta = 'Venta', seguimiento_nivel = 3 WHERE id = ?").run(leadId);

  const { puedeEscribirle, contarProactivo } = await import('./calidad.js');
  const permiso = puedeEscribirle(storeId, wa, leadId);
  if (!permiso.ok) { fallo(permiso.motivo || 'WhatsApp no permite escribirle a este número ahora.'); trazar(storeId, orderId, { etapa: 'pedido', nivel: 'warn', titulo: 'No se envió la confirmación por WhatsApp', detalle: permiso.motivo }); return { ok: false, detalle: permiso.motivo }; }

  const { plantillaAprobada } = await import('./avisoGuia.js');
  const completa = plantillaAprobada(storeId, PLANTILLA_CONFIRMACION_COMPLETA);
  const pl = completa || plantillaAprobada(storeId, PLANTILLA_CONFIRMACION);
  const mid = uid();
  let r: { ok: boolean; error?: string; wamid?: string };
  let texto: string;
  // Datos de envío (WhatsApp no acepta saltos de línea dentro de una variable: van en una línea).
  const unaLinea = (v: unknown, max = 160) => txt(v).replace(/\s+/g, ' ').trim().slice(0, max) || '—';
  const numDF = `DF-${txt(o.numero)}`;
  const celular = txt(o.tel).replace(/\D/g, '').slice(-10);
  if (pl) {
    const params = completa
      ? [nombre, tienda, numDF, unaLinea(productos, 300), total, unaLinea(o.cliente, 80), celular || '—', unaLinea(o.direccion, 200), unaLinea(o.ciudad, 60), unaLinea(o.departamento, 60)]
      : [nombre, tienda, productos, total];
    const rr = await sendWhatsappTemplate(storeId, wa, pl, params, wa);
    texto = rr.textoRender || `Confirmación del pedido DF-${txt(o.numero)}`;
    r = rr;
  } else {
    // Sin plantilla aprobada solo se puede escribir si el cliente habló en las últimas 24 h.
    texto = textoResumenPedido(storeId, orderId, 'preguntar');
    r = await sendWhatsappText(storeId, wa, texto, wa);
  }
  db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'bot', ?)").run(mid, leadId, texto);
  marcarEnviado(mid, r);
  db.prepare('UPDATE orders SET confirmacion_intentos = confirmacion_intentos + 1 WHERE id = ?').run(orderId);
  if (r.ok) {
    contarProactivo(storeId, wa, 'confirmacion');
    db.prepare("UPDATE orders SET confirmacion = 'esperando', confirmacion_error = '' WHERE id = ?").run(orderId);
  } else {
    registrarLog(storeId, 'warn', 'pedido', `${numDF}: no le llegó al cliente el resumen para confirmar (${(r.error || 'sin plantilla aprobada y fuera de las 24 h').slice(0, 160)}). Se reintenta solo; también puedes reenviarlo desde el pedido.`, leadId);
    fallo(pl ? `WhatsApp rechazó la plantilla: ${r.error || 'error desconocido'}`
      : `Ninguna plantilla de confirmación ("${PLANTILLA_CONFIRMACION_COMPLETA}" o "${PLANTILLA_CONFIRMACION}") está aprobada en Meta y el cliente no te ha escrito en las últimas 24 h, así que WhatsApp no deja escribirle. Apruébala en Plantillas o llámalo/escríbele primero.`);
  }
  trazar(storeId, orderId, { etapa: 'pedido', nivel: r.ok ? 'ok' : 'warn', titulo: r.ok ? 'Confirmación enviada por WhatsApp (Sí / No)' : 'No se pudo enviar la confirmación', detalle: r.ok ? (pl ? `Plantilla ${completa ? PLANTILLA_CONFIRMACION_COMPLETA : PLANTILLA_CONFIRMACION}${completa ? ' (con todos los datos)' : ' (corta: la completa aún no está aprobada)'}` : 'Texto (ventana de 24 h abierta)') : `${r.error || ''}${pl ? '' : ` · Ninguna plantilla de confirmación ("${PLANTILLA_CONFIRMACION_COMPLETA}" o "${PLANTILLA_CONFIRMACION}") está aprobada en Meta para esta tienda.`}` });
  return { ok: r.ok, detalle: r.error || '' };
}

// Sí / No del comprador (botones de la plantilla o escrito a mano).
const limpio = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s👍✅❌]/gu, ' ').replace(/\s+/g, ' ').trim();
const SI = new Set(['si', 'sii', 'siii', 'sip', 'sisas', 'sisa', 'confirmo', 'confirmado', 'confirmar', 'dale', 'listo', 'ok', 'okay', 'okey', 'oki', 'correcto', 'claro', 'perfecto', 'afirmativo', 'enviamelo', 'envialo', 'envienlo', 'mandalo', 'mandenlo', 'hagale', 'adelante', 'bueno', 'vale', 'va', 'obvio', 'yes', '👍', '✅']);
const NO = new Set(['no', 'nop', 'nel', 'cancelar', 'cancela', 'cancelalo', 'cancelado', '❌']);
const esSi = (t: string) => { const l = limpio(t); const w = l.split(' '); return (SI.has(w[0]) && !/\b(pero|cambi\w*)\b/.test(l)) || /\b(si confirmo|de una|si senor|si senora|esta bien|de acuerdo|por supuesto|todo bien|todo correcto|asi es|me lo envian|lo espero)\b/.test(l); };
const esNo = (t: string) => { const l = limpio(t); return NO.has(l.split(' ')[0]) || /\b(ya no|no quiero|no lo quiero|no gracias|cancel)/.test(l); };

/**
 * Respuesta del comprador a la confirmación. Devuelve true si la manejó (y el bot
 * no debe contestar por su cuenta).
 */
/**
 * El pedido de este chat que espera el «sí». Primero por el chat; si no, por el celular
 * (el cliente a veces responde desde un chat que quedó con otro formato del número).
 * Un pedido que ya tiene guía o remisión ya salió: su «sí» no se vuelve a pedir ni a procesar.
 */
export function pedidoEsperandoSi(storeId: string, leadId: string): Fila | undefined {
  const base = `SELECT * FROM orders WHERE store_id = ? AND confirmacion = 'esperando' AND estado IN ('Nuevo','Confirmado')
    AND COALESCE(effi_remision,'') = '' AND COALESCE(dropi_order_id,'') = '' AND COALESCE(guia,'') = ''
    AND created_at > datetime('now','-7 days')`;
  const o = db.prepare(`${base} AND lead_id = ? ORDER BY created_at DESC LIMIT 1`).get(storeId, leadId) as Fila | undefined;
  if (o) return o;
  const l = db.prepare('SELECT tel, wa_id FROM leads WHERE id = ?').get(leadId) as { tel: string; wa_id: string } | undefined;
  const d10 = [txt(l?.tel), txt(l?.wa_id)].map((t) => t.replace(/\D/g, '').slice(-10)).find((t) => /^3\d{9}$/.test(t));
  if (!d10) return undefined;
  const p = db.prepare(`${base} AND REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ? ORDER BY created_at DESC LIMIT 1`).get(storeId, `%${d10}`) as Fila | undefined;
  if (p) db.prepare('UPDATE orders SET lead_id = ? WHERE id = ?').run(leadId, txt(p.id));
  return p;
}

/**
 * «Sí, pero cámbiame…»: el cliente acepta y además pide un cambio. El asistente aplica el
 * cambio y, al actualizar ESE pedido, queda confirmado sin volver a preguntar.
 */
const siConCambio = new Map<string, { orderId: string; at: number }>();
export function confirmaAlCambiar(leadId: string, orderId: string): boolean {
  const f = siConCambio.get(leadId);
  if (!f || f.orderId !== orderId || Date.now() - f.at > 6 * 3600e3) return false;
  siConCambio.delete(leadId);
  return true;
}

/**
 * Confirma el pedido (una sola vez): estado Confirmado, aviso al cliente, etiqueta y
 * despacho automático si la tienda lo tiene. `aviso`: false cuando el que llama ya le
 * escribe al cliente (p. ej. con el resumen actualizado).
 */
export async function confirmarPedidoCliente(storeId: string, orderId: string, texto: string, opts: { aviso?: boolean; titulo?: string } = {}): Promise<boolean> {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return false;
  // Solo una vez: si el cliente mandó dos «sí» seguidos, el segundo no confirma ni despacha de nuevo.
  const cambio = db.prepare("UPDATE orders SET confirmacion = 'si', estado = CASE WHEN estado = 'Nuevo' THEN 'Confirmado' ELSE estado END WHERE id = ? AND confirmacion != 'si'").run(orderId);
  if (!cambio.changes) return false;
  trazar(storeId, orderId, { etapa: 'pedido', nivel: 'ok', titulo: opts.titulo || 'El cliente confirmó el pedido por WhatsApp', detalle: texto });
  if (opts.aviso !== false && txt(o.lead_id)) {
    const lead = db.prepare('SELECT wa_id, tel FROM leads WHERE id = ?').get(txt(o.lead_id)) as { wa_id: string; tel: string } | undefined;
    if (lead) {
      const { sendWhatsappText, marcarEnviado } = await import('./wa.js');
      const nombre = txt(o.cliente).split(' ')[0];
      const msg = `¡Gracias${nombre ? ', ' + nombre : ''}! 🎉 Tu pedido DF-${txt(o.numero)} quedó confirmado.\n\nAhora lo vamos a empacar y a crear la guía de envío. Apenas la tengamos te la mandamos por aquí. 📦`;
      const mid = uid();
      db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'bot', ?)").run(mid, txt(o.lead_id), msg);
      marcarEnviado(mid, await sendWhatsappText(storeId, lead.wa_id || lead.tel, msg, lead.tel));
    }
  }
  void etiquetar(storeId, orderId, ['confirmado-whatsapp']);
  // Landing: despacha solo si esa landing lo tiene activo. Shopify: según su configuración.
  // Los demás (asistente, a mano): si la tienda tiene "Enviar solo a Effi" encendido.
  const auto = txt(o.origen) === 'landing'
    ? (await import('./landings.js')).autoDespachoDeLanding(txt(o.landing_id))
    : txt(o.origen) === 'shopify' ? cfgPedidosShopify(storeId).autoDespacho
    : !!(await import('./effiApi.js')).cfgEffi(storeId)?.autoDespacho;
  if (auto) void despacharConfirmado(storeId, orderId);
  return true;
}

export async function respuestaConfirmacion(storeId: string, leadId: string, texto: string): Promise<boolean> {
  const o = pedidoEsperandoSi(storeId, leadId);
  if (!o) return false;
  const t = txt(texto).trim();
  const orderId = txt(o.id);
  const num = `DF-${txt(o.numero)}`;

  // Ni sí ni no claro: la IA decide si está aceptando el envío ("bueno, mándenlo el lunes").
  let veredicto: 'si' | 'no' | 'otro' = esSi(t) && !esNo(t) ? 'si' : esNo(t) ? 'no' : 'otro';
  if (veredicto === 'otro') {
    const items = (db.prepare('SELECT qty, nombre FROM order_items WHERE order_id = ?').all(txt(o.id)) as { qty: number; nombre: string }[]).map((i) => `${i.qty}× ${i.nombre}`).join(', ');
    veredicto = await (await import('./ai.js')).clasificarConfirmacion(storeId, `${items} · total ${pesos(Number(o.total) || 0)}`, t);
  }
  if (veredicto === 'si') {
    await confirmarPedidoCliente(storeId, orderId, texto);
    return true;
  }
  if (veredicto === 'no' && !quiereCorregir(t) && cancelaClaro(t)) {
    // «No» (o «cancelar») sin pedir un cambio: no quiere el pedido → queda CANCELADO.
    await cancelarPorCliente(storeId, o, leadId, texto, 'respondió que NO a la confirmación');
    return false; // el asistente le responde (sabe que quedó cancelado y puede reactivarlo)
  }
  if (veredicto === 'no') {
    // «No, la dirección está mal»: no lo cancela, quiere corregir. El asistente arregla los
    // datos y le vuelve a pedir el «sí».
    db.prepare("UPDATE orders SET confirmacion = 'no' WHERE id = ?").run(orderId);
    // El asistente sigue la conversación (le pregunta qué pasó y si quiere cambiar algo);
    // al equipo le llega el aviso por si quiere intervenir.
    db.prepare("UPDATE leads SET etiqueta = 'Seguimiento' WHERE id = ?").run(leadId);
    trazar(storeId, orderId, { etapa: 'pedido', nivel: 'warn', titulo: 'El cliente respondió que NO confirma el pedido', detalle: `${texto} · El asistente sigue la conversación.` });
    registrarLog(storeId, 'warn', 'pedido', `${num}: el cliente no confirmó el pedido${txt(o.origen) === 'landing' ? ' de la landing' : txt(o.origen) === 'shopify' ? ' de Shopify' : ''}. Escríbele desde el Inbox.`, leadId);
    void etiquetar(storeId, orderId, ['no-confirmado']);
    void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `${num} no confirmado ❌`, `${txt(o.cliente)} respondió que no. El asistente le está preguntando qué pasó.`, { url: '/' })).catch(() => {});
    void import('./correo.js').then((c) => c.correoATienda(storeId, 'pedidos', `${num} no confirmado`, `❌ ${num}: el cliente no confirmó`, [`${c.escHtml(txt(o.cliente))} respondió que <b>no</b> confirma el pedido.`, 'El asistente sigue la conversación para saber qué pasó; puedes intervenir desde el Inbox.'])).catch(() => {});
    return false; // que el asistente le responda
  }
  // «Sí, pero cámbiame la dirección…»: acepta y pide un cambio. El asistente aplica el cambio
  // y, al actualizar este pedido, queda confirmado (no se le vuelve a preguntar).
  const primera = limpio(t).split(' ')[0];
  if (SI.has(primera) || /^(si|claro|listo|ok)\b/.test(limpio(t))) {
    siConCambio.set(leadId, { orderId, at: Date.now() });
    trazar(storeId, orderId, { etapa: 'pedido', nivel: 'info', titulo: 'El cliente dijo que sí y pidió un cambio', detalle: `${texto} · El asistente aplica el cambio y el pedido queda confirmado.` });
  }
  // Pregunta algo o pide un cambio: responde el asistente (sabe que el pedido espera su "sí").
  return false;
}

/** «No, está mal la dirección», «no, es otra talla»: quiere corregir, no cancelar. */
export function quiereCorregir(texto: string): boolean {
  const l = limpio(texto);
  return /\b(cambi\w*|correg\w*|corrij\w*|modific\w*|equivoc\w*|error|mal|incorrect\w*|otra|otro|direccion|talla|color|barrio|ciudad|nombre|celular|numero|dato|datos|cantidad)\b/.test(l);
}
/** «No» corto (el botón, «no gracias») o un pedido claro de cancelar. «No, mejor el lunes» NO cancela. */
export function cancelaClaro(texto: string): boolean {
  const l = limpio(texto);
  return pideCancelar(texto) || /^(no|nop|nel|❌)( gracias| senor| senora| por ahora| ya no)?$/.test(l);
}
/** «Cancélenlo», «ya no lo quiero», «no me lo envíen» (y no «no quiero cancelar»). */
export function pideCancelar(texto: string): boolean {
  const l = limpio(texto);
  if (/\bno (quiero |voy a |lo )?(cancel|anul)/.test(l)) return false;
  return /\b(cancel\w*|anul\w*)\b/.test(l) || /\bya no (lo |la |los |las )?(quiero|necesito|lo voy a recibir)\b/.test(l)
    || /\bno (me )?(lo |la |los |las )?(envien|manden|despachen|mandes|envies)\b/.test(l) || /\bno lo quiero\b/.test(l);
}

/** Deja el pedido CANCELADO por decisión del cliente (se puede reactivar si cambia de opinión). */
async function cancelarPorCliente(storeId: string, o: Fila, leadId: string, texto: string, como: string): Promise<void> {
  const orderId = txt(o.id);
  const num = `DF-${txt(o.numero)}`;
  const r = db.prepare("UPDATE orders SET confirmacion = 'no', estado = 'Cancelado', cancelado_cliente_at = datetime('now') WHERE id = ? AND estado != 'Cancelado'").run(orderId);
  if (!r.changes) return;
  db.prepare("UPDATE leads SET etiqueta = 'Seguimiento' WHERE id = ?").run(leadId);
  trazar(storeId, orderId, { etapa: 'pedido', nivel: 'warn', titulo: `Pedido CANCELADO por el cliente (${como})`, detalle: `${texto} · Si cambia de opinión, el asistente reactiva este mismo pedido.` });
  registrarLog(storeId, 'warn', 'pedido', `${num} quedó CANCELADO: el cliente ${como}${txt(o.origen) === 'shopify' ? ' (pedido de Shopify: cancélalo también en Shopify si hace falta)' : ''}.`, leadId);
  void etiquetar(storeId, orderId, ['no-confirmado', 'cancelado-por-cliente']);
  void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `${num} cancelado por el cliente ❌`, `${txt(o.cliente)} ${como}. El asistente le pregunta si fue por algo que se pueda arreglar.`, { url: '/' })).catch(() => {});
  void import('./correo.js').then((c) => c.correoATienda(storeId, 'pedidos', `${num} cancelado por el cliente`, `❌ ${num}: cancelado por el cliente`, [`${c.escHtml(txt(o.cliente))} ${c.escHtml(como)}. El pedido quedó en <b>Cancelado</b>.`, 'Si el cliente cambia de opinión, el asistente reactiva el mismo pedido.'])).catch(() => {});
}

/**
 * El cliente pide cancelar un pedido que YA confirmó. Si todavía no se despacha, queda
 * Cancelado. Si ya tiene guía o remisión, no se puede cancelar solo: se le avisa a la tienda
 * para que lo anule en Effi o Dropi. Devuelve false: el asistente le responde igual.
 */
export async function respuestaCancelacion(storeId: string, leadId: string, texto: string): Promise<boolean> {
  if (!pideCancelar(texto)) return false;
  const o = db.prepare(`SELECT * FROM orders WHERE store_id = ? AND lead_id = ? AND estado NOT IN ('Cancelado','Entregado','Devuelto')
    AND COALESCE(confirmacion,'') != 'esperando' AND created_at > datetime('now','-10 days') ORDER BY created_at DESC LIMIT 1`).get(storeId, leadId) as Fila | undefined;
  if (!o) return false;
  const despachado = !!(txt(o.guia) || txt(o.effi_remision) || txt(o.dropi_order_id)) || !['Nuevo', 'Confirmado'].includes(txt(o.estado));
  if (!despachado) { await cancelarPorCliente(storeId, o, leadId, texto, 'pidió cancelar el pedido por WhatsApp'); return false; }
  const ya = db.prepare("UPDATE orders SET cancelacion_pedida_at = datetime('now') WHERE id = ? AND (COALESCE(cancelacion_pedida_at,'') = '' OR cancelacion_pedida_at < datetime('now','-1 day'))").run(txt(o.id));
  if (!ya.changes) return false;
  const num = `DF-${txt(o.numero)}`;
  const donde = txt(o.dropi_order_id) ? 'Dropi' : txt(o.effi_remision) || txt(o.effi_doc) ? 'Effi' : 'la transportadora';
  trazar(storeId, txt(o.id), { etapa: 'pedido', nivel: 'warn', titulo: 'El cliente pidió CANCELAR un pedido ya despachado', detalle: `${texto} · Tiene ${txt(o.guia) ? `guía ${txt(o.guia)}` : 'remisión'}: no se cancela solo. Anúlalo en ${donde} y luego márcalo Cancelado.` });
  registrarLog(storeId, 'warn', 'pedido', `${num}: el cliente pidió CANCELAR, pero el pedido ya está despachado (${txt(o.estado)}). Anúlalo en ${donde} y márcalo Cancelado.`, leadId);
  void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `${num}: el cliente quiere cancelar ⚠️`, `Ya está despachado: anúlalo en ${donde}.`, { url: '/' })).catch(() => {});
  return false;
}

/**
 * Red de seguridad: pedidos que siguen «esperando» aunque el último mensaje del cliente
 * (después de pedirle el «sí») fue un sí claro. Pasa si el mensaje llegó mientras se caía
 * algo, o si llegó por otro chat. Se revisa cada 10 minutos.
 */
export async function revisarConfirmacionesPerdidas(): Promise<number> {
  const filas = db.prepare(`SELECT id, store_id, lead_id, confirmacion_at FROM orders WHERE confirmacion = 'esperando' AND estado IN ('Nuevo','Confirmado')
    AND COALESCE(effi_remision,'') = '' AND COALESCE(dropi_order_id,'') = '' AND COALESCE(guia,'') = ''
    AND COALESCE(lead_id,'') != '' AND created_at > datetime('now','-7 days') LIMIT 200`).all() as { id: string; store_id: string; lead_id: string; confirmacion_at: string }[];
  let n = 0;
  for (const f of filas) {
    const desde = f.confirmacion_at || '1970-01-01';
    const m = db.prepare(`SELECT texto, created_at FROM messages WHERE lead_id = ? AND de = 'cliente' AND created_at >= ? ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(f.lead_id, desde) as { texto: string; created_at: string } | undefined;
    if (!m || !esSi(m.texto) || esNo(m.texto)) continue;
    // Que el sistema haya tenido tiempo de responder normal (3 min).
    if (Date.now() - new Date(m.created_at.replace(' ', 'T') + 'Z').getTime() < 3 * 60_000) continue;
    if (await confirmarPedidoCliente(f.store_id, f.id, m.texto, { titulo: 'Pedido confirmado: el cliente había dicho que sí (revisión automática)' })) n++;
  }
  return n;
}

/** Despacho automático del pedido confirmado (Effi por API, o simulado en modo prueba). */
async function despacharConfirmado(storeId: string, orderId: string): Promise<void> {
  const o = db.prepare('SELECT numero FROM orders WHERE id = ?').get(orderId) as { numero: number } | undefined;
  if (!o) return;
  try {
    if (cfgPedidosShopify(storeId).modoPrueba) {
      const guia = `PRUEBA${String(o.numero).padStart(6, '0')}`;
      db.prepare("UPDATE orders SET transportadora = 'Transportadora de prueba', guia = ?, estado = 'Guía generada' WHERE id = ?").run(guia, orderId);
      trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: 'Despacho simulado (modo prueba)', detalle: `Guía de prueba ${guia}: no se creó ninguna remisión ni guía real.` });
      const { avisarGuia } = await import('./avisoGuia.js');
      await avisarGuia(storeId, orderId).catch(() => null);
      return;
    }
    const ef = await import('./effiApi.js');
    const prov = (db.prepare("SELECT GROUP_CONCAT(DISTINCT COALESCE(p.despacho_proveedor,'')) pv FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = ?").get(orderId) as { pv: string | null }).pv || '';
    if (!prov.split(',').includes('dropi') && ef.effiApiListo(storeId)) {
      const r = await ef.despacharEffi(storeId, orderId, false, '', '', false, { auto: true });
      if ('error' in r) registrarLog(storeId, 'warn', 'despacho', `DF-${o.numero} confirmado pero no se pudo enviar a Effi: ${r.error}. Despáchalo desde el pedido.`);
      return;
    }
    registrarLog(storeId, 'info', 'despacho', `DF-${o.numero} confirmado por el cliente: despáchalo desde el pedido (Dropi elige transportadora al despachar).`);
  } catch (e) { console.error('[shopify] despacho automático', e); }
}

// ── Escrituras en Shopify ───────────────────────────────────────────────────

async function gqlTienda<T>(storeId: string, query: string, variables: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { credShopify, shopifyGQL } = await import('./shopify.js');
  const c = credShopify(storeId);
  if (!c) return { error: 'Shopify no está conectado.' };
  const r = await shopifyGQL<T>(c, query, variables);
  return r.ok ? { data: r.data } : { error: r.error };
}

/** Agrega etiquetas al pedido en Shopify. */
export async function etiquetar(storeId: string, orderId: string, tags: string[]): Promise<void> {
  const o = db.prepare('SELECT shopify_gid FROM orders WHERE id = ?').get(orderId) as { shopify_gid: string } | undefined;
  if (!o?.shopify_gid) return;
  const r = await gqlTienda<{ tagsAdd: { userErrors: { message: string }[] } }>(storeId, 'mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }', { id: o.shopify_gid, tags });
  const err = r.error || r.data?.tagsAdd.userErrors.map((e) => e.message).join(' · ');
  if (err) trazar(storeId, orderId, { etapa: 'pedido', nivel: 'warn', titulo: 'No se pudo etiquetar el pedido en Shopify', detalle: err });
}

/** Marca el pedido como enviado en Shopify con el número de guía. */
export async function marcarEnviadoShopify(storeId: string, orderId: string): Promise<boolean> {
  const o = db.prepare('SELECT shopify_gid, guia, transportadora, guia_url FROM orders WHERE id = ?').get(orderId) as { shopify_gid: string; guia: string; transportadora: string; guia_url: string } | undefined;
  if (!o?.shopify_gid || !o.guia) return false;
  const q = await gqlTienda<{ order: { fulfillmentOrders: { nodes: { id: string; status: string }[] } } | null }>(storeId,
    'query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }', { id: o.shopify_gid });
  if (q.error) { trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'No se pudo leer el pedido en Shopify', detalle: q.error }); return false; }
  const abiertas = (q.data?.order?.fulfillmentOrders.nodes || []).filter((f) => ['OPEN', 'IN_PROGRESS', 'SCHEDULED'].includes(f.status));
  if (!abiertas.length) { db.prepare('UPDATE orders SET shopify_fulfilled = 1 WHERE id = ?').run(orderId); return true; } // ya estaba enviado
  const r = await gqlTienda<{ fulfillmentCreate: { userErrors: { message: string }[] } }>(storeId,
    `mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { userErrors { message } } }`,
    { f: { lineItemsByFulfillmentOrder: abiertas.map((a) => ({ fulfillmentOrderId: a.id })), notifyCustomer: true, trackingInfo: { number: o.guia, company: o.transportadora || undefined, url: o.guia_url || undefined } } });
  const err = r.error || r.data?.fulfillmentCreate.userErrors.map((e) => e.message).join(' · ');
  if (err) { trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'No se pudo marcar enviado en Shopify', detalle: err }); return false; }
  db.prepare('UPDATE orders SET shopify_fulfilled = 1 WHERE id = ?').run(orderId);
  trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: 'Pedido marcado como enviado en Shopify', detalle: `Guía ${o.guia}${o.transportadora ? ' · ' + o.transportadora : ''}` });
  return true;
}

/** Cada 5 min: los pedidos de Shopify que ya tienen guía se marcan enviados allá. */
// ── Respaldo del webhook: traer pedidos recientes por la API ────────────────
// Si orders/create no llega (webhook rechazado, caído o tienda recién conectada),
// cada 5 min se consultan los pedidos recientes y se importan los que falten.

const Q_PEDIDOS = (conCliente: boolean) => `query($q: String!) {
  orders(first: 25, sortKey: CREATED_AT, reverse: true, query: $q) { nodes {
    id legacyResourceId name createdAt note displayFinancialStatus
    totalPriceSet { shopMoney { amount } }
    shippingLines(first: 5) { nodes { originalPriceSet { shopMoney { amount } } } }
    ${conCliente ? `phone
    shippingAddress { name address1 address2 city province phone }
    billingAddress { name phone }` : ''}
    lineItems(first: 50) { nodes { title variantTitle quantity sku originalUnitPriceSet { shopMoney { amount } } } }
  } } }`;

type Nodo = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Pedido GraphQL → misma forma del webhook (REST) que entiende importarPedido. */
function aFormaWebhook(n: Nodo): Fila {
  const dir = (a: Nodo | null | undefined) => (a ? { ...a } : undefined);
  return {
    id: n.legacyResourceId, admin_graphql_api_id: n.id, name: n.name, note: n.note, created_at: n.createdAt,
    financial_status: String(n.displayFinancialStatus || '').toLowerCase(),
    total_price: n.totalPriceSet?.shopMoney?.amount, phone: n.phone,
    shipping_address: dir(n.shippingAddress), billing_address: dir(n.billingAddress),
    customer: n.customer ? { first_name: n.customer.firstName, last_name: n.customer.lastName, phone: n.customer.phone } : undefined,
    shipping_lines: (n.shippingLines?.nodes || []).map((x: Nodo) => ({ price: x.originalPriceSet?.shopMoney?.amount })),
    line_items: (n.lineItems?.nodes || []).map((x: Nodo) => ({ title: x.title, variant_title: x.variantTitle, quantity: x.quantity, sku: x.sku, price: x.originalUnitPriceSet?.shopMoney?.amount })),
  };
}

const avisos = new Map<string, string>(); // no repetir el mismo aviso en el registro de la tienda
function avisarUnaVez(storeId: string, clave: string, msg: string): void {
  if (avisos.get(storeId + clave) === msg) return;
  avisos.set(storeId + clave, msg);
  registrarLog(storeId, 'warn', 'shopify', msg);
}

/** Última revisión automática de pedidos por tienda (para mostrar en Integraciones por qué no llegan). */
export interface RevisionShopify { at: string; ok: boolean; nuevos: number; revisados: number; error: string; aviso: string }
const revisiones = new Map<string, RevisionShopify>();
export function ultimaRevisionShopify(storeId: string): RevisionShopify | null { return revisiones.get(storeId) || null; }
export function olvidarRevisionShopify(storeId: string): void { revisiones.delete(storeId); avisos.delete(storeId + 'lectura'); }

/** Desde cuándo traer pedidos solos: la fecha en que se conectó la tienda (no se mueve al cambiar opciones). */
function conectadaDesde(storeId: string, shop: string): number {
  const cfg = pj<Record<string, unknown>>((db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { config: string } | undefined)?.config || '', {});
  const fecha = (s: string) => Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (cfg.conectado_at) return fecha(String(cfg.conectado_at));
  const inst = (db.prepare('SELECT instalada_at FROM shopify_tiendas WHERE shop = ?').get(shop) as { instalada_at: string } | undefined)
    || (db.prepare("SELECT updated_at AS instalada_at FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { instalada_at: string } | undefined);
  return inst ? fecha(inst.instalada_at) : 0;
}

/** Trae los pedidos de Shopify creados desde que se conectó la tienda (o la última semana, desde el botón) que aún no estén en DealFlow. */
export async function traerPedidosRecientes(storeId: string, ultimaSemana = false): Promise<{ nuevos: number; revisados: number; aviso: string } | { error: string }> {
  const r = await traerPedidosRecientes0(storeId, ultimaSemana).catch((e) => ({ error: `Error interno: ${e instanceof Error ? e.message : e}` }));
  const at = new Date().toISOString();
  if ('error' in r) {
    revisiones.set(storeId, { at, ok: false, nuevos: 0, revisados: 0, error: r.error, aviso: '' });
    if (r.error !== 'Conecta Shopify primero.') avisarUnaVez(storeId, 'lectura', `No se pudieron traer los pedidos de Shopify: ${r.error}`);
  } else {
    revisiones.set(storeId, { at, ok: true, nuevos: r.nuevos, revisados: r.revisados, error: '', aviso: r.aviso });
    avisos.delete(storeId + 'lectura');
  }
  return r;
}

async function traerPedidosRecientes0(storeId: string, ultimaSemana: boolean): Promise<{ nuevos: number; revisados: number; aviso: string } | { error: string }> {
  const { credShopify, shopifyGQL } = await import('./shopify.js');
  const cred = credShopify(storeId);
  if (!cred) return { error: 'Conecta Shopify primero.' };
  const inst = conectadaDesde(storeId, cred.shop);
  const desde = new Date(Math.max(Date.now() - 7 * 86400_000, !ultimaSemana && inst ? inst - 3600_000 : 0));
  const q = `created_at:>='${desde.toISOString()}'`;
  let aviso = '';
  let r = await shopifyGQL<{ orders: { nodes: Nodo[] } }>(cred, Q_PEDIDOS(true), { q });
  if (!r.ok) {
    // Sin aprobación de datos protegidos, Shopify niega nombre/teléfono/dirección: se trae el pedido sin ellos.
    const r2 = await shopifyGQL<{ orders: { nodes: Nodo[] } }>(cred, Q_PEDIDOS(false), { q });
    if (!r2.ok) return { error: `Shopify no dejó leer los pedidos: ${r.error || r2.error}` };
    aviso = `Shopify no entrega nombre, teléfono ni dirección del comprador: falta que Shopify apruebe el "Acceso a datos de cliente protegidos" de la app DealFlow. Sin teléfono no se puede confirmar por WhatsApp. (Detalle de Shopify: ${String(r.error || 'sin detalle').slice(0, 200)})`;
    avisarUnaVez(storeId, 'datos', aviso);
    r = r2;
  }
  const nodos = r.data?.orders.nodes || [];
  let nuevos = 0;
  for (const n of nodos) {
    const ya = db.prepare('SELECT 1 FROM orders WHERE store_id = ? AND shopify_id = ?').get(storeId, String(n.legacyResourceId));
    if (ya || descartado(storeId, String(n.legacyResourceId))) continue;
    const reciente = Date.now() - Date.parse(n.createdAt) < 24 * 3600_000;
    if (await importarPedido(storeId, cred.shop, aFormaWebhook(n), reciente)) nuevos++;
  }
  if (nuevos) registrarLog(storeId, 'info', 'shopify', `${nuevos} pedido(s) de Shopify traídos por la API (el aviso automático de Shopify no había llegado).`);
  return { nuevos, revisados: nodos.length, aviso };
}

/** Revisa que el webhook de pedidos esté suscrito; si Shopify lo rechaza, lo deja en el registro de la tienda. */
async function revisarWebhook(storeId: string, shop: string): Promise<void> {
  const { credShopify } = await import('./shopify.js');
  const cred = credShopify(storeId);
  if (!cred || cred.via !== 'app') return; // las conexiones manuales no tienen webhook: se revisan cada 5 min
  const { asegurarWebhookPedidos, tokenVigente } = await import('./shopifyApp.js');
  const tk = await tokenVigente(shop);
  if (!tk) return;
  const err = await asegurarWebhookPedidos(shop, tk);
  if (err) avisarUnaVez(storeId, 'webhook', `Shopify no aceptó el aviso automático de pedidos nuevos (${err.slice(0, 200)}). Mientras tanto DealFlow revisa los pedidos cada 5 minutos.`);
}

let vueltasPedidos = 0;
export function iniciarEnviosShopify(): void {
  const traer = async () => {
    const tiendas = db.prepare("SELECT store_id, shop FROM shopify_tiendas WHERE store_id IS NOT NULL AND store_id != '' AND desinstalada_at IS NULL").all() as { store_id: string; shop: string }[];
    for (const t of tiendas) {
      try {
        if (vueltasPedidos % 12 === 0) await revisarWebhook(t.store_id, t.shop); // cada hora
        await traerPedidosRecientes(t.store_id);
      } catch (e) { console.error('[shopify] trayendo pedidos', e); }
    }
    // Tiendas conectadas a MANO (app personalizada del comercio, mientras la app pública no
    // esté aprobada): no tienen webhook, así que sus pedidos se traen por la API.
    const conApp = new Set(tiendas.map((t) => t.store_id));
    const manuales = db.prepare("SELECT store_id, config FROM store_integrations WHERE tipo = 'shopify'").all() as { store_id: string; config: string }[];
    for (const m of manuales) {
      if (conApp.has(m.store_id) || pj<Record<string, string>>(m.config, {}).via === 'app') continue;
      try { await traerPedidosRecientes(m.store_id); } catch (e) { console.error('[shopify] trayendo pedidos (manual)', e); }
    }
    vueltasPedidos++;
  };
  setTimeout(() => void traer(), 45_000);
  setInterval(() => void traer(), 5 * 60_000);
  const vuelta = async () => {
    const pend = db.prepare("SELECT id, store_id FROM orders WHERE origen = 'shopify' AND shopify_gid != '' AND COALESCE(guia,'') != '' AND shopify_fulfilled = 0 AND created_at > datetime('now','-30 days') LIMIT 50").all() as { id: string; store_id: string }[];
    for (const p of pend) { try { await marcarEnviadoShopify(p.store_id, p.id); } catch (e) { console.error('[shopify] envío', e); } }
  };
  setTimeout(() => void vuelta(), 60_000);
  setInterval(() => void vuelta(), 5 * 60_000);
}

// ── Privacidad (webhooks obligatorios) ──────────────────────────────────────

/** customers/redact: borra los datos del comprador en los pedidos indicados. */
export function borrarDatosCliente(shop: string, body: Fila): number {
  const ids = (Array.isArray(body.orders_to_redact) ? body.orders_to_redact : []).map(String);
  const tel = txt(((body.customer || {}) as Fila).phone).replace(/\D/g, '').slice(-10);
  let n = 0;
  const upd = db.prepare("UPDATE orders SET cliente = 'Cliente eliminado', tel = '', direccion = '', nota = '' WHERE shopify_shop = ? AND shopify_id = ?");
  for (const id of ids) n += upd.run(shop, id).changes;
  if (tel.length === 10) n += db.prepare("UPDATE orders SET cliente = 'Cliente eliminado', tel = '', direccion = '', nota = '' WHERE shopify_shop = ? AND REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ?").run(shop, `%${tel}`).changes;
  return n;
}
/** shop/redact: borra los datos de compradores de todos los pedidos de esa tienda Shopify. */
export function borrarDatosTienda(shop: string): number {
  return db.prepare("UPDATE orders SET cliente = 'Cliente eliminado', tel = '', direccion = '', nota = '' WHERE shopify_shop = ?").run(shop).changes;
}
/** customers/data_request: qué datos de ese comprador tenemos (para enviárselos al comercio). */
export function datosCliente(shop: string, body: Fila): Fila[] {
  const ids = (Array.isArray(body.orders_requested) ? body.orders_requested : []).map(String);
  if (!ids.length) return [];
  const q = db.prepare('SELECT numero, cliente, tel, ciudad, departamento, direccion, total, estado, created_at FROM orders WHERE shopify_shop = ? AND shopify_id = ?');
  return ids.map((id) => q.get(shop, id) as Fila | undefined).filter(Boolean) as Fila[];
}

/**
 * La confirmación es obligatoria: las que no salieron (WhatsApp desconectado, límite de
 * mensajes, plantilla aún sin aprobar…) se reintentan solas cada 15 min, hasta 6 veces,
 * mientras el pedido siga sin despachar.
 */
async function reintentarConfirmaciones() {
  const filas = db.prepare(`SELECT id, store_id FROM orders WHERE confirmacion = 'fallo' AND confirmacion_intentos < 6 AND estado = 'Nuevo'
    AND COALESCE(effi_remision,'') = '' AND COALESCE(dropi_order_id,'') = '' AND COALESCE(guia,'') = '' AND COALESCE(tel,'') != ''
    AND created_at > datetime('now','-2 days') ORDER BY created_at LIMIT 40`).all() as { id: string; store_id: string }[];
  for (const f of filas) {
    try { await enviarConfirmacion(f.store_id, f.id); } catch (e) { console.error('[confirmacion] reintento', e); }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
if (process.env.NODE_ENV === 'production') setInterval(() => void reintentarConfirmaciones(), 15 * 60_000).unref();
setInterval(() => void revisarConfirmacionesPerdidas().then((n) => { if (n) console.log(`[pedidos] ${n} pedido(s) confirmados por la revisión de «sí» perdidos`); }).catch((e) => console.error('[pedidos] revisión de confirmaciones', e)), 10 * 60_000).unref();
