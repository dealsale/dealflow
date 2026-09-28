import type { Express, Request, Response } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

/**
 * "DealFlow como tienda WooCommerce" para Effi.
 *
 * Effi no tiene API pública, pero se integra con WooCommerce. En vez de mantener
 * un WooCommerce real por cliente, DealFlow SE HACE PASAR por una tienda Woo: cada
 * tienda tiene un storefront en <slug>.dealflow.sbs que responde la API REST v3 de
 * WooCommerce (los endpoints que Effi consulta), y DealFlow le manda cada pedido a
 * Effi como webhook order.created. Effi crea el cliente y la remisión solo.
 *
 * Este módulo cubre la dirección ENTRANTE (Effi → DealFlow): probe, productos por
 * SKU, lectura por id, variaciones, push de stock y lectura de pedido. La dirección
 * saliente (DealFlow → Effi, el webhook del pedido) vive en enviarPedidoAEffi().
 */

// Dominio base donde viven los storefronts (subdominio por tienda).
const BASE_DOMAIN = (process.env.EFFI_BASE_DOMAIN || 'dealflow.sbs').toLowerCase();
// Slugs que NO se pueden usar (chocan con la app, la landing o Academy).
const RESERVADOS = new Set(['app', 'www', 'academy', 'api', 'dealflow', 'zennku', 'admin', 'mail', 'smtp']);

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ba.length !== bb.length) return false;
  try { return timingSafeEqual(ba, bb); } catch { return false; }
}

// ── Config por tienda ─────────────────────────────────────────────────────────
interface EffiRow { store_id: string; slug: string; ck_hash: string; cs_hash: string; activo: number; flete_ref: string }
function filaDe(storeId: string): EffiRow | undefined {
  return db.prepare('SELECT * FROM effi_woo WHERE store_id = ?').get(storeId) as EffiRow | undefined;
}

function slugify(nombre: string): string {
  return String(nombre || 'tienda')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'tienda';
}
function slugUnico(base: string, storeId: string): string {
  let s = base;
  if (RESERVADOS.has(s)) s = s + '-tienda';
  let intento = s;
  let n = 1;
  // Único entre todas las tiendas (excepto la propia).
  while (true) {
    const dueno = db.prepare('SELECT store_id FROM effi_woo WHERE slug = ?').get(intento) as { store_id: string } | undefined;
    if (!dueno || dueno.store_id === storeId) return intento;
    n += 1; intento = `${s}-${n}`;
  }
}

export function estadoEffi(storeId: string): { activo: boolean; slug: string; url: string } {
  const f = filaDe(storeId);
  const slug = f?.slug || '';
  return { activo: !!f?.activo, slug, url: slug ? `https://${slug}.${BASE_DOMAIN}/` : '' };
}

/**
 * Activa (o reactiva) el storefront de Effi para una tienda y devuelve las llaves
 * EN CLARO una sola vez (solo guardamos su hash). Genera el slug si no existe.
 */
export function activarEffi(storeId: string, nombreTienda: string): { slug: string; url: string; ck: string; cs: string } {
  const f = filaDe(storeId);
  const slug = f?.slug || slugUnico(slugify(nombreTienda), storeId);
  const ck = 'ck_' + randomBytes(20).toString('hex');       // ck_ + 40 hex
  const cs = 'cs_' + randomBytes(24).toString('hex');       // cs_ + 48 hex
  db.prepare(`INSERT INTO effi_woo (store_id, slug, ck_hash, cs_hash, activo) VALUES (?,?,?,?,1)
    ON CONFLICT(store_id) DO UPDATE SET slug = excluded.slug, ck_hash = excluded.ck_hash, cs_hash = excluded.cs_hash, activo = 1`)
    .run(storeId, slug, sha(ck), sha(cs));
  return { slug, url: `https://${slug}.${BASE_DOMAIN}/`, ck, cs };
}

export function desactivarEffi(storeId: string): void {
  db.prepare('UPDATE effi_woo SET activo = 0 WHERE store_id = ?').run(storeId);
}

// Resuelve la tienda a partir del Host del storefront (<slug>.dealflow.sbs).
export function resolverTiendaPorHost(host: string): string | null {
  const h = String(host || '').toLowerCase().split(':')[0];
  const partes = h.split('.');
  if (partes.length < 3) return null;              // necesita subdominio
  const slug = partes[0];
  if (RESERVADOS.has(slug)) return null;
  const f = db.prepare('SELECT store_id FROM effi_woo WHERE slug = ? AND activo = 1').get(slug) as { store_id: string } | undefined;
  return f?.store_id || null;
}

// ── Productos: SKU ↔ id numérico estable ───────────────────────────────────────
function idEstableDeSku(storeId: string, sku: string): number {
  db.prepare('INSERT OR IGNORE INTO effi_product_ids (store_id, sku) VALUES (?,?)').run(storeId, sku);
  const r = db.prepare('SELECT id FROM effi_product_ids WHERE store_id = ? AND sku = ?').get(storeId, sku) as { id: number };
  return r.id;
}
function skuDeId(storeId: string, id: number): string | null {
  const r = db.prepare('SELECT sku FROM effi_product_ids WHERE store_id = ? AND id = ?').get(storeId, id) as { sku: string } | undefined;
  return r?.sku || null;
}

interface ProdBasico { nombre: string; sku: string; precio: number; stock: number }
// Busca un producto/variante de la tienda por su SKU (exacto, sensible a mayúsculas).
function buscarPorSku(storeId: string, sku: string): ProdBasico | null {
  const v = db.prepare(
    `SELECT p.nombre AS pnombre, p.precio AS precio, v.label AS label, v.sku AS sku, v.stock AS stock
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE p.store_id = ? AND v.sku = ? LIMIT 1`,
  ).get(storeId, sku) as { pnombre: string; precio: number; label: string; sku: string; stock: number } | undefined;
  if (v) {
    const esUnica = (v.label || '').trim() === '' || (v.label || '').toLowerCase() === 'única';
    const nombre = esUnica ? v.pnombre : `${v.pnombre} - ${String(v.label).replace(/·/g, '-')}`;
    return { nombre, sku: v.sku, precio: Number(v.precio) || 0, stock: Number(v.stock) || 0 };
  }
  const p = db.prepare('SELECT nombre, precio, sku FROM products WHERE store_id = ? AND sku = ? LIMIT 1').get(storeId, sku) as
    | { nombre: string; precio: number; sku: string } | undefined;
  if (p) {
    const stock = (db.prepare('SELECT COALESCE(SUM(stock),0) s FROM variants WHERE product_id IN (SELECT id FROM products WHERE store_id = ? AND sku = ?)').get(storeId, sku) as { s: number }).s;
    return { nombre: p.nombre, sku: p.sku, precio: Number(p.precio) || 0, stock: Number(stock) || 0 };
  }
  return null;
}

// Producto en formato WooCommerce v3, tal como Effi lo espera.
function wooProducto(storeId: string, prod: ProdBasico): Record<string, unknown> {
  const id = idEstableDeSku(storeId, prod.sku);
  const st = estadoEffi(storeId);
  const precio = String(prod.precio || 0);
  return {
    id, name: prod.nombre, slug: `producto-${id}`,
    permalink: `${st.url}producto/${id}`,
    type: 'simple', status: 'publish', catalog_visibility: 'visible',
    sku: prod.sku, price: precio, regular_price: precio, sale_price: '', on_sale: false,
    purchasable: true, manage_stock: true, stock_quantity: prod.stock, stock_status: 'instock',
    parent_id: 0, variations: [], attributes: [], images: [], categories: [],
  };
}

// ── Autenticación estilo WooCommerce (ck/cs en query o Basic) ──────────────────
function autenticado(storeId: string, req: Request): boolean {
  const f = filaDe(storeId);
  if (!f) return false;
  let ck = String(req.query.consumer_key || '');
  let cs = String(req.query.consumer_secret || '');
  const auth = req.headers.authorization || '';
  if ((!ck || !cs) && auth.startsWith('Basic ')) {
    try {
      const dec = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const i = dec.indexOf(':');
      if (i > 0) { ck = dec.slice(0, i); cs = dec.slice(i + 1); }
    } catch { /* ignora */ }
  }
  return !!ck && !!cs && igualSeguro(sha(ck), f.ck_hash) && igualSeguro(sha(cs), f.cs_hash);
}

// Respuesta 404 estilo WooCommerce.
function noEncontrado(res: Response) {
  res.status(404).json({ code: 'woocommerce_rest_product_invalid_id', message: 'ID no válido.', data: { status: 404 } });
}

/**
 * Maneja una petición dirigida a un storefront de Effi (Host ya resuelto a storeId).
 * Devuelve true si la atendió (para que el resto de la app no la procese).
 */
function manejar(req: Request, res: Response, storeId: string): boolean {
  const ruta = (req.path || '/').replace(/\/+$/, '') || '/';

  // Probe sin autenticación: confirma que hay tienda en este origen.
  if (req.method === 'GET' && ruta === '/') { res.json({}); return true; }

  if (!ruta.startsWith('/wp-json/wc/v3')) return false; // no es del storefront

  if (!autenticado(storeId, req)) {
    res.status(401).json({ code: 'woocommerce_rest_authentication_error', message: 'Credenciales inválidas.', data: { status: 401 } });
    return true;
  }

  // GET /wp-json/wc/v3/products?sku=<ref>  → [] o [producto]
  if (req.method === 'GET' && /^\/wp-json\/wc\/v3\/products$/.test(ruta)) {
    const sku = String(req.query.sku || '').trim();
    if (!sku) { res.json([]); return true; } // sin sku no enumeramos el catálogo
    const prod = buscarPorSku(storeId, sku);
    res.json(prod ? [wooProducto(storeId, prod)] : []);
    return true;
  }

  const mProd = ruta.match(/^\/wp-json\/wc\/v3\/products\/(\d+)$/);
  if (mProd) {
    const id = Number(mProd[1]);
    const sku = skuDeId(storeId, id);
    const prod = sku ? buscarPorSku(storeId, sku) : null;
    if (!prod) { noEncontrado(res); return true; }
    if (req.method === 'GET') { res.json(wooProducto(storeId, prod)); return true; }
    if (req.method === 'PUT') {
      // Effi nos empuja su stock: {manage_stock:"1", stock_quantity:199}
      const q = req.body?.stock_quantity;
      if (q !== undefined && q !== null && !Number.isNaN(Number(q))) {
        db.prepare('UPDATE variants SET stock = ? WHERE sku = ? AND product_id IN (SELECT id FROM products WHERE store_id = ?)')
          .run(Math.max(0, Math.trunc(Number(q))), sku, storeId);
      }
      const fresco = buscarPorSku(storeId, sku!) || prod;
      res.json(wooProducto(storeId, fresco));
      return true;
    }
  }

  // GET /wp-json/wc/v3/products/:id/variations → siempre [] (cada SKU es simple)
  if (req.method === 'GET' && /^\/wp-json\/wc\/v3\/products\/\d+\/variations$/.test(ruta)) { res.json([]); return true; }

  // GET /wp-json/wc/v3/orders/:id → el pedido en formato Woo (verificación de Effi)
  const mOrder = ruta.match(/^\/wp-json\/wc\/v3\/orders\/(\d+)$/);
  if (req.method === 'GET' && mOrder) {
    const numero = Number(mOrder[1]);
    const o = db.prepare('SELECT * FROM orders WHERE store_id = ? AND numero = ?').get(storeId, numero) as Record<string, unknown> | undefined;
    if (!o) { res.status(404).json({ code: 'woocommerce_rest_shop_order_invalid_id', message: 'Pedido no encontrado.', data: { status: 404 } }); return true; }
    res.json(pedidoAWoo(storeId, o));
    return true;
  }

  // Cualquier otra ruta wc/v3 la reconocemos pero respondemos vacío/OK.
  res.json([]);
  return true;
}

// Middleware que intercepta SOLO los hosts de storefront de Effi.
export function montarEffiWoo(app: Express): void {
  app.use((req, res, next) => {
    const storeId = resolverTiendaPorHost(req.hostname);
    if (!storeId) return next();
    if (manejar(req, res, storeId)) return;
    next();
  });
}

// ── Formato de pedido WooCommerce (para GET /orders/:id y para el webhook) ─────
export function pedidoAWoo(storeId: string, o: Record<string, unknown>): Record<string, unknown> {
  const items = db.prepare('SELECT qty, nombre, precio FROM order_items WHERE order_id = ?').all(o.id as string) as
    { qty: number; nombre: string; precio: number }[];
  const numero = Number(o.numero);
  const total = Number(o.total) || items.reduce((a, it) => a + it.qty * it.precio, 0) + (Number(o.envio) || 0);
  const line_items = items.map((it, i) => {
    // Buscamos el SKU del ítem por nombre exacto de variante/producto (mejor esfuerzo).
    const prod = buscarProductoDePedido(storeId, it.nombre);
    const sku = prod?.sku || '';
    const product_id = sku ? idEstableDeSku(storeId, sku) : 0;
    return {
      id: i + 1, name: it.nombre, product_id, variation_id: 0, quantity: it.qty,
      tax_class: '', subtotal: String(it.qty * it.precio), subtotal_tax: '0',
      total: String(it.qty * it.precio), total_tax: '0', taxes: [], meta_data: [], sku, price: it.precio,
    };
  });
  const envio = Number(o.envio) || 0;
  return {
    id: numero, parent_id: 0, number: String(numero), order_key: `wc_order_${numero}`,
    created_via: 'rest-api', version: '9.0.0', status: 'processing', currency: 'COP',
    date_created: String(o.created_at || ''), date_created_gmt: String(o.created_at || ''),
    discount_total: '0', discount_tax: '0', shipping_total: String(envio), shipping_tax: '0',
    cart_tax: '0', total: String(total), total_tax: '0', prices_include_tax: false, customer_id: 0,
    customer_note: limpiarTexto(String(o.nota || '')),
    billing: datosCliente(o), shipping: datosCliente(o),
    payment_method: 'cod', payment_method_title: 'Pago contra entrega', transaction_id: '', meta_data: [],
    line_items,
    tax_lines: [],
    shipping_lines: envio > 0 ? [{ id: 999, method_title: 'Envío', method_id: 'flat_rate', instance_id: '1', total: String(envio), total_tax: '0', taxes: [], meta_data: [] }] : [],
    fee_lines: [], coupon_lines: [], refunds: [],
  };
}

function buscarProductoDePedido(storeId: string, nombreItem: string): { sku: string } | null {
  // El ítem del pedido viene como "Nombre (Talla M · Negro)" o "Nombre - Variante".
  // Intentamos casar por el nombre de producto y su variante.
  const base = nombreItem.split('(')[0].split(' - ')[0].trim();
  const p = db.prepare('SELECT id, sku FROM products WHERE store_id = ? AND nombre = ? LIMIT 1').get(storeId, base) as { id: string; sku: string } | undefined;
  if (!p) return null;
  // Si el ítem menciona una variante, buscamos su SKU exacto.
  const mv = nombreItem.match(/\(([^)]+)\)/);
  if (mv) {
    const etiqueta = mv[1].replace(/talla/ig, '').trim();
    const vs = db.prepare('SELECT label, sku FROM variants WHERE product_id = ?').all(p.id) as { label: string; sku: string }[];
    const hit = vs.find((v) => norm(v.label) === norm(etiqueta)) || vs.find((v) => norm(etiqueta).includes(norm(v.label)) && v.label);
    if (hit?.sku) return { sku: hit.sku };
  }
  return p.sku ? { sku: p.sku } : null;
}
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Datos de facturación/envío del cliente para Effi (crea el cliente con esto).
function datosCliente(o: Record<string, unknown>): Record<string, unknown> {
  const nombre = String(o.cliente || '').trim();
  const i = nombre.indexOf(' ');
  const first = i > 0 ? nombre.slice(0, i) : nombre;
  const last = i > 0 ? nombre.slice(i + 1) : '';
  return {
    first_name: limpiarTexto(first), last_name: limpiarTexto(last), company: '',
    address_1: limpiarTexto(String(o.direccion || '')), address_2: '',
    city: limpiarTexto(String(o.ciudad || '')), state: codigoDepto(String(o.departamento || o.ciudad || '')),
    postcode: '', country: 'CO', email: '', phone: telColombiano(String(o.tel || '')),
  };
}

// Celular colombiano de 10 dígitos, sin +57.
export function telColombiano(tel: string): string {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('57') && d.length > 10) d = d.slice(d.length - 10);
  return d.slice(-10);
}

// Effi inserta el texto como HTML y lo exporta a Excel: quita inyección de fórmulas
// y caracteres invisibles.
export function limpiarTexto(s: string): string {
  return String(s || '').replace(/[​-‍﻿]/g, '').replace(/^[=+\-@\t\r]+/, '').trim();
}

// Departamento como CÓDIGO ISO 3166-2:CO (sin "CO-"). Bogotá = DC.
const DEPTOS: Record<string, string> = {
  'amazonas': 'AMA', 'antioquia': 'ANT', 'arauca': 'ARA', 'atlantico': 'ATL',
  'bogota': 'DC', 'bogota dc': 'DC', 'bogota d c': 'DC', 'distrito capital': 'DC', 'cundinamarca': 'CUN',
  'bolivar': 'BOL', 'boyaca': 'BOY', 'caldas': 'CAL', 'caqueta': 'CAQ', 'casanare': 'CAS',
  'cauca': 'CAU', 'cesar': 'CES', 'choco': 'CHO', 'cordoba': 'COR', 'guainia': 'GUA',
  'guaviare': 'GUV', 'huila': 'HUI', 'la guajira': 'LAG', 'guajira': 'LAG', 'magdalena': 'MAG',
  'meta': 'MET', 'narino': 'NAR', 'norte de santander': 'NSA', 'putumayo': 'PUT', 'quindio': 'QUI',
  'risaralda': 'RIS', 'san andres': 'SAP', 'san andres y providencia': 'SAP', 'santander': 'SAN',
  'sucre': 'SUC', 'tolima': 'TOL', 'valle del cauca': 'VAC', 'valle': 'VAC', 'vaupes': 'VAU', 'vichada': 'VID',
};
export function codigoDepto(nombre: string): string {
  const n = norm(nombre);
  if (DEPTOS[n]) return DEPTOS[n];
  // Bogotá en cualquier variante → DC.
  if (n.includes('bogota')) return 'DC';
  // Búsqueda laxa por inclusión.
  for (const k of Object.keys(DEPTOS)) if (n.includes(k)) return DEPTOS[k];
  return nombre.trim().toUpperCase().slice(0, 3); // último recurso
}
