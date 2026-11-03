/**
 * Drive de DealFlow (drive.dealflow.sbs): la nube del equipo (marketing, soporte, admins).
 *
 * Los archivos NO se guardan en el servidor: viven en el Google Drive de DealFlow (una cuenta
 * de Gmail conectada una sola vez por un administrador). DealFlow solo pone la puerta de entrada
 * con las cuentas del equipo, la interfaz y los enlaces para compartir.
 *
 *  - Permiso de Google: drive.file (solo los archivos que crea esta app; no ve el resto del
 *    Drive de la cuenta). Todo queda dentro de la carpeta "DealFlow Drive".
 *  - Subidas: el navegador sube DIRECTO a Google con una sesión que abre el servidor (no pasa
 *    por Railway). Si el navegador no puede, se usa el servidor como puente (sin guardar nada).
 *  - Descargas y vistas: el servidor las trae de Google al vuelo (con rangos, para videos).
 *  - Enlaces para compartir: drive.dealflow.sbs/d/<código>, con vencimiento opcional.
 *
 * Variables (Railway): GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (cliente OAuth "Aplicación web"
 * con la URI de redirección GOOGLE_REDIRECT_URI, por defecto https://app.dealflow.sbs/api/drive/google/vuelta).
 */
import { proteger } from './protegerRutas.js';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { requireAuth } from './auth.js';
import { cifrarTexto, descifrarTexto } from './cifrado.js';

const CLIENT_ID = () => String(process.env.GOOGLE_CLIENT_ID || '').trim();
const CLIENT_SECRET = () => String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const REDIRECT = () => String(process.env.GOOGLE_REDIRECT_URI || 'https://app.dealflow.sbs/api/drive/google/vuelta').trim();
const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const API = process.env.GOOGLE_DRIVE_API || 'https://www.googleapis.com/drive/v3';
const UPLOAD = process.env.GOOGLE_DRIVE_UPLOAD || 'https://www.googleapis.com/upload/drive/v3';
// El Drive vive en app.dealflow.sbs/drive (ya no en el subdominio drive.).
export const DRIVE_URL = (process.env.DRIVE_URL || process.env.PUBLIC_APP_URL || 'https://app.dealflow.sbs').replace(/\/+$/, '');
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CARPETA = 'application/vnd.google-apps.folder';

/** Quién entra al Drive: todo el equipo DealFlow (y el rol Marketing, que solo ve el Drive). */
export const ROLES_DRIVE = ['SUPERADMIN', 'ADMIN', 'SOPORTE', 'MARKETING'];
const puedeConectar = (role: string) => role === 'SUPERADMIN' || role === 'ADMIN';

db.exec("CREATE TABLE IF NOT EXISTS config_global (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')");
db.exec(`CREATE TABLE IF NOT EXISTS drive_enlaces (
  token TEXT PRIMARY KEY, archivo TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '', creado_por TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT (datetime('now')), expira TEXT, visitas INTEGER NOT NULL DEFAULT 0
)`);

interface CfgDrive { refresh: string; email: string; raiz: string; conectadoPor: string; conectadoAt: string }
function cfg(): CfgDrive | null {
  const r = db.prepare("SELECT valor FROM config_global WHERE clave = 'drive_google'").get() as { valor: string } | undefined;
  try { const c = r ? JSON.parse(r.valor) as CfgDrive : null; return c?.refresh ? c : null; } catch { return null; }
}
function guardarCfg(c: CfgDrive | null): void {
  if (!c) db.prepare("DELETE FROM config_global WHERE clave = 'drive_google'").run();
  else db.prepare("INSERT INTO config_global (clave, valor) VALUES ('drive_google', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(c));
  acceso = null;
}

// ── Token de acceso (se renueva solo con el refresh token) ──────────────────
let acceso: { token: string; exp: number } | null = null;
let renovando: Promise<string> | null = null;
class SinConexion extends Error {}
async function token(): Promise<string> {
  if (acceso && acceso.exp > Date.now() + 60_000) return acceso.token;
  if (renovando) return renovando;
  const c = cfg();
  if (!c) throw new SinConexion('El Drive todavía no está conectado con Google.');
  renovando = (async () => {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), grant_type: 'refresh_token', refresh_token: descifrarTexto(c.refresh) }) });
    const b = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!r.ok || !b.access_token) {
      if (b.error === 'invalid_grant') { guardarCfg(null); throw new SinConexion('Google cerró la conexión del Drive (se quitó el permiso o venció). Un administrador debe conectarlo de nuevo.'); }
      throw new Error(`Google no entregó el acceso (${r.status} ${b.error || ''}).`);
    }
    acceso = { token: b.access_token, exp: Date.now() + (b.expires_in || 3600) * 1000 };
    return acceso.token;
  })().finally(() => { renovando = null; });
  return renovando;
}

async function g<T>(ruta: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const url = `${API}${ruta}${init.query ? `?${new URLSearchParams(init.query)}` : ''}`;
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
  if (r.status === 204) return {} as T;
  const b = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Google Drive: ${b.error?.message || r.status}`);
  return b;
}

const CAMPOS = 'id,name,mimeType,size,modifiedTime,createdTime,hasThumbnail,iconLink,parents,appProperties,lastModifyingUser(displayName)';
interface Item { id: string; name: string; mimeType: string; size?: string; modifiedTime: string; createdTime?: string; hasThumbnail?: boolean; parents?: string[]; appProperties?: Record<string, string>; lastModifyingUser?: { displayName?: string } }
const vista = (f: Item) => ({
  id: f.id, nombre: f.name, carpeta: f.mimeType === CARPETA, mime: f.mimeType, tamano: Number(f.size || 0),
  modificado: f.modifiedTime, miniatura: !!f.hasThumbnail, por: f.appProperties?.por || f.lastModifyingUser?.displayName || '',
});

/** La carpeta raíz "DealFlow Drive" (se crea al conectar). */
async function raiz(): Promise<string> {
  const c = cfg();
  if (!c) throw new SinConexion('El Drive todavía no está conectado con Google.');
  if (c.raiz) return c.raiz;
  const f = await g<{ id: string }>('/files', { method: 'POST', body: JSON.stringify({ name: 'DealFlow Drive', mimeType: CARPETA }) });
  guardarCfg({ ...c, raiz: f.id });
  return f.id;
}

/** ¿El elemento está dentro de "DealFlow Drive"? (camina hacia arriba, máx. 25 niveles). */
const padresCache = new Map<string, { padre: string; nombre: string }>();
async function ruta(id: string): Promise<{ id: string; nombre: string }[] | null> {
  const r = await raiz();
  const out: { id: string; nombre: string }[] = [];
  let actual = id;
  for (let i = 0; i < 25; i++) {
    if (actual === r) return out.reverse();
    let p = padresCache.get(actual);
    if (!p) {
      const f = await g<Item>(`/files/${encodeURIComponent(actual)}`, { query: { fields: 'id,name,parents,trashed' } });
      p = { padre: f.parents?.[0] || '', nombre: f.name };
      padresCache.set(actual, p);
    }
    out.push({ id: actual, nombre: p.nombre });
    if (!p.padre) return null;
    actual = p.padre;
  }
  return null;
}
async function exigirDentro(id: string): Promise<void> {
  if (id === (await raiz())) return;
  if (!(await ruta(id))) throw new Error('Ese archivo no es del Drive de DealFlow.');
}

const nombreLimpio = (n: unknown) => String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ── Rutas ───────────────────────────────────────────────────────────────────
export const drive = proteger(Router());

function requireDrive(req: Request, res: Response, next: NextFunction) {
  const u = req.user;
  // Un administrador que "entró" a una tienda desde el panel sigue siendo del equipo:
  // en el Drive se usa su propia cuenta (la sesión se comparte entre la app y drive.).
  if (u && !ROLES_DRIVE.includes(u.role) && u.imp) {
    const a = db.prepare('SELECT id, email, nombre, role FROM users WHERE id = ?').get(u.imp) as { id: string; email: string; nombre: string; role: string } | undefined;
    if (a && ROLES_DRIVE.includes(a.role)) req.user = { id: a.id, email: a.email, nombre: a.nombre, role: a.role as typeof u.role, storeId: null };
  }
  if (!ROLES_DRIVE.includes(String(req.user?.role || ''))) return res.status(403).json({ error: 'El Drive es solo para el equipo DealFlow.', cuenta: u?.email || '', noEquipo: true });
  next();
}
const responderError = (res: Response, e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  res.status(e instanceof SinConexion ? 409 : 400).json({ error: m, sinConexion: e instanceof SinConexion });
};

const estados = new Map<string, { userId: string; volver: string; exp: number }>();

drive.get('/estado', requireAuth, requireDrive, async (req, res) => {
  const c = cfg();
  const base = { configurado: !!(CLIENT_ID() && CLIENT_SECRET()), puedeConectar: puedeConectar(req.user!.role), usuario: { nombre: req.user!.nombre, email: req.user!.email, role: req.user!.role } };
  if (!c) return res.json({ ...base, conectado: false });
  try {
    const a = await g<{ storageQuota?: { limit?: string; usage?: string }; user?: { emailAddress?: string } }>('/about', { query: { fields: 'storageQuota,user(emailAddress)' } });
    res.json({ ...base, conectado: true, email: c.email || a.user?.emailAddress || '', raiz: await raiz(), uso: { usado: Number(a.storageQuota?.usage || 0), limite: Number(a.storageQuota?.limit || 0) } });
  } catch (e) {
    if (e instanceof SinConexion) return res.json({ ...base, conectado: false, aviso: e.message });
    res.json({ ...base, conectado: true, email: c.email, raiz: c.raiz, aviso: e instanceof Error ? e.message : String(e) });
  }
});

// Conectar la cuenta de Google (solo administradores). Devuelve la URL de Google.
drive.get('/google/conectar', requireAuth, requireDrive, (req, res) => {
  if (!puedeConectar(req.user!.role)) return res.status(403).json({ error: 'Solo un administrador conecta el Google Drive.' });
  if (!CLIENT_ID() || !CLIENT_SECRET()) return res.status(400).json({ error: 'Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor (Railway).' });
  const st = randomBytes(18).toString('hex');
  const origen = String(req.query.volver || '');
  const volver = /^https:\/\/([a-z0-9-]+\.)*dealflow\.sbs(\/|$)/i.test(origen) || /^http:\/\/localhost(:\d+)?\//.test(origen) ? origen : `${DRIVE_URL}/drive`;
  estados.set(st, { userId: req.user!.id, volver, exp: Date.now() + 15 * 60_000 });
  const p = new URLSearchParams({ client_id: CLIENT_ID(), redirect_uri: REDIRECT(), response_type: 'code', scope: `${SCOPE} openid email`, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: st });
  res.json({ url: `${AUTH_URL}?${p}` });
});

// Google vuelve aquí (sin sesión obligatoria: el "state" dice quién la pidió).
drive.get('/google/vuelta', async (req, res) => {
  const st = estados.get(String(req.query.state || ''));
  estados.delete(String(req.query.state || ''));
  if (!st || st.exp < Date.now()) return res.status(400).send('La conexión con Google venció. Vuelve a intentarlo desde el Drive.');
  const volver = (q: string) => res.redirect(`${st.volver}${st.volver.includes('?') ? '&' : '?'}${q}`);
  if (req.query.error) return volver('google=cancelado');
  try {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: String(req.query.code || ''), client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), redirect_uri: REDIRECT(), grant_type: 'authorization_code' }) });
    const b = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
    if (!r.ok || !b.refresh_token || !b.access_token) return volver(`google=error&detalle=${encodeURIComponent(b.error_description || 'Google no entregó el permiso. Vuelve a intentarlo.')}`);
    if (!String(b.scope || '').includes('drive.file')) return volver(`google=error&detalle=${encodeURIComponent('Hay que aceptar el permiso de Google Drive.')}`);
    const quien = (db.prepare('SELECT email FROM users WHERE id = ?').get(st.userId) as { email: string } | undefined)?.email || '';
    const anterior = cfg();
    guardarCfg({ refresh: cifrarTexto(b.refresh_token), email: '', raiz: anterior?.raiz || '', conectadoPor: quien, conectadoAt: new Date().toISOString() });
    acceso = { token: b.access_token, exp: Date.now() + (b.expires_in || 3600) * 1000 };
    const a = await g<{ user?: { emailAddress?: string } }>('/about', { query: { fields: 'user(emailAddress)' } }).catch(() => ({} as { user?: { emailAddress?: string } }));
    const c = cfg()!;
    // Si cambió la cuenta de Google, la carpeta anterior no existe en la nueva.
    const mismaCuenta = !!anterior && anterior.email === (a.user?.emailAddress || '');
    guardarCfg({ ...c, email: a.user?.emailAddress || '', raiz: mismaCuenta ? c.raiz : '' });
    acceso = { token: b.access_token, exp: Date.now() + (b.expires_in || 3600) * 1000 };
    await raiz();
    volver('google=ok');
  } catch (e) { volver(`google=error&detalle=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`); }
});

drive.post('/google/desconectar', requireAuth, requireDrive, async (req, res) => {
  if (!puedeConectar(req.user!.role)) return res.status(403).json({ error: 'Solo un administrador desconecta el Google Drive.' });
  const c = cfg();
  if (c) { try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(descifrarTexto(c.refresh))}`, { method: 'POST' }); } catch { /* igual se olvida */ } }
  guardarCfg(null);
  res.json({ ok: true });
});

// Contenido de una carpeta (o búsqueda en todo el Drive de DealFlow).
drive.get('/lista', requireAuth, requireDrive, async (req, res) => {
  try {
    const r = await raiz();
    const carpeta = String(req.query.carpeta || '') || r;
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) await exigirDentro(carpeta);
    const consulta = q ? `name contains '${esc(q)}' and trashed = false` : `'${esc(carpeta)}' in parents and trashed = false`;
    const items: Item[] = [];
    let pagina = '';
    for (let i = 0; i < 10; i++) {
      const b = await g<{ files: Item[]; nextPageToken?: string }>('/files', { query: { q: consulta, fields: `nextPageToken,files(${CAMPOS})`, pageSize: '1000', orderBy: 'folder,name_natural', ...(pagina ? { pageToken: pagina } : {}) } });
      items.push(...b.files);
      if (!b.nextPageToken) break;
      pagina = b.nextPageToken;
    }
    // En la búsqueda, solo lo que está dentro del Drive de DealFlow.
    const dentro = q ? (await Promise.all(items.map(async (f) => ((f.parents || []).length && (await ruta(f.parents![0]).catch(() => null) || f.parents![0] === r) ? f : null)))).filter(Boolean) as Item[] : items;
    for (const f of dentro) if (f.parents?.[0]) padresCache.set(f.id, { padre: f.parents[0], nombre: f.name });
    res.json({ carpeta, raiz: r, ruta: q ? [] : (carpeta === r ? [] : (await ruta(carpeta)) || []), items: dentro.map(vista) });
  } catch (e) { responderError(res, e); }
});

drive.post('/carpeta', requireAuth, requireDrive, async (req, res) => {
  try {
    const padre = String(req.body?.padre || '') || (await raiz());
    await exigirDentro(padre);
    const nombre = nombreLimpio(req.body?.nombre);
    if (!nombre) return res.status(400).json({ error: 'Escribe el nombre de la carpeta.' });
    const f = await g<Item>('/files', { method: 'POST', query: { fields: CAMPOS }, body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre], appProperties: { por: req.user!.nombre || req.user!.email } }) });
    padresCache.set(f.id, { padre, nombre: f.name });
    res.json({ item: vista(f) });
  } catch (e) { responderError(res, e); }
});

/** Abre una sesión de subida en Google (resumable). Con Origin, el navegador puede subir directo. */
async function abrirSubida(padre: string, nombre: string, mime: string, tamano: number, por: string, origen?: string): Promise<string> {
  const r = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=${encodeURIComponent(CAMPOS)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime || 'application/octet-stream', ...(tamano ? { 'X-Upload-Content-Length': String(tamano) } : {}), ...(origen ? { Origin: origen } : {}) },
    body: JSON.stringify({ name: nombre, parents: [padre], appProperties: { por } }),
  });
  const url = r.headers.get('location');
  if (!r.ok || !url) { const b = await r.text().catch(() => ''); throw new Error(`Google no abrió la subida (${r.status}) ${b.slice(0, 160)}`); }
  return url;
}

drive.post('/subir/iniciar', requireAuth, requireDrive, async (req, res) => {
  try {
    const padre = String(req.body?.padre || '') || (await raiz());
    await exigirDentro(padre);
    const nombre = nombreLimpio(req.body?.nombre) || 'archivo';
    const origen = String(req.headers.origin || '');
    const url = await abrirSubida(padre, nombre, String(req.body?.mime || ''), Number(req.body?.tamano) || 0, req.user!.nombre || req.user!.email, origen || undefined);
    res.json({ url });
  } catch (e) { responderError(res, e); }
});

// Puente: si el navegador no pudo subir directo a Google, el servidor pasa el archivo al vuelo
// (no lo guarda). Cuerpo = el archivo crudo, enviado como application/octet-stream (así ningún
// lector de JSON del servidor lo consume); el tipo real va en ?mime=.
drive.put('/subir/puente', requireAuth, requireDrive, async (req, res) => {
  try {
    const padre = String(req.query.padre || '') || (await raiz());
    await exigirDentro(padre);
    const nombre = nombreLimpio(req.query.nombre) || 'archivo';
    const mime = String(req.query.mime || 'application/octet-stream').slice(0, 120);
    const tamano = Number(req.headers['content-length']) || 0;
    const url = await abrirSubida(padre, nombre, mime, tamano, req.user!.nombre || req.user!.email);
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': mime, ...(tamano ? { 'Content-Length': String(tamano) } : {}) }, body: Readable.toWeb(req) as unknown as BodyInit, duplex: 'half' } as RequestInit);
    const b = (await r.json().catch(() => ({}))) as Item & { error?: { message?: string } };
    if (!r.ok) return res.status(400).json({ error: `Google no recibió el archivo: ${b.error?.message || r.status}` });
    res.json({ item: vista(b) });
  } catch (e) { responderError(res, e); }
});

/** Trae el archivo de Google al vuelo (con rangos para videos). */
async function enviarArchivo(req: Request, res: Response, id: string, descargar: boolean): Promise<void> {
  const m = await g<Item>(`/files/${encodeURIComponent(id)}`, { query: { fields: 'id,name,mimeType,size,trashed' } });
  if (m.mimeType === CARPETA) { res.status(400).json({ error: 'Es una carpeta.' }); return; }
  const r = await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: `Bearer ${await token()}`, ...(req.headers.range ? { Range: String(req.headers.range) } : {}) } });
  if (!r.ok && r.status !== 206) { res.status(r.status === 404 ? 404 : 502).json({ error: 'Google no entregó el archivo.' }); return; }
  res.status(r.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) { const v = r.headers.get(h); if (v) res.setHeader(h, v); }
  if (!r.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(m.name)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!r.body) { res.end(); return; }
  Readable.fromWeb(r.body as never).on('error', () => res.destroy()).pipe(res);
}

drive.get('/archivo/:id', requireAuth, requireDrive, async (req, res) => {
  try { await exigirDentro(req.params.id); await enviarArchivo(req, res, req.params.id, req.query.descargar === '1'); } catch (e) { if (!res.headersSent) responderError(res, e); }
});

const miniaturas = new Map<string, { t: number; tipo: string; datos: Buffer }>();
drive.get('/miniatura/:id', requireAuth, requireDrive, async (req, res) => {
  try {
    const id = req.params.id;
    const h = miniaturas.get(id);
    if (h && Date.now() - h.t < 3600_000) { res.setHeader('Content-Type', h.tipo); res.setHeader('Cache-Control', 'private, max-age=3600'); return res.end(h.datos); }
    await exigirDentro(id);
    const m = await g<{ thumbnailLink?: string }>(`/files/${encodeURIComponent(id)}`, { query: { fields: 'thumbnailLink' } });
    if (!m.thumbnailLink) return res.status(404).end();
    const r = await fetch(m.thumbnailLink.replace(/=s\d+$/, '=s400'), { headers: { Authorization: `Bearer ${await token()}` } });
    if (!r.ok) return res.status(404).end();
    const datos = Buffer.from(await r.arrayBuffer());
    const tipo = r.headers.get('content-type') || 'image/jpeg';
    if (miniaturas.size > 500) miniaturas.delete(miniaturas.keys().next().value!);
    miniaturas.set(id, { t: Date.now(), tipo, datos });
    res.setHeader('Content-Type', tipo); res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(datos);
  } catch { res.status(404).end(); }
});

// Renombrar o mover.
drive.patch('/item/:id', requireAuth, requireDrive, async (req, res) => {
  try {
    const id = req.params.id;
    await exigirDentro(id);
    const query: Record<string, string> = { fields: CAMPOS };
    const cuerpo: Record<string, unknown> = {};
    if (req.body?.nombre != null) { const n = nombreLimpio(req.body.nombre); if (!n) return res.status(400).json({ error: 'Escribe el nombre.' }); cuerpo.name = n; }
    if (req.body?.mover) {
      const destino = String(req.body.mover);
      await exigirDentro(destino);
      if (destino === id || ((await ruta(destino)) || []).some((x) => x.id === id)) return res.status(400).json({ error: 'No puedes mover una carpeta dentro de sí misma.' });
      const actual = await g<Item>(`/files/${encodeURIComponent(id)}`, { query: { fields: 'parents' } });
      query.addParents = destino;
      if (actual.parents?.length) query.removeParents = actual.parents.join(',');
      padresCache.delete(id);
    }
    const f = await g<Item>(`/files/${encodeURIComponent(id)}`, { method: 'PATCH', query, body: JSON.stringify(cuerpo) });
    padresCache.delete(id);
    res.json({ item: vista(f) });
  } catch (e) { responderError(res, e); }
});

// Eliminar: va a la papelera de Google (se puede recuperar desde Google Drive 30 días).
drive.delete('/item/:id', requireAuth, requireDrive, async (req, res) => {
  try {
    const id = req.params.id;
    if (id === (await raiz())) return res.status(400).json({ error: 'La carpeta principal no se elimina.' });
    await exigirDentro(id);
    await g(`/files/${encodeURIComponent(id)}`, { method: 'PATCH', query: { fields: 'id' }, body: JSON.stringify({ trashed: true }) });
    padresCache.delete(id);
    db.prepare('DELETE FROM drive_enlaces WHERE archivo = ?').run(id);
    res.json({ ok: true });
  } catch (e) { responderError(res, e); }
});

// Enlace para compartir un archivo con alguien de afuera (cliente, diseñador…).
drive.post('/compartir/:id', requireAuth, requireDrive, async (req, res) => {
  try {
    const id = req.params.id;
    await exigirDentro(id);
    const m = await g<Item>(`/files/${encodeURIComponent(id)}`, { query: { fields: 'id,name,mimeType' } });
    if (m.mimeType === CARPETA) return res.status(400).json({ error: 'Por ahora se comparten archivos (no carpetas).' });
    const dias = Math.max(0, Math.min(365, Number(req.body?.dias) || 0));
    const t = randomBytes(12).toString('base64url');
    db.prepare("INSERT INTO drive_enlaces (token, archivo, nombre, creado_por, expira) VALUES (?,?,?,?, CASE WHEN ? > 0 THEN datetime('now', '+' || ? || ' days') ELSE NULL END)").run(t, id, m.name, req.user!.email, dias, dias);
    res.json({ url: `${DRIVE_URL}/d/${t}`, expira: dias ? new Date(Date.now() + dias * 86400_000).toISOString().slice(0, 10) : null });
  } catch (e) { responderError(res, e); }
});

// Público: abre el archivo compartido (sin sesión).
drive.get('/publico/:token', async (req, res) => {
  const e = db.prepare("SELECT archivo FROM drive_enlaces WHERE token = ? AND (expira IS NULL OR expira > datetime('now'))").get(req.params.token) as { archivo: string } | undefined;
  if (!e) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enlace no disponible</title><p style="font-family:system-ui;padding:32px;color:#334155">Este enlace ya no está disponible (venció o lo eliminaron).</p>');
  db.prepare('UPDATE drive_enlaces SET visitas = visitas + 1 WHERE token = ?').run(req.params.token);
  try { await enviarArchivo(req, res, e.archivo, req.query.descargar === '1'); } catch { if (!res.headersSent) res.status(404).send('Archivo no disponible.'); }
});
