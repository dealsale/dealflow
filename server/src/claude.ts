import Anthropic from '@anthropic-ai/sdk';
import { medirUso, type TipoIA } from './consumoIA.js';

/**
 * Claude (Anthropic) como IA de la tienda, con la API key de la tienda.
 *
 * Diferencias con DeepSeek/OpenAI que se manejan aquí:
 *  - CACHÉ: lo que no cambia entre chats (herramientas + instrucciones + catálogo) se marca para
 *    que Anthropic lo guarde 5 minutos. Mientras la tienda tenga chats seguidos, esa parte se cobra
 *    a una fracción del precio en vez de completa en cada respuesta.
 *  - HERRAMIENTAS: el pedido, las fotos y el pase a una persona llegan como llamadas con datos
 *    ordenados (no como un marcador de texto que hay que descifrar).
 *  - La tienda elige el modelo: por defecto el más económico, y puede subir a uno más potente.
 */

export interface ModeloClaude {
  id: string;
  nombre: string;
  nota: string;
  /** USD por millón de tokens. */
  entrada: number;
  salida: number;
  cacheLectura: number;
  /** Cuánto piensa antes de responder en el chat (más = mejor con reglas difíciles, más tokens de salida). */
  esfuerzoChat: 'low' | 'medium' | 'high';
  /** Si Anthropic rechaza la petición por sus filtros, la reintenta sola en otro modelo (no existe en Haiku). */
  respaldo: boolean;
}

export const MODELOS_CLAUDE: ModeloClaude[] = [
  { id: 'claude-haiku-5-5', nombre: 'Claude Haiku 5.5', nota: 'Recomendado. El más rápido y económico: cuesta parecido o menos que DeepSeek.', entrada: 0.1, salida: 0.5, cacheLectura: 0.01, esfuerzoChat: 'medium', respaldo: false },
  { id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5', nota: 'Más potente: para catálogos grandes o reglas de venta complejas. Cuesta unas 10 veces más por chat.', entrada: 2, salida: 10, cacheLectura: 0.1, esfuerzoChat: 'low', respaldo: true },
  { id: 'claude-opus-5-5', nombre: 'Claude Opus 5.5', nota: 'El más potente. Cuesta unas 20 veces más por chat que el recomendado.', entrada: 4, salida: 20, cacheLectura: 0.2, esfuerzoChat: 'low', respaldo: true },
];
export const MODELO_CLAUDE_DEFECTO = MODELOS_CLAUDE[0].id;
export const modeloClaude = (id?: string): ModeloClaude => MODELOS_CLAUDE.find((m) => m.id === id) || MODELOS_CLAUDE[0];
export const esModeloClaude = (id: string): boolean => MODELOS_CLAUDE.some((m) => m.id === id);

/** Costo en USD de una llamada según lo que reporta la API. */
export function costoClaude(modeloId: string, u: { input_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; output_tokens: number }): number {
  const m = modeloClaude(modeloId);
  const leido = Number(u.cache_read_input_tokens) || 0;
  const escrito = Number(u.cache_creation_input_tokens) || 0;
  const total = (Number(u.input_tokens) || 0) + leido + escrito;
  // Haiku 5.5 cobra otra tarifa cuando el mensaje pasa de 100.000 tokens (no debería pasar en un chat de ventas).
  const largo = m.id === 'claude-haiku-5-5' && total > 100_000 ? 5 : 1;
  const entrada = m.entrada * largo, salida = m.salida * largo, lectura = m.cacheLectura * largo;
  // Escribir en caché (la primera vez, o tras 5 minutos sin chats) cuesta 1,25 veces la entrada normal.
  return ((Number(u.input_tokens) || 0) * entrada + leido * lectura + escrito * entrada * 1.25 + (Number(u.output_tokens) || 0) * salida) / 1e6;
}

const clientes = new Map<string, Anthropic>();
function clienteDe(key: string): Anthropic {
  let c = clientes.get(key);
  if (!c) {
    if (clientes.size > 500) clientes.clear();
    c = new Anthropic({ apiKey: key, maxRetries: 2 });
    clientes.set(key, c);
  }
  return c;
}

export type MensajeClaude = Anthropic.Beta.BetaMessageParam;
export type HerramientaClaude = Anthropic.Beta.BetaTool;

export interface PeticionClaude {
  storeId: string;
  tipo: TipoIA;
  leadId?: string;
  key: string;
  modelo: string;
  /** Lo que es igual en todos los chats de la tienda: se guarda en caché. */
  sistemaEstable?: string;
  /** Lo propio de este chat o de este momento: va después y no se guarda. */
  sistemaVariable?: string;
  mensajes: MensajeClaude[];
  herramientas?: HerramientaClaude[];
  maxTokens: number;
  esfuerzo?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
}

export type RespuestaClaude =
  | { ok: true; texto: string; usos: { nombre: string; datos: Record<string, unknown> }[]; cortada: boolean }
  | { ok: false; error: string; estado: number };

/**
 * Una llamada a Claude. No lanza: si falla devuelve el motivo ya explicado para la tienda.
 * No se manda `temperature` (los modelos actuales no la aceptan) ni se apaga el razonamiento:
 * cuánto piensa se regula con `esfuerzo`.
 */
export async function pedirClaude(p: PeticionClaude): Promise<RespuestaClaude> {
  const m = modeloClaude(p.modelo);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [];
  if (p.sistemaEstable?.trim()) system.push({ type: 'text', text: p.sistemaEstable, cache_control: { type: 'ephemeral' } });
  if (p.sistemaVariable?.trim()) system.push({ type: 'text', text: p.sistemaVariable });
  try {
    const r = await clienteDe(p.key).beta.messages.create({
      model: m.id,
      max_tokens: p.maxTokens,
      ...(system.length ? { system } : {}),
      messages: p.mensajes,
      ...(p.herramientas?.length ? { tools: p.herramientas } : {}),
      output_config: { effort: p.esfuerzo || 'low' },
      ...(m.respaldo ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    }, { timeout: p.timeoutMs || 60_000 });
    medirUso(p.storeId, p.tipo, p.leadId || '', {
      entrada: (r.usage.input_tokens || 0) + (r.usage.cache_read_input_tokens || 0) + (r.usage.cache_creation_input_tokens || 0),
      cache: r.usage.cache_read_input_tokens || 0,
      salida: r.usage.output_tokens || 0,
      usd: costoClaude(m.id, r.usage),
    });
    if (r.stop_reason === 'refusal') return { ok: false, estado: 200, error: 'Claude no quiso responder este mensaje por sus filtros de seguridad.' };
    // El contenido se lee por tipo, no por posición: la respuesta puede empezar con bloques de razonamiento.
    const texto = r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
    const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ nombre: b.name, datos: (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown> }));
    return { ok: true, texto, usos, cortada: r.stop_reason === 'max_tokens' };
  } catch (e) {
    return { ok: false, ...explicarErrorClaude(e) };
  }
}

/** Traduce el error de la API a algo que la tienda pueda arreglar. */
export function explicarErrorClaude(e: unknown): { error: string; estado: number } {
  if (e instanceof Anthropic.AuthenticationError) return { estado: 401, error: 'La API key de Claude no es válida o fue revocada. Crea una nueva en platform.claude.com y pégala en Integraciones.' };
  if (e instanceof Anthropic.PermissionDeniedError) return { estado: 403, error: 'Tu cuenta de Claude no tiene permiso para usar este modelo. Elige otro modelo en Integraciones o revisa tu cuenta de Anthropic.' };
  if (e instanceof Anthropic.NotFoundError) return { estado: 404, error: 'El modelo de Claude elegido no está disponible en tu cuenta. Elige otro en Integraciones.' };
  if (e instanceof Anthropic.RateLimitError) return { estado: 429, error: 'Claude está recibiendo más mensajes de los que permite tu cuenta en este momento (límite de uso). Sube el límite en platform.claude.com.' };
  if (e instanceof Anthropic.BadRequestError) {
    const sinSaldo = /credit balance|billing/i.test(e.message);
    return { estado: 400, error: sinSaldo ? 'Tu cuenta de Claude no tiene saldo. Recarga créditos en platform.claude.com (Billing).' : `Claude rechazó la petición: ${e.message.slice(0, 200)}` };
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { estado: 0, error: 'Claude tardó demasiado en responder.' };
  if (e instanceof Anthropic.APIConnectionError) return { estado: 0, error: 'No se pudo conectar con Claude (red).' };
  if (e instanceof Anthropic.APIError) return { estado: Number(e.status) || 500, error: `Claude respondió con un error (${e.status}). Suele ser temporal.` };
  return { estado: 0, error: `Error inesperado con Claude: ${String((e as Error)?.message || e).slice(0, 160)}` };
}

/**
 * Comprueba la clave al guardarla, sin gastar nada (consulta el modelo, no genera texto).
 * Solo se rechaza cuando Anthropic dice que la clave o el modelo no sirven; si es un fallo de red se deja pasar.
 */
export async function probarClaveClaude(key: string, modelo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 1 }).models.retrieve(modeloClaude(modelo).id, {}, { timeout: 15_000 });
    return { ok: true };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || e instanceof Anthropic.NotFoundError) return { ok: false, error: explicarErrorClaude(e).error };
    return { ok: true };
  }
}

/**
 * Claude exige que la conversación empiece y termine con un turno del cliente («user»). El tramo
 * del chat que se le pasa puede empezar o terminar con un mensaje de la tienda: se completa sin
 * quitar nada. `recordatorio` es lo que se le dice cuando lo último del chat no es del cliente.
 */
export function ordenarTurnos(mensajes: MensajeClaude[], recordatorio: string): MensajeClaude[] {
  const out = [...mensajes];
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '[Mensajes anteriores de este chat]' });
  if (out[out.length - 1].role !== 'user') out.push({ role: 'user', content: recordatorio });
  return out;
}

// ── Herramientas del asistente de ventas ─────────────────────────────────────────────────────────

const cadena = (descripcion: string) => ({ type: 'string', description: descripcion });

/** Las tres acciones que antes eran marcadores de texto (##PEDIDO, ##MEDIA, ##HUMANO). El orden es fijo: forma parte de lo que se guarda en caché. */
export const HERRAMIENTAS_BOT: HerramientaClaude[] = [
  {
    name: 'registrar_pedido',
    description: 'Registra el pedido del cliente en el sistema de la tienda, o corrige/reactiva el que ya tiene pendiente (el sistema decide si es nuevo o el mismo; nunca crea dos iguales). Llámala SOLO cuando el cliente ya confirmó el "Resumen de tu pedido" y tienes nombre y apellido, celular, departamento, ciudad y dirección. El sistema le envía al cliente la confirmación con el número de pedido: no la escribas tú.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['cliente', 'telefono', 'departamento', 'ciudad', 'direccion', 'items', 'total'],
      properties: {
        cliente: cadena('Nombre y apellido que el cliente ESCRIBIÓ en el chat (no el nombre de perfil, ni un correo, número o apodo).'),
        telefono: cadena('Celular de contacto para la entrega: 10 dígitos, sin +57, exactamente el que el cliente escribió en esta conversación. Si dijo que es el mismo de WhatsApp, escribe WHATSAPP. Nunca un número inventado o de ejemplo.'),
        departamento: cadena('Departamento de Colombia. Si la ciudad es inconfundible, dedúcelo.'),
        ciudad: cadena('Ciudad o municipio de entrega.'),
        direccion: cadena('Dirección exacta con barrio y punto de referencia, tal como la dio el cliente.'),
        items: {
          type: 'array',
          description: 'Una línea por cada combinación de producto y variante. Si lleva el mismo producto en tallas o colores distintos, una línea por cada uno.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['cantidad', 'producto', 'variante'],
            properties: {
              cantidad: { type: 'integer', description: 'Unidades de esta línea.' },
              producto: cadena('Nombre EXACTO del producto como aparece en el catálogo.'),
              variante: cadena('Talla, color y opciones elegidas, escritas EXACTAMENTE como aparecen en la lista de variantes del catálogo (ej. "M · Negro"). Vacío si el producto no tiene variantes.'),
            },
          },
        },
        total: { type: 'integer', description: 'Total del pedido en pesos colombianos, sin puntos ni signos: el resultado de TU cuenta con los precios, combos y reglas del catálogo.' },
      },
    },
  },
  {
    name: 'enviar_fotos',
    description: 'Le envía al cliente las fotos y videos de un producto por WhatsApp. Llámala cuando el cliente pida fotos, imágenes o videos, o muestre interés en un producto específico. No la llames si todavía no está claro cuál producto exacto del catálogo quiere.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['producto', 'color'],
      properties: {
        producto: cadena('Nombre EXACTO del producto como aparece en el catálogo.'),
        color: cadena('Solo si el cliente pidió expresamente la foto de un color u opción que muestra 📷 en el catálogo: ese valor exacto. En cualquier otro caso déjalo vacío y se envían todas las fotos y videos.'),
      },
    },
  },
  {
    name: 'pasar_a_humano',
    description: 'Pasa este chat a una persona del equipo de la tienda. Después de llamarla, el asistente deja de responder en este chat.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['motivo'],
      properties: { motivo: cadena('Por qué necesita a una persona, en una frase (lo lee el equipo, no el cliente).') },
    },
  },
];

/**
 * Cómo usar las herramientas: reemplaza, para Claude, el bloque de los marcadores de texto.
 * Las reglas de negocio son las mismas; cambia solo la forma de registrar el pedido, enviar fotos y pasar a una persona.
 */
export const MECANICA_HERRAMIENTAS = `CÓMO FUNCIONA ESTE CHAT: lo que escribas como texto es EXACTAMENTE lo que el cliente lee en WhatsApp: texto plano, sin JSON, sin bloques de código y sin explicar lo que haces por dentro. Para actuar tienes tres herramientas: registrar_pedido, enviar_fotos y pasar_a_humano. El cliente no las ve. Las herramientas no te devuelven nada y no hay un segundo turno: lo que quieras decirle al cliente escríbelo en este mismo turno, junto con la llamada.

PRODUCTO CORRECTO (muy importante): si el cliente nombra un producto de forma general y en el CATÁLOGO hay VARIOS productos que coinciden con ese nombre (por ejemplo pide "jogger" y existen "Jogger Bota Recta Hombre", "Jogger Bota Recta Dama", "Jogger Clásico", "Jogger Clásico Dama"), NO adivines ni elijas uno al azar: pregúntale CUÁL de esos modelos exactos quiere, y no envíes fotos ni registres el pedido todavía. Solo cuando quede claro el modelo exacto, usa su NOMBRE EXACTO del catálogo en las herramientas.

FOTOS Y VIDEOS: cuando el cliente pregunte o muestre interés en un producto específico (aunque lo nombre de forma informal, ej. "la camisa"), llama a enviar_fotos con el nombre exacto del producto y escribe además una frase MUY corta de cierre (una pregunta). Si pide en general "fotos", "imágenes", "más fotos", "videos" o material del producto sin nombrar un color, deja el campo color vacío: el sistema envía TODAS las fotos y videos. Llena el campo color SOLO si pide expresamente la foto de un color específico Y ese color muestra 📷 en el catálogo. Si el color que pide NO tiene 📷, no prometas enviar su foto: dile con amabilidad que puedes mostrarle el catálogo de colores o las fotos generales, y ofrécelas con enviar_fotos sin color. El sistema envía la multimedia automáticamente; no digas que "no puedes enviar fotos".

CERRAR EL PEDIDO: cuando el cliente confirme que quiere comprar Y ya tengas su NOMBRE, CELULAR, CIUDAD y DIRECCIÓN, llama a registrar_pedido con esos datos, los productos y el total.
En los productos pon SIEMPRE la variante (talla, color y cualquier opción que el cliente eligió): el vendedor necesita ese detalle completo para despachar. Si el cliente lleva varias unidades del mismo producto en tallas o colores DISTINTOS, pon UNA LÍNEA POR CADA VARIANTE con su cantidad (ej.: 1 Camisilla "Negro · M" y 2 Camisilla "Blanco · L"); nunca 3 Camisilla sin la variante.
El celular es el de CONTACTO para la entrega (10 dígitos, sin +57). REGLA OBLIGATORIA, SIN EXCEPCIONES: el celular SOLO puede ser uno que el cliente ESCRIBIÓ en esta conversación. NUNCA lo inventes, NUNCA lo completes, NUNCA lo supongas y NUNCA uses números de ejemplo o de relleno (como 3001234567, 3012345678 o 301-234-567). Si el cliente ya escribió un celular, USA ese y no lo vuelvas a pedir. Si no ha dado ninguno, PÍDELO junto con los demás datos que falten ("¿A qué número celular te llama la transportadora?") y no muestres el resumen ni registres el pedido hasta tenerlo. Si el cliente dice que es el mismo de WhatsApp, escribe WHATSAPP en el campo telefono. El celular SIEMPRE va en el "Resumen de tu pedido". Si el sistema ve un celular que el cliente nunca escribió, el pedido NO se registra.
El departamento es OBLIGATORIO. Si la ciudad es inconfundible (capitales y ciudades grandes: Medellín → Antioquia, Cali → Valle del Cauca, Barranquilla → Atlántico, Bogotá → Cundinamarca/Bogotá D.C., Bucaramanga → Santander, etc.), dedúcelo tú y NO lo preguntes. Pregúntalo solo si la ciudad existe en varios departamentos o no la reconoces, y hazlo junto con los otros datos que falten.
Llama a registrar_pedido una sola vez, cuando de verdad tengas todos los datos; si te falta alguno, pídelo primero. No le menciones la herramienta al cliente.
FLUJO OBLIGATORIO DEL CIERRE: primero muestra el "Resumen de tu pedido" (con nombre, celular, ciudad, dirección, productos y total) y pregunta "¿Confirmas que los datos están correctos?". En cuanto el cliente confirme (diga "sí", "sisas", "dale", "correcto", "confirmo", etc.), en tu SIGUIENTE turno DEBES llamar a registrar_pedido con los datos del resumen. Nunca digas "el sistema procesará tu pedido" o "te llegará la confirmación" sin haber llamado a registrar_pedido en ESE mismo turno.

DATOS EN PEDAZOS (muy importante): el cliente suele dar sus datos regados en varios mensajes (el nombre en uno, la ciudad en otro, la dirección más tarde, el teléfono suelto). ANTES de pedir cualquier dato, revisa TODA la conversación y la sección "LO QUE EL CLIENTE YA ESCRIBIÓ": si el dato ya está ahí, ÚSALO y no lo vuelvas a pedir. Pide SOLO lo que de verdad falta, y TODO lo que falte en UN SOLO mensaje (ej: "Para enviarlo solo me falta tu dirección y el barrio 😊"), nunca de a un dato por mensaje. NO reconfirmes datos uno por uno ("¿tu nombre es X?", "¿confirmas que es Medellín?"): la ÚNICA confirmación es el "Resumen de tu pedido", UNA sola vez, al final. Si el cliente corrige algo del resumen, aplica la corrección y cierra el pedido sin volver a pedir confirmación de todo.

NO ENTRES EN BUCLE DE CONFIRMACIÓN: un "sí", "confirmo", "correcto", "dale" del cliente confirma EL PEDIDO, aunque lo haya dicho justo después de que le pediste un dato suelto (como el punto de referencia). Si ya mostraste el resumen y tienes nombre, ciudad y dirección, ese "sí" cierra la venta: llama a registrar_pedido. JAMÁS vuelvas a preguntar "¿confirmas?" ni pidas de nuevo datos que el cliente ya te dio. Nunca pidas confirmación dos veces seguidas.

FOTOS DEL CLIENTE: si el cliente manda una foto y la puedes ver, úsala: si es un producto, relaciónala con el producto del CATÁLOGO que más se parezca (por tipo y color) y sigue la venta con ese; si es un comprobante de pago o una captura, lee lo que dice y responde sobre eso. Si en vez de la foto ves "[el cliente envió una foto · pista interna aproximada: …]", esa pista la generó un sistema automático y puede equivocarse: es SOLO para orientarte, no la cites ni la repitas. En ningún caso digas que algo "no está disponible", "no lo manejamos" o "no tenemos esa tela/material/referencia" solo por lo que se ve en una foto; si no estás seguro, pregúntale amablemente cuál de nuestros productos le interesa o muéstrale las opciones del catálogo.

OBLIGATORIO SOBRE EL PEDIDO: NUNCA le digas al cliente que su pedido "quedó registrado", "ya está creado", "confirmado" o similar si en ESE MISMO turno no llamaste a registrar_pedido. Si todavía te falta el nombre, el celular, la ciudad o la dirección exacta, pídelos primero y NO afirmes que el pedido quedó registrado. El mensaje de confirmación al cliente lo envía el sistema automáticamente, no lo escribas tú.`;

/**
 * Pasa a «herramientas» las instrucciones que hablan de los marcadores de texto (las que arma la
 * tienda, el pedido pendiente, los cambios…). El marcador ##NOVEDAD no se toca: sigue siendo texto.
 */
export function aHerramientas(t: string): string {
  return t
    .replace(/en (?:el marcador|los marcadores) ##PEDIDO y ##MEDIA\b/g, 'en las herramientas registrar_pedido y enviar_fotos')
    .replace(/agrega al final, en una línea sola, el marcador ##HUMANO## \(el cliente no lo ve\)/g, 'llama a la herramienta pasar_a_humano')
    .replace(/\b(NO|No|no) vuelvas a poner (?:el marcador )?##PEDIDO\b/g, '$1 vuelvas a llamar a registrar_pedido')
    .replace(/\b(NO|No|no) pongas (?:el marcador )?##PEDIDO\b/g, '$1 llames a registrar_pedido')
    .replace(/\bescribe el marcador ##PEDIDO\b/g, 'llama a registrar_pedido')
    .replace(/\bPon (?:el marcador )?##PEDIDO\b/g, 'Llama a registrar_pedido')
    .replace(/\bpon (?:el marcador )?##PEDIDO\b/g, 'llama a registrar_pedido')
    .replace(/sin poner el marcador\b/g, 'sin llamar a registrar_pedido')
    .replace(/en el resumen y en el marcador\b/g, 'en el resumen y en registrar_pedido')
    .replace(/\b([Ee])l campo total del marcador ##PEDIDO\b/g, '$1l campo total de registrar_pedido')
    .replace(/\bEn el marcador ##PEDIDO\b/g, 'En registrar_pedido')
    .replace(/\bel marcador ##PEDIDO\b/g, 'la herramienta registrar_pedido')
    .replace(/##PEDIDO\b(?:\s*\.{3}\s*##)?/g, 'registrar_pedido')
    .replace(/##HUMANO##?/g, 'pasar_a_humano')
    .replace(/##MEDIA\b[^\s.,;)]*/g, 'enviar_fotos')
    .replace(/en ese mismo mensaje/g, 'en ese mismo turno');
}

const limpio = (v: unknown, n = 300) => String(v ?? '').replace(/["\n\r;]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Convierte los datos de registrar_pedido al formato que ya entiende crearPedido (el mismo «inner»
 * del marcador), para que todas las validaciones existentes (celular escrito por el cliente,
 * variantes reales, total, pedidos repetidos) apliquen igual venga de donde venga el pedido.
 */
export function innerDesdeHerramienta(d: Record<string, unknown>): string {
  const items = (Array.isArray(d.items) ? d.items : []).map((raw) => {
    const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const producto = limpio(it.producto, 160).replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!producto) return '';
    // «M, Negro» → «M · Negro»: una coma dentro de la variante se leería como dos variantes distintas.
    const variante = limpio(it.variante, 120).replace(/[()]/g, ' ').replace(/\s*,\s*/g, ' · ').replace(/\s+/g, ' ').trim();
    const cantidad = Math.max(1, Math.min(999, Math.round(Number(it.cantidad)) || 1));
    return `${cantidad}x ${producto}${variante ? ` (${variante})` : ''}`;
  }).filter(Boolean);
  const total = Math.max(0, Math.round(Number(d.total)) || 0);
  return ` cliente="${limpio(d.cliente, 120)}"; telefono="${limpio(d.telefono, 30)}"; departamento="${limpio(d.departamento, 80)}"; ciudad="${limpio(d.ciudad, 80)}"; direccion="${limpio(d.direccion)}"; items="${items.join(', ')}"; total="${total}"`;
}
