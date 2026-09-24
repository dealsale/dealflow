/**
 * Tope de velocidad de envío por tienda (anti-baneo).
 *
 * WhatsApp desactiva cuentas cuando detecta ráfagas de mensajes (varios en el
 * mismo segundo) o volúmenes altos en poco tiempo: eso dispara reportes y
 * bloqueos de los clientes, y la calidad del PORTAFOLIO cae. Aquí serializamos
 * los envíos de cada tienda con un espacio mínimo entre uno y otro y un tope por
 * minuto, para que el bot "escriba como humano" y nunca dispare en ráfaga.
 *
 * Es en memoria y por proceso (un solo contenedor), suficiente para el caso.
 */

// Espacio mínimo entre dos envíos de la MISMA tienda (ms). Suaviza las ráfagas.
const MIN_GAP = Number(process.env.BOT_MIN_GAP_MS) || 900;
// Tope por minuto por tienda. Al superarlo, el envío espera su turno.
const MAX_PER_MIN = Number(process.env.BOT_MAX_PER_MIN) || 45;

interface EstadoTienda { proximo: number; sellos: number[] }
const porTienda = new Map<string, EstadoTienda>();

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Espera hasta que la tienda tenga permitido enviar el siguiente mensaje.
 * Reserva el turno de forma atómica (sin await entre leer y escribir) para que
 * varios envíos concurrentes se repartan en fila y no colisionen.
 */
export async function esperarTurno(storeId: string): Promise<void> {
  const ahora = Date.now();
  const st = porTienda.get(storeId) || { proximo: 0, sellos: [] };

  // 1) Espacio mínimo: el turno es, como muy pronto, MIN_GAP después del anterior.
  let turno = Math.max(ahora, st.proximo);

  // 2) Tope por minuto: si en los 60 s previos al turno ya hay MAX_PER_MIN envíos,
  //    empuja el turno hasta que el más viejo salga de la ventana.
  const recientes = st.sellos.filter((t) => t > turno - 60_000);
  if (recientes.length >= MAX_PER_MIN) {
    turno = Math.max(turno, recientes[recientes.length - MAX_PER_MIN] + 60_000);
  }

  recientes.push(turno);
  st.sellos = recientes.slice(-MAX_PER_MIN);
  st.proximo = turno + MIN_GAP;
  porTienda.set(storeId, st);

  const espera = turno - ahora;
  if (espera > 0) await dormir(espera);
}
