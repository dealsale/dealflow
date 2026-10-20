/**
 * Bloquear un contacto y ver qué apps siguen conectadas al número.
 *
 * Bloquear un contacto hace dos cosas:
 *  1. En DealFlow: nunca más se le envía NADA desde esta tienda (bot, seguimiento,
 *     plantillas, guías, mensajes a mano). Se revisa en el punto único de envío (wa.ts).
 *  2. En Meta (API de bloqueo de WhatsApp): el NÚMERO de la tienda lo bloquea. Así
 *     tampoco le llega nada de otra plataforma que siga usando el número (p. ej. la
 *     automatización anterior), y él no puede escribirle. Meta solo deja bloquear a
 *     quien le escribió al número en las últimas 24 h; si no, queda solo el bloqueo
 *     de DealFlow y se avisa.
 */
import { db, registrarLog } from './db.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

db.exec(`CREATE TABLE IF NOT EXISTS contactos_bloqueados (
  store_id TEXT NOT NULL,
  tel TEXT NOT NULL,                  -- últimos 10 dígitos
  wa_id TEXT NOT NULL DEFAULT '',
  en_meta INTEGER NOT NULL DEFAULT 0, -- 1 = también bloqueado en Meta
  nota_meta TEXT NOT NULL DEFAULT '',
  por TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, tel)
)`);

const diez = (t: string) => String(t || '').split('@')[0].replace(/\D/g, '').slice(-10);

/** ¿Está bloqueado este destino en esta tienda? (por wa_id o por los 10 últimos dígitos). */
export function estaBloqueado(storeId: string, to: string, pn?: string): boolean {
  const t = diez(pn || to) || diez(to);
  if (!t) return false;
  return !!db.prepare('SELECT 1 FROM contactos_bloqueados WHERE store_id = ? AND tel = ?').get(storeId, t);
}

interface CfgWa { phone_number_id: string; access_token: string; waba_id: string; modo: string; conectado: number }
const cfgWa = (storeId: string) => db.prepare('SELECT phone_number_id, access_token, waba_id, modo, conectado FROM whatsapp WHERE store_id = ?').get(storeId) as CfgWa | undefined;

async function metaBloqueo(storeId: string, numero: string, bloquear: boolean): Promise<{ ok: boolean; nota: string }> {
  const c = cfgWa(storeId);
  if (!c?.conectado || c.modo === 'qr' || !c.phone_number_id || !c.access_token) return { ok: false, nota: 'El bloqueo en Meta solo funciona con la conexión oficial de WhatsApp.' };
  try {
    const r = await fetch(`${GRAPH}/${c.phone_number_id}/block_users`, {
      method: bloquear ? 'POST' : 'DELETE',
      headers: { Authorization: `Bearer ${c.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', block_users: [{ user: numero }] }),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await r.json().catch(() => ({}))) as { block_users?: { added_users?: unknown[]; removed_users?: unknown[]; failed_users?: { errors?: { message?: string; error_data?: { details?: string } }[] }[] }; error?: { message?: string; error_data?: { details?: string } } };
    const fallo = body.block_users?.failed_users?.[0]?.errors?.[0] || body.error;
    if (!r.ok || fallo) {
      const det = fallo?.error_data?.details || fallo?.message || `Meta respondió ${r.status}`;
      return { ok: false, nota: /24|window|ventana/i.test(det) ? 'Meta solo deja bloquear a quien escribió al número en las últimas 24 horas.' : `Meta no lo bloqueó: ${det}` };
    }
    return { ok: true, nota: '' };
  } catch { return { ok: false, nota: 'No pudimos conectar con Meta.' }; }
}

/** Bloquea el contacto de un chat. */
export async function bloquearContacto(storeId: string, leadId: string, por: string): Promise<{ ok: true; enMeta: boolean; nota: string } | { error: string }> {
  const l = db.prepare('SELECT tel, wa_id, nombre FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { tel: string; wa_id: string | null; nombre: string } | undefined;
  if (!l) return { error: 'Chat no encontrado.' };
  const t = diez(l.tel || l.wa_id || '');
  if (!t || String(l.wa_id || '').startsWith('web:')) return { error: 'Este chat no tiene un número de WhatsApp para bloquear.' };
  const numero = String(l.tel || l.wa_id || '').split('@')[0].replace(/\D/g, '');
  const m = await metaBloqueo(storeId, numero, true);
  db.prepare(`INSERT INTO contactos_bloqueados (store_id, tel, wa_id, en_meta, nota_meta, por) VALUES (?,?,?,?,?,?)
    ON CONFLICT(store_id, tel) DO UPDATE SET en_meta = excluded.en_meta, nota_meta = excluded.nota_meta, por = excluded.por, created_at = datetime('now')`)
    .run(storeId, t, String(l.wa_id || ''), m.ok ? 1 : 0, m.nota, por);
  // Que nada automático lo vuelva a intentar.
  db.prepare("UPDATE leads SET no_contactar = 1, no_contactar_at = datetime('now'), seguimiento_nivel = 3 WHERE id = ?").run(leadId);
  registrarLog(storeId, 'warn', 'calidad', `Contacto ${l.nombre || numero} bloqueado por ${por}${m.ok ? ' (también en Meta)' : ''}.`, leadId);
  return { ok: true, enMeta: m.ok, nota: m.nota };
}

export async function desbloquearContacto(storeId: string, leadId: string): Promise<{ ok: true } | { error: string }> {
  const l = db.prepare('SELECT tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { tel: string; wa_id: string | null } | undefined;
  if (!l) return { error: 'Chat no encontrado.' };
  const t = diez(l.tel || l.wa_id || '');
  const fila = db.prepare('SELECT en_meta FROM contactos_bloqueados WHERE store_id = ? AND tel = ?').get(storeId, t) as { en_meta: number } | undefined;
  if (fila?.en_meta) await metaBloqueo(storeId, String(l.tel || l.wa_id || '').split('@')[0].replace(/\D/g, ''), false);
  db.prepare('DELETE FROM contactos_bloqueados WHERE store_id = ? AND tel = ?').run(storeId, t);
  db.prepare('UPDATE leads SET no_contactar = 0, no_contactar_at = NULL WHERE id = ?').run(leadId);
  return { ok: true };
}

export function estadoBloqueo(storeId: string, leadId: string): { bloqueado: boolean; enMeta: boolean; nota: string } {
  const l = db.prepare('SELECT tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { tel: string; wa_id: string | null } | undefined;
  const f = l ? db.prepare('SELECT en_meta, nota_meta FROM contactos_bloqueados WHERE store_id = ? AND tel = ?').get(storeId, diez(l.tel || l.wa_id || '')) as { en_meta: number; nota_meta: string } | undefined : undefined;
  return { bloqueado: !!f, enMeta: !!f?.en_meta, nota: f?.nota_meta || '' };
}

// ── Apps conectadas al número ───────────────────────────────────────────────

export interface AppConectada { id: string; nombre: string; enlace: string; esDealFlow: boolean }

/** Apps que reciben los mensajes de la cuenta de WhatsApp (suscritas a su webhook). */
export async function appsConectadas(storeId: string): Promise<{ apps: AppConectada[]; waba: string } | { error: string }> {
  const c = cfgWa(storeId);
  if (!c?.conectado || c.modo === 'qr') return { error: 'Conecta WhatsApp por la conexión oficial para ver las apps conectadas.' };
  if (!c.waba_id) return { error: 'No tenemos el id de tu cuenta de WhatsApp Business (WABA). Reconecta WhatsApp.' };
  try {
    const r = await fetch(`${GRAPH}/${c.waba_id}/subscribed_apps`, { headers: { Authorization: `Bearer ${c.access_token}` }, signal: AbortSignal.timeout(20000) });
    const body = (await r.json().catch(() => ({}))) as { data?: { whatsapp_business_api_data?: { id?: string; name?: string; link?: string } }[]; error?: { message?: string } };
    if (!r.ok) return { error: `Meta no respondió la lista (${r.status}): ${body.error?.message || ''}`.trim() };
    const nuestra = String(process.env.META_APP_ID || '');
    const apps = (body.data || []).map((d) => {
      const a = d.whatsapp_business_api_data || {};
      return { id: String(a.id || ''), nombre: String(a.name || 'App sin nombre'), enlace: String(a.link || ''), esDealFlow: !!nuestra && String(a.id) === nuestra };
    });
    return { apps, waba: c.waba_id };
  } catch { return { error: 'No pudimos conectar con Meta.' }; }
}
