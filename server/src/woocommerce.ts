import { db, pj } from './db.js';

/**
 * Integración con WooCommerce como PUENTE hacia Effi.
 *
 * Effi (ERP/logística) no expone una API pública, pero sí se sincroniza con
 * tiendas WooCommerce. Así que DealFlow crea el pedido en el WooCommerce de la
 * tienda; Effi lo recoge de ahí, genera la guía y despacha, y escribe de vuelta
 * el estado y el número de guía en el pedido de Woo, que nosotros leemos.
 *
 * La API REST de WooCommerce sí es pública y estable:
 *   Base: https://tu-tienda.com/wp-json/wc/v3
 *   Auth: consumer_key + consumer_secret (por HTTPS, como query params).
 *   Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
 */

interface Cred { base: string; ck: string; cs: string }

/** Lee las credenciales de WooCommerce que guardó la tienda. */
export function credenciales(storeId: string): Cred | null {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'woocommerce'").get(storeId) as { config: string } | undefined;
  if (!row) return null;
  const cfg = pj<Record<string, string>>(row.config, {});
  const url = String(cfg.url || '').trim().replace(/\/+$/, '');
  const ck = String(cfg.consumerKey || '').trim();
  const cs = String(cfg.consumerSecret || '').trim();
  if (!url || !ck || !cs) return null;
  // Normaliza a la base de la API REST.
  const base = /\/wp-json\/wc\/v3$/.test(url) ? url : `${url.replace(/\/wp-json.*$/, '')}/wp-json/wc/v3`;
  return { base, ck, cs };
}

function url(c: Cred, ruta: string, params: Record<string, string> = {}): string {
  const u = new URL(`${c.base}${ruta}`);
  u.searchParams.set('consumer_key', c.ck);
  u.searchParams.set('consumer_secret', c.cs);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function woo<T>(c: Cred, ruta: string, init?: RequestInit, params?: Record<string, string>): Promise<{ ok: boolean; status: number; body: T & { message?: string; code?: string } }> {
  const res = await fetch(url(c, ruta, params), { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string };
  return { ok: res.ok, status: res.status, body };
}

/** Verifica que las credenciales sirvan (pide 1 pedido). */
export async function verificar(storeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = credenciales(storeId);
  if (!c) return { ok: false, error: 'Faltan los datos de WooCommerce (URL, Consumer Key y Secret).' };
  try {
    const r = await woo<unknown[]>(c, '/orders', undefined, { per_page: '1' });
    if (!r.ok) return { ok: false, error: r.body.message || `WooCommerce respondió ${r.status}. Revisa la URL y las llaves.` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos conectar con tu WooCommerce. Revisa la URL.' };
  }
}

interface ItemPedido { qty: number; nombre: string; precio: number }
interface Pedido { cliente: string; ciudad: string; departamento: string; tel: string; direccion: string; nota: string; envio: number }

const money = (cents: number) => (cents / 1).toFixed(2); // los precios ya vienen en pesos enteros

/**
 * Crea el pedido en WooCommerce. Intenta mapear cada ítem con un producto de
 * Woo por SKU (para que Effi lo despache); los que no tengan SKU van como línea
 * de cargo + en la nota, para que el total y el detalle igual lleguen.
 */
export async function crearPedido(
  storeId: string,
  order: Pedido,
  items: ItemPedido[],
  skusPorNombre: Record<string, string>,
): Promise<{ wooId: string; numero: string } | { error: string }> {
  const c = credenciales(storeId);
  if (!c) return { error: 'Conecta WooCommerce en Integraciones antes de enviar pedidos.' };

  const lineItems: Record<string, unknown>[] = [];
  const feeLines: Record<string, unknown>[] = [];
  const sinMapear: string[] = [];

  for (const it of items) {
    const sku = (skusPorNombre[it.nombre] || '').trim();
    let productId = 0;
    if (sku) {
      try {
        const r = await woo<{ id: number }[]>(c, '/products', undefined, { sku, per_page: '1' });
        if (r.ok && Array.isArray(r.body) && r.body[0]?.id) productId = r.body[0].id;
      } catch { /* si falla la búsqueda, cae al fallback */ }
    }
    if (productId) {
      lineItems.push({ product_id: productId, quantity: it.qty });
    } else {
      // Sin producto en Woo: lo mandamos como cargo con el total, y lo anotamos.
      feeLines.push({ name: `${it.qty}× ${it.nombre}`, total: money(it.precio * it.qty) });
      sinMapear.push(`${it.qty}× ${it.nombre}`);
    }
  }

  const [nombre, ...resto] = order.cliente.trim().split(' ');
  const payload: Record<string, unknown> = {
    payment_method: 'cod',
    payment_method_title: 'Pago contra entrega',
    set_paid: false,
    status: 'processing',
    billing: { first_name: nombre || order.cliente, last_name: resto.join(' '), address_1: order.direccion, city: order.ciudad, state: order.departamento, phone: order.tel },
    shipping: { first_name: nombre || order.cliente, last_name: resto.join(' '), address_1: order.direccion, city: order.ciudad, state: order.departamento },
    line_items: lineItems,
    fee_lines: feeLines,
    shipping_lines: order.envio > 0 ? [{ method_id: 'flat_rate', method_title: 'Envío', total: money(order.envio) }] : [],
    customer_note: [order.nota, sinMapear.length ? `Productos: ${sinMapear.join(', ')}` : ''].filter(Boolean).join(' · '),
  };
  // WooCommerce rechaza un pedido sin ninguna línea; si todo cayó a fee_lines, ya está cubierto.
  if (!lineItems.length && !feeLines.length) return { error: 'El pedido no tiene productos.' };

  try {
    const r = await woo<{ id: number; number: string }>(c, '/orders', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok || !r.body.id) return { error: r.body.message || 'WooCommerce no aceptó el pedido.' };
    return { wooId: String(r.body.id), numero: String(r.body.number || r.body.id) };
  } catch {
    return { error: 'No pudimos crear el pedido en WooCommerce.' };
  }
}

const ESTADO_WOO: Record<string, string> = {
  pending: 'Pendiente de pago', processing: 'En preparación', 'on-hold': 'En espera',
  completed: 'Entregado', cancelled: 'Cancelado', refunded: 'Devuelto', failed: 'Fallido',
  shipped: 'Enviado', delivered: 'Entregado',
};

/** Busca el número de guía dentro de las notas/meta que Effi escribe en el pedido. */
function extraerGuia(meta: { key?: string; value?: unknown }[]): string {
  for (const m of meta || []) {
    const k = String(m.key || '').toLowerCase();
    if (/gu[ií]a|guide|tracking|rastreo|numero_guia|shipment/.test(k)) {
      const v = m.value;
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
  }
  return '';
}

/** Lee el estado y la guía de un pedido en Woo (que Effi va actualizando). */
export async function estadoPedido(storeId: string, wooId: string): Promise<{ estado: string; guia: string } | { error: string }> {
  const c = credenciales(storeId);
  if (!c) return { error: 'Conecta WooCommerce en Integraciones.' };
  try {
    const r = await woo<{ status: string; meta_data: { key?: string; value?: unknown }[] }>(c, `/orders/${encodeURIComponent(wooId)}`);
    if (!r.ok) return { error: r.body.message || 'No pudimos consultar el pedido en WooCommerce.' };
    return { estado: ESTADO_WOO[r.body.status] || r.body.status || '', guia: extraerGuia(r.body.meta_data) };
  } catch {
    return { error: 'No pudimos consultar el pedido en WooCommerce.' };
  }
}

export interface ItemInventario { sku: string; nombre: string; stock: number | null }

/** Trae el inventario de WooCommerce (para sincronizar el stock por SKU). */
export async function inventario(storeId: string): Promise<{ items: ItemInventario[] } | { error: string }> {
  const c = credenciales(storeId);
  if (!c) return { error: 'Conecta WooCommerce en Integraciones.' };
  try {
    const items: ItemInventario[] = [];
    // Paginamos hasta 5 páginas de 100 (500 productos) para no colgar.
    for (let page = 1; page <= 5; page++) {
      const r = await woo<{ sku?: string; name?: string; stock_quantity?: number | null }[]>(c, '/products', undefined, { per_page: '100', page: String(page) });
      if (!r.ok) return { error: r.body.message || 'No pudimos leer el inventario de WooCommerce.' };
      if (!Array.isArray(r.body) || !r.body.length) break;
      for (const p of r.body) items.push({ sku: String(p.sku || ''), nombre: String(p.name || ''), stock: p.stock_quantity ?? null });
      if (r.body.length < 100) break;
    }
    return { items };
  } catch {
    return { error: 'No pudimos leer el inventario de WooCommerce.' };
  }
}

/** Actualiza el stock local (products.stock por SKU) con lo que dice WooCommerce. */
export async function sincronizarInventario(storeId: string): Promise<{ actualizados: number } | { error: string }> {
  const inv = await inventario(storeId);
  if ('error' in inv) return inv;
  let actualizados = 0;
  const upd = db.prepare('UPDATE variants SET stock = ? WHERE product_id IN (SELECT id FROM products WHERE store_id = ? AND sku = ? AND sku != \'\')');
  for (const it of inv.items) {
    if (!it.sku || it.stock == null) continue;
    const r = upd.run(it.stock, storeId, it.sku);
    if (r.changes) actualizados += r.changes;
  }
  return { actualizados };
}
