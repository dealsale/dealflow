import { db, pj } from './db.js';

/**
 * Integración con Shopify por su Admin API (GraphQL).
 *
 * A diferencia de Effi (donde DealFlow SE HACE PASAR por la tienda WooCommerce),
 * aquí Shopify ES la tienda y la fuente de verdad: DealFlow la CONSUME, igual que
 * el conector directo de Dropi. El comerciante crea una "custom app" en su panel de
 * Shopify, le da permisos (read_products, read/write_orders, read/write_draft_orders),
 * y copia un Admin API access token + su dominio myshopify. El token puede ser el
 * clásico de app personalizada (shpat_…) o un "token de automatización" del nuevo
 * Dev Dashboard (atkn_…); ambos se usan igual en el header X-Shopify-Access-Token.
 *
 * Auth: cada petición lleva el header `X-Shopify-Access-Token: <token>`.
 * Base: https://<tienda>.myshopify.com/admin/api/<versión>/graphql.json
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';

/**
 * Credenciales de una tienda. Dos formas de autenticar:
 *  - `token`: Admin API access token (shpat_…), el clásico de app personalizada
 *    instalada. Funciona en CUALQUIER tienda (desarrollo o de pago).
 *  - `clientId` + `clientSecret`: credenciales de una app del nuevo Dev Dashboard.
 *    DealFlow los cambia por un token con el flujo "client credentials" (solo
 *    tiendas de DESARROLLO) y lo renueva solo (dura 24h).
 */
export interface ShopifyCred { shop: string; token?: string; clientId?: string; clientSecret?: string }

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
  const clientId = String(cfg.clientId || '').trim();
  const clientSecret = String(cfg.clientSecret || '').trim();
  if (!shop || (!token && !(clientId && clientSecret))) return null;
  return { shop, token, clientId, clientSecret };
}

// Cache en memoria de tokens obtenidos por client credentials: "shop:clientId" → {token, exp(ms)}.
const ccgCache = new Map<string, { token: string; exp: number }>();

/** Olvida el token cacheado de una tienda (p.ej. al reconectar tras cambiar scopes). */
export function olvidarTokenShopify(shop: string): void {
  const s = normalizarShop(shop);
  for (const k of [...ccgCache.keys()]) if (k.startsWith(`${s}:`)) ccgCache.delete(k);
}

/**
 * Resuelve el token de acceso a usar: el estático si lo hay, o uno nuevo por
 * "client credentials" (cacheado hasta ~24h). El flujo client credentials solo
 * sirve en tiendas de desarrollo; en tiendas de pago Shopify lo rechaza y hay
 * que usar un Admin API access token.
 */
async function resolverToken(cred: ShopifyCred): Promise<{ ok: true; token: string } | { ok: false; error: string; http: number }> {
  const estatico = String(cred.token || '').trim();
  if (estatico) return { ok: true, token: estatico };
  const id = String(cred.clientId || '').trim();
  const secret = String(cred.clientSecret || '').trim();
  if (!id || !secret) return { ok: false, error: 'Faltan credenciales de Shopify (token, o Client ID + Client Secret).', http: 0 };
  const key = `${cred.shop}:${id}`;
  const hit = ccgCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return { ok: true, token: hit.token };
  try {
    const res = await fetch(`https://${cred.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
    });
    const raw = await res.text();
    let j: { access_token?: string; expires_in?: number; error?: string; error_description?: string } = {};
    try { j = JSON.parse(raw); } catch { /* no-JSON */ }
    if (!res.ok || !j.access_token) {
      const det = j.error_description || j.error || raw.slice(0, 200);
      const pago = /cannot be performed on this shop/i.test(det);
      const msg = pago
        ? 'Esta tienda es de PAGO: el flujo Client ID + Secret (client credentials) solo funciona en tiendas de desarrollo. Instala la app y conéctala con el Admin API access token.'
        : `No se pudo obtener el token con Client ID + Secret (${res.status}): ${det}`;
      return { ok: false, error: msg, http: res.status };
    }
    ccgCache.set(key, { token: j.access_token, exp: Date.now() + (Number(j.expires_in || 86_000) * 1000) });
    return { ok: true, token: j.access_token };
  } catch {
    return { ok: false, error: 'No pudimos conectar con Shopify para obtener el token.', http: 0 };
  }
}

interface GraphResp<T> { data?: T; errors?: { message: string }[] }

/** Llama al Admin API (GraphQL) de una tienda Shopify. */
async function shopifyGQL<T>(cred: ShopifyCred, query: string, variables?: Record<string, unknown>): Promise<{ ok: boolean; data?: T; error?: string; http: number }> {
  const tk = await resolverToken(cred);
  if (!tk.ok) return { ok: false, error: tk.error, http: tk.http };
  try {
    const res = await fetch(`https://${cred.shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': tk.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: variables || {} }),
    });
    const raw = await res.text();
    let body: GraphResp<T> = {};
    try { body = JSON.parse(raw) as GraphResp<T>; } catch { /* respuesta no-JSON (p.ej. HTML de error) */ }
    // Shopify, en 401/403, suele responder { "errors": "texto explicativo" } (string, no arreglo).
    const detalle = (() => {
      const e = (body as { errors?: unknown }).errors;
      if (typeof e === 'string') return e;
      if (Array.isArray(e)) return e.map((x) => (x && typeof x === 'object' && 'message' in x ? String((x as { message: unknown }).message) : String(x))).join(' · ');
      return raw.slice(0, 200);
    })();
    if (!res.ok) {
      let msg: string;
      if (res.status === 401) msg = `Token no reconocido por Shopify (401). Verifica que el token/credenciales estén completos y que el dominio sea el de ESA tienda. Shopify dice: ${detalle}`;
      else if (res.status === 403) msg = `Shopify aceptó el token pero niega el permiso (403): a la app le faltan scopes o no está instalada/liberada. Shopify dice: ${detalle}`;
      else if (res.status === 404) msg = `Shopify respondió 404: revisa el dominio .myshopify.com (quizá está mal escrito). Detalle: ${detalle}`;
      else msg = `Shopify respondió ${res.status}: ${detalle}`;
      return { ok: false, error: msg, http: res.status };
    }
    const errs = (body as { errors?: unknown }).errors;
    if ((typeof errs === 'string' && errs) || (Array.isArray(errs) && errs.length)) {
      return { ok: false, error: detalle, http: res.status };
    }
    return { ok: true, data: body.data, http: res.status };
  } catch {
    return { ok: false, error: 'No pudimos conectar con Shopify.', http: 0 };
  }
}

/**
 * Prueba la conexión: devuelve el nombre de la tienda si las credenciales sirven.
 * Acepta un Admin API token o el par Client ID + Client Secret.
 */
export async function probarShopify(shop: string, auth: { token?: string; clientId?: string; clientSecret?: string }): Promise<{ ok: true; nombre: string } | { ok: false; error: string }> {
  const cred: ShopifyCred = {
    shop: normalizarShop(shop),
    token: String(auth.token || '').trim(),
    clientId: String(auth.clientId || '').trim(),
    clientSecret: String(auth.clientSecret || '').trim(),
  };
  if (!cred.shop) return { ok: false, error: 'Falta el dominio de la tienda (mitienda.myshopify.com).' };
  if (!cred.token && !(cred.clientId && cred.clientSecret)) return { ok: false, error: 'Pon el Admin API token, o el Client ID + Client Secret.' };
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

// ── Crear/publicar un producto de DealFlow EN Shopify ────────────────────────
export interface ProductoDF {
  id: string | number; nombre: string; precio: number;
  descripcion?: string; caracteristicas?: string; fotos?: string[];
  opciones?: { nombre: string; valores: { valor: string }[] }[];
  variantes?: { id?: string; label: string; sku?: string; refs?: Record<string, string>; stock?: number }[];
}

const escHtml = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const esUnica = (lbl?: string) => { const t = String(lbl || '').trim().toLowerCase(); return !t || t === 'única' || t === 'unica'; };

/**
 * Crea (o actualiza, con `shopifyProductId`) un producto en Shopify a partir de un
 * producto de DealFlow, usando `productSet` (producto + opciones + variantes en una
 * sola llamada). Las variantes toman el precio del producto y un SKU estable; se
 * devuelve el mapeo variante_DealFlow → SKU para que el llamador lo guarde en
 * refs.shopify y así los pedidos luego encuentren la variante. Se crea como BORRADOR
 * salvo que `activar` sea true. Requiere el scope write_products.
 */
export async function crearProductoEnShopify(
  cred: ShopifyCred,
  p: ProductoDF,
  opts?: { activar?: boolean; shopifyProductId?: string },
): Promise<{ ok: true; productId: string; handle: string; status: string; mapSku: { dfVariantId: string; sku: string }[]; imagenes: number; variantes: number } | { ok: false; error: string }> {
  const grupos = (p.opciones || []).filter((g) => (g.valores || []).some((v) => (v.valor || '').trim()));
  const vars = (p.variantes || []).filter((v) => v.id);
  const precio = String(Math.max(0, Number(p.precio) || 0));
  const skuDe = (v: { sku?: string; refs?: Record<string, string> }, i: number) =>
    (v.refs?.shopify || v.sku || `DF-${p.id}-${i + 1}`).trim();

  const mapSku: { dfVariantId: string; sku: string }[] = [];
  let productOptions: { name: string; values: { name: string }[] }[] | undefined;
  let variants: Record<string, unknown>[];

  if (grupos.length) {
    // Estructurado: opciones (Color, Talla…) y variantes mapeadas por el label "A · B".
    productOptions = grupos.map((g) => ({
      name: g.nombre,
      values: [...new Set((g.valores || []).map((v) => (v.valor || '').trim()).filter(Boolean))].map((name) => ({ name })),
    }));
    variants = vars.map((v, i) => {
      const partes = String(v.label || '').split(' · ').map((s) => s.trim());
      const optionValues = grupos.map((g, gi) => ({ optionName: g.nombre, name: partes[gi] || (g.valores[0]?.valor || '').trim() }));
      const sku = skuDe(v, i); mapSku.push({ dfVariantId: String(v.id), sku });
      return { optionValues, price: precio, inventoryItem: { sku, tracked: false } };
    });
  } else {
    const reales = vars.filter((v) => !esUnica(v.label));
    if (reales.length) {
      // Sin grupos pero con variantes con nombre: una sola opción "Variante".
      productOptions = [{ name: 'Variante', values: reales.map((v) => ({ name: v.label.trim() })) }];
      variants = reales.map((v, i) => {
        const sku = skuDe(v, i); mapSku.push({ dfVariantId: String(v.id), sku });
        return { optionValues: [{ optionName: 'Variante', name: v.label.trim() }], price: precio, inventoryItem: { sku, tracked: false } };
      });
    } else {
      // Producto simple: una variante por defecto.
      const v = vars[0];
      const sku = v ? skuDe(v, 0) : `DF-${p.id}`;
      if (v) mapSku.push({ dfVariantId: String(v.id), sku });
      variants = [{ price: precio, inventoryItem: { sku, tracked: false } }];
    }
  }

  const descripcion = [p.descripcion, p.caracteristicas].map((s) => String(s || '').trim()).filter(Boolean).join('\n\n');
  const files = (p.fotos || []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 20).map((u) => ({ originalSource: u, contentType: 'IMAGE' }));

  const input: Record<string, unknown> = {
    title: p.nombre,
    status: opts?.activar ? 'ACTIVE' : 'DRAFT',
    variants,
  };
  if (opts?.shopifyProductId) input.id = opts.shopifyProductId;
  if (descripcion) input.descriptionHtml = descripcion.split(/\n+/).map((l) => `<p>${escHtml(l)}</p>`).join('');
  if (productOptions) input.productOptions = productOptions;
  if (files.length) input.files = files;

  const mut = `mutation($input: ProductSetInput!){ productSet(input:$input){ product{ id handle status variants(first:150){ nodes{ id sku } } } userErrors{ field message } } }`;
  const r = await shopifyGQL<{ productSet: { product: { id: string; handle: string; status: string; variants: { nodes: { id: string; sku: string }[] } } | null; userErrors: { field: string[]; message: string }[] } }>(cred, mut, { input });
  if (!r.ok) return { ok: false, error: r.error || 'No pudimos crear el producto en Shopify.' };
  const out = r.data?.productSet;
  if (out?.userErrors?.length) return { ok: false, error: out.userErrors.map((e) => `${(e.field || []).join('.')} ${e.message}`.trim()).join(' · ') };
  const prod = out?.product;
  if (!prod) return { ok: false, error: 'Shopify no devolvió el producto.' };
  return { ok: true, productId: prod.id, handle: prod.handle, status: prod.status, mapSku, imagenes: files.length, variantes: prod.variants?.nodes?.length || 0 };
}
