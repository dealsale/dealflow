import { db } from './db.js';

/**
 * Atribución de campaña.
 *
 * Cuando un cliente entra por una pauta (anuncio "Click to WhatsApp" o
 * "Click to Messenger/Instagram"), Meta pega un objeto `referral` en el primer
 * mensaje con los datos del anuncio. Aquí lo normalizamos a una forma común y lo
 * guardamos en el lead para saber de qué anuncio llegó cada chat.
 *
 * Ojo: esto solo llega en pautas corridas desde una Página de empresa. Los chats
 * orgánicos y los de Marketplace desde un perfil personal no traen referral.
 */
export interface AdRef {
  id: string; // id del anuncio (para el resumen "chats por anuncio")
  titular: string; // headline del anuncio
  texto: string; // cuerpo del anuncio (WhatsApp lo trae; Messenger no)
  media: string; // miniatura (imagen o video del anuncio)
  mediaTipo: string; // 'image' | 'video' | ''
  url: string; // link directo al anuncio (para el botón "Ver anuncio")
  canal: string; // whatsapp | messenger | instagram
  ts: string; // cuándo entró
  /** ctwa_clid: id del clic en el anuncio. Sirve para reportarle a Meta las ventas (API de Conversiones). */
  clid?: string;
}

/** Referral de la Cloud API de WhatsApp (viene dentro de cada `message.referral`). */
export interface WhatsappReferral {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  ctwa_clid?: string;
}

/** Referral de Messenger/Instagram (viene en `messaging.referral` o `postback.referral`). */
export interface MetaReferral {
  ref?: string;
  ad_id?: string;
  source?: string; // "ADS" cuando viene de una pauta
  type?: string;
  ads_context_data?: {
    ad_title?: string;
    photo_url?: string;
    video_url?: string;
    post_id?: string;
    product_id?: string;
  };
}

/** Normaliza un referral de WhatsApp CTWA a la forma común. Devuelve null si no es un anuncio. */
export function refDesdeWhatsapp(r?: WhatsappReferral | null): AdRef | null {
  if (!r || (!r.source_id && !r.source_url && !r.headline)) return null;
  return {
    id: r.source_id || '',
    titular: r.headline || '',
    texto: r.body || '',
    media: r.image_url || r.thumbnail_url || r.video_url || '',
    mediaTipo: r.media_type === 'video' ? 'video' : r.media_type === 'image' ? 'image' : '',
    url: r.source_url || '',
    canal: 'whatsapp',
    ts: new Date().toISOString(),
    clid: r.ctwa_clid || '',
  };
}

/** Normaliza un referral de Messenger/Instagram a la forma común. Devuelve null si no es un anuncio. */
export function refDesdeMeta(r?: MetaReferral | null, canal = 'messenger'): AdRef | null {
  if (!r) return null;
  const esAnuncio = r.source === 'ADS' || !!r.ad_id || !!r.ads_context_data;
  if (!esAnuncio) return null;
  const ctx = r.ads_context_data || {};
  // Link directo al anuncio: el post que lo respalda es lo más parecido a "ver el
  // anuncio como tal". Si no hay post, cae al id del anuncio.
  const url = ctx.post_id
    ? `https://www.facebook.com/${ctx.post_id}`
    : r.ad_id
    ? `https://www.facebook.com/${r.ad_id}`
    : '';
  return {
    id: r.ad_id || ctx.post_id || '',
    titular: ctx.ad_title || '',
    texto: '',
    media: ctx.photo_url || ctx.video_url || '',
    mediaTipo: ctx.video_url && !ctx.photo_url ? 'video' : ctx.photo_url ? 'image' : '',
    url,
    canal,
    ts: new Date().toISOString(),
  };
}

/**
 * Guarda el anuncio en el lead, solo si el lead aún no tiene uno. El primer anuncio
 * por el que entró el cliente es el que vale; no lo pisamos con clics posteriores.
 */
export function guardarAdEnLead(leadId: string, ad: AdRef | null): void {
  if (!ad) return;
  const row = db.prepare('SELECT ad_id, ad_ref FROM leads WHERE id = ?').get(leadId) as
    | { ad_id: string; ad_ref: string }
    | undefined;
  if (!row) return;
  if (row.ad_id || row.ad_ref) return; // ya tiene un anuncio: no lo cambiamos
  db.prepare('UPDATE leads SET ad_id = ?, ad_ref = ? WHERE id = ?').run(ad.id || '', JSON.stringify(ad), leadId);
}

// ── Anuncio → producto ─────────────────────────────────────────────────────
// Si el cliente llega por un anuncio SIN escribir el disparador, igual sabemos de
// qué anuncio vino: con este vínculo el bot le manda el mensaje inicial de ESE producto.
db.exec(`CREATE TABLE IF NOT EXISTS anuncio_producto (
  store_id TEXT NOT NULL, ad_id TEXT NOT NULL, product_id TEXT NOT NULL, titular TEXT NOT NULL DEFAULT '',
  auto INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, ad_id)
)`);
export function productoDeAnuncio(storeId: string, adId: string): { productId: string; auto: boolean } | null {
  if (!adId) return null;
  const r = db.prepare('SELECT product_id, auto FROM anuncio_producto WHERE store_id = ? AND ad_id = ?').get(storeId, adId) as { product_id: string; auto: number } | undefined;
  return r ? { productId: r.product_id, auto: r.auto === 1 } : null;
}
export function vincularAnuncio(storeId: string, adId: string, productId: string, titular = '', auto = false): void {
  if (!adId) return;
  if (!productId) { db.prepare('DELETE FROM anuncio_producto WHERE store_id = ? AND ad_id = ?').run(storeId, adId); return; }
  db.prepare(`INSERT INTO anuncio_producto (store_id, ad_id, product_id, titular, auto, updated_at) VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(store_id, ad_id) DO UPDATE SET product_id = excluded.product_id, titular = CASE WHEN excluded.titular != '' THEN excluded.titular ELSE anuncio_producto.titular END, auto = excluded.auto, updated_at = excluded.updated_at`)
    .run(storeId, adId, productId, titular.slice(0, 200), auto ? 1 : 0);
}
