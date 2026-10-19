import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, pj, registrarLog } from './db.js';
import { conPedido, trazar, trazarApi } from './trazabilidad.js';
import { emparejarItem, type Emparejado } from './emparejar.js';

/**
 * Integración DIRECTA con la API de Effi ERP (https://effi.com.co/api).
 *
 * Reemplaza el puente por WooCommerce: con la API key de un usuario de Effi,
 * DealFlow crea el cliente y la REMISIÓN DE VENTA del pedido (y, si la tienda lo
 * activa, la GUÍA de transporte), y recibe los cambios por los webhooks de Effi.
 *
 *  - Auth: `Authorization: Bearer <API_KEY_EFFI>` (vence a los 360 días).
 *  - Límite: 120 peticiones/min por API key; 429 trae Retry-After.
 *  - POST con `idempotency_key`: si reintentamos con la misma llave, Effi no
 *    crea un documento nuevo (responde 409 con el ya creado).
 *  - Cliente: siempre tipo de documento Cédula (t_dni 2) y como número el
 *    CELULAR del cliente (decisión de negocio: al cliente no se le pide cédula).
 */

const BASE = 'https://effi.com.co';
const PAIS_COLOMBIA = 47;
const T_DNI_CEDULA = 2;
// Tipo de transacción de la remisión de venta (mismo id que usa Effi en t_trans_venta).
const T_TRANS_REMISION_V = 4;

export interface EffiGuiaCfg {
  activa: boolean;
  transportadora: string; servicio: string; formaPagoFlete: string; remitente: string;
  peso: number; volumen: number; alto: number; ancho: number; largo: number;
}
export interface EffiCfg {
  apiKey: string;
  sucursal: string; bodega: string; centroCostos: string;
  formaPago: string; formaPagoContado: boolean;
  medioPago: string; caja: string; cuenta: string; // solo si la forma de pago es de contado
  vendedor: string; articuloFlete: string; diasEntrega: number;
  autoDespacho: boolean;
  /** Código del convenio Dropshipping (artículos de un proveedor: no exigen stock propio). */
  convenioDropshipping: string;
  guia: EffiGuiaCfg;
  webhookToken: string; webhookSecret: string;
}

const GUIA_VACIA: EffiGuiaCfg = { activa: false, transportadora: '', servicio: '', formaPagoFlete: '', remitente: '', peso: 1, volumen: 1, alto: 10, ancho: 10, largo: 10 };

/** Config de Effi API de la tienda (fila 'effi_api' de store_integrations). */
export function cfgEffi(storeId: string): EffiCfg | null {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'effi_api'").get(storeId) as { config: string } | undefined;
  if (!row) return null;
  const c = pj<Record<string, unknown>>(row.config, {});
  const s = (k: string) => String(c[k] ?? '').trim();
  const g = (c.guia && typeof c.guia === 'object' ? c.guia : {}) as Record<string, unknown>;
  return {
    apiKey: s('apiKey'), sucursal: s('sucursal'), bodega: s('bodega'), centroCostos: s('centroCostos'),
    formaPago: s('formaPago'), formaPagoContado: c.formaPagoContado === true,
    medioPago: s('medioPago'), caja: s('caja'), cuenta: s('cuenta'),
    vendedor: s('vendedor'), articuloFlete: s('articuloFlete'), diasEntrega: Number(c.diasEntrega) > 0 ? Number(c.diasEntrega) : 3,
    autoDespacho: c.autoDespacho === true,
    convenioDropshipping: s('convenioDropshipping'),
    guia: { ...GUIA_VACIA, ...g, activa: g.activa === true } as EffiGuiaCfg,
    webhookToken: s('webhookToken'), webhookSecret: s('webhookSecret'),
  };
}

/** ¿La tienda tiene Effi por API listo para despachar? */
export function effiApiListo(storeId: string): boolean {
  const c = cfgEffi(storeId);
  return !!(c && c.apiKey && c.sucursal && c.bodega && c.centroCostos && c.formaPago);
}

/** Guarda (mezcla) la config. Genera el token del webhook la primera vez. */
export function guardarCfgEffi(storeId: string, parcial: Partial<EffiCfg>): EffiCfg {
  const actual = cfgEffi(storeId);
  const base: Record<string, unknown> = actual ? { ...actual } : { guia: GUIA_VACIA };
  const nuevo: Record<string, unknown> = { ...base, ...parcial };
  if (parcial.guia) nuevo.guia = { ...(base.guia as EffiGuiaCfg), ...parcial.guia };
  if (!nuevo.webhookToken) nuevo.webhookToken = randomBytes(18).toString('base64url');
  const json = JSON.stringify(nuevo);
  db.prepare("INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'effi_api', ?, datetime('now')) ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at").run(storeId, json);
  return cfgEffi(storeId)!;
}

export function borrarCfgEffi(storeId: string): void {
  db.prepare("DELETE FROM store_integrations WHERE store_id = ? AND tipo = 'effi_api'").run(storeId);
}

/** Tienda dueña de un token de webhook. */
export function tiendaPorWebhookToken(token: string): string | null {
  if (!token) return null;
  const rows = db.prepare("SELECT store_id, config FROM store_integrations WHERE tipo = 'effi_api'").all() as { store_id: string; config: string }[];
  for (const r of rows) {
    const t = String(pj<Record<string, unknown>>(r.config, {}).webhookToken || '');
    if (t && t === token) return r.store_id;
  }
  return null;
}

// ── Cliente HTTP ─────────────────────────────────────────────────────────────

interface EffiResp<T> { ok?: boolean; data?: T; mensaje?: string; paginacion?: { pagina: number; total_paginas: number; total: number } }

async function effi<T>(apiKey: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<{ ok: boolean; http: number; body: EffiResp<T> }> {
  const qs = opts.query
    ? '?' + Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const t0 = Date.now();
  const r = await effiHttp<T>(apiKey, method, path, qs, opts.body);
  // Trazabilidad: si estamos trabajando sobre un pedido, queda la petición y la respuesta.
  const resp = Array.isArray(r.body.data)
    ? { ok: r.body.ok, mensaje: r.body.mensaje, total: (r.body.data as unknown[]).length, primeros: (r.body.data as unknown[]).slice(0, 3) }
    : r.body;
  trazarApi('Effi', method, path + qs, r.http, r.ok, Date.now() - t0, opts.body, resp, r.ok ? undefined : r.body.mensaje);
  return r;
}

async function effiHttp<T>(apiKey: string, method: string, path: string, qs: string, cuerpo: unknown): Promise<{ ok: boolean; http: number; body: EffiResp<T> }> {
  const opts = { body: cuerpo };
  for (let intento = 0; intento < 2; intento++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}${qs}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) {
      return { ok: false, http: 0, body: { ok: false, mensaje: `No pudimos conectar con Effi (${e instanceof Error ? e.message : 'red'}).` } };
    }
    if (res.status === 429 && intento === 0) {
      const espera = Math.min(8, Math.max(1, Number(res.headers.get('retry-after')) || 2));
      await new Promise((r) => setTimeout(r, espera * 1000));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as EffiResp<T>;
    return { ok: res.ok && body.ok !== false, http: res.status, body };
  }
  return { ok: false, http: 429, body: { ok: false, mensaje: 'Effi está limitando las peticiones (429). Intenta en un minuto.' } };
}

function mensajeError(r: { http: number; body: EffiResp<unknown> }): string {
  if (r.http === 401) return 'Effi rechazó la API key (401): revisa que esté bien copiada y vigente (Administración → Usuarios → Ver más → Renovar API Key).';
  if (r.http === 403) return `El usuario de la API key no tiene permiso para esta función en Effi (403). ${r.body.mensaje || ''}`.trim();
  return r.body.mensaje || `Effi respondió ${r.http || 'sin conexión'}.`;
}

/** GET paginado: trae todas las páginas (con tope de seguridad). */
async function todo<T>(apiKey: string, path: string, query: Record<string, string | number | undefined> = {}, maxPaginas = 30): Promise<T[] | { error: string }> {
  const out: T[] = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const r = await effi<T[]>(apiKey, 'GET', path, { query: { ...query, pagina, por_pagina: 100 } });
    if (!r.ok) return { error: mensajeError(r) };
    out.push(...(r.body.data || []));
    const tp = Number(r.body.paginacion?.total_paginas || 1);
    if (pagina >= tp) break;
  }
  return out;
}

// ── Verificación y listas para configurar ────────────────────────────────────

export async function verificarEffi(apiKey: string): Promise<{ ok: true; sucursales: number } | { ok: false; error: string }> {
  const r = await effi<unknown[]>(apiKey, 'GET', '/api/sucursal', { query: { pagina: 1, por_pagina: 100 } });
  if (!r.ok) return { ok: false, error: mensajeError(r) };
  return { ok: true, sucursales: (r.body.data || []).length };
}

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

/** Todo lo que la tienda elige al configurar Effi (cada lista como {id, nombre, ...}). */
export async function listasEffi(apiKey: string): Promise<Record<string, unknown> | { error: string }> {
  const nombres = ['sucursal', 'bodega', 'centro_costos', 'forma_pago', 'medio_pago', 'caja', 'cuenta', 'transportadora', 'remitente', 'ecommerce'] as const;
  const res = await Promise.all(nombres.map((n) => todo<Fila>(apiKey, `/api/${n}`, {}, 5)));
  const err = res.find((r) => !Array.isArray(r)) as { error: string } | undefined;
  if (err && !Array.isArray(res[0])) return err; // si falla lo básico, no seguimos
  const L = (i: number) => (Array.isArray(res[i]) ? (res[i] as Fila[]) : []);
  return {
    sucursales: L(0).map((f) => ({ id: txt(f.id), nombre: txt(f.nombre), prefijo: txt(f.prefijo_trans) })),
    bodegas: L(1).map((f) => ({ id: txt(f.id), sucursal: txt(f.sucursal), nombre: txt(f.nombre) })),
    centrosCostos: L(2).map((f) => ({ id: txt(f.id), nombre: [txt(f.codigo), txt(f.nombre)].filter(Boolean).join(' · ') })),
    formasPago: L(3).map((f) => ({ id: txt(f.id), nombre: txt(f.nombre), contado: txt(f.contado_credito) === '1' })),
    mediosPago: L(4).map((f) => ({ id: txt(f.id), nombre: txt(f.tipo), efectivo: txt(f.efectivo) === '1', banco: txt(f.banco) === '1', dinero: txt(f.dinero) === '1' })),
    cajas: L(5).map((f) => ({ id: `${txt(f.sucursal)}:${txt(f.id)}`, nombre: `${txt(f.nombre)} (${txt(f.nombre_sucursal)})` })),
    cuentas: L(6).map((f) => ({ id: txt(f.id), nombre: [txt(f.nombre_banco), txt(f.nombre)].filter(Boolean).join(' · ') })),
    transportadoras: L(7).map((f) => ({
      id: txt(f.id), nombre: txt(f.nombre), effi: txt(f.nombre_transportadora_efficommerce),
      servicios: Array.isArray(f.t_servicio) ? (f.t_servicio as Fila[]).map((s) => ({ id: txt(s.id), nombre: txt(s.tipo) })) : [],
      formasPago: Array.isArray(f.t_forma_pago) ? (f.t_forma_pago as Fila[]).map((s) => ({ id: txt(s.id), nombre: txt(s.tipo) })) : [],
    })),
    remitentes: L(8).map((f) => ({ id: txt(f.codigo), nombre: txt(f.nombre) })),
    ecommerce: L(9).map((f) => ({ id: txt(f.id), nombre: txt(f.nombre), plataforma: txt(f.nombre_api) })),
  };
}

/** Solo lo que pide el formulario de guía (más liviano que todas las listas). */
export async function opcionesGuiaEffi(apiKey: string): Promise<{ transportadoras: unknown[]; remitentes: unknown[] } | { error: string }> {
  const [t, r] = await Promise.all([todo<Fila>(apiKey, '/api/transportadora', {}, 5), todo<Fila>(apiKey, '/api/remitente', {}, 5)]);
  if (!Array.isArray(t)) return t;
  return {
    transportadoras: t.filter((f) => txt(f.vigente) !== '0').map((f) => ({
      id: txt(f.id), nombre: txt(f.nombre), effi: txt(f.nombre_transportadora_efficommerce),
      servicios: Array.isArray(f.t_servicio) ? (f.t_servicio as Fila[]).map((s) => ({ id: txt(s.id), nombre: txt(s.tipo) })) : [],
      formasPago: Array.isArray(f.t_forma_pago) ? (f.t_forma_pago as Fila[]).map((s) => ({ id: txt(s.id), nombre: txt(s.tipo) })) : [],
    })),
    remitentes: Array.isArray(r) ? r.map((f) => ({ id: txt(f.codigo), nombre: txt(f.nombre) })) : [],
  };
}

// ── Ubicación (departamento / ciudad) ────────────────────────────────────────

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cacheProv = new Map<string, { id: string; nombre: string }[]>();
const cacheCiudad = new Map<string, { id: string; nombre: string; provincia: string }[]>();

async function provincias(apiKey: string): Promise<{ id: string; nombre: string }[]> {
  const k = 'co';
  if (cacheProv.has(k)) return cacheProv.get(k)!;
  const r = await todo<Fila>(apiKey, '/api/provincia', { pais: PAIS_COLOMBIA }, 3);
  const lista = Array.isArray(r) ? r.map((f) => ({ id: txt(f.id), nombre: txt(f.nombre) })) : [];
  if (lista.length) cacheProv.set(k, lista);
  return lista;
}
async function ciudadesDe(apiKey: string, provincia: string): Promise<{ id: string; nombre: string; provincia: string }[]> {
  if (cacheCiudad.has(provincia)) return cacheCiudad.get(provincia)!;
  const r = await todo<Fila>(apiKey, '/api/ciudad', { provincia }, 5);
  const lista = Array.isArray(r) ? r.map((f) => ({ id: txt(f.id), nombre: txt(f.nombre), provincia: txt(f.provincia) })) : [];
  if (lista.length) cacheCiudad.set(provincia, lista);
  return lista;
}

/** Convierte "Antioquia" + "Medellín" en los ids de Effi. Tolera tildes y "Bogotá D.C.". */
export async function resolverUbicacion(apiKey: string, departamento: string, ciudad: string): Promise<{ provincia: string; ciudad: string; nombre: string } | { error: string }> {
  const nc = norm(ciudad).replace(/\b(d c|dc|distrito capital)\b/g, '').trim();
  let nd = norm(departamento).replace(/\b(departamento|depto|de)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nd && /bogota/.test(nc)) nd = 'bogota';
  const provs = await provincias(apiKey);
  if (!provs.length) return { error: 'No pudimos leer los departamentos de Effi.' };
  const candProv = nd
    ? provs.filter((p) => norm(p.nombre) === nd).concat(provs.filter((p) => norm(p.nombre) !== nd && (norm(p.nombre).includes(nd) || nd.includes(norm(p.nombre)))))
    : [];
  // Sin departamento claro: buscamos la ciudad por nombre en todo el país.
  const buscarEn = candProv.length ? candProv : [];
  for (const p of buscarEn) {
    const cs = await ciudadesDe(apiKey, p.id);
    const hit = cs.find((c) => norm(c.nombre) === nc) || cs.find((c) => nc && (norm(c.nombre).startsWith(nc) || nc.startsWith(norm(c.nombre))));
    if (hit) return { provincia: p.id, ciudad: hit.id, nombre: `${hit.nombre}, ${p.nombre}` };
  }
  const r = await effi<Fila[]>(apiKey, 'GET', '/api/ciudad', { query: { nombre: ciudad.trim().slice(0, 40), por_pagina: 100 } });
  const todas = r.ok ? (r.body.data || []) : [];
  const exactas = todas.filter((c) => norm(txt(c.nombre)) === nc);
  if (exactas.length === 1) {
    const c = exactas[0];
    const pv = provs.find((p) => p.id === txt(c.provincia));
    return { provincia: txt(c.provincia), ciudad: txt(c.id), nombre: `${txt(c.nombre)}, ${pv?.nombre || txt(c.nombre_provincia)}` };
  }
  if (exactas.length > 1) return { error: `La ciudad "${ciudad}" existe en varios departamentos; revisa el departamento del pedido.` };
  return { error: `Effi no reconoce la ciudad "${ciudad}"${departamento ? ` (${departamento})` : ''}. Corrígela en el pedido.` };
}

// ── Artículos: caché y vínculo con productos/variantes de DealFlow ───────────

db.exec(`CREATE TABLE IF NOT EXISTS effi_articulos (
  store_id TEXT NOT NULL,
  id TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  referencia TEXT NOT NULL DEFAULT '',
  ecommerce TEXT NOT NULL DEFAULT '',
  stock REAL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, id)
)`);
// drop = 1 si el artículo está vinculado a un PROVEEDOR dropshipping (la tienda es
// distribuidora): ese artículo no exige stock propio si la remisión lleva convenio.
try { db.exec('ALTER TABLE effi_articulos ADD COLUMN es_drop INTEGER NOT NULL DEFAULT 0'); } catch { /* ya existe */ }

export interface ArticuloEffi { id: string; descripcion: string; referencia: string; ecommerce: string; stock: number | null; drop?: number }

/**
 * Descarga a la caché local los artículos de Effi VINCULADOS a un e-commerce (los
 * que el dueño enlazó en su integración de Effi): ese es su catálogo real. Bajar
 * todo el maestro de artículos traía miles de artículos ajenos (catálogos de
 * dropshipping, etc.). Lo demás se busca en vivo por nombre o referencia.
 */
export async function descargarArticulos(storeId: string, apiKey: string): Promise<{ total: number; soloVinculados: boolean } | { error: string }> {
  let r = await todo<Fila>(apiKey, '/api/articulo', { existe_vinculacion: 1 }, 40);
  if (!Array.isArray(r)) return r;
  const soloVinculados = r.length > 0;
  if (!soloVinculados) {
    // Sin vínculos de e-commerce todavía: caemos a los artículos de venta (con tope).
    const t = await todo<Fila>(apiKey, '/api/articulo', { ventas: 1 }, 20);
    if (!Array.isArray(t)) return t;
    r = t;
  }
  // Artículos vinculados a un proveedor dropshipping: se marcan (y se agregan aunque
  // no estén enlazados al e-commerce, porque el dueño los vincula a mano).
  const drop = await todo<Fila>(apiKey, '/api/articulo', { dropshipping_distribuidor: 1 }, 40);
  const idsDrop = new Set(Array.isArray(drop) ? drop.map((f) => txt(f.id)) : []);
  const filas = [...r, ...(Array.isArray(drop) ? drop.filter((f) => !r.some((x) => txt(x.id) === txt(f.id))) : [])];
  const tx = db.transaction((lista: Fila[]) => {
    db.prepare('DELETE FROM effi_articulos WHERE store_id = ?').run(storeId);
    const ins = db.prepare('INSERT OR REPLACE INTO effi_articulos (store_id, id, descripcion, referencia, ecommerce, stock, es_drop) VALUES (?,?,?,?,?,?,?)');
    for (const f of lista) {
      if (txt(f.vigente) === '0') continue;
      ins.run(storeId, txt(f.id), txt(f.descripcion), txt(f.referencia), txt(f.articulos_ecommerce), f.stock_empresa == null ? null : Number(f.stock_empresa), idsDrop.has(txt(f.id)) ? 1 : 0);
    }
  });
  tx(filas);
  return { total: filas.length, soloVinculados };
}

/** Un artículo por id, en vivo (con su marca de dropshipping). Lo guarda en la caché. */
async function articuloPorId(storeId: string, apiKey: string, id: string): Promise<ArticuloEffi | undefined> {
  const [r, d] = await Promise.all([
    effi<Fila[]>(apiKey, 'GET', '/api/articulo', { query: { id, por_pagina: 1 } }),
    effi<Fila[]>(apiKey, 'GET', '/api/articulo', { query: { id, dropshipping_distribuidor: 1, por_pagina: 1 } }),
  ]);
  const f = r.ok ? r.body.data?.[0] : undefined;
  if (!f || txt(f.vigente) === '0') return undefined;
  const a: ArticuloEffi = { id: txt(f.id), descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: f.stock_empresa == null ? null : Number(f.stock_empresa), drop: d.ok && d.body.data?.length ? 1 : 0 };
  try {
    db.prepare('INSERT OR REPLACE INTO effi_articulos (store_id, id, descripcion, referencia, ecommerce, stock, es_drop) VALUES (?,?,?,?,?,?,?)')
      .run(storeId, a.id, a.descripcion, a.referencia, a.ecommerce, a.stock, a.drop);
  } catch { /* caché opcional */ }
  return a;
}

/**
 * Convenios Dropshipping que la tienda ya usó en Effi (se leen de sus remisiones y
 * facturas como distribuidora). Effi no tiene un listado de convenios en la API.
 */
export async function conveniosDropshipping(apiKey: string): Promise<{ id: string; nombre: string }[]> {
  const out = new Map<string, string>();
  for (const ruta of ['/api/remision_v', '/api/factura_v']) {
    const r = await effi<Fila[]>(apiKey, 'GET', ruta, { query: { dropshipping_distribuidor: 1, por_pagina: 100 } });
    for (const f of r.ok ? r.body.data || [] : []) {
      const id = txt(f.convenio_dropshipping);
      if (id && id !== '1' && !out.has(id)) out.set(id, txt(f.nombre_convenio_dropshipping) || `Convenio ${id}`);
    }
  }
  return [...out].map(([id, nombre]) => ({ id, nombre }));
}

/** Búsqueda en vivo en Effi por nombre (palabras) o referencia, para vincular a mano. */
export async function buscarArticulosEffi(storeId: string, q: string): Promise<ArticuloEffi[] | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Conecta Effi primero.' };
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const [porNombre, porRef] = await Promise.all([
    effi<Fila[]>(c.apiKey, 'GET', '/api/articulo', { query: { descripcion: term, por_pagina: 40 } }),
    effi<Fila[]>(c.apiKey, 'GET', '/api/articulo', { query: { referencia: `${term}%`, por_pagina: 20 } }),
  ]);
  if (!porNombre.ok && !porRef.ok) return { error: mensajeError(porNombre) };
  const vistos = new Set<string>();
  const out: ArticuloEffi[] = [];
  for (const f of [...(porRef.body.data || []), ...(porNombre.body.data || [])]) {
    const id = txt(f.id);
    if (!id || vistos.has(id) || txt(f.vigente) === '0') continue;
    vistos.add(id);
    out.push({ id, descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: f.stock_empresa == null ? null : Number(f.stock_empresa) });
  }
  return out;
}

export function articulosCache(storeId: string): ArticuloEffi[] {
  return db.prepare('SELECT id, descripcion, referencia, ecommerce, stock, es_drop AS "drop" FROM effi_articulos WHERE store_id = ? ORDER BY descripcion').all(storeId) as ArticuloEffi[];
}

/** Id numérico estable que DealFlow le dio a una referencia (lo que Effi guardó como "ID producto ecommerce"). */
function idEcommerceDeRef(storeId: string, ref: string): number | null {
  if (!ref) return null;
  try {
    const r = db.prepare('SELECT id FROM effi_product_ids WHERE store_id = ? AND sku = ?').get(storeId, ref) as { id: number } | undefined;
    return r ? r.id : null;
  } catch { return null; }
}

interface VarianteDF { productId: string; variantId: string | null; producto: string; label: string; ref: string; effiId: string; proveedor: string }

/** Todas las variantes (y productos sin variantes) de la tienda con su vínculo actual. */
function variantesTienda(storeId: string): VarianteDF[] {
  const out: VarianteDF[] = [];
  const prods = db.prepare("SELECT id, nombre, sku, COALESCE(despacho_proveedor,'') proveedor FROM products WHERE store_id = ?").all(storeId) as { id: string; nombre: string; sku: string; proveedor: string }[];
  const vst = db.prepare("SELECT id, label, sku, COALESCE(refs,'{}') refs FROM variants WHERE product_id = ?");
  for (const p of prods) {
    const vs = vst.all(p.id) as { id: string; label: string; sku: string; refs: string }[];
    if (!vs.length) { out.push({ productId: p.id, variantId: null, producto: p.nombre, label: '', ref: p.sku || '', effiId: '', proveedor: p.proveedor }); continue; }
    for (const v of vs) {
      const refs = pj<Record<string, string>>(v.refs, {});
      out.push({ productId: p.id, variantId: v.id, producto: p.nombre, label: v.label || '', ref: String(refs.effi || v.sku || p.sku || ''), effiId: String(refs.effi_id || ''), proveedor: p.proveedor });
    }
  }
  return out;
}

/** Busca el artículo de Effi que corresponde a una variante de DealFlow. */
function articuloPara(storeId: string, v: VarianteDF, arts: ArticuloEffi[]): ArticuloEffi | undefined {
  if (v.effiId) { const a = arts.find((x) => x.id === v.effiId); if (a) return a; }
  // 1) Vinculado en Effi como producto de un ecommerce (Effi guarda nuestro id).
  const idEc = idEcommerceDeRef(storeId, v.ref);
  const candidatosEc = [idEc != null ? String(idEc) : '', v.variantId || '', v.productId].filter(Boolean);
  const porEc = arts.find((a) => a.ecommerce && a.ecommerce.split(',').map((s) => s.trim()).some((x) => candidatosEc.includes(x)));
  if (porEc) return porEc;
  // 2) Misma referencia.
  if (v.ref) { const a = arts.find((x) => x.referencia && x.referencia.trim().toLowerCase() === v.ref.trim().toLowerCase()); if (a) return a; }
  // 3) Mismo nombre ("Producto - Variante" o "Producto Variante").
  const esUnica = !v.label || norm(v.label) === 'unica';
  const nombres = esUnica ? [norm(v.producto)] : [norm(`${v.producto} ${v.label.replace(/·/g, ' ')}`)];
  return arts.find((a) => nombres.includes(norm(a.descripcion)));
}

/** Guarda el id del artículo de Effi en la variante (refs.effi_id). */
export function vincularArticulo(storeId: string, variantId: string, effiId: string): boolean {
  const own = db.prepare('SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(variantId, storeId);
  if (!own) return false;
  db.prepare("UPDATE variants SET refs = json_set(COALESCE(refs,'{}'), '$.effi_id', ?) WHERE id = ?").run(effiId, variantId);
  return true;
}

/** Descarga artículos y vincula automáticamente todas las variantes que casen. */
export async function sincronizarArticulos(storeId: string): Promise<{ total: number; soloVinculados: boolean; vinculadas: number; sinVinculo: { variantId: string | null; nombre: string }[]; productosEffi: number; sinProveedor: number } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Conecta Effi con la API key primero.' };
  const d = await descargarArticulos(storeId, c.apiKey);
  if ('error' in d) return d;
  const arts = articulosCache(storeId);
  let vinculadas = 0;
  const sinVinculo: { variantId: string | null; nombre: string }[] = [];
  // Solo los productos marcados "se despacha por Effi" (los de Dropi van por su lado).
  const todas = variantesTienda(storeId);
  const deEffi = todas.filter((v) => v.proveedor === 'effi');
  const productosEffi = new Set(deEffi.map((v) => v.productId)).size;
  const sinProveedor = new Set(todas.filter((v) => !v.proveedor).map((v) => v.productId)).size;
  for (const v of deEffi) {
    const a = articuloPara(storeId, v, arts);
    const nombre = v.label && norm(v.label) !== 'unica' ? `${v.producto} (${v.label})` : v.producto;
    if (a && v.variantId) { if (a.id !== v.effiId) vincularArticulo(storeId, v.variantId, a.id); vinculadas++; }
    else if (a) vinculadas++;
    else sinVinculo.push({ variantId: v.variantId, nombre });
  }
  return { total: d.total, soloVinculados: d.soloVinculados, vinculadas, sinVinculo, productosEffi, sinProveedor };
}

/** Variante de DealFlow a la que corresponde un ítem del pedido ("Producto (Talla M · Blanco)"). */
function varianteDeItem(it: { nombre: string; product_id?: string; variant_id?: string }, todas: VarianteDF[]): Emparejado<VarianteDF> {
  // 1) Ids guardados al crear el pedido: la fuente más confiable.
  if (it.variant_id) { const v = todas.find((x) => x.variantId === it.variant_id); if (v) return { v, motivo: '', parecidos: [] }; }
  if (it.product_id) {
    const vs = todas.filter((x) => x.productId === it.product_id);
    if (vs.length === 1) return { v: vs[0], motivo: '', parecidos: [] };
    if (vs.length) { const r = emparejarItem(it.nombre, vs); if (r.v) return r; }
  }
  // 2) Por nombre (pedidos viejos o ítems escritos a mano).
  const r = emparejarItem(it.nombre, todas);
  if (r.v) return r;
  // 3) Producto claro pero sin talla/color: si todas sus variantes apuntan al MISMO artículo de Effi, da igual cuál.
  const prod = r.parecidos[0] && r.parecidos[0].puntaje >= 0.6 ? todas.filter((x) => x.producto === r.parecidos[0].producto) : [];
  const ids = new Set(prod.map((v) => v.effiId).filter(Boolean));
  if (prod.length && ids.size === 1 && prod.every((v) => v.effiId)) return { v: prod[0], motivo: '', parecidos: r.parecidos };
  return r;
}

// ── Pedido → remisión de venta (+ guía opcional) ─────────────────────────────

db.exec(`CREATE TABLE IF NOT EXISTS effi_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  evento TEXT NOT NULL DEFAULT '',
  entrega TEXT NOT NULL DEFAULT '',
  resumen TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_effi_eventos_store ON effi_eventos(store_id, id)');

const celular10 = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length > 10 && d.startsWith('57') ? d.slice(-10) : d.slice(-10); };
const hoyMas = (dias: number) => new Date(Date.now() - 5 * 3600e3 + dias * 86400e3).toISOString().slice(0, 10); // hora Colombia

/** Busca el cliente en Effi por cédula (= celular); si no existe, lo crea. Devuelve el código del tercero. */
async function clienteEffi(c: EffiCfg, o: Fila, ubic: { provincia: string; ciudad: string }): Promise<{ tercero: string } | { error: string }> {
  const numero = celular10(txt(o.tel));
  if (numero.length < 7) return { error: 'El pedido no tiene un celular válido (se usa como documento del cliente en Effi).' };
  const busca = await effi<Fila[]>(c.apiKey, 'GET', '/api/cliente', { query: { t_dni: T_DNI_CEDULA, numero, por_pagina: 5 } });
  if (busca.ok && busca.body.data?.length) return { tercero: txt(busca.body.data[0].tercero) };
  const nombre = txt(o.cliente).trim().slice(0, 120) || 'Cliente';
  const r = await effi<Fila>(c.apiKey, 'POST', '/api/cliente', {
    body: {
      t_dni: T_DNI_CEDULA, numero, nombre, celular: numero, whatsapp: numero,
      direcciones: [{ id_pais: PAIS_COLOMBIA, id_provincia: Number(ubic.provincia), id_ciudad: Number(ubic.ciudad), direccion: txt(o.direccion).slice(0, 200) }],
      observacion: 'Cliente creado por DealFlow',
      ...(c.sucursal ? { sucursal: Number(c.sucursal) } : {}),
    },
  });
  if (r.ok && r.body.data) return { tercero: txt(r.body.data.tercero) };
  // Carrera: ya existía como cliente → volvemos a buscar.
  const otra = await effi<Fila[]>(c.apiKey, 'GET', '/api/cliente', { query: { t_dni: T_DNI_CEDULA, numero, por_pagina: 5 } });
  if (otra.ok && otra.body.data?.length) return { tercero: txt(otra.body.data[0].tercero) };
  return { error: `No se pudo crear el cliente en Effi: ${mensajeError(r)}` };
}

export interface ResultadoEffi { remision: string; sucursal: string; id: string; guia: string; transportadora: string; avisos: string[] }

/** Lo que se le mandaría a Effi (sin crear nada): para revisar antes de despachar. */
// Un fallo inesperado no debe tumbar el servidor: se devuelve como error (y queda en la traza).
const errorInterno = (e: unknown): { error: string } => {
  console.error('[effi] error interno', e);
  return { error: `Error interno de DealFlow: ${e instanceof Error ? e.message : String(e)}` };
};

export function prepararRemision(storeId: string, orderId: string, reintento = false, origen = 'revision'): ReturnType<typeof prepararRemisionInterna> {
  return conPedido(storeId, orderId, async () => {
    const r = await prepararRemisionInterna(storeId, orderId, reintento).catch(errorInterno);
    if (origen === 'revision') {
      if ('error' in r) trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'Revisión para Effi: no se puede enviar', detalle: r.error });
      else trazar(storeId, orderId, { etapa: 'despacho', nivel: 'info', titulo: 'Revisión para Effi lista', detalle: r.avisos.join(' '), datos: { lineas: r.lineas, remision: r.body } });
    }
    return r;
  });
}

async function prepararRemisionInterna(storeId: string, orderId: string, reintento = false): Promise<{ body: Record<string, unknown>; o: Fila; ubic: { provincia: string; ciudad: string; nombre: string }; lineas: { item: string; articulo: string }[]; avisos: string[] } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c || !effiApiListo(storeId)) return { error: 'Effi no está configurado: conecta la API key y elige sucursal, bodega, centro de costos y forma de pago en Integraciones.' };
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const items = db.prepare('SELECT qty, nombre, precio, product_id, variant_id FROM order_items WHERE order_id = ?').all(orderId) as { qty: number; nombre: string; precio: number; product_id: string; variant_id: string }[];
  if (!items.length) return { error: 'El pedido no tiene productos.' };
  if (!txt(o.ciudad).trim()) return { error: 'El pedido no tiene ciudad.' };
  if (!txt(o.direccion).trim()) return { error: 'El pedido no tiene dirección.' };

  let arts = articulosCache(storeId);
  if (!arts.length) { const d = await descargarArticulos(storeId, c.apiKey); if ('error' in d) return d; arts = articulosCache(storeId); }
  const todas = variantesTienda(storeId);
  const avisos: string[] = [];
  const lineas: { item: string; articulo: string }[] = [];
  const conceptos: { articulo: number; descripcion: string; cantidad: number; precio: number }[] = [];
  const sinVinculo: string[] = [];
  const esDrop: boolean[] = [];
  const enVivo = new Set<string>(); // artículos ya consultados en vivo en este pedido
  for (const it of items) {
    const emp = varianteDeItem(it, todas);
    const v = emp.v;
    let a = v ? articuloPara(storeId, v, arts) : undefined;
    // El vínculo guardado (manual o automático) es la verdad aunque el artículo no
    // esté en la caché (p. ej. artículos de un proveedor dropshipping): lo traemos en vivo.
    if (v?.effiId && (!a || a.id !== v.effiId)) {
      enVivo.add(v.effiId);
      a = (await articuloPorId(storeId, c.apiKey, v.effiId)) || { id: v.effiId, descripcion: v.producto, referencia: v.ref, ecommerce: '', stock: null };
    }
    if (!a && v?.ref) {
      // Último intento en vivo por referencia (por si la caché está vieja).
      const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/articulo', { query: { referencia: v.ref, por_pagina: 5 } });
      const f = r.ok ? r.body.data?.[0] : undefined;
      if (f) a = { id: txt(f.id), descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: null };
    }
    if (!a) {
      // Mensaje preciso: qué parte del vínculo falta.
      const motivo = !v ? emp.motivo : `la variante ${v.label || 'única'} de ${v.producto} no tiene artículo de Effi vinculado`;
      sinVinculo.push(`${it.nombre} (${motivo})`);
      trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: `Sin vínculo: ${it.nombre}`, detalle: motivo, datos: { item: it.nombre, idsGuardados: { producto: it.product_id, variante: it.variant_id }, productosParecidos: emp.parecidos, variante: v ? { producto: v.producto, label: v.label, ref: v.ref, effiId: v.effiId, proveedor: v.proveedor } : null } });
      continue;
    }
    if (v?.variantId && v.effiId !== a.id) vincularArticulo(storeId, v.variantId, a.id);
    // ¿Artículo de proveedor dropshipping? La caché vieja no traía la marca: se confirma en vivo.
    if (a.drop !== 1 && !enVivo.has(a.id)) {
      const vivo = await articuloPorId(storeId, c.apiKey, a.id);
      if (vivo) a = { ...a, drop: vivo.drop };
    }
    esDrop.push(a.drop === 1);
    lineas.push({ item: `${it.qty}× ${it.nombre}`, articulo: `${a.descripcion}${a.referencia ? ` [${a.referencia}]` : ''} · #${a.id}${a.drop === 1 ? ' · dropshipping' : ''}` });
    conceptos.push({ articulo: Number(a.id), descripcion: it.nombre.slice(0, 250), cantidad: Math.max(1, Number(it.qty) || 1), precio: Math.max(0, Math.round(Number(it.precio) || 0)) });
  }
  if (sinVinculo.length) return { error: `No pudimos emparejar con Effi: ${sinVinculo.join(' · ')}. Revisa el vínculo en Integraciones → Effi → Artículos.` };

  // Dropshipping: si los artículos son de un proveedor, la remisión debe llevar el
  // convenio; sin él Effi la toma como mercancía propia y exige stock en tu bodega.
  let convenio = '';
  if (esDrop.some(Boolean)) {
    convenio = c.convenioDropshipping;
    if (!convenio) {
      const lista = await conveniosDropshipping(c.apiKey);
      if (lista.length === 1) {
        convenio = lista[0].id;
        guardarCfgEffi(storeId, { convenioDropshipping: convenio });
        avisos.push(`Se detectó y guardó tu convenio dropshipping: ${lista[0].nombre} (${convenio}).`);
      } else if (lista.length > 1) {
        return { error: `Estos productos son de un proveedor dropshipping y tienes varios convenios (${lista.map((x) => `${x.nombre} = ${x.id}`).join(', ')}). Elige cuál usar en Integraciones → Effi → Convenio dropshipping.` };
      } else {
        return { error: 'Estos productos son de un proveedor dropshipping en Effi, pero falta el código del convenio dropshipping. Escríbelo en Integraciones → Effi → Convenio dropshipping (lo ves en Effi → Dropshipping → Convenios).' };
      }
    }
    if (esDrop.some((x) => !x)) avisos.push('El pedido mezcla productos propios y de proveedor dropshipping: los propios sí necesitan stock en tu bodega.');
  }

  const ubic = await resolverUbicacion(c.apiKey, txt(o.departamento), txt(o.ciudad));
  if ('error' in ubic) return ubic;

  // Totales: si el pedido trae un total menor a la suma (combos/promos), la
  // diferencia va como descuento repartido entre los conceptos.
  const envio = Math.max(0, Math.round(Number(o.envio) || 0));
  const sumaItems = conceptos.reduce((a, k) => a + k.cantidad * k.precio, 0);
  const totalPedido = Math.round(Number(o.total) || 0) || sumaItems + envio;
  const objetivoItems = Math.max(0, totalPedido - (envio && c.articuloFlete ? envio : 0));
  const descuentos = conceptos.map(() => 0);
  if (objetivoItems < sumaItems && sumaItems > 0) {
    let resto = sumaItems - objetivoItems;
    conceptos.forEach((k, i) => {
      const parte = i === conceptos.length - 1 ? resto : Math.round(((k.cantidad * k.precio) / sumaItems) * (sumaItems - objetivoItems));
      descuentos[i] = Math.min(parte, k.cantidad * k.precio);
      resto -= descuentos[i];
    });
  } else if (objetivoItems > sumaItems) {
    avisos.push(`El total del pedido ($${totalPedido.toLocaleString('es-CO')}) es mayor que la suma de los productos; Effi usará los precios de los productos.`);
  }
  if (envio && c.articuloFlete) conceptos.push({ articulo: Number(c.articuloFlete), descripcion: 'Flete de envío', cantidad: 1, precio: envio });
  else if (envio) avisos.push(`El pedido tiene envío de $${envio.toLocaleString('es-CO')} pero no hay "artículo flete" configurado: no se cobra en la remisión.`);
  if (descuentos.length < conceptos.length) descuentos.push(0);
  const total = conceptos.reduce((a, k, i) => a + k.cantidad * k.precio - (descuentos[i] || 0), 0);

  const numero = txt(o.numero);
  const key = `df-${storeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${numero}${reintento ? `-r${Date.now().toString(36).slice(-5)}` : ''}`.slice(0, 36);
  const body: Record<string, unknown> = {
    idempotency_key: key,
    sucursal: Number(c.sucursal), bodega: Number(c.bodega), centro_costos: Number(c.centroCostos),
    fecha_entrega: hoyMas(c.diasEntrega), divisa: 'COP', trm: 1,
    cliente: 0, // se llena con el tercero al despachar
    id_pais_cliente: PAIS_COLOMBIA, id_provincia_cliente: Number(ubic.provincia), id_ciudad_cliente: Number(ubic.ciudad),
    direccion_cliente: txt(o.direccion).slice(0, 200),
    observacion: [`DealFlow DF-${numero}`, txt(o.nota)].filter(Boolean).join(' · ').slice(0, 255),
    articulo: conceptos.map((k) => k.articulo), descripcion: conceptos.map((k) => k.descripcion),
    cantidad: conceptos.map((k) => k.cantidad), precio: conceptos.map((k) => k.precio), descuento: descuentos,
    t_forma_pago: [Number(c.formaPago)], valor_forma_pago: [total],
  };
  if (c.vendedor) body.vendedor = Number(c.vendedor);
  if (convenio) body.convenio_dropshipping = Number(convenio);
  if (c.formaPagoContado) {
    if (!c.medioPago) return { error: 'La forma de pago elegida es de contado: elige también el medio de pago (y la caja o cuenta) en Integraciones → Effi.' };
    body.medio_pago = [Number(c.medioPago)];
    body.valor_medio_pago = [total];
    if (c.caja) { const [s, id] = c.caja.split(':'); body.sucursal_caja_medio_pago = [Number(s)]; body.id_caja_medio_pago = [Number(id)]; }
    if (c.cuenta) body.cuenta_medio_pago = [Number(c.cuenta)];
  }
  return { body, o, ubic, lineas, avisos };
}

/** Despacha el pedido a Effi: cliente + remisión (+ guía si está activa). */
export function despacharEffi(storeId: string, orderId: string, reintento = false): Promise<ResultadoEffi | { error: string }> {
  return conPedido(storeId, orderId, async () => {
    trazar(storeId, orderId, { etapa: 'despacho', titulo: reintento ? 'Reenvío a Effi iniciado' : 'Envío a Effi iniciado' });
    const r = await despacharEffiInterno(storeId, orderId, reintento).catch(errorInterno);
    if ('error' in r) trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'Envío a Effi falló', detalle: r.error });
    else trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: `Remisión ${r.remision} creada en Effi${r.guia ? ` · guía ${r.guia}` : ''}`, detalle: r.avisos.join(' '), datos: r });
    return r;
  });
}

async function despacharEffiInterno(storeId: string, orderId: string, reintento = false): Promise<ResultadoEffi | { error: string }> {
  const c = cfgEffi(storeId)!;
  const prep = await prepararRemision(storeId, orderId, reintento, 'despacho');
  if ('error' in prep) return prep;
  const { body, o, ubic, avisos } = prep;
  const numDF = `DF-${txt(o.numero)}`;

  const cli = await clienteEffi(c, o, ubic);
  if ('error' in cli) { registrarLog(storeId, 'error', 'despacho', `${numDF}: ${cli.error}`); return cli; }
  body.cliente = Number(cli.tercero);

  const r = await effi<Fila>(c.apiKey, 'POST', '/api/remision_v', { body });
  let doc = r.body.data;
  if (!r.ok && r.http === 409) {
    // Reintento: Effi ya tiene la remisión de esta llave. Buscamos la que quedó.
    const prev = db.prepare('SELECT effi_doc FROM orders WHERE id = ?').get(orderId) as { effi_doc: string } | undefined;
    const d = pj<Fila>(prev?.effi_doc || '', {});
    if (d.id) doc = d;
    else { const e = 'Effi ya tiene una remisión para este pedido. Usa "Reenviar" si necesitas crear otra.'; registrarLog(storeId, 'warn', 'despacho', `${numDF}: ${e}`); return { error: e }; }
  } else if (!r.ok || !doc) {
    const e = `Effi no creó la remisión: ${mensajeError(r)}`;
    registrarLog(storeId, 'error', 'despacho', `${numDF}: ${e}`);
    return { error: e };
  }
  const remision = txt(doc!.id_transaccion) || `${txt(doc!.prefijo)}-${txt(doc!.id)}`;
  db.prepare("UPDATE orders SET despacho_proveedor = 'effi', woo_id = ?, effi_remision = ?, effi_doc = ? WHERE id = ?")
    .run(remision, remision, JSON.stringify({ sucursal: txt(doc!.sucursal), id: txt(doc!.id), prefijo: txt(doc!.prefijo), tercero: cli.tercero }), orderId);
  registrarLog(storeId, 'info', 'despacho', `${numDF} enviado a Effi: remisión ${remision} (cliente ${cli.tercero}).${avisos.length ? ' ' + avisos.join(' ') : ''}`);

  let guia = ''; let transportadora = '';
  if (c.guia.activa && c.guia.transportadora && c.guia.servicio && c.guia.formaPagoFlete && c.guia.remitente) {
    const g = await crearGuia(storeId, c, c.guia, o, { sucursal: txt(doc!.sucursal), id: txt(doc!.id) }, cli.tercero, ubic, reintento);
    if ('error' in g) avisos.push(g.error);
    else { guia = g.guia; transportadora = g.transportadora; }
  }
  return { remision, sucursal: txt(doc!.sucursal), id: txt(doc!.id), guia, transportadora, avisos };
}

export interface OpcionesGuia extends EffiGuiaCfg { cantPaquetes?: number; contenido?: string; nota?: string; recibeSabado?: boolean; valorDeclarado?: number }

/** Busca en los datos de Effi un enlace a PDF/imagen de la guía (si Effi lo manda). */
export function urlDocumentoGuia(obj: unknown): string {
  let hallado = '';
  const recorrer = (v: unknown) => {
    if (hallado || v == null) return;
    if (typeof v === 'string') { if (/^https?:\/\/\S+\.(pdf|png|jpe?g)(\?|$)/i.test(v) || /^https?:\/\/\S*(pdf|rotulo|guia)\S*$/i.test(v)) hallado = v; return; }
    if (typeof v === 'object') for (const x of Object.values(v as Fila)) recorrer(x);
  };
  recorrer(obj);
  return hallado;
}

async function crearGuia(storeId: string, c: EffiCfg, g: OpcionesGuia, o: Fila, docRef: { sucursal: string; id: string }, tercero: string, ubic: { provincia: string; ciudad: string }, reintento: boolean): Promise<{ guia: string; transportadora: string; idTransaccion: string; url: string } | { error: string }> {
  const numero = txt(o.numero);
  const body: Record<string, unknown> = {
    idempotency_key: `dfg-${storeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${numero}${reintento ? `-r${Date.now().toString(36).slice(-5)}` : ''}`.slice(0, 36),
    sucursal: Number(c.sucursal), transportadora: Number(g.transportadora), t_servicio: Number(g.servicio), t_forma_pago: Number(g.formaPagoFlete),
    cant_paquetes: Math.max(1, Math.round(g.cantPaquetes || 1)), peso_total: g.peso || 1, volumen_total: g.volumen || 1, alto: g.alto || 10, ancho: g.ancho || 10, largo: g.largo || 10,
    recibe_sabado: g.recibeSabado === false ? 0 : 1,
    contenido: (g.contenido || 'Mercancía').slice(0, 80), contenido_check: !g.contenido,
    valor_declarado_check: !(g.valorDeclarado && g.valorDeclarado > 0), valor_declarado: g.valorDeclarado && g.valorDeclarado > 0 ? Math.round(g.valorDeclarado) : Math.round(Number(o.total) || 0),
    ...(g.nota ? { nota_guia: g.nota.slice(0, 255) } : {}),
    t_trans_ref: [T_TRANS_REMISION_V], sucursal_ref: [Number(docRef.sucursal)], id_ref: [Number(docRef.id)],
    centro_costos: [Number(c.centroCostos)], remitente: [Number(g.remitente)], destinatario: [Number(tercero)],
    id_pais_destinatario: [PAIS_COLOMBIA], id_provincia_destinatario: [Number(ubic.provincia)], id_ciudad_destinatario: [Number(ubic.ciudad)],
    direccion_destinatario: [txt(o.direccion).slice(0, 200)],
    observacion: `DealFlow DF-${numero}`,
  };
  const r = await effi<{ guias?: Fila[] }>(c.apiKey, 'POST', '/api/guia_transporte', { body });
  if (!r.ok) {
    const e = `La remisión quedó creada, pero Effi no creó la guía: ${mensajeError(r)}`;
    registrarLog(storeId, 'warn', 'despacho', `DF-${numero}: ${e}`);
    return { error: e };
  }
  const gg = r.body.data?.guias?.[0] || {};
  const guia = txt(gg.guia);
  const transportadora = txt(gg.nombre_transportadora_efficommerce) || txt(gg.nombre_transportadora);
  const url = urlDocumentoGuia(gg);
  if (url) db.prepare('UPDATE orders SET guia_url = ? WHERE id = ?').run(url, txt(o.id));
  db.prepare('UPDATE orders SET effi_guia = ?, guia = CASE WHEN ? != \'\' THEN ? ELSE guia END, transportadora = CASE WHEN ? != \'\' THEN ? ELSE transportadora END WHERE id = ?')
    .run(JSON.stringify({ sucursal: txt(gg.sucursal), id: txt(gg.id), id_transaccion: txt(gg.id_transaccion) }), guia, guia, transportadora, transportadora, txt(o.id));
  registrarLog(storeId, 'info', 'despacho', `DF-${numero}: guía ${txt(gg.id_transaccion)}${guia ? ` (${transportadora} ${guia})` : ''} creada en Effi.`);
  return { guia, transportadora, idTransaccion: txt(gg.id_transaccion), url };
}

/** Genera la guía de un pedido que YA tiene remisión en Effi, con los datos que elige el dueño. */
export function generarGuiaPedido(storeId: string, orderId: string, g: OpcionesGuia, reintento = false): Promise<{ guia: string; transportadora: string; idTransaccion: string } | { error: string }> {
  return conPedido(storeId, orderId, async () => {
    trazar(storeId, orderId, { etapa: 'guia', titulo: 'Generación de guía iniciada', datos: { opciones: g } });
    const r = await generarGuiaInterna(storeId, orderId, g, reintento).catch(errorInterno);
    if ('error' in r) trazar(storeId, orderId, { etapa: 'guia', nivel: 'error', titulo: 'No se generó la guía', detalle: r.error });
    else trazar(storeId, orderId, { etapa: 'guia', nivel: 'ok', titulo: `Guía ${r.idTransaccion}${r.guia ? ` (${r.transportadora} ${r.guia})` : ''} creada` });
    return r;
  });
}

async function generarGuiaInterna(storeId: string, orderId: string, g: OpcionesGuia, reintento = false): Promise<{ guia: string; transportadora: string; idTransaccion: string } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  if (!g.transportadora || !g.servicio || !g.formaPagoFlete || !g.remitente) return { error: 'Elige transportadora, servicio, pago del flete y remitente.' };
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const d = pj<Fila>(txt(o.effi_doc), {});
  if (!d.id) return { error: 'Primero crea la remisión en Effi; la guía se genera sobre esa remisión.' };
  const ubic = await resolverUbicacion(c.apiKey, txt(o.departamento), txt(o.ciudad));
  if ('error' in ubic) return ubic;
  let tercero = txt(d.tercero);
  if (!tercero) { const cli = await clienteEffi(c, o, ubic); if ('error' in cli) return cli; tercero = cli.tercero; }
  // Recordamos la última elección como valores por defecto del formulario.
  guardarCfgEffi(storeId, { guia: { ...c.guia, transportadora: g.transportadora, servicio: g.servicio, formaPagoFlete: g.formaPagoFlete, remitente: g.remitente, peso: g.peso, volumen: g.volumen, alto: g.alto, ancho: g.ancho, largo: g.largo } });
  const yaTenia = !!pj<Fila>(txt(o.effi_guia), {}).id;
  const r = await crearGuia(storeId, c, g, o, { sucursal: txt(d.sucursal), id: txt(d.id) }, tercero, ubic, reintento || yaTenia);
  if ('error' in r) return { error: r.error.replace('La remisión quedó creada, pero Effi no creó la guía: ', 'Effi no creó la guía: ') };
  if (r.guia) {
    const fresca = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Fila;
    if (fresca?.tel && !Number(fresca.guia_avisada)) {
      try { const { avisarGuiaAlCliente } = await import('./despachos.js'); await avisarGuiaAlCliente(storeId, orderId); } catch { /* el aviso no bloquea */ }
    }
  }
  return r;
}

// ── Webhooks de Effi ─────────────────────────────────────────────────────────

/** Verifica X-Effi-Signature (sha256=<hex>) con el secreto del webhook. */
// Effi genera un secreto POR webhook (uno por evento): guardamos varios, separados
// por salto de línea, y el aviso es válido si casa con cualquiera.
export function firmaEffiValida(secretos: string, raw: Buffer, header: string): boolean {
  if (!secretos || !header) return false;
  const recibida = Buffer.from(header.replace(/^sha256=/i, '').trim().toLowerCase(), 'utf8');
  return secretos.split('\n').map((s) => s.trim()).filter(Boolean).some((secret) => {
    const calc = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8');
    return calc.length === recibida.length && timingSafeEqual(calc, recibida);
  });
}

/** Agrega un secreto de webhook (sin duplicar; guarda los últimos 12). */
export function agregarSecretoEffi(storeId: string, secreto: string): number {
  const c = cfgEffi(storeId);
  const lista = (c?.webhookSecret || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lista.includes(secreto)) lista.push(secreto);
  const final = lista.slice(-12);
  guardarCfgEffi(storeId, { webhookSecret: final.join('\n') });
  return final.length;
}

const ORDEN_ESTADO = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado', 'Cancelado'];
const rank = (e: string) => Math.max(0, ORDEN_ESTADO.indexOf(e));
function estadoPipeline(texto: string, hayGuia: boolean): string | null {
  const e = norm(texto);
  if (/entregad/.test(e)) return 'Entregado';
  if (/cancelad|devuelt|devoluc|rechaz|anulad/.test(e)) return 'Cancelado';
  if (/transito|despach|reparto|ruta|recogid|enviad|admitid|bodega|centro de/.test(e) || hayGuia) return 'Despachado';
  return null;
}

/** Busca un campo por varios nombres posibles (Effi manda los datos "como la API" y anida a veces). */
function campo(obj: unknown, ...claves: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  const o = obj as Fila;
  for (const k of claves) if (o[k] != null && o[k] !== '') return txt(o[k]);
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Array.isArray(v)) { const r = campo(v, ...claves); if (r) return r; }
  return '';
}

/**
 * Procesa un aviso de Effi. Guarda el evento (para diagnóstico) y, si es de una
 * remisión o guía de un pedido de DealFlow, actualiza guía/estado y avisa al cliente.
 */
export async function procesarWebhookEffi(storeId: string, evento: string, entrega: string, payload: unknown): Promise<string> {
  if (entrega) {
    const dup = db.prepare('SELECT id FROM effi_eventos WHERE store_id = ? AND entrega = ?').get(storeId, entrega);
    if (dup) return 'duplicado';
  }
  const ev = norm(evento);
  const datos = (payload && typeof payload === 'object' && (payload as Fila).data) ? (payload as Fila).data : payload;
  // Documento de venta de referencia (guías) o la propia remisión.
  const esGuia = /guia/.test(ev) || !!campo(datos, 'guia', 'est_guia', 'id_ref');
  const idRef = esGuia ? campo(datos, 'id_ref') : campo(datos, 'id');
  const sucRef = esGuia ? campo(datos, 'sucursal_ref') : campo(datos, 'sucursal');
  let resumen = `${evento || 'evento'}`;

  let orden: Fila | undefined;
  if (idRef) {
    const cands = db.prepare("SELECT * FROM orders WHERE store_id = ? AND despacho_proveedor = 'effi' AND effi_doc != ''").all(storeId) as Fila[];
    orden = cands.find((o) => { const d = pj<Fila>(txt(o.effi_doc), {}); return txt(d.id) === idRef && (!sucRef || !txt(d.sucursal) || txt(d.sucursal) === sucRef); });
  }
  if (!orden) {
    const g = campo(datos, 'guia');
    if (g) orden = db.prepare("SELECT * FROM orders WHERE store_id = ? AND guia = ? LIMIT 1").get(storeId, g) as Fila | undefined;
  }

  if (orden) {
    const numDF = `DF-${txt(orden.numero)}`;
    resumen += ` · ${numDF}`;
    if (/anulac/.test(ev) && /remision/.test(ev)) {
      registrarLog(storeId, 'warn', 'despacho', `Effi anuló la remisión ${txt(orden.effi_remision)} del pedido ${numDF}.`);
      db.prepare("UPDATE orders SET effi_remision = effi_remision || ' (anulada)' WHERE id = ? AND effi_remision NOT LIKE '%anulada%'").run(orden.id);
    } else if (esGuia) {
      const guia = campo(datos, 'guia');
      const transp = campo(datos, 'nombre_transportadora_efficommerce', 'nombre_transportadora');
      const estadoTxt = campo(datos, 'estado_efficommerce', 'estado_guia_efficommerce', 'estado_new_efficommerce', 'estado_new', 'estado', 'nombre_est_guia');
      if (guia && guia !== txt(orden.guia)) db.prepare('UPDATE orders SET guia = ? WHERE id = ?').run(guia, orden.id);
      const urlDoc = urlDocumentoGuia(datos);
      if (urlDoc && urlDoc !== txt(orden.guia_url)) db.prepare('UPDATE orders SET guia_url = ? WHERE id = ?').run(urlDoc, orden.id);
      if (transp) db.prepare('UPDATE orders SET transportadora = ? WHERE id = ?').run(transp, orden.id);
      if (estadoTxt) db.prepare('UPDATE orders SET estado_woo = ? WHERE id = ?').run(estadoTxt.slice(0, 60), orden.id);
      const nuevo = estadoPipeline(estadoTxt, !!(guia || orden.guia));
      if (nuevo && rank(nuevo) > rank(txt(orden.estado))) db.prepare('UPDATE orders SET estado = ? WHERE id = ?').run(nuevo, orden.id);
      resumen += `${guia ? ` · guía ${guia}` : ''}${estadoTxt ? ` · ${estadoTxt}` : ''}`;
      if (guia && !Number(orden.guia_avisada)) {
        try {
          const { avisarGuiaAlCliente } = await import('./despachos.js');
          if (txt(orden.tel)) await avisarGuiaAlCliente(txt(orden.store_id), txt(orden.id));
        } catch (e) { console.warn('[effi] no se pudo avisar la guía', e); }
      }
    }
  }
  if (orden) {
    // En la línea de tiempo del pedido: solo cuando algo cambió (las consultas periódicas no la llenan).
    const despues = db.prepare('SELECT estado, guia, estado_woo FROM orders WHERE id = ?').get(orden.id) as Fila | undefined;
    const cambio = !despues || txt(despues.estado) !== txt(orden.estado) || txt(despues.guia) !== txt(orden.guia) || txt(despues.estado_woo) !== txt(orden.estado_woo);
    if (evento !== 'Consulta de guía' || cambio) {
      trazar(storeId, txt(orden.id), { etapa: 'webhook', nivel: /anulac/.test(ev) ? 'warn' : 'info', titulo: evento === 'Consulta de guía' ? `Effi (consulta): ${resumen.split(' · ').slice(2).join(' · ') || 'sin cambios'}` : `Effi avisó: ${resumen}`, detalle: cambio && despues ? `Estado: ${txt(orden.estado)} → ${txt(despues.estado)}` : '', datos: payload });
    }
  }
  if (evento === 'Consulta de guía') return resumen; // consultas periódicas: no llenan el registro de eventos
  try {
    db.prepare('INSERT INTO effi_eventos (store_id, evento, entrega, resumen, payload) VALUES (?,?,?,?,?)')
      .run(storeId, evento.slice(0, 120), entrega.slice(0, 80), resumen.slice(0, 300), JSON.stringify(payload).slice(0, 20000));
    db.prepare('DELETE FROM effi_eventos WHERE store_id = ? AND id NOT IN (SELECT id FROM effi_eventos WHERE store_id = ? ORDER BY id DESC LIMIT 400)').run(storeId, storeId);
  } catch { /* el registro nunca rompe el webhook */ }
  return resumen;
}

export function eventosEffi(storeId: string, limite = 80): Fila[] {
  return db.prepare('SELECT id, evento, entrega, resumen, payload, created_at FROM effi_eventos WHERE store_id = ? ORDER BY id DESC LIMIT ?').all(storeId, limite) as Fila[];
}

/** Consulta en Effi la guía de la remisión del pedido (botón "Actualizar ahora"). */
export async function consultarEstadoEffi(storeId: string, orderId: string): Promise<{ estado: string; guia: string } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const d = pj<Fila>(txt(o.effi_doc), {});
  if (!d.id) return { error: 'Este pedido no tiene remisión en Effi.' };
  const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { id_ref: txt(d.id), por_pagina: 20 } });
  if (!r.ok) return { error: mensajeError(r) };
  const g = (r.body.data || []).find((x) => txt(x.t_trans_ref) === String(T_TRANS_REMISION_V) && (!txt(x.sucursal_ref) || txt(x.sucursal_ref) === txt(d.sucursal)));
  if (!g) return { estado: 'Remisión creada · aún sin guía', guia: '' };
  await procesarWebhookEffi(storeId, 'Consulta de guía', '', { data: g });
  const f = db.prepare('SELECT estado_woo, guia FROM orders WHERE id = ?').get(orderId) as { estado_woo: string; guia: string };
  return { estado: f.estado_woo || txt(g.estado_efficommerce) || txt(g.estado), guia: f.guia || txt(g.guia) };
}
