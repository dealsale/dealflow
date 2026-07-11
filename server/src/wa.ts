import { db, uid } from './db.js';

const GRAPH = 'https://graph.facebook.com/v20.0';

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
    const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/[^0-9]/g, ''), type: 'text', text: { body: texto } }),
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

/** Envía un adjunto por la vía activa (QR ya soporta; Cloud API enviará el texto). */
export async function sendWhatsappMedia(
  storeId: string,
  to: string,
  media: { buffer: Buffer; mime: string; tipo: string },
  caption: string,
  nombre: string,
  pn?: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = db.prepare('SELECT conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { conectado: number; modo: string }
    | undefined;
  if (!cfg?.conectado) return { ok: false, error: 'WhatsApp no está conectado.' };
  if (cfg.modo === 'qr') {
    const { sendMediaViaQr } = await import('./waqr.js');
    return sendMediaViaQr(storeId, to, media, caption, nombre, pn);
  }
  // Cloud API: el envío de adjuntos está en camino; por ahora mandamos el texto.
  if (caption) return sendWhatsappText(storeId, to, caption);
  return { ok: false, error: 'Enviar adjuntos por la API oficial está en camino.' };
}

interface WebhookMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WebhookMessage[];
}

/** Procesa el webhook de Meta: crea/actualiza el lead y guarda el mensaje entrante. */
export function handleIncomingWebhook(body: unknown) {
  const entries = (body as { entry?: { changes?: { value?: WebhookValue }[] }[] })?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value?.messages?.length) continue;
      const store = db.prepare('SELECT store_id FROM whatsapp WHERE phone_number_id = ? AND conectado = 1').get(phoneNumberId) as
        | { store_id: string }
        | undefined;
      if (!store) continue;

      for (const msg of value.messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue;
        const waId = msg.from;
        const nombre = value.contacts?.find((c) => c.wa_id === waId)?.profile?.name || '';
        saveIncomingMessage(store.store_id, waId, nombre, msg.text.body);
      }
    }
  }
}
