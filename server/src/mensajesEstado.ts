/**
 * Textos de cada estado del pedido para el CLIENTE, escritos para que cualquiera los entienda
 * (como si se lo explicaras a alguien de 12 años). Cada mensaje dice dos cosas:
 *   📍 dónde está el pedido ahora, y
 *   👉 qué sigue (y si el cliente tiene que hacer algo).
 * Se usan igual en el chat y en la plantilla `estado_envio_pedido` (variable {{4}}, una sola
 * línea: «Tu pedido DF-123 {{4}}.»), así el cliente lee lo mismo por los dos caminos.
 */
export type Idi = 'es' | 'en';
export interface DatosEstado { transp?: string; total?: string; pagado?: boolean; motivo?: string }

/** «dónde está» empieza con verbo (se lee después de «Tu pedido DF-123 …»). */
export function partesEstado(idi: Idi, estado: string, d: DatosEstado = {}): { donde: string; sigue: string } | null {
  const T = (d.transp || '').trim();
  const pagar = !d.pagado && d.total ? d.total : '';
  if (idi === 'en') {
    const t = T || 'the carrier';
    switch (estado) {
      case 'Confirmado': return { donde: 'is confirmed ✅', sigue: 'Now we will pack it and create the shipping label. We will send it to you here as soon as we have it' };
      case 'Guía generada': return { donde: 'is packed in our warehouse 📦 and already has a shipping label', sigue: `We are waiting for ${t} to pick it up. We will let you know when they do` };
      case 'En tránsito': return { donde: `was picked up by ${t} 🚚 and is on its way to your city`, sigue: 'This usually takes 2 to 5 business days. You don\'t need to do anything for now' };
      case 'En reparto': return { donde: 'is in your city and goes out today with the courier 🛵', sigue: `Keep your phone close, the courier may call you${pagar ? `, and have ${pagar} ready to pay when you receive it` : ''}` };
      case 'Novedad': return { donde: `could not be delivered ⚠️${d.motivo ? ` (${d.motivo})` : ''}`, sigue: 'Reply to this message and we will help you get it (they can bring it again)' };
      case 'Entregado': return { donde: 'was delivered 🎉', sigue: 'Thank you so much for your purchase! If something is wrong with the product, message us' };
      case 'Cancelado': return { donde: 'was cancelled ❌', sigue: 'If it was a mistake or you still want it, reply and we will pick it back up' };
      default: return null;
    }
  }
  switch (estado) {
    case 'Confirmado': return { donde: 'quedó confirmado ✅', sigue: 'Ahora lo vamos a empacar y a crear la guía de envío. Cuando la tengamos, te la mandamos por aquí' };
    case 'Guía generada': return { donde: 'ya está empacado en nuestra bodega 📦 y ya tiene guía de envío', sigue: `Estamos esperando que ${T || 'la transportadora'} pase a recogerlo. Cuando lo recoja, te avisamos` };
    case 'En tránsito': return { donde: `ya lo recogió ${T || 'la transportadora'} 🚚 y lo está llevando hacia tu ciudad`, sigue: 'Esto suele tardar de 2 a 5 días hábiles. Por ahora no tienes que hacer nada' };
    case 'En reparto': return { donde: 'ya llegó a tu ciudad y hoy sale con el mensajero para llevártelo 🛵', sigue: `Ten el celular cerca porque el mensajero te puede llamar${pagar ? `, y ten listos ${pagar} para pagar cuando lo recibas` : ''}` };
    case 'Novedad': return { donde: `no se pudo entregar ⚠️${d.motivo ? ` (${d.motivo})` : ''}`, sigue: 'Respóndenos este mensaje y te ayudamos a recibirlo (te lo pueden volver a llevar)' };
    case 'Entregado': return { donde: 'ya te fue entregado 🎉', sigue: '¡Muchas gracias por tu compra! Si tienes algún problema con el producto, escríbenos' };
    case 'Cancelado': return { donde: 'fue cancelado ❌', sigue: 'Si fue un error o lo quieres de nuevo, respóndenos y lo retomamos' };
    default: return null;
  }
}

/** Una sola línea para la plantilla: «Tu pedido DF-123 {{4}}.» (sin saltos de línea). */
export function fraseEstadoPlantilla(idi: Idi, estado: string, d: DatosEstado = {}): string {
  const p = partesEstado(idi, estado, d);
  if (!p) return idi === 'en' ? `changed its status: ${estado}` : `cambió de estado: ${estado}`;
  return `${p.donde}. ${p.sigue}`.replace(/\s+/g, ' ').trim();
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mensaje del chat (ventana de 24 h abierta): saludo, dónde está, qué sigue y la guía. */
export function textoEstadoChat(idi: Idi, estado: string, d: DatosEstado & { nombre: string; numDF: string; guia: string }, seguimiento = false): string {
  const p = partesEstado(idi, estado, d);
  const nombre = d.nombre ? ' ' + d.nombre : '';
  const guia = d.guia && !['Confirmado', 'Cancelado'].includes(estado)
    ? (idi === 'en' ? `\n\n🧾 Tracking number: ${d.guia}${d.transp ? ` (${d.transp})` : ''}` : `\n\n🧾 Número de guía: ${d.guia}${d.transp ? ` (${d.transp})` : ''}`)
    : '';
  if (!p) return idi === 'en' ? `Hi${nombre} 👋 Your order ${d.numDF}: ${estado}.${guia}` : `Hola${nombre} 👋 Tu pedido ${d.numDF}: ${estado}.${guia}`;
  if (idi === 'en') {
    const cab = seguimiento ? `Hi${nombre} 👋 Here is how your order ${d.numDF} is doing:` : `Hi${nombre} 👋 News about your order ${d.numDF}:`;
    return `${cab}\n\n📍 Your order ${p.donde}.\n👉 ${mayus(p.sigue)}.${guia}\n\nAny questions? Just reply here.`;
  }
  const cab = seguimiento ? `Hola${nombre} 👋 Te contamos cómo va tu pedido ${d.numDF}:` : `Hola${nombre} 👋 Tenemos noticias de tu pedido ${d.numDF}:`;
  return `${cab}\n\n📍 Tu pedido ${p.donde}.\n👉 ${mayus(p.sigue)}.${guia}\n\n¿Tienes una duda? Respóndenos por aquí.`;
}

/**
 * Mensaje de la GUÍA al chat. Antes decía «ya va en camino» apenas se creaba la guía, pero en
 * ese momento el pedido sigue en la bodega esperando a la transportadora: eso confundía.
 * Ahora dice dónde está de verdad según el estado del pedido.
 */
export function textoGuiaChat(idi: Idi, o: { nombre: string; numDF: string; guia: string; transp: string; tienda: string; con: 'texto' | 'image' | 'document'; estado?: string }): string {
  const T = o.transp;
  const enCamino = ['En tránsito', 'En reparto'].includes(o.estado || '');
  if (idi === 'en') {
    const intro = o.con === 'texto' ? `Hi ${o.nombre}! 👋 Your order ${o.numDF} has a shipping label now 🧾` : `Hi ${o.nombre}! 👋 Here is ${o.con === 'image' ? 'the picture of your shipping label' : 'your shipping label (PDF)'} for order ${o.numDF} 🧾`;
    const donde = enCamino ? `📍 ${T || 'The carrier'} already picked it up and it is on its way to your city.` : '📍 It is packed in our warehouse.';
    const sigue = enCamino ? '👉 We will let you know when it goes out for delivery.' : `👉 ${T || 'The carrier'} will come to pick it up. We will let you know when they do.`;
    return `${intro}\n\n${donde}\n${sigue}\n\n🔢 Tracking number: ${o.guia}${T ? ` (${T})` : ''}\nKeep it: with this number you can see where your order is.\n\nYou don't need to do anything for now 😊`;
  }
  const intro = o.con === 'texto' ? `¡Hola ${o.nombre}! 👋 Tu pedido ${o.numDF} ya tiene guía de envío 🧾` : `¡Hola ${o.nombre}! 👋 Aquí está ${o.con === 'image' ? 'la foto de tu guía' : 'tu guía en PDF'} del pedido ${o.numDF} 🧾`;
  const donde = enCamino ? `📍 ${T || 'La transportadora'} ya lo recogió y lo está llevando hacia tu ciudad.` : '📍 Tu pedido ya está empacado en nuestra bodega.';
  const sigue = enCamino ? '👉 Te avisamos cuando salga con el mensajero para tu casa.' : `👉 ${T || 'La transportadora'} va a pasar a recogerlo. Cuando lo recoja, te avisamos.`;
  return `${intro}\n\n${donde}\n${sigue}\n\n🔢 Número de guía: ${o.guia}${T ? ` (${T})` : ''}\nGuárdalo: con ese número puedes ver por dónde va tu pedido.\n\nPor ahora no tienes que hacer nada 😊`;
}
