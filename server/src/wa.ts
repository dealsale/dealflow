import { db, uid } from './db.js';
import { mediaExt, audioAOgg } from './media.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

interface MediaInfo {
  tipo: string;
  url: string;
  mime: string;
  nombre: string;
}

function ensureLead(storeId: string, waId: string, nombre: string, tel?: string): string {
  const numPart = waId.split('@')[0];
  const telMostrar = tel || '+' + numPart; // número legible para el CRM (el @lid no sirve de teléfono)
  // Se busca por la dirección completa, por el número pelado (chats viejos) y
  // por teléfono (el mismo contacto puede llegar hoy como @lid y ayer como número).
  let lead = db.prepare("SELECT id FROM leads WHERE store_id = ? AND (wa_id = ? OR wa_id = ? OR (? != '' AND tel = ?))")
    .get(storeId, waId, numPart, tel || '', tel || '') as { id: string } | undefined;
  if (lead) {
    // Actualiza a la dirección con la que llegó el mensaje, PERO nunca degrada
    // un @lid (la dirección real del chat con privacidad LID, a la que sí se
    // entregan las respuestas) a un número normal @s.whatsapp.net.
    db.prepare("UPDATE leads SET wa_id = ? WHERE id = ? AND NOT (wa_id LIKE '%@lid' AND ? NOT LIKE '%@lid')").run(waId, lead.id, waId);
    if (tel) db.prepare("UPDATE leads SET tel = ? WHERE id = ? AND (tel = '' OR tel LIKE '+%@%' OR tel = ?)").run(tel, lead.id, '+' + numPart);
  }
  if (!lead) {
    const id = uid();
    db.prepare('INSERT INTO leads (id, store_id, nombre, tel, etapa, asignado, wa_id) VALUES (?,?,?,?,?,?,?)').run(
      id, storeId, nombre || telMostrar, telMostrar, 'Explorando', 'Asistente (bot)', waId,
    );
    lead = { id };
  } else if (nombre) {
    db.prepare('UPDATE leads SET nombre = ? WHERE id = ? AND (nombre = ? OR nombre = ?)').run(nombre, lead.id, '+' + numPart, waId);
  }
  return lead.id;
}

/**
 * Guarda un mensaje entrante (texto y/o adjunto). Crea el lead si no existe.
 * La usan tanto el webhook de la Cloud API como la sesión por QR.
 */
export function saveIncomingMessage(storeId: string, waId: string, nombre: string, texto: string, media?: MediaInfo, tel?: string) {
  const leadId = ensureLead(storeId, waId, nombre, tel);
  db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)').run(
    uid(), leadId, 'cliente', texto, media?.tipo || 'texto', media?.url || null, media?.mime || null, media?.nombre || null,
  );
  // Respuesta automática por IA (si está configurada y el bot atiende este chat).
  void import('./ai.js').then((a) => a.maybeAutoReply(storeId, leadId)).catch(() => {});
  return leadId;
}

/** Valida las credenciales contra la API de Meta y devuelve el número mostrado. */
export async function verifyWhatsappCredentials(phoneNumberId: string, accessToken: string): Promise<{ ok: true; numero: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await res.json()) as { display_phone_number?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: body.error?.message || 'Meta rechazó las credenciales. Revisa el Phone Number ID y el token.' };
    return { ok: true, numero: body.display_phone_number || '' };
  } catch {
    return { ok: false, error: 'No pudimos hablar con Meta. Revisa la conexión del servidor e intenta de nuevo.' };
  }
}

/** Envía un mensaje de texto por la vía activa de la tienda (Cloud API o QR). */
export async function sendWhatsappText(storeId: string, to: string, texto: string, pn?: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = db.prepare('SELECT phone_number_id, access_token, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { phone_number_id: string; access_token: string; conectado: number; modo: string }
    | undefined;
  if (!cfg?.conectado) return { ok: false, error: 'WhatsApp no está conectado.' };
  if (cfg.modo === 'qr') {
    const { sendViaQr } = await import('./waqr.js');
    return sendViaQr(storeId, to, texto, pn);
  }
  try {
    const numero = (pn || to).replace(/[^0-9]/g, '');
    const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texto } }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, error: body.error?.message || 'Meta no aceptó el mensaje.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos hablar con Meta.' };
  }
}

/** Sube un adjunto a Meta y lo envía por su media ID (Cloud API). */
async function cloudSendMedia(
  phoneId: string,
  token: string,
  numero: string,
  media: { buffer: Buffer; mime: string; tipo: string },
  caption: string,
  nombre: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1) Subir el archivo y obtener su media ID.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', media.mime);
    form.append('file', new Blob([new Uint8Array(media.buffer)], { type: media.mime }), nombre || 'archivo.' + mediaExt(media.tipo, media.mime));
    const up = await fetch(`${GRAPH}/${phoneId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const upj = (await up.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!up.ok || !upj.id) return { ok: false, error: upj.error?.message || 'Meta no aceptó el archivo.' };

    // 2) Enviar el mensaje que referencia ese media ID.
    const tw = media.tipo === 'image' ? 'image' : media.tipo === 'video' ? 'video' : media.tipo === 'audio' ? 'audio' : 'document';
    const obj: Record<string, string> = { id: upj.id };
    if (caption && tw !== 'audio') obj.caption = caption;
    if (tw === 'document' && nombre) obj.filename = nombre;
    const send = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: tw, [tw]: obj }),
    });
    if (!send.ok) {
      const b = (await send.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, error: b.error?.message || 'Meta no aceptó el envío del adjunto.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos hablar con Meta para enviar el adjunto.' };
  }
}

/** Envía un adjunto por la vía activa (QR ya soporta; Cloud API enviará el texto). */
export async function sendWhatsappMedia(
  storeId: string,
  to: string,
  media: { buffer: Buffer; mime: string; tipo: string },
  caption: string,
  nombre: string,
  pn?: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = db.prepare('SELECT phone_number_id, access_token, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { phone_number_id: string; access_token: string; conectado: number; modo: string }
    | undefined;
  if (!cfg?.conectado) return { ok: false, error: 'WhatsApp no está conectado.' };
  // Nota de voz: los navegadores graban en webm; WhatsApp la quiere en ogg/opus.
  if (media.tipo === 'audio' && !media.mime.includes('ogg')) {
    const ogg = audioAOgg(media.buffer);
    if (ogg) media = { buffer: ogg, mime: 'audio/ogg; codecs=opus', tipo: 'audio' };
  }
  if (cfg.modo === 'qr') {
    const { sendMediaViaQr } = await import('./waqr.js');
    return sendMediaViaQr(storeId, to, media, caption, nombre, pn);
  }
  const numero = (pn || to).replace(/[^0-9]/g, '');
  return cloudSendMedia(cfg.phone_number_id, cfg.access_token, numero, media, caption, nombre);
}

interface WebhookMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}
interface WebhookMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: WebhookMedia;
  video?: WebhookMedia;
  audio?: WebhookMedia;
  document?: WebhookMedia;
}

interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WebhookMessage[];
}

/** Descarga un adjunto de la Cloud API por su media ID y lo guarda en disco. */
async function descargarMediaCloud(storeId: string, token: string, mediaId: string, tipo: string, mime: string): Promise<string | null> {
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    const mj = (await meta.json().catch(() => ({}))) as { url?: string };
    if (!mj.url) return null;
    const bin = await fetch(mj.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok) return null;
    const buffer = Buffer.from(await bin.arrayBuffer());
    const { mediaDir } = await import('./media.js');
    const { writeFileSync } = await import('node:fs');
    const path = await import('node:path');
    const file = uid() + '.' + mediaExt(tipo, mime);
    writeFileSync(path.join(mediaDir(storeId), file), buffer);
    return '/api/media/' + storeId + '/' + file;
  } catch {
    return null;
  }
}

/** Procesa el webhook de Meta: crea/actualiza el lead y guarda el mensaje entrante (texto o adjunto). */
export function handleIncomingWebhook(body: unknown) {
  const entries = (body as { entry?: { changes?: { value?: WebhookValue }[] }[] })?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value?.messages?.length) continue;
      const store = db.prepare('SELECT store_id, access_token FROM whatsapp WHERE phone_number_id = ? AND conectado = 1').get(phoneNumberId) as
        | { store_id: string; access_token: string }
        | undefined;
      if (!store) continue;

      for (const msg of value.messages) {
        const waId = msg.from;
        const nombre = value.contacts?.find((c) => c.wa_id === waId)?.profile?.name || '';
        if (msg.type === 'text' && msg.text?.body) {
          saveIncomingMessage(store.store_id, waId, nombre, msg.text.body);
          continue;
        }
        const media = msg.image || msg.video || msg.audio || msg.document;
        if (media?.id) {
          const tipo = msg.type === 'image' ? 'image' : msg.type === 'video' ? 'video' : msg.type === 'audio' ? 'audio' : 'document';
          const mime = media.mime_type || 'application/octet-stream';
          void descargarMediaCloud(store.store_id, store.access_token, media.id, tipo, mime).then((url) => {
            saveIncomingMessage(store.store_id, waId, nombre, media.caption || '', url ? { tipo, url, mime, nombre: media.filename || '' } : undefined);
          });
        }
      }
    }
  }
}
