/**
 * Pase automático a una persona del equipo cuando el asistente NO puede responder
 * (la IA falló, Meta rechazó la respuesta, etc.). Así el chat no queda sin atender
 * ni el bot insiste a ciegas (lo que puede terminar en bloqueos o reportes de spam).
 */
import { db, registrarLog } from './db.js';

// OJO: no puede contener "asistente" ni "bot": así se reconoce un chat que atiende el bot.
export const ASIGNADO_EQUIPO = 'Equipo (requiere atención)';


/** Pasa el chat al equipo si lo atendía el asistente. Devuelve true si lo pasó. */
export function pasarAHumano(storeId: string, leadId: string, motivo: string): boolean {
  if (!storeId || !leadId) return false;
  const l = db.prepare('SELECT asignado, nombre FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { asignado: string; nombre: string } | undefined;
  if (!l || !/asistente|bot/i.test(l.asignado || '')) return false;
  db.prepare('UPDATE leads SET asignado = ? WHERE id = ?').run(ASIGNADO_EQUIPO, leadId);
  registrarLog(storeId, 'warn', 'humano', `Chat pasado al equipo automáticamente: ${motivo.slice(0, 300)} Atiéndelo desde el Inbox o devuélvelo al asistente cuando se resuelva.`, leadId);
  void import('./push.js').then((p) => p.enviarPush(storeId, 'contactos', 'Un chat necesita a una persona 🙋', `${l.nombre || 'Un cliente'}: el asistente no pudo responder.`, { url: '/' })).catch(() => {});
  return true;
}
