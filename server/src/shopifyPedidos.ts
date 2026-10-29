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

for (const col of ["shopify_id TEXT NOT NULL DEFAULT ''", "shopify_shop TEXT NOT NULL DEFAULT ''", "shopify_gid TEXT NOT NULL DEFAULT ''", "confirmacion TEXT NOT NULL DEFAULT ''", "shopify_fulfilled INTEGER NOT NULL DEFAULT 0", "confirmacion_error TEXT NOT NULL DEFAULT ''"]) {
  try { db.exec(`ALTER TABLE orders ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_shopify ON orders(store_id, shopify_id)");

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
    texto = `Hola ${nombre} 👋 Recibimos tu pedido ${numDF} en ${tienda}.\n\n🛍️ Pediste: ${productos}\n💰 Total: ${total}\n\n📦 Datos de envío\n👤 Nombre: ${unaLinea(o.cliente, 80)}\n📞 Celular: ${celular || '—'}\n🏠 Dirección: ${unaLinea(o.direccion, 200)}\n🏙️ Ciudad: ${unaLinea(o.ciudad, 60)}\n📍 Departamento: ${unaLinea(o.departamento, 60)}\n\n¿Confirmas que los datos están correctos y que te lo enviemos? Responde *Sí* o *No*.`;
    r = await sendWhatsappText(storeId, wa, texto, wa);
  }
  db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'bot', ?)").run(mid, leadId, texto);
  marcarEnviado(mid, r);
  if (r.ok) {
    contarProactivo(storeId, wa);
    db.prepare("UPDATE orders SET confirmacion = 'esperando', confirmacion_error = '' WHERE id = ?").run(orderId);
  } else {
    fallo(pl ? `WhatsApp rechazó la plantilla: ${r.error || 'error desconocido'}`
      : `Ninguna plantilla de confirmación ("${PLANTILLA_CONFIRMACION_COMPLETA}" o "${PLANTILLA_CONFIRMACION}") está aprobada en Meta y el cliente no te ha escrito en las últimas 24 h, así que WhatsApp no deja escribirle. Apruébala en Plantillas o llámalo/escríbele primero.`);
  }
  trazar(storeId, orderId, { etapa: 'pedido', nivel: r.ok ? 'ok' : 'warn', titulo: r.ok ? 'Confirmación enviada por WhatsApp (Sí / No)' : 'No se pudo enviar la confirmación', detalle: r.ok ? (pl ? `Plantilla ${completa ? PLANTILLA_CONFIRMACION_COMPLETA : PLANTILLA_CONFIRMACION}${completa ? ' (con todos los datos)' : ' (corta: la completa aún no está aprobada)'}` : 'Texto (ventana de 24 h abierta)') : `${r.error || ''}${pl ? '' : ` · Ninguna plantilla de confirmación ("${PLANTILLA_CONFIRMACION_COMPLETA}" o "${PLANTILLA_CONFIRMACION}") está aprobada en Meta para esta tienda.`}` });
  return { ok: r.ok, detalle: r.error || '' };
}

// Sí / No del comprador (botones de la plantilla o escrito a mano).
const limpio = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s👍✅❌]/gu, ' ').replace(/\s+/g, ' ').trim();
const SI = new Set(['si', 'sii', 'siii', 'confirmo', 'confirmado', 'confirmar', 'dale', 'listo', 'ok', 'okay', 'correcto', 'claro', 'perfecto', 'afirmativo', 'enviamelo', 'envialo', '👍', '✅']);
const NO = new Set(['no', 'nop', 'nel', 'cancelar', 'cancela', 'cancelalo', 'cancelado', '❌']);
const esSi = (t: string) => { const w = limpio(t).split(' '); return SI.has(w[0]) || /\b(si confirmo|de una|si senor|si senora)\b/.test(limpio(t)); };
const esNo = (t: string) => { const l = limpio(t); return NO.has(l.split(' ')[0]) || /\b(ya no|no quiero|no lo quiero|no gracias|cancel)/.test(l); };
const reintentos = new Map<string, number>();

/**
 * Respuesta del comprador a la confirmación. Devuelve true si la manejó (y el bot
 * no debe contestar por su cuenta).
 */
export async function respuestaConfirmacion(storeId: string, leadId: string, texto: string): Promise<boolean> {
  const o = db.prepare(`SELECT * FROM orders WHERE store_id = ? AND lead_id = ? AND origen IN ('shopify','landing') AND confirmacion = 'esperando'
    AND created_at > datetime('now','-7 days') ORDER BY created_at DESC LIMIT 1`).get(storeId, leadId) as Fila | undefined;
  if (!o) return false;
  const t = txt(texto).trim();
  const { sendWhatsappText, marcarEnviado } = await import('./wa.js');
  const lead = db.prepare('SELECT wa_id, tel, nombre FROM leads WHERE id = ?').get(leadId) as { wa_id: string; tel: string; nombre: string };
  const decir = async (msg: string) => {
    const mid = uid();
    db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'bot', ?)").run(mid, leadId, msg);
    marcarEnviado(mid, await sendWhatsappText(storeId, lead.wa_id || lead.tel, msg, lead.tel));
  };
  const orderId = txt(o.id);
  const num = `DF-${txt(o.numero)}`;
  const nombre = txt(o.cliente).split(' ')[0];

  if (esSi(t) && !esNo(t)) {
    db.prepare("UPDATE orders SET confirmacion = 'si', estado = CASE WHEN estado = 'Nuevo' THEN 'Confirmado' ELSE estado END WHERE id = ?").run(orderId);
    trazar(storeId, orderId, { etapa: 'pedido', nivel: 'ok', titulo: 'El cliente confirmó el pedido por WhatsApp', detalle: texto });
    await decir(`¡Gracias${nombre ? ', ' + nombre : ''}! 🎉 Tu pedido quedó confirmado. Apenas salga te enviamos por aquí el número de guía. 🚚`);
    void etiquetar(storeId, orderId, ['confirmado-whatsapp']);
    // Landing: despacha solo si esa landing lo tiene activo. Shopify: según su configuración.
    const auto = txt(o.origen) === 'landing'
      ? (await import('./landings.js')).autoDespachoDeLanding(txt(o.landing_id))
      : cfgPedidosShopify(storeId).autoDespacho;
    if (auto) void despacharConfirmado(storeId, orderId);
    return true;
  }
  if (esNo(t)) {
    db.prepare("UPDATE orders SET confirmacion = 'no' WHERE id = ?").run(orderId);
    // El chat queda para el equipo: el bot no contesta, una persona le pregunta qué pasó.
    db.prepare("UPDATE leads SET asignado = 'Vendedor', etiqueta = 'Seguimiento' WHERE id = ?").run(leadId);
    trazar(storeId, orderId, { etapa: 'pedido', nivel: 'warn', titulo: 'El cliente respondió que NO confirma el pedido', detalle: `${texto} · El chat quedó asignado al equipo.` });
    registrarLog(storeId, 'warn', 'pedido', `${num}: el cliente no confirmó el pedido${txt(o.origen) === 'landing' ? ' de la landing' : ' de Shopify'}. Escríbele desde el Inbox.`, leadId);
    void etiquetar(storeId, orderId, ['no-confirmado']);
    void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `${num} no confirmado ❌`, `${txt(o.cliente)} respondió que no. Escríbele desde el Inbox.`, { url: '/' })).catch(() => {});
    void import('./correo.js').then((c) => c.correoATienda(storeId, 'pedidos', `${num} no confirmado`, `❌ ${num}: el cliente no confirmó`, [`${c.escHtml(txt(o.cliente))} respondió que <b>no</b> confirma el pedido de Shopify.`, 'El chat quedó asignado a tu equipo: escríbele desde el Inbox.'])).catch(() => {});
    return true;
  }
  // Ni sí ni no: se le pide UNA vez que elija; después, el asistente conversa normal.
  const n = reintentos.get(orderId) || 0;
  if (n === 0) {
    reintentos.set(orderId, 1);
    await decir(`Para enviarte tu pedido ${num} necesito que me confirmes: ¿lo enviamos? Responde *Sí* o *No* 🙏`);
    return true;
  }
  return false;
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
      const r = await ef.despacharEffi(storeId, orderId);
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
    billingAddress { name phone }
    customer { firstName lastName phone }` : ''}
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

/** Trae los pedidos de Shopify creados desde que se conectó la tienda (o la última semana, desde el botón) que aún no estén en DealFlow. */
export async function traerPedidosRecientes(storeId: string, ultimaSemana = false): Promise<{ nuevos: number; revisados: number; aviso: string } | { error: string }> {
  const { credShopify, shopifyGQL } = await import('./shopify.js');
  const cred = credShopify(storeId);
  if (!cred) return { error: 'Conecta Shopify primero.' };
  const inst = (db.prepare('SELECT instalada_at FROM shopify_tiendas WHERE shop = ?').get(cred.shop) as { instalada_at: string } | undefined)
    || (db.prepare("SELECT updated_at AS instalada_at FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { instalada_at: string } | undefined);
  const desde = new Date(Math.max(Date.now() - 7 * 86400_000, !ultimaSemana && inst ? Date.parse(inst.instalada_at.replace(' ', 'T') + 'Z') - 3600_000 : 0));
  const q = `created_at:>='${desde.toISOString()}'`;
  let aviso = '';
  let r = await shopifyGQL<{ orders: { nodes: Nodo[] } }>(cred, Q_PEDIDOS(true), { q });
  if (!r.ok) {
    // Sin aprobación de datos protegidos, Shopify niega nombre/teléfono/dirección: se trae el pedido sin ellos.
    const r2 = await shopifyGQL<{ orders: { nodes: Nodo[] } }>(cred, Q_PEDIDOS(false), { q });
    if (!r2.ok) return { error: `Shopify no dejó leer los pedidos: ${r.error || r2.error}` };
    aviso = 'Shopify no entrega nombre, teléfono ni dirección del comprador: falta que Shopify apruebe el "Acceso a datos de cliente protegidos" de la app DealFlow. Sin teléfono no se puede confirmar por WhatsApp.';
    avisarUnaVez(storeId, 'datos', aviso);
    r = r2;
  }
  const nodos = r.data?.orders.nodes || [];
  let nuevos = 0;
  for (const n of nodos) {
    const ya = db.prepare('SELECT 1 FROM orders WHERE store_id = ? AND shopify_id = ?').get(storeId, String(n.legacyResourceId));
    if (ya) continue;
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
  if (!cred?.token) return;
  const { asegurarWebhookPedidos } = await import('./shopifyApp.js');
  const err = await asegurarWebhookPedidos(shop, cred.token);
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
