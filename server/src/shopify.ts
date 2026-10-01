import { db, pj } from './db.js';

/**
 * Integración con Shopify por su Admin API (GraphQL).
 *
 * A diferencia de Effi (donde DealFlow SE HACE PASAR por la tienda WooCommerce),
 * aquí Shopify ES la tienda y la fuente de verdad: DealFlow la CONSUME, igual que
 * el conector directo de Dropi. El comerciante crea una "custom app" en su panel de
 * Shopify, le da permisos (read_products, read/write_inventory, read/write_orders),
 * la instala y copia el Admin API access token (shpat_…) + su dominio myshopify.
 *
 * Auth: cada petición lleva el header `X-Shopify-Access-Token: <token>`.
 * Base: https://<tienda>.myshopify.com/admin/api/<versión>/graphql.json
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

export interface ShopifyCred { shop: string; token: string }

/** Normaliza el dominio a la forma "mitienda.myshopify.com" (sin https ni barras). */
export function normalizarShop(input: string): string {
  let s = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!s) return '';
  if (!s.includes('.')) s = `${s}.myshopify.com`;     // "mitienda" → "mitienda.myshopify.com"
  return s;
}

/** Config de la integración Shopify de una tienda (store_integrations tipo 'shopify'). */
export function credShopify(storeId: string): ShopifyCred | null {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { config: string } | undefined;
  if (!row) return null;
  const cfg = pj<Record<string, string>>(row.config, {});
  const shop = normalizarShop(cfg.shop || '');
  const token = String(cfg.token || '').trim();
  if (!shop || !token) return null;
  return { shop, token };
}

interface GraphResp<T> { data?: T; errors?: { message: string }[] }

/** Llama al Admin API (GraphQL) de una tienda Shopify. */
async function shopifyGQL<T>(cred: ShopifyCred, query: string, variables?: Record<string, unknown>): Promise<{ ok: boolean; data?: T; error?: string; http: number }> {
  try {
    const res = await fetch(`https://${cred.shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': cred.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: variables || {} }),
    });
    const body = (await res.json().catch(() => ({}))) as GraphResp<T>;
    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403
        ? 'Token inválido o sin permisos. Revisa el Admin API access token y los scopes de la app.'
        : `Shopify respondió ${res.status}.`;
      return { ok: false, error: msg, http: res.status };
    }
    if (body.errors?.length) return { ok: false, error: body.errors.map((e) => e.message).join(' · '), http: res.status };
    return { ok: true, data: body.data, http: res.status };
  } catch {
    return { ok: false, error: 'No pudimos conectar con Shopify.', http: 0 };
  }
}

/** Prueba la conexión: devuelve el nombre de la tienda si el token sirve. */
export async function probarShopify(shop: string, token: string): Promise<{ ok: true; nombre: string } | { ok: false; error: string }> {
  const cred: ShopifyCred = { shop: normalizarShop(shop), token: String(token || '').trim() };
  if (!cred.shop || !cred.token) return { ok: false, error: 'Faltan el dominio de la tienda y/o el token.' };
  const r = await shopifyGQL<{ shop: { name: string } }>(cred, '{ shop { name } }');
  if (!r.ok || !r.data?.shop) return { ok: false, error: r.error || 'No pudimos validar la tienda.' };
  return { ok: true, nombre: r.data.shop.name };
}

export interface VarShopify { variantId: string; productId: string; sku: string; titulo: string; precio: number; stock: number | null }

/** Busca una variante por SKU exacto (GraphQL `productVariants(query:"sku:...")`). */
export async function buscarVarPorSku(cred: ShopifyCred, sku: string): Promise<VarShopify | null> {
  const q = `query($q:String!){ productVariants(first:1, query:$q){ edges{ node{ id sku title price inventoryQuantity product{ id title } } } } }`;
  const r = await shopifyGQL<{ productVariants: { edges: { node: { id: string; sku: string; title: string; price: string; inventoryQuantity: number | null; product: { id: string; title: string } } }[] } }>(
    cred, q, { q: `sku:'${String(sku).replace(/'/g, '')}'` },
  );
  const n = r.data?.productVariants?.edges?.[0]?.node;
  if (!n) return null;
  return { variantId: n.id, productId: n.product.id, sku: n.sku || '', titulo: `${n.product.title}${n.title && n.title !== 'Default Title' ? ' - ' + n.title : ''}`, precio: Number(n.price) || 0, stock: n.inventoryQuantity };
}

export interface ItemPedido { qty: number; nombre: string; precio: number; sku?: string }
export interface PedidoShopify {
  cliente: string; tel: string; direccion: string; ciudad: string; departamento: string;
  total: number; envio: number; nota: string; numeroDF: string | number; origen: string;
  items: ItemPedido[];
}

/**
 * Crea un BORRADOR de pedido (draft order) en Shopify. Usamos borrador para no
 * disparar cobros/fulfillment automáticos: el comerciante lo revisa y completa en
 * Shopify. Cada ítem con SKU conocido se manda como variante real; el resto como
 * línea personalizada (útil para bundles tipo "lleva 3 paga 2"). El total acordado
 * se respeta con un descuento de ajuste si la suma de líneas no cuadra.
 */
export async function crearBorradorShopify(cred: ShopifyCred, p: PedidoShopify): Promise<{ ok: true; id: string; nombre: string; invoiceUrl: string; sinSku: string[] } | { ok: false; error: string }> {
  const lineItems: Record<string, unknown>[] = [];
  const sinSku: string[] = [];
  let sumaLineas = 0;
  for (const it of p.items) {
    const qty = Math.max(1, it.qty);
    let variante: VarShopify | null = null;
    if (it.sku) variante = await buscarVarPorSku(cred, it.sku);
    if (variante) {
      lineItems.push({ variantId: variante.variantId, quantity: qty });
      sumaLineas += qty * variante.precio;
    } else {
      // Línea personalizada (sin variante): nombre + precio tal cual.
      lineItems.push({ title: it.nombre, quantity: qty, originalUnitPrice: String(Math.max(0, it.precio)) });
      sumaLineas += qty * Math.max(0, it.precio);
      if (it.sku) sinSku.push(it.nombre);
    }
  }
  const [nombre, ...resto] = String(p.cliente || '').trim().split(' ');
  const input: Record<string, unknown> = {
    lineItems,
    note: `DealFlow DF-${p.numeroDF}${p.nota ? ' · ' + p.nota : ''}`,
    tags: ['DealFlow', `DF-${p.numeroDF}`, `origen:${p.origen || 'dealflow'}`],
    shippingAddress: {
      firstName: nombre || String(p.cliente || ''), lastName: resto.join(' '),
      address1: p.direccion || '', city: p.ciudad || '', province: p.departamento || '',
      country: 'Colombia', phone: p.tel || '',
    },
    shippingLine: { title: 'Envío', price: String(Math.max(0, p.envio || 0)) },
  };
  if (p.tel) input.phone = p.tel;
  // Si el total acordado (combo/bundle) es menor que la suma de líneas, aplicamos un
  // descuento de ajuste para que el borrador cuadre con lo cobrado al cliente.
  const objetivo = Math.max(0, (Number(p.total) || 0) - Math.max(0, p.envio || 0));
  if (objetivo > 0 && sumaLineas > objetivo) {
    input.appliedDiscount = { valueType: 'FIXED_AMOUNT', value: sumaLineas - objetivo, title: 'Ajuste combo DealFlow' };
  }

  const mut = `mutation($input: DraftOrderInput!){ draftOrderCreate(input:$input){ draftOrder{ id name invoiceUrl } userErrors{ field message } } }`;
  const r = await shopifyGQL<{ draftOrderCreate: { draftOrder: { id: string; name: string; invoiceUrl: string } | null; userErrors: { message: string }[] } }>(cred, mut, { input });
  if (!r.ok) return { ok: false, error: r.error || 'No pudimos crear el pedido en Shopify.' };
  const out = r.data?.draftOrderCreate;
  if (out?.userErrors?.length) return { ok: false, error: out.userErrors.map((e) => e.message).join(' · ') };
  const d = out?.draftOrder;
  if (!d) return { ok: false, error: 'Shopify no devolvió el pedido.' };
  return { ok: true, id: d.id, nombre: d.name, invoiceUrl: d.invoiceUrl || '', sinSku };
}
