import { pj } from './db.js';

/**
 * Varios mensajes iniciales por producto: el dueño arma 2, 3, 4… estructuras y
 * enciende las que quiera. Con UNA encendida se envía siempre esa; con varias
 * encendidas, el bot elige una AL AZAR en cada chat (para probar cuál vende más
 * y para que no todos los clientes reciban exactamente lo mismo).
 *
 * Se guardan en products.mensajes_iniciales. Productos viejos (sin la columna
 * llena) tienen un solo mensaje: el de products.mensaje_bloques.
 */
export interface Bloque { tipo: string; valor?: string; valores?: string[] }
export interface MensajeInicial { id: string; nombre: string; activo: boolean; bloques: Bloque[] }

export function mensajesDe(p: Record<string, unknown>): MensajeInicial[] {
  const lista = pj<MensajeInicial[]>(p.mensajes_iniciales as string, []);
  if (Array.isArray(lista) && lista.length) return lista;
  return [{ id: 'm1', nombre: 'Mensaje 1', activo: true, bloques: pj<Bloque[]>(p.mensaje_bloques as string, []) }];
}

/** Limpia lo que manda el panel (máx. 10 mensajes, al menos uno encendido). */
export function normalizarMensajes(entrada: unknown): MensajeInicial[] | null {
  if (!Array.isArray(entrada) || !entrada.length) return null;
  const lista = entrada.slice(0, 10).map((m, i) => {
    const o = (m || {}) as Record<string, unknown>;
    return {
      id: String(o.id || `m${i + 1}`).slice(0, 40),
      nombre: String(o.nombre || `Mensaje ${i + 1}`).trim().slice(0, 60) || `Mensaje ${i + 1}`,
      activo: o.activo !== false,
      bloques: Array.isArray(o.bloques) ? (o.bloques as Bloque[]) : [],
    };
  });
  if (!lista.some((m) => m.activo)) lista[0].activo = true;
  return lista;
}

/** El mensaje "principal" (primero encendido con contenido): lo usan la IA y la imagen de referencia. */
export function principal(lista: MensajeInicial[]): MensajeInicial {
  return lista.find((m) => m.activo && m.bloques.length) || lista.find((m) => m.activo) || lista[0];
}

/** El que se envía en este chat: uno al azar entre los encendidos que tienen contenido. */
export function elegirMensaje(p: Record<string, unknown>): MensajeInicial | null {
  const candidatos = mensajesDe(p).filter((m) => m.activo && m.bloques.length);
  if (!candidatos.length) return null;
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}
