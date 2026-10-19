/**
 * Idioma en que habla el asistente (se elige en Asistente → Personalidad):
 *  - 'es' español (por defecto) · 'en' inglés · 'auto' el idioma del cliente.
 * También traduce los mensajes FIJOS que manda el sistema (confirmación del
 * pedido, cambios de estado, aviso de guía…), que no pasan por la IA.
 */
import { db, pj } from './db.js';

export type Idioma = 'es' | 'en';
export type IdiomaCfg = Idioma | 'auto';

export function idiomaConfig(storeId: string): IdiomaCfg {
  const a = db.prepare('SELECT estilo FROM assistants WHERE store_id = ?').get(storeId) as { estilo: string } | undefined;
  const v = pj<{ idioma?: string }>(a?.estilo || '', {}).idioma;
  return v === 'en' || v === 'auto' ? v : 'es';
}

const EN = new Set(['the', 'you', 'i', 'my', 'want', 'how', 'much', 'price', 'hello', 'hi', 'hey', 'please', 'do', 'have', 'is', 'are', 'can', 'what', 'size', 'order', 'thanks', 'thank', 'yes', 'buy', 'shipping', 'color', 'available', 'need', 'would', 'like', 'this', 'that', 'and', 'for', 'with', 'it', 'me', 'your', 'good', 'morning', 'ok', 'okay', 'where', 'when']);
const ES = new Set(['el', 'la', 'de', 'que', 'quiero', 'hola', 'cuanto', 'cuánto', 'por', 'para', 'tienes', 'tiene', 'precio', 'talla', 'envio', 'envío', 'gracias', 'si', 'sí', 'buenas', 'buenos', 'dias', 'días', 'me', 'una', 'uno', 'como', 'cómo', 'donde', 'dónde', 'vale', 'valor', 'disponible', 'pedido', 'necesito', 'esta', 'está', 'es', 'en', 'y', 'con', 'mi', 'lo', 'los', 'las']);

/** ¿Este texto parece inglés? (conteo de palabras frecuentes de cada idioma). */
export function pareceIngles(texto: string): boolean {
  const pal = String(texto || '').toLowerCase().normalize('NFC').split(/[^a-záéíóúñ']+/).filter(Boolean);
  let en = 0; let es = 0;
  for (const p of pal) { if (EN.has(p)) en++; if (ES.has(p)) es++; }
  return en > es;
}

/** Idioma para un chat concreto: el fijo de la tienda o, en 'auto', el del cliente. */
export function idiomaDe(storeId: string, leadId?: string): Idioma {
  const cfg = idiomaConfig(storeId);
  if (cfg !== 'auto') return cfg;
  if (!leadId) return 'es';
  const rows = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'cliente' AND TRIM(COALESCE(texto,'')) != '' ORDER BY created_at DESC LIMIT 4").all(leadId) as { texto: string }[];
  return pareceIngles(rows.map((r) => r.texto).join(' ')) ? 'en' : 'es';
}

/** Instrucción para la IA según el idioma configurado. */
export function directivaIdioma(storeId: string): string {
  const cfg = idiomaConfig(storeId);
  if (cfg === 'en') return 'IDIOMA (obligatorio): responde SIEMPRE en inglés (English), natural y cercano, aunque el catálogo y estas instrucciones estén en español. Traduce al inglés los nombres de tallas/colores al hablar, pero en el marcador ##PEDIDO y ##MEDIA usa los nombres EXACTOS del catálogo. El resumen del pedido titúlalo "Order summary" con los campos Name, Phone, City, Department, Address, Product y Total.';
  if (cfg === 'auto') return 'IDIOMA: responde en el MISMO idioma en que te escribe el cliente (español o inglés). Si el cliente escribe en inglés, todo en inglés (el resumen del pedido se titula "Order summary" con los campos Name, Phone, City, Department, Address, Product y Total); en los marcadores ##PEDIDO y ##MEDIA usa siempre los nombres EXACTOS del catálogo.';
  return '';
}

// ── Mensajes fijos del sistema ─────────────────────────────────────────

export const MSG_ESTADO: Record<Idioma, Record<string, (n: number) => string>> = {
  es: {
    Confirmado: (n) => `✅ ¡Tu pedido #DF-${n} quedó confirmado! Ya lo estamos preparando para enviártelo. 📦`,
    'En tránsito': (n) => `🚚 ¡Tu pedido #DF-${n} va en camino! Pronto lo recibes. 🙌`,
    'En reparto': (n) => `🛵 ¡Tu pedido #DF-${n} salió a reparto! Hoy te lo entregan, ten el celular a mano. 📲`,
    Novedad: (n) => `⚠️ La transportadora reportó una novedad con tu pedido #DF-${n}. Escríbenos y te ayudamos a resolverla. 🙏`,
    Entregado: (n) => `🎉 Tu pedido #DF-${n} fue entregado. ¡Muchas gracias por tu compra! 💚`,
    Cancelado: (n) => `❌ Tu pedido #DF-${n} fue cancelado. Si fue un error o quieres retomarlo, escríbenos y con gusto te ayudamos. 🙏`,
  },
  en: {
    Confirmado: (n) => `✅ Your order #DF-${n} is confirmed! We're getting it ready to ship. 📦`,
    'En tránsito': (n) => `🚚 Your order #DF-${n} is on its way! You'll have it soon. 🙌`,
    'En reparto': (n) => `🛵 Your order #DF-${n} is out for delivery! Keep your phone handy. 📲`,
    Novedad: (n) => `⚠️ The carrier reported an issue with your order #DF-${n}. Message us and we'll help you sort it out. 🙏`,
    Entregado: (n) => `🎉 Your order #DF-${n} was delivered. Thank you so much for your purchase! 💚`,
    Cancelado: (n) => `❌ Your order #DF-${n} was cancelled. If it was a mistake or you'd like to pick it back up, just message us and we'll gladly help. 🙏`,
  },
};

export const confirmacionPedido = (idi: Idioma, nombre: string, producto: string) => idi === 'en'
  ? `Your order has been placed successfully 🎉\n\nYou'll get a confirmation message with your order number and shipping details shortly 📲\n\nThank you for your purchase, ${nombre}! Enjoy your ${producto} 🙌😊`
  : `Tu pedido ya quedó registrado exitosamente 🎉\n\nTe llegará un mensaje de confirmación con el número de pedido y los detalles del envío en un momento 📲\n\n¡Gracias por tu compra, ${nombre}! Que disfrutes mucho tus ${producto} 🙌😊`;

export const preguntaUnProducto = (idi: Idioma, nombre: string, producto: string) => idi === 'en'
  ? `Hi${nombre}! 😊 I'd be happy to give you all the details. Are you interested in our ${producto}?`
  : `¡Hola${nombre}! 😊 Con gusto te doy toda la información. ¿Te interesa nuestro ${producto}?`;

export const preguntaVariosProductos = (idi: Idioma, nombre: string, lista: string, hayMas: boolean) => idi === 'en'
  ? `Hi${nombre}! 😊 Sure! Which of these would you like information about?\n\n${lista}${hayMas ? '\n\nOr tell me which one you saw in the ad 🙂' : ''}`
  : `¡Hola${nombre}! 😊 ¡Claro! ¿Sobre cuál de estos quieres información?\n\n${lista}${hayMas ? '\n\nO dime cuál viste en el anuncio 🙂' : ''}`;

export function avisoGuia(idi: Idioma, o: { nombre: string; numDF: string; guia: string; transp: string; tienda: string; con: 'texto' | 'image' | 'document' }): string {
  const t = o.transp;
  if (idi === 'en') {
    if (o.con === 'texto') return `Hi ${o.nombre}! 📦 Your order ${o.numDF} is on its way${t ? ` with ${t}` : ''}.\n\n🧾 Tracking number: ${o.guia}\n\nYou can track your shipment with that number. Thanks for shopping at ${o.tienda}!`;
    return `Hi ${o.nombre}! 👋 Here's ${o.con === 'image' ? 'a picture of your shipping label' : 'your shipping label as a PDF'} so you have it handy.\n\n🚚 ${t || 'Carrier to be confirmed'} · Tracking ${o.guia}\n\nAny questions about your shipment, just message us here 💬`;
  }
  if (o.con === 'texto') return `¡Hola ${o.nombre}! 📦 Tu pedido ${o.numDF} ya va en camino${t ? ` con ${t}` : ''}.\n\n🧾 Número de guía: ${o.guia}\n\nCon ese número puedes rastrear tu envío. ¡Gracias por tu compra en ${o.tienda}!`;
  return `¡Hola ${o.nombre}! 👋 Te comparto ${o.con === 'image' ? 'la imagen de tu guía' : 'tu guía en PDF'} para que la tengas a mano.\n\n🚚 ${t || 'Transportadora por confirmar'} · Guía ${o.guia}\n\nCualquier duda con tu envío, escríbenos por aquí 💬`;
}

export function seguimientoRespaldo(idi: Idioma, nivel: number, nombre: string): string {
  const n = nombre ? ' ' + nombre.split(' ')[0] : '';
  if (idi === 'en') {
    if (nivel <= 1) return `Hi${n}! 😊 Still there? Let me know if you have any questions, I'm here to help.`;
    if (nivel === 2) return `Hi${n}! Just checking in — would you like me to help you complete your order? 🙌`;
    return `Hi${n}! Whenever you're ready, I'm here to help you finish your purchase 💬`;
  }
  return '';
}
