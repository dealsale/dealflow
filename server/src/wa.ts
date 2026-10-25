import { db, uid, registrarLog } from './db.js';
import { estaBloqueado } from './bloqueos.js';
import { mediaExt, audioAOgg } from './media.js';
import { guardarAdEnLead, refDesdeWhatsapp, type AdRef } from './campana.js';
import { esperarTurno } from './ratelimit.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';
try { db.exec("ALTER TABLE messages ADD COLUMN error TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
// Chats pasados al equipo con la etiqueta vieja: contenía "asistente" y el bot seguía
// creyendo que el chat era suyo (respondía igual). Se corrige al arrancar.
try { db.prepare("UPDATE leads SET asignado = 'Equipo (requiere atención)' WHERE asignado = 'Equipo (el asistente no pudo responder)'").run(); } catch { /* opcional */ }

/** Explicación en español de los códigos de error de entrega de WhatsApp Cloud API. */
export function explicarErrorMeta(code: number | string | undefined, titulo = '', detalle = ''): string {
  const c = Number(code);
  const base: Record<number, string> = {
    131047: 'Pasaron más de 24 h desde el último mensaje del cliente: solo se le pueden enviar plantillas aprobadas.',
    131026: 'WhatsApp no pudo entregarlo: el cliente bloqueó tu número, no tiene WhatsApp activo, usa una versión muy vieja o no ha aceptado los términos nuevos de WhatsApp.',
    131049: 'Meta frenó el mensaje para cuidar la experiencia del cliente (recibió demasiados mensajes de empresas). Intenta más tarde.',
    131050: 'El cliente pidió no recibir mensajes de marketing de tu número.',
    131056: 'Demasiados mensajes seguidos al mismo cliente. Espera un momento antes de escribirle otra vez.',
    131048: 'Meta limitó tu número porque varios mensajes fueron marcados como spam. Baja el ritmo de mensajes.',
    130429: 'Se superó el límite de velocidad de envío de tu número. Espera unos minutos.',
    130472: 'Meta no lo entregó: el cliente está en un experimento de Meta que limita mensajes de marketing.',
    131031: 'La cuenta de WhatsApp Business está bloqueada o restringida por Meta.',
    131042: 'Meta no pudo cobrar este mensaje: hay un problema con el método de pago de tu cuenta de WhatsApp Business (business.facebook.com → Cuentas de WhatsApp → Configuración de pago). Las respuestas gratis dentro de 24 h sí salen.',
    131051: 'Tipo de mensaje no soportado por WhatsApp.',
    131052: 'No se pudo descargar el archivo que envió el cliente.',
    131053: 'No se pudo subir el archivo (formato o tamaño no válido).',
    131021: 'El número de destino es el mismo número de la tienda.',
    131000: 'Error interno de WhatsApp. Reintenta en unos minutos.',
    131005: 'Permisos insuficientes del token de WhatsApp.',
    131008: 'Faltó un dato obligatorio en el mensaje.',
    131009: 'Algún dato del mensaje no es válido.',
    132000: 'La plantilla no coincide con sus variables.',
    132001: 'La plantilla no existe o no está aprobada en ese idioma.',
    132015: 'La plantilla está pausada por baja calidad.',
    132016: 'La plantilla fue desactivada por baja calidad.',
    368: 'Tu número está restringido temporalmente por incumplir políticas de WhatsApp.',
    100: 'Meta rechazó algún dato del mensaje (número o contenido no válido).',
    190: 'El token de WhatsApp venció o no es válido: reconecta WhatsApp.',
    470: 'Pasaron más de 24 h desde el último mensaje del cliente: solo se le pueden enviar plantillas aprobadas.',
  };
  const txt = base[c] || [titulo, detalle].filter(Boolean).join(': ') || 'Meta no entregó el mensaje.';
  return c ? `${txt} (código ${c})` : txt;
}

const alertaPago = new Map<string, number>(); // storeId → último aviso de problema de pago en Meta
/** Guarda el motivo del fallo en el mensaje, lo deja en el registro del chat y, si era del bot, pasa el chat al equipo. */
function registrarFallo(rowId: string, error: string): void {
  try {
    const m = db.prepare('SELECT m.de, m.lead_id, l.store_id FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.id = ?').get(rowId) as { de: string; lead_id: string; store_id: string } | undefined;
    db.prepare('UPDATE messages SET error = ? WHERE id = ?').run(error.slice(0, 500), rowId);
    if (!m) return;
    registrarLog(m.store_id, 'error', 'envio', `No se entregó el mensaje: ${error}`, m.lead_id);
    // Problema de pago en Meta (131042): afecta a toda la tienda → alerta general y al celular (1 vez cada 6 h).
    if (/131042/.test(error) && Date.now() - (alertaPago.get(m.store_id) || 0) > 6 * 3600e3) {
      alertaPago.set(m.store_id, Date.now());
      registrarLog(m.store_id, 'error', 'meta', 'Meta no está entregando los mensajes que cobra (plantillas y mensajes fuera de la ventana gratis): hay un problema con el método de pago de tu cuenta de WhatsApp Business. Arréglalo en business.facebook.com → Cuentas de WhatsApp → Configuración de pago. Las respuestas gratis (dentro de 24 h) siguen saliendo.');
      void import('./push.js').then((p) => p.enviarPush(m.store_id, 'contactos', '⚠️ WhatsApp: problema de pago en Meta', 'Algunos mensajes no se están entregando. Revisa el método de pago de tu cuenta de WhatsApp Business.', { url: '/' })).catch(() => {});
      void import('./correo.js').then((c) => c.correoATienda(m.store_id, 'alertas', 'WhatsApp: problema de pago en Meta', '⚠️ Meta pide revisar el método de pago', ['Meta no está entregando los mensajes que cobra (plantillas y mensajes fuera de la ventana de 24 h) por un problema con el <b>método de pago</b> de tu cuenta de WhatsApp Business.', 'Arréglalo en <b>business.facebook.com → Cuentas de WhatsApp → Configuración de pago</b>. Las respuestas dentro de las 24 h siguen saliendo.'], { texto: 'Abrir Meta Business', url: 'https://business.facebook.com/' })).catch(() => {});
    }
    if (m.de === 'bot' && !/bloqueaste|bloqueado/i.test(error)) {
      void import('./pasoHumano.js').then((h) => h.pasarAHumano(m.store_id, m.lead_id, `WhatsApp no entregó la respuesta del asistente (${error})`)).catch(() => {});
    }
  } catch { /* nunca tumbar el flujo */ }
}

interface MediaInfo {
  tipo: string;
  url: string;
  mime: string;
  nombre: string;
}

export function ensureLead(storeId: string, waId: string, nombre: string, tel?: string): { id: string; nuevo: boolean } {
  const numPart = String(waId || '').split('@')[0];
  const telMostrar = tel || '+' + numPart; // número legible para el CRM (el @lid no sirve de teléfono)
  // Se busca por la dirección completa, por el número pelado (chats viejos) y
  // por teléfono (el mismo contacto puede llegar hoy como @lid y ayer como número).
  let lead = db.prepare("SELECT id FROM leads WHERE store_id = ? AND (wa_id = ? OR wa_id = ? OR (? != '' AND tel = ?))")
    .get(storeId, waId, numPart, tel || '', tel || '') as { id: string } | undefined;
  if (lead) {
    // Actualiza a la dirección con la que llegó el mensaje, PERO nunca degrada
    // un @lid (la dirección real del chat con privacidad LID, a la que sí se
    // entregan las respuestas) a un número normal @s.whatsapp.net.
    db.prepare("UPDATE leads SET wa_id = ? WHERE id = ? AND NOT (wa_id LIKE '%@lid' AND ? NOT LIKE '%@lid')").run(waId, lead.id, waId);
    if (tel) db.prepare("UPDATE leads SET tel = ? WHERE id = ? AND (tel = '' OR tel LIKE '+%@%' OR tel = ?)").run(tel, lead.id, '+' + numPart);
  }
  let nuevo = false;
  if (!lead) {
    const id = uid();
    db.prepare('INSERT INTO leads (id, store_id, nombre, tel, etapa, asignado, wa_id) VALUES (?,?,?,?,?,?,?)').run(
      id, storeId, nombre || telMostrar, telMostrar, 'Explorando', 'Asistente (bot)', waId,
    );
    lead = { id };
    nuevo = true;
  } else if (nombre) {
    db.prepare('UPDATE leads SET nombre = ? WHERE id = ? AND (nombre = ? OR nombre = ?)').run(nombre, lead.id, '+' + numPart, waId);
  }
  return { id: lead.id, nuevo };
}

/**
 * Guarda un mensaje entrante (texto y/o adjunto). Crea el lead si no existe.
 * La usan tanto el webhook de la Cloud API como la sesión por QR.
 */
export function saveIncomingMessage(storeId: string, waId: string, nombre: string, texto: string, media?: MediaInfo, tel?: string, ad?: AdRef | null, wamid?: string, cita?: string | { wamid: string; texto: string; deCliente: boolean }) {
  // Cloud API manda solo el wamid citado; la sesión QR manda además una copia del texto.
  const citaWamid = typeof cita === 'string' ? cita : cita?.wamid;
  const citaCopia = typeof cita === 'string' ? undefined : cita;
  const { id: leadId, nuevo } = ensureLead(storeId, waId, nombre, tel);
  // Respuesta citada: si el cliente respondió CITANDO un mensaje, buscamos el mensaje
  // original por su wamid y guardamos una instantánea (texto + de quién) para mostrarla.
  let citaTexto = ''; let citaDe = '';
  if (citaWamid) {
    try {
      const orig = db.prepare("SELECT de, texto, tipo FROM messages WHERE wa_msg_id = ? LIMIT 1").get(citaWamid) as { de: string; texto: string; tipo: string } | undefined;
      if (orig) { citaDe = orig.de; citaTexto = (orig.texto || '').trim() || (orig.tipo && orig.tipo !== 'texto' ? `[${orig.tipo}]` : ''); }
      else if (citaCopia?.texto) { citaDe = citaCopia.deCliente ? 'cliente' : 'bot'; citaTexto = citaCopia.texto; }
      else { citaDe = 'cliente'; citaTexto = 'Mensaje anterior'; } // el original no está en la BD (muy viejo)
    } catch { /* la cita nunca debe tumbar el guardado */ }
  }
  // El mensaje del cliente se guarda SIEMPRE primero: ninguna falla de atribución
  // de anuncio puede hacer que se pierda un mensaje entrante (crítico para leads de
  // anuncio, cuyo primer mensaje trae el `referral`).
  db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre, wa_msg_id, cita_texto, cita_de) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    uid(), leadId, 'cliente', texto, media?.tipo || 'texto', media?.url || null, media?.mime || null, media?.nombre || null, wamid || null, citaTexto, citaDe,
  );
  // Atribución de campaña: si el mensaje entró por un anuncio, lo guardamos en el
  // lead. Protegido para no tumbar nunca el guardado del mensaje.
  if (ad) { try { guardarAdEnLead(leadId, ad); } catch (e) { console.error('[webhook] no se pudo guardar atribución de anuncio (el mensaje sí se guardó):', e); } }
  // El cliente respondió: reinicia el contador de recordatorios de seguimiento.
  db.prepare('UPDATE leads SET seguimiento_nivel = 0 WHERE id = ?').run(leadId);
  // Contacto NUEVO: notifica al dueño por Web Push (si lo tiene activado).
  if (nuevo) {
    const quien = (nombre || '').trim().split(' ')[0] || 'Un cliente';
    void import('./push.js').then((p) => p.enviarPush(storeId, 'contactos', 'Nuevo contacto 👋', `${quien} le escribió a tu tienda.`, { url: '/' })).catch(() => {});
  }
  // Responde el asistente de IA (nunca a un contacto bloqueado).
  if (estaBloqueado(storeId, waId, tel)) return leadId;
  void (async () => {
    try {
      // ¿Es la respuesta Sí/No a la confirmación de un pedido de Shopify? Entonces no contesta el bot.
      try {
        const sp = await import('./shopifyPedidos.js');
        if (await sp.respuestaConfirmacion(storeId, leadId, texto)) return;
      } catch (e) { console.error('[shopify] respuesta de confirmación', e); }
      const a = await import('./ai.js');
      await a.maybeAutoReply(storeId, leadId);
    } catch (e) { console.error('[ia] error procesando entrante', e); }
  })();
  return leadId;
}

/** Valida las credenciales contra la API de Meta y devuelve el número mostrado. */
export async function verifyWhatsappCredentials(phoneNumberId: string, accessToken: string): Promise<{ ok: true; numero: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await res.json()) as { display_phone_number?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: body.error?.message || 'Meta rechazó las credenciales. Revisa el Phone Number ID y el token.' };
    return { ok: true, numero: body.display_phone_number || '' };
  } catch {
    return { ok: false, error: 'No pudimos hablar con Meta. Revisa la conexión del servidor e intenta de nuevo.' };
  }
}

/** Envía un mensaje de texto por la vía activa de la tienda (Cloud API o QR). */
/**
 * ANTI-BANEO — ventana de 24 h de WhatsApp.
 * Fuera de las 24 h desde el ÚLTIMO mensaje del cliente, Meta solo permite
 * PLANTILLAS aprobadas; el texto/imagen libre es infracción y dispara baneos.
 * Devuelve true si la ventana está abierta (el cliente escribió hace < 24 h).
 * Solo aplica a WhatsApp (no web ni Messenger/Instagram).
 */
function ventana24hAbierta(storeId: string, to: string, pn?: string): boolean {
  const waId = String(to);
  const num = (pn || to).replace(/[^0-9]/g, '');
  const numPart = waId.split('@')[0];
  const lead = db.prepare(
    "SELECT id FROM leads WHERE store_id = ? AND (wa_id = ? OR wa_id = ? OR replace(replace(replace(tel,' ',''),'+',''),'-','') LIKE ?) ORDER BY created_at DESC LIMIT 1",
  ).get(storeId, waId, numPart, '%' + num.slice(-10)) as { id: string } | undefined;
  if (!lead) return false; // sin lead conocido: por seguridad, tratamos la ventana como cerrada
  const row = db.prepare("SELECT created_at FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 1").get(lead.id) as { created_at: string } | undefined;
  if (!row) return false; // el cliente nunca escribió
  const t = Date.parse(String(row.created_at).replace(' ', 'T') + 'Z');
  return !isNaN(t) && Date.now() - t < 24 * 3600 * 1000;
}

/**
 * Ventana de 24 h de un chat (para bloquear la caja de escribir en el Inbox):
 * aplica a WhatsApp; `cierra` es cuándo vence (último mensaje del cliente + 24 h).
 */
export function ventanaDeLead(storeId: string, leadId: string): { aplica: boolean; abierta: boolean; cierra: string | null } {
  if (process.env.WA_BLOQUEO_24H === 'off') return { aplica: false, abierta: true, cierra: null };
  const l = db.prepare('SELECT canal, wa_id, tel FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { canal: string; wa_id: string; tel: string } | undefined;
  if (!l || (l.canal && l.canal !== 'whatsapp') || String(l.wa_id || l.tel).startsWith('web:')) return { aplica: false, abierta: true, cierra: null };
  const row = db.prepare("SELECT created_at FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 1").get(leadId) as { created_at: string } | undefined;
  const t = row ? Date.parse(String(row.created_at).replace(' ', 'T') + 'Z') : NaN;
  const cierra = isNaN(t) ? null : new Date(t + 24 * 3600e3).toISOString();
  return { aplica: true, abierta: !!cierra && Date.parse(cierra) > Date.now(), cierra };
}
export const MSG_VENTANA_CERRADA = 'Este chat tiene más de 24 h sin mensajes del cliente: WhatsApp no deja escribirle texto libre. Solo puedes enviarle una plantilla aprobada (botón ⚡).';

const CONTACTO_BLOQUEADO = 'Este contacto está bloqueado en tu tienda: DealFlow no le envía mensajes. Desbloquéalo desde el chat si quieres volver a escribirle.';

/** Mensaje de error estándar cuando se bloquea un envío por ventana cerrada. */
const BLOQUEO_VENTANA = 'Fuera de la ventana de 24 h de WhatsApp: a este cliente (escribió hace más de 24 h) solo se le pueden enviar plantillas aprobadas, no texto libre.';

// ── Anti-repetidos ──
// Meta toma como spam el mismo mensaje varias veces seguidas al mismo número. Si el
// MISMO contenido va al MISMO contacto dentro de la ventana (doble clic, dos procesos a la
// vez, un reintento), el segundo no se envía. Se marca al revisar, así dos envíos
// simultáneos tampoco pasan los dos.
const recientes = new Map<string, number>();
function huella(texto: string): string {
  let h = 0;
  const t = String(texto || '').trim().toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return `${t.length}:${h}`;
}
export function esRepetido(storeId: string, to: string, pn: string | undefined, contenido: string, ventanaMs = 90_000): boolean {
  if (!String(contenido || '').trim()) return false;
  const k = `${storeId}|${String(pn || to).replace(/[^0-9a-z:]/gi, '').slice(-24)}|${huella(contenido)}`;
  const ahora = Date.now();
  if (recientes.size > 5000) for (const [x, t] of recientes) if (ahora - t > 15 * 60_000) recientes.delete(x);
  const prev = recientes.get(k);
  if (prev && ahora - prev < ventanaMs) return true;
  recientes.set(k, ahora);
  return false;
}
/** Para desmarcar cuando el envío falló (así un reintento real sí sale). */
function olvidarEnvio(storeId: string, to: string, pn: string | undefined, contenido: string) {
  recientes.delete(`${storeId}|${String(pn || to).replace(/[^0-9a-z:]/gi, '').slice(-24)}|${huella(contenido)}`);
}

export async function sendWhatsappText(storeId: string, to: string, texto: string, pn?: string, esPlantilla = false): Promise<{ ok: boolean; error?: string; wamid?: string; bloqueadoVentana?: boolean; repetido?: boolean }> {
  if (!String(to).startsWith('web:') && esRepetido(storeId, to, pn, texto)) {
    console.warn(`[wa] mensaje repetido a ${to} en menos de 90 s: no se envía`);
    return { ok: true, repetido: true };
  }
  const r = await enviarTextoReal(storeId, to, texto, pn, esPlantilla);
  if (!r.ok) olvidarEnvio(storeId, to, pn, texto);
  return r;
}

async function enviarTextoReal(storeId: string, to: string, texto: string, pn?: string, esPlantilla = false): Promise<{ ok: boolean; error?: string; wamid?: string; bloqueadoVentana?: boolean }> {
  // Canal WEB: el mensaje ya queda guardado en la BD y el chat web lo lee por
  // polling; no hay nada que "enviar" fuera.
  if (String(to).startsWith('web:') || String(pn || '').startsWith('web:')) return { ok: true };
  // Contacto bloqueado por la tienda: nunca se le envía nada.
  if (estaBloqueado(storeId, to, pn)) return { ok: false, error: CONTACTO_BLOQUEADO };
  // Anti-baneo: espera el turno de esta tienda (nunca ráfagas de mensajes).
  await esperarTurno(storeId, to);
  // Canales de Meta (Messenger / Instagram DM): se envían por la Graph API.
  if (String(to).startsWith('fb:') || String(to).startsWith('ig:')) {
    const { sendMetaText } = await import('./meta.js');
    return sendMetaText(storeId, to, texto);
  }
  const cfg = db.prepare('SELECT phone_number_id, access_token, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { phone_number_id: string; access_token: string; conectado: number; modo: string }
    | undefined;
  if (!cfg?.conectado) {
    registrarLog(storeId, 'error', 'envio', `No se envió el mensaje a ${to}: WhatsApp no está conectado.`);
    return { ok: false, error: 'WhatsApp no está conectado.' };
  }
  // Anti-baneo: bloqueo duro de la ventana de 24 h (desactivable con WA_BLOQUEO_24H=off).
  if (process.env.WA_BLOQUEO_24H !== 'off' && !esPlantilla && !ventana24hAbierta(storeId, to, pn)) {
    registrarLog(storeId, 'warn', 'envio', `Bloqueado por ventana de 24 h: no se envió texto libre a ${to} (el cliente no escribe hace más de 24 h). Usa una plantilla aprobada.`);
    return { ok: false, error: BLOQUEO_VENTANA, bloqueadoVentana: true };
  }
  if (cfg.modo === 'qr') {
    const { sendViaQr } = await import('./waqr.js');
    return sendViaQr(storeId, to, texto, pn);
  }
  try {
    const numero = (pn || to).replace(/[^0-9]/g, '');
    const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texto } }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } };
    if (!res.ok) {
      const msg = body.error?.code ? explicarErrorMeta(body.error.code, body.error.message, body.error.error_data?.details) : body.error?.message || 'Meta no aceptó el mensaje.';
      registrarLog(storeId, 'error', 'envio', `Meta rechazó el mensaje a ${to}: ${msg}`);
      return { ok: false, error: msg };
    }
    return { ok: true, wamid: body.messages?.[0]?.id };
  } catch {
    registrarLog(storeId, 'error', 'envio', `No pudimos conectar con Meta para enviar a ${to}.`);
    return { ok: false, error: 'No pudimos hablar con Meta.' };
  }
}

/**
 * Envía una PLANTILLA aprobada por la Cloud API. Las plantillas SÍ se pueden
 * enviar fuera de la ventana de 24 h (para eso existen). Solo por la API oficial
 * (el canal QR no maneja plantillas de Meta). Pasa por el tope de velocidad.
 */
export async function sendWhatsappTemplate(
  storeId: string, to: string, plantilla: { nombre: string; idioma: string; encabezado?: string; cuerpo?: string },
  params: string[] = [], pn?: string,
): Promise<{ ok: boolean; error?: string; wamid?: string; textoRender?: string; repetido?: boolean }> {
  if (estaBloqueado(storeId, to, pn)) return { ok: false, error: CONTACTO_BLOQUEADO };
  // La misma plantilla con los mismos datos al mismo contacto: una sola vez cada 10 min.
  const firmaPl = `plantilla:${plantilla.nombre}:${params.join('|')}`;
  if (esRepetido(storeId, to, pn, firmaPl, 10 * 60_000)) {
    console.warn(`[wa] plantilla ${plantilla.nombre} repetida a ${to}: no se envía`);
    return { ok: true, repetido: true };
  }
  const r = await enviarPlantillaReal(storeId, to, plantilla, params, pn);
  if (!r.ok) olvidarEnvio(storeId, to, pn, firmaPl);
  return r;
}

async function enviarPlantillaReal(
  storeId: string, to: string, plantilla: { nombre: string; idioma: string; encabezado?: string; cuerpo?: string },
  params: string[] = [], pn?: string,
): Promise<{ ok: boolean; error?: string; wamid?: string; textoRender?: string }> {
  await esperarTurno(storeId, to);
  const cfg = db.prepare('SELECT phone_number_id, access_token, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { phone_number_id: string; access_token: string; conectado: number; modo: string } | undefined;
  if (!cfg?.conectado) return { ok: false, error: 'WhatsApp no está conectado.' };
  if (cfg.modo === 'qr') return { ok: false, error: 'Las plantillas de Meta solo se envían por la conexión oficial de WhatsApp (no por QR).' };
  // Texto renderizado (para guardarlo en el chat): reemplaza {{n}} por el parámetro.
  const textoRender = String(plantilla.cuerpo || '').replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? `{{${n}}}`);
  const components: Record<string, unknown>[] = [];
  if (params.length) components.push({ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) });
  try {
    const numero = (pn || to).replace(/[^0-9]/g, '');
    const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: numero, type: 'template',
        template: { name: plantilla.nombre, language: { code: plantilla.idioma || 'es' }, ...(components.length ? { components } : {}) },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok) {
      const msg = body.error?.message || 'Meta no aceptó la plantilla.';
      registrarLog(storeId, 'error', 'envio', `Meta rechazó la plantilla "${plantilla.nombre}" a ${to}: ${msg}`);
      return { ok: false, error: msg };
    }
    return { ok: true, wamid: body.messages?.[0]?.id, textoRender };
  } catch {
    registrarLog(storeId, 'error', 'envio', `No pudimos conectar con Meta para enviar la plantilla a ${to}.`);
    return { ok: false, error: 'No pudimos hablar con Meta.' };
  }
}

/** Sube un adjunto a Meta y lo envía por su media ID (Cloud API). */
async function cloudSendMedia(
  phoneId: string,
  token: string,
  numero: string,
  media: { buffer: Buffer; mime: string; tipo: string },
  caption: string,
  nombre: string,
): Promise<{ ok: boolean; error?: string; wamid?: string }> {
  try {
    // 1) Subir el archivo y obtener su media ID.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', media.mime);
    form.append('file', new Blob([new Uint8Array(media.buffer)], { type: media.mime }), nombre || 'archivo.' + mediaExt(media.tipo, media.mime));
    const up = await fetch(`${GRAPH}/${phoneId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const upj = (await up.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!up.ok || !upj.id) return { ok: false, error: upj.error?.message || 'Meta no aceptó el archivo.' };

    // 2) Enviar el mensaje que referencia ese media ID.
    const tw = media.tipo === 'image' ? 'image' : media.tipo === 'video' ? 'video' : media.tipo === 'audio' ? 'audio' : 'document';
    const obj: Record<string, string> = { id: upj.id };
    if (caption && tw !== 'audio') obj.caption = caption;
    if (tw === 'document' && nombre) obj.filename = nombre;
    const send = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: tw, [tw]: obj }),
    });
    const b = (await send.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!send.ok) return { ok: false, error: b.error?.message || 'Meta no aceptó el envío del adjunto.' };
    return { ok: true, wamid: b.messages?.[0]?.id };
  } catch {
    return { ok: false, error: 'No pudimos hablar con Meta para enviar el adjunto.' };
  }
}

/** Envía un adjunto por la vía activa (QR ya soporta; Cloud API enviará el texto). */
export async function sendWhatsappMedia(
  storeId: string,
  to: string,
  media: { buffer: Buffer; mime: string; tipo: string },
  caption: string,
  nombre: string,
  pn?: string,
  esPlantilla = false,
): Promise<{ ok: boolean; error?: string; wamid?: string; bloqueadoVentana?: boolean; repetido?: boolean }> {
  // Canal WEB: la multimedia ya queda en la BD (media_url) y el chat web la muestra.
  if (String(to).startsWith('web:') || String(pn || '').startsWith('web:')) return { ok: true };
  // El mismo archivo (mismo tamaño, tipo y nombre) al mismo contacto: una vez cada 90 s.
  const firmaMedia = `media:${media.mime}:${media.buffer.length}:${nombre}:${caption}`;
  if (esRepetido(storeId, to, pn, firmaMedia)) {
    console.warn(`[wa] archivo repetido a ${to}: no se envía`);
    return { ok: true, repetido: true };
  }
  const r = await enviarMediaReal(storeId, to, media, caption, nombre, pn, esPlantilla);
  if (!r.ok) olvidarEnvio(storeId, to, pn, firmaMedia);
  return r;
}

async function enviarMediaReal(
  storeId: string,
  to: string,
  media: { buffer: Buffer; mime: string; tipo: string },
  caption: string,
  nombre: string,
  pn?: string,
  esPlantilla = false,
): Promise<{ ok: boolean; error?: string; wamid?: string; bloqueadoVentana?: boolean }> {
  // Canales de Meta (Messenger / Instagram DM): tienen su propia ventana; no aplica el bloqueo de WhatsApp.
  const esMeta = String(to).startsWith('fb:') || String(to).startsWith('ig:');
  if (!esMeta && estaBloqueado(storeId, to, pn)) return { ok: false, error: CONTACTO_BLOQUEADO };
  // Anti-baneo: espera el turno de esta tienda (nunca ráfagas de mensajes).
  await esperarTurno(storeId, to);
  const cfg = db.prepare('SELECT phone_number_id, access_token, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { phone_number_id: string; access_token: string; conectado: number; modo: string }
    | undefined;
  if (!cfg?.conectado) {
    registrarLog(storeId, 'error', 'envio', `No se envió el adjunto a ${to}: WhatsApp no está conectado.`);
    return { ok: false, error: 'WhatsApp no está conectado.' };
  }
  // Anti-baneo: bloqueo duro de la ventana de 24 h (desactivable con WA_BLOQUEO_24H=off).
  if (!esMeta && process.env.WA_BLOQUEO_24H !== 'off' && !esPlantilla && !ventana24hAbierta(storeId, to, pn)) {
    registrarLog(storeId, 'warn', 'envio', `Bloqueado por ventana de 24 h: no se envió adjunto a ${to} (el cliente no escribe hace más de 24 h). Usa una plantilla aprobada.`);
    return { ok: false, error: BLOQUEO_VENTANA, bloqueadoVentana: true };
  }
  // Nota de voz: los navegadores graban en webm; WhatsApp la quiere en ogg/opus.
  if (media.tipo === 'audio' && !media.mime.includes('ogg')) {
    const ogg = audioAOgg(media.buffer);
    if (ogg) media = { buffer: ogg, mime: 'audio/ogg; codecs=opus', tipo: 'audio' };
  }
  if (cfg.modo === 'qr') {
    const { sendMediaViaQr } = await import('./waqr.js');
    return sendMediaViaQr(storeId, to, media, caption, nombre, pn);
  }
  const numero = (pn || to).replace(/[^0-9]/g, '');
  const r = await cloudSendMedia(cfg.phone_number_id, cfg.access_token, numero, media, caption, nombre);
  if (!r.ok) registrarLog(storeId, 'error', 'envio', `No se pudo enviar el adjunto a ${to}: ${r.error || 'error de Meta'}`);
  return r;
}

interface WebhookMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}
interface WebhookMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: WebhookMedia;
  video?: WebhookMedia;
  audio?: WebhookMedia;
  document?: WebhookMedia;
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  context?: { id?: string }; // respuesta citada: wamid del mensaje al que responde
  referral?: import('./campana.js').WhatsappReferral;
}

interface WebhookStatus {
  id?: string; // el wamid del mensaje que enviamos
  status?: string; // sent | delivered | read | failed
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}
interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
}

// Orden de avance de un estado saliente (nunca retrocede: read no vuelve a delivered).
const RANK_ESTADO: Record<string, number> = { enviado: 1, entregado: 2, visto: 3 };

/**
 * Marca un mensaje saliente recién enviado por la Cloud API: guarda su wamid y
 * lo deja en 'enviado'. Si el envío falló, lo deja en 'fallido'. Los envíos por
 * web/QR (sin wamid) no llevan estado (no hay acuses de la Cloud API).
 */
export function marcarEnviado(rowId: string, r: { ok: boolean; wamid?: string; bloqueadoVentana?: boolean; error?: string; repetido?: boolean }) {
  if (!rowId) return;
  // Repetido (no salió): se borra del chat para que no aparezca dos veces.
  if (r.repetido) { db.prepare('DELETE FROM messages WHERE id = ?').run(rowId); return; }
  // Sella created_at al MOMENTO real del envío (después del tope de velocidad),
  // no al de la inserción. Así el historial y la auditoría reflejan el espaciado
  // real entre mensajes (y no marcan ráfagas falsas cuando se insertan en lote).
  if (r.ok && r.wamid) db.prepare("UPDATE messages SET wa_msg_id = ?, estado = 'enviado', error = '', created_at = datetime('now') WHERE id = ?").run(r.wamid, rowId);
  else if (r.ok) db.prepare("UPDATE messages SET estado = 'enviado', error = '', created_at = datetime('now') WHERE id = ?").run(rowId);
  // Bloqueo por ventana de 24 h: es una PROTECCIÓN nuestra, NO una falla de Meta.
  // Se marca aparte ('bloqueado') y se re-sella la hora para no agrupar falsas ráfagas.
  else if (r.bloqueadoVentana) { db.prepare("UPDATE messages SET estado = 'bloqueado', error = ?, created_at = datetime('now') WHERE id = ?").run(String(r.error || ''), rowId); }
  else { db.prepare("UPDATE messages SET estado = 'fallido' WHERE id = ?").run(rowId); registrarFallo(rowId, r.error || 'Meta no aceptó el mensaje.'); }
}

/** Aplica un acuse de estado de Meta (sent/delivered/read/failed) a nuestro mensaje. */
function actualizarEstadoMensaje(wamid?: string, metaStatus?: string, errores?: WebhookStatus['errors']) {
  if (!wamid || !metaStatus) return;
  const nuevo = metaStatus === 'read' ? 'visto' : metaStatus === 'delivered' ? 'entregado' : metaStatus === 'sent' ? 'enviado' : metaStatus === 'failed' ? 'fallido' : '';
  if (!nuevo) return;
  const row = db.prepare('SELECT id, estado FROM messages WHERE wa_msg_id = ?').get(wamid) as { id: string; estado: string } | undefined;
  if (!row) return;
  if (nuevo === 'fallido') {
    db.prepare("UPDATE messages SET estado = 'fallido' WHERE id = ?").run(row.id);
    const e = errores?.[0];
    registrarFallo(row.id, explicarErrorMeta(e?.code, e?.title || e?.message, e?.error_data?.details));
    return;
  }
  if (row.estado === 'fallido') return; // no revivir un envío fallido
  if ((RANK_ESTADO[nuevo] || 0) > (RANK_ESTADO[row.estado] || 0)) {
    db.prepare('UPDATE messages SET estado = ? WHERE id = ?').run(nuevo, row.id);
  }
}

/** Descarga un adjunto de la Cloud API por su media ID y lo guarda en disco. */
async function descargarMediaCloud(storeId: string, token: string, mediaId: string, tipo: string, mime: string): Promise<string | null> {
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    const mj = (await meta.json().catch(() => ({}))) as { url?: string };
    if (!mj.url) return null;
    const bin = await fetch(mj.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok) return null;
    const buffer = Buffer.from(await bin.arrayBuffer());
    const { mediaDir } = await import('./media.js');
    const { writeFileSync } = await import('node:fs');
    const path = await import('node:path');
    const file = uid() + '.' + mediaExt(tipo, mime);
    writeFileSync(path.join(mediaDir(storeId), file), buffer);
    return '/api/media/' + storeId + '/' + file;
  } catch {
    return null;
  }
}

/** Procesa el webhook de Meta: crea/actualiza el lead y guarda el mensaje entrante (texto o adjunto). */
export function handleIncomingWebhook(body: unknown) {
  const entries = (body as { entry?: { changes?: { value?: WebhookValue }[] }[] })?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      // Acuses de entrega/lectura de los mensajes que ENVIAMOS (no traen `messages`).
      for (const st of value?.statuses || []) actualizarEstadoMensaje(st.id, st.status, st.errors);
      if (!phoneNumberId || !value?.messages?.length) continue;
      const store = db.prepare('SELECT store_id, access_token FROM whatsapp WHERE phone_number_id = ? AND conectado = 1').get(phoneNumberId) as
        | { store_id: string; access_token: string }
        | undefined;
      if (!store) {
        // Diagnóstico: llega un mensaje pero ningún número conectado coincide.
        const otra = db.prepare('SELECT store_id, conectado FROM whatsapp WHERE phone_number_id = ?').get(phoneNumberId) as { store_id: string; conectado: number } | undefined;
        console.warn(
          `[webhook] mensaje para phone_number_id=${phoneNumberId} SIN tienda conectada.` +
            (otra ? ` Existe en la tienda ${otra.store_id} pero conectado=${otra.conectado}.` : ' Ese número no está guardado en ninguna tienda (¿lo conectaste en el panel?).'),
        );
        continue;
      }
      console.log(`[webhook] mensaje entrante para phone_number_id=${phoneNumberId} → tienda ${store.store_id}`);

      for (const msg of value.messages) {
       try {
        const waId = msg.from;
        if (!waId) { console.warn('[webhook] mensaje entrante sin remitente (from), se ignora:', msg.type || '?'); continue; }
        const nombre = value.contacts?.find((c) => c.wa_id === waId)?.profile?.name || '';
        let ad: AdRef | null = null;
        try { ad = refDesdeWhatsapp(msg.referral); } catch (e) { console.error('[webhook] referral de anuncio inválido (se ignora la atribución):', e); }
        const wamid = msg.id;                 // wamid del mensaje entrante (para citar en el futuro)
        const citaWamid = msg.context?.id;    // si es una respuesta citada, el wamid citado
        if (msg.type === 'text' && msg.text?.body) {
          saveIncomingMessage(store.store_id, waId, nombre, msg.text.body, undefined, undefined, ad, wamid, citaWamid);
          continue;
        }
        const media = msg.image || msg.video || msg.audio || msg.document;
        if (media?.id) {
          const tipo = msg.type === 'image' ? 'image' : msg.type === 'video' ? 'video' : msg.type === 'audio' ? 'audio' : 'document';
          const mime = media.mime_type || 'application/octet-stream';
          void descargarMediaCloud(store.store_id, store.access_token, media.id, tipo, mime).then((url) => {
            saveIncomingMessage(store.store_id, waId, nombre, media.caption || '', url ? { tipo, url, mime, nombre: media.filename || '' } : undefined, undefined, ad, wamid, citaWamid);
          });
        } else if (msg.text?.body || msg.button?.text || msg.interactive) {
          // Mensajes tipo botón/interactivos (p. ej. respuestas a plantillas o a
          // anuncios): guardamos el texto que se pueda extraer para no perderlos.
          const t = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
          if (t) saveIncomingMessage(store.store_id, waId, nombre, t, undefined, undefined, ad, wamid, citaWamid);
        }
       } catch (e) {
        console.error('[webhook] error procesando un mensaje entrante (se continúa con los demás):', e);
       }
      }
    }
  }
}
