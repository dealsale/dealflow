import { db } from './db.js';

/**
 * Embedded Signup de Meta (conexión en un clic).
 *
 * En vez de que cada tienda cree su propia app en developers.facebook.com y
 * pegue WABA ID + Phone Number ID + token, el dueño hace clic en "Conectar con
 * Facebook": Meta abre un popup donde elige su cuenta de WhatsApp Business y su
 * número, y nos devuelve un `code`. Aquí lo canjeamos por el token de ESE
 * negocio, suscribimos nuestra app a sus webhooks y registramos el número en la
 * Cloud API. El dueño no ve ni un dato técnico.
 *
 * Requiere en el servidor (Railway):
 *   META_APP_ID, META_APP_SECRET, META_CONFIG_ID
 * Si faltan, el botón no aparece y la vinculación manual sigue funcionando.
 */

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

export function metaSignupConfig() {
  const appId = process.env.META_APP_ID || '';
  const configId = process.env.META_CONFIG_ID || '';
  const secret = process.env.META_APP_SECRET || '';
  return { disponible: !!(appId && configId && secret), appId, configId };
}

/** PIN de verificación en dos pasos del número. Se guarda para poder re-registrar. */
function pinDeTienda(storeId: string): string {
  const prev = db.prepare('SELECT pin FROM whatsapp WHERE store_id = ?').get(storeId) as { pin?: string } | undefined;
  if (prev?.pin && /^\d{6}$/.test(prev.pin)) return prev.pin;
  return String(Math.floor(100000 + Math.random() * 900000));
}

interface GraphError { error?: { message?: string; code?: number; error_subcode?: number } }

async function graph(url: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> & GraphError }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & GraphError;
  return { ok: res.ok, body };
}

/** Canjea el `code` del popup por el token permanente del negocio del cliente. */
async function canjearToken(code: string): Promise<{ token: string } | { error: string }> {
  const { appId, configId } = metaSignupConfig();
  const secret = process.env.META_APP_SECRET || '';
  if (!appId || !secret || !configId) return { error: 'La conexión automática no está configurada en el servidor.' };
  const url = `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`;
  const { ok, body } = await graph(url);
  const token = String(body.access_token || '');
  if (!ok || !token) return { error: body.error?.message || 'Meta no entregó el acceso. Intenta conectar de nuevo.' };
  return { token };
}

/**
 * Completa el alta: suscribe nuestra app a los webhooks de la WABA del cliente
 * y registra el número en la Cloud API. Devuelve el número para mostrarlo.
 */
export async function conectarPorSignup(
  storeId: string,
  code: string,
  wabaId: string,
  phoneNumberId: string,
): Promise<{ ok: true; numero: string; aviso?: string } | { ok: false; error: string }> {
  if (!code || !wabaId || !phoneNumberId) return { ok: false, error: 'Meta no devolvió los datos del número. Vuelve a intentar la conexión.' };

  const t = await canjearToken(code);
  if ('error' in t) return { ok: false, error: t.error };
  const token = t.token;
  const auth = { Authorization: `Bearer ${token}` };
  const json = { ...auth, 'Content-Type': 'application/json' };

  // 1) Nuestra app pasa a recibir los mensajes de esa cuenta en NUESTRO webhook.
  const sub = await graph(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: 'POST', headers: auth });
  if (!sub.ok) return { ok: false, error: sub.body.error?.message || 'No pudimos suscribir la cuenta de WhatsApp. Intenta de nuevo.' };

  // 2) Registrar el número habilita el envío por la Cloud API.
  let aviso: string | undefined;
  const pin = pinDeTienda(storeId);
  const reg = await graph(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/register`, {
    method: 'POST', headers: json, body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });
  if (!reg.ok) {
    const msg = reg.body.error?.message || '';
    // Si ya estaba registrado, seguimos: el número igual puede enviar.
    if (!/already|registrad/i.test(msg)) aviso = `El número quedó vinculado, pero Meta reportó: ${msg}`;
  }

  // 3) Número visible para mostrar en el panel.
  const info = await graph(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, { headers: auth });
  const numero = String(info.body.display_phone_number || '');

  // Un número solo puede estar activo en una tienda a la vez (igual que el manual).
  db.prepare('UPDATE whatsapp SET conectado = 0 WHERE phone_number_id = ? AND store_id != ?').run(phoneNumberId, storeId);
  db.prepare(
    `INSERT INTO whatsapp (store_id, waba_id, phone_number_id, access_token, numero, conectado, modo, pin) VALUES (?,?,?,?,?,1,'cloud',?)
     ON CONFLICT(store_id) DO UPDATE SET waba_id = excluded.waba_id, phone_number_id = excluded.phone_number_id,
       access_token = excluded.access_token, numero = excluded.numero, conectado = 1, modo = 'cloud', pin = excluded.pin`,
  ).run(storeId, wabaId, phoneNumberId, token, numero, pin);
  console.log(`[meta-signup] tienda ${storeId} conectó phone_number_id=${phoneNumberId} (${numero})`);
  return { ok: true, numero, aviso };
}
