/**
 * Lanzar a Meta los videos y fotos del Estudio (Marketing IA).
 *
 * La tienda elige piezas listas del estudio, un objetivo (mensajes a WhatsApp, ventas en la web
 * con el píxel o tráfico), presupuesto diario y público. DealFlow, con la cuenta publicitaria que
 * la tienda conectó (ads_cuentas):
 *   1. sube cada video (advideos) y su portada / cada foto (adimages) a la cuenta,
 *   2. espera a que Meta termine de procesar los videos (video_status = ready),
 *   3. crea campaña (presupuesto a nivel campaña) → conjunto → un creativo y un anuncio por pieza.
 * Todo nace EN PAUSA; la tienda lo activa desde el panel cuando quiera. Cada paso se guarda
 * (ids de Meta), así un reintento sigue donde quedó y nunca duplica. Corre en segundo plano.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { db, registrarLog, uid } from './db.js';
import { mediaPath } from './media.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';
const txt = (v: unknown) => (v == null ? '' : String(v));
type Fila = Record<string, unknown>;

db.exec(`CREATE TABLE IF NOT EXISTS estudio_lanzamientos (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  proyecto_id TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  objetivo TEXT NOT NULL DEFAULT 'mensajes',   -- mensajes | ventas | trafico
  presupuesto INTEGER NOT NULL DEFAULT 0,      -- diario, en la moneda de la cuenta
  enlace TEXT NOT NULL DEFAULT '',
  pixel_id TEXT NOT NULL DEFAULT '',
  publico TEXT NOT NULL DEFAULT '{}',
  cuenta TEXT NOT NULL DEFAULT '',             -- act_… usada
  page_id TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'creando',      -- creando | en_pausa | activa | error
  paso TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  adset_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  metricas TEXT NOT NULL DEFAULT '{}',
  metricas_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS estudio_lanz_anuncios (
  id TEXT PRIMARY KEY,
  lanzamiento_id TEXT NOT NULL REFERENCES estudio_lanzamientos(id) ON DELETE CASCADE,
  pieza_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  texto TEXT NOT NULL DEFAULT '',
  titular TEXT NOT NULL DEFAULT '',
  video_id TEXT NOT NULL DEFAULT '',
  video_listo INTEGER NOT NULL DEFAULT 0,
  image_hash TEXT NOT NULL DEFAULT '',
  creative_id TEXT NOT NULL DEFAULT '',
  ad_id TEXT NOT NULL DEFAULT '',
  estado_meta TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT ''
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_estudio_lanz_proy ON estudio_lanzamientos(store_id, proyecto_id, created_at)');

interface Cuenta { access_token: string; ad_account_id: string; page_id: string; page_nombre: string; moneda: string; conectada: number }
const cuentaDe = (storeId: string) => db.prepare('SELECT * FROM ads_cuentas WHERE store_id = ?').get(storeId) as Cuenta | undefined;

class MetaError extends Error { constructor(m: string, public codigo = 0) { super(m); } }
/** Mensaje claro para la tienda a partir del error de Meta. */
function mensaje(e: { message?: string; error_user_msg?: string; error_user_title?: string; code?: number } | undefined, porDefecto: string): string {
  if (!e) return porDefecto;
  if (e.code === 190) return 'La conexión con Facebook venció. Vuelve a conectar tu Administrador de anuncios en «Campañas en Meta».';
  if (e.code === 17 || e.code === 80004) return 'Meta pidió esperar un momento (límite de solicitudes). Se reintenta solo.';
  return e.error_user_msg || e.error_user_title || e.message || porDefecto;
}
async function graph<T>(token: string, metodo: 'GET' | 'POST', ruta: string, params?: Record<string, unknown> | FormData): Promise<T> {
  let url = `${GRAPH}/${ruta}`;
  let init: RequestInit = { method: metodo, signal: AbortSignal.timeout(120_000) };
  if (params instanceof FormData) { params.append('access_token', token); init.body = params; }
  else if (metodo === 'POST') {
    const b = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) if (v !== undefined) b.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    b.append('access_token', token);
    init = { ...init, body: b };
  } else {
    const q = new URLSearchParams({ ...(params as Record<string, string> || {}), access_token: token });
    url += (url.includes('?') ? '&' : '?') + q.toString();
  }
  const r = await fetch(url, init);
  const b = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string; code?: number } };
  if (!r.ok || b.error) throw new MetaError(mensaje(b.error, `Meta respondió ${r.status}`), b.error?.code || 0);
  return b;
}

// ── Opciones para el formulario ─────────────────────────────────────────────
export async function opcionesLanzar(storeId: string) {
  const c = cuentaDe(storeId);
  const wa = db.prepare('SELECT numero FROM whatsapp WHERE store_id = ? AND conectado = 1').get(storeId) as { numero: string } | undefined;
  const { pixelesDe } = await import('./metaPixelWeb.js');
  const { dominioActivo } = await import('./landings.js');
  const dom = dominioActivo(storeId);
  return {
    conectada: !!(c?.conectada && c.access_token && c.ad_account_id),
    cuenta: c?.ad_account_id || '', pagina: c?.page_nombre || '', tienePagina: !!c?.page_id, moneda: c?.moneda || 'COP',
    whatsapp: (wa?.numero || '').replace(/\D/g, ''),
    pixeles: pixelesDe(storeId),
    enlace: dom ? `https://${dom}` : '',
  };
}

// ── Crear el lanzamiento ────────────────────────────────────────────────────
export interface PedidoLanzar {
  nombre?: string;
  objetivo: 'mensajes' | 'ventas' | 'trafico';
  presupuesto: number;
  enlace?: string;
  pixelId?: string;
  publico?: { edadMin?: number; edadMax?: number; genero?: 'todos' | 'hombres' | 'mujeres'; advantage?: boolean };
  piezas: { id: string; texto?: string; titular?: string }[];
}

export async function crearLanzamiento(storeId: string, proyectoId: string, p: PedidoLanzar): Promise<{ id: string } | { error: string }> {
  const c = cuentaDe(storeId);
  if (!c?.conectada || !c.access_token || !c.ad_account_id) return { error: 'Primero conecta tu Administrador de anuncios (pestaña «Campañas en Meta»).' };
  if (!c.page_id) return { error: 'Tu conexión con Meta no tiene una página de Facebook elegida. Vuelve a conectar y elige la página.' };
  const proy = db.prepare('SELECT nombre FROM estudio_proyectos WHERE id = ? AND store_id = ?').get(proyectoId, storeId) as { nombre: string } | undefined;
  if (!proy) return { error: 'Proyecto no encontrado.' };
  const objetivo = ['mensajes', 'ventas', 'trafico'].includes(p.objetivo) ? p.objetivo : 'mensajes';
  const presupuesto = Math.round(Number(p.presupuesto) || 0);
  if (presupuesto < 5000) return { error: 'El presupuesto diario mínimo es $5.000.' };
  const ids = (p.piezas || []).map((x) => txt(x.id)).filter(Boolean);
  if (!ids.length) return { error: 'Elige al menos un video o una foto.' };
  if (ids.length > 10) return { error: 'Máximo 10 anuncios por campaña.' };
  const piezas = db.prepare(`SELECT id, tipo, angulo, uso, orden, texto, titular, url FROM estudio_piezas WHERE store_id = ? AND proyecto_id = ? AND id IN (${ids.map(() => '?').join(',')})`).all(storeId, proyectoId, ...ids) as Fila[];
  if (piezas.length !== ids.length || piezas.some((x) => !txt(x.url))) return { error: 'Alguna pieza todavía no está generada.' };
  const op = await opcionesLanzar(storeId);
  let enlace = txt(p.enlace).trim();
  let pixel = '';
  if (objetivo === 'mensajes') {
    if (!op.whatsapp) return { error: 'Para anuncios que llevan a WhatsApp necesitas tu número conectado en la sección WhatsApp.' };
    enlace = `https://wa.me/${op.whatsapp}`;
  } else {
    if (!/^https:\/\/[^\s/]+\.[^\s]+/.test(enlace)) return { error: 'Escribe la dirección (https://…) de la página a la que llevará el anuncio.' };
    if (objetivo === 'ventas') {
      pixel = txt(p.pixelId).replace(/\D/g, '') || op.pixeles[0] || '';
      if (!pixel) return { error: 'Para optimizar por ventas necesitas el píxel de Meta (configúralo en tu Tienda en línea) o elige el objetivo «Tráfico».' };
    }
  }
  const pub = p.publico || {};
  const publico = {
    advantage: pub.advantage !== false,
    edadMin: Math.min(65, Math.max(18, Math.round(Number(pub.edadMin) || 18))),
    edadMax: Math.min(65, Math.max(18, Math.round(Number(pub.edadMax) || 65))),
    genero: ['hombres', 'mujeres'].includes(txt(pub.genero)) ? txt(pub.genero) : 'todos',
  };
  if (publico.edadMax < publico.edadMin) publico.edadMax = publico.edadMin;
  const id = uid();
  const nombre = txt(p.nombre).trim().slice(0, 120) || `${proy.nombre} · ${objetivo === 'mensajes' ? 'WhatsApp' : objetivo === 'ventas' ? 'Ventas' : 'Tráfico'} · ${new Date().toISOString().slice(0, 10)}`;
  const editados = new Map((p.piezas || []).map((x) => [txt(x.id), x]));
  db.transaction(() => {
    db.prepare(`INSERT INTO estudio_lanzamientos (id, store_id, proyecto_id, nombre, objetivo, presupuesto, enlace, pixel_id, publico, cuenta, page_id, paso)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, storeId, proyectoId, nombre, objetivo, presupuesto, enlace, pixel, JSON.stringify(publico),
      c.ad_account_id.startsWith('act_') ? c.ad_account_id : `act_${c.ad_account_id}`, c.page_id, 'Subiendo los archivos a Meta');
    const ins = db.prepare('INSERT INTO estudio_lanz_anuncios (id, lanzamiento_id, pieza_id, tipo, nombre, texto, titular) VALUES (?,?,?,?,?,?,?)');
    for (const x of piezas) {
      const e = editados.get(txt(x.id));
      const n = `${x.tipo === 'video' ? 'V' : 'F'}${x.orden} · ${txt(x.angulo || x.uso || 'pieza').slice(0, 40)}`;
      ins.run(uid(), id, txt(x.id), txt(x.tipo), n, txt(e?.texto ?? x.texto).slice(0, 1500), txt(e?.titular ?? x.titular).slice(0, 80));
    }
  })();
  registrarLog(storeId, 'info', 'marketing', `Estudio IA: se empezó a crear la campaña «${nombre}» en Meta con ${piezas.length} anuncio(s).`);
  setImmediate(() => void avanzar(id).catch((e) => console.warn('[estudio-meta]', e)));
  return { id };
}

// ── Avance (idempotente) ─────────────────────────────────────────────────────
/** Portada JPG del video (primer segundo) para el creativo: Meta la exige para anuncios de video. */
function portadaVideo(archivo: string): Buffer | null {
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-portada-'));
    const out = path.join(dir, 'p.jpg');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.5', '-i', archivo, '-frames:v', '1', '-q:v', '3', out], { timeout: 30_000 });
    return r.status === 0 && existsSync(out) ? readFileSync(out) : null;
  } catch { return null; } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
}
/** Imagen a JPG (Meta no acepta webp en adimages). */
function aJpg(archivo: string): Buffer | null {
  if (/\.(jpe?g|png)$/i.test(archivo)) return readFileSync(archivo);
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-jpg-'));
    const out = path.join(dir, 'i.jpg');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', archivo, '-q:v', '3', out], { timeout: 30_000 });
    return r.status === 0 && existsSync(out) ? readFileSync(out) : null;
  } catch { return null; } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
}
async function subirImagen(token: string, act: string, bytes: Buffer, nombre: string): Promise<string> {
  const f = new FormData();
  f.append('filename', new Blob([new Uint8Array(bytes)], { type: /\.png$/i.test(nombre) ? 'image/png' : 'image/jpeg' }), nombre);
  const r = await graph<{ images?: Record<string, { hash?: string }> }>(token, 'POST', `${act}/adimages`, f);
  const hash = Object.values(r.images || {})[0]?.hash;
  if (!hash) throw new MetaError('Meta no devolvió la imagen subida.');
  return hash;
}

const corriendo = new Set<string>();
export async function avanzar(id: string): Promise<void> {
  if (corriendo.has(id)) return;
  corriendo.add(id);
  const L = db.prepare('SELECT * FROM estudio_lanzamientos WHERE id = ?').get(id) as Fila | undefined;
  try {
    if (!L || L.estado !== 'creando') return;
    const storeId = txt(L.store_id);
    const c = cuentaDe(storeId);
    if (!c?.access_token) throw new MetaError('La conexión con Meta ya no está. Vuelve a conectar tu Administrador de anuncios.');
    const token = c.access_token, act = txt(L.cuenta);
    const paso = (t: string) => db.prepare("UPDATE estudio_lanzamientos SET paso = ?, updated_at = datetime('now') WHERE id = ?").run(t, id);
    const anuncios = () => db.prepare('SELECT a.*, p.url, p.miniatura FROM estudio_lanz_anuncios a JOIN estudio_piezas p ON p.id = a.pieza_id WHERE a.lanzamiento_id = ?').all(id) as Fila[];
    const setA = (aid: string, col: string, v: unknown) => db.prepare(`UPDATE estudio_lanz_anuncios SET ${col} = ? WHERE id = ?`).run(v, aid);

    // 1) Subir archivos.
    paso('Subiendo los videos y fotos a tu cuenta publicitaria');
    for (const a of anuncios()) {
      const archivo = mediaPath(storeId, txt(a.url).split('/').pop()!);
      if (!existsSync(archivo)) throw new MetaError(`El archivo de «${a.nombre}» ya no está en el servidor.`);
      if (a.tipo === 'video') {
        if (!a.video_id) {
          const f = new FormData();
          f.append('name', `${txt(L.nombre)} · ${txt(a.nombre)}`.slice(0, 200));
          f.append('source', new Blob([new Uint8Array(readFileSync(archivo))], { type: 'video/mp4' }), 'video.mp4');
          const r = await graph<{ id?: string }>(token, 'POST', `${act}/advideos`, f);
          if (!r.id) throw new MetaError('Meta no devolvió el video subido.');
          setA(txt(a.id), 'video_id', r.id);
        }
        if (!a.image_hash) {
          const miniatura = txt(a.miniatura) ? mediaPath(storeId, txt(a.miniatura).split('/').pop()!) : '';
          const portada = portadaVideo(archivo) || (miniatura && existsSync(miniatura) ? aJpg(miniatura) : null);
          if (portada) setA(txt(a.id), 'image_hash', await subirImagen(token, act, portada, 'portada.jpg'));
        }
      } else if (!a.image_hash) {
        const bytes = aJpg(archivo);
        if (!bytes) throw new MetaError(`No pudimos preparar la foto «${a.nombre}».`);
        setA(txt(a.id), 'image_hash', await subirImagen(token, act, bytes, /\.png$/i.test(archivo) ? 'foto.png' : 'foto.jpg'));
      }
    }

    // 2) Esperar a que Meta procese los videos.
    let pendientes = 0;
    for (const a of anuncios().filter((x) => x.tipo === 'video' && !Number(x.video_listo))) {
      const r = await graph<{ status?: { video_status?: string } }>(token, 'GET', txt(a.video_id), { fields: 'status' });
      const st = txt(r.status?.video_status);
      if (st === 'ready') setA(txt(a.id), 'video_listo', 1);
      else if (st === 'error') throw new MetaError(`Meta no pudo procesar el video «${a.nombre}». Prueba con otro.`);
      else pendientes++;
    }
    if (pendientes) {
      paso(`Meta está procesando ${pendientes} video${pendientes === 1 ? '' : 's'}… (suele tardar 1 a 5 minutos)`);
      if (Date.now() - Date.parse(txt(L.created_at).replace(' ', 'T') + 'Z') > 45 * 60_000) throw new MetaError('Meta tardó demasiado procesando los videos. Reintenta en un rato.');
      return; // se sigue en la próxima vuelta
    }

    const objetivo = txt(L.objetivo);
    const publico = JSON.parse(txt(L.publico) || '{}') as { advantage: boolean; edadMin: number; edadMax: number; genero: string };
    // 3) Campaña (presupuesto diario a nivel campaña, en centavos como pide Meta).
    let campaign = txt(L.campaign_id);
    if (!campaign) {
      paso('Creando la campaña');
      const r = await graph<{ id?: string }>(token, 'POST', `${act}/campaigns`, {
        name: txt(L.nombre),
        objective: objetivo === 'ventas' ? 'OUTCOME_SALES' : objetivo === 'trafico' ? 'OUTCOME_TRAFFIC' : 'OUTCOME_ENGAGEMENT',
        status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION',
        daily_budget: Number(L.presupuesto) * 100, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      });
      campaign = txt(r.id);
      db.prepare('UPDATE estudio_lanzamientos SET campaign_id = ? WHERE id = ?').run(campaign, id);
    }
    // 4) Conjunto de anuncios.
    let adset = txt(L.adset_id);
    if (!adset) {
      paso('Creando el conjunto de anuncios');
      const targeting: Record<string, unknown> = { geo_locations: { countries: ['CO'] }, age_min: publico.advantage ? 18 : publico.edadMin, age_max: publico.advantage ? 65 : publico.edadMax, targeting_automation: { advantage_audience: publico.advantage ? 1 : 0 } };
      if (publico.genero !== 'todos') targeting.genders = [publico.genero === 'hombres' ? 1 : 2];
      const base = { name: `${txt(L.nombre)} · conjunto`, campaign_id: campaign, billing_event: 'IMPRESSIONS', targeting, status: 'PAUSED', start_time: new Date(Date.now() + 5 * 60_000).toISOString() };
      const extra = objetivo === 'mensajes'
        ? { optimization_goal: 'CONVERSATIONS', destination_type: 'WHATSAPP', promoted_object: { page_id: txt(L.page_id) } }
        : objetivo === 'ventas'
          ? { optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: txt(L.pixel_id), custom_event_type: 'PURCHASE' } }
          : { optimization_goal: 'LINK_CLICKS', destination_type: 'WEBSITE' };
      const r = await graph<{ id?: string }>(token, 'POST', `${act}/adsets`, { ...base, ...extra });
      adset = txt(r.id);
      db.prepare('UPDATE estudio_lanzamientos SET adset_id = ? WHERE id = ?').run(adset, id);
    }
    // 5) Un creativo y un anuncio por pieza.
    const cta = objetivo === 'mensajes' ? { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link: txt(L.enlace) } } : { type: 'SHOP_NOW', value: { link: txt(L.enlace) } };
    for (const a of anuncios()) {
      let creative = txt(a.creative_id);
      if (!creative) {
        paso(`Creando el anuncio «${txt(a.nombre)}»`);
        const spec = a.tipo === 'video'
          ? { page_id: txt(L.page_id), video_data: { video_id: txt(a.video_id), ...(a.image_hash ? { image_hash: txt(a.image_hash) } : {}), message: txt(a.texto), title: txt(a.titular), call_to_action: cta } }
          : { page_id: txt(L.page_id), link_data: { image_hash: txt(a.image_hash), link: txt(L.enlace), message: txt(a.texto), name: txt(a.titular), call_to_action: cta } };
        const r = await graph<{ id?: string }>(token, 'POST', `${act}/adcreatives`, { name: `${txt(L.nombre)} · ${txt(a.nombre)}`, object_story_spec: spec });
        creative = txt(r.id);
        setA(txt(a.id), 'creative_id', creative);
      }
      if (!a.ad_id) {
        const r = await graph<{ id?: string }>(token, 'POST', `${act}/ads`, { name: `${txt(a.nombre)}`.slice(0, 200), adset_id: adset, creative: { creative_id: creative }, status: 'PAUSED' });
        setA(txt(a.id), 'ad_id', txt(r.id));
        setA(txt(a.id), 'estado_meta', 'PAUSED');
      }
    }
    db.prepare("UPDATE estudio_lanzamientos SET estado = 'en_pausa', paso = 'Lista en Meta, en pausa', error = '', updated_at = datetime('now') WHERE id = ?").run(id);
    registrarLog(storeId, 'info', 'marketing', `Estudio IA: la campaña «${txt(L.nombre)}» quedó creada en Meta (en pausa).`);
  } catch (e) {
    const m = e instanceof MetaError ? e.message : 'No pudimos hablar con Meta. Se reintenta solo.';
    // Límite de tasa o red: se reintenta; lo demás queda en error para que la tienda lo vea.
    const reintentable = !(e instanceof MetaError) || e.codigo === 17 || e.codigo === 80004;
    if (L) {
      if (reintentable) db.prepare("UPDATE estudio_lanzamientos SET paso = ?, updated_at = datetime('now') WHERE id = ?").run(m, id);
      else {
        db.prepare("UPDATE estudio_lanzamientos SET estado = 'error', error = ?, updated_at = datetime('now') WHERE id = ?").run(m.slice(0, 500), id);
        registrarLog(txt(L.store_id), 'error', 'marketing', `Estudio IA: no se pudo crear la campaña «${txt(L.nombre)}» en Meta: ${m}`);
      }
    }
  } finally { corriendo.delete(id); }
}

export function reintentar(storeId: string, id: string): { ok: true } | { error: string } {
  const r = db.prepare("UPDATE estudio_lanzamientos SET estado = 'creando', error = '', created_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND store_id = ? AND estado = 'error'").run(id, storeId);
  if (!r.changes) return { error: 'Esta campaña no está en error.' };
  setImmediate(() => void avanzar(id).catch(() => {}));
  return { ok: true };
}

/** Activa o pausa la campaña completa (campaña, conjunto y anuncios). */
export async function cambiarEstado(storeId: string, id: string, activar: boolean): Promise<{ ok: true } | { error: string }> {
  const L = db.prepare('SELECT * FROM estudio_lanzamientos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!L) return { error: 'Campaña no encontrada.' };
  if (!['en_pausa', 'activa'].includes(txt(L.estado))) return { error: 'La campaña todavía no está lista en Meta.' };
  const c = cuentaDe(storeId);
  if (!c?.access_token) return { error: 'Vuelve a conectar tu Administrador de anuncios.' };
  const status = activar ? 'ACTIVE' : 'PAUSED';
  try {
    const ads = db.prepare("SELECT id, ad_id FROM estudio_lanz_anuncios WHERE lanzamiento_id = ? AND ad_id != ''").all(id) as { id: string; ad_id: string }[];
    // Al activar: de abajo hacia arriba (anuncios, conjunto, campaña); al pausar basta la campaña, pero se pausan todos.
    for (const a of ads) { await graph(c.access_token, 'POST', a.ad_id, { status }); db.prepare('UPDATE estudio_lanz_anuncios SET estado_meta = ? WHERE id = ?').run(status, a.id); }
    await graph(c.access_token, 'POST', txt(L.adset_id), { status });
    await graph(c.access_token, 'POST', txt(L.campaign_id), { status });
    db.prepare("UPDATE estudio_lanzamientos SET estado = ?, updated_at = datetime('now') WHERE id = ?").run(activar ? 'activa' : 'en_pausa', id);
    registrarLog(storeId, 'info', 'marketing', `Estudio IA: campaña «${txt(L.nombre)}» ${activar ? 'activada' : 'pausada'} desde el panel.`);
    return { ok: true };
  } catch (e) { return { error: e instanceof MetaError ? e.message : 'No pudimos hablar con Meta.' }; }
}

/** Métricas básicas (desde que se creó) y estado de revisión de cada anuncio; caché de 10 minutos. */
async function refrescarMetricas(L: Fila): Promise<void> {
  if (!['en_pausa', 'activa'].includes(txt(L.estado)) || !L.campaign_id) return;
  if (L.metricas_at && Date.now() - Date.parse(txt(L.metricas_at).replace(' ', 'T') + 'Z') < 10 * 60_000) return;
  const c = cuentaDe(txt(L.store_id));
  if (!c?.access_token) return;
  try {
    const ins = await graph<{ data?: Fila[] }>(c.access_token, 'GET', `${txt(L.campaign_id)}/insights`, { level: 'ad', fields: 'ad_id,spend,impressions,clicks,ctr,cpc,actions', date_preset: 'maximum' });
    const porAd: Record<string, Fila> = {};
    let gasto = 0, impresiones = 0, clics = 0, conversaciones = 0, compras = 0;
    for (const f of ins.data || []) {
      const acc = (f.actions || []) as { action_type: string; value: string }[];
      const conv = acc.filter((x) => /messaging_conversation_started/.test(x.action_type)).reduce((s, x) => s + Number(x.value), 0);
      const comp = acc.filter((x) => x.action_type === 'offsite_conversion.fb_pixel_purchase' || x.action_type === 'purchase').reduce((s, x) => Math.max(s, Number(x.value)), 0);
      porAd[txt(f.ad_id)] = { gasto: Number(f.spend) || 0, impresiones: Number(f.impressions) || 0, clics: Number(f.clicks) || 0, ctr: Number(f.ctr) || 0, conversaciones: conv, compras: comp };
      gasto += Number(f.spend) || 0; impresiones += Number(f.impressions) || 0; clics += Number(f.clicks) || 0; conversaciones += conv; compras += comp;
    }
    const ads = db.prepare("SELECT id, ad_id FROM estudio_lanz_anuncios WHERE lanzamiento_id = ? AND ad_id != ''").all(txt(L.id)) as { id: string; ad_id: string }[];
    if (ads.length) {
      const est = await graph<Record<string, { effective_status?: string }>>(c.access_token, 'GET', '', { ids: ads.map((a) => a.ad_id).join(','), fields: 'effective_status' });
      for (const a of ads) if (est[a.ad_id]?.effective_status) db.prepare('UPDATE estudio_lanz_anuncios SET estado_meta = ? WHERE id = ?').run(est[a.ad_id].effective_status, a.id);
    }
    db.prepare("UPDATE estudio_lanzamientos SET metricas = ?, metricas_at = datetime('now') WHERE id = ?").run(JSON.stringify({ gasto, impresiones, clics, conversaciones, compras, porAd }), txt(L.id));
  } catch (e) { console.warn('[estudio-meta] métricas', (e as Error).message); }
}

export async function listarLanzamientos(storeId: string, proyectoId: string) {
  const filas = db.prepare('SELECT * FROM estudio_lanzamientos WHERE store_id = ? AND proyecto_id = ? ORDER BY created_at DESC LIMIT 20').all(storeId, proyectoId) as Fila[];
  for (const L of filas) await refrescarMetricas(L);
  return (db.prepare('SELECT * FROM estudio_lanzamientos WHERE store_id = ? AND proyecto_id = ? ORDER BY created_at DESC LIMIT 20').all(storeId, proyectoId) as Fila[]).map((L) => {
    const m = JSON.parse(txt(L.metricas) || '{}') as { gasto?: number; impresiones?: number; clics?: number; conversaciones?: number; compras?: number; porAd?: Record<string, Fila> };
    const anuncios = (db.prepare('SELECT * FROM estudio_lanz_anuncios WHERE lanzamiento_id = ?').all(txt(L.id)) as Fila[]).map((a) => ({
      id: txt(a.id), piezaId: txt(a.pieza_id), tipo: txt(a.tipo), nombre: txt(a.nombre), estadoMeta: txt(a.estado_meta), listo: !!a.ad_id, metricas: m.porAd?.[txt(a.ad_id)] || null,
    }));
    const cuenta = txt(L.cuenta).replace(/^act_/, '');
    return {
      id: txt(L.id), nombre: txt(L.nombre), objetivo: txt(L.objetivo), presupuesto: Number(L.presupuesto), estado: txt(L.estado), paso: txt(L.paso), error: txt(L.error),
      creada: txt(L.created_at), anuncios, metricas: { gasto: m.gasto || 0, impresiones: m.impresiones || 0, clics: m.clics || 0, conversaciones: m.conversaciones || 0, compras: m.compras || 0 },
      enlaceMeta: L.campaign_id ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${cuenta}&selected_campaign_ids=${txt(L.campaign_id)}` : '',
    };
  });
}

let vuelta = false;
export function iniciarEstudioMeta(): void {
  setInterval(() => {
    if (vuelta) return;
    vuelta = true;
    void (async () => {
      for (const r of db.prepare("SELECT id FROM estudio_lanzamientos WHERE estado = 'creando' ORDER BY updated_at LIMIT 10").all() as { id: string }[]) await avanzar(r.id).catch(() => {});
    })().finally(() => { vuelta = false; });
  }, 30_000).unref();
}
