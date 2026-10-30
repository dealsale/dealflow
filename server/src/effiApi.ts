import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolverNombreCliente, nombreValido } from './nombres.js';
import { db, pj, registrarLog } from './db.js';
import { conPedido, trazar, trazarApi } from './trazabilidad.js';
import { emparejarItem, emparejarArticulos, palabrasClave, separarItemsPedido, type Emparejado, tokensVariante, mismoToken } from './emparejar.js';
import { nombreTransportadora } from './transportadoras.js';
import { estadoLogistico, siguienteEstado } from './estadosPedido.js';

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

const BASE = process.env.EFFI_BASE_URL || 'https://effi.com.co'; // EFFI_BASE_URL solo para pruebas
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
  /** Convenios que la tienda agregó a mano (Effi no tiene listado de convenios en la API). */
  convenios: { id: string; nombre: string }[];
  guia: EffiGuiaCfg;
  webhookToken: string; webhookSecret: string;
  /** Novedades de guías: avisar al cliente, que el bot recoja los datos y si envía la solución a Effi él solo. */
  novedades: NovedadesCfg;
  /** Registrar sola la devolución de venta en Effi cuando el pedido quede Devuelto. */
  devolucionAuto: boolean;
  /**
   * Vínculos 100 % manuales (por defecto): DealFlow NUNCA vincula, busca ni cambia el
   * artículo de una variante por su cuenta. Se despacha exactamente el artículo que la
   * tienda eligió (o el de la referencia/SKU que puso). false = modo automático anterior.
   */
  vinculoManual: boolean;
}
export interface NovedadesCfg { avisarCliente: boolean; botGestiona: boolean; autoEnviar: boolean }

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
    convenios: (Array.isArray(c.convenios) ? c.convenios as Record<string, unknown>[] : [])
      .map((x) => ({ id: String(x?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), nombre: String(x?.nombre ?? '').trim().slice(0, 80) }))
      .filter((x) => x.id),
    guia: { ...GUIA_VACIA, ...g, activa: g.activa === true } as EffiGuiaCfg,
    webhookToken: s('webhookToken'), webhookSecret: s('webhookSecret'),
    devolucionAuto: c.devolucionAuto === true,
    vinculoManual: c.vinculoManual !== false,
    novedades: (() => { const n = (c.novedades && typeof c.novedades === 'object' ? c.novedades : {}) as Record<string, unknown>; return { avisarCliente: n.avisarCliente !== false, botGestiona: n.botGestiona !== false, autoEnviar: n.autoEnviar === true }; })(),
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
  if (parcial.novedades) nuevo.novedades = { ...(base.novedades as NovedadesCfg), ...parcial.novedades };
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

export async function effi<T>(apiKey: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<{ ok: boolean; http: number; body: EffiResp<T> }> {
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
  for (let intento = 0; intento < 4; intento++) {
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
    // Effi limita las peticiones por segundo: se espera y se reintenta (hasta 3 veces, cada vez más).
    if (res.status === 429 && intento < 3) {
      const espera = Math.min(10, Math.max(1, Number(res.headers.get('retry-after')) || 2 * (intento + 1)));
      await new Promise((r) => setTimeout(r, espera * 1000));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as EffiResp<T>;
    return { ok: res.ok && body.ok !== false, http: res.status, body };
  }
  return { ok: false, http: 429, body: { ok: false, mensaje: 'Effi está limitando las peticiones (429). Intenta en un minuto.' } };
}

export function mensajeError(r: { http: number; body: EffiResp<unknown> }): string {
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
    bodegas: L(1).map((f) => ({ id: txt(f.id), sucursal: txt(f.sucursal), nombre: [nombreDeFila(f) || `Bodega ${txt(f.id)}`, txt(f.nombre_sucursal), txt(f.direccion)].filter(Boolean).join(' · ') })),
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
    remitentes: L(8).map(opcionRemitente),
    ecommerce: L(9).map((f) => ({ id: txt(f.id), nombre: txt(f.nombre), plataforma: txt(f.nombre_api) })),
  };
}

// ── Conexión automática: al pegar la API key, DealFlow configura todo solo ──────

export type PasoAuto = 'config' | 'convenios' | 'productos';
/**
 * Un paso de la configuración automática. No pisa lo que la tienda ya eligió:
 *  - config: sucursal, bodega, centro de costos, forma de pago y vendedor (si hay una
 *    sola opción, esa; si no, la más usada en tus últimas remisiones; la forma de pago
 *    prefiere crédito/contraentrega para que la remisión quede por cobrar).
 *  - convenios: detecta tus convenios dropshipping y los guarda.
 *  - productos: trae tus artículos, vincula productos y variantes por nombre y marca
 *    como "de Effi" los que encuentra; pasa el stock.
 */
export async function autoconfigurarEffi(storeId: string, paso: PasoAuto): Promise<{ ok: boolean; detalle: string; listo: boolean }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { ok: false, detalle: 'Conecta Effi primero.', listo: false };
  if (paso === 'config') {
    const l = await listasEffi(c.apiKey);
    if ('error' in l) return { ok: false, detalle: String(l.error), listo: false };
    type Op = { id: string; nombre: string; sucursal?: string; contado?: boolean };
    const L = (k: string) => (l[k] as Op[]) || [];
    // Lo más usado en las últimas remisiones.
    const rem = await effi<Fila[]>(c.apiKey, 'GET', '/api/remision_v', { query: { por_pagina: 100 } });
    const docs = rem.ok ? rem.body.data || [] : [];
    const masUsado = (...llaves: string[]) => {
      const cuenta = new Map<string, number>();
      for (const d of docs) { const v = llaves.map((k) => txt(d[k])).find((x) => x && x !== '0'); if (v) cuenta.set(v, (cuenta.get(v) || 0) + 1); }
      return [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    };
    const elegir = (lista: Op[], usado: string) => (lista.length === 1 ? lista[0].id : lista.find((x) => x.id === usado)?.id || '');
    const cambios: Partial<EffiCfg> = {};
    const hechos: string[] = [];
    const nombreDe = (lista: Op[], id: string) => lista.find((x) => x.id === id)?.nombre || id;
    if (!c.sucursal) { const v = elegir(L('sucursales'), masUsado('sucursal', 'id_sucursal')) || L('sucursales')[0]?.id || ''; if (v) { cambios.sucursal = v; hechos.push(`sucursal ${nombreDe(L('sucursales'), v)}`); } }
    const suc = cambios.sucursal || c.sucursal;
    if (!c.bodega) { const bods = L('bodegas').filter((b) => !suc || !b.sucursal || b.sucursal === suc); const v = elegir(bods, masUsado('bodega', 'id_bodega')) || bods[0]?.id || ''; if (v) { cambios.bodega = v; hechos.push(`bodega ${nombreDe(bods, v)}`); } }
    if (!c.centroCostos) { const v = elegir(L('centrosCostos'), masUsado('centro_costos', 'id_centro_costos')) || L('centrosCostos')[0]?.id || ''; if (v) { cambios.centroCostos = v; hechos.push(`centro de costos ${nombreDe(L('centrosCostos'), v)}`); } }
    if (!c.formaPago) {
      const fps = L('formasPago');
      const usado = fps.find((x) => x.id === masUsado('forma_pago', 'id_forma_pago'));
      const credito = fps.find((x) => !x.contado && /contra ?entrega|credito|cr[eé]dito/i.test(x.nombre)) || fps.find((x) => !x.contado);
      const fp = (usado && !usado.contado ? usado : credito) || usado || fps[0];
      if (fp) { cambios.formaPago = fp.id; cambios.formaPagoContado = !!fp.contado; hechos.push(`forma de pago ${fp.nombre}`); }
    }
    if (!c.vendedor) { const v = masUsado('vendedor', 'id_vendedor'); if (v) { cambios.vendedor = v; hechos.push('vendedor de tus remisiones'); } }
    if (Object.keys(cambios).length) guardarCfgEffi(storeId, cambios);
    const listo = effiApiListo(storeId);
    return { ok: listo, listo, detalle: hechos.length ? `Elegimos ${hechos.join(', ')}.` : listo ? 'Tu configuración ya estaba lista.' : 'No pudimos elegir todo solo: complétalo abajo.' };
  }
  if (paso === 'convenios') {
    const lista = await conveniosDropshipping(c.apiKey, c.convenios, storeId);
    const nuevos = lista.filter((x) => !c.convenios.some((g) => g.id === x.id)).map(({ id, nombre }) => ({ id, nombre }));
    const cambios: Partial<EffiCfg> = {};
    if (nuevos.length) cambios.convenios = [...c.convenios, ...nuevos];
    if (!c.convenioDropshipping && lista.length === 1) cambios.convenioDropshipping = lista[0].id;
    if (Object.keys(cambios).length) guardarCfgEffi(storeId, cambios);
    return { ok: true, listo: effiApiListo(storeId), detalle: lista.length ? `${lista.length} convenio${lista.length === 1 ? '' : 's'} dropshipping: ${lista.slice(0, 4).map((x) => x.nombre).join(', ')}${lista.length > 4 ? '…' : ''}.` : 'No vendes con convenios dropshipping (o aún no hay remisiones con convenio).' };
  }
  const r = await sincronizarArticulos(storeId);
  if ('error' in r) return { ok: false, detalle: r.error, listo: effiApiListo(storeId) };
  return { ok: true, listo: effiApiListo(storeId), detalle: `Leímos ${r.total} artículos de Effi. ${r.productosEffi} producto${r.productosEffi === 1 ? '' : 's'} de tu tienda se despacha${r.productosEffi === 1 ? '' : 'n'} por Effi${r.marcados ? ` (${r.marcados} marcados ahora)` : ''}: ${r.vinculadas} variantes conectadas, stock al día en ${r.stockActualizado}.${r.sinVinculo.length ? ` ${r.sinVinculo.length} variantes no casaron por nombre: revísalas en Artículos.` : ''}` };
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
    remitentes: Array.isArray(r) ? r.map(opcionRemitente) : [],
  };
}

/**
 * Remitente para los selectores. Muchas cuentas tienen varios con el MISMO nombre (la tienda)
 * en bodegas distintas (principal, garantías, devoluciones, la del proveedor…): por eso se
 * muestran con su ciudad, dirección y código, para elegir el punto de origen correcto.
 */
function opcionRemitente(f: Fila): { id: string; nombre: string; corto: string; ciudad: string; direccion: string; proveedor: string } {
  const ciudad = txt(f.nombre_ciudad); const direccion = txt(f.direccion);
  const corto = nombreDeFila(f);
  // El remitente puede ser la bodega de un proveedor: su nombre va aparte para no confundirlos.
  const proveedor = PROVEEDOR.map((k) => valorTexto(f[k])).find((x) => x && x.toLowerCase() !== corto.toLowerCase()) || '';
  const titulo = [corto || 'Sin nombre en Effi', proveedor && `proveedor ${proveedor}`].filter(Boolean).join(' — ');
  return { id: txt(f.codigo), corto, ciudad, direccion, proveedor, nombre: [titulo, ciudad, direccion].filter(Boolean).join(' · ') + ` (#${txt(f.codigo)})` };
}

/**
 * Nombre de un remitente o bodega de Effi. Según la cuenta, Effi lo manda en `nombre` o en
 * otros campos (razón social, tercero, empresa, contacto, bodega…); si `nombre` viene vacío
 * buscamos en esos, para no dejar al usuario eligiendo solo por la dirección.
 */
const NOMBRE = ['nombre', 'nombre_remitente', 'razon_social', 'nombre_tercero', 'nombre_empresa', 'empresa', 'nombre_comercial', 'nombre_contacto', 'contacto', 'nombre_bodega', 'alias', 'descripcion', 'nombre_sucursal'];
const PROVEEDOR = ['nombre_proveedor', 'proveedor', 'nombre_empresa_proveedor', 'empresa_proveedor', 'nombre_propietario', 'propietario', 'nombre_tercero', 'razon_social', 'nombre_empresa', 'empresa'];
const NO_NOMBRE = /ciudad|departamento|provincia|pais|barrio|transportadora|forma|medio|tipo|estado|vigente|usuario|creacion|correo|email|telefono|celular/i;
const valorTexto = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object') { const o = v as Fila; return txt(o.nombre ?? o.razon_social ?? o.name ?? '').trim(); }
  const t = String(v).trim();
  return /^\d*$/.test(t) ? '' : t; // un id numérico no es un nombre
};
function nombreDeFila(f: Fila): string {
  for (const k of NOMBRE) { const v = valorTexto(f[k]); if (v) return v; }
  for (const [k, v] of Object.entries(f)) if (/nombre|razon|empresa|tercero|proveedor|contacto|alias|descrip/i.test(k) && !NO_NOMBRE.test(k)) { const t = valorTexto(v); if (t) return t; }
  return '';
}

// ── Remitente por convenio (la bodega del proveedor) ─────────────────────────
// Un pedido que sale con el convenio dropshipping de un proveedor se despacha desde la
// bodega de ese proveedor. DealFlow lo recuerda por tienda (fijado a mano o aprendido de
// la última guía) y entre tiendas: si otro dropshipper ya despachó con ese convenio desde
// un remitente que también existe en tu Effi, se te sugiere solo.
db.exec(`CREATE TABLE IF NOT EXISTS effi_remitente_convenio (
  store_id TEXT NOT NULL, convenio TEXT NOT NULL, remitente TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'aprendido', actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, convenio)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS effi_remitente_global (
  convenio TEXT NOT NULL, remitente TEXT NOT NULL, usos INTEGER NOT NULL DEFAULT 0, tiendas TEXT NOT NULL DEFAULT '[]',
  actualizado TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (convenio, remitente)
)`);
const convenioValido = (c: unknown) => { const v = txt(c).trim(); return v && v !== '-' && v !== 'propio' ? v : ''; };
const convenioDelPedido = (o: Fila) => convenioValido(o.effi_convenio);

/** Recuerda con qué remitente salió una guía de ese convenio (sin pisar lo que se fijó a mano). */
function aprenderRemitente(storeId: string, convenio: string, remitente: string) {
  if (!convenioValido(convenio) || !remitente) return;
  try {
    db.prepare(`INSERT INTO effi_remitente_convenio (store_id, convenio, remitente, origen) VALUES (?,?,?,'aprendido')
      ON CONFLICT(store_id, convenio) DO UPDATE SET remitente = excluded.remitente, actualizado = datetime('now') WHERE effi_remitente_convenio.origen != 'manual'`).run(storeId, convenio, remitente);
    const g = db.prepare('SELECT tiendas FROM effi_remitente_global WHERE convenio = ? AND remitente = ?').get(convenio, remitente) as { tiendas: string } | undefined;
    const tiendas = [...new Set([...pj<string[]>(g?.tiendas || '[]', []), storeId])].slice(-200);
    db.prepare(`INSERT INTO effi_remitente_global (convenio, remitente, usos, tiendas) VALUES (?,?,1,?)
      ON CONFLICT(convenio, remitente) DO UPDATE SET usos = usos + 1, tiendas = excluded.tiendas, actualizado = datetime('now')`).run(convenio, remitente, JSON.stringify(tiendas));
  } catch { /* opcional */ }
}

/** Fija (o quita, con '') el remitente de un convenio para la tienda. */
export function fijarRemitenteConvenio(storeId: string, convenio: string, remitente: string) {
  const cv = convenioValido(convenio);
  if (!cv) return;
  if (!remitente) db.prepare('DELETE FROM effi_remitente_convenio WHERE store_id = ? AND convenio = ?').run(storeId, cv);
  else db.prepare(`INSERT INTO effi_remitente_convenio (store_id, convenio, remitente, origen) VALUES (?,?,?,'manual')
    ON CONFLICT(store_id, convenio) DO UPDATE SET remitente = excluded.remitente, origen = 'manual', actualizado = datetime('now')`).run(storeId, cv, remitente);
}

export function remitentesPorConvenio(storeId: string): { convenio: string; remitente: string; origen: string }[] {
  return db.prepare('SELECT convenio, remitente, origen FROM effi_remitente_convenio WHERE store_id = ?').all(storeId) as { convenio: string; remitente: string; origen: string }[];
}

/**
 * El remitente que le corresponde a un pedido: el de su convenio (fijado o aprendido en la
 * tienda; si no, el que usan otras tiendas con ese convenio y también existe en esta Effi).
 * null si no se puede saber: entonces lo elige la persona.
 */
export async function remitenteSugerido(storeId: string, apiKey: string, o: { orderId?: string; convenio?: string }): Promise<{ remitente: string; nombre: string; motivo: string } | null> {
  let convenio = convenioValido(o.convenio);
  if (!convenio && o.orderId) {
    const ord = db.prepare('SELECT effi_convenio FROM orders WHERE id = ? AND store_id = ?').get(o.orderId, storeId) as Fila | undefined;
    convenio = convenioDelPedido(ord || {});
    if (!convenio) {
      // Aún sin remisión: el convenio de sus productos.
      const pids = (db.prepare("SELECT DISTINCT COALESCE(product_id,'') p FROM order_items WHERE order_id = ?").all(o.orderId) as { p: string }[]).map((x) => x.p).filter(Boolean);
      const cvs = [...new Set(pids.map((p) => convenioValido(convenioDeProducto(p)) || convenioValido(convenioAprendidoProducto(storeId, p))).filter(Boolean))];
      if (cvs.length === 1) convenio = cvs[0];
    }
  }
  if (!convenio) return null;
  const vigentes = await remitentesVigentes(storeId, apiKey);
  const ok = (r: string) => !!r && (!vigentes || vigentes.has(r));
  const nombreConv = conveniosConocidos(storeId).find((x) => x.id === convenio)?.nombre || `convenio ${convenio}`;
  const propio = db.prepare('SELECT remitente, origen FROM effi_remitente_convenio WHERE store_id = ? AND convenio = ?').get(storeId, convenio) as { remitente: string; origen: string } | undefined;
  if (propio && ok(propio.remitente)) return { remitente: propio.remitente, nombre: vigentes?.get(propio.remitente) || `#${propio.remitente}`, motivo: propio.origen === 'manual' ? `el remitente que fijaste para ${nombreConv}` : `el que usaste la última vez con ${nombreConv}` };
  const otros = db.prepare('SELECT remitente FROM effi_remitente_global WHERE convenio = ? ORDER BY usos DESC, actualizado DESC LIMIT 10').all(convenio) as { remitente: string }[];
  const g = otros.find((x) => ok(x.remitente) && vigentes);
  if (g) return { remitente: g.remitente, nombre: vigentes!.get(g.remitente) || `#${g.remitente}`, motivo: `la bodega del proveedor de ${nombreConv} (la usan otras tiendas con ese convenio)` };
  return null;
}

// ── Nombres claros para los remitentes ───────────────────────────────────────
// Effi suele poner a TODOS los remitentes de una cuenta el mismo nombre (el de la tienda),
// así que solo se distinguen por la dirección. Para que se reconozcan: el apodo que les
// ponga la tienda y el proveedor cuya bodega es (por los convenios con que se han usado).
db.exec(`CREATE TABLE IF NOT EXISTS effi_remitente_alias (
  store_id TEXT NOT NULL, remitente TEXT NOT NULL, alias TEXT NOT NULL,
  PRIMARY KEY (store_id, remitente)
)`);
export function ponerAliasRemitente(storeId: string, remitente: string, alias: string) {
  const a = alias.trim().slice(0, 60);
  if (!remitente) return;
  if (!a) db.prepare('DELETE FROM effi_remitente_alias WHERE store_id = ? AND remitente = ?').run(storeId, remitente);
  else db.prepare('INSERT INTO effi_remitente_alias (store_id, remitente, alias) VALUES (?,?,?) ON CONFLICT(store_id, remitente) DO UPDATE SET alias = excluded.alias').run(storeId, remitente, a);
  cacheRemitentes.delete(storeId);
}

type OpcionRem = ReturnType<typeof opcionRemitente>;
/** Le pone a cada remitente su apodo y su proveedor, y deja primero los que se reconocen. */
export function rotularRemitentes(storeId: string, lista: OpcionRem[]): (OpcionRem & { alias: string; proveedores: string[] })[] {
  const nombresConv = new Map(conveniosConocidos(storeId).map((c) => [c.id, c.nombre]));
  try {
    for (const p of db.prepare('SELECT nombre, convenios FROM proveedor_cuentas WHERE activo = 1').all() as { nombre: string; convenios: string }[]) {
      for (const cv of pj<string[]>(p.convenios, [])) if (p.nombre && (!nombresConv.get(cv) || /^Convenio /.test(nombresConv.get(cv)!))) nombresConv.set(String(cv), p.nombre);
    }
  } catch { /* sin portal de proveedores */ }
  const provDe = new Map<string, Set<string>>();
  const agregar = (rem: string, cv: string) => { const n = nombresConv.get(cv); if (!n) return; if (!provDe.has(rem)) provDe.set(rem, new Set()); provDe.get(rem)!.add(n); };
  for (const r of db.prepare('SELECT convenio, remitente FROM effi_remitente_convenio WHERE store_id = ?').all(storeId) as { convenio: string; remitente: string }[]) agregar(r.remitente, r.convenio);
  for (const r of db.prepare('SELECT convenio, remitente FROM effi_remitente_global').all() as { convenio: string; remitente: string }[]) agregar(r.remitente, r.convenio);
  const alias = new Map((db.prepare('SELECT remitente, alias FROM effi_remitente_alias WHERE store_id = ?').all(storeId) as { remitente: string; alias: string }[]).map((r) => [r.remitente, r.alias]));
  // Si todos se llaman igual (el nombre de la tienda), ese nombre no ayuda: se omite.
  const repetido = lista.length > 1 && lista.every((x) => x.corto && x.corto === lista[0].corto);
  const out = lista.map((x) => {
    const provs = [...(provDe.get(x.id) || [])];
    if (x.proveedor && !provs.includes(x.proveedor)) provs.push(x.proveedor);
    const ap = alias.get(x.id) || '';
    const titulo = ap ? `📌 ${ap}${provs.length ? ` — proveedor ${provs.join(' / ')}` : ''}`
      : provs.length ? `🏭 Bodega de ${provs.join(' / ')}` : repetido ? '' : (x.corto || 'Sin nombre en Effi');
    return { ...x, alias: ap, proveedores: provs, nombre: [titulo, x.ciudad, x.direccion].filter(Boolean).join(' · ') + ` (#${x.id})` };
  });
  const peso = (x: typeof out[number]) => (x.alias ? 0 : x.proveedores.length ? 1 : 2);
  return out.map((x, i) => ({ x, i })).sort((a, b) => peso(a.x) - peso(b.x) || a.i - b.i).map(({ x }) => x);
}

// Remitentes vigentes de cada tienda (10 min): para no crear guías con uno que ya no existe.
const cacheRemitentes = new Map<string, { t: number; v: Map<string, string> }>();
const camposLogueados = new Set<string>();
async function remitentesVigentes(storeId: string, apiKey: string): Promise<Map<string, string> | null> {
  const c = cacheRemitentes.get(storeId);
  if (c && Date.now() - c.t < 10 * 60e3) return c.v;
  const r = await todo<Fila>(apiKey, '/api/remitente', {}, 5);
  if (!Array.isArray(r)) return null;
  const v = new Map(rotularRemitentes(storeId, r.map(opcionRemitente)).map((x) => [x.id, x.nombre]));
  cacheRemitentes.set(storeId, { t: Date.now(), v });
  // Una vez por arranque: qué campos trae Effi en los remitentes de esta tienda (para soporte).
  if (!camposLogueados.has(storeId) && r.length) {
    camposLogueados.add(storeId);
    const sinNombre = r.filter((f) => !nombreDeFila(f)).length;
    registrarLog(storeId, sinNombre ? 'warn' : 'info', 'effi', `Remitentes de Effi: ${r.length}${sinNombre ? `, ${sinNombre} sin nombre` : ''}. Campos que manda Effi: ${Object.keys(r[0]).join(', ')}.`);
  }
  return v;
}

// ── Ubicación (departamento / ciudad) ────────────────────────────────────────

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Departamentos y ciudades de Effi: tabla GLOBAL (igual para todas las tiendas). Se
// guardan en la base para no depender de que Effi responda en cada despacho: si su
// /api/ciudad falla (p. ej. 500), seguimos resolviendo con lo ya guardado.
db.exec(`CREATE TABLE IF NOT EXISTS effi_geo (
  tipo TEXT NOT NULL,               -- 'provincia' | 'ciudad'
  id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  provincia TEXT NOT NULL DEFAULT '',
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tipo, id)
)`);
// Medellín (de la documentación de Effi), por si la tabla aún está vacía.
db.prepare("INSERT OR IGNORE INTO effi_geo (tipo, id, nombre, provincia) VALUES ('provincia','776','Antioquia',''), ('ciudad','12601','Medellín','776')").run();
const guardarGeo = (tipo: 'provincia' | 'ciudad', filas: { id: string; nombre: string; provincia?: string }[]) => {
  const ins = db.prepare("INSERT OR REPLACE INTO effi_geo (tipo, id, nombre, provincia, actualizado) VALUES (?,?,?,?,datetime('now'))");
  db.transaction(() => { for (const f of filas) if (f.id && f.nombre) ins.run(tipo, f.id, f.nombre, f.provincia || ''); })();
};
const geoGuardado = (tipo: 'provincia' | 'ciudad', provincia?: string) =>
  (provincia
    ? db.prepare('SELECT id, nombre, provincia FROM effi_geo WHERE tipo = ? AND provincia = ?').all(tipo, provincia)
    : db.prepare('SELECT id, nombre, provincia FROM effi_geo WHERE tipo = ?').all(tipo)) as { id: string; nombre: string; provincia: string }[];
// Departamentos cuya lista COMPLETA de ciudades ya está guardada (no solo la semilla).
const provCompletas = new Set<string>();

async function provincias(apiKey: string): Promise<{ id: string; nombre: string }[]> {
  const guardadas = geoGuardado('provincia');
  if (guardadas.length > 20) return guardadas;
  const r = await todo<Fila>(apiKey, '/api/provincia', { pais: PAIS_COLOMBIA }, 3);
  const lista = Array.isArray(r) ? r.map((f) => ({ id: txt(f.id), nombre: txt(f.nombre) })) : [];
  if (lista.length) { guardarGeo('provincia', lista); return lista; }
  return guardadas;
}
async function ciudadesDe(apiKey: string, provincia: string): Promise<{ id: string; nombre: string; provincia: string }[]> {
  if (provCompletas.has(provincia)) return geoGuardado('ciudad', provincia);
  const r = await todo<Fila>(apiKey, '/api/ciudad', { provincia }, 5);
  const lista = Array.isArray(r) ? r.map((f) => ({ id: txt(f.id), nombre: txt(f.nombre), provincia: txt(f.provincia) || provincia })) : [];
  if (lista.length) { guardarGeo('ciudad', lista); provCompletas.add(provincia); return lista; }
  return geoGuardado('ciudad', provincia); // Effi falló: lo que ya teníamos guardado
}
/**
 * Guarda TODAS las ciudades de Colombia la primera vez que una API key responde bien
 * (en segundo plano, sin prisa). Después, resolver la ciudad de un pedido ya no
 * depende de que Effi responda.
 */
let precargando = false;
async function precargarGeo(apiKey: string): Promise<void> {
  if (precargando) return;
  precargando = true;
  try {
    for (const p of await provincias(apiKey)) {
      if (provCompletas.has(p.id)) continue;
      const cs = await ciudadesDe(apiKey, p.id);
      if (!cs.length) break; // Effi está fallando: se reintenta en el próximo despacho
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally { precargando = false; }
}
// Al arrancar: si ya hay ciudades guardadas de un departamento con varias, se da por completo.
for (const f of db.prepare("SELECT provincia, COUNT(*) n FROM effi_geo WHERE tipo = 'ciudad' GROUP BY provincia HAVING n > 3").all() as { provincia: string }[]) provCompletas.add(f.provincia);

/** Convierte "Antioquia" + "Medellín" en los ids de Effi. Tolera tildes y "Bogotá D.C.". */
export async function resolverUbicacion(apiKey: string, departamento: string, ciudad: string): Promise<{ provincia: string; ciudad: string; nombre: string } | { error: string }> {
  const nc = norm(ciudad).replace(/\b(d c|dc|distrito capital)\b/g, '').trim();
  let nd = norm(departamento).replace(/\b(departamento|depto|de)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nd && /bogota/.test(nc)) nd = 'bogota';
  const provs = await provincias(apiKey);
  if (!provs.length) return { error: 'Effi no respondió la lista de departamentos. No es un error de la dirección: intenta en unos minutos.' };
  const candProv = nd
    ? provs.filter((p) => norm(p.nombre) === nd).concat(provs.filter((p) => norm(p.nombre) !== nd && (norm(p.nombre).includes(nd) || nd.includes(norm(p.nombre)))))
    : [];
  // Sin departamento claro: buscamos la ciudad por nombre en todo el país.
  const buscarEn = candProv.length ? candProv : [];
  for (const p of buscarEn) {
    const cs = await ciudadesDe(apiKey, p.id);
    const hit = cs.find((c) => norm(c.nombre) === nc) || cs.find((c) => nc && (norm(c.nombre).startsWith(nc) || nc.startsWith(norm(c.nombre))));
    if (hit) { void precargarGeo(apiKey).catch(() => {}); return { provincia: p.id, ciudad: hit.id, nombre: `${hit.nombre}, ${p.nombre}` }; }
  }
  const r = await effi<Fila[]>(apiKey, 'GET', '/api/ciudad', { query: { nombre: ciudad.trim().slice(0, 40), por_pagina: 100 } });
  if (r.ok) guardarGeo('ciudad', (r.body.data || []).map((c) => ({ id: txt(c.id), nombre: txt(c.nombre), provincia: txt(c.provincia) })));
  const todas: Fila[] = r.ok ? (r.body.data || []) : geoGuardado('ciudad').filter((c) => norm(c.nombre) === nc);
  const exactas = todas.filter((c) => norm(txt(c.nombre)) === nc);
  if (exactas.length === 1) {
    const c = exactas[0];
    const pv = provs.find((p) => p.id === txt(c.provincia));
    return { provincia: txt(c.provincia), ciudad: txt(c.id), nombre: `${txt(c.nombre)}, ${pv?.nombre || txt(c.nombre_provincia)}` };
  }
  if (exactas.length > 1) return { error: `La ciudad "${ciudad}" existe en varios departamentos; revisa el departamento del pedido.` };
  // Effi falló al consultar (no es que la ciudad no exista): decirlo claro.
  if (!r.ok) {
    return { error: r.http === 403
      ? 'El usuario de la API key de Effi no tiene permiso para consultar ciudades: en Effi dale permiso de consulta a "Tablas maestras".'
      : `Effi está fallando al consultar ciudades (error ${r.http || 'de conexión'} de Effi). No es un error de la dirección "${ciudad}". Si sigue, revisa en Effi que el usuario de la API key tenga permiso de consulta en "Tablas maestras", o intenta en unos minutos.` };
  }
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

/** Stock de un artículo: el de la empresa o, si no viene, la suma de sus bodegas. */
function stockDe(f: Fila): number | null {
  if (f.stock_empresa != null && !isNaN(Number(f.stock_empresa))) return Number(f.stock_empresa);
  if (Array.isArray(f.stock_bodegas) && f.stock_bodegas.length) return (f.stock_bodegas as Fila[]).reduce((a, b) => a + Math.max(0, Number(b.stock) || 0), 0);
  return null;
}

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
      ins.run(storeId, txt(f.id), txt(f.descripcion), txt(f.referencia), txt(f.articulos_ecommerce), stockDe(f), idsDrop.has(txt(f.id)) ? 1 : 0);
    }
  });
  tx(filas);
  return { total: filas.length, soloVinculados };
}

// Stock de cada artículo por bodega (de la última lectura en vivo), para elegir de qué bodega sale.
const bodegasDe = new Map<string, { id: string; nombre: string; stock: number }[]>();
const cacheBodegas = new Map<string, { ts: number; lista: { id: string; nombre: string; sucursal: string }[] }>();
async function bodegasEffi(storeId: string, apiKey: string): Promise<{ id: string; nombre: string; sucursal: string }[]> {
  const c = cacheBodegas.get(storeId);
  if (c && Date.now() - c.ts < 3600e3) return c.lista;
  const r = await todo<Fila>(apiKey, '/api/bodega', {}, 5);
  const lista = Array.isArray(r) ? r.map((f) => ({ id: txt(f.id), nombre: nombreDeFila(f) || `Bodega ${txt(f.id)}`, sucursal: txt(f.sucursal) })) : [];
  cacheBodegas.set(storeId, { ts: Date.now(), lista });
  return lista;
}

// Artículos de la tienda VINCULADOS a un proveedor dropshipping (caché 30 min). En muchas
// cuentas cada prenda existe dos veces en Effi: el artículo propio (sin stock) y el que
// está vinculado al proveedor. Para despachar hay que usar el del proveedor.
const cacheDrop = new Map<string, { ts: number; lista: ArticuloEffi[] }>();
async function articulosDrop(storeId: string, apiKey: string): Promise<ArticuloEffi[]> {
  const c = cacheDrop.get(storeId);
  if (c && Date.now() - c.ts < 30 * 60e3) return c.lista;
  const r = await todo<Fila>(apiKey, '/api/articulo', { dropshipping_distribuidor: 1 }, 30);
  const lista = Array.isArray(r) ? r.filter((f) => txt(f.vigente) !== '0').map((f) => ({ id: txt(f.id), descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: stockDe(f), drop: 1 })) : (c?.lista || []);
  cacheDrop.set(storeId, { ts: Date.now(), lista });
  return lista;
}
const mismasPalabras = (a: string, b: string) => { const x = tokensVariante(a); const y = tokensVariante(b); return x.length > 0 && x.length === y.length && x.every((t) => y.some((u) => mismoToken(t, u))); };
/** El artículo del PROVEEDOR con el mismo nombre que un artículo propio (si hay uno solo). */
async function gemeloDrop(storeId: string, apiKey: string, a: ArticuloEffi): Promise<ArticuloEffi | undefined> {
  const cands = (await articulosDrop(storeId, apiKey)).filter((x) => x.id !== a.id && mismasPalabras(x.descripcion, a.descripcion));
  return cands.length === 1 ? cands[0] : undefined;
}

/**
 * Repara vínculos: variantes de productos de Effi que apuntan a un artículo PROPIO sin
 * stock, cuando existe su gemelo del proveedor (mismo nombre) → se pasan al del proveedor.
 * No toca los vínculos de productos marcados como "Mercancía propia".
 */
export async function repararVinculosDrop(storeId: string, apiKey: string): Promise<number> {
  const drops = await articulosDrop(storeId, apiKey);
  if (!drops.length) return 0;
  const idsDrop = new Set(drops.map((d) => d.id));
  const cache = new Map(articulosCache(storeId).map((a) => [a.id, a]));
  const vars = db.prepare(`SELECT v.id, json_extract(v.refs,'$.effi_id') effi FROM variants v JOIN products p ON p.id = v.product_id
    WHERE p.store_id = ? AND COALESCE(p.despacho_proveedor,'') = 'effi' AND COALESCE(p.effi_convenio,'') != 'propio' AND COALESCE(json_extract(v.refs,'$.effi_id'),'') != ''`).all(storeId) as { id: string; effi: string }[];
  const usados = new Set(vars.map((v) => String(v.effi)));
  let n = 0;
  for (const v of vars) {
    const id = String(v.effi);
    if (idsDrop.has(id)) continue;
    const a = cache.get(id);
    if (!a || Number(a.stock) > 0) continue; // sin datos o con stock propio: se deja
    const gem = drops.filter((d) => mismasPalabras(d.descripcion, a.descripcion));
    if (gem.length !== 1 || usados.has(gem[0].id)) continue;
    vincularArticulo(storeId, v.id, gem[0].id, true);
    usados.add(gem[0].id);
    n++;
  }
  if (n) registrarLog(storeId, 'info', 'effi', `${n} variante(s) estaban vinculadas a tu artículo propio sin stock: se pasaron al artículo del proveedor dropshipping con el mismo nombre.`);
  return n;
}

// ── Revisión de vínculos de un producto (herramienta rápida para corregir) ────────

export interface SugerenciaVinculo {
  variantId: string; label: string; auto: boolean;
  actual: { id: string; descripcion: string; drop: boolean; stock: number | null } | null;
  sugerido: { id: string; descripcion: string; drop: boolean; stock: number | null } | null;
  /** 'ok' = el actual es el correcto · 'cambiar' = hay uno mejor · 'sin' = no se encontró · 'revisar' = el actual no casa con el nombre */
  estado: 'ok' | 'cambiar' | 'sin' | 'revisar';
}
/**
 * Para cada variante del producto: su artículo actual y el que DealFlow sugiere, buscado
 * por nombre EXACTO (producto + talla/color, en cualquier orden) y prefiriendo el del
 * proveedor. Sirve para ver de un vistazo qué quedó mal vinculado y arreglarlo de una.
 */
export async function revisarVinculosProducto(storeId: string, productId: string): Promise<{ producto: string; filas: SugerenciaVinculo[] } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Conecta Effi primero.' };
  const p = db.prepare('SELECT nombre FROM products WHERE id = ? AND store_id = ?').get(productId, storeId) as { nombre: string } | undefined;
  if (!p) return { error: 'Producto no encontrado.' };
  const vars = db.prepare("SELECT id, label, json_extract(refs,'$.effi_id') effi, COALESCE(json_extract(refs,'$.effi_auto'),0) auto FROM variants WHERE product_id = ? ORDER BY label").all(productId) as { id: string; label: string; effi: string | null; auto: number }[];
  // Candidatos: los del proveedor + búsqueda en vivo por el nombre + la caché.
  const drops = await articulosDrop(storeId, c.apiKey);
  const idsDrop = new Set(drops.map((d) => d.id));
  const lista = new Map<string, ArticuloEffi>();
  for (const a of articulosCache(storeId)) lista.set(a.id, { ...a, drop: idsDrop.has(a.id) ? 1 : 0 });
  const vivos = await buscarArticulosEffi(storeId, p.nombre);
  if (Array.isArray(vivos)) for (const a of vivos) lista.set(a.id, { ...a, drop: idsDrop.has(a.id) ? 1 : 0 });
  for (const d of drops) lista.set(d.id, d);
  const arts = [...lista.values()];
  const info = (a: ArticuloEffi | undefined) => (a ? { id: a.id, descripcion: a.descripcion, drop: a.drop === 1, stock: a.stock ?? null } : null);
  const usados = new Set<string>();
  const filas: SugerenciaVinculo[] = [];
  for (const v of vars) {
    const esperado = `${p.nombre} ${String(v.label || '').replace(/·/g, ' ')}`;
    const exactos = arts.filter((a) => !usados.has(a.id) && mismasPalabras(a.descripcion, esperado))
      .sort((x, y) => ((y.drop === 1 ? 1 : 0) - (x.drop === 1 ? 1 : 0)) || (Number(y.stock ?? -1) - Number(x.stock ?? -1)));
    const sug = exactos[0];
    if (sug) usados.add(sug.id);
    let actual = v.effi ? lista.get(String(v.effi)) : undefined;
    if (v.effi && !actual) actual = await articuloPorId(storeId, c.apiKey, String(v.effi)).then((a) => (a ? { ...a, drop: idsDrop.has(a.id) ? 1 : 0 } : undefined));
    const actualCasa = !!actual && mismasPalabras(actual.descripcion, esperado);
    const estado: SugerenciaVinculo['estado'] = actual && sug && actual.id === sug.id ? 'ok'
      : sug && (!actual || !actualCasa || (sug.drop === 1 && actual.drop !== 1)) ? 'cambiar'
        : !sug && actual && !actualCasa ? 'revisar' : !sug && !actual ? 'sin' : 'ok';
    filas.push({ variantId: v.id, label: v.label, auto: Number(v.auto) === 1, actual: info(actual), sugerido: info(sug), estado });
  }
  return { producto: p.nombre, filas };
}

/** Un artículo por id, en vivo (con su marca de dropshipping). Lo guarda en la caché. */
/** Todos los artículos para el selector: los tuyos (catálogo) y los de tus proveedores dropshipping. */
export async function todosLosArticulos(storeId: string, refrescar = false): Promise<{ id: string; descripcion: string; referencia: string; drop: number; stock: number | null }[]> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return [];
  if (refrescar || !articulosCache(storeId).length) await descargarArticulos(storeId, c.apiKey);
  const m = new Map<string, { id: string; descripcion: string; referencia: string; drop: number; stock: number | null }>();
  for (const a of articulosCache(storeId)) m.set(a.id, { id: a.id, descripcion: a.descripcion, referencia: a.referencia, drop: a.drop === 1 ? 1 : 0, stock: a.stock });
  try { for (const a of await articulosDrop(storeId, c.apiKey)) m.set(a.id, { id: a.id, descripcion: a.descripcion, referencia: a.referencia, drop: 1, stock: a.stock }); } catch { /* sin proveedores */ }
  return [...m.values()].sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
}

/** Consulta un artículo de Effi por su ID (para vincular a mano con verificación). */
export async function verArticuloEffi(storeId: string, id: string): Promise<ArticuloEffi | undefined> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey || !/^\d+$/.test(id)) return undefined;
  return articuloPorId(storeId, c.apiKey, id);
}

async function articuloPorId(storeId: string, apiKey: string, id: string): Promise<ArticuloEffi | undefined> {
  // En serie (no en paralelo): Effi responde 429 si le llegan varias a la vez.
  const r = await effi<Fila[]>(apiKey, 'GET', '/api/articulo', { query: { id, por_pagina: 1 } });
  const d = await effi<Fila[]>(apiKey, 'GET', '/api/articulo', { query: { id, dropshipping_distribuidor: 1, por_pagina: 1 } });
  const f = r.ok ? r.body.data?.[0] : undefined;
  if (!f || txt(f.vigente) === '0') return undefined;
  const fd = d.ok ? d.body.data?.[0] : undefined;
  // Artículo de proveedor: el stock que vale es el que reporta el proveedor.
  const a: ArticuloEffi = { id: txt(f.id), descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: (fd ? stockDe(fd) : null) ?? stockDe(f), drop: fd ? 1 : 0 };
  if (Array.isArray(f.stock_bodegas)) {
    bodegasDe.set(`${storeId}:${a.id}`, (f.stock_bodegas as Fila[]).map((b) => ({
      id: txt(b.bodega ?? b.id_bodega ?? b.id), nombre: txt(b.nombre_bodega ?? b.nombre), stock: Number(b.stock ?? b.existencias ?? b.cantidad) || 0,
    })).filter((b) => b.id));
  }
  try {
    db.prepare('INSERT OR REPLACE INTO effi_articulos (store_id, id, descripcion, referencia, ecommerce, stock, es_drop) VALUES (?,?,?,?,?,?,?)')
      .run(storeId, a.id, a.descripcion, a.referencia, a.ecommerce, a.stock, a.drop);
  } catch { /* caché opcional */ }
  return a;
}

// Convenio dropshipping de cada artículo (aprendido de las ventas anteriores en Effi
// o de cada remisión que DealFlow crea bien). Effi no lo informa en el artículo.
// Convenio elegido a mano para un producto: '' = automático, 'propio' = mercancía propia
// (sin convenio), o el código del convenio del proveedor.
try { db.exec("ALTER TABLE products ADD COLUMN effi_convenio TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
try { db.exec("ALTER TABLE orders ADD COLUMN effi_guia_info TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
// Convenio con el que salió el pedido a Effi ('-' = mercancía propia). Lo usa el portal de proveedores.
try { db.exec("ALTER TABLE orders ADD COLUMN effi_convenio TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
// Remisiones/guías que DealFlow anuló en Effi para rehacer el pedido (historial; si hay, el
// siguiente envío usa una clave de idempotencia nueva para que Effi cree otra remisión).
try { db.exec("ALTER TABLE orders ADD COLUMN effi_anuladas TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
const convenioDeProducto = (productId: string) => String((db.prepare('SELECT effi_convenio FROM products WHERE id = ?').get(productId) as { effi_convenio: string } | undefined)?.effi_convenio || '');

db.exec(`CREATE TABLE IF NOT EXISTS effi_convenio_articulo (
  store_id TEXT NOT NULL, articulo TEXT NOT NULL, convenio TEXT NOT NULL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, articulo)
)`);
const guardarConvenioArticulo = (storeId: string, articulo: string, convenio: string) =>
  db.prepare("INSERT INTO effi_convenio_articulo (store_id, articulo, convenio, actualizado) VALUES (?,?,?,datetime('now')) ON CONFLICT(store_id, articulo) DO UPDATE SET convenio = excluded.convenio, actualizado = excluded.actualizado").run(storeId, articulo, convenio);

// Convenio con el que se vendió por última vez cada PRODUCTO (aprendido de la remisión que
// Effi aceptó). Así la siguiente venta del mismo producto, aunque sea de otra talla o color
// (otro artículo en Effi), sale con ese convenio sin tener que ponerlo a mano.
db.exec(`CREATE TABLE IF NOT EXISTS effi_convenio_producto (
  store_id TEXT NOT NULL, product_id TEXT NOT NULL, convenio TEXT NOT NULL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, product_id)
)`);
const convenioAprendidoProducto = (storeId: string, productId: string) =>
  String((db.prepare('SELECT convenio FROM effi_convenio_producto WHERE store_id = ? AND product_id = ?').get(storeId, productId) as { convenio: string } | undefined)?.convenio || '');
function aprenderConvenioProductos(storeId: string, productos: string[], convenio: string) {
  for (const pid of new Set(productos.filter(Boolean))) {
    if (convenio) db.prepare("INSERT INTO effi_convenio_producto (store_id, product_id, convenio, actualizado) VALUES (?,?,?,datetime('now')) ON CONFLICT(store_id, product_id) DO UPDATE SET convenio = excluded.convenio, actualizado = excluded.actualizado").run(storeId, pid, convenio);
    else db.prepare('DELETE FROM effi_convenio_producto WHERE store_id = ? AND product_id = ?').run(storeId, pid);
  }
}

/** El convenio con el que se ha vendido ESTE artículo (el más usado en sus remisiones/facturas). */
export async function convenioDeArticulo(storeId: string, apiKey: string, articulo: string): Promise<string> {
  const local = db.prepare('SELECT convenio FROM effi_convenio_articulo WHERE store_id = ? AND articulo = ?').get(storeId, articulo) as { convenio: string } | undefined;
  if (local?.convenio) return local.convenio;
  const cuenta = new Map<string, number>();
  for (const ruta of ['/api/remision_v', '/api/factura_v']) {
    const r = await effi<Fila[]>(apiKey, 'GET', ruta, { query: { dropshipping_distribuidor: 1, articulo, por_pagina: 100 } });
    for (const f of r.ok ? r.body.data || [] : []) {
      const id = txt(f.convenio_dropshipping);
      if (id && id !== '1') cuenta.set(id, (cuenta.get(id) || 0) + 1);
    }
    if (cuenta.size) break;
  }
  const mejor = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  if (mejor) guardarConvenioArticulo(storeId, articulo, mejor);
  return mejor;
}

/**
 * Convenios Dropshipping de la tienda: los que agregó a mano + los que ya usó en Effi
 * (se leen de sus remisiones y facturas como distribuidora, hasta ~1.500 documentos).
 * Effi no tiene un listado de convenios en la API.
 */
export async function conveniosDropshipping(apiKey: string, guardados: { id: string; nombre: string }[] = [], storeId = ''): Promise<{ id: string; nombre: string; manual?: boolean }[]> {
  const out = new Map<string, { nombre: string; manual?: boolean }>();
  for (const g of guardados) out.set(g.id, { nombre: g.nombre || `Convenio ${g.id}`, manual: true });
  const agregar = (id: string, nombre: string) => { if (id && id !== '0' && id !== '1' && !out.has(id)) out.set(id, { nombre: nombre || `Convenio ${id}` }); };
  const campoK = (f: Fila, re: RegExp) => { for (const [k, v] of Object.entries(f)) if (v != null && typeof v !== 'object' && re.test(k) && txt(v).trim()) return txt(v).trim(); return ''; };
  // 1) Listado de convenios, si la cuenta de Effi lo expone por la API (se prueba; si no existe, se ignora).
  for (const ruta of ['/api/convenio_dropshipping', '/api/convenios_dropshipping', '/api/dropshipping_convenio']) {
    const r = await effi<Fila[]>(apiKey, 'GET', ruta, { query: { por_pagina: 100 } });
    if (!r.ok || !Array.isArray(r.body.data)) continue;
    for (const f of r.body.data) agregar(campoK(f, /^codigo$|^codigo_convenio|^id_convenio|^convenio$|^id$/i), campoK(f, /nombre|descripcion/i));
    if (out.size) break;
  }
  // 2) Los artículos de proveedores dropshipping traen su convenio: así salen TODOS, aunque nunca
  //    se haya vendido con ellos (y cada artículo queda con su convenio aprendido).
  const arts = await todo<Fila>(apiKey, '/api/articulo', { dropshipping_distribuidor: 1 }, 15);
  if (Array.isArray(arts)) {
    for (const f of arts) {
      const id = campoK(f, /convenio(_dropshipping)?$|^id_convenio|codigo_convenio/i);
      if (!id) continue;
      agregar(id, campoK(f, /nombre.*convenio|convenio.*nombre|nombre_distribuidor|nombre_proveedor|razon_social/i));
      if (storeId && txt(f.id)) { try { db.prepare('INSERT OR IGNORE INTO effi_convenio_articulo (store_id, articulo, convenio) VALUES (?,?,?)').run(storeId, txt(f.id), id); } catch { /* opcional */ } }
    }
  }
  // 3) Los que ya usaste en remisiones y facturas.
  for (const [ruta, paginas] of [['/api/remision_v', 10], ['/api/factura_v', 5]] as const) {
    const filas = await todo<Fila>(apiKey, ruta, { dropshipping_distribuidor: 1 }, paginas);
    if ('error' in filas) continue; // no todos los usuarios ven facturas
    for (const f of filas) agregar(txt(f.convenio_dropshipping), txt(f.nombre_convenio_dropshipping));
  }
  return [...out].map(([id, v]) => ({ id, nombre: v.nombre, ...(v.manual ? { manual: true } : {}) }));
}

/** Convenios que la tienda ya conoce (agregados a mano, aprendidos de envíos y el de por defecto), sin llamar a Effi. */
export function conveniosConocidos(storeId: string): { id: string; nombre: string }[] {
  const c = cfgEffi(storeId);
  const m = new Map<string, string>();
  for (const x of c?.convenios || []) m.set(x.id, x.nombre);
  for (const r of db.prepare('SELECT DISTINCT convenio FROM effi_convenio_articulo WHERE store_id = ?').all(storeId) as { convenio: string }[]) if (!m.has(r.convenio)) m.set(r.convenio, `Convenio ${r.convenio}`);
  if (c?.convenioDropshipping && !m.has(c.convenioDropshipping)) m.set(c.convenioDropshipping, `Convenio ${c.convenioDropshipping}`);
  return [...m].map(([id, nombre]) => ({ id, nombre }));
}

/**
 * Busca en Effi el artículo de un ítem del pedido por texto: nombre del producto +
 * talla/color ("Falda (Talla XL · Naranja)" → artículos con "falda", "xl" y "naranja").
 * Devuelve el artículo solo si hay UNO que tenga todas esas palabras.
 */
export async function articuloPorTexto(storeId: string, nombreItem: string): Promise<ArticuloEffi | undefined> {
  const base = nombreItem.split('(')[0].trim();
  const m = nombreItem.match(/\(([^)]+)\)/);
  const varTok = tokensVariante(m ? m[1] : '');
  const prodTok = norm(base).split(' ').filter((t) => t.length >= 3);
  if (!prodTok.length || !varTok.length) return undefined;
  const r = await buscarArticulosEffi(storeId, base);
  if (!Array.isArray(r)) return undefined;
  const tiene = (desc: string, toks: string[]) => { const d = tokensVariante(desc); return toks.every((t) => d.some((x) => mismoToken(x, t))); };
  const cands = r.filter((x) => tiene(`${x.descripcion} ${x.referencia}`, [...prodTok, ...varTok]));
  if (cands.length !== 1) return undefined;
  return (await articuloPorId(storeId, cfgEffi(storeId)!.apiKey, cands[0].id)) || cands[0];
}

/** Búsqueda en vivo en Effi por nombre (palabras) o referencia, para vincular a mano. */
export async function buscarArticulosEffi(storeId: string, q: string): Promise<ArticuloEffi[] | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Conecta Effi primero.' };
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const [porNombre, porRef] = await Promise.all([
    effi<Fila[]>(c.apiKey, 'GET', '/api/articulo', { query: { descripcion: term, por_pagina: 100 } }),
    effi<Fila[]>(c.apiKey, 'GET', '/api/articulo', { query: { referencia: `${term}%`, por_pagina: 50 } }),
  ]);
  if (!porNombre.ok && !porRef.ok) return { error: mensajeError(porNombre) };
  const vistos = new Set<string>();
  const out: ArticuloEffi[] = [];
  for (const f of [...(porRef.body.data || []), ...(porNombre.body.data || [])]) {
    const id = txt(f.id);
    if (!id || vistos.has(id) || txt(f.vigente) === '0') continue;
    vistos.add(id);
    out.push({ id, descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: stockDe(f) });
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

// refPropia: la referencia es de ESTA variante (no la heredada del producto, que comparten todas).
interface VarianteDF { productId: string; variantId: string | null; producto: string; label: string; ref: string; effiId: string; proveedor: string; refPropia?: boolean;
  /** Artículo del PROVEEDOR dropshipping elegido a mano: con este se despacha y de este sale el stock. */
  provId?: string }

/** Todas las variantes (y productos sin variantes) de la tienda con su vínculo actual. */
function variantesTienda(storeId: string): VarianteDF[] {
  const out: VarianteDF[] = [];
  const prods = db.prepare("SELECT id, nombre, sku, COALESCE(despacho_proveedor,'') proveedor FROM products WHERE store_id = ?").all(storeId) as { id: string; nombre: string; sku: string; proveedor: string }[];
  const vst = db.prepare("SELECT id, label, sku, COALESCE(refs,'{}') refs FROM variants WHERE product_id = ?");
  for (const p of prods) {
    const vs = vst.all(p.id) as { id: string; label: string; sku: string; refs: string }[];
    if (!vs.length) { out.push({ productId: p.id, variantId: null, producto: p.nombre, label: '', ref: p.sku || '', effiId: '', proveedor: p.proveedor, refPropia: true }); continue; }
    for (const v of vs) {
      const refs = pj<Record<string, string>>(v.refs, {});
      const propia = String(refs.effi || v.sku || '');
      out.push({ productId: p.id, variantId: v.id, producto: p.nombre, label: v.label || '', ref: propia || String(p.sku || ''), effiId: String(refs.effi_id || ''), proveedor: p.proveedor, refPropia: !!propia || vs.length === 1, provId: String(refs.effi_prov_id || '') });
    }
  }
  return out;
}

/** Busca el artículo de Effi que corresponde a una variante de DealFlow. */
function articuloPara(storeId: string, v: VarianteDF, arts: ArticuloEffi[]): ArticuloEffi | undefined {
  if (v.effiId) { const a = arts.find((x) => x.id === v.effiId); if (a) return a; }
  // La referencia del PRODUCTO la comparten todas sus tallas/colores: casar por ella
  // pegaba todas las variantes al mismo artículo. Solo cuenta si es de la variante.
  const ref = v.refPropia === false ? '' : v.ref;
  // 1) Vinculado en Effi como producto de un ecommerce (Effi guarda nuestro id).
  const idEc = idEcommerceDeRef(storeId, ref);
  const candidatosEc = [idEc != null ? String(idEc) : '', v.variantId || '', v.productId].filter(Boolean);
  const porEc = arts.find((a) => a.ecommerce && a.ecommerce.split(',').map((s) => s.trim()).some((x) => candidatosEc.includes(x)));
  if (porEc) return porEc;
  // 2) Misma referencia.
  if (ref) { const a = arts.find((x) => x.referencia && x.referencia.trim().toLowerCase() === ref.trim().toLowerCase()); if (a) return a; }
  // 3) Mismo nombre ("Producto - Variante" o "Producto Variante").
  const esUnica = !v.label || norm(v.label) === 'unica';
  const nombres = esUnica ? [norm(v.producto)] : [norm(`${v.producto} ${v.label.replace(/·/g, ' ')}`)];
  return arts.find((a) => nombres.includes(norm(a.descripcion)));
}

/**
 * Vincula por NOMBRE las variantes sin artículo de un producto, buscando en vivo en
 * Effi (la caché solo trae lo enlazado a un e-commerce: los productos creados en
 * Effi después no estaban ahí y nunca se vinculaban solos). Tolera el orden de las
 * palabras y "T8"/"Talla 8". Devuelve cuántas vinculó.
 */
async function vincularPorNombre(storeId: string, apiKey: string, vars: VarianteDF[], arts: ArticuloEffi[]): Promise<number> {
  const pendientes = vars.filter((v) => v.variantId && !v.effiId) as (VarianteDF & { variantId: string })[];
  if (!pendientes.length) return 0;
  const producto = pendientes[0].producto;
  const clave = palabrasClave(producto);
  if (!clave.length) return 0;
  const vivos = await effi<Fila[]>(apiKey, 'GET', '/api/articulo', { query: { descripcion: clave.join(' '), por_pagina: 100 } });
  const lista = new Map<string, ArticuloEffi>(arts.map((a) => [a.id, a]));
  for (const f of vivos.ok ? vivos.body.data || [] : []) {
    if (txt(f.vigente) === '0' || lista.has(txt(f.id))) continue;
    lista.set(txt(f.id), { id: txt(f.id), descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: stockDe(f) });
  }
  // Los del proveedor (dropshipping) primero: si una prenda existe dos veces en Effi, gana esa.
  for (const d of await articulosDrop(storeId, apiKey)) if (palabrasClave(d.descripcion).some((t) => clave.includes(t))) lista.set(d.id, d);
  const ordenados = [...lista.values()].sort((x, y) => (y.drop === 1 ? 1 : 0) - (x.drop === 1 ? 1 : 0));
  // Los artículos que ya usan otras variantes del producto no se repiten.
  const usados = new Set(vars.map((v) => v.effiId).filter(Boolean));
  const m = emparejarArticulos(producto, pendientes.map((v) => ({ variantId: v.variantId, label: v.label })), ordenados, usados);
  for (const [variantId, a] of m) {
    vincularArticulo(storeId, variantId, a.id, true);
    const v = pendientes.find((x) => x.variantId === variantId);
    if (v) v.effiId = a.id;
  }
  return m.size;
}

/** Guarda el id del artículo de Effi en la variante (refs.effi_id). */
// auto = lo vinculó DealFlow solo (se muestra así en el panel); a mano lo quita.
/** Artículo del proveedor de una variante (vacío = quitarlo). */
export function vincularProveedor(storeId: string, variantId: string, provId: string): boolean {
  const own = db.prepare('SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(variantId, storeId);
  if (!own) return false;
  if (provId) db.prepare("UPDATE variants SET refs = json_set(COALESCE(refs,'{}'), '$.effi_prov_id', ?) WHERE id = ?").run(provId, variantId);
  else db.prepare("UPDATE variants SET refs = json_remove(COALESCE(refs,'{}'), '$.effi_prov_id') WHERE id = ?").run(variantId);
  return true;
}

/** Sugerencia (NO se aplica sola): el artículo del proveedor con el mismo nombre que tu artículo propio. */
export async function proveedorSugerido(storeId: string, effiId: string): Promise<ArticuloEffi | undefined> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey || !effiId) return undefined;
  const propio = articulosCache(storeId).find((a) => a.id === effiId) || await articuloPorId(storeId, c.apiKey, effiId);
  if (!propio || propio.drop === 1) return undefined;
  return gemeloDrop(storeId, c.apiKey, propio);
}

export function vincularArticulo(storeId: string, variantId: string, effiId: string, auto = false): boolean {
  const own = db.prepare('SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND p.store_id = ?').get(variantId, storeId);
  if (!own) return false;
  if (auto) db.prepare("UPDATE variants SET refs = json_set(COALESCE(refs,'{}'), '$.effi_id', ?, '$.effi_auto', 1) WHERE id = ?").run(effiId, variantId);
  // Elegido a mano: es EL artículo de la variante (se quita cualquier otro vínculo de proveedor).
  else db.prepare("UPDATE variants SET refs = json_remove(json_set(COALESCE(refs,'{}'), '$.effi_id', ?), '$.effi_auto', '$.effi_prov_id') WHERE id = ?").run(effiId, variantId);
  return true;
}

/** Descarga artículos y vincula automáticamente todas las variantes que casen. */
/**
 * Vincula SOLAS las variantes sin artículo: primero por referencia / e-commerce /
 * nombre exacto con la caché, y luego por nombre + variante buscando en vivo en
 * Effi. Los productos "sin definir" también entran si la tienda no usa Dropi: si
 * aparecen en Effi, se marcan como de Effi. Con `ahorrar`, un producto que no casó
 * no se vuelve a buscar en Effi hasta que cambie (nombre/variantes) o pasen 6 h.
 */
const intentos = new Map<string, { firma: string; at: number }>(); // productId → último intento en vivo
async function vincularTienda(storeId: string, apiKey: string, arts: ArticuloEffi[], ahorrar: boolean): Promise<{ todas: VarianteDF[]; deEffi: VarianteDF[]; marcados: number }> {
  const todas = variantesTienda(storeId);
  const sinDropi = !db.prepare("SELECT 1 FROM store_integrations WHERE store_id = ? AND tipo = 'dropi_api'").get(storeId);
  const candidatas = todas.filter((v) => v.proveedor === 'effi' || (!v.proveedor && sinDropi));
  const usadosPorProducto = new Map<string, Set<string>>();
  for (const v of candidatas) if (v.effiId) { const u = usadosPorProducto.get(v.productId) || new Set(); u.add(v.effiId); usadosPorProducto.set(v.productId, u); }
  for (const v of candidatas) {
    // Un vínculo ya guardado (a mano o antes) se respeta: el artículo puede no estar
    // en la caché (búsqueda en vivo, proveedor dropshipping) y aun así ser el correcto.
    if (v.effiId) continue;
    const a = articuloPara(storeId, v, arts);
    if (!a) continue;
    const usados = usadosPorProducto.get(v.productId) || new Set();
    if (v.variantId && usados.has(a.id)) continue; // ese artículo ya es de otra talla/color
    if (v.variantId) { vincularArticulo(storeId, v.variantId, a.id, true); usados.add(a.id); usadosPorProducto.set(v.productId, usados); }
    v.effiId = a.id;
  }
  // Lo que no casó: por nombre + variante, buscando el producto en vivo en Effi.
  const porProducto = new Map<string, VarianteDF[]>();
  for (const v of candidatas) porProducto.set(v.productId, [...(porProducto.get(v.productId) || []), v]);
  let consultas = 0;
  for (const [pid, vars] of porProducto) {
    if (!vars.some((v) => v.variantId && !v.effiId)) continue;
    const firma = vars.map((v) => `${v.producto}|${v.label}|${v.effiId}`).join(';');
    const prev = intentos.get(pid);
    if (ahorrar && prev && prev.firma === firma && Date.now() - prev.at < 6 * 3600e3) continue;
    if (++consultas > 60) break; // tope de llamadas a Effi por vuelta
    await vincularPorNombre(storeId, apiKey, vars, arts);
    intentos.set(pid, { firma: vars.map((v) => `${v.producto}|${v.label}|${v.effiId}`).join(';'), at: Date.now() });
  }
  // "Sin definir" que sí está en Effi → se marca como de Effi.
  let marcados = 0;
  for (const [pid, vars] of porProducto) {
    if (vars[0].proveedor || !vars.some((v) => v.effiId)) continue;
    marcados += db.prepare("UPDATE products SET despacho_proveedor = 'effi' WHERE id = ? AND store_id = ? AND COALESCE(despacho_proveedor,'') = ''").run(pid, storeId).changes;
    for (const v of vars) v.proveedor = 'effi';
  }
  if (marcados) registrarLog(storeId, 'info', 'effi', `${marcados} producto(s) sin proveedor se encontraron en Effi y se marcaron como de Effi.`);
  return { todas, deEffi: candidatas.filter((v) => v.proveedor === 'effi'), marcados };
}

/** Descarga artículos y vincula automáticamente todas las variantes que casen (botón del panel). */
export async function sincronizarArticulos(storeId: string): Promise<{ total: number; soloVinculados: boolean; vinculadas: number; sinVinculo: { variantId: string | null; nombre: string }[]; productosEffi: number; sinProveedor: number; marcados: number; stockActualizado: number } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Conecta Effi con la API key primero.' };
  const d = await descargarArticulos(storeId, c.apiKey);
  if ('error' in d) return d;
  cacheAt.set(storeId, Date.now());
  const arts = articulosCache(storeId);
  // Modo manual: solo se descarga el catálogo y el stock; no se toca ningún vínculo.
  const { todas, deEffi, marcados } = c.vinculoManual
    ? (() => { const t = variantesTienda(storeId); return { todas: t, deEffi: t.filter((v) => v.proveedor === 'effi'), marcados: 0 }; })()
    : await vincularTienda(storeId, c.apiKey, arts, false);
  if (!c.vinculoManual) { try { await repararVinculosDrop(storeId, c.apiKey); } catch (e) { console.warn('[effi] reparar vínculos', e); } }
  const stock = await sincronizarStockEffi(storeId, c.apiKey);
  let vinculadas = 0;
  const sinVinculo: { variantId: string | null; nombre: string }[] = [];
  for (const v of deEffi) {
    const nombre = v.label && norm(v.label) !== 'unica' ? `${v.producto} (${v.label})` : v.producto;
    if (v.effiId || (!v.variantId && articuloPara(storeId, v, arts))) vinculadas++;
    else sinVinculo.push({ variantId: v.variantId, nombre });
  }
  const productosEffi = new Set(deEffi.map((v) => v.productId)).size;
  const sinProveedor = new Set(todas.filter((v) => !v.proveedor).map((v) => v.productId)).size;
  return { total: d.total, soloVinculados: d.soloVinculados, vinculadas, sinVinculo, productosEffi, sinProveedor, marcados, stockActualizado: stock.actualizadas };
}

// ── Vinculación automática (sin botón) ──────────────────────────────────────
const cacheAt = new Map<string, number>(); // última descarga de la caché de artículos
const enCurso = new Set<string>();
/** Vincula lo pendiente de una tienda (caché renovada cada 6 h). Nunca lanza. */
export async function autoVincularEffi(storeId: string): Promise<void> {
  if (enCurso.has(storeId)) return;
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return;
  enCurso.add(storeId);
  try {
    // La caché (con el stock) se renueva cada 25 min: el stock de Effi cambia seguido.
    if (!cacheAt.has(storeId) || Date.now() - cacheAt.get(storeId)! > 25 * 60e3 || !articulosCache(storeId).length) {
      const d = await descargarArticulos(storeId, c.apiKey);
      if ('error' in d) return;
      cacheAt.set(storeId, Date.now());
    }
    if (!c.vinculoManual) {
      await vincularTienda(storeId, c.apiKey, articulosCache(storeId), true);
      await repararVinculosDrop(storeId, c.apiKey).catch(() => 0);
    }
    await sincronizarStockEffi(storeId, c.apiKey); // el stock sí se actualiza siempre
  } catch (e) { console.error('[effi] auto-vínculo', e); } finally { enCurso.delete(storeId); }
}
/**
 * Pasa el stock de Effi a las variantes vinculadas (lo que el asistente le dice al
 * cliente). Usa la caché recién descargada y, para los vinculados que no están en
 * ella, consulta el artículo en vivo (con tope por vuelta).
 */
export async function sincronizarStockEffi(storeId: string, apiKey: string): Promise<{ actualizadas: number; sinDato: number }> {
  const cache = new Map(articulosCache(storeId).map((a) => [a.id, a]));
  // El stock que importa es el del artículo del PROVEEDOR si la variante tiene uno; si no, el propio.
  const vars = db.prepare("SELECT v.id, v.stock, COALESCE(NULLIF(json_extract(v.refs,'$.effi_prov_id'),''), json_extract(v.refs,'$.effi_id')) effi FROM variants v JOIN products p ON p.id = v.product_id WHERE p.store_id = ? AND COALESCE(p.despacho_proveedor,'') = 'effi' AND COALESCE(NULLIF(json_extract(v.refs,'$.effi_prov_id'),''), json_extract(v.refs,'$.effi_id'), '') != ''").all(storeId) as { id: string; stock: number; effi: string }[];
  let actualizadas = 0, sinDato = 0, vivos = 0;
  const upd = db.prepare('UPDATE variants SET stock = ? WHERE id = ?');
  for (const v of vars) {
    let a = cache.get(String(v.effi));
    if (!a && vivos < 150) { vivos++; a = await articuloPorId(storeId, apiKey, String(v.effi)); if (a) cache.set(a.id, a); }
    if (!a || a.stock == null) { sinDato++; continue; }
    const nuevo = Math.max(0, Math.floor(a.stock));
    if (nuevo !== Number(v.stock)) { upd.run(nuevo, v.id); actualizadas++; }
  }
  return { actualizadas, sinDato };
}

const pronto = new Map<string, ReturnType<typeof setTimeout>>();
/** Tras crear/editar productos o variantes: vincula en unos segundos (agrupa cambios seguidos). */
export function autoVincularPronto(storeId: string): void {
  if (!cfgEffi(storeId)?.apiKey) return;
  clearTimeout(pronto.get(storeId));
  pronto.set(storeId, setTimeout(() => { pronto.delete(storeId); void autoVincularEffi(storeId); }, 8000));
}
/** Repaso periódico de todas las tiendas con Effi (lo nuevo que se cree en Effi). */
export function iniciarAutoVinculoEffi(): void {
  const vuelta = async () => {
    const tiendas = db.prepare("SELECT store_id FROM store_integrations WHERE tipo = 'effi_api'").all() as { store_id: string }[];
    for (const t of tiendas) await autoVincularEffi(t.store_id);
  };
  setTimeout(() => void vuelta(), 90_000);
  setInterval(() => void vuelta(), 30 * 60_000);
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
  // Nombre real del cliente (el que escribió en el chat), nunca un correo o un apodo de perfil.
  const nombre = resolverNombreCliente(txt(o.lead_id), txt(o.cliente), '').slice(0, 120);
  if (busca.ok && busca.body.data?.length) {
    const yaEnEffi = txt(busca.body.data[0].nombre);
    // El cliente ya existía en Effi (mismo celular) con un nombre que no es de persona: se avisa.
    const tercero = txt(busca.body.data[0].tercero);
    // El cliente ya existía en Effi (mismo celular) con otro nombre: se corrige al del pedido
    // (PUT api/cliente solo cambia lo que se envía), para que la remisión y la guía salgan bien.
    const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    if (yaEnEffi && nombreValido(nombre) && norm(yaEnEffi) !== norm(nombre)) {
      const up = await effi<Fila>(c.apiKey, 'PUT', '/api/cliente', { body: { codigo: Number(tercero), nombre } });
      trazar(txt(o.store_id), txt(o.id), up.ok
        ? { etapa: 'despacho', nivel: 'info', titulo: `Nombre del cliente corregido en Effi: «${yaEnEffi}» → «${nombre}»` }
        : { etapa: 'despacho', nivel: 'warn', titulo: `En Effi este cliente se llama «${yaEnEffi}»`, detalle: `No se pudo corregir (${mensajeError(up)}). Cámbiale el nombre en Effi → Clientes a «${nombre}».` });
    }
    return { tercero };
  }
  // Correo del cliente si lo dio (las landings lo guardan en la nota del pedido).
  const correo = (txt(o.nota).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [''])[0].toLowerCase();
  const crear = (email: string) => effi<Fila>(c.apiKey, 'POST', '/api/cliente', {
    body: {
      t_dni: T_DNI_CEDULA, numero, nombre, celular: numero, whatsapp: numero,
      ...(email ? { email } : {}),
      direcciones: [{ id_pais: PAIS_COLOMBIA, id_provincia: Number(ubic.provincia), id_ciudad: Number(ubic.ciudad), direccion: txt(o.direccion).slice(0, 200) }],
      observacion: 'Cliente creado por DealFlow',
      ...(c.sucursal ? { sucursal: Number(c.sucursal) } : {}),
    },
  });
  let r = await crear(correo);
  // Algunas cuentas de Effi (p. ej. de proveedor) exigen el correo del cliente. Si el cliente no
  // dio uno, se usa un correo técnico de DealFlow que no recibe nada (el pedido no se frena por eso).
  if (!r.ok && !correo && /e-?mail|correo/i.test(mensajeError(r))) {
    r = await crear(`cliente.${numero}@sincorreo.dealflow.sbs`);
    if (r.ok) trazar(txt(o.store_id), txt(o.id), { etapa: 'despacho', nivel: 'info', titulo: 'Effi exige correo del cliente: se usó uno técnico', detalle: `El cliente no dio correo; se creó en Effi con cliente.${numero}@sincorreo.dealflow.sbs.` });
  }
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

export function prepararRemision(storeId: string, orderId: string, reintento = false, origen = 'revision', convenioForzado = ''): ReturnType<typeof prepararRemisionInterna> {
  return conPedido(storeId, orderId, async () => {
    const r = await prepararRemisionInterna(storeId, orderId, reintento, convenioForzado).catch(errorInterno);
    if (origen === 'revision') {
      if ('error' in r) trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'Revisión para Effi: no se puede enviar', detalle: r.error });
      else trazar(storeId, orderId, { etapa: 'despacho', nivel: 'info', titulo: 'Revisión para Effi lista', detalle: r.avisos.join(' '), datos: { lineas: r.lineas, remision: r.body } });
    }
    return r;
  });
}

async function prepararRemisionInterna(storeId: string, orderId: string, reintento = false, convenioForzado = ''): Promise<{ body: Record<string, unknown>; o: Fila; ubic: { provincia: string; ciudad: string; nombre: string }; lineas: { item: string; articulo: string }[]; avisos: string[]; productos: string[] } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c || !effiApiListo(storeId)) return { error: 'Effi no está configurado: conecta la API key y elige sucursal, bodega, centro de costos y forma de pago en Integraciones.' };
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  // Varias variantes en un ítem ("4x Falda (L · Negro, Blanco…)"): en Effi cada una es un artículo.
  if (separarItemsPedido(storeId, orderId)) trazar(storeId, orderId, { etapa: 'despacho', nivel: 'info', titulo: 'Productos con varias variantes juntas: se separaron en un ítem por variante' });
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
  const convManual: string[] = []; // convenio elegido a mano en el producto ('' | 'propio' | código)
  const convAprendido: string[] = []; // convenio de la última venta del producto (modo automático)
  const productos: string[] = []; // producto de DealFlow de cada concepto
  const enVivo = new Set<string>(); // artículos ya consultados en vivo en este pedido
  for (const it of items) {
    const emp = varianteDeItem(it, todas);
    const v = emp.v;
    let a = v ? articuloPara(storeId, v, arts) : undefined;
    // Artículo del PROVEEDOR elegido a mano: manda sobre el propio (con ese se despacha).
    if (v?.provId) {
      enVivo.add(v.provId);
      const ap = await articuloPorId(storeId, c.apiKey, v.provId);
      a = { ...(ap || { id: v.provId, descripcion: v.producto, referencia: '', ecommerce: '', stock: null }), drop: 1 };
    }
    // El vínculo guardado (manual o automático) es la verdad aunque el artículo no
    // esté en la caché (p. ej. artículos de un proveedor dropshipping): lo traemos en vivo.
    if (!v?.provId && v?.effiId && (!a || a.id !== v.effiId)) {
      enVivo.add(v.effiId);
      a = (await articuloPorId(storeId, c.apiKey, v.effiId)) || { id: v.effiId, descripcion: v.producto, referencia: v.ref, ecommerce: '', stock: null };
    }
    if (!a && v?.variantId && !v.effiId && v.proveedor !== 'dropi' && !c.vinculoManual) {
      // Variante sin vínculo: se busca el producto en vivo en Effi y se vincula por nombre.
      await vincularPorNombre(storeId, c.apiKey, todas.filter((x) => x.productId === v.productId), arts);
      if (v.effiId) { enVivo.add(v.effiId); a = await articuloPorId(storeId, c.apiKey, v.effiId); }
    }
    if (!a && v?.ref && v.refPropia !== false) {
      // Último intento en vivo por referencia (por si la caché está vieja).
      const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/articulo', { query: { referencia: v.ref, por_pagina: 5 } });
      const f = r.ok ? r.body.data?.[0] : undefined;
      if (f) a = { id: txt(f.id), descripcion: txt(f.descripcion), referencia: txt(f.referencia), ecommerce: txt(f.articulos_ecommerce), stock: null };
    }
    if (!a && !c.vinculoManual) {
      // Último recurso: buscar EN EFFI por el nombre del producto + la talla/color pedidos.
      // Si hay UN solo artículo que tenga todas esas palabras, ese es (así no se traba el pedido).
      const directo = await articuloPorTexto(storeId, it.nombre);
      if (directo) {
        a = directo;
        avisos.push(`"${it.nombre}" no estaba vinculado en DealFlow: se encontró en Effi como «${directo.descripcion}» (#${directo.id}).`);
        if (v?.variantId) vincularArticulo(storeId, v.variantId, directo.id, true);
      }
    }
    if (!a) {
      // Mensaje preciso: qué parte del vínculo falta.
      const motivo = !v ? emp.motivo : `la variante ${v.label || 'única'} de ${v.producto} no tiene artículo de Effi vinculado${c.vinculoManual ? ': vincúlala a mano con el ID del artículo' : ''}`;
      sinVinculo.push(`${it.nombre} (${motivo})`);
      trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: `Sin vínculo: ${it.nombre}`, detalle: motivo, datos: { item: it.nombre, idsGuardados: { producto: it.product_id, variante: it.variant_id }, productosParecidos: emp.parecidos, variante: v ? { producto: v.producto, label: v.label, ref: v.ref, effiId: v.effiId, proveedor: v.proveedor } : null } });
      continue;
    }
    if (v?.variantId && v.effiId !== a.id && !c.vinculoManual) vincularArticulo(storeId, v.variantId, a.id, true);
    // ¿Artículo de proveedor dropshipping? La caché vieja no traía la marca: se confirma en vivo.
    if (a.drop !== 1 && !enVivo.has(a.id)) {
      const vivo = await articuloPorId(storeId, c.apiKey, a.id);
      if (vivo) a = { ...a, drop: vivo.drop };
    }
    const cm = v?.productId ? convenioDeProducto(v.productId) : '';
    convManual.push(cm);
    // El convenio puesto a mano manda: con código es de proveedor; "propio" es mercancía tuya.
    // Artículo PROPIO sin stock con un "gemelo" vinculado al proveedor (mismo nombre): se usa
    // el del proveedor y la variante queda vinculada a él (si no, Effi rechaza la remisión).
    if (c.vinculoManual && a.drop !== 1 && cm !== 'propio' && a.stock != null && !(Number(a.stock) > 0)) {
      avisos.push(`"${it.nombre}" está vinculado a tu artículo propio #${a.id} y Effi dice que no tiene stock. Si lo despacha un proveedor, pon el ID del artículo del proveedor en «Proveedor» (Productos → el producto → Vínculo con Effi).`);
    }
    if (!c.vinculoManual && a.drop !== 1 && cm !== 'propio' && !(Number(a.stock) > 0)) {
      const gem = await gemeloDrop(storeId, c.apiKey, a);
      if (gem) {
        avisos.push(`"${it.nombre}" estaba vinculado a tu artículo propio #${a.id} (sin stock): se usó el del proveedor «${gem.descripcion}» #${gem.id}, y la variante quedó vinculada a ese.`);
        a = { ...gem, drop: 1 };
        if (v?.variantId) vincularArticulo(storeId, v.variantId, gem.id, true);
      }
    }
    const ca = !cm && v?.productId ? convenioAprendidoProducto(storeId, v.productId) : '';
    convAprendido.push(ca);
    productos.push(v?.productId || it.product_id || '');
    esDrop.push(cm === 'propio' ? false : cm ? true : a.drop === 1 || !!ca);
    lineas.push({ item: `${it.qty}× ${it.nombre}`, articulo: `${a.descripcion}${a.referencia ? ` [${a.referencia}]` : ''} · #${a.id}${a.drop === 1 ? ' · dropshipping' : ''}` });
    conceptos.push({ articulo: Number(a.id), descripcion: it.nombre.slice(0, 250), cantidad: Math.max(1, Number(it.qty) || 1), precio: Math.max(0, Math.round(Number(it.precio) || 0)) });
  }
  if (sinVinculo.length) return { error: `No pudimos emparejar con Effi: ${sinVinculo.join(' · ')}. Revísalo en Productos → el producto → Variantes → Effi.` };

  // Dropshipping: si los artículos son de un proveedor, la remisión debe llevar el
  // convenio; sin él Effi la toma como mercancía propia y exige stock en tu bodega.
  let convenio = '';
  // Convenio elegido al despachar este pedido: manda sobre todo lo demás.
  if (convenioForzado === 'propio') avisos.push('Se envía como mercancía propia (sin convenio): Effi exige stock en tu bodega.');
  else if (convenioForzado) { convenio = convenioForzado; avisos.push(`Se envía con el convenio ${convenioForzado} (elegido para este pedido).`); }
  else if (esDrop.some(Boolean)) {
    // 1) El convenio de cada artículo, según sus ventas anteriores en Effi.
    const porArticulo = new Map<string, string>();
    for (let i = 0; i < conceptos.length; i++) {
      if (!esDrop[i]) continue;
      // Orden: el puesto a mano en el producto → el de su última venta → el del artículo en Effi.
      const cv = convManual[i] && convManual[i] !== 'propio' ? convManual[i] : convAprendido[i] || await convenioDeArticulo(storeId, c.apiKey, String(conceptos[i].articulo));
      if (cv) porArticulo.set(String(conceptos[i].articulo), cv);
    }
    const distintos = [...new Set(porArticulo.values())];
    if (distintos.length > 1) {
      return { error: 'Este pedido tiene productos de proveedores dropshipping distintos (cada uno con su convenio) y Effi exige un solo convenio por remisión. Divide el pedido en uno por proveedor.' };
    }
    if (distintos.length === 1) {
      convenio = distintos[0];
      if (porArticulo.size < esDrop.filter(Boolean).length) avisos.push('Algunos productos de proveedor no tienen ventas anteriores en Effi: se usó el convenio de los demás.');
    } else convenio = c.convenioDropshipping; // 2) el que la tienda dejó por defecto
    if (!convenio) {
      const lista = await conveniosDropshipping(c.apiKey, c.convenios, storeId);
      if (lista.length === 1) {
        convenio = lista[0].id;
        guardarCfgEffi(storeId, { convenioDropshipping: convenio });
        avisos.push(`Se detectó y guardó tu convenio dropshipping: ${lista[0].nombre} (${convenio}).`);
      } else if (lista.length > 1) {
        return { error: `Este producto de proveedor dropshipping todavía no tiene ventas en Effi, así que no sabemos a cuál de tus convenios pertenece (${lista.map((x) => `${x.nombre} = ${x.id}`).join(', ')}). Elige uno por defecto en Integraciones → Effi → Convenio dropshipping; después de la primera venta DealFlow lo aprende solo.` };
      } else {
        return { error: 'Estos productos son de un proveedor dropshipping en Effi, pero falta el código del convenio dropshipping. Escríbelo en Integraciones → Effi → Convenio dropshipping (lo ves en Effi → Dropshipping → Convenios).' };
      }
    }
    if (esDrop.some((x) => !x)) avisos.push('El pedido mezcla productos propios y de proveedor dropshipping: los propios sí necesitan stock en tu bodega.');
  }

  // Mercancía propia (sin convenio): Effi exige stock en la bodega de la remisión. Si la
  // bodega configurada no alcanza pero otra de la misma sucursal sí, sale desde esa. Si
  // ninguna alcanza, se avisa YA (en la revisión) en vez de mandarla para que Effi la rechace.
  let bodega = c.bodega;
  if (!convenio) {
    const necesita = new Map<string, number>();
    conceptos.forEach((cp, i) => { if (!esDrop[i]) necesita.set(String(cp.articulo), (necesita.get(String(cp.articulo)) || 0) + cp.cantidad); });
    const datos = [...necesita].map(([id, cant]) => ({ id, cant, b: bodegasDe.get(`${storeId}:${id}`) }));
    if (datos.length && datos.every((x) => x.b && x.b.length)) {
      const enBodega = (bid: string, x: typeof datos[number]) => x.b!.find((y) => y.id === bid)?.stock || 0;
      const alcanza = (bid: string) => datos.every((x) => enBodega(bid, x) >= x.cant);
      if (!alcanza(c.bodega)) {
        const lista = await bodegasEffi(storeId, c.apiKey);
        const nombreB = (bid: string) => lista.find((b) => b.id === bid)?.nombre || datos.flatMap((x) => x.b!).find((y) => y.id === bid)?.nombre || `bodega ${bid}`;
        const misma = (bid: string) => { const b = lista.find((x) => x.id === bid); return !b || !b.sucursal || b.sucursal === c.sucursal; };
        const otra = [...new Set(datos.flatMap((x) => x.b!.map((y) => y.id)))].find((bid) => bid !== c.bodega && misma(bid) && alcanza(bid));
        if (otra) {
          bodega = otra;
          avisos.push(`Tu bodega configurada (${nombreB(c.bodega)}) no tiene stock de todo el pedido: la remisión sale desde ${nombreB(otra)}, que sí tiene.`);
        } else {
          const detalle = datos.map((x) => {
            const desc = lineas.find((l) => l.articulo.includes(`#${x.id}`))?.item || `#${x.id}`;
            const otras = x.b!.filter((y) => y.stock > 0).map((y) => `${nombreB(y.id)}: ${y.stock}`).join(', ');
            return `${desc} → en ${nombreB(c.bodega)} hay ${enBodega(c.bodega, x)}${otras ? ` (con stock: ${otras})` : ' (0 en todas las bodegas)'}`;
          }).join(' · ');
          return { error: `Effi no tiene stock para este pedido y estos artículos no están vinculados a ningún proveedor dropshipping en Effi: ${detalle}. Para que salga: 1) si los despacha un proveedor, en Effi → Dropshipping vincula estos artículos a los del proveedor (en el convenio que corresponda) y elige ese convenio aquí; o 2) si son tuyos, carga el inventario en tu bodega.` };
        }
      }
    }
  }

  const ubic = await resolverUbicacion(c.apiKey, txt(o.departamento), txt(o.ciudad));
  if ('error' in ubic) return ubic;

  // Totales: la remisión SIEMPRE suma lo mismo que el pedido (lo que se le cobra
  // al cliente contra entrega). El precio de venta del bot casi nunca es el del
  // catálogo de Effi (hay utilidad y a veces el envío va incluido), así que el total
  // se REPARTE entre los productos: en proporción a sus precios si los tienen, o
  // por unidades si no. Sin descuentos (hay artículos de proveedor en Effi que no los
  // permiten): si el valor no se divide exacto entre las unidades, la línea se parte en
  // dos con precios que difieren en $1 (ej. 12 a $12.491,67 → 8 a $12.492 + 4 a $12.491).
  const envio = Math.max(0, Math.round(Number(o.envio) || 0));
  const sumaItems = conceptos.reduce((a, k) => a + k.cantidad * k.precio, 0);
  const totalPedido = Math.round(Number(o.total) || 0) || sumaItems + envio;
  const objetivoItems = Math.max(0, totalPedido - (envio && c.articuloFlete ? envio : 0));
  const descuentos = conceptos.map(() => 0);
  if (objetivoItems > 0 && objetivoItems !== sumaItems) {
    const pesos = conceptos.map((k) => (sumaItems > 0 ? k.cantidad * k.precio : k.cantidad));
    const totalPesos = pesos.reduce((a, x) => a + x, 0) || 1;
    let resto = objetivoItems;
    const repartidos = conceptos.flatMap((k, i) => {
      const meta = i === conceptos.length - 1 ? resto : Math.round((pesos[i] / totalPesos) * objetivoItems);
      resto -= meta;
      const base = Math.floor(meta / k.cantidad);
      const sobran = meta - base * k.cantidad; // unidades que llevan $1 más (0 … cantidad-1)
      if (!sobran) return [{ ...k, precio: base }];
      return [{ ...k, cantidad: k.cantidad - sobran, precio: base }, { ...k, cantidad: sobran, precio: base + 1 }];
    });
    conceptos.splice(0, conceptos.length, ...repartidos);
    descuentos.splice(0, descuentos.length, ...conceptos.map(() => 0));
    avisos.push(`El total del pedido ($${objetivoItems.toLocaleString('es-CO')}) se repartió entre los productos para que la remisión cobre exactamente eso.`);
  }
  if (envio && c.articuloFlete) conceptos.push({ articulo: Number(c.articuloFlete), descripcion: 'Flete de envío', cantidad: 1, precio: envio });
  else if (envio) avisos.push(`El envío ($${envio.toLocaleString('es-CO')}) va incluido en el precio de los productos (no hay "artículo flete" configurado).`);
  if (descuentos.length < conceptos.length) descuentos.push(0);
  const total = conceptos.reduce((a, k, i) => a + k.cantidad * k.precio - (descuentos[i] || 0), 0);

  const numero = txt(o.numero);
  const key = `df-${storeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${numero}${reintento ? `-r${Date.now().toString(36).slice(-5)}` : ''}`.slice(0, 36);
  const body: Record<string, unknown> = {
    idempotency_key: key,
    sucursal: Number(c.sucursal), bodega: Number(bodega), centro_costos: Number(c.centroCostos),
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
  // El código del convenio puede ser alfanumérico (ej. "LjlghlaP"): se manda tal cual.
  if (convenio) body.convenio_dropshipping = /^\d+$/.test(convenio) ? Number(convenio) : convenio;
  if (c.formaPagoContado) {
    if (!c.medioPago) return { error: 'La forma de pago elegida es de contado: elige también el medio de pago (y la caja o cuenta) en Integraciones → Effi.' };
    body.medio_pago = [Number(c.medioPago)];
    body.valor_medio_pago = [total];
    if (c.caja) { const [s, id] = c.caja.split(':'); body.sucursal_caja_medio_pago = [Number(s)]; body.id_caja_medio_pago = [Number(id)]; }
    if (c.cuenta) body.cuenta_medio_pago = [Number(c.cuenta)];
  }
  // Con convenio se aprende solo en los productos de proveedor (no en los propios del mismo pedido).
  return { body, o, ubic, lineas, avisos, productos: convenio ? productos.filter((_, i) => (convenioForzado ? convManual[i] !== 'propio' : esDrop[i])) : productos };
}

/** Despacha el pedido a Effi: cliente + remisión (+ guía si está activa). */
export function despacharEffi(storeId: string, orderId: string, reintento = false, convenioForzado = ''): Promise<ResultadoEffi | { error: string }> {
  return conPedido(storeId, orderId, async () => {
    trazar(storeId, orderId, { etapa: 'despacho', titulo: reintento ? 'Reenvío a Effi iniciado' : 'Envío a Effi iniciado' });
    const r = await despacharEffiInterno(storeId, orderId, reintento, convenioForzado).catch(errorInterno);
    if ('error' in r) trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'Envío a Effi falló', detalle: r.error });
    else trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: `Remisión ${r.remision} creada en Effi${r.guia ? ` · guía ${r.guia}` : ''}`, detalle: r.avisos.join(' '), datos: r });
    return r;
  });
}

async function despacharEffiInterno(storeId: string, orderId: string, reintento = false, convenioForzado = ''): Promise<ResultadoEffi | { error: string }> {
  const c = cfgEffi(storeId)!;
  const prep = await prepararRemision(storeId, orderId, reintento, 'despacho', convenioForzado);
  if ('error' in prep) return prep;
  const { body, o, ubic, avisos, productos } = prep;
  const numDF = `DF-${txt(o.numero)}`;

  const cli = await clienteEffi(c, o, ubic);
  if ('error' in cli) { registrarLog(storeId, 'error', 'despacho', `${numDF}: ${cli.error}`); return cli; }
  body.cliente = Number(cli.tercero);

  let r = await effi<Fila>(c.apiKey, 'POST', '/api/remision_v', { body });
  // Effi exige stock porque la remisión salió como mercancía propia, pero estos artículos
  // tienen un convenio conocido (puesto a mano, aprendido o el de por defecto): se reintenta
  // UNA vez como dropshipping con ese convenio.
  if (!r.ok && !convenioForzado && !body.convenio_dropshipping && /supera las existencias/i.test(mensajeError(r)) && Array.isArray(body.articulo)) {
    const arts = (body.articulo as unknown[]).map(String);
    const conocidos = [...new Set(arts.map((a) => (db.prepare('SELECT convenio FROM effi_convenio_articulo WHERE store_id = ? AND articulo = ?').get(storeId, a) as { convenio: string } | undefined)?.convenio || '').filter(Boolean))];
    const conv = conocidos.length === 1 ? conocidos[0] : '';
    if (conv) {
      trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: `Sin stock propio: se reintenta como dropshipping (convenio ${conv})`, detalle: 'Effi no marcó estos artículos como de proveedor; se usa el convenio conocido.' });
      body.convenio_dropshipping = /^\d+$/.test(conv) ? Number(conv) : conv;
      r = await effi<Fila>(c.apiKey, 'POST', '/api/remision_v', { body });
      if (r.ok) avisos.push(`Se envió como dropshipping con el convenio ${conv} (Effi no lo marcaba como de proveedor).`);
      else delete body.convenio_dropshipping;
    } else if (conocidos.length > 1) {
      avisos.push('Los productos son de proveedores con convenios distintos: divide el pedido.');
    }
  }
  let doc = r.body.data;
  if (!r.ok && r.http === 409) {
    // Effi ya usó esta llave. Si el pedido ya tiene su remisión guardada, es un reintento.
    const prev = db.prepare('SELECT effi_doc FROM orders WHERE id = ?').get(orderId) as { effi_doc: string } | undefined;
    const d = pj<Fila>(prev?.effi_doc || '', {});
    if (d.id) doc = d;
    else {
      // Si no, se revisa la remisión que dice Effi: puede ser de ESTE pedido (se creó y no
      // alcanzamos a guardarla) o de OTRO que tuvo el mismo número (pedido eliminado).
      const m = /sucursal\s*(\d+)\s*,\s*id\s*(\d+)/i.exec(mensajeError(r));
      const ya = m ? await effi<Fila[]>(c.apiKey, 'GET', '/api/remision_v', { query: { sucursal: m[1], id: m[2], vigente: 1, por_pagina: 1 } }) : null;
      const f = ya?.ok ? ya.body.data?.[0] : undefined;
      const esDeEste = !!f && txt(f.cliente) === txt(cli.tercero) && txt(f.observacion).includes(numDF);
      if (f && esDeEste) {
        doc = f;
        trazar(storeId, orderId, { etapa: 'despacho', nivel: 'info', titulo: `Effi ya tenía la remisión ${txt(f.id_transaccion) || m![2]} de este pedido: quedó vinculada`, datos: { remision: f } });
      } else {
        const motivo = !m ? 'Effi no dijo cuál remisión' : f ? `es de otro pedido (cliente ${txt(f.nombre_cliente) || txt(f.cliente)}${txt(f.observacion) ? `, «${txt(f.observacion)}»` : ''})` : 'está anulada o ya no existe';
        trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: `La llave de Effi ya la usó la remisión ${m ? m[2] : ''} y ${motivo}: se crea una remisión nueva` });
        body.idempotency_key = `${String(body.idempotency_key).slice(0, 28)}-r${Date.now().toString(36).slice(-5)}`;
        r = await effi<Fila>(c.apiKey, 'POST', '/api/remision_v', { body });
        doc = r.body.data;
      }
    }
  }
  if (!doc && !r.ok && r.http === 409) {
    const e = 'Effi dice que esta remisión ya existe, pero no pudimos confirmarla. Revisa en Effi las remisiones con la observación de este pedido.';
    registrarLog(storeId, 'warn', 'despacho', `${numDF}: ${e}`); return { error: e };
  } else if (!doc || (!r.ok && doc === r.body.data)) {
    const sinStock = /supera las existencias/i.test(mensajeError(r)) && !body.convenio_dropshipping;
    // "El convenio Dropshipping no es válido": Effi no reconoce ESE código (mal copiado, de
    // otro proveedor o inactivo). No es un problema de los artículos.
    const convMalo = /convenio.*no es v[aá]lido|2002/i.test(mensajeError(r)) && !!body.convenio_dropshipping;
    const ambiguo = convMalo && /[Il10O]/.test(String(body.convenio_dropshipping));
    const e = `Effi no creó la remisión: ${mensajeError(r)}${sinStock ? ' → Si estos productos los despacha un proveedor, asígnales su convenio en Integraciones → Effi → Artículos (o marca uno por defecto con ★) y vuelve a enviar.' : ''}${convMalo ? ` → Effi no reconoce el código de convenio «${String(body.convenio_dropshipping)}». Ábrelo en Effi → Dropshipping → Convenios y cópialo EXACTO${ambiguo ? ' (ojo: este código tiene letras que se confunden, como I mayúscula y l minúscula, o 0 y O)' : ''}. Revisa también que el convenio esté activo y que sea del proveedor de estos artículos. Corrígelo en el producto (Convenio) o en Integraciones → Effi.` : ''}`;
    registrarLog(storeId, 'error', 'despacho', `${numDF}: ${e}`);
    return { error: e };
  }
  const remision = txt(doc!.id_transaccion) || `${txt(doc!.prefijo)}-${txt(doc!.id)}`;
  // Aprender el convenio de cada artículo de esta remisión (para los próximos pedidos).
  if (body.convenio_dropshipping && Array.isArray(body.articulo)) {
    for (const a of body.articulo as unknown[]) { try { guardarConvenioArticulo(storeId, String(a), String(body.convenio_dropshipping)); } catch { /* opcional */ } }
  }
  // …y el de cada producto (sin convenio = salió como mercancía propia: se olvida).
  try { aprenderConvenioProductos(storeId, productos, String(body.convenio_dropshipping ?? '')); } catch { /* opcional */ }
  db.prepare("UPDATE orders SET despacho_proveedor = 'effi', woo_id = ?, effi_remision = ?, effi_doc = ?, effi_convenio = ? WHERE id = ?")
    .run(remision, remision, JSON.stringify({ sucursal: txt(doc!.sucursal), id: txt(doc!.id), prefijo: txt(doc!.prefijo), tercero: cli.tercero,
      // Los productos tal como se mandaron (para registrar la devolución si el pedido vuelve).
      conceptos: { articulo: body.articulo, descripcion: body.descripcion, cantidad: body.cantidad, precio: body.precio, descuento: body.descuento } }), String(body.convenio_dropshipping ?? '') || '-', orderId);
  registrarLog(storeId, 'info', 'despacho', `${numDF} enviado a Effi: remisión ${remision} (cliente ${cli.tercero}).${avisos.length ? ' ' + avisos.join(' ') : ''}`);

  let guia = ''; let transportadora = '';
  // El remitente del proveedor (según el convenio del pedido) manda sobre el general.
  const remAuto = c.guia.activa ? (await remitenteSugerido(storeId, c.apiKey, { orderId, convenio: String(body.convenio_dropshipping ?? '') }))?.remitente || c.guia.remitente : '';
  if (c.guia.activa && !remAuto) avisos.push('No se creó la guía: falta elegir el remitente en Integraciones → Effi → Guía de transporte. Genérala desde el pedido eligiendo el remitente.');
  if (c.guia.activa && c.guia.transportadora && c.guia.servicio && c.guia.formaPagoFlete && remAuto) {
    const g = await crearGuia(storeId, c, { ...c.guia, remitente: remAuto }, o, { sucursal: txt(doc!.sucursal), id: txt(doc!.id) }, cli.tercero, ubic, reintento);
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
  const vigentes = await remitentesVigentes(storeId, c.apiKey);
  if (vigentes && !vigentes.has(txt(g.remitente))) {
    const e = `La remisión quedó creada, pero no se generó la guía: el remitente #${txt(g.remitente)} no existe o está anulado en tu Effi. Elige el remitente correcto en Integraciones → Effi → Guía de transporte (o al generar la guía).`;
    registrarLog(storeId, 'warn', 'despacho', `DF-${numero}: ${e}`);
    return { error: e };
  }
  const nombreRem = vigentes?.get(txt(g.remitente)) || `#${txt(g.remitente)}`;
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
  let r = await effi<{ guias?: Fila[] }>(c.apiKey, 'POST', '/api/guia_transporte', { body });
  // La llave ya la usó la guía de otro pedido que tuvo este mismo número (pedido eliminado):
  // se reintenta una vez con una llave nueva (este pedido no tiene guía guardada).
  if (!r.ok && r.http === 409 && !pj<Fila>(txt(o.effi_guia), {}).id) {
    trazar(storeId, txt(o.id), { etapa: 'guia', nivel: 'warn', titulo: 'La llave de la guía ya la usó otro pedido con el mismo número: se crea con una llave nueva', detalle: mensajeError(r) });
    body.idempotency_key = `${String(body.idempotency_key).slice(0, 28)}-r${Date.now().toString(36).slice(-5)}`;
    r = await effi<{ guias?: Fila[] }>(c.apiKey, 'POST', '/api/guia_transporte', { body });
  }
  if (!r.ok) {
    const m = mensajeError(r);
    // Errores de configuración de la cuenta de Effi: se dice qué hacer.
    const pista = /no tiene configurado el c[oó]digo de sucursal/i.test(m)
      ? ' → En Effi, entra a Remitentes (o Transportadoras), abre ese remitente y ponle el código de sucursal de esa transportadora (te lo da la transportadora o el soporte de Effi). Mientras tanto puedes generar la guía con otra transportadora u otro remitente desde el pedido.'
      : '';
    const e = `La remisión quedó creada, pero Effi no creó la guía: ${m}${pista}`;
    registrarLog(storeId, 'warn', 'despacho', `DF-${numero}: ${e}`);
    return { error: e };
  }
  const gg = r.body.data?.guias?.[0] || {};
  const guia = numeroGuiaEffi(gg);
  const transportadora = nombreTransportadora(txt(gg.nombre_transportadora_efficommerce) || txt(gg.nombre_transportadora));
  const url = urlDocumentoGuia(gg);
  if (url) db.prepare('UPDATE orders SET guia_url = ? WHERE id = ?').run(url, txt(o.id));
  db.prepare('UPDATE orders SET effi_guia = ?, guia = CASE WHEN ? != \'\' THEN ? ELSE guia END, transportadora = CASE WHEN ? != \'\' THEN ? ELSE transportadora END WHERE id = ?')
    .run(JSON.stringify({ sucursal: txt(gg.sucursal), id: txt(gg.id), id_transaccion: txt(gg.id_transaccion) }), guia, guia, transportadora, transportadora, txt(o.id));
  registrarLog(storeId, 'info', 'despacho', `DF-${numero}: guía ${txt(gg.id_transaccion)}${guia ? ` (${transportadora} ${guia})` : ''} creada en Effi desde el remitente ${nombreRem}.`);
  aprenderRemitente(storeId, convenioDelPedido(o), txt(g.remitente));
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
  if (!g.remitente) return { error: '⚠️ Tienes que seleccionar el remitente: la bodega desde donde sale el paquete.' };
  if (!g.transportadora || !g.servicio || !g.formaPagoFlete) return { error: 'Elige transportadora, servicio y pago del flete.' };
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const d = pj<Fila>(txt(o.effi_doc), {});
  if (!d.id) return { error: 'Primero crea la remisión en Effi; la guía se genera sobre esa remisión.' };
  const ubic = await resolverUbicacion(c.apiKey, txt(o.departamento), txt(o.ciudad));
  if ('error' in ubic) return ubic;
  let tercero = txt(d.tercero);
  if (!tercero) { const cli = await clienteEffi(c, o, ubic); if ('error' in cli) return cli; tercero = cli.tercero; }
  // La última elección queda como valor por defecto del formulario, pero SOLO si la guía
  // automática está apagada: si está encendida, esos valores son los de todas las guías
  // automáticas y no deben cambiar sin que el dueño lo haga en Integraciones → Effi.
  if (!c.guia.activa) guardarCfgEffi(storeId, { guia: { ...c.guia, transportadora: g.transportadora, servicio: g.servicio, formaPagoFlete: g.formaPagoFlete, remitente: g.remitente, peso: g.peso, volumen: g.volumen, alto: g.alto, ancho: g.ancho, largo: g.largo } });
  const yaTenia = !!pj<Fila>(txt(o.effi_guia), {}).id;
  const r = await crearGuia(storeId, c, g, o, { sucursal: txt(d.sucursal), id: txt(d.id) }, tercero, ubic, reintento || yaTenia);
  if ('error' in r) return { error: r.error.replace('La remisión quedó creada, pero Effi no creó la guía: ', 'Effi no creó la guía: ').replace('La remisión quedó creada, pero no se generó la guía: ', 'No se generó la guía: ') };
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


const novedadesPendientes = new Map<string, ReturnType<typeof setTimeout>>();
/** Junta varios avisos seguidos en una sola revisión de novedades (a los 20 s). */
function revisarNovedadesPronto(storeId: string): void {
  if (novedadesPendientes.has(storeId)) return;
  novedadesPendientes.set(storeId, setTimeout(() => {
    novedadesPendientes.delete(storeId);
    void import('./novedades.js').then((m) => m.sincronizarNovedades(storeId)).catch((e) => console.warn('[effi] novedades por webhook', e));
  }, 20_000));
}

/** Busca un campo por varios nombres posibles (Effi manda los datos "como la API" y anida a veces). */
/** Número de guía de la transportadora en los datos de Effi (el nombre del campo varía). */
export function numeroGuiaEffi(datos: unknown): string {
  const g = campo(datos, 'guia', 'numero_guia', 'guia_transportadora', 'numero_guia_transportadora', 'codigo_guia', 'numero_seguimiento', 'tracking', 'guia_efficommerce');
  if (g) return g;
  // Último recurso: cualquier campo con "guia"/"tracking"/"seguimiento" que traiga un número de guía.
  const buscar = (o: unknown, nivel = 0): string => {
    if (!o || typeof o !== 'object' || nivel > 3) return '';
    for (const [k, v] of Object.entries(o as Fila)) {
      if (v != null && typeof v !== 'object' && /guia|tracking|seguimiento/i.test(k) && !/url|pdf|estado|fecha|id_|_id$|^id$|ref/i.test(k)) {
        const t = txt(v).trim();
        if (/^[A-Za-z0-9-]{6,40}$/.test(t) && /\d{5}/.test(t)) return t;
      }
    }
    for (const v of Object.values(o as Fila)) if (v && typeof v === 'object') { const x = buscar(Array.isArray(v) ? v[0] : v, nivel + 1); if (x) return x; }
    return '';
  };
  return buscar(datos);
}

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
  // Aviso de novedad: revisamos las novedades de la tienda ya (sin esperar el ciclo de 4 min).
  if (/novedad/.test(ev)) revisarNovedadesPronto(storeId);
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
      const guia = numeroGuiaEffi(datos);
      const estadoGuia = campo(datos, 'estado_efficommerce', 'estado_guia_efficommerce', 'estado', 'nombre_est_guia');
      if (/anulad/i.test(estadoGuia) || /anulac/.test(ev)) {
        // Guía anulada en Effi: se suelta del pedido (si era la suya) para poder hacer otra.
        const idG = campo(datos, 'id');
        const actual = pj<Fila>(txt(orden.effi_guia), {});
        if (!txt(actual.id) || !idG || txt(actual.id) === idG) {
          db.prepare("UPDATE orders SET effi_guia = '', guia = CASE WHEN ? != '' AND guia = ? THEN '' ELSE guia END, estado_woo = 'Guía anulada en Effi' WHERE id = ?").run(guia, guia, orden.id);
          trazar(storeId, txt(orden.id), { etapa: 'despacho', nivel: 'warn', titulo: `Effi anuló la guía${guia ? ` ${guia}` : ''}`, detalle: 'Genera una nueva (con otra transportadora si la primera no llega a la ciudad). La remisión sigue vigente.', datos });
          registrarLog(storeId, 'warn', 'despacho', `${numDF}: Effi anuló la guía${guia ? ` ${guia}` : ''}. Genera otra desde el pedido.`);
          void import('./correo.js').then((c) => c.correoATienda(storeId, 'alertas', `${numDF}: Effi anuló la guía`, `🚫 Effi anuló la guía de ${numDF}`, ['La transportadora no pudo tomar el envío (muchas veces es porque no tiene cobertura en esa ciudad). La remisión sigue vigente.', 'Abre el pedido y genera una guía nueva, con otra transportadora si hace falta.'])).catch(() => {});
        }
        return resumen + ' · guía anulada';
      }
      const transp = campo(datos, 'nombre_transportadora_efficommerce', 'nombre_transportadora');
      const estadoTxt = campo(datos, 'estado_efficommerce', 'estado_guia_efficommerce', 'estado_new_efficommerce', 'estado_new', 'estado', 'nombre_est_guia');
      if (guia && guia !== txt(orden.guia)) db.prepare('UPDATE orders SET guia = ? WHERE id = ?').run(guia, orden.id);
      // La guía vigente (p. ej. la nueva tras una anulada) queda como la guía del pedido.
      if (campo(datos, 'id') && campo(datos, 'id_transaccion') && pj<Fila>(txt(orden.effi_guia), {}).id !== campo(datos, 'id')) {
        db.prepare('UPDATE orders SET effi_guia = ? WHERE id = ?').run(JSON.stringify({ sucursal: campo(datos, 'sucursal'), id: campo(datos, 'id'), id_transaccion: campo(datos, 'id_transaccion') }), orden.id);
      }
      const urlDoc = urlDocumentoGuia(datos);
      if (urlDoc && urlDoc !== txt(orden.guia_url)) db.prepare('UPDATE orders SET guia_url = ? WHERE id = ?').run(urlDoc, orden.id);
      if (transp) db.prepare('UPDATE orders SET transportadora = ? WHERE id = ?').run(nombreTransportadora(transp) || transp, orden.id);
      if (estadoTxt) db.prepare('UPDATE orders SET estado_woo = ? WHERE id = ?').run(estadoTxt.slice(0, 60), orden.id);
      // Datos de la guía (flete, fechas…) para el tablero de Logística.
      if (datos && typeof datos === 'object') { try { db.prepare('UPDATE orders SET effi_guia_info = ? WHERE id = ?').run(JSON.stringify(datos).slice(0, 8000), orden.id); } catch { /* opcional */ } }
      if (evento !== 'Consulta de guía') db.prepare("UPDATE orders SET historial_ts = '' WHERE id = ?").run(orden.id);
      const nuevo = siguienteEstado(txt(orden.estado), estadoLogistico(estadoTxt, !!(guia || orden.guia)));
      if (nuevo) db.prepare('UPDATE orders SET estado = ? WHERE id = ?').run(nuevo, orden.id);
      if (nuevo === 'Devuelto') { const { alQuedarDevuelto } = await import('./effiExtras.js'); alQuedarDevuelto(storeId, txt(orden.id)); }
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

/**
 * Anula en Effi la guía (o guías) vigente(s) y la remisión del pedido, para corregirlo y
 * volver a despacharlo. Effi no deja anular una remisión con guía vigente, por eso va primero
 * la guía. Si la transportadora ya recogió el paquete, Effi lo rechaza y se devuelve su mensaje.
 */
export function anularEnEffi(storeId: string, orderId: string, motivo = ''): Promise<{ ok: true; remision: string; guias: string[] } | { error: string }> {
  return conPedido(storeId, orderId, async () => {
    const c = cfgEffi(storeId);
    if (!c?.apiKey) return { error: 'Effi no está conectado.' };
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
    if (!o) return { error: 'Pedido no encontrado.' };
    const d = pj<Fila>(txt(o.effi_doc), {});
    if (!d.id) return { error: 'Este pedido no tiene remisión en Effi.' };
    const obs = (txt(motivo) || 'Anulada desde DealFlow para corregir el pedido').slice(0, 255);
    const numDF = `DF-${txt(o.numero)}`;
    const anulada = (x: Fila) => txt(x.vigente) === '0' || /anulad/i.test(`${txt(x.estado)} ${txt(x.estado_efficommerce)} ${txt(x.nombre_est_guia)}`);
    // 1) Guías vigentes de esta remisión (y la que DealFlow guardó, por si no aparece por la remisión).
    const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { id_ref: txt(d.id), por_pagina: 20 } });
    const guias = (r.ok ? r.body.data || [] : []).filter((x) => txt(x.t_trans_ref) === String(T_TRANS_REMISION_V) && (!txt(x.sucursal_ref) || txt(x.sucursal_ref) === txt(d.sucursal)) && !anulada(x));
    const gd = pj<Fila>(txt(o.effi_guia), {});
    if (txt(gd.id) && !guias.some((x) => txt(x.id) === txt(gd.id))) {
      const r2 = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { id: txt(gd.id), por_pagina: 5 } });
      const g = r2.ok ? (r2.body.data || []).find((x) => txt(x.id) === txt(gd.id)) : undefined;
      if (g && !anulada(g)) guias.push(g);
    }
    const anuladas: string[] = [];
    for (const g of guias) {
      const del = await effi<Fila>(c.apiKey, 'DELETE', '/api/guia_transporte', { body: { sucursal: Number(g.sucursal), id: Number(g.id), observacion_anular: obs } });
      const tx = txt(g.id_transaccion) || txt(g.guia) || `#${txt(g.id)}`;
      if (!del.ok && !/ya se encuentra anulad/i.test(mensajeError(del))) {
        const e = `No se pudo anular la guía ${tx} en Effi: ${mensajeError(del)}${anuladas.length ? ` (sí se anularon: ${anuladas.join(', ')})` : ''}. Si la transportadora ya recogió el paquete, no se puede anular: gestiona la devolución.`;
        trazar(storeId, orderId, { etapa: 'guia', nivel: 'error', titulo: 'No se pudo anular la guía', detalle: e });
        return { error: e };
      }
      anuladas.push(tx);
      trazar(storeId, orderId, { etapa: 'guia', nivel: 'ok', titulo: `Guía ${tx} anulada en Effi`, detalle: obs });
    }
    // 2) La remisión.
    const remision = txt(o.effi_remision) || `${txt(d.prefijo)}-${txt(d.id)}`;
    const rem = await effi<Fila>(c.apiKey, 'DELETE', '/api/remision_v', { body: { sucursal: Number(d.sucursal), id: Number(d.id), observacion_anular: obs } });
    if (!rem.ok && !/ya se encuentra anulad/i.test(mensajeError(rem))) {
      const e = `No se pudo anular la remisión ${remision} en Effi: ${mensajeError(rem)}${anuladas.length ? ` (la guía ${anuladas.join(', ')} sí quedó anulada)` : ''}.`;
      trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'No se pudo anular la remisión', detalle: e });
      return { error: e };
    }
    // 3) El pedido queda listo para volver a despacharse (vuelve a Confirmado si ya iba en logística).
    const hist = [txt(o.effi_anuladas), [remision, ...anuladas].join(' + ')].filter(Boolean).join(' · ').slice(-500);
    db.prepare(`UPDATE orders SET effi_remision = '', effi_doc = '', effi_guia = '', effi_convenio = '', woo_id = CASE WHEN despacho_proveedor = 'effi' THEN '' ELSE woo_id END,
        despacho_proveedor = CASE WHEN despacho_proveedor = 'effi' THEN '' ELSE despacho_proveedor END, guia = '', guia_url = '', guia_img = '', estado_woo = '', effi_anuladas = ?,
        estado = CASE WHEN estado IN ('Guía generada','En tránsito','En reparto','Novedad') THEN 'Confirmado' ELSE estado END WHERE id = ?`).run(hist, orderId);
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: `Remisión ${remision} anulada en Effi`, detalle: `${obs}. El pedido quedó listo para volver a despacharse.` });
    registrarLog(storeId, 'info', 'despacho', `${numDF}: remisión ${remision}${anuladas.length ? ` y guía ${anuladas.join(', ')}` : ''} anuladas en Effi desde DealFlow.`);
    return { ok: true as const, remision, guias: anuladas };
  }).catch(errorInterno);
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
  // Si Effi anuló una guía (p. ej. la transportadora no llegaba a la ciudad) y se hizo otra,
  // vale la más reciente que NO esté anulada.
  const anulada = (x: Fila) => /anulad/i.test(`${txt(x.estado_efficommerce)} ${txt(x.estado)} ${txt(x.nombre_est_guia)} ${txt(x.estado_guia_efficommerce)}`) || txt(x.vigente) === '0';
  const deRemision = (r.body.data || []).filter((x) => txt(x.t_trans_ref) === String(T_TRANS_REMISION_V) && (!txt(x.sucursal_ref) || txt(x.sucursal_ref) === txt(d.sucursal)))
    .sort((a, b) => Number(b.id) - Number(a.id));
  let g: Fila | undefined = deRemision.find((x) => !anulada(x)) || deRemision[0];
  // La guía que DealFlow creó: si no aparece por la remisión, se busca por su propio id.
  const gd = pj<Fila>(txt(o.effi_guia), {});
  if (!g && txt(gd.id)) {
    const r2 = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { id: txt(gd.id), por_pagina: 5 } });
    g = r2.ok ? (r2.body.data || []).find((x) => txt(x.id) === txt(gd.id)) : undefined;
  }
  if (!g) return { estado: 'Remisión creada · aún sin guía', guia: '' };
  await procesarWebhookEffi(storeId, 'Consulta de guía', '', { data: g });
  const f = db.prepare('SELECT estado_woo, guia FROM orders WHERE id = ?').get(orderId) as { estado_woo: string; guia: string };
  return { estado: f.estado_woo || txt(g.estado_efficommerce) || txt(g.estado), guia: f.guia || txt(g.guia) };
}
