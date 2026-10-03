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
// Conservador a propósito: Meta banea por PICOS (muchos en un minuto), no tanto
// por el total del día. ~3.5s de espacio + tope por minuto => nunca hay ráfaga.
const MIN_GAP = Number(process.env.BOT_MIN_GAP_MS) || 3500;
// Tope por minuto por tienda. Al superarlo, el envío espera su turno. Es el freno
// que de verdad evita el baneo: a 12/min un blast de remarketing se reparte en el
// tiempo en vez de dispararse de golpe (antes estaba en 45 = demasiado alto).
const MAX_PER_MIN = Number(process.env.BOT_MAX_PER_MIN) || 12;
// Espacio mínimo entre dos envíos al MISMO chat (ms). Es lo que de verdad evita
// las ráfagas que banean: nunca 5 fotos a la misma persona en un instante.
const MIN_GAP_CHAT = Number(process.env.BOT_MIN_GAP_CHAT_MS) || 3500;

interface EstadoTienda { proximo: number; sellos: number[]; ultimoFrenado: number }
const porTienda = new Map<string, EstadoTienda>();
const porChat = new Map<string, number>(); // clave storeId|destino -> próximo permitido

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Jitter: un pequeño aleatorio para que los envíos NO salgan a intervalos exactos
// (los patrones perfectamente regulares también le parecen "bot" a Meta).
const jitter = () => Math.floor(Math.random() * 1800);

/**
 * Salud de envío de una tienda (para el monitor anti-baneo del panel). Todo en
 * memoria: cuántos mensajes salieron en el último minuto, si está cerca del tope
 * y cuándo fue la última vez que el freno tuvo que retener un envío (señal de que
 * el bot está intentando disparar en ráfaga).
 */
export function estadisticasEnvio(storeId: string): { porMinuto: number; tope: number; cerca: boolean; ultimoFrenado: number } {
  const st = porTienda.get(storeId);
  const ahora = Date.now();
  const porMinuto = st ? st.sellos.filter((t) => t > ahora - 60_000).length : 0;
  return { porMinuto, tope: MAX_PER_MIN, cerca: porMinuto >= Math.ceil(MAX_PER_MIN * 0.8), ultimoFrenado: st?.ultimoFrenado || 0 };
}

/**
 * Espera hasta que la tienda (y el chat) tengan permitido el siguiente envío.
 * Reserva el turno de forma atómica (sin await entre leer y escribir) para que
 * varios envíos concurrentes se repartan en fila y no colisionen.
 *  - Tope por tienda: espacio mínimo + máximo por minuto (anti-flood global).
 *  - Tope por chat: espacio mínimo entre mensajes a la MISMA persona (anti-ráfaga).
 */
export async function esperarTurno(storeId: string, destino?: string): Promise<void> {
  const ahora = Date.now();
  const st = porTienda.get(storeId) || { proximo: 0, sellos: [], ultimoFrenado: 0 };

  // 1) Espacio mínimo por tienda (con jitter para no salir a intervalos exactos).
  let turno = Math.max(ahora, st.proximo);

  // 2) Tope por minuto por tienda.
  const recientes = st.sellos.filter((t) => t > turno - 60_000);
  if (recientes.length >= MAX_PER_MIN) {
    turno = Math.max(turno, recientes[recientes.length - MAX_PER_MIN] + 60_000);
  }

  // 3) Espacio mínimo por CHAT: nunca dos mensajes seguidos a la misma persona
  //    en menos de MIN_GAP_CHAT. Esto mata la ráfaga (varias fotos de golpe).
  const claveChat = destino ? `${storeId}|${destino}` : '';
  if (claveChat) {
    turno = Math.max(turno, porChat.get(claveChat) || 0);
  }

  recientes.push(turno);
  st.sellos = recientes.slice(-MAX_PER_MIN);
  st.proximo = turno + MIN_GAP + jitter();
  // Registra si este envío tuvo que ESPERAR bastante (el bot intentó disparar en
  // ráfaga y el freno lo retuvo): señal para el monitor anti-baneo.
  if (turno - ahora > MIN_GAP) st.ultimoFrenado = ahora;
  porTienda.set(storeId, st);
  if (claveChat) porChat.set(claveChat, turno + MIN_GAP_CHAT + jitter());

  const espera = turno - ahora;
  if (espera > 0) await dormir(espera);
}
