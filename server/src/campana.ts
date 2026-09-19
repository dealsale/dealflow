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
