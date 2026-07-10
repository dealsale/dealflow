import { db, uid } from './db.js';

const GRAPH = 'https://graph.facebook.com/v20.0';

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

/** Envía un mensaje de texto por la Cloud API. */
export async function sendWhatsappText(storeId: string, to: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = db.prepare('SELECT phone_number_id, access_token, conectado FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { phone_number_id: string; access_token: string; conectado: number }
    | undefined;
  if (!cfg?.conectado) return { ok: false, error: 'WhatsApp no está conectado.' };
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
        const nombre = value.contacts?.find((c) => c.wa_id === waId)?.profile?.name || '+' + waId;
        let lead = db.prepare('SELECT id FROM leads WHERE store_id = ? AND wa_id = ?').get(store.store_id, waId) as { id: string } | undefined;
        if (!lead) {
          const id = uid();
          db.prepare('INSERT INTO leads (id, store_id, nombre, tel, etapa, asignado, wa_id) VALUES (?,?,?,?,?,?,?)').run(
            id, store.store_id, nombre, '+' + waId, 'Explorando', 'Asistente (bot)', waId,
          );
          lead = { id };
        }
        db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), lead.id, 'cliente', msg.text.body);
      }
    }
  }
}
