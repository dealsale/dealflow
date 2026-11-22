import { randomBytes } from 'node:crypto';
import { db, pj, registrarLog } from './db.js';
import { trazar, trazarApi } from './trazabilidad.js';
import { cifrarTexto, descifrarTexto } from './cifrado.js';
import { normGeo } from './colombiaGeo.js';
import { DANE } from './daneCodigos.js';
import { CENTROS_POBLADOS } from './centrosPoblados.js';
import { estadoLogistico, siguienteEstado } from './estadosPedido.js';
import { productosPausados } from './vinculos.js';

/**
 * Integración con Skydropx (Colombia): una sola cuenta para cotizar y generar guías con
 * varias transportadoras (Interrapidísimo, Coordinadora, Servientrega…).
 *
 * Flujo de la API (https://app.skydropx.com/co/es-CO/api-docs):
 *  1. Token OAuth con el Client ID y Client Secret de la tienda (dura 2 h).
 *  2. POST /api/v1/quotations → GET /api/v1/quotations/{id} hasta is_completed: tarifas.
 *  3. POST /api/v1/shipments con el rate_id elegido → número de guía y PDF.
 *  4. Estado: GET /api/v1/shipments/{id} (ciclo de despachos) o el webhook de Skydropx.
 *
 * Skydropx pide el «código postal» del origen y del destino: en Colombia es el código DANE
 * del municipio (Cali = 76001, Medellín = 05001), sacado de la tabla DIVIPOLA.
 */

// SKYDROPX_BASE_URL solo para pruebas locales (servidor simulado).
const BASES = { produccion: 'https://api-pro.skydropx.com', sandbox: 'https://sb-pro.skydropx.com' } as const;
type Ambiente = keyof typeof BASES;

export interface OrigenSky { nombre: string; empresa: string; telefono: string; email: string; direccion: string; referencia: string; departamento: string; ciudad: string; nit: string }
export interface PaqueteSky { largo: number; ancho: number; alto: number; peso: number; contenido: string }
export interface CfgSky { clientId: string; clientSecret: string; ambiente: Ambiente; origen: OrigenSky; paquete: PaqueteSky; webhookToken: string }

try { db.exec("ALTER TABLE orders ADD COLUMN skydropx_envio TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

const PAQUETE_BASE: PaqueteSky = { largo: 20, ancho: 15, alto: 10, peso: 1, contenido: 'Productos de la tienda' };
const ORIGEN_BASE: OrigenSky = { nombre: '', empresa: '', telefono: '', email: '', direccion: '', referencia: '', departamento: '', ciudad: '', nit: '' };

/** Configuración guardada de la tienda (con el secreto descifrado), o null si no está conectada. */
export function cfgSkydropx(storeId: string): CfgSky | null {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'skydropx'").get(storeId) as { config: string } | undefined;
  if (!row) return null;
  const c = pj<Partial<CfgSky>>(row.config, {});
  let secret = '';
  try { secret = descifrarTexto(String(c.clientSecret || '')); } catch { secret = ''; }
  if (!c.clientId || !secret) return null;
  return {
    clientId: String(c.clientId), clientSecret: secret, ambiente: c.ambiente === 'sandbox' ? 'sandbox' : 'produccion',
    origen: { ...ORIGEN_BASE, ...(c.origen || {}) }, paquete: { ...PAQUETE_BASE, ...(c.paquete || {}) }, webhookToken: String(c.webhookToken || ''),
  };
}

/** Lo que ve el panel (sin el secreto). */
export function estadoSkydropx(storeId: string) {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'skydropx'").get(storeId) as { config: string } | undefined;
  const c = row ? pj<Partial<CfgSky>>(row.config, {}) : {};
  return {
    conectado: !!(c.clientId && c.clientSecret), clientId: String(c.clientId || ''), ambiente: c.ambiente === 'sandbox' ? 'sandbox' : 'produccion',
    origen: { ...ORIGEN_BASE, ...(c.origen || {}) }, paquete: { ...PAQUETE_BASE, ...(c.paquete || {}) }, webhookToken: String(c.webhookToken || ''),
  };
}

/** Guarda la conexión. Si el secreto viene vacío se conserva el anterior (para editar solo el origen). */
export function guardarCfgSkydropx(storeId: string, nuevo: { clientId?: string; clientSecret?: string; ambiente?: string; origen?: Partial<OrigenSky>; paquete?: Partial<PaqueteSky> }): void {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'skydropx'").get(storeId) as { config: string } | undefined;
  const ant = row ? pj<Partial<CfgSky>>(row.config, {}) : {};
  const n = (v: unknown, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
  const paq = { ...PAQUETE_BASE, ...(ant.paquete || {}), ...(nuevo.paquete || {}) };
  const cfg = {
    clientId: String(nuevo.clientId ?? ant.clientId ?? '').trim(),
    clientSecret: nuevo.clientSecret && nuevo.clientSecret.trim() ? cifrarTexto(nuevo.clientSecret.trim()) : String(ant.clientSecret || ''),
    ambiente: (nuevo.ambiente ?? ant.ambiente) === 'sandbox' ? 'sandbox' : 'produccion',
    origen: Object.fromEntries(Object.entries({ ...ORIGEN_BASE, ...(ant.origen || {}), ...(nuevo.origen || {}) }).map(([k, v]) => [k, String(v ?? '').trim().slice(0, 100)])),
    paquete: { largo: n(paq.largo, 20), ancho: n(paq.ancho, 15), alto: n(paq.alto, 10), peso: n(paq.peso, 1), contenido: String(paq.contenido || PAQUETE_BASE.contenido).slice(0, 60) },
    webhookToken: String(ant.webhookToken || randomBytes(18).toString('hex')),
  };
  db.prepare(`INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'skydropx', ?, datetime('now'))
    ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`).run(storeId, JSON.stringify(cfg));
  tokens.delete(storeId);
}

export function desconectarSkydropx(storeId: string): void {
  db.prepare("DELETE FROM store_integrations WHERE store_id = ? AND tipo = 'skydropx'").run(storeId);
  tokens.delete(storeId);
}

/** Tienda dueña de un token de webhook (la URL que se pega en Skydropx → Conexiones → Webhooks). */
export function tiendaPorWebhookSkydropx(token: string): string | null {
  if (!token || token.length < 20) return null;
  const filas = db.prepare("SELECT store_id, config FROM store_integrations WHERE tipo = 'skydropx'").all() as { store_id: string; config: string }[];
  return filas.find((f) => pj<{ webhookToken?: string }>(f.config, {}).webhookToken === token)?.store_id || null;
}

// ── HTTP ──────────────────────────────────────────────────────────────
const base = (c: CfgSky) => (process.env.SKYDROPX_BASE_URL || BASES[c.ambiente]).replace(/\/+$/, '');
const tokens = new Map<string, { token: string; vence: number; clave: string }>();

async function token(storeId: string, c: CfgSky, renovar = false): Promise<string | { error: string }> {
  const clave = `${c.ambiente}:${c.clientId}`;
  const t = tokens.get(storeId);
  if (!renovar && t && t.clave === clave && t.vence > Date.now()) return t.token;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${base(c)}/api/v1/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret, scope: 'default orders.create' }),
      signal: AbortSignal.timeout(20000),
    });
  } catch { return { error: 'No pudimos conectar con Skydropx. Intenta de nuevo en un momento.' }; }
  const b = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  trazarApi('Skydropx', 'POST', '/api/v1/oauth/token', res.status, res.ok, Date.now() - t0, { grant_type: 'client_credentials', client_id: c.clientId.slice(0, 6) + '…' }, { ...b, access_token: b.access_token ? '***' : undefined });
  if (!res.ok || !b.access_token) {
    return { error: res.status === 401 ? `Skydropx rechazó las credenciales (${c.ambiente === 'sandbox' ? 'pruebas' : 'producción'}). Revisa el Client ID y el Client Secret, y que sean del mismo ambiente.` : (b.error_description || `Skydropx respondió ${res.status}.`) };
  }
  tokens.set(storeId, { token: b.access_token, vence: Date.now() + Math.max(60, (b.expires_in || 7200) - 300) * 1000, clave });
  return b.access_token;
}

type Resp = { ok: boolean; http: number; body: Record<string, unknown> };
async function sky(storeId: string, c: CfgSky, method: string, path: string, body?: unknown): Promise<Resp> {
  for (let intento = 0; intento < 2; intento++) {
    const tk = await token(storeId, c, intento > 0);
    if (typeof tk !== 'string') return { ok: false, http: 401, body: { error_description: tk.error } };
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${base(c)}${path}`, {
        method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${tk}` },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      const tiempo = e instanceof Error && /timeout|abort/i.test(e.name + e.message);
      return { ok: false, http: 0, body: { error_description: tiempo ? 'Skydropx no respondió a tiempo (30 s). Intenta de nuevo.' : 'No pudimos conectar con Skydropx.' } };
    }
    const b = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    trazarApi('Skydropx', method, path, res.status, res.ok, Date.now() - t0, body, b, res.ok ? undefined : errorSky(b, res.status));
    if (res.status === 401 && intento === 0) { tokens.delete(storeId); continue; } // token vencido: uno nuevo y se reintenta
    return { ok: res.ok, http: res.status, body: b };
  }
  return { ok: false, http: 401, body: {} };
}

/** Mensajes claros para los errores que Skydropx documenta. */
const ERRORES: Record<string, string> = {
  INSUFFICIENT_CREDITS: 'No hay saldo en Skydropx para pagar la guía. Recarga saldo en Skydropx (o activa pagar con el recaudo) y vuelve a intentar.',
  NO_CREDITS_NOR_COLLECTION: 'No hay saldo en Skydropx y el recaudo no alcanza para pagar la guía. Recarga saldo en Skydropx.',
  NO_CREDITS_AND_BILLING_DATA_REQUIRED: 'No hay saldo en Skydropx y la cuenta no tiene datos de facturación verificados. Recarga saldo o completa la facturación en Skydropx.',
  NO_CREDITS_AND_COLLECTION_LIMIT: 'No hay saldo en Skydropx y la cuenta llegó al límite de envíos pagados con recaudo.',
  BILLING_DATA_REQUIRED: 'Para pagar con el recaudo, completa primero los datos de facturación en Skydropx.',
  COLLECTION_AMOUNT_INSUFFICIENT: 'El valor a cobrar es menor que el costo del envío.',
  COLLECTION_LIMIT_REACHED: 'La cuenta de Skydropx llegó al límite de guías pagadas con recaudo.',
  DEBT_LIMIT_REACHED: 'La cuenta de Skydropx está bloqueada por deuda de cargos extra.',
  FEATURE_NOT_AVAILABLE: 'El pago con recaudo no está habilitado en tu cuenta de Skydropx.',
  COD_NOT_ACTIVE: 'El envío no tiene contra entrega activa.',
};
function errorSky(b: Record<string, unknown>, http: number): string {
  const cod = String(b.error_code || b.code || b.error || '');
  if (ERRORES[cod]) return ERRORES[cod];
  const msg = b.error_description || b.message || b.errors || b.error;
  const texto = typeof msg === 'string' ? msg : msg ? JSON.stringify(msg).slice(0, 300) : '';
  return texto || `Skydropx respondió ${http}.`;
}

// ── Municipios → código DANE ──────────────────────────────────────────
const ALIAS_CIUDAD: Record<string, string> = { cartagena: 'cartagena de indias', cucuta: 'san jose de cucuta', buga: 'guadalajara de buga', tumaco: 'san andres de tumaco', mompos: 'santa cruz de mompox', mompox: 'santa cruz de mompox', lorica: 'santa cruz de lorica', 'santa fe de bogota': 'bogota', ubate: 'villa de san diego de ubate', tolu: 'santiago de tolu', 'san andres': 'san andres', 'el espinal': 'espinal', 'carmen de viboral': 'el carmen de viboral',
  'el atrato': 'atrato', chibolo: 'chivolo', 'pueblo viejo': 'puebloviejo', 'vista hermosa': 'vistahermosa', 'el socorro': 'socorro', 'tolu viejo': 'san jose de toluviejo', toluviejo: 'san jose de toluviejo' };
const ALIAS_DEPTO: Record<string, string> = { 'bogota': 'bogota', 'san andres': 'archipielago de san andres providencia y santa catalina', 'san andres y providencia': 'archipielago de san andres providencia y santa catalina', valle: 'valle del cauca', guajira: 'la guajira', 'norte santander': 'norte de santander' };
const DANE_N: { depto: string; dn: string; mpios: { nombre: string; n: string; codigo: string }[] }[] = Object.entries(DANE).map(([d, m]) => ({ depto: d, dn: normGeo(d), mpios: Object.entries(m).map(([nombre, codigo]) => ({ nombre, n: normGeo(nombre), codigo })) }));

// Corregimientos y caseríos del DANE → su municipio (el cliente escribe «Santa Elena», «La Buitrera»…).
const CP_N: { codigo: string; nombre: string; n: string }[] = Object.entries(CENTROS_POBLADOS).flatMap(([codigo, ns]) => ns.map((nombre) => ({ codigo, nombre, n: normGeo(nombre) })));
const MPIO_POR_CODIGO = new Map(DANE_N.flatMap((d) => d.mpios.map((m) => [m.codigo, { d, m }] as const)));

// Municipio que la tienda escogió a mano para una ciudad que no estaba en la lista (se recuerda).
db.exec(`CREATE TABLE IF NOT EXISTS skydropx_ciudades (
  store_id TEXT NOT NULL, depto_n TEXT NOT NULL, ciudad_n TEXT NOT NULL, codigo TEXT NOT NULL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (store_id, depto_n, ciudad_n)
)`);

const bonito = (s: string) => s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|El)\b/g, (x) => x.toLowerCase()).replace(/^./, (x) => x.toUpperCase());
const normDepto = (departamento: string) => { const nd0 = normGeo(departamento).replace(/\b(departamento|depto|dpto)\b/g, '').replace(/^de /, '').trim(); return ALIAS_DEPTO[nd0] || nd0; };
// Quita lo que el cliente antepone: «corregimiento de», «vereda», «municipio de», «barrio»…
const normCiudad = (ciudad: string) => normGeo(ciudad).replace(/^(corregimiento|correg|vereda|inspeccion|caserio|municipio|mpio|centro poblado|cp|barrio)( de| del)? /, '').trim();

/** Distancia entre dos textos (letras cambiadas); para errores de escritura. */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const v = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = v[0]; v[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = v[j]; v[j] = Math.min(v[j] + 1, v[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return v[b.length];
}

type Ubicacion = { codigo: string; depto: string; ciudad: string; localidad?: string };
const deCodigo = (codigo: string, localidad?: string): Ubicacion | null => {
  const x = MPIO_POR_CODIGO.get(codigo);
  return x ? { codigo, depto: bonito(x.d.depto), ciudad: bonito(x.m.nombre), ...(localidad ? { localidad } : {}) } : null;
};

/**
 * Código DANE del municipio (Skydropx lo usa como código postal) y los nombres oficiales.
 * Skydropx solo entiende MUNICIPIOS; Effi y Dropi tienen listas propias con corregimientos.
 * Orden: municipio exacto → nombre corto/largo → corregimiento del DANE → error de escritura →
 * lo que la tienda escogió antes a mano. Si es corregimiento, su nombre va en `localidad`.
 */
export function codigoDane(departamento: string, ciudad: string, storeId = ''): Ubicacion | { error: string; elegir?: true } {
  const nc0 = normCiudad(ciudad);
  if (!nc0) return { error: 'El pedido no tiene ciudad.' };
  if (/^bogota\b/.test(nc0)) return { codigo: '11001', depto: 'Bogotá D.C.', ciudad: 'Bogotá' };
  const nc = ALIAS_CIUDAD[nc0] || nc0;
  const nd = normDepto(departamento);
  const iguales = (n: string) => n === nc || n === nc0 || ALIAS_CIUDAD[n] === nc;
  const dep = nd ? DANE_N.find((d) => d.dn === nd) : undefined;
  if (storeId) {
    const g = db.prepare('SELECT codigo FROM skydropx_ciudades WHERE store_id = ? AND depto_n = ? AND ciudad_n = ?').get(storeId, nd, nc0) as { codigo: string } | undefined;
    const u = g && deCodigo(g.codigo, normGeo(ciudad) !== normGeo(MPIO_POR_CODIGO.get(g.codigo)?.m.nombre || '') ? txt(ciudad).trim() : '');
    if (u) return u;
  }
  if (dep) {
    const m = dep.mpios.find((x) => iguales(x.n));
    if (m) return { codigo: m.codigo, depto: bonito(dep.depto), ciudad: bonito(m.nombre) };
    // Nombre corto u oficial largo (Cali = Santiago de Cali, Mariquita = San Sebastián de Mariquita):
    // solo si dentro del departamento hay UNO que contenga al otro como palabras completas.
    const sinDe = (s: string) => ` ${s.replace(/\b(de|del|la|las|los|el|y)\b/g, ' ').replace(/\s+/g, ' ').trim()} `;
    const a = sinDe(nc);
    const parecidos = dep.mpios.filter((x) => { const b = sinDe(x.n); return a.trim().length >= 4 && (b.includes(a) || a.includes(b)); });
    if (parecidos.length === 1) return { codigo: parecidos[0].codigo, depto: bonito(dep.depto), ciudad: bonito(parecidos[0].nombre) };
  }
  const todos = DANE_N.flatMap((d) => d.mpios.filter((x) => iguales(x.n)).map((x) => ({ d, x })));
  if (todos.length === 1) return { codigo: todos[0].x.codigo, depto: bonito(todos[0].d.depto), ciudad: bonito(todos[0].x.nombre) };
  if (todos.length > 1) return { error: `Hay un municipio "${ciudad}" en ${todos.map((t) => bonito(t.d.depto)).join(', ')}: revisa el departamento del pedido.`, elegir: true };
  // Corregimiento / caserío del DANE (dentro del departamento si lo sabemos): un solo municipio posible.
  const enDepto = (codigo: string) => !dep || dep.mpios.some((m) => m.codigo === codigo);
  const cps = CP_N.filter((x) => x.n === nc0 && enDepto(x.codigo));
  const mpiosCp = [...new Set(cps.map((x) => x.codigo))];
  if (mpiosCp.length === 1) { const u = deCodigo(mpiosCp[0], bonito(cps[0].nombre)); if (u) return u; }
  // Error de escritura en el municipio (Bucaramnga, Fusagasuga…): solo si hay UNO muy parecido.
  if (nc0.length >= 5) {
    const cand = (dep ? [dep] : DANE_N).flatMap((d) => d.mpios.filter((x) => distancia(x.n, nc0) <= (nc0.length >= 8 ? 2 : 1)).map((x) => ({ d, x })));
    if (cand.length === 1) return { codigo: cand[0].x.codigo, depto: bonito(cand[0].d.depto), ciudad: bonito(cand[0].x.nombre) };
  }
  if (mpiosCp.length > 1) return { error: `"${ciudad}" es un corregimiento que existe en varios municipios (${mpiosCp.map((c) => MPIO_POR_CODIGO.get(c)?.m.nombre).filter(Boolean).map((s) => bonito(String(s))).join(', ')}): escoge a cuál pertenece.`, elegir: true };
  return { error: `No encontramos "${ciudad}"${departamento ? ` en ${departamento}` : ''} en la lista de municipios. Puede ser una vereda o un corregimiento: escoge el municipio al que pertenece.`, elegir: true };
}

/** Municipios para escoger a mano (los del departamento del pedido primero, con los sugeridos arriba). */
export function municipiosParaElegir(departamento: string, ciudad: string): { codigo: string; nombre: string; depto: string; sugerido: boolean }[] {
  const nd = normDepto(departamento); const nc = normCiudad(ciudad);
  const dep = nd ? DANE_N.find((d) => d.dn === nd) : undefined;
  const sugeridos = new Set<string>([
    ...CP_N.filter((x) => x.n === nc || (nc.length >= 5 && distancia(x.n, nc) <= 2)).map((x) => x.codigo),
    ...DANE_N.flatMap((d) => d.mpios.filter((m) => m.n === nc || (nc.length >= 5 && distancia(m.n, nc) <= 2)).map((m) => m.codigo)),
  ]);
  const lista = (dep ? [dep] : DANE_N).flatMap((d) => d.mpios.map((m) => ({ codigo: m.codigo, nombre: bonito(m.nombre), depto: bonito(d.depto), sugerido: sugeridos.has(m.codigo) })));
  return lista.sort((a, b) => Number(b.sugerido) - Number(a.sugerido) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Recuerda para la tienda a qué municipio pertenece una ciudad que no estaba en la lista. */
export function recordarMunicipio(storeId: string, departamento: string, ciudad: string, codigo: string): { ok: true; ciudad: string } | { error: string } {
  const u = deCodigo(String(codigo || ''));
  if (!u) return { error: 'Escoge un municipio de la lista.' };
  const nc = normCiudad(ciudad);
  if (!nc) return { error: 'El pedido no tiene ciudad.' };
  db.prepare("INSERT INTO skydropx_ciudades (store_id, depto_n, ciudad_n, codigo) VALUES (?,?,?,?) ON CONFLICT(store_id, depto_n, ciudad_n) DO UPDATE SET codigo = excluded.codigo, actualizado = datetime('now')")
    .run(storeId, normDepto(departamento), nc, u.codigo);
  return { ok: true, ciudad: `${u.ciudad} (${u.depto})` };
}

// ── Conexión ──────────────────────────────────────────────────────────
export async function verificarSkydropx(storeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = cfgSkydropx(storeId);
  if (!c) return { ok: false, error: 'Faltan el Client ID y el Client Secret de Skydropx.' };
  const t = await token(storeId, c, true);
  if (typeof t !== 'string') return { ok: false, error: t.error };
  if (c.origen.ciudad) {
    const o = codigoDane(c.origen.departamento, c.origen.ciudad);
    if ('error' in o) return { ok: false, error: `Ciudad de origen: ${o.error}` };
  }
  return { ok: true };
}

// ── Cotizar ───────────────────────────────────────────────────────────
export interface TarifaSky { id: string; transportadora: string; carrier: string; servicio: string; precio: number; dias: number | null }
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Productos de Skydropx ↔ variantes de DealFlow ─────────────────────
// La API de Skydropx solo deja LEER productos (no crearlos): la tienda los sube en Skydropx
// (con el archivo de variantes que le da DealFlow) y aquí se vincula cada variante a uno.
db.exec(`CREATE TABLE IF NOT EXISTS skydropx_vinculos (
  store_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '',
  sky_id TEXT NOT NULL, sky_nombre TEXT NOT NULL DEFAULT '', sky_sku TEXT NOT NULL DEFAULT '',
  auto INTEGER NOT NULL DEFAULT 0, actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, product_id, variant_id)
)`);

export interface ProductoSky { id: string; nombre: string; sku: string; precio: number }
export interface VarianteSky { productId: string; variantId: string; producto: string; label: string; sku: string; precio: number; skyId: string; skyNombre: string; auto: boolean }

const normTxt = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normSku = (s: string) => String(s || '').toUpperCase().replace(/\s+/g, '');

/** Todos los productos creados en la cuenta de Skydropx (paginado). */
export async function productosDeSkydropx(storeId: string): Promise<ProductoSky[] | { error: string }> {
  const c = cfgSkydropx(storeId);
  if (!c) return { error: 'Conecta Skydropx primero.' };
  const out: ProductoSky[] = [];
  for (let page = 1; page <= 60; page++) {
    const r = await sky(storeId, c, 'GET', `/api/v1/products?page=${page}`);
    if (!r.ok) return page === 1 ? { error: `Skydropx no devolvió tus productos: ${errorSky(r.body, r.http)}` } : out;
    const data = (Array.isArray(r.body.data) ? r.body.data : []) as Fila[];
    for (const d of data) {
      const a = (d.attributes || {}) as Fila;
      out.push({ id: txt(d.id || a.id), nombre: txt(a.name), sku: txt(a.sku), precio: num(a.price) });
    }
    const meta = (r.body.meta || {}) as Fila;
    if (!data.length || !meta.next_page) break;
  }
  return out.filter((p) => p.id);
}

/** Código (SKU) de una variante: el suyo, su referencia de Effi o uno fijo generado por DealFlow. */
function skuDe(prodSku: string, v: { id: string; sku: string; refs: string } | null, unica: boolean, productId: string): string {
  if (v) {
    const refs = pj<Record<string, string>>(v.refs, {});
    const propio = txt(v.sku || refs.effi).trim();
    if (propio) return propio.slice(0, 40);
    if (unica && prodSku) return prodSku.slice(0, 40);
    return `DF-${v.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }
  return (prodSku || `DF-${productId.replace(/-/g, '').slice(0, 8).toUpperCase()}`).slice(0, 40);
}

/** Cada variante de la tienda (o el producto, si no tiene variantes) con su vínculo de Skydropx. */
export function variantesParaSkydropx(storeId: string): VarianteSky[] {
  const prods = db.prepare('SELECT id, nombre, precio, COALESCE(sku,\'\') sku FROM products WHERE store_id = ? ORDER BY nombre').all(storeId) as { id: string; nombre: string; precio: number; sku: string }[];
  const vst = db.prepare("SELECT id, label, COALESCE(sku,'') sku, COALESCE(refs,'{}') refs FROM variants WHERE product_id = ? ORDER BY orden, label");
  const vinc = new Map((db.prepare('SELECT product_id, variant_id, sky_id, sky_nombre, auto FROM skydropx_vinculos WHERE store_id = ?').all(storeId) as { product_id: string; variant_id: string; sky_id: string; sky_nombre: string; auto: number }[])
    .map((x) => [`${x.product_id}|${x.variant_id}`, x]));
  const out: VarianteSky[] = [];
  for (const p of prods) {
    const vs = vst.all(p.id) as { id: string; label: string; sku: string; refs: string }[];
    const filas = vs.length ? vs.map((v) => ({ v, label: v.label || '' })) : [{ v: null, label: '' }];
    for (const { v, label } of filas) {
      const k = vinc.get(`${p.id}|${v?.id || ''}`);
      out.push({ productId: p.id, variantId: v?.id || '', producto: p.nombre, label, sku: skuDe(p.sku, v, vs.length === 1, p.id), precio: Math.round(num(p.precio)), skyId: k?.sky_id || '', skyNombre: k?.sky_nombre || '', auto: !!k?.auto });
    }
  }
  return out;
}

export function vincularVarianteSkydropx(storeId: string, productId: string, variantId: string, prod: { id: string; nombre?: string; sku?: string } | null, auto = false): void {
  if (!prod?.id) { db.prepare('DELETE FROM skydropx_vinculos WHERE store_id = ? AND product_id = ? AND variant_id = ?').run(storeId, productId, variantId || ''); return; }
  db.prepare(`INSERT INTO skydropx_vinculos (store_id, product_id, variant_id, sky_id, sky_nombre, sky_sku, auto, actualizado) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(store_id, product_id, variant_id) DO UPDATE SET sky_id = excluded.sky_id, sky_nombre = excluded.sky_nombre, sky_sku = excluded.sky_sku, auto = excluded.auto, actualizado = excluded.actualizado`)
    .run(storeId, productId, variantId || '', prod.id, txt(prod.nombre).slice(0, 120), txt(prod.sku).slice(0, 60), auto ? 1 : 0);
}

/** Nombre con el que la variante se sube a Skydropx (y con el que se casa): «Producto - Variante». */
const nombreSky = (v: { producto: string; label: string }) => (v.label ? `${v.producto} - ${v.label.replace(/\s*·\s*/g, ' / ')}` : v.producto).slice(0, 100);

/**
 * Vincula solas las variantes sin producto de Skydropx: primero por código (SKU) y luego por
 * nombre («Producto - Talla / Color», con o sin tildes). No toca las que se eligieron a mano.
 */
export async function vincularAutoSkydropx(storeId: string): Promise<{ vinculadas: number; sinVinculo: number; total: number; productosSky: number } | { error: string }> {
  const prods = await productosDeSkydropx(storeId);
  if ('error' in prods) return prods;
  const porSku = new Map(prods.filter((p) => p.sku).map((p) => [normSku(p.sku), p]));
  const porNombre = new Map(prods.map((p) => [normTxt(p.nombre), p]));
  const pausados = productosPausados(storeId, 'skydropx'); // «Quitar todo»: no se vuelven a vincular solos
  const vars = variantesParaSkydropx(storeId).filter((v) => !pausados.has(v.productId));
  let vinculadas = 0;
  for (const v of vars) {
    // Si el producto vinculado ya no existe en Skydropx, se vuelve a buscar.
    if (v.skyId && prods.some((p) => p.id === v.skyId)) continue;
    const m = porSku.get(normSku(v.sku))
      || porNombre.get(normTxt(nombreSky(v)))
      || porNombre.get(normTxt(`${v.producto} ${v.label}`))
      || (!v.label ? porNombre.get(normTxt(v.producto)) : undefined);
    if (m) { vincularVarianteSkydropx(storeId, v.productId, v.variantId, m, true); vinculadas++; }
    else if (v.skyId) vincularVarianteSkydropx(storeId, v.productId, v.variantId, null);
  }
  const ahora = variantesParaSkydropx(storeId);
  return { vinculadas, sinVinculo: ahora.filter((v) => !v.skyId).length, total: ahora.length, productosSky: prods.length };
}

/** Archivo (CSV) con una fila por variante para crear los productos en Skydropx. */
export function csvVariantesSkydropx(storeId: string): string {
  const c = cfgSkydropx(storeId);
  const p = c?.paquete || PAQUETE_BASE;
  const esc = (s: string | number) => { const t = String(s ?? ''); return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const filas = variantesParaSkydropx(storeId).map((v) => [nombreSky(v), v.sku, v.precio, p.peso, p.largo, p.ancho, p.alto].map(esc).join(','));
  return ['nombre,sku,precio,peso_kg,largo_cm,ancho_cm,alto_cm', ...filas].join('\n');
}

/**
 * Productos del pedido para la guía: cada ítem con su variante y, si está vinculada,
 * el producto de Skydropx (product_id). Si el pedido no tiene ítems, va uno con el total.
 */
function productosSky(storeId: string, o: Fila, contenido: string): Fila[] {
  const items = db.prepare("SELECT nombre, qty, precio, COALESCE(product_id,'') product_id, COALESCE(variant_id,'') variant_id FROM order_items WHERE order_id = ?").all(txt(o.id)) as { nombre: string; qty: number; precio: number; product_id: string; variant_id: string }[];
  const vars = items.length ? variantesParaSkydropx(storeId) : [];
  const lista = items.filter((x) => x.qty > 0).map((x, i) => {
    const v = varianteDelItem(x, vars);
    const base: Fila = { name: (v?.skyNombre || String(x.nombre || contenido)).replace(/\s+/g, ' ').trim().slice(0, 60), sku: v?.sku || `DF-${i + 1}`, quantity: Math.round(x.qty), price: Math.max(1, Math.round(num(x.precio))) };
    return v?.skyId ? { product_id: v.skyId, ...base } : base;
  });
  return lista.length ? lista : [{ name: String(contenido || 'Mercancía').slice(0, 60), sku: 'DF-1', quantity: 1, price: Math.max(1000, Math.round(num(o.total))) }];
}

/** La variante de un ítem del pedido: por su id; si no viene, por el producto y la talla/color del nombre. */
function varianteDelItem(it: { nombre: string; product_id: string; variant_id: string }, vars: VarianteSky[]): VarianteSky | undefined {
  if (it.variant_id) { const v = vars.find((x) => x.variantId === it.variant_id); if (v) return v; }
  const n = normTxt(it.nombre);
  const delProd = it.product_id ? vars.filter((x) => x.productId === it.product_id) : vars.filter((x) => n.startsWith(normTxt(x.producto)));
  if (delProd.length === 1) return delProd[0];
  // «Camiseta (M · Negro)»: la variante cuyo label (M Negro) aparece completo en el nombre del ítem.
  const conLabel = delProd.filter((x) => x.label && ` ${n} `.includes(` ${normTxt(x.label)} `)).sort((a, b) => b.label.length - a.label.length);
  return conLabel[0];
}

function faltaOrigen(o: OrigenSky, deProveedor: boolean): string {
  const faltan = [!o.nombre && 'nombre', !o.telefono && 'celular', !o.email && 'correo', !o.direccion && 'dirección', !o.ciudad && 'ciudad'].filter(Boolean);
  if (!faltan.length) return '';
  return deProveedor
    ? `Completa los datos de la bodega del proveedor en Integraciones → Skydropx (falta: ${faltan.join(', ')}${faltan.includes('correo') ? '; si el proveedor no tiene correo, pon el tuyo en «¿Desde dónde envías?»' : ''}).`
    : `Completa los datos de quien envía en Integraciones → Skydropx (falta: ${faltan.join(', ')}).`;
}

/**
 * Dirección de recogida del envío: la bodega del proveedor elegido o, sin proveedor, la de la tienda.
 * Con proveedor, la guía sale a nombre de la tienda (empresa) pero la transportadora recoge en la
 * bodega del proveedor y llama a su celular.
 */
async function origenEnvio(storeId: string, c: CfgSky, proveedorId: string): Promise<{ origen: OrigenSky; proveedorId: string } | { error: string }> {
  if (!proveedorId) { const f = faltaOrigen(c.origen, false); return f ? { error: f } : { origen: c.origen, proveedorId: '' }; }
  const { proveedorPorId } = await import('./bodegas.js');
  const p = proveedorPorId(storeId, proveedorId);
  if (!p) return { error: 'Esa bodega de proveedor ya no existe. Elige otra.' };
  const origen: OrigenSky = {
    nombre: p.nombre, empresa: c.origen.empresa || p.empresa || p.nombre, telefono: p.telefono, email: p.email || c.origen.email,
    direccion: p.direccion, referencia: p.referencia, departamento: p.departamento, ciudad: p.ciudad, nit: c.origen.nit || p.nit,
  };
  const f = faltaOrigen(origen, true);
  return f ? { error: f } : { origen, proveedorId: p.id };
}

export async function cotizarSkydropx(storeId: string, orderId: string, opts: { recaudo: boolean; proveedorId?: string }): Promise<{ ciudad: string; disponibles: TarifaSky[]; noDisponibles: { nombre: string; motivo: string }[]; cotizacion: string } | { error: string; elegir?: true }> {
  const c = cfgSkydropx(storeId);
  if (!c) return { error: 'Conecta Skydropx primero en Integraciones.' };
  const og = await origenEnvio(storeId, c, txt(opts.proveedorId));
  if ('error' in og) return og;
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const desde = codigoDane(og.origen.departamento, og.origen.ciudad, storeId);
  if ('error' in desde) return { error: `Ciudad de origen${og.proveedorId ? ' de la bodega del proveedor' : ''} (Integraciones → Skydropx): ${desde.error}` };
  const hacia = codigoDane(txt(o.departamento), txt(o.ciudad), storeId);
  if ('error' in hacia) return hacia;
  const total = Math.max(num(o.total), 1000);
  const p = c.paquete;
  const r = await sky(storeId, c, 'POST', '/api/v1/quotations', {
    quotation: {
      address_from: { country_code: 'CO', postal_code: desde.codigo, area_level1: desde.depto, area_level2: desde.ciudad, area_level3: desde.ciudad },
      address_to: { country_code: 'CO', postal_code: hacia.codigo, area_level1: hacia.depto, area_level2: hacia.ciudad, area_level3: barrioSky(o, hacia) },
      parcels: [{ length: Math.round(p.largo), width: Math.round(p.ancho), height: Math.round(p.alto), weight: Math.max(1, p.peso), declared_amount: total }],
      // Con contra entrega Skydropx exige el valor a cobrarle al cliente (sin él responde «products no puede estar en blanco»).
      cash_on_delivery: opts.recaudo, recipient_pays_shipping: false, ...(opts.recaudo ? { on_delivery_amount: Math.round(num(o.total)) } : {}),
    },
  });
  if (!r.ok) return { error: `Skydropx no pudo cotizar: ${errorSky(r.body, r.http)}` };
  const id = txt(r.body.id);
  if (!id) return { error: 'Skydropx no devolvió la cotización.' };
  // Las tarifas llegan de a poco: se consulta hasta que Skydropx diga que terminó (máx. ~30 s).
  let q = r.body;
  for (let i = 0; i < 15 && !q.is_completed; i++) {
    await espera(i < 3 ? 1200 : 2000);
    const g = await sky(storeId, c, 'GET', `/api/v1/quotations/${encodeURIComponent(id)}`);
    if (g.ok) q = g.body;
  }
  const rates = (Array.isArray(q.rates) ? q.rates : []) as Fila[];
  const disponibles: TarifaSky[] = rates.filter((x) => x.success === true && num(x.total) > 0).map((x) => ({
    id: txt(x.id), transportadora: txt(x.provider_display_name || x.provider_name), carrier: txt(x.provider_name),
    servicio: txt(x.provider_service_name), precio: num(x.total), dias: x.days == null ? null : num(x.days),
  })).sort((a, b) => a.precio - b.precio);
  const noDisponibles = rates.filter((x) => x.success !== true).map((x) => ({
    nombre: txt(x.provider_display_name || x.provider_name),
    motivo: Array.isArray(x.error_messages) && x.error_messages.length ? txt((x.error_messages[0] as Fila).display_message || (x.error_messages[0] as Fila).error_message) : txt(x.status),
  })).filter((x, i, a) => x.nombre && a.findIndex((y) => y.nombre === x.nombre) === i);
  if (!disponibles.length && !q.is_completed) return { error: 'Skydropx todavía está calculando las tarifas. Vuelve a cotizar en unos segundos.' };
  return { ciudad: `${hacia.ciudad} (${hacia.depto})`, disponibles, noDisponibles, cotizacion: id };
}

/** Barrio para Skydropx (area_level3): si la ciudad era un corregimiento, va su nombre primero. Igual en cotización y guía. */
function barrioSky(o: Fila, u: { ciudad: string; localidad?: string }): string {
  const b = txt(o.barrio).replace(/\s+/g, ' ').trim();
  return (u.localidad ? (b && normGeo(b) !== normGeo(u.localidad) ? `${u.localidad} - ${b}` : u.localidad) : b || u.ciudad).slice(0, 60);
}

// ── Crear el envío ────────────────────────────────────────────────────
const corta = (s: string, n: number) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const soloDigitos = (s: string) => String(s || '').replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');

export async function crearEnvioSkydropx(storeId: string, orderId: string, tarifa: { id: string; transportadora: string }, proveedorId = ''): Promise<{ ok: true; envioId: string; guia: string } | { error: string }> {
  const c = cfgSkydropx(storeId);
  if (!c) return { error: 'Conecta Skydropx primero en Integraciones.' };
  const ori = await origenEnvio(storeId, c, proveedorId);
  if ('error' in ori) return ori;
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  if (!tarifa?.id) return { error: 'Elige una transportadora.' };
  const nombreCliente = (await import('./nombres.js')).nombreDelPedido(txt(o.lead_id), txt(o.cliente)) || txt(o.cliente) || 'Cliente';
  const dir = corta(txt(o.direccion), 100);
  if (!dir) return { error: 'El pedido no tiene dirección.' };
  const tel = soloDigitos(txt(o.tel));
  if (tel.length < 7) return { error: 'El pedido no tiene un celular válido.' };
  const og = ori.origen;
  // Skydropx pide en la guía la misma ubicación que en la cotización (país, código, depto, ciudad)
  // más area_level3 (barrio). Si no hay barrio se repite la ciudad.
  const desde = codigoDane(og.departamento, og.ciudad, storeId);
  if ('error' in desde) return { error: `Ciudad de origen${ori.proveedorId ? ' de la bodega del proveedor' : ''} (Integraciones → Skydropx): ${desde.error}` };
  const hacia = codigoDane(txt(o.departamento), txt(o.ciudad), storeId);
  if ('error' in hacia) return { error: hacia.error };
  const ubic = (u: { codigo: string; depto: string; ciudad: string }, barrio: string) => ({
    country_code: 'CO', postal_code: u.codigo, area_level1: u.depto, area_level2: u.ciudad, area_level3: corta(barrio, 60) || u.ciudad,
  });
  const r = await sky(storeId, c, 'POST', '/api/v1/shipments', {
    shipment: {
      rate_id: tarifa.id, printing_format: 'standard',
      address_from: { ...ubic(desde, ''), street1: corta(og.direccion, 100), name: corta(og.nombre, 30), company: corta(og.empresa || og.nombre, 60), phone: soloDigitos(og.telefono), email: og.email, reference: corta(og.referencia || og.direccion, 30), ...(og.nit ? { tax_id_number: og.nit } : {}) },
      address_to: { ...ubic(hacia, barrioSky(o, hacia)), street1: dir, name: corta(nombreCliente, 30), company: corta(nombreCliente, 60), phone: tel, email: og.email, reference: corta(txt(o.barrio) || txt(o.nota) || dir, 40) },
      // package_type es obligatorio para Skydropx: '4G' = caja de cartón (el empaque normal de una tienda).
      packages: [{ package_number: '1', package_protected: false, package_type: '4G', package_content: corta(c.paquete.contenido, 60), products: productosSky(storeId, o, c.paquete.contenido) }],
    },
  });
  if (!r.ok) return { error: `Skydropx no creó la guía: ${errorSky(r.body, r.http)}` };
  const data = (r.body.data || {}) as Fila;
  const envioId = txt(data.id);
  if (!envioId) return { error: 'Skydropx no devolvió el envío.' };
  const datos = leerEnvio(r.body);
  db.prepare("UPDATE orders SET skydropx_envio = ?, despacho_proveedor = 'skydropx', transportadora = ?, woo_id = '', estado_woo = ?, dropi_order_id = '', guia = ?, guia_url = ?, bodega_id = ?, guia_proveedor = '' WHERE id = ?")
    .run(envioId, corta(datos.transportadora || tarifa.transportadora, 60), datos.estadoTexto || 'Creando guía', datos.guia, datos.labelUrl, ori.proveedorId, orderId);
  registrarLog(storeId, 'info', 'despacho', `DF-${txt(o.numero)} enviado a Skydropx por ${tarifa.transportadora}${datos.guia ? ` · guía ${datos.guia}` : ''}.`);
  // La guía a veces tarda unos segundos: si no vino en la respuesta, se pregunta enseguida.
  if (!datos.guia) { await espera(2500); await consultarEnvioSkydropx(storeId, orderId).catch(() => null); }
  else await aplicarEstado(storeId, orderId, datos);
  const fin = db.prepare('SELECT guia FROM orders WHERE id = ?').get(orderId) as { guia: string | null };
  return { ok: true, envioId, guia: txt(fin?.guia) };
}

// ── Estado del envío ──────────────────────────────────────────────────
/** Estados de Skydropx → texto en español que entiende estadoLogistico. */
const ESTADOS: Record<string, string> = {
  created: 'Guía creada', picked_up: 'Recogido por la transportadora', in_transit: 'En tránsito', last_mile: 'En reparto',
  delivery_attempt: 'Intento de entrega fallido', delivered_to_branch: 'Disponible en oficina', delivered: 'Entregado',
  exception: 'Novedad', in_return: 'En devolución', canceled: 'Envío cancelado en Skydropx', destroyed: 'Novedad: paquete dañado', retained: 'Novedad: paquete retenido',
};
interface DatosEnvio { guia: string; labelUrl: string; transportadora: string; status: string; estadoTexto: string; flujo: string; error: string }

function leerEnvio(body: Fila): DatosEnvio {
  const data = (body.data || {}) as Fila;
  const at = (data.attributes || {}) as Fila;
  const inc = (Array.isArray(body.included) ? body.included : []) as Fila[];
  const paq = inc.find((x) => x.type === 'packages' || (x.attributes as Fila | undefined)?.tracking_number !== undefined);
  const pa = ((paq?.attributes || {}) as Fila);
  const status = txt(pa.tracking_status || '').toLowerCase();
  const flujo = txt(at.workflow_status).toLowerCase();
  const err = (at.error_detail || null) as Fila | null;
  return {
    guia: txt(at.master_tracking_number || pa.tracking_number).trim(),
    labelUrl: txt(pa.label_url),
    transportadora: txt(at.carrier_name),
    status, flujo,
    estadoTexto: ESTADOS[status] || (flujo === 'success' || flujo === 'pending' ? '' : flujo),
    error: err ? txt(err.error_message || err.error_message_detail || err.error_code) : '',
  };
}

const intentoAviso = new Map<string, number>();
/** Guarda guía/PDF/estado en el pedido, mueve el estado y avisa la guía al cliente la primera vez. */
async function aplicarEstado(storeId: string, orderId: string, d: DatosEnvio): Promise<void> {
  const o = db.prepare('SELECT id, numero, estado, guia, guia_url, guia_avisada, tel, COALESCE(estado_woo,\'\') estado_woo, bodega_id, guia_proveedor FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return;
  const cambios: string[] = []; const params: unknown[] = [];
  const guiaNueva = d.guia && d.guia !== txt(o.guia) ? d.guia : '';
  if (guiaNueva) { cambios.push('guia = ?'); params.push(d.guia); }
  if (d.labelUrl && d.labelUrl !== txt(o.guia_url)) { cambios.push('guia_url = ?'); params.push(d.labelUrl); }
  if (d.transportadora) { cambios.push('transportadora = ?'); params.push(corta(d.transportadora, 60)); }
  if (d.estadoTexto && d.estadoTexto !== txt(o.estado_woo)) {
    cambios.push('estado_woo = ?'); params.push(d.estadoTexto);
    trazar(storeId, orderId, { etapa: 'despacho', nivel: d.status === 'exception' || d.status === 'delivery_attempt' ? 'warn' : 'info', titulo: `Skydropx: ${txt(o.estado_woo) || 'sin estado'} → ${d.estadoTexto}` });
  }
  // Una cancelación del envío no cancela el pedido: se puede volver a despachar.
  const destino = d.status === 'canceled' ? null : siguienteEstado(txt(o.estado), estadoLogistico(d.estadoTexto, !!(d.guia || txt(o.guia))));
  if (destino) { cambios.push('estado = ?'); params.push(destino); }
  if (cambios.length) { params.push(orderId); db.prepare(`UPDATE orders SET ${cambios.join(', ')} WHERE id = ?`).run(...params); }
  if (destino === 'Devuelto') void import('./effiExtras.js').then((m) => m.alQuedarDevuelto(storeId, orderId)).catch(() => {});
  if (d.error && (d.flujo === 'failed' || d.flujo === 'error' || d.flujo === 'cancelled')) {
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'Skydropx no pudo generar la guía', detalle: d.error });
  }
  // Aviso de la guía apenas aparece el número (la foto del PDF llega después si aún no está).
  if ((guiaNueva || d.guia) && !Number(o.guia_avisada) && txt(o.tel) && Date.now() - (intentoAviso.get(orderId) || 0) > 3600_000) {
    intentoAviso.set(orderId, Date.now());
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'info', titulo: `Skydropx generó la guía ${d.guia}`, detalle: d.labelUrl ? 'Ya trae el PDF.' : 'Aún sin PDF: se manda el número y la foto cuando esté.' });
    const { avisarGuia } = await import('./avisoGuia.js');
    await avisarGuia(storeId, orderId).catch(() => null);
  }
  // Dropshipping: la guía al proveedor cuando ya están el número y el PDF (una sola vez; el PDF
  // puede tardar unos minutos y el ciclo de despachos vuelve a pasar por aquí).
  const guiaFin = d.guia || txt(o.guia); const pdfFin = d.labelUrl || txt(o.guia_url);
  if (txt(o.bodega_id) && !txt(o.guia_proveedor) && guiaFin && pdfFin && d.status !== 'canceled') {
    const { enviarGuiaAProveedor } = await import('./bodegas.js');
    await enviarGuiaAProveedor(storeId, orderId).catch((e) => console.warn('[skydropx] guía al proveedor', e));
  }
}

/** Consulta un envío en Skydropx (botón «Actualizar» y ciclo de despachos). */
export async function consultarEnvioSkydropx(storeId: string, orderId: string): Promise<{ estado: string; guia: string } | { error: string }> {
  const c = cfgSkydropx(storeId);
  if (!c) return { error: 'Skydropx no está conectado.' };
  const o = db.prepare('SELECT skydropx_envio FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as { skydropx_envio: string } | undefined;
  if (!o?.skydropx_envio) return { error: 'Este pedido no se ha enviado por Skydropx.' };
  const r = await sky(storeId, c, 'GET', `/api/v1/shipments/${encodeURIComponent(o.skydropx_envio)}`);
  if (!r.ok) return { error: `No pudimos leer el envío en Skydropx: ${errorSky(r.body, r.http)}` };
  const d = leerEnvio(r.body);
  await aplicarEstado(storeId, orderId, d);
  return { estado: d.estadoTexto || d.flujo, guia: d.guia };
}

/** Cancela el envío en Skydropx y deja el pedido listo para volver a despacharlo. */
export async function cancelarEnvioSkydropx(storeId: string, orderId: string, motivo: string): Promise<{ ok: true } | { error: string }> {
  const c = cfgSkydropx(storeId);
  if (!c) return { error: 'Skydropx no está conectado.' };
  const o = db.prepare('SELECT skydropx_envio, numero FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as { skydropx_envio: string; numero: number } | undefined;
  if (!o?.skydropx_envio) return { error: 'Este pedido no tiene envío en Skydropx.' };
  const r = await sky(storeId, c, 'POST', `/api/v1/shipments/${encodeURIComponent(o.skydropx_envio)}/cancellations`, { reason: corta(motivo || 'Corregir datos del pedido', 120), shipment_id: o.skydropx_envio });
  if (!r.ok) return { error: r.http === 422 ? 'Skydropx no deja cancelar este envío (puede que la transportadora ya lo haya recogido).' : `Skydropx no canceló el envío: ${errorSky(r.body, r.http)}` };
  db.prepare("UPDATE orders SET skydropx_envio = '', despacho_proveedor = '', guia = NULL, guia_url = '', guia_avisada = 0, estado_woo = '', guia_proveedor = '' WHERE id = ?").run(orderId);
  trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'Envío cancelado en Skydropx', detalle: motivo });
  registrarLog(storeId, 'info', 'despacho', `DF-${o.numero}: envío cancelado en Skydropx (${motivo}).`);
  return { ok: true };
}

/** Webhook de Skydropx (evento de un paquete): busca el pedido por el envío y aplica el estado. */
export async function procesarWebhookSkydropx(storeId: string, body: Fila): Promise<void> {
  const data = (body?.data || {}) as Fila;
  const at = (data.attributes || {}) as Fila;
  const rel = (data.relationships || {}) as Fila;
  const envioId = txt(((rel.shipment as Fila | undefined)?.data as Fila | undefined)?.id || (data.type === 'shipments' ? data.id : ''));
  if (!envioId) return;
  const o = db.prepare('SELECT id FROM orders WHERE store_id = ? AND skydropx_envio = ?').get(storeId, envioId) as { id: string } | undefined;
  if (!o) return;
  const status = txt(at.status || at.tracking_status).toLowerCase();
  await aplicarEstado(storeId, o.id, {
    guia: txt(at.tracking_number).trim(), labelUrl: txt(at.label_url), transportadora: '', status, flujo: '',
    estadoTexto: ESTADOS[status] || '', error: '',
  });
}

/** Ciclo de despachos: envíos de Skydropx que siguen en camino. */
export async function sincronizarSkydropxTodas(): Promise<void> {
  const filas = db.prepare(`SELECT id, store_id FROM orders WHERE COALESCE(skydropx_envio,'') != '' AND estado NOT IN ('Entregado','Devuelto','Cancelado')
      AND created_at > datetime('now','-30 days') ORDER BY created_at DESC LIMIT 100`).all() as { id: string; store_id: string }[];
  for (const f of filas) {
    try { await consultarEnvioSkydropx(f.store_id, f.id); } catch { /* el próximo */ }
    await espera(600); // Skydropx permite 2 peticiones por segundo
  }
}
