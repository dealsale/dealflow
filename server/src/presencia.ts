/**
 * Presencia del equipo en el Inbox: quién tiene abierto cada chat y quién está
 * escribiendo, para que dos colaboradores no le respondan lo mismo al cliente.
 * Vive en memoria (es efímera): cada pantalla abierta avisa cada pocos segundos.
 */
interface Marca { nombre: string; leadId: string; escribiendo: boolean; at: number }
const porTienda = new Map<string, Map<string, Marca>>(); // storeId → userId → marca
const VIGENCIA = 9000; // si una pantalla deja de avisar 9 s, ya no está

export interface Presente { nombre: string; escribiendo: boolean }

/** Registra dónde está el usuario y devuelve quién más está en cada chat de la tienda. */
export function marcarPresencia(storeId: string, userId: string, nombre: string, leadId: string, escribiendo: boolean): { aqui: Presente[]; chats: Record<string, Presente[]> } {
  let t = porTienda.get(storeId);
  if (!t) { t = new Map(); porTienda.set(storeId, t); }
  const ahora = Date.now();
  if (leadId) t.set(userId, { nombre: nombre || 'Alguien del equipo', leadId, escribiendo: !!escribiendo, at: ahora });
  else t.delete(userId);
  const chats: Record<string, Presente[]> = {};
  for (const [uid, m] of t) {
    if (ahora - m.at > VIGENCIA) { t.delete(uid); continue; }
    if (uid === userId) continue;
    (chats[m.leadId] ||= []).push({ nombre: m.nombre, escribiendo: m.escribiendo });
  }
  return { aqui: leadId ? chats[leadId] || [] : [], chats };
}
