/**
 * App PÚBLICA de Shopify (instalación con un clic, sin tokens pegados a mano).
 *
 * Flujo (instalación administrada por Shopify + token exchange):
 *  1. La tienda instala "DealFlow" (desde DealFlow con su dominio, o desde Shopify).
 *  2. Shopify abre la app incrustada (/shopify/app). Ahí App Bridge nos da un
 *     "id token" (JWT firmado con el secret de la app) que la página nos envía.
 *  3. El servidor verifica el JWT y lo cambia por un token OFFLINE de la tienda
 *     (POST /admin/oauth/access_token, grant token-exchange). Ese token es el que
 *     usa el resto de DealFlow (store_integrations 'shopify', via 'app').
 *  4. Se vincula con la tienda de DealFlow: automáticamente si la instalación se
 *     inició desde DealFlow (pendiente por dominio), o con un código de un solo uso.
 *  5. Webhooks firmados (HMAC) en /webhooks/shopify: desinstalación, los 3 de
 *     privacidad obligatorios y pedidos nuevos.
 *
 * Credenciales de la app: variables SHOPIFY_API_KEY (Client ID) y SHOPIFY_API_SECRET.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, pj, registrarLog } from './db.js';
import { BASE_TIENDA } from './tiendaPublica.js';
import { cifrarTexto, descifrarTexto } from './cifrado.js';

export const KEY = () => String(process.env.SHOPIFY_API_KEY || '').trim();
const SECRET = () => String(process.env.SHOPIFY_API_SECRET || '').trim();
export const appDisponible = () => !!(KEY() && SECRET());
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
export const URL_WEBHOOK = `${BASE_TIENDA}/webhooks/shopify`;
// Solo para pruebas locales (servidor falso de Shopify); en producción no se define.
const admin = (shop: string) => process.env.SHOPIFY_TEST_BASE || `https://${shop}`;

db.exec(`CREATE TABLE IF NOT EXISTS shopify_tiendas (
  shop TEXT PRIMARY KEY,
  token TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  store_id TEXT,
  codigo TEXT NOT NULL DEFAULT '',
  codigo_exp INTEGER NOT NULL DEFAULT 0,
  instalada_at TEXT NOT NULL DEFAULT (datetime('now')),
  desinstalada_at TEXT
)`);
// Tokens offline QUE VENCEN (requisito 3.1.2 de la App Store): el de acceso dura ~1 h y se
// renueva con el refresh token (que rota en cada renovación).
for (const col of ["refresh_token TEXT NOT NULL DEFAULT ''", 'token_exp INTEGER NOT NULL DEFAULT 0', 'refresh_exp INTEGER NOT NULL DEFAULT 0']) {
  try { db.exec(`ALTER TABLE shopify_tiendas ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
db.exec(`CREATE TABLE IF NOT EXISTS shopify_pendientes (
  shop TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  exp INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS shopify_webhooks_vistos (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL DEFAULT '',
  shop TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// Tokens guardados antes de configurar la llave: se cifran al arrancar.
try {
  const { cifradoActivo } = await import('./cifrado.js');
  if (cifradoActivo()) {
    for (const r of db.prepare("SELECT shop, token FROM shopify_tiendas WHERE token != '' AND token NOT LIKE 'enc:v1:%'").all() as { shop: string; token: string }[]) {
      db.prepare('UPDATE shopify_tiendas SET token = ? WHERE shop = ?').run(cifrarTexto(r.token), r.shop);
    }
    for (const r of db.prepare("SELECT store_id, config FROM store_integrations WHERE tipo = 'shopify'").all() as { store_id: string; config: string }[]) {
      const c = pj<Record<string, string>>(r.config, {});
      if (c.via === 'app' && c.token && !c.token.startsWith('enc:v1:')) db.prepare("UPDATE store_integrations SET config = ? WHERE store_id = ? AND tipo = 'shopify'").run(JSON.stringify({ ...c, token: cifrarTexto(c.token) }), r.store_id);
    }
  }
} catch (e) { console.error('[shopify-app] cifrando tokens', e); }

export const esShopValido = (s: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(String(s || ''));

// ── Sesión (id token de App Bridge) ─────────────────────────────────────────

const b64url = (b: Buffer) => b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Verifica el id token (JWT HS256) que App Bridge entrega. Devuelve el dominio de la tienda. */
export function verificarIdToken(jwt: string): { shop: string } | { error: string } {
  if (!appDisponible()) return { error: 'La app de Shopify no está configurada en el servidor.' };
  const partes = String(jwt || '').split('.');
  if (partes.length !== 3) return { error: 'Sesión de Shopify inválida.' };
  const [h, p, firma] = partes;
  let header: { alg?: string }; let payload: { aud?: string; dest?: string; exp?: number; nbf?: number };
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch { return { error: 'Sesión de Shopify ilegible.' }; }
  if (header.alg !== 'HS256') return { error: 'Sesión de Shopify con firma no soportada.' };
  const esperada = b64url(createHmac('sha256', SECRET()).update(`${h}.${p}`).digest());
  const a = Buffer.from(esperada); const b = Buffer.from(firma);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { error: 'Firma de la sesión de Shopify no válida.' };
  const ahora = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < ahora - 10) return { error: 'La sesión de Shopify venció. Recarga la app.' };
  if (payload.nbf && payload.nbf > ahora + 10) return { error: 'Sesión de Shopify aún no válida (revisa la hora del servidor).' };
  if (payload.aud !== KEY()) return { error: 'La sesión de Shopify es de otra app.' };
  const shop = String(payload.dest || '').replace(/^https:\/\//, '').toLowerCase();
  if (!esShopValido(shop)) return { error: 'Tienda de Shopify no válida.' };
  return { shop };
}

interface TokenShopify { token: string; scope: string; expiresIn: number; refresh: string; refreshExpiresIn: number }

/** Pide un token a Shopify (/admin/oauth/access_token) y lo normaliza. */
async function pedirToken(shop: string, cuerpo: Record<string, string>): Promise<TokenShopify | { error: string }> {
  try {
    const r = await fetch(`${admin(shop)}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: KEY(), client_secret: SECRET(), ...cuerpo }),
      signal: AbortSignal.timeout(20000),
    });
    const b = (await r.json().catch(() => ({}))) as { access_token?: string; scope?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; error?: string; error_description?: string };
    if (!r.ok || !b.access_token) return { error: `Shopify no entregó el acceso (${r.status}): ${b.error_description || b.error || 'sin detalle'}` };
    return { token: b.access_token, scope: String(b.scope || ''), expiresIn: Number(b.expires_in || 0), refresh: String(b.refresh_token || ''), refreshExpiresIn: Number(b.refresh_token_expires_in || 0) };
  } catch { return { error: 'No pudimos conectar con Shopify para obtener el acceso.' }; }
}

/** Cambia el id token por un token OFFLINE que vence (token exchange con expiring=1). */
async function intercambiarToken(shop: string, idToken: string): Promise<TokenShopify | { error: string }> {
  return pedirToken(shop, {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: idToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    expiring: '1',
  });
}

/** Guarda el token (cifrado) con sus vencimientos y lo copia a la integración de la tienda vinculada. */
function guardarToken(shop: string, t: TokenShopify): void {
  const ahora = Date.now();
  db.prepare('UPDATE shopify_tiendas SET token = ?, scope = CASE WHEN ? != \'\' THEN ? ELSE scope END, refresh_token = ?, token_exp = ?, refresh_exp = ? WHERE shop = ?').run(
    cifrarTexto(t.token), t.scope, t.scope, t.refresh ? cifrarTexto(t.refresh) : '', t.expiresIn ? ahora + t.expiresIn * 1000 : 0, t.refreshExpiresIn ? ahora + t.refreshExpiresIn * 1000 : 0, shop,
  );
  const f = db.prepare('SELECT store_id FROM shopify_tiendas WHERE shop = ?').get(shop) as { store_id: string | null } | undefined;
  if (!f?.store_id) return;
  const integ = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(f.store_id) as { config: string } | undefined;
  const cfg = pj<Record<string, string>>(integ?.config || '', {});
  if (cfg.shop === shop && cfg.via === 'app') db.prepare("UPDATE store_integrations SET config = ? WHERE store_id = ? AND tipo = 'shopify'").run(JSON.stringify({ ...cfg, token: cifrarTexto(t.token) }), f.store_id);
}

const renovando = new Map<string, Promise<string>>();
const migracionFallida = new Map<string, number>();

/**
 * Token vigente para llamar a la Admin API de una tienda instalada por la app. Renueva el de
 * acceso cuando está por vencer (una sola renovación a la vez por tienda: el refresh token
 * rota) y convierte los tokens viejos que no vencían. '' si no hay forma (hay que abrir la app).
 */
export async function tokenVigente(shop: string): Promise<string> {
  const f = db.prepare('SELECT token, refresh_token, token_exp, refresh_exp, desinstalada_at FROM shopify_tiendas WHERE shop = ?').get(shop) as
    { token: string; refresh_token: string; token_exp: number; refresh_exp: number; desinstalada_at: string | null } | undefined;
  if (!f?.token || f.desinstalada_at) return '';
  let actual = '';
  try { actual = descifrarTexto(f.token); } catch { return ''; }
  if (f.token_exp && f.token_exp > Date.now() + 5 * 60_000) return actual;
  const enCurso = renovando.get(shop);
  if (enCurso) return enCurso;
  const tarea = (async () => {
    if (!f.token_exp) {
      // Token viejo que no vence: se cambia por uno que vence (Shopify revoca el anterior).
      if ((migracionFallida.get(shop) || 0) > Date.now()) return actual;
      const t = await pedirToken(shop, {
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: actual,
        subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
        requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
        expiring: '1',
      });
      if ('error' in t) { migracionFallida.set(shop, Date.now() + 6 * 3600_000); console.warn(`[shopify-app] no se pudo convertir el token de ${shop}:`, t.error); return actual; }
      guardarToken(shop, t);
      return t.token;
    }
    if (!f.refresh_token || (f.refresh_exp && f.refresh_exp < Date.now())) {
      console.warn(`[shopify-app] el acceso a ${shop} venció: hay que abrir la app DealFlow en Shopify para renovarlo.`);
      return f.token_exp > Date.now() ? actual : '';
    }
    let refresh = '';
    try { refresh = descifrarTexto(f.refresh_token); } catch { return ''; }
    const t = await pedirToken(shop, { grant_type: 'refresh_token', refresh_token: refresh });
    if ('error' in t) { console.warn(`[shopify-app] no se pudo renovar el acceso de ${shop}:`, t.error); return f.token_exp > Date.now() ? actual : ''; }
    guardarToken(shop, t);
    return t.token;
  })().finally(() => renovando.delete(shop));
  renovando.set(shop, tarea);
  return tarea;
}

async function gql<T>(shop: string, token: string, query: string, variables?: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const r = await fetch(`${admin(shop)}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: variables || {} }),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await r.json().catch(() => ({}))) as { data?: T; errors?: unknown };
    if (!r.ok || body.errors) return { error: `Shopify ${r.status}: ${JSON.stringify(body.errors || '').slice(0, 200)}` };
    return { data: body.data };
  } catch { return { error: 'No pudimos conectar con Shopify.' }; }
}

/** Suscribe los webhooks que usa DealFlow (si ya existían, Shopify lo dice y se ignora). */
async function suscribirWebhooks(shop: string, token: string): Promise<string> {
  let fallo = '';
  const q = `mutation($topic: WebhookSubscriptionTopic!, $url: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) { userErrors { message } }
  }`;
  for (const topic of ['APP_UNINSTALLED', 'APP_SUBSCRIPTIONS_UPDATE', 'ORDERS_CREATE']) {
    const r = await gql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(shop, token, q, { topic, url: URL_WEBHOOK });
    const errs = r.data?.webhookSubscriptionCreate.userErrors || [];
    const repetido = errs.some((e) => /already|taken|ya /i.test(e.message));
    if (r.error || (errs.length && !repetido)) {
      const m = r.error || errs.map((e) => e.message).join(' · ');
      console.warn(`[shopify-app] webhook ${topic} en ${shop}:`, m);
      if (topic === 'ORDERS_CREATE') fallo = m;
    }
  }
  return fallo;
}

/** Vuelve a suscribir orders/create (si Shopify lo rechazó, p.ej. por falta de acceso a datos protegidos). Devuelve el error o ''. */
export async function asegurarWebhookPedidos(shop: string, tokenPlano: string): Promise<string> {
  return suscribirWebhooks(shop, tokenPlano);
}

const nuevoCodigo = () => randomBytes(4).toString('hex').toUpperCase().slice(0, 6);

/** Conecta la tienda Shopify (ya con token) a una tienda de DealFlow. */
function vincular(shop: string, storeId: string): { nombreDF: string } {
  const t = db.prepare('SELECT token FROM shopify_tiendas WHERE shop = ?').get(shop) as { token: string } | undefined;
  if (!t?.token) throw new Error('sin token');
  // Una tienda Shopify solo puede estar en UNA tienda de DealFlow.
  for (const r of db.prepare("SELECT store_id, config FROM store_integrations WHERE tipo = 'shopify'").all() as { store_id: string; config: string }[]) {
    if (r.store_id !== storeId && String(pj<Record<string, string>>(r.config, {}).shop || '') === shop) {
      db.prepare("DELETE FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").run(r.store_id);
    }
  }
  const previo = pj<Record<string, string>>((db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { config: string } | undefined)?.config || '', {});
  db.prepare(
    `INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'shopify', ?, datetime('now'))
     ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`,
  ).run(storeId, JSON.stringify({ shop, token: t.token, via: 'app', nombre: previo.shop === shop ? previo.nombre || '' : '' }));
  db.prepare("UPDATE shopify_tiendas SET store_id = ?, codigo = '', codigo_exp = 0 WHERE shop = ?").run(storeId, shop);
  db.prepare('DELETE FROM shopify_pendientes WHERE shop = ?').run(shop);
  registrarLog(storeId, 'info', 'shopify', `Tienda Shopify ${shop} conectada con la app de DealFlow.`);
  const s = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined;
  return { nombreDF: s?.nombre || '' };
}

/** Guarda el nombre de la tienda Shopify en la integración (para mostrarlo en el panel). */
async function guardarNombre(shop: string, token: string, storeId: string): Promise<void> {
  const r = await gql<{ shop: { name: string } }>(shop, token, '{ shop { name } }');
  const nombre = r.data?.shop.name;
  if (!nombre) return;
  const fila = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { config: string } | undefined;
  if (!fila) return;
  const cfg = pj<Record<string, string>>(fila.config, {});
  if (cfg.shop !== shop) return;
  db.prepare("UPDATE store_integrations SET config = ? WHERE store_id = ? AND tipo = 'shopify'").run(JSON.stringify({ ...cfg, nombre }), storeId);
}

const nombrarLuego = (shop: string, storeId: string) => { void tokenVigente(shop).then((tk) => (tk ? guardarNombre(shop, tk, storeId) : undefined)).catch(() => {}); };

export interface EstadoSesion { shop: string; vinculada: boolean; tiendaDF?: string; codigo?: string; vincularUrl?: string; plan?: { activo: boolean; nombre: string; vence: string; prueba: boolean }; planesUrl?: string }

/** La app incrustada abrió: verifica, obtiene el token si falta y vincula si se puede. */
export async function abrirSesion(idToken: string): Promise<EstadoSesion | { error: string }> {
  const r = await abrirSesionBase(idToken);
  if ('error' in r) return r;
  // Plan (Shopify App Pricing): se muestra en la app incrustada, esté o no vinculada la cuenta.
  let plan: EstadoSesion['plan'];
  const fila = db.prepare('SELECT store_id FROM shopify_tiendas WHERE shop = ?').get(r.shop) as { store_id: string | null } | undefined;
  if (r.vinculada && fila?.store_id) {
    const c = await sincronizarCobro(fila.store_id).catch(() => ({ activo: false } as Awaited<ReturnType<typeof sincronizarCobro>>));
    if (c.activo) plan = { activo: true, nombre: c.plan || '', vence: c.vence || '', prueba: !!c.prueba };
  }
  if (!plan) {
    const l = await leerSuscripcion(r.shop).catch(() => ({ error: 'x' }));
    const sub = 'sub' in l ? l.sub : null;
    plan = sub ? { activo: true, nombre: sub.name, vence: (sub.currentPeriodEnd || '').slice(0, 10), prueba: sub.test } : { activo: false, nombre: '', vence: '', prueba: false };
  }
  return { ...r, plan, planesUrl: urlPlanes(r.shop) };
}

async function abrirSesionBase(idToken: string): Promise<EstadoSesion | { error: string }> {
  const v = verificarIdToken(idToken);
  if ('error' in v) return v;
  const { shop } = v;
  let fila = db.prepare('SELECT * FROM shopify_tiendas WHERE shop = ?').get(shop) as { token: string; store_id: string | null; codigo: string; codigo_exp: number; desinstalada_at: string | null; token_exp: number; refresh_token: string; refresh_exp: number } | undefined;
  const sinRenovar = !!fila?.token && (!fila.token_exp || (fila.token_exp < Date.now() + 5 * 60_000 && (!fila.refresh_token || fila.refresh_exp < Date.now())));
  if (!fila?.token || fila.desinstalada_at || sinRenovar) {
    const nueva = !fila?.token || !!fila.desinstalada_at;
    const x = await intercambiarToken(shop, idToken);
    if ('error' in x) return x;
    db.prepare(`INSERT INTO shopify_tiendas (shop, token, scope, instalada_at, desinstalada_at) VALUES (?,?,?,datetime('now'),NULL)
      ON CONFLICT(shop) DO UPDATE SET desinstalada_at = NULL${nueva ? ", instalada_at = datetime('now')" : ''}`).run(shop, cifrarTexto(x.token), x.scope);
    guardarToken(shop, x);
    if (nueva) await suscribirWebhooks(shop, x.token);
    fila = db.prepare('SELECT * FROM shopify_tiendas WHERE shop = ?').get(shop) as typeof fila;
  }
  // ¿Ya está vinculada y la integración sigue en pie?
  if (fila!.store_id) {
    const integ = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(fila!.store_id) as { config: string } | undefined;
    if (integ && pj<Record<string, string>>(integ.config, {}).shop === shop) {
      const s = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(fila!.store_id) as { nombre: string } | undefined;
      return { shop, vinculada: true, tiendaDF: s?.nombre || '' };
    }
  }
  // ¿Se inició la instalación desde DealFlow para este dominio?
  const pend = db.prepare('SELECT store_id, exp FROM shopify_pendientes WHERE shop = ?').get(shop) as { store_id: string; exp: number } | undefined;
  if (pend && pend.exp > Date.now()) {
    const r = vincular(shop, pend.store_id);
    nombrarLuego(shop, pend.store_id);
    return { shop, vinculada: true, tiendaDF: r.nombreDF };
  }
  // Si no: código de un solo uso para vincular desde DealFlow (vale 1 h).
  let codigo = fila!.codigo;
  if (!codigo || fila!.codigo_exp < Date.now()) {
    codigo = nuevoCodigo();
    db.prepare('UPDATE shopify_tiendas SET codigo = ?, codigo_exp = ? WHERE shop = ?').run(codigo, Date.now() + 3600_000, shop);
  }
  return { shop, vinculada: false, codigo, vincularUrl: `${BASE_TIENDA}/?shopify_codigo=${codigo}` };
}

/** Desde DealFlow: prepara la instalación (queda pendiente 2 h) y devuelve la URL de Shopify. */
export function iniciarInstalacion(storeId: string, shop: string): { url: string } | { error: string } {
  if (!appDisponible()) return { error: 'La app de Shopify todavía no está configurada en el servidor.' };
  if (!esShopValido(shop)) return { error: 'Escribe el dominio de tu tienda: mitienda.myshopify.com' };
  db.prepare('INSERT OR REPLACE INTO shopify_pendientes (shop, store_id, exp) VALUES (?,?,?)').run(shop, storeId, Date.now() + 2 * 3600_000);
  // Si ya estaba instalada (con token), se vincula de una vez.
  const t = db.prepare('SELECT token, desinstalada_at FROM shopify_tiendas WHERE shop = ?').get(shop) as { token: string; desinstalada_at: string | null } | undefined;
  if (t?.token && !t.desinstalada_at) { vincular(shop, storeId); nombrarLuego(shop, storeId); }
  return { url: `https://${shop}/admin/oauth/install?client_id=${encodeURIComponent(KEY())}` };
}

/** Desde DealFlow: vincula con el código que mostró la app dentro de Shopify. */
export function vincularConCodigo(storeId: string, codigo: string): { shop: string } | { error: string } {
  const c = String(codigo || '').trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(c)) return { error: 'El código tiene 6 caracteres (lo ves en la app DealFlow dentro de Shopify).' };
  const f = db.prepare('SELECT shop, token, codigo_exp FROM shopify_tiendas WHERE codigo = ? AND desinstalada_at IS NULL').get(c) as { shop: string; token: string; codigo_exp: number } | undefined;
  if (!f || f.codigo_exp < Date.now()) return { error: 'Código no válido o vencido. Abre de nuevo la app DealFlow en Shopify para ver uno nuevo.' };
  vincular(f.shop, storeId);
  nombrarLuego(f.shop, storeId);
  return { shop: f.shop };
}

// ── Cobro con Shopify (requisito 1.2 de la App Store) ───────────────────────
// Las tiendas que usan la app de Shopify pagan DealFlow con la facturación de Shopify:
//  - El plan, con "Shopify App Pricing" (planes administrados): los planes y precios se crean en
//    el Partner Dashboard y Shopify muestra la página para elegir, subir o bajar de plan. Aquí solo
//    se lee la suscripción activa y se refleja en DealFlow (plan y vencimiento).
//  - Los extras (créditos, biblioteca, Tienda en línea), con cargos únicos de la Billing API.

const APP_HANDLE = () => String(process.env.SHOPIFY_APP_HANDLE || 'dealflow').trim();
/** Pesos colombianos por dólar para convertir los extras (los cargos de Shopify van en USD). */
const TASA_COP_USD = () => Math.max(1000, Number(process.env.SHOPIFY_TASA_COP_USD) || 4000);

/** La tienda Shopify (instalada con la app) vinculada a esta tienda de DealFlow, o null. */
export function shopDeTienda(storeId: string): string | null {
  const f = db.prepare("SELECT shop FROM shopify_tiendas WHERE store_id = ? AND desinstalada_at IS NULL AND token != '' ORDER BY instalada_at DESC LIMIT 1").get(storeId) as { shop: string } | undefined;
  return f?.shop || null;
}
/** Página de Shopify para elegir o cambiar el plan (Shopify App Pricing). */
export function urlPlanes(shop: string): string {
  return `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, '')}/charges/${APP_HANDLE()}/pricing_plans`;
}

interface Suscripcion { id: string; name: string; status: string; test: boolean; currentPeriodEnd: string | null; trialDays: number; createdAt: string }
const norm = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** La suscripción ACTIVA de la tienda en Shopify (null si no eligió plan). */
export async function leerSuscripcion(shop: string): Promise<{ sub: Suscripcion | null } | { error: string }> {
  const tk = await tokenVigente(shop);
  if (!tk) return { error: 'Abre la app DealFlow dentro de Shopify para renovar la conexión.' };
  const r = await gql<{ currentAppInstallation: { activeSubscriptions: Suscripcion[] } }>(shop, tk,
    '{ currentAppInstallation { activeSubscriptions { id name status test currentPeriodEnd trialDays createdAt } } }');
  if (r.error) return { error: r.error };
  return { sub: (r.data?.currentAppInstallation.activeSubscriptions || []).find((x) => x.status === 'ACTIVE') || null };
}

/**
 * Lee la suscripción activa en Shopify y la refleja en DealFlow: plan con el mismo nombre (o el
 * primero), cuenta activada y vencimiento = fin del periodo que Shopify ya cobró.
 */
export async function sincronizarCobro(storeId: string): Promise<{ activo: boolean; plan?: string; vence?: string; prueba?: boolean; error?: string }> {
  const shop = shopDeTienda(storeId);
  if (!shop) return { activo: false };
  const l = await leerSuscripcion(shop);
  if ('error' in l) return { activo: false, error: l.error };
  const sub = l.sub;
  if (!sub) return { activo: false };
  const planes = db.prepare('SELECT nombre FROM plans ORDER BY precio').all() as { nombre: string }[];
  const n = norm(sub.name);
  const plan = (planes.find((p) => norm(p.nombre) === n) || planes.find((p) => n.includes(norm(p.nombre)) || norm(p.nombre).includes(n)) || planes[0])?.nombre || sub.name;
  // Fin del periodo pagado; en la prueba gratis, la fecha de fin de la prueba.
  const finPrueba = new Date(new Date(sub.createdAt).getTime() + (sub.trialDays || 0) * 86400_000);
  const fin = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : sub.trialDays ? finPrueba : new Date(Date.now() + 30 * 86400_000);
  const vence = fin.toISOString().slice(0, 10);
  const st = db.prepare('SELECT plan_vence, inicial_pagado FROM stores WHERE id = ?').get(storeId) as { plan_vence: string | null; inicial_pagado: number } | undefined;
  if (!st) return { activo: false };
  const nuevoVence = st.plan_vence && st.plan_vence > vence ? st.plan_vence : vence;
  db.prepare("UPDATE stores SET plan = ?, inicial_pagado = 1, plan_estado = 'activa', plan_vence = ?, activa = 1 WHERE id = ?").run(plan, nuevoVence, storeId);
  // Un registro por periodo (para el historial de pagos y la contabilidad).
  const ref = `SHOPIFY-${sub.id.split('/').pop()}-${vence}`;
  if (!db.prepare('SELECT 1 FROM pagos WHERE referencia = ?').get(ref)) {
    db.prepare("INSERT INTO pagos (id, store_id, plan, monto, referencia, estado, gateway, tipo, transaccion) VALUES (?,?,?,0,?,'aprobado','shopify',?,?)")
      .run(randomBytes(12).toString('hex'), storeId, plan, ref, st.inicial_pagado ? 'renta' : 'inicial', sub.id);
    registrarLog(storeId, 'info', 'plan', `Plan ${plan} activo con la facturación de Shopify${sub.test ? ' (cobro de prueba)' : ''} hasta ${vence}.`);
  }
  return { activo: true, plan, vence, prueba: sub.test };
}

/** ¿Es una tienda de desarrollo? (ahí los cargos deben ir en modo prueba). */
async function esTiendaPrueba(shop: string, tk: string): Promise<boolean> {
  if (process.env.SHOPIFY_BILLING_TEST === '1') return true;
  const r = await gql<{ shop: { plan: { partnerDevelopment: boolean } } }>(shop, tk, '{ shop { plan { partnerDevelopment } } }');
  return !!r.data?.shop.plan.partnerDevelopment;
}

/** Cargo único con la Billing API (extras). Devuelve la URL donde la tienda lo aprueba. */
export async function cobroUnico(storeId: string, referencia: string, concepto: string, montoCop: number): Promise<{ url: string } | { error: string }> {
  const shop = shopDeTienda(storeId);
  if (!shop) return { error: 'Esta tienda no está conectada con la app de Shopify.' };
  const tk = await tokenVigente(shop);
  if (!tk) return { error: 'Abre la app DealFlow dentro de Shopify para renovar la conexión y vuelve a intentarlo.' };
  const usd = Math.max(0.5, Math.round((montoCop / TASA_COP_USD()) * 100) / 100);
  const q = `mutation($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) { appPurchaseOneTime { id } confirmationUrl userErrors { field message } }
  }`;
  const r = await gql<{ appPurchaseOneTimeCreate: { appPurchaseOneTime: { id: string } | null; confirmationUrl: string | null; userErrors: { message: string }[] } }>(shop, tk, q, {
    name: `DealFlow · ${concepto}`.slice(0, 255), price: { amount: usd, currencyCode: 'USD' },
    returnUrl: `${BASE_TIENDA}/api/shopify/cobro/vuelta?ref=${encodeURIComponent(referencia)}`, test: await esTiendaPrueba(shop, tk),
  });
  const d = r.data?.appPurchaseOneTimeCreate;
  if (r.error || !d?.confirmationUrl || !d.appPurchaseOneTime) return { error: `Shopify no creó el cobro: ${r.error || d?.userErrors.map((e) => e.message).join(' · ') || 'sin detalle'}` };
  db.prepare('UPDATE pagos SET transaccion = ? WHERE referencia = ?').run(d.appPurchaseOneTime.id, referencia);
  return { url: d.confirmationUrl };
}

/** Al volver de Shopify: confirma con Shopify que el cargo quedó aprobado y entrega el extra. */
export async function verificarCobroUnico(referencia: string): Promise<{ ok: boolean; tipo?: string }> {
  const p = db.prepare("SELECT store_id, transaccion, tipo, estado FROM pagos WHERE referencia = ? AND gateway = 'shopify'").get(referencia) as { store_id: string; transaccion: string | null; tipo: string; estado: string } | undefined;
  if (!p?.transaccion) return { ok: false };
  if (p.estado === 'aprobado') return { ok: true, tipo: p.tipo };
  const shop = shopDeTienda(p.store_id);
  const tk = shop ? await tokenVigente(shop) : '';
  if (!shop || !tk) return { ok: false, tipo: p.tipo };
  const r = await gql<{ node: { status?: string } | null }>(shop, tk, 'query($id: ID!) { node(id: $id) { ... on AppPurchaseOneTime { status } } }', { id: p.transaccion });
  if (r.data?.node?.status !== 'ACTIVE') {
    if (r.data?.node?.status === 'DECLINED') db.prepare("UPDATE pagos SET estado = 'rechazado' WHERE referencia = ?").run(referencia);
    return { ok: false, tipo: p.tipo };
  }
  const { aplicarPagoAprobado } = await import('./suscripcion.js');
  aplicarPagoAprobado(referencia, p.transaccion);
  return { ok: true, tipo: p.tipo };
}

/** Revisa cada 6 h las suscripciones de Shopify (renovaciones, cambios de plan). */
export function iniciarCobroShopify(): void {
  const correr = async () => {
    if (!appDisponible()) return;
    const tiendas = db.prepare("SELECT DISTINCT store_id FROM shopify_tiendas WHERE store_id IS NOT NULL AND desinstalada_at IS NULL AND token != ''").all() as { store_id: string }[];
    for (const t of tiendas) { try { await sincronizarCobro(t.store_id); } catch { /* siguiente vuelta */ } }
  };
  setTimeout(() => { void correr(); }, 120_000);
  setInterval(() => { void correr(); }, 6 * 3600_000);
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export function firmaWebhookValida(raw: Buffer | undefined, hmac: string): boolean {
  if (!raw || !hmac || !SECRET()) return false;
  const a = Buffer.from(createHmac('sha256', SECRET()).update(raw).digest('base64'));
  const b = Buffer.from(String(hmac));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Procesa un webhook ya verificado. Nunca lanza. */
export function procesarWebhook(topic: string, shop: string, id: string, body: Record<string, unknown>): void {
  if (id) {
    const nuevo = db.prepare('INSERT OR IGNORE INTO shopify_webhooks_vistos (id, topic, shop) VALUES (?,?,?)').run(id, topic, shop).changes;
    if (!nuevo) return; // repetido
    db.prepare("DELETE FROM shopify_webhooks_vistos WHERE at < datetime('now','-7 days')").run();
  }
  const storeId = (db.prepare('SELECT store_id FROM shopify_tiendas WHERE shop = ?').get(shop) as { store_id: string | null } | undefined)?.store_id || null;
  switch (topic) {
    case 'app/uninstalled': {
      db.prepare("UPDATE shopify_tiendas SET token = '', refresh_token = '', token_exp = 0, refresh_exp = 0, codigo = '', desinstalada_at = datetime('now') WHERE shop = ?").run(shop);
      if (storeId) {
        const integ = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").get(storeId) as { config: string } | undefined;
        if (integ && pj<Record<string, string>>(integ.config, {}).shop === shop) db.prepare("DELETE FROM store_integrations WHERE store_id = ? AND tipo = 'shopify'").run(storeId);
        registrarLog(storeId, 'warn', 'shopify', `Se desinstaló la app DealFlow de la tienda Shopify ${shop}. La conexión quedó desactivada.`);
      }
      break;
    }
    case 'shop/redact': {
      // 48 h después de desinstalar: borrar todo lo de esa tienda Shopify.
      db.prepare('DELETE FROM shopify_tiendas WHERE shop = ?').run(shop);
      db.prepare('DELETE FROM shopify_pendientes WHERE shop = ?').run(shop);
      void import('./shopifyPedidos.js').then((m) => { const n = m.borrarDatosTienda(shop); if (storeId && n) registrarLog(storeId, 'info', 'shopify', `Privacidad: se borraron los datos de compradores de ${n} pedidos de ${shop}.`); });
      break;
    }
    case 'customers/redact':
      void import('./shopifyPedidos.js').then((m) => { const n = m.borrarDatosCliente(shop, body); if (storeId) registrarLog(storeId, 'info', 'shopify', `Privacidad: Shopify pidió borrar los datos de un comprador (${n} pedidos anonimizados).`); });
      break;
    case 'customers/data_request':
      void import('./shopifyPedidos.js').then((m) => { const d = m.datosCliente(shop, body); if (storeId) registrarLog(storeId, 'info', 'shopify', `Privacidad: un comprador pidió sus datos. DealFlow tiene ${d.length} pedido(s) suyos: ${d.map((x) => 'DF-' + x.numero).join(', ') || 'ninguno'}. Entrégaselos si te los pide.`); });
      break;
    case 'app_subscriptions/update':
      if (storeId) void sincronizarCobro(storeId).catch((e) => console.warn('[shopify-app] cobro', e));
      break;
    case 'orders/create':
      if (storeId) void import('./shopifyPedidos.js').then((m) => m.importarPedido(storeId, shop, body));
      break;
    default:
      break;
  }
}

// ── Página incrustada ───────────────────────────────────────────────────────

/** Encabezado CSP que Shopify exige a las apps incrustadas (solo se deja enmarcar por la tienda y el admin). */
export function cspIncrustada(shop: string): string {
  const s = esShopValido(shop) ? ` https://${shop}` : '';
  return `frame-ancestors https://admin.shopify.com${s};`;
}

export function paginaApp(): string {
  const key = KEY().replace(/[^a-zA-Z0-9]/g, '');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="shopify-api-key" content="${key}">
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<title>DealFlow</title>
<style>
:root{--t:#1f2340;--m:#5b6184;--b:#e3e6f2;--p:#5b5bd6;--ok:#0e9f6e}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7fb;color:var(--t)}
main{max-width:640px;margin:0 auto;padding:28px 16px}
.card{background:#fff;border:1px solid var(--b);border-radius:14px;padding:22px}
h1{font-size:22px;margin:0 0 6px}p{color:var(--m);line-height:1.55;margin:8px 0}
.codigo{font:700 30px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;background:#eef0ff;color:var(--p);border-radius:10px;padding:14px;text-align:center;margin:14px 0}
.btn{display:inline-block;background:var(--p);color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
.ok{color:var(--ok);font-weight:700}.err{color:#c81e1e}
.plan{margin:16px 0;padding:14px;border:1px solid var(--b);border-radius:12px;background:#fafbff;line-height:1.5}.plan span{color:var(--m);font-size:13.5px}.plan .btn{margin-top:10px}
.btn.sec{background:#fff;color:var(--p);border:1px solid var(--b)}.tag{font-size:11px;background:#fff4d6;color:#8a5a00;border-radius:6px;padding:1px 6px}
ul{color:var(--m);line-height:1.7;padding-left:20px}
</style></head><body><main><div class="card" id="c"><h1>DealFlow</h1><p>Conectando con tu tienda…</p></div></main>
<script>
const c = document.getElementById('c');
const esc = (s) => String(s || '').replace(/[&<>"']/g, (x) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const abrir = (u) => window.open(u, '_blank', 'noopener');
async function iniciar() {
  try {
    const t = await shopify.idToken();
    const r = await fetch('/api/shopify/app/sesion', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo conectar.');
    const p = d.plan || {};
    const planHtml = '<div class="plan">' + (p.activo
        ? '<b>Plan ' + esc(p.nombre) + '</b>' + (p.prueba ? ' <span class="tag">prueba</span>' : '') + '<br><span>Se cobra con tu factura de Shopify' + (p.vence ? ' · próximo cobro ' + esc(p.vence) : '') + '.</span>'
        : '<b>Elige tu plan</b><br><span>DealFlow se paga con la facturación de Shopify: lo ves en tu factura de Shopify y puedes cambiarlo o cancelarlo cuando quieras.</span>')
      + '<br><button class="btn ' + (p.activo ? 'sec' : '') + '" id="pl">' + (p.activo ? 'Cambiar de plan' : 'Ver planes y precios') + '</button></div>';
    if (d.vinculada) {
      c.innerHTML = '<h1>DealFlow</h1><p class="ok">✓ Tu tienda está conectada con DealFlow' + (d.tiendaDF ? ' (' + esc(d.tiendaDF) + ')' : '') + '.</p>' + planHtml
        + '<p>Los pedidos de tu tienda llegan a DealFlow y tu asistente le confirma cada pedido al cliente por WhatsApp.</p>'
        + '<ul><li>Vincula tus productos por SKU en DealFlow → Productos.</li><li>Configura el despacho (Effi o Dropi) en DealFlow → Integraciones.</li></ul>'
        + '<button class="btn" id="ir">Abrir DealFlow</button>';
      document.getElementById('ir').onclick = () => abrir('${BASE_TIENDA}/');
      document.getElementById('pl').onclick = () => window.open(d.planesUrl, '_top');
    } else {
      c.innerHTML = '<h1>Conecta tu cuenta de DealFlow</h1><p>La app ya está instalada en <b>' + esc(d.shop) + '</b>. Falta unirla con tu cuenta de DealFlow:</p>'
        + '<p>1. Toca el botón (se abre DealFlow; inicia sesión si te lo pide) <b>o</b> pega este código en DealFlow → Integraciones → Shopify:</p>'
        + '<div class="codigo">' + esc(d.codigo) + '</div>'
        + '<button class="btn" id="v">Vincular con mi cuenta de DealFlow</button>'
        + '<p style="font-size:13px">El código vale 1 hora. ¿No tienes cuenta? Créala en <b>dealflow.sbs</b>.</p>'
        + '<p><button class="btn" id="r" style="background:#fff;color:var(--p);border:1px solid var(--b)">Ya lo vinculé, revisar</button></p>' + planHtml;
      document.getElementById('pl').onclick = () => window.open(d.planesUrl, '_top');
      document.getElementById('v').onclick = () => abrir(d.vincularUrl);
      document.getElementById('r').onclick = iniciar;
    }
  } catch (e) {
    c.innerHTML = '<h1>DealFlow</h1><p class="err">' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">Reintentar</button>';
  }
}
iniciar();
</script></body></html>`;
}
