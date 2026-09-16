import webpush from 'web-push';
import { db, uid } from './db.js';

/**
 * Web Push (notificaciones con la app CERRADA), estándar VAPID.
 *
 * Requiere estas variables de entorno (si faltan, el push queda deshabilitado y
 * la app sigue funcionando con las notificaciones en primer plano):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (par de llaves VAPID)
 *   VAPID_SUBJECT                        (mailto: de contacto; opcional)
 */
const PUB = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIV = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUBJ = (process.env.VAPID_SUBJECT || 'mailto:soporte@dealflow.sbs').trim();

let listo = false;
if (PUB && PRIV) {
  try { webpush.setVapidDetails(SUBJ, PUB, PRIV); listo = true; }
  catch (e) { console.error('[push] VAPID inválido:', e); }
}
if (!listo) console.log('[push] Web Push deshabilitado (faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).');

export function pushDisponible(): boolean { return listo; }
export function vapidPublicKey(): string { return listo ? PUB : ''; }

interface SubEntrante { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

/** Guarda (o actualiza) una suscripción push con sus preferencias de tipo. */
export function guardarSuscripcion(storeId: string, sub: SubEntrante, prefs?: { pedidos?: boolean; contactos?: boolean }): boolean {
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return false;
  db.prepare(
    `INSERT INTO push_subscriptions (id, store_id, endpoint, p256dh, auth, pedidos, contactos)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET store_id = excluded.store_id, p256dh = excluded.p256dh, auth = excluded.auth, pedidos = excluded.pedidos, contactos = excluded.contactos`,
  ).run(uid(), storeId, endpoint, p256dh, auth, prefs?.pedidos === false ? 0 : 1, prefs?.contactos === false ? 0 : 1);
  return true;
}

export function eliminarSuscripcion(endpoint: string): void {
  if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

/**
 * Envía una notificación push a todas las suscripciones de la tienda que tengan
 * activado ese tipo. Borra las suscripciones muertas (404/410).
 */
export async function enviarPush(storeId: string, tipo: 'pedidos' | 'contactos', titulo: string, cuerpo: string, data?: Record<string, unknown>): Promise<void> {
  if (!listo) return;
  const col = tipo === 'pedidos' ? 'pedidos' : 'contactos';
  const subs = db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE store_id = ? AND ${col} = 1`).all(storeId) as
    { endpoint: string; p256dh: string; auth: string }[];
  if (!subs.length) return;
  const payload = JSON.stringify({ titulo, cuerpo, tipo, data: data || {} });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) eliminarSuscripcion(s.endpoint); // suscripción caducada
      }
    }),
  );
}
