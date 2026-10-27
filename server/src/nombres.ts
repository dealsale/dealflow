/**
 * Nombre REAL del cliente para el pedido (y la remisión/guía): el que el cliente escribe
 * en el chat, no el nombre de perfil de WhatsApp/Messenger (que muchas veces es un
 * apodo, un correo, un número o emojis).
 *
 * Orden: lo que el cliente dijo explícitamente ("me llamo…", "a nombre de…", "Nombre: …",
 * o su respuesta cuando el bot le pidió el nombre) → el nombre del resumen/marcador si es
 * válido → el nombre de perfil solo si parece un nombre de verdad.
 */
import { db } from './db.js';

const NO_NOMBRES = new Set(['cliente', 'whatsapp', 'usuario', 'user', 'hola', 'buenas', 'buenos', 'messenger', 'instagram', 'facebook', 'si', 'sí', 'no', 'ok', 'gracias', 'yo', 'contraentrega', 'efectivo']);

// Palabras que NUNCA van en un nombre de persona: si aparece alguna, no es un nombre sino
// una frase del chat ("Claro, cuántos días hábiles…", "Sí, listo", "Para mañana").
const NO_EN_NOMBRE = new Set(('claro cuantos cuantas cuanto cuanta dias dia habiles habil que como cuando donde cual cuales quien porque pues '
  + 'quiero quisiera necesito tengo tiene tienen tienes es son esta estan estoy estas era fue hay ser sera puede puedo pueden podria quiere quieren '
  + 'para por con sin mi mis me te se lo le les su sus tu tus un una unos unas al en ese esa eso este esto aqui alli ahi ya tambien pero entonces '
  + 'si no ok okay listo dale vale buena perfecto genial gracias hola buenas buenos tardes noches porfa favor confirmo confirmado confirmar '
  + 'envio envios enviar envian pedido pedidos precio precios talla tallas color colores producto productos pago pagar contraentrega contra entrega domicilio '
  + 'direccion cra cl barrio numero celular telefono whatsapp correo llega llegan demora tarda valor total oferta promo '
  + 'manana hoy ayer semana mes horas hora senor senora cliente usuario').split(' '));
const sinTilde = (w: string) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Quita emojis/símbolos y deja "Nombre Apellido" con mayúscula inicial. */
export function limpiarNombre(n: string): string {
  return String(n || '')
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5)
    .map((p) => (p.length > 1 ? p[0].toLocaleUpperCase('es') + p.slice(1).toLocaleLowerCase('es') : p.toLocaleUpperCase('es')))
    .join(' ');
}

/** ¿Parece un nombre de persona? (sin @, sin números, sin guiones bajos, 2–60 letras). */
export function nombreValido(n: string): boolean {
  const s = String(n || '').trim();
  if (!s || s.length > 60) return false;
  if (/[@_#?¿!/\\]|https?:|www\.|\d/.test(s)) return false;
  const letras = s.replace(/[^\p{L}]/gu, '');
  if (letras.length < 2) return false;
  const palabras = limpiarNombre(s).toLowerCase().split(' ').filter(Boolean);
  if (!palabras.length || palabras.length > 5) return false;
  if (palabras.every((p) => NO_NOMBRES.has(p))) return false;
  // Una frase del chat no es un nombre: ninguna palabra común ("claro", "cuántos", "sí"…).
  if (palabras.some((p) => NO_EN_NOMBRE.has(sinTilde(p)))) return false;
  // Al menos una palabra de 3+ letras ("Si L" no es un nombre).
  if (!palabras.some((p) => p.replace(/[^\p{L}]/gu, '').length >= 3)) return false;
  return true;
}

const PATRON = /(?:me llamo|mi nombre es|mi nombre completo es|a nombre de|nombre(?: completo)?\s*[:=-])\s*([\p{L}][\p{L} '.-]{1,58})/iu;

/** Nombre que el cliente dio en el chat (el más reciente). '' si no lo dijo. */
export function nombreDelChat(leadId: string): string {
  const msgs = db.prepare("SELECT de, texto FROM messages WHERE lead_id = ? AND texto != '' ORDER BY created_at DESC LIMIT 80").all(leadId) as { de: string; texto: string }[];
  // msgs va del más nuevo al más viejo.
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.de !== 'cliente') continue;
    // 1) Lo dijo con una frase o una etiqueta ("Nombre: Ana Pérez").
    for (const linea of m.texto.split(/\n/)) {
      const mm = linea.match(PATRON);
      if (mm) {
        const n = limpiarNombre(mm[1].split(/[,;.\n]| y mi | mi | cel| tel| direcci| ciudad/i)[0]);
        if (nombreValido(n)) return n;
      }
    }
    // 2) Respondió solo con su nombre justo después de que el bot se lo pidió.
    const anterior = msgs.slice(i + 1).find((x) => x.de !== 'cliente');
    if (anterior && /nombre/i.test(anterior.texto) && /\?/.test(anterior.texto)) {
      const primera = m.texto.split(/\n/)[0].trim();
      const n = limpiarNombre(primera);
      if (n.split(' ').length >= 2 && n.split(' ').length <= 5 && nombreValido(primera)) return n;
    }
  }
  return '';
}

/**
 * Elige el nombre del pedido. `propuesto` es el del marcador/resumen; `perfil` el de
 * WhatsApp/Messenger. Si el cliente dio su nombre en el chat, ese manda.
 */
export function resolverNombreCliente(leadId: string, propuesto: string, perfil: string): string {
  const delChat = leadId ? nombreDelChat(leadId) : '';
  if (delChat) return delChat;
  const p = limpiarNombre(propuesto);
  // El "propuesto" igual al nombre de perfil solo vale si de verdad parece un nombre.
  if (nombreValido(propuesto)) return p;
  if (nombreValido(perfil)) return limpiarNombre(perfil);
  return 'Cliente';
}
