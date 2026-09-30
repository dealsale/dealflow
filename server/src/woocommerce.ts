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

/** Cada tienda puede tener DOS WooCommerce independientes: uno para Dropi y otro para Effi. */
export type WooProv = 'dropi' | 'effi';
export const WOO_PROVEEDORES: WooProv[] = ['dropi', 'effi'];

/**
 * Lista fija de transportadoras (las más usadas por dropshippers en Colombia).
 * El dueño elige una al enviar el pedido; la anotamos en el pedido de Woo para
 * que Dropi la vea. La transportadora definitiva se confirma en el panel de Dropi
 * (para imponerla desde aquí haría falta la API directa de Dropi).
 */
export const TRANSPORTADORAS = [
  'Interrapidísimo', 'Servientrega', 'Coordinadora', 'Envía', 'TCC',
  'Domina', 'Deprisa', 'Veloces', '99 Minutos', 'Saferbo', 'Futura', 'Otra',
];

/**
 * Lee las credenciales del WooCommerce de un proveedor (dropi/effi). Cada uno
 * se guarda como una integración aparte (woocommerce_dropi / woocommerce_effi).
 * Si no se pasa proveedor, usa la integración genérica 'woocommerce' (legado).
 */
/** Arma la base de la API REST a partir de una URL + llaves. */
function armar(url0: string, ck0: string, cs0: string): Cred | null {
  const url = String(url0 || '').trim().replace(/\/+$/, '');
  const ck = String(ck0 || '').trim();
  const cs = String(cs0 || '').trim();
  if (!url || !ck || !cs) return null;
  const base = /\/wp-json\/wc\/v3$/.test(url) ? url : `${url.replace(/\/wp-json.*$/, '')}/wp-json/wc/v3`;
  return { base, ck, cs };
}

/** Credenciales del WooCommerce CENTRAL (por operador) de un proveedor. */
export function credencialesCentral(prov: WooProv): Cred | null {
  const row = db.prepare("SELECT url, consumer_key, consumer_secret FROM woo_central WHERE proveedor = ? AND activo = 1").get(prov) as
    | { url: string; consumer_key: string; consumer_secret: string } | undefined;
  if (!row) return null;
  return armar(row.url, row.consumer_key, row.consumer_secret);
}

/**
 * Credenciales del WooCommerce a usar para una tienda y proveedor.
 * 1º las propias de la tienda (si las configuró); si no, el Woo CENTRAL del operador.
 */
export function credenciales(storeId: string, prov?: WooProv): Cred | null {
  const tipo = prov ? `woocommerce_${prov}` : 'woocommerce';
  const row = db.prepare('SELECT config FROM store_integrations WHERE store_id = ? AND tipo = ?').get(storeId, tipo) as { config: string } | undefined;
  if (row) {
    const cfg = pj<Record<string, string>>(row.config, {});
    const propio = armar(cfg.url, cfg.consumerKey, cfg.consumerSecret);
    if (propio) return propio;
  }
  // Cada tienda usa SOLO su propio WooCommerce. Ya NO caemos al Woo "central" del
  // operador: interfería (mostraba productos de otra tienda) y cada cliente tiene
  // su propia conexión. Si no configuró la suya, no hay catálogo (mensaje claro).
  return null;
}

/** ¿La tienda tiene ACTIVO el storefront nativo de Effi (DealFlow como tienda)?
 *  Se consulta la tabla directamente para no crear un import circular con effiWoo. */
export function effiNativoActivo(storeId: string): boolean {
  try {
    const r = db.prepare('SELECT activo FROM effi_woo WHERE store_id = ?').get(storeId) as { activo: number } | undefined;
    return !!r?.activo;
  } catch { return false; }
}

/** Proveedores (dropi/effi) disponibles para esta tienda (propios, central o Effi nativo). */
export function proveedoresConectados(storeId: string): WooProv[] {
  const provs = WOO_PROVEEDORES.filter((p) => credenciales(storeId, p));
  // Effi nativo (DealFlow como tienda) cuenta como "effi conectado" aunque no haya
  // credenciales de un WooCommerce real.
  if (!provs.includes('effi') && effiNativoActivo(storeId)) provs.push('effi');
  return provs;
}

/**
 * Configuración de despacho de la tienda, guardada como integración 'despacho_pref':
 *   { proveedor?: 'dropi'|'effi', auto?: boolean, transportadora?: string }
 * - proveedor: por cuál WooCommerce despachar cuando el auto-envío está activo.
 * - auto: si el pedido se envía SOLO al confirmarse (por defecto NO: manual).
 * - transportadora: transportadora por defecto para el auto-envío.
 */
export interface DespachoPref { proveedor: WooProv | null; auto: boolean; transportadora: string }
export function despachoConfig(storeId: string): DespachoPref {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'despacho_pref'").get(storeId) as { config: string } | undefined;
  const cfg = row ? pj<Record<string, unknown>>(row.config, {}) : {};
  const prov = String(cfg.proveedor || '');
  const proveedor: WooProv | null = (prov === 'dropi' || prov === 'effi') ? prov : null;
  return { proveedor, auto: cfg.auto === true, transportadora: String(cfg.transportadora || '') };
}

/**
 * Proveedor por el que se despacha (cuando aplica), aunque haya dos conectados.
 * Devuelve null si no hay preferido conectado.
 */
export function proveedorPreferido(storeId: string): WooProv | null {
  const prov = despachoConfig(storeId).proveedor;
  if (prov && (credenciales(storeId, prov) || (prov === 'effi' && effiNativoActivo(storeId)))) return prov;
  return null;
}

/**
 * Decide a qué proveedor auto-despachar un pedido nuevo (sin botón). SOLO cuando el
 * auto-envío está activado por la tienda (por defecto NO): usa el preferido si está
 * conectado, o el único conectado. Devuelve null si el auto-envío está apagado o no
 * hay a quién enviar (entonces el dueño lo envía a mano desde el detalle).
 */
export function proveedorAutoDespacho(storeId: string): WooProv | null {
  if (!despachoConfig(storeId).auto) return null; // manual por defecto
  const pref = proveedorPreferido(storeId);
  if (pref) return pref;
  const provs = proveedoresConectados(storeId);
  return provs.length === 1 ? provs[0] : null;
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

/**
 * Convierte un error de la API de WooCommerce en un mensaje ACCIONABLE en español.
 * El más común: la llave API quedó en "Escritura" (o el usuario perdió permisos) y
 * WooCommerce responde "Lo siento, no puedes listar recursos" (woocommerce_rest_cannot_view).
 * En ese caso decimos EXACTAMENTE qué arreglar, en vez de repetir el mensaje críptico.
 */
function mensajeWooError(r: { status: number; body: { message?: string; code?: string } }, nombreProv?: string): string {
  const code = String(r.body.code || '');
  const msg = String(r.body.message || '');
  const permiso = /cannot_view|cannot_list|no puedes (listar|ver)/i.test(code + ' ' + msg) || r.status === 401 || r.status === 403;
  const quien = nombreProv ? `de ${nombreProv}` : 'de WooCommerce';
  if (permiso) {
    return `La clave API ${quien} no tiene permiso de LECTURA. En WooCommerce ve a Ajustes → Avanzado → API REST, edita esa clave y ponla en “Lectura/Escritura” (o vuelve a generarla con ese permiso) y guárdala de nuevo aquí.`;
  }
  return msg || `WooCommerce respondió ${r.status}. Revisa la URL y las llaves ${quien}.`;
}

/** Verifica que las credenciales sirvan (pide 1 pedido). */
export async function verificar(storeId: string, prov?: WooProv): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = credenciales(storeId, prov);
  if (!c) return { ok: false, error: 'Faltan los datos de WooCommerce (URL, Consumer Key y Secret).' };
  try {
    const r = await woo<unknown[]>(c, '/orders', undefined, { per_page: '1' });
    if (!r.ok) return { ok: false, error: r.body.message || `WooCommerce respondió ${r.status}. Revisa la URL y las llaves.` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos conectar con tu WooCommerce. Revisa la URL.' };
  }
}

/** Verifica las credenciales del Woo CENTRAL de un proveedor. */
export async function verificarCentral(prov: WooProv): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = credencialesCentral(prov);
  if (!c) return { ok: false, error: 'Faltan los datos del WooCommerce central (URL, Consumer Key y Secret).' };
  try {
    const r = await woo<unknown[]>(c, '/orders', undefined, { per_page: '1' });
    if (!r.ok) return { ok: false, error: r.body.message || `WooCommerce respondió ${r.status}. Revisa la URL y las llaves.` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos conectar con el WooCommerce central. Revisa la URL.' };
  }
}

interface ItemPedido { qty: number; nombre: string; precio: number }
interface Pedido { cliente: string; ciudad: string; departamento: string; tel: string; direccion: string; nota: string; envio: number; total?: number }

const money = (cents: number) => (cents / 1).toFixed(2); // los precios ya vienen en pesos enteros

/**
 * Crea el pedido en WooCommerce. Intenta mapear cada ítem con un producto de
 * Woo por SKU (para que Effi lo despache); los que no tengan SKU van como línea
 * de cargo + en la nota, para que el total y el detalle igual lleguen.
 */
export interface VarianteSku { producto: string; label: string; sku: string }

export async function crearPedido(
  storeId: string,
  order: Pedido,
  items: ItemPedido[],
  skusPorNombre: Record<string, string>,
  prov?: WooProv,
  variantesSku: VarianteSku[] = [],
  transportadora = '',
): Promise<{ wooId: string; numero: string; sinMapear: string[]; mapeados: number } | { error: string }> {
  const c = credenciales(storeId, prov);
  if (!c) return { error: 'Conecta WooCommerce en Integraciones antes de enviar pedidos.' };
  const tiendaNombre = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre?: string } | undefined)?.nombre || '';

  const lineItems: Record<string, unknown>[] = [];
  const feeLines: Record<string, unknown>[] = [];
  const sinMapear: string[] = [];

  // El nombre del ítem trae talla/color ("Jogger jaspeado (Talla M · Negro)"),
  // pero el SKU está por el nombre base del producto: casamos de forma flexible.
  const nombresProd = Object.keys(skusPorNombre);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const skuDeItem = (nombreItem: string): string => {
    const nItem = norm(nombreItem);
    // 1) SKU POR VARIANTE (talla/color): si el ítem menciona el producto y TODOS
    //    los tokens de la variante (ej. "talla m", "negro"), usamos su SKU exacto.
    //    Así Dropi/Effi despachan la talla/color correctos, no el producto genérico.
    let mejorVar: { sku: string; len: number } | null = null;
    for (const v of variantesSku) {
      if (!v.sku) continue;
      const prodOk = nItem.includes(norm(v.producto).slice(0, Math.min(10, norm(v.producto).length)));
      const tokens = norm(v.label).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
      if (prodOk && tokens.length && tokens.every((t) => nItem.includes(t))) {
        const len = norm(v.producto).length + norm(v.label).length;
        if (!mejorVar || len > mejorVar.len) mejorVar = { sku: v.sku.trim(), len };
      }
    }
    if (mejorVar) return mejorVar.sku;
    // 2) SKU por producto (exacto, base, o coincidencia flexible).
    if (skusPorNombre[nombreItem]) return skusPorNombre[nombreItem].trim();
    const base = nombreItem.split('(')[0].split('—')[0].trim();
    if (skusPorNombre[base]) return skusPorNombre[base].trim();
    const m = nombresProd
      .filter((n) => n && (nItem.startsWith(norm(n)) || nItem.includes(norm(n))))
      .sort((a, b) => b.length - a.length)[0];
    return m ? skusPorNombre[m].trim() : '';
  };

  // El pedido se negocia por un TOTAL (combos, descuentos), no por precio de
  // catálogo. Lo que la integración (Dropi/Effi) necesita es la CANTIDAD de cada
  // producto y un precio unitario coherente = total de la línea ÷ cantidad. Así
  // que repartimos el total de productos entre las líneas (proporcional a su peso)
  // y le damos a cada línea su total; WooCommerce calcula el unitario (total ÷ qty).
  const totalItemsCatalogo = items.reduce((a, it) => a + Math.max(0, it.qty) * Math.max(0, it.precio), 0);
  const totalNegociado = order.total && order.total > 0 ? order.total : 0;
  // El total negociado suele incluir el envío; lo restamos para quedarnos con el de productos.
  const totalProductos = totalNegociado > order.envio ? totalNegociado - order.envio : (totalNegociado || totalItemsCatalogo);
  // Peso de cada línea para repartir: por su valor de catálogo, o por cantidad si no hay precios.
  const pesos = items.map((it) => (totalItemsCatalogo > 0 ? Math.max(0, it.qty * it.precio) : Math.max(1, it.qty)));
  const sumaPesos = pesos.reduce((a, b) => a + b, 0) || 1;
  // Total (en pesos enteros) que le toca a CADA línea; el remanente va a la última
  // para que la suma cuadre exactamente con el total negociado.
  const totalLinea: number[] = [];
  let repartido = 0;
  for (let i = 0; i < items.length; i++) {
    const t = i === items.length - 1 ? totalProductos - repartido : Math.round((totalProductos * pesos[i]) / sumaPesos);
    totalLinea[i] = Math.max(0, t);
    repartido += totalLinea[i];
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sku = skuDeItem(it.nombre);
    let productId = 0;
    let variationId = 0; // si el SKU es de una VARIACIÓN, el id del padre va en product_id
    if (sku) {
      try {
        // El filtro por SKU en /products también encuentra VARIACIONES: cuando el
        // objeto trae parent_id / type='variation', el id devuelto es el de la
        // variación y el producto real es su padre.
        const r = await woo<{ id: number; parent_id?: number; type?: string }[]>(c, '/products', undefined, { sku, per_page: '1' });
        const prod = r.ok && Array.isArray(r.body) ? r.body[0] : undefined;
        if (prod?.id) {
          const esVariacion = prod.type === 'variation' || !!(prod.parent_id && prod.parent_id > 0);
          if (esVariacion) { productId = Number(prod.parent_id); variationId = prod.id; }
          else productId = prod.id;
        }
      } catch { /* si falla la búsqueda, cae al fallback */ }
    }
    if (productId) {
      // Línea real con cantidad y su total: WooCommerce muestra el unitario = total ÷ qty.
      // Mandamos subtotal y total (a nivel de LÍNEA, todas las unidades) para respetar
      // el precio negociado en vez del precio de catálogo del producto.
      // CLAVE para Dropi/Effi: si es una variación, hay que mandar product_id (padre)
      // Y variation_id. Si solo mandáramos el id de la variación como product_id, el
      // plugin (Dropify/Effi) NO reconoce la variante y el pedido NUNCA sale a Dropi
      // (se queda en Woo "en preparación"). Con variation_id, sí lo despacha.
      const li: Record<string, unknown> = { product_id: productId, quantity: it.qty, subtotal: money(totalLinea[i]), total: money(totalLinea[i]) };
      if (variationId) li.variation_id = variationId;
      lineItems.push(li);
    } else {
      // Sin producto en Woo (SKU sin casar): va como cargo con el total de la línea, y se anota.
      // OJO: un ítem que cae aquí NO lo despacha Dropi/Effi (no es un producto suyo).
      feeLines.push({ name: `${it.qty}× ${it.nombre}`, total: money(totalLinea[i]) });
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
    // Etiquetamos el pedido con la tienda de origen: en el Woo CENTRAL (uno para
    // todas) así el operador sabe de qué tienda es cada pedido de un vistazo.
    customer_note: [
      tiendaNombre ? `[Tienda: ${tiendaNombre}]` : '',
      transportadora ? `[Transportadora: ${transportadora}]` : '',
      order.nota,
      sinMapear.length ? `Productos: ${sinMapear.join(', ')}` : '',
    ].filter(Boolean).join(' · '),
    meta_data: [
      { key: 'df_store', value: storeId },
      { key: 'df_store_nombre', value: tiendaNombre },
      ...(transportadora ? [{ key: 'df_transportadora', value: transportadora }] : []),
    ],
  };
  // WooCommerce rechaza un pedido sin ninguna línea; si todo cayó a fee_lines, ya está cubierto.
  if (!lineItems.length && !feeLines.length) return { error: 'El pedido no tiene productos.' };

  try {
    const r = await woo<{ id: number; number: string }>(c, '/orders', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok || !r.body.id) return { error: r.body.message || 'WooCommerce no aceptó el pedido.' };
    // sinMapear = ítems que NO casaron con un producto por SKU: van como "cargo" y el
    // proveedor (Dropi/Effi) NO los va a despachar. mapeados = líneas de producto reales.
    return { wooId: String(r.body.id), numero: String(r.body.number || r.body.id), sinMapear, mapeados: lineItems.length };
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
export async function estadoPedido(storeId: string, wooId: string, prov?: WooProv): Promise<{ estado: string; guia: string } | { error: string }> {
  const c = credenciales(storeId, prov);
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
export async function inventario(storeId: string, prov?: WooProv): Promise<{ items: ItemInventario[] } | { error: string }> {
  const c = credenciales(storeId, prov);
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

export interface ProductoWoo { id: number; nombre: string; sku: string; stock: number | null; precio: string }
type WooProductoRaw = { id?: number; name?: string; sku?: string; stock_quantity?: number | null; price?: string };

/**
 * Busca productos en el WooCommerce del proveedor (Effi/Dropi) para vincular el
 * SKU desde la ficha del producto: primero por SKU exacto (el "código" de Effi),
 * y si no aparece, por texto (nombre o parte del código). Devuelve nombre y
 * stock para que el dueño confirme que es el producto correcto.
 */
export async function buscarProductos(storeId: string, q: string, prov?: WooProv): Promise<{ productos: ProductoWoo[]; proveedor: WooProv } | { error: string }> {
  // Si no nos dicen el proveedor, preferimos Effi; si no, el primero conectado.
  const proveedor: WooProv | undefined = prov || (credenciales(storeId, 'effi') ? 'effi' : proveedoresConectados(storeId)[0]);
  const c = proveedor ? credenciales(storeId, proveedor) : null;
  if (!c || !proveedor) return { error: 'Conecta primero tu WooCommerce (Effi o Dropi) en Integraciones.' };
  const query = (q || '').trim();
  if (!query) return { productos: [], proveedor };
  const mapear = (arr: WooProductoRaw[]): ProductoWoo[] =>
    arr.map((p) => ({ id: Number(p.id), nombre: String(p.name || ''), sku: String(p.sku || ''), stock: p.stock_quantity ?? null, precio: String(p.price || '') }));
  try {
    // 1) Coincidencia exacta por SKU (el código pegado).
    const porSku = await woo<WooProductoRaw[]>(c, '/products', undefined, { sku: query, per_page: '5' });
    // Si la llave no puede leer, decimos QUÉ arreglar (no un "no encontramos" engañoso).
    if (!porSku.ok && (porSku.status === 401 || porSku.status === 403 || /cannot_view|no puedes/i.test(String(porSku.body.code) + String(porSku.body.message)))) {
      return { error: mensajeWooError(porSku, proveedor === 'effi' ? 'Effi' : 'Dropi') };
    }
    const productos: ProductoWoo[] = porSku.ok && Array.isArray(porSku.body) ? mapear(porSku.body) : [];
    // 2) Si no hubo match exacto, buscamos por texto (nombre o código parcial).
    if (!productos.length) {
      const porTexto = await woo<WooProductoRaw[]>(c, '/products', undefined, { search: query, per_page: '8' });
      if (porTexto.ok && Array.isArray(porTexto.body)) productos.push(...mapear(porTexto.body));
    }
    return { productos, proveedor };
  } catch {
    return { error: 'No pudimos consultar tu WooCommerce. Revisa la conexión en Integraciones.' };
  }
}

export interface VariacionWoo { id: number; nombre: string; sku: string; stock: number | null; dropi: boolean }
export interface ProductoCatalogoWoo { id: number; nombre: string; sku: string; stock: number | null; tipo: string; estado: string; dropi: boolean; variaciones: VariacionWoo[] }
type WooMeta = { key?: string; value?: unknown };
type WooProductoCat = WooProductoRaw & { type?: string; status?: string; variations?: number[]; meta_data?: WooMeta[] };
type WooVariacionRaw = { id?: number; sku?: string; stock_quantity?: number | null; attributes?: { name?: string; option?: string }[]; meta_data?: WooMeta[] };

/**
 * ¿Este producto/variación está vinculado a Dropi por el plugin (Dropify)? Es lo
 * que hace que un pedido de Woo se empuje a Dropi. Detectamos por su meta_data:
 * Dropify guarda llaves como _dropi_id / _dropshipping_* en el producto.
 */
function esDropi(meta?: WooMeta[]): boolean {
  for (const m of meta || []) {
    const k = String(m.key || '').toLowerCase();
    if (/dropi|dropship/.test(k)) {
      const v = m.value;
      if (v === undefined || v === null || v === '' || v === '0' || v === 0 || v === false) continue;
      return true;
    }
  }
  return false;
}

/**
 * Trae el CATÁLOGO COMPLETO del WooCommerce del proveedor: todos los productos y,
 * para los productos variables, todas sus variaciones (con su SKU y stock). Sirve
 * para vincular por lista desplegable (elegir producto → elegir variante) sin
 * tener que ir pegando códigos uno por uno. Pensado sobre todo para Dropi.
 */
export async function catalogo(storeId: string, prov?: WooProv): Promise<{ productos: ProductoCatalogoWoo[]; proveedor: WooProv } | { error: string }> {
  const proveedor: WooProv | undefined = prov || (credenciales(storeId, 'dropi') ? 'dropi' : proveedoresConectados(storeId)[0]);
  const c = proveedor ? credenciales(storeId, proveedor) : null;
  if (!c || !proveedor) return { error: 'Conecta primero tu WooCommerce (Dropi o Effi) en Integraciones.' };
  try {
    const productos: ProductoCatalogoWoo[] = [];
    // Hasta 5 páginas de 100 = 500 productos (suficiente para un catálogo típico).
    const variables: ProductoCatalogoWoo[] = [];
    for (let page = 1; page <= 5; page++) {
      // status: 'any' → también trae los productos en BORRADOR (a veces Effi/Dropi
      // sincronizan el catálogo sin publicarlo, y sin esto se vería "vacío").
      const r = await woo<WooProductoCat[]>(c, '/products', undefined, {
        per_page: '100', page: String(page), status: 'any',
        _fields: 'id,name,sku,stock_quantity,type,status,variations,meta_data',
      });
      if (!r.ok) return { error: mensajeWooError(r, proveedor === 'effi' ? 'Effi' : 'Dropi') };
      if (!Array.isArray(r.body) || !r.body.length) break;
      for (const p of r.body) {
        const prod: ProductoCatalogoWoo = {
          id: Number(p.id), nombre: String(p.name || ''), sku: String(p.sku || ''),
          stock: p.stock_quantity ?? null, tipo: String(p.type || 'simple'), estado: String(p.status || 'publish'), dropi: esDropi(p.meta_data), variaciones: [],
        };
        productos.push(prod);
        if (prod.tipo === 'variable' && Array.isArray(p.variations) && p.variations.length) variables.push(prod);
      }
      if (r.body.length < 100) break;
    }
    // Para cada producto variable, traemos sus variaciones (con SKU y stock).
    // Cap de 60 productos variables para no dispararnos en llamadas.
    for (const prod of variables.slice(0, 60)) {
      try {
        const rv = await woo<WooVariacionRaw[]>(c, `/products/${prod.id}/variations`, undefined, {
          per_page: '100', _fields: 'id,sku,stock_quantity,attributes,meta_data',
        });
        if (rv.ok && Array.isArray(rv.body)) {
          prod.variaciones = rv.body.map((v) => ({
            id: Number(v.id),
            nombre: (v.attributes || []).map((a) => String(a.option || '')).filter(Boolean).join(' · ') || 'Variante',
            sku: String(v.sku || ''),
            stock: v.stock_quantity ?? null,
            dropi: esDropi(v.meta_data) || prod.dropi, // la variación hereda el vínculo del padre
          }));
          // Un producto variable "es de Dropi" si el padre o alguna variación lo está.
          if (!prod.dropi && prod.variaciones.some((v) => v.dropi)) prod.dropi = true;
        }
      } catch { /* si una falla, seguimos con las demás */ }
    }
    return { productos, proveedor };
  } catch {
    return { error: 'No pudimos leer el catálogo de tu WooCommerce. Revisa la conexión en Integraciones.' };
  }
}

/**
 * Diagnóstico: dice EXACTAMENTE de qué WooCommerce está leyendo el catálogo de un
 * proveedor (la config PROPIA de la tienda, o el WooCommerce CENTRAL del operador),
 * su host, cuántos productos ve realmente la API (cabecera X-WP-Total) y el primero.
 * Sirve para entender por qué "solo aparece un producto" sin adivinar.
 */
export async function diagnosticoCatalogo(storeId: string, prov: WooProv, full = false): Promise<Record<string, unknown>> {
  const tipo = `woocommerce_${prov}`;
  const row = db.prepare('SELECT config FROM store_integrations WHERE store_id = ? AND tipo = ?').get(storeId, tipo) as { config: string } | undefined;
  const cfg = row ? pj<Record<string, string>>(row.config, {}) : {};
  const c = row ? armar(cfg.url, cfg.consumerKey, cfg.consumerSecret) : null;
  const fuente = c ? 'propio (esta tienda)' : 'ninguno';
  if (!c) return { proveedor: prov, fuente, error: `No tienes guardado el WooCommerce de ${prov} en Integraciones (cada tienda usa el suyo; ya no hay central).` };
  let host = '';
  try { host = new URL(c.base).host; } catch { host = c.base; }
  try {
    // En modo `full` pedimos TODOS los campos que un ERP suele usar para filtrar,
    // así comparamos el producto que Effi sí toma contra los que ignora.
    const campos = 'id,name,sku,type,status,catalog_visibility,stock_status,manage_stock,stock_quantity,price,regular_price,purchasable';
    const res = await fetch(url(c, '/products', { per_page: full ? '100' : '3', status: 'any', ...(full ? { _fields: campos } : {}) }));
    const totalHeader = res.headers.get('x-wp-total');
    const body = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
    const lista = Array.isArray(body) ? body : [];
    if (full) {
      // Resumen: distribución por los campos que importan (para ver qué distingue a unos de otros).
      const cuenta = (campo: string) => lista.reduce<Record<string, number>>((a, p) => { const k = String(p[campo] ?? '—'); a[k] = (a[k] || 0) + 1; return a; }, {});
      return {
        proveedor: prov, fuente, host, httpStatus: res.status,
        totalSegunAPI: totalHeader != null ? Number(totalHeader) : '(sin X-WP-Total)',
        devueltos: lista.length,
        resumen: {
          porEstado: cuenta('status'),
          porVisibilidad: cuenta('catalog_visibility'),
          porTipo: cuenta('type'),
          porStock: cuenta('stock_status'),
          comprables: lista.filter((p) => p.purchasable === true).length,
          conPrecio: lista.filter((p) => String(p.price ?? '') !== '' && String(p.price) !== '0').length,
          conSku: lista.filter((p) => String(p.sku ?? '') !== '').length,
        },
        productos: lista.map((p) => ({ id: p.id, nombre: p.name, sku: p.sku, tipo: p.type, estado: p.status, visibilidad: p.catalog_visibility, stock: p.stock_status, comprable: p.purchasable, precio: p.price })),
      };
    }
    return {
      proveedor: prov,
      fuente,
      host, // el dominio del WooCommerce que se está consultando (reconócelo)
      httpStatus: res.status,
      totalSegunAPI: totalHeader != null ? Number(totalHeader) : '(sin cabecera X-WP-Total)',
      devueltosEnMuestra: lista.length,
      primeros: lista.slice(0, 3).map((p) => ({ nombre: p.name, tipo: p.type, estado: p.status })),
      respuestaCruda: !Array.isArray(body) ? body : undefined,
      nota: 'Para ver TODOS los productos y comparar campos, agrega &full=1 a la URL.',
    };
  } catch (e) {
    return { proveedor: prov, fuente, host, error: 'No pudimos consultar ese WooCommerce: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Convierte la etiqueta de una variante ("GRIS · XL", "Negro - M", "L · Gris",
 * "Camel · XL"…) en atributos de WooCommerce Talla y Color. El token que parece
 * talla (S, M, L, XL, XXL, número, Única) va a "Talla"; el resto a "Color". Así
 * Effi/Dropi ven el producto con sus atributos, no solo el nombre.
 */
const TALLAS_CONOCIDAS = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'UNICA', 'ÚNICA', 'TALLA UNICA', 'U']);
function atributosDeLabel(label: string): { name: string; position: number; visible: boolean; variation: boolean; options: string[] }[] {
  const tokens = String(label || '').split(/[-·|/,]+/).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return [];
  const esTalla = (t: string) => TALLAS_CONOCIDAS.has(t.toUpperCase()) || /^\d{1,3}$/.test(t) || /^tall?a\b/i.test(t);
  const talla = tokens.find(esTalla);
  const colores = tokens.filter((t) => t !== talla);
  const attrs: { name: string; position: number; visible: boolean; variation: boolean; options: string[] }[] = [];
  let pos = 0;
  if (talla) attrs.push({ name: 'Talla', position: pos++, visible: true, variation: false, options: [talla] });
  if (colores.length) attrs.push({ name: 'Color', position: pos++, visible: true, variation: false, options: [colores.join(' ')] });
  return attrs;
}

/** Genera un SKU legible y único a partir del nombre y el id del producto. */
function skuAuto(nombre: string, id: string): string {
  const slug = (nombre || 'PRODUCTO')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 22) || 'PRODUCTO';
  return `${slug}-${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase()}`;
}

/**
 * Empuja el catálogo de DealFlow a WooCommerce: crea los productos que no
 * existen y actualiza los que ya están (casando por SKU). A los que no tengan SKU
 * les genera uno automáticamente (y lo guarda).
 *
 * IMPORTANTE: cada VARIANTE (talla/color) se sube como un PRODUCTO SIMPLE aparte
 * (nombre "Producto - Talla L · Blanco", con su propio SKU). Effi (y también Dropi)
 * exigen vincular cada variante por separado, así que en WooCommerce cada
 * combinación debe existir como su propio producto, no como una variación anidada.
 */
export async function empujarProductos(storeId: string, prov?: WooProv): Promise<{ creados: number; actualizados: number; skusGenerados: number } | { error: string }> {
  const c = credenciales(storeId, prov);
  if (!c) return { error: 'Conecta WooCommerce en Integraciones.' };

  const prods = db.prepare('SELECT id, nombre, precio, descripcion, sku FROM products WHERE store_id = ?').all(storeId) as
    { id: string; nombre: string; precio: number; descripcion: string; sku: string }[];
  if (!prods.length) return { error: 'No tienes productos para enviar. Crea productos en la sección Productos.' };

  const stockDe = (id: string) => (db.prepare('SELECT COALESCE(SUM(stock),0) s FROM variants WHERE product_id = ?').get(id) as { s: number }).s;

  // Aplanamos catálogo → una FILA por producto simple o por cada variante real.
  interface AtributoWoo { name: string; position: number; visible: boolean; variation: boolean; options: string[] }
  interface Fila { sku: string; name: string; price: string; desc: string; stock: number; attrs?: AtributoWoo[] }
  const filas: Fila[] = [];
  let skusGenerados = 0;
  for (const p of prods) {
    const variantes = db.prepare("SELECT id, label, sku, stock FROM variants WHERE product_id = ?").all(p.id) as
      { id: string; label: string; sku: string; stock: number }[];
    const reales = variantes.filter((v) => (v.label || '').trim() && (v.label || '').toLowerCase() !== 'única');
    if (reales.length) {
      // Un producto por cada variante (talla/color), con su propio SKU y con sus
      // ATRIBUTOS (Talla / Color) en WooCommerce, para que Effi/Dropi los reconozcan.
      for (const v of reales) {
        let sku = (v.sku || '').trim();
        if (!sku) { sku = skuAuto(`${p.nombre}-${v.label}`, v.id); db.prepare('UPDATE variants SET sku = ? WHERE id = ?').run(sku, v.id); skusGenerados++; }
        filas.push({ sku, name: `${p.nombre} - ${v.label}`, price: String(p.precio || 0), desc: p.descripcion || '', stock: v.stock || 0, attrs: atributosDeLabel(v.label) });
      }
    } else {
      // Producto sin variantes: una sola fila con el SKU del producto.
      let sku = (p.sku || '').trim();
      if (!sku) { sku = skuAuto(p.nombre, p.id); db.prepare('UPDATE products SET sku = ? WHERE id = ?').run(sku, p.id); skusGenerados++; }
      filas.push({ sku, name: p.nombre, price: String(p.precio || 0), desc: p.descripcion || '', stock: stockDe(p.id) });
    }
  }

  // Mapa sku → id en WooCommerce (para decidir crear vs. actualizar).
  const map: Record<string, number> = {};
  try {
    for (let page = 1; page <= 10; page++) {
      const r = await woo<{ id: number; sku: string }[]>(c, '/products', undefined, { per_page: '100', page: String(page), status: 'any', _fields: 'id,sku' });
      if (!r.ok) return { error: r.body.message || 'No pudimos leer los productos de WooCommerce.' };
      if (!Array.isArray(r.body) || !r.body.length) break;
      for (const p of r.body) if (p.sku) map[p.sku] = p.id;
      if (r.body.length < 100) break;
    }
  } catch {
    return { error: 'No pudimos leer los productos de WooCommerce.' };
  }

  const crear: Record<string, unknown>[] = [];
  const actualizar: Record<string, unknown>[] = [];
  for (const f of filas) {
    // Stock: si en DealFlow hay unidades, las llevamos y marcamos EN STOCK. Si no
    // hay (0), NO gestionamos stock y lo dejamos "instock": en dropshipping el
    // inventario real lo maneja Effi/Dropi, y si lo dejáramos en 0 gestionado,
    // WooCommerce lo marca "agotado" y los ERP (Effi) no lo listan ni lo venden.
    const stockFields = f.stock > 0
      ? { manage_stock: true, stock_quantity: f.stock, stock_status: 'instock' }
      : { manage_stock: false, stock_status: 'instock' };
    const base = { name: f.name, regular_price: f.price, description: f.desc, catalog_visibility: 'visible', ...stockFields, ...(f.attrs && f.attrs.length ? { attributes: f.attrs } : {}) };
    const wid = map[f.sku];
    if (wid) actualizar.push({ id: wid, ...base });
    else crear.push({ sku: f.sku, type: 'simple', status: 'publish', ...base });
  }

  const enTrozos = (arr: Record<string, unknown>[]) => {
    const out: Record<string, unknown>[][] = [];
    for (let i = 0; i < arr.length; i += 100) out.push(arr.slice(i, i + 100));
    return out;
  };

  let creados = 0;
  let actualizados = 0;
  try {
    for (const grupo of enTrozos(crear)) {
      const r = await woo<{ create?: { id?: number }[] }>(c, '/products/batch', { method: 'POST', body: JSON.stringify({ create: grupo }) });
      if (!r.ok) return { error: r.body.message || 'WooCommerce rechazó la creación de productos.' };
      creados += (r.body.create || []).filter((x) => x.id).length;
    }
    for (const grupo of enTrozos(actualizar)) {
      const r = await woo<{ update?: { id?: number }[] }>(c, '/products/batch', { method: 'POST', body: JSON.stringify({ update: grupo }) });
      if (!r.ok) return { error: r.body.message || 'WooCommerce rechazó la actualización de productos.' };
      actualizados += (r.body.update || []).filter((x) => x.id).length;
    }
  } catch {
    return { error: 'No pudimos sincronizar los productos con WooCommerce.' };
  }
  return { creados, actualizados, skusGenerados };
}

/** Actualiza el stock local (products.stock por SKU) con lo que dice WooCommerce. */
export async function sincronizarInventario(storeId: string, prov?: WooProv): Promise<{ actualizados: number } | { error: string }> {
  const inv = await inventario(storeId, prov);
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
