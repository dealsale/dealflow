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

/** Cambia el id token por un token OFFLINE de la tienda (token exchange). */
async function intercambiarToken(shop: string, idToken: string): Promise<{ token: string; scope: string } | { error: string }> {
  try {
    const r = await fetch(`${admin(shop)}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: KEY(), client_secret: SECRET(),
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: idToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await r.json().catch(() => ({}))) as { access_token?: string; scope?: string; error?: string; error_description?: string };
    if (!r.ok || !body.access_token) return { error: `Shopify no entregó el acceso (${r.status}): ${body.error_description || body.error || 'sin detalle'}` };
    return { token: body.access_token, scope: String(body.scope || '') };
  } catch { return { error: 'No pudimos conectar con Shopify para obtener el acceso.' }; }
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
async function suscribirWebhooks(shop: string, token: string): Promise<void> {
  const q = `mutation($topic: WebhookSubscriptionTopic!, $url: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) { userErrors { message } }
  }`;
  for (const topic of ['APP_UNINSTALLED', 'ORDERS_CREATE']) {
    const r = await gql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(shop, token, q, { topic, url: URL_WEBHOOK });
    const errs = r.data?.webhookSubscriptionCreate.userErrors || [];
    const repetido = errs.some((e) => /already|taken|ya /i.test(e.message));
    if (r.error || (errs.length && !repetido)) console.warn(`[shopify-app] webhook ${topic} en ${shop}:`, r.error || errs.map((e) => e.message).join(' · '));
  }
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

export interface EstadoSesion { shop: string; vinculada: boolean; tiendaDF?: string; codigo?: string; vincularUrl?: string }

/** La app incrustada abrió: verifica, obtiene el token si falta y vincula si se puede. */
export async function abrirSesion(idToken: string): Promise<EstadoSesion | { error: string }> {
  const v = verificarIdToken(idToken);
  if ('error' in v) return v;
  const { shop } = v;
  let fila = db.prepare('SELECT * FROM shopify_tiendas WHERE shop = ?').get(shop) as { token: string; store_id: string | null; codigo: string; codigo_exp: number; desinstalada_at: string | null } | undefined;
  if (!fila?.token || fila.desinstalada_at) {
    const x = await intercambiarToken(shop, idToken);
    if ('error' in x) return x;
    db.prepare(`INSERT INTO shopify_tiendas (shop, token, scope, instalada_at, desinstalada_at) VALUES (?,?,?,datetime('now'),NULL)
      ON CONFLICT(shop) DO UPDATE SET token = excluded.token, scope = excluded.scope, instalada_at = datetime('now'), desinstalada_at = NULL`).run(shop, cifrarTexto(x.token), x.scope);
    await suscribirWebhooks(shop, x.token);
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
    void guardarNombre(shop, descifrarTexto(fila!.token), pend.store_id).catch(() => {});
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
  if (t?.token && !t.desinstalada_at) { vincular(shop, storeId); void guardarNombre(shop, descifrarTexto(t.token), storeId).catch(() => {}); }
  return { url: `https://${shop}/admin/oauth/install?client_id=${encodeURIComponent(KEY())}` };
}

/** Desde DealFlow: vincula con el código que mostró la app dentro de Shopify. */
export function vincularConCodigo(storeId: string, codigo: string): { shop: string } | { error: string } {
  const c = String(codigo || '').trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(c)) return { error: 'El código tiene 6 caracteres (lo ves en la app DealFlow dentro de Shopify).' };
  const f = db.prepare('SELECT shop, token, codigo_exp FROM shopify_tiendas WHERE codigo = ? AND desinstalada_at IS NULL').get(c) as { shop: string; token: string; codigo_exp: number } | undefined;
  if (!f || f.codigo_exp < Date.now()) return { error: 'Código no válido o vencido. Abre de nuevo la app DealFlow en Shopify para ver uno nuevo.' };
  vincular(f.shop, storeId);
  void guardarNombre(f.shop, descifrarTexto(f.token), storeId).catch(() => {});
  return { shop: f.shop };
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
      db.prepare("UPDATE shopify_tiendas SET token = '', codigo = '', desinstalada_at = datetime('now') WHERE shop = ?").run(shop);
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
    if (d.vinculada) {
      c.innerHTML = '<h1>DealFlow</h1><p class="ok">✓ Tu tienda está conectada con DealFlow' + (d.tiendaDF ? ' (' + esc(d.tiendaDF) + ')' : '') + '.</p>'
        + '<p>Los pedidos de tu tienda llegan a DealFlow y tu asistente le confirma cada pedido al cliente por WhatsApp.</p>'
        + '<ul><li>Vincula tus productos por SKU en DealFlow → Productos.</li><li>Configura el despacho (Effi o Dropi) en DealFlow → Integraciones.</li></ul>'
        + '<button class="btn" id="ir">Abrir DealFlow</button>';
      document.getElementById('ir').onclick = () => abrir('${BASE_TIENDA}/');
    } else {
      c.innerHTML = '<h1>Conecta tu cuenta de DealFlow</h1><p>La app ya está instalada en <b>' + esc(d.shop) + '</b>. Falta unirla con tu cuenta de DealFlow:</p>'
        + '<p>1. Toca el botón (se abre DealFlow; inicia sesión si te lo pide) <b>o</b> pega este código en DealFlow → Integraciones → Shopify:</p>'
        + '<div class="codigo">' + esc(d.codigo) + '</div>'
        + '<button class="btn" id="v">Vincular con mi cuenta de DealFlow</button>'
        + '<p style="font-size:13px">El código vale 1 hora. ¿No tienes cuenta? Créala en <b>dealflow.sbs</b>.</p>'
        + '<p><button class="btn" id="r" style="background:#fff;color:var(--p);border:1px solid var(--b)">Ya lo vinculé, revisar</button></p>';
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
