/**
 * Administrador de anuncios dentro de DealFlow.
 *
 *  - Datos en vivo: estructura de la cuenta en Meta (campañas y conjuntos con su estado y
 *    presupuesto) + gasto/clics por anuncio (metaInsights) + chats, pedidos, entregas y
 *    devoluciones de DealFlow (statsAnuncios). Lo que Meta no ve: ROAS con lo ENTREGADO,
 *    devoluciones por campaña y por ciudad, embudo de WhatsApp por anuncio y utilidad estimada.
 *  - Acciones en Meta: encender/pausar y subir/bajar presupuesto, cada una con historial.
 *  - Optimizador (sugerencias que se aplican con un clic) y reglas automáticas que corren
 *    cada 30 minutos con las ventas reales de DealFlow, con alerta al dueño.
 */
import { db, uid, registrarLog } from './db.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v) || 0;

// ── Moneda: Meta guarda los presupuestos en la unidad mínima de la moneda de la cuenta ──────────
// Monedas con «offset» 1 en Meta (la unidad mínima es la entera): el presupuesto va tal cual.
// Las demás (USD, EUR, MXN…) van en centavos (×100). Fuente: Marketing API → Currencies.
const OFFSET_1 = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND']);
export const factorMoneda = (moneda: string) => (OFFSET_1.has(String(moneda || 'COP').toUpperCase()) ? 1 : 100);
/** Valor en pesos (unidad entera) → lo que espera Meta en daily_budget. */
export const aPresupuestoMeta = (valor: number, moneda: string) => Math.round(valor * factorMoneda(moneda));
/** daily_budget de Meta → valor en la unidad entera de la moneda. */
export const dePresupuestoMeta = (valor: unknown, moneda: string) => num(valor) / factorMoneda(moneda);

db.exec(`CREATE TABLE IF NOT EXISTS ads_cambios (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, objeto_id TEXT NOT NULL, nivel TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '',
  accion TEXT NOT NULL, antes TEXT NOT NULL DEFAULT '', despues TEXT NOT NULL DEFAULT '', origen TEXT NOT NULL DEFAULT 'manual',
  usuario TEXT NOT NULL DEFAULT '', ok INTEGER NOT NULL DEFAULT 1, error TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_ads_cambios_store ON ads_cambios(store_id, creado)');
db.exec(`CREATE TABLE IF NOT EXISTS ads_reglas (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, metrica TEXT NOT NULL, operador TEXT NOT NULL, valor REAL NOT NULL,
  dias INTEGER NOT NULL DEFAULT 1, accion TEXT NOT NULL, pct REAL NOT NULL DEFAULT 0, tope REAL NOT NULL DEFAULT 0,
  nivel TEXT NOT NULL DEFAULT 'campaign', activa INTEGER NOT NULL DEFAULT 1, ultima TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ads_config (
  store_id TEXT PRIMARY KEY, costo_producto_pct REAL NOT NULL DEFAULT 35, flete REAL NOT NULL DEFAULT 12000,
  costo_devolucion REAL NOT NULL DEFAULT 12000, cpa_objetivo REAL NOT NULL DEFAULT 0, tope_diario_cuenta REAL NOT NULL DEFAULT 0
)`);

interface Cuenta { act: string; token: string; moneda: string }
function cuenta(storeId: string): Cuenta | null {
  const c = db.prepare('SELECT ad_account_id, access_token, moneda, conectada FROM ads_cuentas WHERE store_id = ?').get(storeId) as { ad_account_id: string; access_token: string; moneda: string; conectada: number } | undefined;
  if (!c?.conectada || !c.access_token || !c.ad_account_id) return null;
  return { act: c.ad_account_id.startsWith('act_') ? c.ad_account_id : `act_${c.ad_account_id}`, token: c.access_token, moneda: c.moneda || 'COP' };
}

async function graph<T>(c: Cuenta, ruta: string, metodo: 'GET' | 'POST' = 'GET', datos?: Record<string, string>): Promise<{ ok: true; body: T } | { ok: false; error: string }> {
  try {
    const url = metodo === 'GET' ? `${GRAPH}/${ruta}${ruta.includes('?') ? '&' : '?'}${new URLSearchParams(datos || {})}` : `${GRAPH}/${ruta}`;
    const r = await fetch(url, {
      method: metodo, headers: { Authorization: `Bearer ${c.token}`, ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: metodo === 'POST' ? new URLSearchParams(datos || {}) : undefined, signal: AbortSignal.timeout(25_000),
    });
    const b = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
    if (!r.ok || b.error) return { ok: false, error: b.error?.error_user_msg || b.error?.message || `Meta respondió ${r.status}.` };
    return { ok: true, body: b };
  } catch { return { ok: false, error: 'No pudimos hablar con Meta.' }; }
}

// ── Estructura en vivo (campañas y conjuntos con estado y presupuesto) ─────────────────────────
export interface Campana { id: string; nombre: string; objetivo: string; estado: string; activa: boolean; presupuesto: number; presupuestoEn: 'campaign' | 'adset' | ''; conjuntos: Conjunto[] }
export interface Conjunto { id: string; nombre: string; campaignId: string; estado: string; activa: boolean; presupuesto: number; aprendizaje: string; edad: string; ubicaciones: string }
const cache = new Map<string, { at: number; campanas: Campana[] }>();

const OBJETIVOS: Record<string, string> = {
  OUTCOME_ENGAGEMENT: 'Mensajes / interacción', OUTCOME_SALES: 'Ventas', OUTCOME_TRAFFIC: 'Tráfico', OUTCOME_LEADS: 'Clientes potenciales',
  OUTCOME_AWARENESS: 'Reconocimiento', MESSAGES: 'Mensajes', CONVERSIONS: 'Conversiones', LINK_CLICKS: 'Tráfico',
};

export async function estructura(storeId: string, forzar = false): Promise<{ campanas: Campana[]; moneda: string } | { error: string }> {
  const c = cuenta(storeId);
  if (!c) return { error: 'Conecta tu Administrador de anuncios en Integraciones → Meta Ads.' };
  const k = cache.get(storeId);
  if (!forzar && k && Date.now() - k.at < 60_000) return { campanas: k.campanas, moneda: c.moneda };
  const filtro = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED'] }]);
  const cs = await graph<{ data?: Fila[] }>(c, `${c.act}/campaigns`, 'GET', { fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget', filtering: filtro, limit: '200' });
  if (!cs.ok) return { error: cs.error };
  const as = await graph<{ data?: Fila[] }>(c, `${c.act}/adsets`, 'GET', { fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,learning_stage_info,targeting{age_min,age_max,geo_locations}', filtering: filtro, limit: '400' });
  const conjuntos = (as.ok ? as.body.data || [] : []).map((a): Conjunto => {
    const t = (a.targeting || {}) as { age_min?: number; age_max?: number; geo_locations?: { countries?: string[]; cities?: { name?: string }[]; regions?: { name?: string }[] } };
    const geo = t.geo_locations || {};
    const lugares = [...(geo.cities || []).map((x) => x.name), ...(geo.regions || []).map((x) => x.name), ...(geo.countries || [])].filter(Boolean).slice(0, 4).join(', ');
    const li = (a.learning_stage_info || {}) as { status?: string };
    return {
      id: txt(a.id), nombre: txt(a.name), campaignId: txt(a.campaign_id), estado: txt(a.effective_status), activa: txt(a.status) === 'ACTIVE',
      presupuesto: dePresupuestoMeta(a.daily_budget, c.moneda), aprendizaje: li.status === 'LEARNING' ? 'En aprendizaje' : li.status === 'FAIL' ? 'Aprendizaje limitado' : '',
      edad: t.age_min || t.age_max ? `${t.age_min || 18}–${t.age_max || 65}` : '', ubicaciones: lugares,
    };
  });
  const campanas = (cs.body.data || []).map((x): Campana => {
    const propios = conjuntos.filter((a) => a.campaignId === txt(x.id));
    const presC = dePresupuestoMeta(x.daily_budget, c.moneda);
    return {
      id: txt(x.id), nombre: txt(x.name), objetivo: OBJETIVOS[txt(x.objective)] || txt(x.objective), estado: txt(x.effective_status), activa: txt(x.status) === 'ACTIVE',
      presupuesto: presC || propios.reduce((s, a) => s + a.presupuesto, 0), presupuestoEn: presC ? 'campaign' : propios.some((a) => a.presupuesto) ? 'adset' : '',
      conjuntos: propios,
    };
  });
  cache.set(storeId, { at: Date.now(), campanas });
  return { campanas, moneda: c.moneda };
}

// ── Acciones en Meta (con historial) ─────────────────────────────────────────────────────────
function anotarCambio(storeId: string, d: { objeto: string; nivel: string; nombre: string; accion: string; antes: string; despues: string; origen: string; usuario: string; ok: boolean; error?: string }) {
  db.prepare('INSERT INTO ads_cambios (id, store_id, objeto_id, nivel, nombre, accion, antes, despues, origen, usuario, ok, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(uid(), storeId, d.objeto, d.nivel, d.nombre.slice(0, 120), d.accion, d.antes, d.despues, d.origen, d.usuario, d.ok ? 1 : 0, (d.error || '').slice(0, 300));
}
async function buscar(storeId: string, id: string): Promise<{ nivel: 'campaign' | 'adset'; nombre: string; activa: boolean; presupuesto: number; presupuestoEn: string } | null> {
  const e = await estructura(storeId);
  if ('error' in e) return null;
  for (const cp of e.campanas) {
    if (cp.id === id) return { nivel: 'campaign', nombre: cp.nombre, activa: cp.activa, presupuesto: cp.presupuesto, presupuestoEn: cp.presupuestoEn };
    const a = cp.conjuntos.find((x) => x.id === id);
    if (a) return { nivel: 'adset', nombre: a.nombre, activa: a.activa, presupuesto: a.presupuesto, presupuestoEn: a.presupuesto ? 'adset' : '' };
  }
  return null;
}

export async function cambiarEstado(storeId: string, id: string, activar: boolean, origen = 'manual', usuario = ''): Promise<{ ok: true } | { error: string }> {
  const c = cuenta(storeId);
  if (!c) return { error: 'Conecta tu Administrador de anuncios.' };
  const o = await buscar(storeId, id);
  if (!o) return { error: 'No encontramos esa campaña o conjunto en tu cuenta de Meta.' };
  const r = await graph(c, id, 'POST', { status: activar ? 'ACTIVE' : 'PAUSED' });
  anotarCambio(storeId, { objeto: id, nivel: o.nivel, nombre: o.nombre, accion: activar ? 'activar' : 'pausar', antes: o.activa ? 'Activa' : 'Pausada', despues: activar ? 'Activa' : 'Pausada', origen, usuario, ok: r.ok, error: r.ok ? '' : r.error });
  cache.delete(storeId);
  return r.ok ? { ok: true } : { error: r.error };
}

/** Presupuesto diario nuevo (en la moneda de la cuenta, unidades enteras). Solo donde vive el presupuesto. */
export async function cambiarPresupuesto(storeId: string, id: string, nuevo: number, origen = 'manual', usuario = ''): Promise<{ ok: true; presupuesto: number } | { error: string }> {
  const c = cuenta(storeId);
  if (!c) return { error: 'Conecta tu Administrador de anuncios.' };
  const o = await buscar(storeId, id);
  if (!o) return { error: 'No encontramos esa campaña o conjunto en tu cuenta de Meta.' };
  if (!o.presupuesto || o.presupuestoEn !== o.nivel) return { error: o.nivel === 'campaign' ? 'El presupuesto de esta campaña está en sus conjuntos: cámbialo en cada conjunto.' : 'Este conjunto usa el presupuesto de su campaña: cámbialo en la campaña.' };
  const valor = Math.round(nuevo / 100) * 100;
  if (!(valor >= 1000)) return { error: 'El presupuesto diario es muy bajo.' };
  const tope = num((db.prepare('SELECT tope_diario_cuenta t FROM ads_config WHERE store_id = ?').get(storeId) as { t: number } | undefined)?.t);
  if (tope > 0 && valor > o.presupuesto && origen !== 'manual') {
    const e = await estructura(storeId);
    const total = 'error' in e ? 0 : e.campanas.filter((x) => x.activa).reduce((s, x) => s + x.presupuesto, 0);
    if (total - o.presupuesto + valor > tope) return { error: `Superaría tu tope diario de la cuenta ($${tope.toLocaleString('es-CO')}).` };
  }
  const r = await graph(c, id, 'POST', { daily_budget: String(aPresupuestoMeta(valor, c.moneda)) });
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
  anotarCambio(storeId, { objeto: id, nivel: o.nivel, nombre: o.nombre, accion: valor > o.presupuesto ? 'subir_presupuesto' : 'bajar_presupuesto', antes: fmt(o.presupuesto), despues: fmt(valor), origen, usuario, ok: r.ok, error: r.ok ? '' : r.error });
  cache.delete(storeId);
  return r.ok ? { ok: true, presupuesto: valor } : { error: r.error };
}

// ── Panel: métricas reales por campaña, embudo, ciudades, utilidad ────────────────────────────
export interface Config { costoProductoPct: number; flete: number; costoDevolucion: number; cpaObjetivo: number; topeDiarioCuenta: number }
export function config(storeId: string): Config {
  const r = db.prepare('SELECT * FROM ads_config WHERE store_id = ?').get(storeId) as Fila | undefined;
  return { costoProductoPct: r ? num(r.costo_producto_pct) : 35, flete: r ? num(r.flete) : 12000, costoDevolucion: r ? num(r.costo_devolucion) : 12000, cpaObjetivo: num(r?.cpa_objetivo), topeDiarioCuenta: num(r?.tope_diario_cuenta) };
}
export function guardarConfig(storeId: string, p: Partial<Config>): Config {
  const a = { ...config(storeId), ...Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'number' && v >= 0)) } as Config;
  db.prepare(`INSERT INTO ads_config (store_id, costo_producto_pct, flete, costo_devolucion, cpa_objetivo, tope_diario_cuenta) VALUES (?,?,?,?,?,?)
    ON CONFLICT(store_id) DO UPDATE SET costo_producto_pct = excluded.costo_producto_pct, flete = excluded.flete, costo_devolucion = excluded.costo_devolucion, cpa_objetivo = excluded.cpa_objetivo, tope_diario_cuenta = excluded.tope_diario_cuenta`)
    .run(storeId, Math.min(95, a.costoProductoPct), a.flete, a.costoDevolucion, a.cpaObjetivo, a.topeDiarioCuenta);
  return config(storeId);
}

interface Metricas {
  gasto: number; impresiones: number; clics: number; chats: number; respondieron: number; dieronDatos: number; pedidos: number; cancelados: number;
  entregados: number; devueltos: number; enCamino: number; ventas: number; ventasEntregadas: number;
}
const vacia = (): Metricas => ({ gasto: 0, impresiones: 0, clics: 0, chats: 0, respondieron: 0, dieronDatos: 0, pedidos: 0, cancelados: 0, entregados: 0, devueltos: 0, enCamino: 0, ventas: 0, ventasEntregadas: 0 });
const sumar = (a: Metricas, b: Partial<Metricas>) => { for (const k of Object.keys(a) as (keyof Metricas)[]) a[k] += num(b[k]); return a; };

/** Tasa de entrega histórica de la tienda (entregados / cerrados) de los últimos 90 días. */
function tasaEntregaTienda(storeId: string): number {
  const r = db.prepare("SELECT SUM(estado = 'Entregado') e, SUM(estado IN ('Entregado','Devuelto')) c FROM orders WHERE store_id = ? AND created_at > datetime('now','-90 days')").get(storeId) as { e: number; c: number };
  return r.c >= 10 ? r.e / r.c : 0.8;
}

function derivadas(m: Metricas, cfg: Config, tasa: number) {
  const cerrados = m.entregados + m.devueltos;
  const tasaEntrega = cerrados >= 3 ? m.entregados / cerrados : tasa;
  // Ventas que se espera cobrar: lo entregado + lo que va en camino (o sin despachar) × la tasa de entrega.
  const pendientes = Math.max(0, m.ventas - m.ventasEntregadas - (m.devueltos ? (m.ventas / Math.max(1, m.pedidos - m.cancelados)) * m.devueltos : 0));
  const ventasEsperadas = m.ventasEntregadas + pendientes * tasaEntrega;
  const efectivos = m.pedidos - m.cancelados;
  const utilidad = ventasEsperadas * (1 - cfg.costoProductoPct / 100) - (efectivos * cfg.flete) - (m.devueltos + (efectivos - m.entregados - m.devueltos) * (1 - tasaEntrega)) * cfg.costoDevolucion - m.gasto;
  return {
    roas: m.gasto ? +(m.ventas / m.gasto).toFixed(2) : 0,
    roasNeto: m.gasto ? +(ventasEsperadas / m.gasto).toFixed(2) : 0,
    cpa: efectivos ? Math.round(m.gasto / efectivos) : 0,
    cpaEntregado: m.entregados ? Math.round(m.gasto / m.entregados) : 0,
    costoChat: m.chats ? Math.round(m.gasto / m.chats) : 0,
    ctr: m.impresiones ? +((m.clics / m.impresiones) * 100).toFixed(2) : 0,
    frecuencia: 0,
    tasaDevolucion: cerrados ? Math.round((m.devueltos / cerrados) * 100) : 0,
    conversion: m.chats ? +((efectivos / m.chats) * 100).toFixed(1) : 0,
    ventasEsperadas: Math.round(ventasEsperadas), utilidad: Math.round(utilidad),
  };
}

export async function panel(storeId: string, desde: string, hasta: string) {
  const { conversionPorAnuncio } = await import('./statsAnuncios.js');
  const cfg = config(storeId);
  const tasa = tasaEntregaTienda(storeId);
  const { anuncios } = conversionPorAnuncio(storeId, desde, hasta);
  // Dieron datos (embudo) por anuncio.
  const datosPorAd = new Map((db.prepare(`SELECT ad_id, SUM(CASE WHEN f_dio = 1 OR COALESCE(f_resumen_at,'') != '' THEN 1 ELSE 0 END) n FROM leads
    WHERE store_id = ? AND ad_id != '' AND date(created_at,'-5 hours') BETWEEN ? AND ? GROUP BY ad_id`).all(storeId, desde, hasta) as { ad_id: string; n: number }[]).map((r) => [r.ad_id, r.n]));
  // Alcance por anuncio (para la frecuencia = impresiones / alcance).
  const alcance = new Map((db.prepare('SELECT ad_id, SUM(alcance) a FROM ads_insights WHERE store_id = ? AND fecha BETWEEN ? AND ? GROUP BY ad_id').all(storeId, desde, hasta) as { ad_id: string; a: number }[]).map((r) => [r.ad_id, r.a]));
  const est = await estructura(storeId);
  const vivas = 'error' in est ? [] : est.campanas;

  const porCampana = new Map<string, Metricas>();
  const porConjunto = new Map<string, Metricas>();
  const total = vacia();
  const ads = anuncios.filter((a) => a.gasto > 0 || a.chats > 0).map((a) => {
    const m: Metricas = { gasto: a.gasto, impresiones: a.impresiones, clics: a.clics, chats: a.chats, respondieron: a.respondieron, dieronDatos: datosPorAd.get(a.id) || 0, pedidos: a.pedidos, cancelados: a.cancelados, entregados: a.entregados, devueltos: a.devueltos, enCamino: a.enCamino, ventas: a.ventas, ventasEntregadas: a.ventasEntregadas };
    sumar(total, m);
    if (a.campaignId) sumar(porCampana.get(a.campaignId) || (porCampana.set(a.campaignId, vacia()), porCampana.get(a.campaignId)!), m);
    if (a.adsetId) sumar(porConjunto.get(a.adsetId) || (porConjunto.set(a.adsetId, vacia()), porConjunto.get(a.adsetId)!), m);
    const d = derivadas(m, cfg, tasa);
    const al = alcance.get(a.id) || 0;
    d.frecuencia = al ? +(a.impresiones / al).toFixed(2) : 0;
    return { id: a.id, nombre: a.adName || a.titular, campaignId: a.campaignId, campana: a.campaignName, conjunto: a.adsetName, thumb: a.media, url: a.url, producto: a.producto, ...m, ...d, serie: a.serie };
  });

  const campanas = vivas.map((cp) => {
    const m = porCampana.get(cp.id) || vacia();
    return {
      ...cp, ...m, ...derivadas(m, cfg, tasa),
      conjuntos: cp.conjuntos.map((a) => { const ma = porConjunto.get(a.id) || vacia(); return { ...a, ...ma, ...derivadas(ma, cfg, tasa) }; }),
    };
  });
  // Campañas con gasto en el periodo que ya no están vivas (borradas o archivadas).
  for (const [id, m] of porCampana) if (!campanas.some((x) => x.id === id)) {
    const n = ads.find((x) => x.campaignId === id)?.campana || 'Campaña';
    campanas.push({ id, nombre: n, objetivo: '', estado: 'ARCHIVED', activa: false, presupuesto: 0, presupuestoEn: '', conjuntos: [], ...m, ...derivadas(m, cfg, tasa) });
  }
  campanas.sort((a, b) => Number(b.activa) - Number(a.activa) || b.gasto - a.gasto);

  // Serie diaria total (gasto vs ventas).
  const dias = new Map<string, { gasto: number; ventas: number; pedidos: number }>();
  for (const a of anuncios) for (const s of a.serie) { const x = dias.get(s.fecha) || { gasto: 0, ventas: 0, pedidos: 0 }; x.gasto += s.gasto; x.ventas += s.ventas; x.pedidos += s.pedidos; dias.set(s.fecha, x); }
  const serie = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, x]) => ({ fecha, ...x }));

  // Ciudades: pedidos de anuncios por municipio, con su tasa de devolución.
  const ciudades = (db.prepare(`SELECT COALESCE(NULLIF(TRIM(ciudad),''),'(sin ciudad)') ciudad, COALESCE(departamento,'') dep, COUNT(*) pedidos,
      SUM(estado = 'Entregado') entregados, SUM(estado = 'Devuelto') devueltos, SUM(CASE WHEN estado != 'Cancelado' THEN total ELSE 0 END) ventas
    FROM orders WHERE store_id = ? AND COALESCE(ad_id,'') != '' AND date(created_at,'-5 hours') BETWEEN ? AND ? GROUP BY ciudad, dep HAVING pedidos >= 2 ORDER BY pedidos DESC LIMIT 40`)
    .all(storeId, desde, hasta) as { ciudad: string; dep: string; pedidos: number; entregados: number; devueltos: number; ventas: number }[])
    .map((c) => { const cer = c.entregados + c.devueltos; return { ...c, tasaDevolucion: cer ? Math.round((c.devueltos / cer) * 100) : 0, cerrados: cer }; })
    .sort((a, b) => b.tasaDevolucion - a.tasaDevolucion || b.pedidos - a.pedidos);

  const resumen = { ...total, ...derivadas(total, cfg, tasa) };
  return {
    rango: { desde, hasta }, conectada: !('error' in est), errorMeta: 'error' in est ? est.error : '', moneda: 'error' in est ? 'COP' : est.moneda,
    resumen, serie, campanas, anuncios: ads.sort((a, b) => b.gasto - a.gasto), ciudades, config: cfg, tasaEntregaTienda: Math.round(tasa * 100),
    sugerencias: sugerencias(campanas, ads, ciudades, cfg),
    reglas: listarReglas(storeId),
    historial: db.prepare('SELECT objeto_id, nivel, nombre, accion, antes, despues, origen, usuario, ok, error, creado FROM ads_cambios WHERE store_id = ? ORDER BY creado DESC LIMIT 40').all(storeId),
  };
}

// ── Optimizador: sugerencias que se aplican con un clic ───────────────────────────────────────
interface Sugerencia { id: string; tipo: 'escalar' | 'recortar' | 'creativo' | 'publico' | 'aviso'; titulo: string; porque: string; accion?: { tipo: 'presupuesto' | 'estado'; id: string; valor: number } }
type CampanaPanel = Campana & Metricas & ReturnType<typeof derivadas>;
function sugerencias(campanas: CampanaPanel[], ads: (Metricas & ReturnType<typeof derivadas> & { id: string; nombre: string })[], ciudades: { ciudad: string; dep: string; tasaDevolucion: number; cerrados: number }[], cfg: Config): Sugerencia[] {
  const out: Sugerencia[] = [];
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
  const objetivo = cfg.cpaObjetivo;
  for (const c of campanas.filter((x) => x.activa && x.gasto > 0)) {
    const donde = c.presupuestoEn === 'campaign' ? c.id : c.conjuntos.length === 1 && c.conjuntos[0].presupuesto ? c.conjuntos[0].id : '';
    const pres = c.presupuestoEn === 'campaign' ? c.presupuesto : c.conjuntos[0]?.presupuesto || 0;
    const aprendiendo = c.conjuntos.some((a) => a.aprendizaje === 'En aprendizaje');
    if (c.roasNeto >= 3 && c.pedidos - c.cancelados >= 3 && donde && !aprendiendo) {
      out.push({ id: `esc-${c.id}`, tipo: 'escalar', titulo: `Sube 20% a ${c.nombre}`, porque: `ROAS con lo que se espera cobrar: ${c.roasNeto} (${c.tasaDevolucion}% de devolución). Subir de a 20% no reinicia el aprendizaje de Meta.`, accion: { tipo: 'presupuesto', id: donde, valor: Math.round(pres * 1.2) } });
    } else if ((c.roasNeto < 1 && c.gasto > 30000) || (objetivo && c.cpa > objetivo * 2 && c.gasto > objetivo)) {
      out.push({ id: `pau-${c.id}`, tipo: 'recortar', titulo: `Pausa ${c.nombre}`, porque: `Gastó ${fmt(c.gasto)} con ${c.pedidos - c.cancelados} venta(s) (ROAS esperado ${c.roasNeto}). ${c.chats && c.conversion < 5 ? 'Llegan chats pero no compran: revisa el precio, el mensaje inicial o el creativo.' : ''}`, accion: { tipo: 'estado', id: c.id, valor: 0 } });
    } else if (c.tasaDevolucion >= 30 && c.entregados + c.devueltos >= 5) {
      out.push({ id: `dev-${c.id}`, tipo: 'aviso', titulo: `${c.nombre} devuelve el ${c.tasaDevolucion}%`, porque: 'Revisa a qué ciudades está llegando (abajo) y si el anuncio promete algo que el producto no cumple.' });
    }
    if (aprendiendo) out.push({ id: `apr-${c.id}`, tipo: 'aviso', titulo: `${c.nombre} está en aprendizaje`, porque: 'Evita cambios grandes de presupuesto o público hasta que salga del aprendizaje (unos 50 resultados en 7 días).' });
  }
  for (const a of ads.filter((x) => x.gasto > 0)) {
    if (a.frecuencia >= 3.5 && a.ctr < 1.2) out.push({ id: `fat-${a.id}`, tipo: 'creativo', titulo: `"${a.nombre}" está cansado`, porque: `Frecuencia ${a.frecuencia} y CTR ${a.ctr}%: la gente ya lo vio muchas veces. Rótalo con un creativo nuevo del Estudio IA.` });
    else if (a.gasto >= Math.max(30000, objetivo) && a.pedidos - a.cancelados === 0) out.push({ id: `sin-${a.id}`, tipo: 'creativo', titulo: `"${a.nombre}" gastó ${fmt(a.gasto)} sin ventas`, porque: `${a.chats} chats y ninguna venta. Pausa ese anuncio en Meta o cambia su mensaje inicial.` });
  }
  const malas = ciudades.filter((c) => c.tasaDevolucion >= 40 && c.cerrados >= 4).slice(0, 5);
  if (malas.length) out.push({ id: 'ciudades', tipo: 'publico', titulo: `Excluye ${malas.length === 1 ? 'una ciudad' : `${malas.length} ciudades`} que devuelven mucho`, porque: malas.map((c) => `${c.ciudad} (${c.tasaDevolucion}%)`).join(', ') + '. Sácalas de la segmentación de tus conjuntos en Meta.' });
  return out.slice(0, 12);
}

export async function aplicarSugerencia(storeId: string, accion: { tipo: string; id: string; valor: number }, usuario: string) {
  if (accion.tipo === 'estado') return cambiarEstado(storeId, accion.id, accion.valor === 1, 'sugerencia', usuario);
  if (accion.tipo === 'presupuesto') return cambiarPresupuesto(storeId, accion.id, accion.valor, 'sugerencia', usuario);
  return { error: 'Acción no válida.' };
}

// ── Reglas automáticas ──────────────────────────────────────────────────────────────────────
export type Metrica = 'cpa' | 'roas_neto' | 'gasto_sin_venta' | 'tasa_devolucion';
export type AccionRegla = 'pausar' | 'subir' | 'bajar' | 'avisar';
export interface Regla { id: string; metrica: Metrica; operador: '>' | '<'; valor: number; dias: number; accion: AccionRegla; pct: number; tope: number; activa: boolean; ultima: string }
export const METRICAS: Record<Metrica, string> = { cpa: 'Costo por venta', roas_neto: 'ROAS esperado (con devoluciones)', gasto_sin_venta: 'Gasto sin ninguna venta', tasa_devolucion: '% de devolución' };

export function listarReglas(storeId: string): Regla[] {
  return (db.prepare('SELECT * FROM ads_reglas WHERE store_id = ? ORDER BY creado').all(storeId) as Fila[]).map((r) => ({
    id: txt(r.id), metrica: txt(r.metrica) as Metrica, operador: txt(r.operador) as '>' | '<', valor: num(r.valor), dias: num(r.dias), accion: txt(r.accion) as AccionRegla, pct: num(r.pct), tope: num(r.tope), activa: !!r.activa, ultima: txt(r.ultima),
  }));
}
export function guardarRegla(storeId: string, r: Partial<Regla>): Regla[] | { error: string } {
  if (!r.metrica || !(r.metrica in METRICAS)) return { error: 'Elige qué medir.' };
  if (!['pausar', 'subir', 'bajar', 'avisar'].includes(String(r.accion))) return { error: 'Elige qué hacer.' };
  if (!(num(r.valor) >= 0)) return { error: 'Escribe el valor.' };
  const pct = Math.min(30, Math.max(0, num(r.pct)));
  if ((r.accion === 'subir' || r.accion === 'bajar') && !pct) return { error: 'Escribe el porcentaje (máximo 30%).' };
  const dias = Math.min(7, Math.max(1, num(r.dias) || 1));
  if (r.id) db.prepare('UPDATE ads_reglas SET metrica=?, operador=?, valor=?, dias=?, accion=?, pct=?, tope=?, activa=? WHERE id = ? AND store_id = ?')
    .run(r.metrica, r.operador === '<' ? '<' : '>', num(r.valor), dias, r.accion, pct, num(r.tope), r.activa === false ? 0 : 1, r.id, storeId);
  else db.prepare('INSERT INTO ads_reglas (id, store_id, metrica, operador, valor, dias, accion, pct, tope) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(uid(), storeId, r.metrica, r.operador === '<' ? '<' : '>', num(r.valor), dias, r.accion, pct, num(r.tope));
  return listarReglas(storeId);
}
export function borrarRegla(storeId: string, id: string): Regla[] { db.prepare('DELETE FROM ads_reglas WHERE id = ? AND store_id = ?').run(id, storeId); return listarReglas(storeId); }

const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const menosDias = (f: string, n: number) => new Date(new Date(f + 'T12:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);

/** Corre las reglas de una tienda. Cada regla actúa como mucho una vez cada 24 h por campaña. */
export async function correrReglas(storeId: string): Promise<number> {
  const reglas = listarReglas(storeId).filter((r) => r.activa);
  if (!reglas.length || !cuenta(storeId)) return 0;
  let acciones = 0;
  for (const r of reglas) {
    const hasta = hoyCO();
    const p = await panel(storeId, menosDias(hasta, r.dias - 1), hasta);
    for (const c of p.campanas.filter((x) => x.activa && x.gasto > 0)) {
      const ya = db.prepare("SELECT 1 FROM ads_cambios WHERE store_id = ? AND objeto_id = ? AND origen = ? AND creado > datetime('now','-24 hours')").get(storeId, c.id, `regla:${r.id}`);
      if (ya) continue;
      const valor = r.metrica === 'cpa' ? c.cpa : r.metrica === 'roas_neto' ? c.roasNeto : r.metrica === 'tasa_devolucion' ? c.tasaDevolucion : (c.pedidos - c.cancelados === 0 ? c.gasto : 0);
      if (r.metrica === 'cpa' && !(c.pedidos - c.cancelados)) continue; // sin ventas: eso lo mide «gasto sin venta»
      const cumple = r.operador === '>' ? valor > r.valor : valor < r.valor;
      if (!cumple) continue;
      const desc = `${METRICAS[r.metrica]} ${r.operador} ${r.valor.toLocaleString('es-CO')} en ${r.dias} día(s) (va en ${valor.toLocaleString('es-CO')})`;
      let resultado = '';
      if (r.accion === 'pausar') { const x = await cambiarEstado(storeId, c.id, false, `regla:${r.id}`, 'regla'); resultado = 'error' in x ? `no se pudo pausar: ${x.error}` : 'se pausó'; }
      else if (r.accion === 'subir' || r.accion === 'bajar') {
        const donde = c.presupuestoEn === 'campaign' ? c.id : c.conjuntos.length === 1 ? c.conjuntos[0].id : '';
        const pres = c.presupuestoEn === 'campaign' ? c.presupuesto : c.conjuntos[0]?.presupuesto || 0;
        if (!donde || !pres) { resultado = 'no se cambió el presupuesto (está repartido en varios conjuntos)'; }
        else {
          let nuevo = pres * (1 + (r.accion === 'subir' ? r.pct : -r.pct) / 100);
          if (r.accion === 'subir' && r.tope > 0) nuevo = Math.min(nuevo, r.tope);
          if (Math.round(nuevo) === Math.round(pres)) continue;
          const x = await cambiarPresupuesto(storeId, donde, nuevo, `regla:${r.id}`, 'regla');
          resultado = 'error' in x ? `no se pudo cambiar el presupuesto: ${x.error}` : `presupuesto ${r.accion === 'subir' ? 'subido' : 'bajado'} a $${Math.round(x.presupuesto).toLocaleString('es-CO')}`;
        }
      } else {
        anotarCambio(storeId, { objeto: c.id, nivel: 'campaign', nombre: c.nombre, accion: 'aviso', antes: '', despues: desc, origen: `regla:${r.id}`, usuario: 'regla', ok: true });
        resultado = 'solo aviso';
      }
      acciones++;
      registrarLog(storeId, 'warn', 'anuncios', `Regla automática · ${c.nombre}: ${desc} → ${resultado}.`);
      void import('./push.js').then((m) => m.enviarPush(storeId, 'pedidos', `Anuncios: ${c.nombre}`, `${desc} → ${resultado}.`, { url: '/' })).catch(() => {});
    }
    db.prepare("UPDATE ads_reglas SET ultima = datetime('now') WHERE id = ?").run(r.id);
  }
  return acciones;
}

let iniciado = false;
export function iniciarAdsManager(): void {
  if (iniciado) return;
  iniciado = true;
  const ronda = async () => {
    const tiendas = db.prepare("SELECT DISTINCT r.store_id FROM ads_reglas r JOIN ads_cuentas c ON c.store_id = r.store_id AND c.conectada = 1 WHERE r.activa = 1").all() as { store_id: string }[];
    for (const t of tiendas) await correrReglas(t.store_id).catch((e) => console.warn('[anuncios] reglas', e));
  };
  setTimeout(() => void ronda(), 5 * 60_000).unref?.();
  setInterval(() => void ronda(), 30 * 60_000).unref?.();
}
