/**
 * API de Conversiones de Meta para las LANDINGS (lo que en Shopify hacen EasySell y similares
 * con «píxel + token»).
 *
 * El píxel del navegador ya manda PageView, ViewContent, InitiateCheckout y Purchase. Pero
 * iOS, los bloqueadores de anuncios y los navegadores con «no rastrear» se comen muchos de
 * esos eventos: Meta ve menos compras de las que hubo y optimiza peor. Con el token, además,
 * DealFlow le manda a Meta los mismos eventos DESDE EL SERVIDOR, con los datos del
 * formulario cifrados (SHA-256): celular, nombre, ciudad, departamento, correo, IP y
 * navegador, y las cookies _fbp/_fbc del clic en el anuncio.
 *
 * Deduplicación: cada evento lleva el MISMO event_id en el navegador y en el servidor, así
 * Meta lo cuenta una sola vez (Purchase usa el id del pedido; ViewContent e InitiateCheckout,
 * uno que genera la página).
 *
 * El token es secreto: se guarda aquí (nunca va a la página pública) y el panel solo muestra
 * sus últimos 4 caracteres. Uno por píxel (una landing puede tener un píxel distinto al de
 * «Mi tienda»).
 */
import { createHash } from 'node:crypto';
import { db, pj, registrarLog } from './db.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

db.exec(`CREATE TABLE IF NOT EXISTS pixel_eventos (
  store_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  evento TEXT NOT NULL,
  pixel_id TEXT NOT NULL,
  landing_id TEXT NOT NULL DEFAULT '',
  valor INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  error TEXT NOT NULL DEFAULT '',
  calidad TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  intentos INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, event_id, evento)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_pixel_eventos_fecha ON pixel_eventos (store_id, created_at)');

interface Cfg { tokens: Record<string, { token: string; at: string }>; testCode: string }
function cfg(storeId: string): Cfg {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'meta_pixel_web'").get(storeId) as { config: string } | undefined;
  const c = pj<Partial<Cfg>>(r?.config || '{}', {});
  return { tokens: c.tokens && typeof c.tokens === 'object' ? c.tokens : {}, testCode: String(c.testCode || '') };
}
function guardar(storeId: string, c: Cfg): void {
  db.prepare(`INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'meta_pixel_web', ?, datetime('now'))
    ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`).run(storeId, JSON.stringify(c));
}
const limpiarPixel = (p: unknown) => String(p || '').replace(/\D/g, '').slice(0, 20);
export function tokenDePixel(storeId: string, pixelId: string): string { return cfg(storeId).tokens[limpiarPixel(pixelId)]?.token || ''; }

/** Guarda (o borra, con token vacío) el token de un píxel. */
export function guardarToken(storeId: string, pixelId: string, token: string): { ok: true } | { error: string } {
  const p = limpiarPixel(pixelId);
  if (p.length < 8) return { error: 'Primero escribe el ID del píxel (solo números).' };
  const t = String(token || '').trim();
  if (t && !/^[A-Za-z0-9_\-|.]{40,600}$/.test(t)) return { error: 'Eso no parece un token de la API de Conversiones: es un texto largo que empieza casi siempre por «EAA».' };
  const c = cfg(storeId);
  if (t) c.tokens[p] = { token: t, at: new Date().toISOString() }; else delete c.tokens[p];
  guardar(storeId, c);
  registrarLog(storeId, 'info', 'meta', t ? `Se guardó el token de la API de Conversiones del píxel ${p}.` : `Se quitó el token de la API de Conversiones del píxel ${p}.`);
  return { ok: true };
}
export function guardarCodigoPrueba(storeId: string, code: string): void {
  const c = cfg(storeId); c.testCode = String(code || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 40); guardar(storeId, c);
}

// ── Datos del cliente, como los pide Meta (normalizados y cifrados) ──────
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const h = (v: unknown, norm: (s: string) => string = (s) => s.trim().toLowerCase()) => { const s = norm(String(v || '')); return s ? [sha(s)] : undefined; };
const lugar = (s: string) => sinTildes(s).toLowerCase().replace(/[^a-z]/g, '');
export interface Cliente { tel?: string; nombre?: string; apellido?: string; ciudad?: string; departamento?: string; correo?: string }
export interface Navegador { ip?: string; ua?: string; fbp?: string; fbc?: string; url?: string }

/** fbc desde la cookie o, si no hay, desde el fbclid del enlace del anuncio. */
function fbcDe(n: Navegador): string {
  const c = String(n.fbc || '').trim();
  if (/^fb\.\d\.\d+\..+/.test(c)) return c.slice(0, 500);
  try { const id = new URL(String(n.url || '')).searchParams.get('fbclid'); if (id) return `fb.1.${Date.now()}.${id.slice(0, 400)}`; } catch { /* sin url */ }
  return '';
}
function userData(c: Cliente, n: Navegador): Record<string, unknown> {
  const tel = String(c.tel || '').replace(/\D/g, '');
  const tel57 = tel ? (tel.length === 10 ? '57' + tel : tel) : '';
  const u: Record<string, unknown> = {
    ph: tel57 ? [sha(tel57)] : undefined,
    external_id: tel57 ? [sha(tel57)] : undefined,
    fn: h(c.nombre, (s) => sinTildes(s.trim().split(/\s+/)[0] || '').toLowerCase()),
    ln: h(c.apellido, (s) => sinTildes(s.trim().split(/\s+/)[0] || '').toLowerCase()),
    ct: h(c.ciudad, lugar),
    st: h(c.departamento, lugar),
    em: h(c.correo),
    country: [sha('co')],
    client_ip_address: String(n.ip || '').trim() || undefined,
    client_user_agent: String(n.ua || '').slice(0, 500) || undefined,
    fbp: /^fb\.\d\.\d+\.\d+/.test(String(n.fbp || '')) ? String(n.fbp).slice(0, 200) : undefined,
    fbc: fbcDe(n) || undefined,
  };
  for (const k of Object.keys(u)) if (u[k] === undefined) delete u[k];
  return u;
}
/** Qué tan bien Meta podrá reconocer a la persona (para el panel). */
function calidadDe(u: Record<string, unknown>): string {
  const claves = ['ph', 'fn', 'ln', 'ct', 'st', 'em', 'fbp', 'fbc', 'client_ip_address', 'client_user_agent'].filter((k) => u[k]);
  return claves.join(',');
}

export type EventoWeb = 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase';
interface Envio { storeId: string; pixelId: string; landingId: string; evento: EventoWeb; eventId: string; valor: number; contenido?: { nombre: string; cantidad: number }; cliente: Cliente; nav: Navegador; guardarPayload: boolean }

/** Envía un evento a la API de Conversiones (si ese píxel tiene token). No lanza errores. */
export async function enviarEventoWeb(e: Envio): Promise<{ enviado: boolean; error?: string }> {
  const pixel = limpiarPixel(e.pixelId);
  const token = pixel ? tokenDePixel(e.storeId, pixel) : '';
  if (!token) return { enviado: false };
  const u = userData(e.cliente, e.nav);
  const dato = {
    event_name: e.evento,
    event_time: Math.floor(Date.now() / 1000),
    event_id: e.eventId,
    action_source: 'website',
    event_source_url: String(e.nav.url || '').slice(0, 1000) || undefined,
    user_data: u,
    custom_data: e.evento === 'PageView' ? undefined : {
      currency: 'COP', value: Math.max(0, Math.round(e.valor)),
      ...(e.contenido ? { content_name: e.contenido.nombre, content_type: 'product', content_ids: [e.landingId], num_items: e.contenido.cantidad } : {}),
      ...(e.evento === 'Purchase' ? { order_id: e.eventId } : {}),
    },
  };
  db.prepare(`INSERT INTO pixel_eventos (store_id, event_id, evento, pixel_id, landing_id, valor, calidad, payload) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(store_id, event_id, evento) DO NOTHING`).run(e.storeId, e.eventId, e.evento, pixel, e.landingId, Math.round(e.valor), calidadDe(u), e.guardarPayload ? JSON.stringify(dato) : '');
  return mandar(e.storeId, pixel, token, e.eventId, e.evento, dato);
}

async function mandar(storeId: string, pixel: string, token: string, eventId: string, evento: string, dato: unknown, testCode?: string): Promise<{ enviado: boolean; error?: string }> {
  const code = testCode ?? cfg(storeId).testCode;
  let error = '';
  try {
    const r = await fetch(`${GRAPH}/${pixel}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [dato], access_token: token, partner_agent: 'dealflow', ...(code ? { test_event_code: code } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const b = (await r.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string; error_user_msg?: string; code?: number } };
    if (!r.ok || !b.events_received) error = traducirError(b.error) || `Meta respondió ${r.status}.`;
  } catch { error = 'No pudimos hablar con Meta (se reintenta).'; }
  db.prepare("UPDATE pixel_eventos SET estado = ?, error = ?, intentos = intentos + 1 WHERE store_id = ? AND event_id = ? AND evento = ?")
    .run(error ? 'error' : 'enviado', error.slice(0, 300), storeId, eventId, evento);
  if (error && evento === 'Purchase') registrarLog(storeId, 'warn', 'meta', `La API de Conversiones no recibió la compra (píxel ${pixel}): ${error}`);
  return error ? { enviado: false, error } : { enviado: true };
}

function traducirError(e?: { message?: string; error_user_msg?: string; code?: number }): string {
  if (!e) return '';
  const m = e.error_user_msg || e.message || '';
  if (e.code === 190 || /access token|OAuth/i.test(m)) return 'El token no es válido o venció. Genera uno nuevo en el Administrador de eventos (Configuración del píxel → API de Conversiones → Generar token de acceso).';
  if (e.code === 100 && /does not exist|Unsupported post request|cannot be loaded/i.test(m)) return 'El token no corresponde a este píxel (o el ID del píxel está mal). Genera el token desde la configuración de ESTE píxel.';
  if (/test_event_code/i.test(m)) return 'El código de prueba no es válido. Cópialo de «Probar eventos» o déjalo vacío.';
  return m.slice(0, 250);
}

/** Prueba desde el panel: manda un PageView (con el código de prueba si lo hay). */
export async function probar(storeId: string, pixelId: string): Promise<{ ok: boolean; mensaje: string }> {
  const pixel = limpiarPixel(pixelId);
  const token = tokenDePixel(storeId, pixel);
  if (!token) return { ok: false, mensaje: 'Ese píxel todavía no tiene token.' };
  const id = `prueba-${Date.now().toString(36)}`;
  const code = cfg(storeId).testCode;
  const dato = { event_name: 'PageView', event_time: Math.floor(Date.now() / 1000), event_id: id, action_source: 'website', event_source_url: 'https://dealflow.sbs/prueba', user_data: { country: [sha('co')], client_user_agent: 'DealFlow (prueba de la API de Conversiones)', client_ip_address: '181.50.0.1' } };
  db.prepare("INSERT OR IGNORE INTO pixel_eventos (store_id, event_id, evento, pixel_id, payload) VALUES (?,?,?,?,'')").run(storeId, id, 'PageView', pixel);
  const r = await mandar(storeId, pixel, token, id, 'PageView', dato, code);
  db.prepare("DELETE FROM pixel_eventos WHERE store_id = ? AND event_id = ?").run(storeId, id);
  if (!r.enviado) return { ok: false, mensaje: r.error || 'Meta no recibió el evento.' };
  return { ok: true, mensaje: code ? '✓ Meta recibió el evento de prueba. Míralo en el Administrador de eventos → Probar eventos.' : '✓ Meta aceptó el token y recibió el evento. (Para verlo en vivo, pega el código de «Probar eventos» y vuelve a probar.)' };
}

/** Lo que ve la tienda en el panel (nunca el token completo). */
export function estado(storeId: string, pixeles: string[]): {
  pixeles: { pixelId: string; tieneToken: boolean; final: string; desde: string }[];
  testCode: string; resumen: { evento: string; enviados: number; errores: number }[];
  ultimos: { evento: string; estado: string; error: string; valor: number; calidad: string; fecha: string }[];
} {
  const c = cfg(storeId);
  const lista = [...new Set([...pixeles.map(limpiarPixel).filter(Boolean), ...Object.keys(c.tokens)])];
  return {
    pixeles: lista.map((p) => ({ pixelId: p, tieneToken: !!c.tokens[p], final: c.tokens[p] ? c.tokens[p].token.slice(-4) : '', desde: c.tokens[p]?.at || '' })),
    testCode: c.testCode,
    resumen: db.prepare(`SELECT evento, SUM(estado = 'enviado') enviados, SUM(estado = 'error') errores FROM pixel_eventos
      WHERE store_id = ? AND created_at > datetime('now','-7 days') GROUP BY evento`).all(storeId) as { evento: string; enviados: number; errores: number }[],
    ultimos: (db.prepare(`SELECT evento, estado, error, valor, calidad, created_at fecha FROM pixel_eventos WHERE store_id = ? AND evento = 'Purchase'
      ORDER BY created_at DESC LIMIT 10`).all(storeId) as { evento: string; estado: string; error: string; valor: number; calidad: string; fecha: string }[]),
  };
}

// ── Reintentos de compras que no llegaron, y limpieza ────────────────────
let iniciado = false;
export function iniciarPixelWeb(): void {
  if (iniciado) return; iniciado = true;
  setInterval(() => {
    try {
      const pend = db.prepare(`SELECT store_id, event_id, evento, pixel_id, payload FROM pixel_eventos WHERE estado IN ('error','pendiente') AND payload != ''
        AND intentos < 4 AND created_at > datetime('now','-1 day') AND created_at < datetime('now','-2 minutes') LIMIT 30`).all() as { store_id: string; event_id: string; evento: string; pixel_id: string; payload: string }[];
      for (const p of pend) {
        const tok = tokenDePixel(p.store_id, p.pixel_id);
        if (tok) void mandar(p.store_id, p.pixel_id, tok, p.event_id, p.evento, JSON.parse(p.payload));
      }
      // Vistas e inicios de compra: 3 días; compras: 60 días.
      db.prepare("DELETE FROM pixel_eventos WHERE (evento != 'Purchase' AND created_at < datetime('now','-3 days')) OR created_at < datetime('now','-60 days')").run();
    } catch (e) { console.error('[pixel-web]', e); }
  }, 5 * 60_000).unref?.();
}
