/**
 * Estados del pedido = los estados REALES del envío (transportadora / Effi / Dropi).
 *
 *  Nuevo → Confirmado → Guía generada → En tránsito → En reparto → Entregado
 *  Aparte: Novedad (problema en la entrega), Devuelto y Cancelado.
 *
 * Con guía, el estado lo pone la sincronización automática (webhooks de Effi y
 * el ciclo de despachos). A mano solo se cambia desde el detalle del pedido.
 */
export const ESTADOS_PEDIDO = ['Nuevo', 'Confirmado', 'Guía generada', 'En tránsito', 'En reparto', 'Novedad', 'Entregado', 'Devuelto', 'Cancelado'] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];
export const FINALES = ['Entregado', 'Devuelto', 'Cancelado'];

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Traduce el texto del estado de la transportadora al estado del pedido (null = no se reconoce). */
export function estadoLogistico(texto: string, hayGuia: boolean): EstadoPedido | null {
  const e = norm(texto);
  if (e) {
    if (/devuelt|devoluc|retorn|regresad/.test(e)) return 'Devuelto';
    if (/cancelad|anulad|rechazad/.test(e)) return 'Cancelado';
    if (/novedad|no entregad|fallid|incidenc|reprogramad|siniestr|direccion errada|ausente|no reclamad/.test(e)) return 'Novedad';
    if (/entregad/.test(e)) return 'Entregado';
    if (/reparto|ruta de entrega|en distribucion|mensajero|ultima milla/.test(e)) return 'En reparto';
    if (/por recoger|pendiente (de|por) recog|sin recoger|en alistamiento/.test(e)) return 'Guía generada';
    if (/transito|despachad|en ruta|recogid|enviad|admitid|bodega|centro de|en camino|terminal|viajando|origen|destino/.test(e)) return 'En tránsito';
    if (/guia|generad|recoleccion|preparad|impres|creada/.test(e)) return 'Guía generada';
  }
  return hayGuia ? 'Guía generada' : null;
}

/**
 * Estado a guardar tras leer la guía (o null si no cambia). Los estados finales
 * no se tocan, y "Guía generada" (sin más información) nunca retrocede un envío
 * que ya va en camino.
 */
export function siguienteEstado(actual: string, nuevo: EstadoPedido | null): EstadoPedido | null {
  if (!nuevo || nuevo === actual) return null;
  if (FINALES.includes(actual)) return null;
  if (nuevo === 'Guía generada' && ['En tránsito', 'En reparto', 'Novedad'].includes(actual)) return null;
  return nuevo;
}
