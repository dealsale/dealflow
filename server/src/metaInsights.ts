/**
 * Datos de los anuncios desde el Administrador de anuncios del cliente (Marketing API):
 * gasto, impresiones, alcance, clics y conversaciones iniciadas, por anuncio y por día,
 * con el nombre de la campaña, el conjunto y el anuncio. Se cruzan con los chats y las
 * ventas de DealFlow (statsAnuncios.ts) para sacar costo por chat, por pedido y ROAS.
 *
 * Usa la cuenta que la tienda conectó en Marketing (tabla ads_cuentas). Se sincroniza
 * sola cada 30 minutos (últimos 3 días, que es lo que Meta todavía ajusta) y a mano desde
 * Estadísticas (hasta 90 días).
 */
import { db } from './db.js';
import { norm, mismoToken } from './emparejar.js';
import { productoDeAnuncio, vincularAnuncio } from './campana.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

db.exec(`CREATE TABLE IF NOT EXISTS ads_insights (
  store_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  ad_name TEXT NOT NULL DEFAULT '',
  adset_id TEXT NOT NULL DEFAULT '',
  adset_name TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_name TEXT NOT NULL DEFAULT '',
  gasto REAL NOT NULL DEFAULT 0,
  impresiones INTEGER NOT NULL DEFAULT 0,
  alcance INTEGER NOT NULL DEFAULT 0,
  clics INTEGER NOT NULL DEFAULT 0,
  conversaciones INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, ad_id, fecha)
)`);
// Miniatura y post de cada anuncio (para mostrarlos aunque el anuncio no haya traído chats).
db.exec(`CREATE TABLE IF NOT EXISTS ads_meta (
  store_id TEXT NOT NULL, ad_id TEXT NOT NULL, thumb TEXT NOT NULL DEFAULT '', post_id TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (store_id, ad_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ads_sync (
  store_id TEXT PRIMARY KEY,
  ultima TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  filas INTEGER NOT NULL DEFAULT 0
)`);

const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const restarDias = (f: string, n: number) => new Date(new Date(f + 'T12:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);

interface Cuenta { ad_account_id: string; access_token: string; moneda: string; conectada: number }
function cuentaDe(storeId: string): Cuenta | undefined {
  return db.prepare('SELECT ad_account_id, access_token, moneda, conectada FROM ads_cuentas WHERE store_id = ?').get(storeId) as Cuenta | undefined;
}

export interface EstadoInsights { conectada: boolean; cuenta: string; moneda: string; ultima: string; error: string; filas: number }
export function estadoInsights(storeId: string): EstadoInsights {
  const c = db.prepare('SELECT ad_account_nombre, moneda, conectada, ad_account_id FROM ads_cuentas WHERE store_id = ?').get(storeId) as { ad_account_nombre: string; moneda: string; conectada: number; ad_account_id: string } | undefined;
  const s = db.prepare('SELECT ultima, error, filas FROM ads_sync WHERE store_id = ?').get(storeId) as { ultima: string; error: string; filas: number } | undefined;
  return { conectada: !!(c?.conectada && c.ad_account_id), cuenta: c?.ad_account_nombre || '', moneda: c?.moneda || '', ultima: s?.ultima || '', error: s?.error || '', filas: s?.filas || 0 };
}

const ACCIONES_CONVERSACION = ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection'];

/** Trae los insights por anuncio y día de [desde, hasta] y los guarda. */
export async function sincronizarInsights(storeId: string, dias = 3): Promise<{ ok: true; filas: number } | { error: string }> {
  const c = cuentaDe(storeId);
  if (!c?.conectada || !c.access_token || !c.ad_account_id) return { error: 'Conecta tu Administrador de anuncios en Marketing.' };
  const hasta = hoyBogota();
  const desde = restarDias(hasta, Math.min(90, Math.max(1, dias)) - 1);
  const act = c.ad_account_id.startsWith('act_') ? c.ad_account_id : `act_${c.ad_account_id}`;
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since: desde, until: hasta }),
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions,date_start',
    limit: '500',
  });
  let url: string | undefined = `${GRAPH}/${act}/insights?${params}`;
  const guardar = db.prepare(`INSERT INTO ads_insights (store_id, ad_id, fecha, ad_name, adset_id, adset_name, campaign_id, campaign_name, gasto, impresiones, alcance, clics, conversaciones, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(store_id, ad_id, fecha) DO UPDATE SET ad_name = excluded.ad_name, adset_id = excluded.adset_id, adset_name = excluded.adset_name,
      campaign_id = excluded.campaign_id, campaign_name = excluded.campaign_name, gasto = excluded.gasto, impresiones = excluded.impresiones,
      alcance = excluded.alcance, clics = excluded.clics, conversaciones = excluded.conversaciones, updated_at = excluded.updated_at`);
  let filas = 0;
  const anotar = (error: string) => db.prepare(`INSERT INTO ads_sync (store_id, ultima, error, filas) VALUES (?, datetime('now'), ?, ?)
    ON CONFLICT(store_id) DO UPDATE SET ultima = excluded.ultima, error = excluded.error, filas = excluded.filas`).run(storeId, error, filas);
  try {
    for (let pagina = 0; url && pagina < 40; pagina++) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${c.access_token}` }, signal: AbortSignal.timeout(30_000) });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { ad_id?: string; ad_name?: string; adset_id?: string; adset_name?: string; campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; reach?: string; clicks?: string; date_start?: string; actions?: { action_type: string; value: string }[] }[];
        paging?: { next?: string };
        error?: { message?: string; code?: number };
      };
      if (!res.ok || body.error) {
        const e = body.error;
        const msg = e?.code === 190 ? 'El acceso a Meta venció: vuelve a conectar tu Administrador de anuncios en Marketing.'
          : e?.code === 200 || e?.code === 10 ? 'Meta no dio permiso para leer los anuncios (falta ads_read): vuelve a conectar y acepta todos los permisos.'
          : e?.code === 17 || e?.code === 80004 ? 'Meta limitó las consultas por un momento; se reintenta en la próxima hora.'
          : e?.message || `Meta respondió ${res.status}.`;
        anotar(msg);
        return { error: msg };
      }
      db.transaction(() => {
        for (const d of body.data || []) {
          if (!d.ad_id || !d.date_start) continue;
          const conv = (d.actions || []).filter((a) => ACCIONES_CONVERSACION.includes(a.action_type)).reduce((m, a) => Math.max(m, Number(a.value) || 0), 0);
          guardar.run(storeId, d.ad_id, d.date_start, d.ad_name || '', d.adset_id || '', d.adset_name || '', d.campaign_id || '', d.campaign_name || '',
            Number(d.spend) || 0, Number(d.impressions) || 0, Number(d.reach) || 0, Number(d.clicks) || 0, conv);
          filas++;
        }
      })();
      url = body.paging?.next;
    }
    anotar('');
    await traerMiniaturas(storeId, c.access_token).catch((e) => console.warn('[ads] miniaturas', e));
    try { autoVincularPorNombre(storeId); } catch (e) { console.warn('[ads] auto-vínculo', e); }
    return { ok: true, filas };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'Meta tardó demasiado en responder.' : 'No pudimos hablar con Meta.';
    anotar(msg);
    return { error: msg };
  }
}

/** Miniatura, post y estado (activo/pausado) de los anuncios que aún no los tienen (o de hace más de 1 día). */
async function traerMiniaturas(storeId: string, token: string): Promise<void> {
  const ids = (db.prepare(`SELECT DISTINCT i.ad_id FROM ads_insights i LEFT JOIN ads_meta m ON m.store_id = i.store_id AND m.ad_id = i.ad_id
    WHERE i.store_id = ? AND (m.ad_id IS NULL OR m.updated_at < datetime('now', '-1 day')) LIMIT 100`).all(storeId) as { ad_id: string }[]).map((r) => r.ad_id);
  for (let i = 0; i < ids.length; i += 50) {
    const parte = ids.slice(i, i + 50);
    const r = await fetch(`${GRAPH}/?ids=${parte.join(',')}&fields=effective_status,creative{thumbnail_url,image_url,effective_object_story_id}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    const b = (await r.json().catch(() => ({}))) as Record<string, { effective_status?: string; creative?: { thumbnail_url?: string; image_url?: string; effective_object_story_id?: string } }> & { error?: unknown };
    if (!r.ok || b.error) return;
    const g = db.prepare(`INSERT INTO ads_meta (store_id, ad_id, thumb, post_id, estado, updated_at) VALUES (?,?,?,?,?, datetime('now'))
      ON CONFLICT(store_id, ad_id) DO UPDATE SET thumb = excluded.thumb, post_id = excluded.post_id, estado = excluded.estado, updated_at = excluded.updated_at`);
    for (const id of parte) {
      const a = b[id];
      if (!a) continue;
      g.run(storeId, id, a.creative?.image_url || a.creative?.thumbnail_url || '', a.creative?.effective_object_story_id || '', a.effective_status || '');
    }
  }
}

/** Anuncios conocidos (de Meta y de los chats) con su producto vinculado, para vincularlos a mano. */
export function anunciosConProducto(storeId: string) {
  const filas = db.prepare(`
    SELECT i.ad_id, MAX(i.ad_name) ad_name, MAX(i.campaign_name) campaign_name, MAX(i.adset_name) adset_name, SUM(i.gasto) gasto, MAX(i.fecha) ultima,
      m.thumb, m.post_id, m.estado
    FROM ads_insights i LEFT JOIN ads_meta m ON m.store_id = i.store_id AND m.ad_id = i.ad_id
    WHERE i.store_id = ? AND i.fecha >= date('now', '-60 days') GROUP BY i.ad_id ORDER BY ultima DESC, gasto DESC`).all(storeId) as { ad_id: string; ad_name: string; campaign_name: string; adset_name: string; gasto: number; ultima: string; thumb: string | null; post_id: string | null; estado: string | null }[];
  const vinc = new Map((db.prepare('SELECT ad_id, product_id, auto FROM anuncio_producto WHERE store_id = ?').all(storeId) as { ad_id: string; product_id: string; auto: number }[]).map((v) => [v.ad_id, v]));
  return filas.map((f) => ({
    adId: f.ad_id, nombre: f.ad_name || f.ad_id, campana: f.campaign_name, conjunto: f.adset_name, gasto: Math.round(f.gasto), ultima: f.ultima,
    thumb: f.thumb || '', url: f.post_id ? `https://www.facebook.com/${f.post_id}` : '', estado: f.estado || '',
    productId: vinc.get(f.ad_id)?.product_id || '', auto: vinc.get(f.ad_id)?.auto === 1,
  }));
}

/** Miniatura guardada de un anuncio (para las estadísticas). */
export function miniaturas(storeId: string): Map<string, { thumb: string; url: string }> {
  return new Map((db.prepare('SELECT ad_id, thumb, post_id FROM ads_meta WHERE store_id = ?').all(storeId) as { ad_id: string; thumb: string; post_id: string }[])
    .map((m) => [m.ad_id, { thumb: m.thumb, url: m.post_id ? `https://www.facebook.com/${m.post_id}` : '' }]));
}

// Palabras que no identifican un producto en el nombre de un anuncio.
const RELLENO = new Set(['de', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'y', 'en', 'del', 'por', 'un', 'una']);

/**
 * Anuncio → producto por el NOMBRE que tiene en Meta (anuncio, conjunto o campaña):
 * si todas las palabras de un producto aparecen ("Camisilla compresión - Video 2" →
 * Camisilla de compresión), el anuncio queda ligado a ese producto y el bot sabe qué
 * mensaje inicial mandar aunque el cliente no escriba la frase. Nunca pisa un vínculo
 * que la tienda puso a mano.
 */
export function autoVincularPorNombre(storeId: string): number {
  const prods = (db.prepare("SELECT id, nombre FROM products WHERE store_id = ? AND COALESCE(tipo,'producto') = 'producto'").all(storeId) as { id: string; nombre: string }[])
    .map((p) => ({ ...p, toks: norm(p.nombre).split(' ').filter((t) => t.length >= 2 && !RELLENO.has(t)) }))
    .filter((p) => p.toks.length);
  if (!prods.length) return 0;
  const ads = db.prepare(`SELECT ad_id, MAX(ad_name) ad_name, MAX(adset_name) adset_name, MAX(campaign_name) campaign_name FROM ads_insights WHERE store_id = ? GROUP BY ad_id`).all(storeId) as { ad_id: string; ad_name: string; adset_name: string; campaign_name: string }[];
  let n = 0;
  for (const a of ads) {
    const ya = productoDeAnuncio(storeId, a.ad_id);
    if (ya && !ya.auto) continue; // vínculo manual: se respeta
    // Primero el nombre del anuncio; si no dice el producto, el conjunto y luego la campaña.
    for (const texto of [a.ad_name, a.adset_name, a.campaign_name]) {
      const tt = norm(texto || '').split(' ').filter(Boolean);
      if (!tt.length) continue;
      const cands = prods.filter((p) => p.toks.every((t) => tt.some((x) => mismoToken(x, t) || (t.length >= 4 && x.startsWith(t.slice(0, -1))))));
      if (!cands.length) continue;
      // El más específico (más palabras); si dos empatan, no se adivina.
      cands.sort((x, y) => y.toks.length - x.toks.length);
      if (cands[1] && cands[1].toks.length === cands[0].toks.length) break;
      if (ya?.productId !== cands[0].id) { vincularAnuncio(storeId, a.ad_id, cands[0].id, a.ad_name || '', true); n++; }
      break;
    }
  }
  return n;
}

export interface InsightAd { adId: string; adName: string; adsetId: string; adsetName: string; campaignId: string; campaignName: string; gasto: number; impresiones: number; alcance: number; clics: number; conversaciones: number; porDia: Map<string, number> }

/** Suma de los insights de cada anuncio en el rango (y el gasto por día). */
export function insightsEnRango(storeId: string, desde: string, hasta: string): Map<string, InsightAd> {
  const out = new Map<string, InsightAd>();
  const filas = db.prepare('SELECT * FROM ads_insights WHERE store_id = ? AND fecha BETWEEN ? AND ? ORDER BY fecha').all(storeId, desde, hasta) as {
    ad_id: string; fecha: string; ad_name: string; adset_id: string; adset_name: string; campaign_id: string; campaign_name: string; gasto: number; impresiones: number; alcance: number; clics: number; conversaciones: number;
  }[];
  for (const f of filas) {
    let a = out.get(f.ad_id);
    if (!a) { a = { adId: f.ad_id, adName: '', adsetId: '', adsetName: '', campaignId: '', campaignName: '', gasto: 0, impresiones: 0, alcance: 0, clics: 0, conversaciones: 0, porDia: new Map() }; out.set(f.ad_id, a); }
    // Nombres: los más recientes.
    a.adName = f.ad_name || a.adName; a.adsetId = f.adset_id || a.adsetId; a.adsetName = f.adset_name || a.adsetName;
    a.campaignId = f.campaign_id || a.campaignId; a.campaignName = f.campaign_name || a.campaignName;
    a.gasto += f.gasto; a.impresiones += f.impresiones; a.alcance += f.alcance; a.clics += f.clics; a.conversaciones += f.conversaciones;
    a.porDia.set(f.fecha, (a.porDia.get(f.fecha) || 0) + f.gasto);
  }
  return out;
}

/** Cada 30 minutos: últimos 3 días de cada tienda con anuncios conectados. La primera vez, 30 días. */
let iniciado = false;
export function iniciarInsights(): void {
  if (iniciado) return;
  iniciado = true;
  const ronda = async () => {
    const tiendas = db.prepare("SELECT store_id FROM ads_cuentas WHERE conectada = 1 AND access_token != '' AND ad_account_id != ''").all() as { store_id: string }[];
    for (const t of tiendas) {
      const previo = db.prepare('SELECT filas, ultima FROM ads_sync WHERE store_id = ?').get(t.store_id) as { filas: number; ultima: string } | undefined;
      await sincronizarInsights(t.store_id, previo?.ultima ? 3 : 30).catch((e) => console.warn('[ads] insights', e));
      await new Promise((r) => setTimeout(r, 2000));
    }
  };
  setTimeout(() => void ronda(), 90_000);
  setInterval(() => void ronda(), 30 * 60_000); // cada 30 minutos
}
