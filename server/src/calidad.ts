/**
 * Protección de la calidad del número de WhatsApp.
 *
 * Meta baja la calidad (y luego limita o bloquea el número) cuando los clientes
 * bloquean o reportan los mensajes. Lo que más lo provoca: escribirle a quien
 * pidió que no, mensajes en frío a números que nunca escribieron, y muchos
 * mensajes no pedidos seguidos. Aquí:
 *  - "Baja": si el cliente pide que no le escriban, se le responde UNA vez con
 *    respeto y no se le vuelve a escribir por iniciativa nuestra (hasta que él
 *    vuelva a escribir).
 *  - Tope de mensajes PROACTIVOS (los que no responden a algo del cliente:
 *    recordatorios, cambios de estado, avisos): máximo 2 por cliente al día.
 *  - Celular de contacto distinto al del chat: solo si la tienda lo activa.
 */
import { db, pj, registrarLog } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS proactivos (
  store_id TEXT NOT NULL, tel TEXT NOT NULL, fecha TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, tel, fecha)
)`);

export const TOPE_DIARIO = 2;
const diez = (t: string) => String(t || '').replace(/\D/g, '').slice(-10);
const hoyCO = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// "Baja": frases claras de que no quiere más mensajes (no un simple "no").
const RE_BAJA = /^(baja|stop|parar|unsubscribe)$|\b(no me (vuelvan a |vuelvas a |sigan |sigas )?(escriban|escribas|escribir|contacten|contactes|llamen|manden|envien|mandes)|deje(n)? de (escribirme|escribir|enviarme|mandarme|molestar)|no (quiero|deseo) (recibir|mas mensajes|que me escriban)|no me interesa(n)? (mas|nada)|borr(a|en)me|sa(c|qu)(a|en|e)me de (la lista|sus listas|su lista|tu lista|tus listas)|es spam|voy a (reportar|denunciar|bloquear)|los voy a (reportar|denunciar|bloquear)|no autorice)\b/;
export const esBaja = (texto: string) => RE_BAJA.test(norm(texto));

export interface CalidadCfg { avisarContacto: boolean }
export function calidadCfg(storeId: string): CalidadCfg {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'calidad'").get(storeId) as { config: string } | undefined;
  const c = pj<Record<string, unknown>>(r?.config || '', {});
  return { avisarContacto: c.avisarContacto === true };
}
export function guardarCalidadCfg(storeId: string, parcial: Partial<CalidadCfg>): CalidadCfg {
  const nuevo = { ...calidadCfg(storeId), ...parcial };
  db.prepare("INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'calidad', ?, datetime('now')) ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at").run(storeId, JSON.stringify(nuevo));
  return nuevo;
}

/**
 * Al llegar un mensaje del cliente: si pide la baja, lo marca y devuelve el texto
 * de despedida a enviar (una sola vez). Si ya estaba de baja y escribe otra cosa,
 * se la quita (volvió a escribir por su cuenta). Devuelve null si no aplica.
 */
export function revisarBaja(storeId: string, leadId: string, texto: string): string | null {
  const l = db.prepare('SELECT no_contactar, nombre FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { no_contactar: number; nombre: string } | undefined;
  if (!l) return null;
  if (esBaja(texto)) {
    if (Number(l.no_contactar)) return ''; // ya estaba: no repetimos la despedida
    db.prepare("UPDATE leads SET no_contactar = 1, no_contactar_at = datetime('now'), seguimiento_nivel = 3 WHERE id = ?").run(leadId);
    registrarLog(storeId, 'warn', 'calidad', 'Un cliente pidió que no le escribamos más. DealFlow no le volverá a escribir por su cuenta (solo si él escribe primero).', leadId);
    const n = String(l.nombre || '').split(' ')[0];
    return `Entendido${n ? ', ' + n : ''} 🙏 No te escribiremos más. Si algún día necesitas algo, aquí estamos.`;
  }
  if (Number(l.no_contactar)) db.prepare('UPDATE leads SET no_contactar = 0, no_contactar_at = NULL WHERE id = ?').run(leadId);
  return null;
}

/** ¿Podemos escribirle por iniciativa nuestra? (no pidió la baja y no pasó el tope del día). */
export function puedeEscribirle(storeId: string, tel: string, leadId?: string | null): { ok: boolean; motivo: string } {
  const t = diez(tel);
  const lead = leadId
    ? db.prepare('SELECT no_contactar FROM leads WHERE id = ?').get(leadId) as { no_contactar: number } | undefined
    : t ? db.prepare("SELECT no_contactar FROM leads WHERE store_id = ? AND REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ? ORDER BY created_at DESC LIMIT 1").get(storeId, `%${t}`) as { no_contactar: number } | undefined : undefined;
  if (lead && Number(lead.no_contactar)) return { ok: false, motivo: 'el cliente pidió que no le escribamos' };
  if (!t) return { ok: true, motivo: '' };
  const n = (db.prepare('SELECT n FROM proactivos WHERE store_id = ? AND tel = ? AND fecha = ?').get(storeId, t, hoyCO()) as { n: number } | undefined)?.n || 0;
  if (n >= TOPE_DIARIO) return { ok: false, motivo: `ya le escribimos ${n} veces hoy sin que lo pidiera (tope para cuidar el número)` };
  return { ok: true, motivo: '' };
}

/** Cuenta un mensaje proactivo enviado. */
export function contarProactivo(storeId: string, tel: string): void {
  const t = diez(tel);
  if (!t) return;
  db.prepare('INSERT INTO proactivos (store_id, tel, fecha, n) VALUES (?,?,?,1) ON CONFLICT(store_id, tel, fecha) DO UPDATE SET n = n + 1').run(storeId, t, hoyCO());
  db.prepare("DELETE FROM proactivos WHERE fecha < date('now','-7 days')").run();
}

/** Para el panel: cuántos pidieron la baja y cuántos mensajes proactivos van en 7 días. */
export function resumenCalidad(storeId: string): { cfg: CalidadCfg; bajas: number; proactivos7d: number; tope: number } {
  const bajas = (db.prepare('SELECT COUNT(*) n FROM leads WHERE store_id = ? AND no_contactar = 1').get(storeId) as { n: number }).n;
  const proactivos7d = (db.prepare("SELECT COALESCE(SUM(n),0) n FROM proactivos WHERE store_id = ? AND fecha >= date('now','-7 days')").get(storeId) as { n: number }).n;
  return { cfg: calidadCfg(storeId), bajas, proactivos7d, tope: TOPE_DIARIO };
}

