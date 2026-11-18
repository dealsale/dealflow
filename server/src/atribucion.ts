/**
 * ¿De qué anuncio vino un pedido de la LANDING o de SHOPIFY?
 *
 * Los pedidos por WhatsApp traen el anuncio en el chat (referral). Los de la web no: hay que
 * deducirlo de la dirección por la que entró la persona. En orden de confianza:
 *  1. parámetro con el id del anuncio: ad_id, fb_ad_id, utm_content / utm_term / utm_id numéricos
 *     (por ejemplo utm_content={{ad.id}} en «Parámetros de URL» del anuncio en Meta);
 *  2. id de campaña o conjunto (utm_campaign={{campaign.id}}…) → su anuncio con más gasto;
 *  3. nombre del anuncio o de la campaña (utm_content={{ad.name}}, utm_campaign={{campaign.name}});
 *  4. vino de Facebook/Instagram (fbclid o utm_source) y hay anuncios cuyo enlace apunta a esta
 *     landing o producto → el que más gastó esos días (atribución ESTIMADA).
 * Si no vino de Meta, no se atribuye (es orgánico).
 */
import { db, registrarLog } from './db.js';

/**
 * Guarda 7 días la dirección por la que entró la persona si trae datos del anuncio (fbclid, utm_…,
 * ad_id…): así, aunque navegue por la tienda antes de comprar, el pedido sabe de qué anuncio vino.
 */
export const ATRIB_JS = `(function(){try{if(/[?&](fbclid|utm_[a-z]+|ad_id|fb_ad_id|adset_id|campaign_id)=/i.test(location.search))localStorage.setItem('dfAtrib',JSON.stringify({u:location.href.slice(0,1500),t:Date.now()}))}catch(e){}})();window.dfAtrib=function(){try{var x=JSON.parse(localStorage.getItem('dfAtrib')||'null');if(x&&Date.now()-x.t<6048e5)return x.u}catch(e){}return ''};`;
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

// Direcciones de entrada guardadas en el pedido (para reintentar) y en qué quedó la atribución:
// '' = pendiente · 'sin_anuncio' = trae datos de Meta pero aún no se encontró el anuncio ·
// 'sin_datos' = no trae de qué anuncio vino (orgánico o creado por una app sin los UTM) · 'ok'.
for (const col of ["atrib_urls TEXT NOT NULL DEFAULT ''", "atrib_estado TEXT NOT NULL DEFAULT ''"]) {
  try { db.exec(`ALTER TABLE orders ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
const leerUrls = (s: string): string[] => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch { return []; } };
/** Junta direcciones nuevas con las ya guardadas del pedido (sin repetir, máx. 8). */
function guardarUrls(orderId: string, urls: string[]): string[] {
  const previas = leerUrls((db.prepare('SELECT atrib_urls FROM orders WHERE id = ?').get(orderId) as { atrib_urls: string } | undefined)?.atrib_urls || '');
  const todas = [...new Set([...previas, ...urls.map((u) => txt(u).trim().slice(0, 1500)).filter(Boolean)])].slice(0, 8);
  if (todas.length !== previas.length) db.prepare('UPDATE orders SET atrib_urls = ? WHERE id = ?').run(JSON.stringify(todas), orderId);
  return todas;
}
/** ¿Los parámetros traen las variables de Meta sin reemplazar («{{ad.id}}»)? Pasa si se pegaron en otro campo. */
const macroSinReemplazar = (urls: string[]) => urls.some((u) => /(%7B%7B|\{\{)\s*(ad|adset|campaign)\./i.test(u));

export interface Atribucion { adId: string; metodo: 'parametro' | 'campana' | 'nombre' | 'destino'; estimado: boolean; detalle: string }

/** Parámetros de una o varias direcciones (acepta rutas relativas como «/products/x?utm_…»). */
function parametros(urls: string[]): { p: URLSearchParams; rutas: string[] } {
  const p = new URLSearchParams();
  const rutas: string[] = [];
  for (const u of urls) {
    const s = txt(u).trim();
    if (!s) continue;
    try {
      const url = new URL(s, 'https://x.invalid');
      rutas.push(url.pathname.toLowerCase());
      url.searchParams.forEach((v, k) => { if (!p.has(k.toLowerCase()) && v) p.set(k.toLowerCase(), v); });
    } catch { /* dirección ilegible */ }
  }
  return { p, rutas };
}

export function vinoDeMeta(p: URLSearchParams): boolean {
  return !!(p.get('fbclid') || /^(fb|facebook|ig|instagram|meta|an|msg)\b/i.test(p.get('utm_source') || '') || p.get('ad_id') || p.get('fb_ad_id') || p.get('campaign_id'));
}

const desde = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
function topDe(storeId: string, col: 'campaign_id' | 'adset_id', id: string): string {
  const r = db.prepare(`SELECT ad_id FROM ads_insights WHERE store_id = ? AND ${col} = ? AND fecha >= ? GROUP BY ad_id ORDER BY SUM(gasto) DESC LIMIT 1`).get(storeId, id, desde(30)) as { ad_id: string } | undefined;
  return r?.ad_id || '';
}

/** Enlaces de destino de los anuncios de la cuenta (caché 1 h). */
const cacheDestinos = new Map<string, { at: number; lista: { adId: string; links: string[] }[] }>();
async function destinos(storeId: string): Promise<{ adId: string; links: string[] }[]> {
  const k = cacheDestinos.get(storeId);
  if (k && Date.now() - k.at < 3600_000) return k.lista;
  const am = await import('./adsManager.js');
  const c = am.cuenta(storeId);
  if (!c) return [];
  const r = await am.graph<{ data?: { id?: string; creative?: Record<string, unknown> }[] }>(c, `${c.act}/ads`, 'GET', {
    fields: 'id,creative{link_url,object_story_spec,asset_feed_spec,url_tags}',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'] }]),
    limit: '300',
  });
  if (!r.ok) { cacheDestinos.set(storeId, { at: Date.now() - 3000_000, lista: k?.lista || [] }); return k?.lista || []; }
  // Todos los enlaces que aparezcan dentro del creativo (link, website_url, call_to_action…).
  const lista = (r.body.data || []).filter((a) => a.id).map((a) => {
    const links = new Set<string>();
    const recorrer = (v: unknown) => {
      if (typeof v === 'string') { if (/^https?:\/\//i.test(v)) links.add(v.toLowerCase()); return; }
      if (Array.isArray(v)) { v.forEach(recorrer); return; }
      if (v && typeof v === 'object') Object.values(v as Fila).forEach(recorrer);
    };
    recorrer(a.creative);
    return { adId: String(a.id), links: [...links] };
  });
  cacheDestinos.set(storeId, { at: Date.now(), lista });
  return lista;
}

/**
 * Deduce el anuncio. `urls`: la dirección de entrada guardada (con sus parámetros) y la actual.
 * `claves`: textos que identifican la página (slug de la landing, handle del producto en Shopify).
 */
export async function atribuir(storeId: string, urls: string[], claves: string[]): Promise<Atribucion | null> {
  const { p, rutas } = parametros(urls);
  const existeAd = db.prepare('SELECT 1 FROM ads_insights WHERE store_id = ? AND ad_id = ? LIMIT 1');
  const existe = (col: 'campaign_id' | 'adset_id', id: string) => !!db.prepare(`SELECT 1 FROM ads_insights WHERE store_id = ? AND ${col} = ? LIMIT 1`).get(storeId, id);
  // 1-2. Ids numéricos en los parámetros.
  for (const k of ['ad_id', 'fb_ad_id', 'h_ad_id', 'utm_content', 'utm_term', 'utm_id', 'adset_id', 'campaign_id', 'utm_campaign', 'utm_medium']) {
    const v = (p.get(k) || '').trim();
    if (!/^\d{3,22}$/.test(v)) continue;
    if (existeAd.get(storeId, v)) return { adId: v, metodo: 'parametro', estimado: false, detalle: `${k}=${v}` };
    for (const col of ['adset_id', 'campaign_id'] as const) if (existe(col, v)) { const ad = topDe(storeId, col, v); if (ad) return { adId: ad, metodo: 'campana', estimado: true, detalle: `${k}=${v} (${col === 'adset_id' ? 'conjunto' : 'campaña'})` }; }
  }
  // 3. Nombres.
  const porNombre = (col: 'ad_name' | 'campaign_name' | 'adset_name', v: string) => {
    if (!v || v.length < 2) return '';
    const r = db.prepare(`SELECT ad_id FROM ads_insights WHERE store_id = ? AND LOWER(TRIM(${col})) = LOWER(TRIM(?)) AND fecha >= ? GROUP BY ad_id ORDER BY SUM(gasto) DESC LIMIT 1`).get(storeId, v, desde(60)) as { ad_id: string } | undefined;
    return r?.ad_id || '';
  };
  for (const k of ['utm_content', 'utm_term']) { const v = p.get(k) || ''; const ad = porNombre('ad_name', v); if (ad) return { adId: ad, metodo: 'nombre', estimado: false, detalle: `${k}=${v}` }; }
  for (const [k, col] of [['utm_campaign', 'campaign_name'], ['utm_medium', 'adset_name']] as const) { const v = p.get(k) || ''; const ad = porNombre(col, v); if (ad) return { adId: ad, metodo: 'nombre', estimado: true, detalle: `${k}=${v}` }; }
  // 4. Vino de Meta: anuncios que llevan a esta página.
  if (!vinoDeMeta(p)) return null;
  const marcas = [...claves, ...rutas.filter((r) => r.length > 3)].map((x) => x.toLowerCase().replace(/\/+$/, '')).filter((x) => x.length >= 3);
  if (!marcas.length) return null;
  const lista = await destinos(storeId).catch(() => []);
  // La marca debe terminar ahí (fin, «/», «?», «#», «&»): «/vestido» no es «/vestido-helem».
  const apunta = (l: string, m: string) => { let i = l.indexOf(m); while (i >= 0) { const sig = l.charAt(i + m.length); if (!sig || '/?#&'.includes(sig)) return true; i = l.indexOf(m, i + 1); } return false; };
  const candidatos = lista.filter((a) => a.links.some((l) => marcas.some((m) => apunta(l, m)))).map((a) => a.adId);
  if (!candidatos.length) return null;
  const ph = candidatos.map(() => '?').join(',');
  const top = db.prepare(`SELECT ad_id FROM ads_insights WHERE store_id = ? AND ad_id IN (${ph}) AND fecha >= ? GROUP BY ad_id ORDER BY SUM(gasto) DESC LIMIT 1`).get(storeId, ...candidatos, desde(3)) as { ad_id: string } | undefined;
  const adId = top?.ad_id || candidatos[0];
  return { adId, metodo: 'destino', estimado: candidatos.length > 1, detalle: candidatos.length > 1 ? `uno de ${candidatos.length} anuncios que llevan a esta página (el que más gastó)` : 'el anuncio que lleva a esta página' };
}

/** Guarda la atribución en el pedido (si no tenía anuncio) y la deja en su trazabilidad. */
export async function atribuirPedido(storeId: string, orderId: string, urls: string[], claves: string[], fuente: 'landing' | 'shopify'): Promise<Atribucion | null> {
  const o = db.prepare('SELECT ad_id FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as { ad_id: string } | undefined;
  if (!o || o.ad_id) return null;
  const todas = guardarUrls(orderId, urls);
  const a = await atribuir(storeId, todas, claves).catch((e) => { console.warn('[atribucion]', e); return null; });
  if (!a) {
    const estado = vinoDeMeta(parametros(todas).p) || macroSinReemplazar(todas) ? 'sin_anuncio' : 'sin_datos';
    db.prepare('UPDATE orders SET atrib_estado = ? WHERE id = ?').run(estado, orderId);
    return null;
  }
  db.prepare("UPDATE orders SET atrib_estado = 'ok' WHERE id = ?").run(orderId);
  const nombre = (db.prepare('SELECT ad_name, campaign_name FROM ads_insights WHERE store_id = ? AND ad_id = ? ORDER BY fecha DESC LIMIT 1').get(storeId, a.adId) as { ad_name: string; campaign_name: string } | undefined);
  db.prepare("UPDATE orders SET ad_id = ?, ad_ref = ? WHERE id = ? AND COALESCE(ad_id, '') = ''")
    .run(a.adId, JSON.stringify({ id: a.adId, titular: nombre?.ad_name || '', canal: fuente, fuente, metodo: a.metodo, estimado: a.estimado, detalle: a.detalle, ts: new Date().toISOString() }), orderId);
  try {
    const { trazar } = await import('./trazabilidad.js');
    trazar(storeId, orderId, { etapa: 'pedido', nivel: 'info', titulo: `Vino del anuncio «${nombre?.ad_name || a.adId}»${a.estimado ? ' (estimado)' : ''}`, detalle: `${nombre?.campaign_name ? `Campaña ${nombre.campaign_name}. ` : ''}Cómo lo supimos: ${a.detalle}.` });
  } catch { /* la trazabilidad es opcional */ }
  return a;
}

/** Lo que Shopify sabe de cómo llegó la persona (visita de entrada y la última antes de comprar) y los atributos del pedido. */
const Q_VIAJE = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { id customAttributes { key value }
  customerJourneySummary { ready
    lastVisit { landingPage referrerUrl utmParameters { source medium campaign content term } }
    firstVisit { landingPage referrerUrl utmParameters { source medium campaign content term } } } } } }`;
interface Viaje { listo: boolean; urls: string[] }
type Visita = { landingPage?: string | null; referrerUrl?: string | null; utmParameters?: Record<string, string | null> | null } | null | undefined;
function urlsDeVisita(v: Visita): string[] {
  if (!v) return [];
  const out: string[] = [];
  if (v.landingPage) out.push(v.landingPage);
  const u = v.utmParameters || {};
  const q = new URLSearchParams();
  for (const k of ['source', 'medium', 'campaign', 'content', 'term']) if (u[k]) q.set(`utm_${k}`, String(u[k]));
  if ([...q.keys()].length) out.push('?' + q.toString());
  if (v.referrerUrl && /facebook|instagram|fb\.|l\.messenger/i.test(v.referrerUrl)) out.push('?utm_source=facebook');
  return out;
}
/** Atributos de un pedido («utm_content: 123…», «landing: https…») → direcciones con parámetros. */
export function urlsDeAtributos(attrs: { name?: unknown; value?: unknown; key?: unknown }[]): string[] {
  const enNotas = attrs.map((n) => ({ name: txt(n.name ?? n.key), value: txt(n.value) })).filter((n) => /utm|fbclid|ad_?id|campaign|landing|url|source/i.test(n.name));
  return [...enNotas.filter((n) => /^(https?:\/\/|\/|\?)/i.test(n.value)).map((n) => n.value),
    enNotas.length ? '?' + enNotas.map((n) => `${encodeURIComponent(n.name.toLowerCase().replace(/\s+/g, '_'))}=${encodeURIComponent(n.value)}`).join('&') : ''].filter(Boolean);
}
async function viajesShopify(storeId: string, gids: string[]): Promise<Map<string, Viaje>> {
  const out = new Map<string, Viaje>();
  if (!gids.length) return out;
  const { credShopify, shopifyGQL } = await import('./shopify.js');
  const cred = credShopify(storeId);
  if (!cred) return out;
  for (let i = 0; i < gids.length; i += 50) {
    const r = await shopifyGQL<{ nodes: ({ id: string; customAttributes?: { key: string; value: string }[]; customerJourneySummary?: { ready: boolean; lastVisit: Visita; firstVisit: Visita } | null } | null)[] }>(cred, Q_VIAJE, { ids: gids.slice(i, i + 50) });
    if (!r.ok) { console.warn('[atribucion] shopify', r.error); break; }
    for (const n of r.data?.nodes || []) {
      if (!n?.id) continue;
      const j = n.customerJourneySummary;
      out.set(n.id, { listo: !!j?.ready, urls: [...urlsDeVisita(j?.lastVisit), ...urlsDeVisita(j?.firstVisit), ...urlsDeAtributos(n.customAttributes || [])] });
    }
  }
  return out;
}
const handlesDe = (urls: string[]) => [...new Set(urls.map((u) => (u.match(/\/products\/([a-z0-9-]+)/i) || [])[1]).filter(Boolean))].map((h) => `/products/${String(h).toLowerCase()}`);

/**
 * Pedido de Shopify recién importado: intenta con lo que trajo (landing_site, notas) y, si no basta,
 * pregunta a Shopify el recorrido del cliente (tarda unos minutos en estar listo; si no, la ronda
 * de cada 30 min lo vuelve a intentar).
 */
export async function atribuirPedidoShopify(storeId: string, orderId: string, gid: string, urls: string[]): Promise<void> {
  if (urls.length && await atribuirPedido(storeId, orderId, urls, handlesDe(urls), 'shopify')) return;
  if (!urls.length) guardarUrls(orderId, []);
  if (!gid) return;
  await new Promise((r) => setTimeout(r, 90_000).unref?.());
  const v = (await viajesShopify(storeId, [gid]).catch(() => new Map<string, Viaje>())).get(gid);
  if (!v) return;
  const todas = guardarUrls(orderId, v.urls);
  await atribuirPedido(storeId, orderId, todas, handlesDe(todas), 'shopify');
}

/**
 * Re-atribuye pedidos web recientes sin anuncio: los de la landing con la dirección guardada y los
 * de Shopify con su recorrido (por si el anuncio aún no estaba sincronizado o Shopify no lo tenía listo).
 */
export async function reatribuirRecientes(storeId: string, dias = 7): Promise<number> {
  const filas = db.prepare(`SELECT o.id, o.origen, o.landing_id, o.atrib_urls, (SELECT detalle FROM order_eventos e WHERE e.order_id = o.id AND e.etapa = 'pedido' AND e.detalle LIKE 'http%' ORDER BY e.rowid LIMIT 1) url
    FROM orders o WHERE o.store_id = ? AND COALESCE(o.ad_id, '') = '' AND o.origen = 'landing' AND o.created_at > datetime('now', ?)`).all(storeId, `-${dias} days`) as { id: string; origen: string; landing_id: string; atrib_urls: string; url: string | null }[];
  let n = 0;
  for (const f of filas) {
    const urls = [...(f.url ? [f.url] : []), ...leerUrls(f.atrib_urls)];
    if (!urls.length) continue;
    const slug = (db.prepare('SELECT slug FROM landings WHERE id = ?').get(f.landing_id) as { slug: string } | undefined)?.slug || '';
    if (await atribuirPedido(storeId, f.id, urls, slug ? [`/${slug}`] : [], 'landing')) n++;
  }
  // Shopify: los que no se cerraron como «sin datos» (ese estado solo se pone con el recorrido ya listo).
  const shop = db.prepare(`SELECT id, shopify_gid, atrib_urls, atrib_estado FROM orders WHERE store_id = ? AND origen = 'shopify' AND COALESCE(ad_id, '') = ''
    AND COALESCE(shopify_gid, '') != '' AND atrib_estado != 'sin_datos_final' AND created_at > datetime('now', ?) ORDER BY created_at DESC LIMIT 200`).all(storeId, `-${dias} days`) as { id: string; shopify_gid: string; atrib_urls: string; atrib_estado: string }[];
  if (shop.length) {
    const viajes = await viajesShopify(storeId, shop.map((s) => s.shopify_gid)).catch(() => new Map<string, Viaje>());
    for (const s of shop) {
      const v = viajes.get(s.shopify_gid);
      const urls = guardarUrls(s.id, v?.urls || []);
      if (urls.length && await atribuirPedido(storeId, s.id, urls, handlesDe(urls), 'shopify')) { n++; continue; }
      if (!urls.length) db.prepare("UPDATE orders SET atrib_estado = 'sin_datos' WHERE id = ?").run(s.id);
      // Recorrido listo y sin nada de Meta: no hay más que buscar.
      const st = (db.prepare('SELECT atrib_estado FROM orders WHERE id = ?').get(s.id) as { atrib_estado: string }).atrib_estado;
      if (v?.listo && st === 'sin_datos') db.prepare("UPDATE orders SET atrib_estado = 'sin_datos_final' WHERE id = ?").run(s.id);
    }
  }
  if (n) registrarLog(storeId, 'info', 'anuncios', `Se asignaron ${n} pedido(s) de la landing o de Shopify a sus anuncios.`);
  return n;
}

export interface DiagnosticoAtribucion {
  dias: number;
  fuentes: { fuente: 'shopify' | 'landing'; total: number; conAnuncio: number; sinAnuncio: number; sinDatos: number; macros: number; pendientes: number }[];
}
/** ¿Cuántos pedidos web quedaron con su anuncio y por qué no los demás? */
export function diagnosticoAtribucion(storeId: string, dias = 7): DiagnosticoAtribucion {
  const filas = db.prepare(`SELECT origen, ad_id, atrib_estado, atrib_urls FROM orders WHERE store_id = ? AND origen IN ('shopify','landing') AND created_at > datetime('now', ?)`).all(storeId, `-${dias} days`) as { origen: 'shopify' | 'landing'; ad_id: string; atrib_estado: string; atrib_urls: string }[];
  const fuentes = (['shopify', 'landing'] as const).map((fuente) => {
    const fs = filas.filter((f) => f.origen === fuente);
    const sin = fs.filter((f) => !f.ad_id);
    return {
      fuente, total: fs.length, conAnuncio: fs.length - sin.length,
      sinAnuncio: sin.filter((f) => f.atrib_estado === 'sin_anuncio' && !macroSinReemplazar(leerUrls(f.atrib_urls))).length,
      sinDatos: sin.filter((f) => f.atrib_estado.startsWith('sin_datos')).length,
      macros: sin.filter((f) => macroSinReemplazar(leerUrls(f.atrib_urls))).length,
      pendientes: sin.filter((f) => !f.atrib_estado).length,
    };
  });
  return { dias, fuentes };
}
