import { existsSync, readFileSync } from 'node:fs';
import { db, pj, uid, registrarLog } from './db.js';
import { sendWhatsappText, sendWhatsappMedia, marcarEnviado } from './wa.js';
import { saveOutgoingMedia, mediaPath, tipoDeMime } from './media.js';

const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf: 'application/pdf',
};

/** Obtiene el archivo (buffer/mime/tipo/url) de un valor: enlace guardado o data URL. */
function materializar(storeId: string, valor: string): { buffer: Buffer; mime: string; tipo: string; url: string } | null {
  if (valor.startsWith('data:')) {
    const s = saveOutgoingMedia(storeId, valor, '');
    return s ? { buffer: s.buffer, mime: s.mime, tipo: s.tipo, url: s.url } : null;
  }
  // Resolvemos la URL al archivo real HONRANDO el espacio (tienda) que trae la URL:
  //  - /api/media/<store>/<file>  → carpeta de ESA tienda (no la actual)
  //  - /api/library/media/<file>  → espacio de la biblioteca (__biblioteca__)
  // Antes se ignoraba el <store> de la URL y se leía siempre en la tienda actual,
  // por lo que un producto importado (con archivos en otro espacio) no resolvía.
  const mStore = valor.match(/\/api\/media\/([^/?#]+)\/([^/?#]+)/);
  const mLib = valor.match(/\/api\/library\/media\/([^/?#]+)/);
  const espacio = mStore ? mStore[1] : mLib ? '__biblioteca__' : '';
  const file = mStore ? mStore[2] : mLib ? mLib[1] : '';
  if (!file) return null;
  // Primero en el espacio que dice la URL; si no está, probamos la tienda actual (respaldo).
  let p = mediaPath(espacio, file);
  if (!existsSync(p)) p = mediaPath(storeId, file);
  if (!existsSync(p)) return null;
  const ext = (file.split('.').pop() || '').toLowerCase();
  const mime = MIME_POR_EXT[ext] || 'application/octet-stream';
  return { buffer: readFileSync(p), mime, tipo: tipoDeMime(mime), url: valor };
}

/** Proveedores de IA soportados (todos con API compatible de chat completions). */
const PROVEEDORES_IA: Record<string, { url: string; model: string; env: string; nombre: string }> = {
  deepseek: { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', env: 'DEEPSEEK_API_KEY', nombre: 'DeepSeek' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', env: 'OPENAI_API_KEY', nombre: 'OpenAI' },
  grok: { url: 'https://api.x.ai/v1/chat/completions', model: process.env.GROK_CHAT_MODEL || 'grok-3-mini', env: 'GROK_API_KEY', nombre: 'Grok (xAI)' },
};

/**
 * Resuelve qué IA usa la tienda: su proveedor predeterminado con SU propia
 * API key (Integraciones). Si no configuró nada, cae a DeepSeek con la clave
 * del servidor (comportamiento de siempre).
 */
export function resolverIA(storeId: string): { url: string; model: string; key: string; proveedor: string } | null {
  const asst = db.prepare('SELECT ia_proveedor FROM assistants WHERE store_id = ?').get(storeId) as { ia_proveedor: string } | undefined;
  const proveedor = (asst?.ia_proveedor || '').trim() || 'deepseek';
  const p = PROVEEDORES_IA[proveedor] || PROVEEDORES_IA.deepseek;
  const row = db.prepare('SELECT config FROM store_integrations WHERE store_id = ? AND tipo = ?').get(storeId, proveedor) as { config: string } | undefined;
  const propia = row ? (pj<Record<string, string>>(row.config, {}).apiKey || '').trim() : '';
  const key = propia || process.env[p.env] || '';
  if (!key) return null;
  return { url: p.url, model: p.model, key, proveedor };
}

/** Llave de un proveedor concreto de la tienda (o del servidor como respaldo). */
function keyProveedor(storeId: string, prov: 'deepseek' | 'openai'): string {
  const row = db.prepare('SELECT config FROM store_integrations WHERE store_id = ? AND tipo = ?').get(storeId, prov) as { config: string } | undefined;
  const propia = row ? (pj<Record<string, string>>(row.config, {}).apiKey || '').trim() : '';
  return propia || process.env[prov === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY'] || '';
}

/**
 * IA híbrida (optimiza el gasto): DeepSeek escribe los textos (más barato); si la
 * tienda no tiene DeepSeek, cae a su proveedor elegido.
 */
function resolverTexto(storeId: string): { url: string; model: string; key: string; proveedor: string } | null {
  const key = keyProveedor(storeId, 'deepseek');
  if (key) return { url: PROVEEDORES_IA.deepseek.url, model: PROVEEDORES_IA.deepseek.model, key, proveedor: 'deepseek' };
  return resolverIA(storeId);
}

/** Transcribe una nota de voz con OpenAI (Whisper). Devuelve '' si no se puede. */
async function transcribirAudio(storeId: string, mediaUrl: string): Promise<string> {
  const key = keyProveedor(storeId, 'openai');
  if (!key) return '';
  const media = materializar(storeId, mediaUrl);
  if (!media) return '';
  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(media.buffer)], { type: media.mime || 'audio/ogg' }), 'audio.ogg');
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    form.append('language', 'es');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!res.ok) { console.error('[ia] transcripción falló', res.status, await res.text().catch(() => '')); return ''; }
    const b = (await res.json()) as { text?: string };
    return (b.text || '').trim();
  } catch (e) { console.error('[ia] error transcribiendo audio', e); return ''; }
}

/** Describe una imagen con OpenAI (visión). Devuelve '' si no se puede. */
async function entenderImagen(storeId: string, mediaUrl: string): Promise<string> {
  const key = keyProveedor(storeId, 'openai');
  if (!key) return '';
  const media = materializar(storeId, mediaUrl);
  if (!media || media.tipo !== 'image') return '';
  try {
    const dataUrl = `data:${media.mime};base64,${media.buffer.toString('base64')}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini', max_tokens: 150,
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Un cliente envió esta imagen por WhatsApp a una tienda. En español y en 1-2 frases, di qué se ve y qué podría querer (ej: un producto del catálogo, un comprobante de pago, una talla, una captura). Sé concreto y breve.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ] }],
      }),
    });
    if (!res.ok) { console.error('[ia] visión falló', res.status); return ''; }
    const b = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (b.choices?.[0]?.message?.content || '').trim();
  } catch (e) { console.error('[ia] error viendo imagen', e); return ''; }
}

/** Convierte el estilo/tono elegido por la tienda en una instrucción para la IA. */
function estiloDirectiva(estiloRaw?: string): string {
  const e = pj<{ trato?: string; emojis?: boolean; largo?: string }>(estiloRaw || '', {});
  const partes = [
    e.trato === 'usted' ? 'trata al cliente de "usted"' : 'trata al cliente de "tú", cercano',
    e.emojis === false ? 'no uses emojis' : 'usa algunos emojis con moderación',
    e.largo === 'detallado' ? 'da respuestas algo más detalladas cuando ayude a la venta' : 'respuestas breves (1-3 frases)',
  ];
  return `ESTILO Y TONO (respétalo): ${partes.join('; ')}.`;
}

/**
 * Redacta con IA un mensaje de SEGUIMIENTO (re-enganche) usando el contexto real
 * del chat: retoma lo último que se habló, como un buen vendedor. Devuelve '' si
 * no hay IA o falla (el llamador usa un texto de respaldo). `nivel` marca la
 * urgencia: 1 ≈ 5 min, 2 ≈ 30 min, 3 ≈ 1 h sin respuesta.
 */
export async function generarSeguimientoIA(storeId: string, leadId: string, nivel: number): Promise<string> {
  const ia = resolverTexto(storeId);
  if (!ia) return '';
  const assistant = db.prepare('SELECT instrucciones, nombre, estilo FROM assistants WHERE store_id = ?').get(storeId) as { instrucciones: string; nombre: string; estilo: string } | undefined;
  const store = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined;
  const lead = db.prepare('SELECT nombre FROM leads WHERE id = ?').get(leadId) as { nombre: string } | undefined;
  const marca = store?.nombre || 'la tienda';
  const nombreAsist = (assistant?.nombre || '').trim();
  const productos = (db.prepare('SELECT nombre, precio FROM products WHERE store_id = ? LIMIT 40').all(storeId) as { nombre: string; precio: number }[])
    .map((p) => `- ${p.nombre}: ${Number(p.precio) > 0 ? '$' + Number(p.precio).toLocaleString('es-CO') + ' COP' : 'gratis'}`).join('\n');
  const historia = (db.prepare('SELECT de, texto, tipo FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 12').all(leadId) as { de: string; texto: string; tipo: string }[])
    .reverse()
    .map((m) => ({ role: m.de === 'cliente' ? ('user' as const) : ('assistant' as const), content: (m.texto || '').trim() || (m.tipo && m.tipo !== 'texto' ? `[${m.tipo === 'audio' ? 'nota de voz' : m.tipo === 'image' ? 'foto' : 'archivo'}]` : '') }))
    .filter((m) => m.content);
  if (!historia.length) return '';

  const urgencia = nivel <= 1
    ? 'Lleva unos 5 minutos sin responder. Escríbele algo breve y cálido para saber si sigue ahí y ofrecerle ayuda con lo que estaban viendo.'
    : nivel === 2
      ? 'Lleva ~30 minutos sin responder. Retómalo con un mensaje breve que aporte valor (resuelve la posible duda o recuérdale el beneficio del producto que le interesaba) e invítalo a continuar.'
      : 'Lleva ~1 hora sin responder. Es un último intento amable: recuérdale que puedes ayudarle a completar su compra cuando quiera, sin presionar.';

  const system = `Eres ${nombreAsist ? `"${nombreAsist}", el asistente de ventas por WhatsApp de "${marca}". Te presentas como ${nombreAsist}` : `el asistente de ventas por WhatsApp de "${marca}"`}.
${assistant?.instrucciones || ''}

${estiloDirectiva(assistant?.estilo)}

CATÁLOGO (solo como contexto; NO inventes precios que no estén aquí):
${productos || '(sin productos cargados)'}

TAREA — ESCRIBIR UN MENSAJE DE SEGUIMIENTO: El cliente${lead?.nombre ? ' (' + String(lead.nombre).split(' ')[0] + ')' : ''} dejó de responder. ${urgencia}
Reglas:
- Escribe UN SOLO mensaje corto (1-2 frases), natural y humano, como un buen vendedor que retoma la conversación por WhatsApp.
- Básate en lo ÚLTIMO que hablaron (revisa el historial) y retoma ESE tema o producto puntual.
- NO vuelvas a saludar con "hola" si ya venían conversando; continúa la charla donde quedó.
- NO inventes precios, promociones ni datos que no estén en el catálogo.
- Que NO suene robótico ni repita mensajes anteriores. Evita el genérico "¿sigues ahí?" si puedes ser específico.
- Responde SOLO con el texto del mensaje, sin comillas ni explicaciones.

CRÍTICO — TÚ ERES ${nombreAsist ? `"${nombreAsist}", el` : 'el'} VENDEDOR, NO el cliente: escribe SIEMPRE en tu propia voz, dirigiéndote al cliente. JAMÁS respondas como si fueras el cliente ni contestes en su nombre. Si el último mensaje del historial es una pregunta que TÚ hiciste (ej: "¿qué color prefieres?"), NO la respondas por él: escríbele un recordatorio para que ÉL la conteste (ej: "¿Ya pensaste qué color prefieres? 😊"). Nunca escribas algo que solo diría el cliente (ej: "lo quiero café").

MUY IMPORTANTE — CUÁNDO NO ESCRIBIR: si la conversación YA ESTÁ CERRADA no hay que insistir. Eso incluye: la venta ya se concretó o el pedido ya quedó registrado, el cliente ya confirmó la compra, ya se despidió o solo dio las gracias, dijo que no le interesa, o no queda nada útil por decir. En esos casos responde EXACTAMENTE con la palabra "NADA" (en mayúsculas) y nada más.`;

  // Cerramos con un turno de "usuario" que es una INSTRUCCIÓN del sistema (no el
  // cliente). Así el modelo produce el siguiente turno como ASISTENTE y no completa
  // la conversación poniéndose en la piel del cliente.
  const directiva = {
    role: 'user' as const,
    content: `[INSTRUCCIÓN DEL SISTEMA — no es un mensaje del cliente] El cliente lleva un rato sin responder. Escribe TÚ, ${nombreAsist || 'el asistente'}, UN solo mensaje de seguimiento (como vendedor, hacia el cliente) retomando lo último que hablaron. Recuerda: nunca respondas en nombre del cliente. Si la conversación ya está cerrada, responde solo "NADA".`,
  };

  try {
    const res = await fetch(ia.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ia.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ia.model, messages: [{ role: 'system', content: system }, ...historia, directiva], max_tokens: 160, temperature: 0.8 }),
    });
    if (!res.ok) return '';
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let txt = (body.choices?.[0]?.message?.content || '').trim();
    txt = desenvolver(txt); // si vino como JSON o dentro de ```…```, saca solo el texto
    txt = txt.replace(/^["'“”]+|["'“”]+$/g, '').trim(); // quita comillas envolventes
    // La IA decide que no hay que insistir (conversación cerrada / venta hecha).
    if (/^nada[.!]?$/i.test(txt)) return 'NADA';
    return txt.slice(0, 500);
  } catch { return ''; }
}

/**
 * Si la tienda tiene IA disponible y el chat lo atiende el asistente,
 * genera la respuesta con el contexto de la tienda y la envía.
 */
export async function maybeAutoReply(storeId: string, leadId: string) {
  const ia = resolverTexto(storeId); // DeepSeek escribe (o el proveedor de la tienda)
  if (!ia) {
    console.log('[ia] sin IA configurada para la tienda (ni clave propia ni del servidor): el asistente no responde');
    registrarLog(storeId, 'warn', 'ia', 'El asistente NO respondió: no hay IA configurada (falta la API key de DeepSeek/OpenAI en Integraciones).', leadId);
    return;
  }
  const lead = db.prepare('SELECT id, nombre, asignado, wa_id, tel, pendiente_info FROM leads WHERE id = ?').get(leadId) as
    | { id: string; nombre: string; asignado: string; wa_id: string | null; tel: string; pendiente_info: string }
    | undefined;
  if (!lead) return;
  if (!/asistente|bot/i.test(lead.asignado)) {
    console.log(`[ia] el chat lo atiende "${lead.asignado}": no respondo (usa "Devolver al asistente")`);
    return;
  }
  const t0 = Date.now(); // para que el bot tarde ~4-5 s en responder (más humano)

  const assistant = db.prepare('SELECT instrucciones, reglas, nombre, estilo FROM assistants WHERE store_id = ?').get(storeId) as
    | { instrucciones: string; reglas: string; nombre: string; estilo: string }
    | undefined;
  const store = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined;
  const productRows = db.prepare('SELECT * FROM products WHERE store_id = ?').all(storeId) as Record<string, unknown>[];
  const products = productRows.map((p) => {
    const vars = (db.prepare('SELECT label, stock FROM variants WHERE product_id = ?').all(p.id as string) as { label: string; stock: number }[])
      .map((v) => `${v.label} (${v.stock} disp.)`).join(', ');
    const reglas = pj<string[]>(p.reglas as string, []).map((r) => `  · Regla: ${r}`).join('\n');
    const faqs = pj<{ pregunta: string; respuesta: string }[]>(p.faqs as string, []).map((f) => `  · P: ${f.pregunta} → R: ${f.respuesta}`).join('\n');
    const bloques = pj<{ tipo: string; valor?: string }[]>(p.mensaje_bloques as string, [])
      .filter((b) => b.tipo === 'texto').map((b) => b.valor || '').join(' ');
    const guion = bloques || (p.mensaje_inicial as string);
    const combos = pj<{ cantidad: number; precio: number; etiqueta?: string }[]>(p.bundles as string, [])
      .map((b) => `  · Combo: ${b.cantidad} por $${Number(b.precio).toLocaleString('es-CO')} COP${b.etiqueta ? ` (${b.etiqueta})` : ''}`).join('\n');
    const opciones = pj<{ nombre: string; valores: (string | { valor: string; foto?: string })[] }[]>(p.opciones as string, [])
      .filter((o) => o.nombre && o.valores?.length)
      .map((o) => `  ${o.nombre}: ${o.valores.map((v) => (typeof v === 'string' ? v : v.valor + (v.foto ? ' 📷' : ''))).join(', ')}`).join('\n');
    const extra = [p.descripcion && `  Descripción: ${p.descripcion}`, p.caracteristicas && `  Características: ${p.caracteristicas}`,
      p.contenido_paquete && `  Contenido del paquete: ${p.contenido_paquete}`,
      p.modos_uso && `  Modo de uso: ${p.modos_uso}`, opciones && `  Opciones disponibles (📷 = tiene foto propia):\n${opciones}`,
      guion && `  Si preguntan por este producto, preséntalo así: ${guion}`]
      .filter(Boolean).join('\n');
    const esServicio = p.tipo === 'servicio';
    const precioTxt = Number(p.precio) > 0 ? `$${Number(p.precio).toLocaleString('es-CO')} COP` : 'gratis';
    if (esServicio) {
      // Un servicio: precio + duración, sin stock ni variantes.
      const dur = p.duracion ? ` · duración: ${p.duracion}` : '';
      return `- ${p.nombre} (servicio): ${precioTxt}${dur}.${extra ? '\n' + extra : ''}${reglas ? '\n' + reglas : ''}${faqs ? '\n' + faqs : ''}`;
    }
    const variantesTxt = opciones ? '' : ` Variantes: ${vars || 'única'}.`;
    return `- ${p.nombre}: ${precioTxt}.${variantesTxt}${extra ? '\n' + extra : ''}${combos ? '\n' + combos : ''}${reglas ? '\n' + reglas : ''}${faqs ? '\n' + faqs : ''}`;
  }).join('\n');
  const promos = (db.prepare('SELECT titulo, descripcion FROM promos WHERE store_id = ? AND activa = 1').all(storeId) as { titulo: string; descripcion: string }[])
    .map((p) => `- ${p.titulo}: ${p.descripcion}`).join('\n');
  const reglas = pj<string[]>(assistant?.reglas || '[]', []).map((r) => `- ${r}`).join('\n');

  // IA híbrida: DeepSeek no oye ni ve. Si el cliente mandó una nota de voz o una
  // foto SIN texto, usamos OpenAI para convertirla a texto y guardarlo en el
  // propio mensaje, para que la IA de texto pueda responderla.
  const umedia = db.prepare("SELECT id, texto, tipo, media_url FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 1").get(leadId) as
    | { id: string; texto: string; tipo: string; media_url: string | null }
    | undefined;
  if (umedia && umedia.media_url && !String(umedia.texto || '').trim() && (umedia.tipo === 'audio' || umedia.tipo === 'image')) {
    const reconocido = umedia.tipo === 'audio'
      ? await transcribirAudio(storeId, umedia.media_url)
      : await entenderImagen(storeId, umedia.media_url);
    if (reconocido) {
      const guardar = umedia.tipo === 'audio' ? reconocido : `[El cliente envió una foto: ${reconocido}]`;
      db.prepare('UPDATE messages SET texto = ? WHERE id = ?').run(guardar, umedia.id);
      console.log(`[ia] ${umedia.tipo} → texto (OpenAI): ${reconocido.slice(0, 90)}`);
    }
  }

  const marca = store?.nombre || 'la tienda';
  const asistenteNombre = (assistant?.nombre || '').trim();
  const identidad = asistenteNombre
    ? `IDENTIDAD OBLIGATORIA (tiene prioridad sobre todo lo demás): te llamas "${asistenteNombre}" y atiendes por WhatsApp en nombre de "${marca}". Preséntate y saluda SIEMPRE como "${asistenteNombre}" (de ${marca}). NUNCA uses otro nombre propio ni el de otra marca; si más abajo aparece otro, ignóralo.`
    : `IDENTIDAD OBLIGATORIA (tiene prioridad sobre todo lo demás): trabajas EXCLUSIVAMENTE para la tienda "${marca}". Preséntate y saluda SIEMPRE con el nombre "${marca}". Si más abajo (en las instrucciones, ejemplos, mensajes iniciales o el historial) aparece el nombre de OTRA tienda, IGNÓRALO por completo y reemplázalo mentalmente por "${marca}". NUNCA saludes ni te presentes con el nombre de otra tienda.`;

  const system = `Eres ${asistenteNombre ? `"${asistenteNombre}", el asistente por WhatsApp de "${marca}"` : `el asistente de ventas por WhatsApp de la tienda "${marca}"`}.

${identidad}

${assistant?.instrucciones || 'Atiende con calidez y ayuda a cerrar la venta.'}

REGLAS GENERALES DE LA TIENDA:
${reglas || '- Sé honesto y claro.'}

MUY IMPORTANTE: cada producto puede tener sus PROPIAS reglas (aparecen como "· Regla:" dentro de él). Esas reglas del producto son EXCEPCIONES y tienen PRIORIDAD sobre las reglas generales. Ejemplo: si la regla general dice que no se venden 2 unidades, pero un producto tiene una regla que sí permite llevar 2 por cierto precio, respeta la del producto. Usa siempre la descripción, características, modo de uso, combos, precios y reglas EXACTAS del producto del catálogo; no inventes ni generalices.

CATÁLOGO (precios en COP):
${products || '(sin productos cargados aún)'}

FUENTE DE VERDAD: el CATÁLOGO de arriba es la ÚNICA fuente válida y ES EL ACTUAL de esta tienda (el dueño lo edita y cambia con el tiempo). Si mensajes anteriores de este chat mencionan productos, precios, combos o textos que YA NO están en este catálogo, IGNÓRALOS por completo: quedaron viejos. NUNCA mezcles información de un producto con otro; responde solo con los datos del producto exacto por el que preguntan, tal como aparece hoy en el catálogo.

PROMOS ACTIVAS:
${promos || '(ninguna)'}

Estás chateando por WhatsApp; sin inventar productos ni precios que no estén en el catálogo. El cliente se llama ${lead.nombre}.
${estiloDirectiva(assistant?.estilo)}

FORMATO DE RESPUESTA (OBLIGATORIO): responde SIEMPRE en texto plano normal, como se escribe por WhatsApp. NUNCA respondas en JSON, ni uses llaves { } ni bloques de código con acentos graves (\`\`\`). No incluyas campos como "text" u "order". Para registrar un pedido usa EXCLUSIVAMENTE el marcador ##PEDIDO en su propia línea, tal como se indica; jamás escribas el pedido como JSON.

PRODUCTO CORRECTO (muy importante): si el cliente nombra un producto de forma general y en el CATÁLOGO hay VARIOS productos que coinciden con ese nombre (por ejemplo pide "jogger" y existen "Jogger Bota Recta Hombre", "Jogger Bota Recta Dama", "Jogger Clásico", "Jogger Clásico Dama"), NO adivines ni elijas uno al azar: pregúntale al cliente CUÁL de esos modelos exactos quiere y NO envíes fotos ni pongas el marcador todavía. Solo cuando quede claro el modelo exacto, usa su NOMBRE EXACTO del catálogo en el marcador con el formato ##MEDIA:Nombre exacto del producto## (siempre con dos puntos y el nombre; nunca "##MEDIA" suelto).

FOTOS Y VIDEOS: cuando el cliente pregunte o muestre interés en un producto específico (aunque lo nombre de forma informal, ej. "la camisa"), incluye al inicio de tu respuesta, en una línea sola, el marcador ##MEDIA:Nombre exacto del producto del catálogo## y luego una frase MUY corta de cierre (una pregunta). Si el cliente pide en general "fotos", "imágenes", "más fotos", "videos" o material del producto SIN nombrar un color, usa SIEMPRE ##MEDIA:Nombre exacto## (sin barra ni color): el sistema envía TODAS las fotos y videos. Usa ##MEDIA:Nombre del producto|Color## SOLO si pide expresamente la foto de un color específico Y ese color muestra 📷 en el catálogo. Si el color que pide NO tiene 📷, NO prometas enviar su foto ni pongas el marcador: dile con amabilidad que puedes mostrarle el catálogo de colores o las fotos generales, y ofrécelas con ##MEDIA:Nombre exacto##. El sistema envía la multimedia automáticamente; no digas que "no puedes enviar fotos".

CERRAR EL PEDIDO: cuando el cliente confirme que quiere comprar Y ya tengas su NOMBRE, CIUDAD y DIRECCIÓN, agrega al final de tu respuesta, en una línea sola, EXACTAMENTE con este formato:
##PEDIDO cliente="Nombre Apellido"; departamento="Departamento"; ciudad="Ciudad"; direccion="Dirección exacta con punto de referencia"; items="2x Nombre exacto del producto (Talla M · Negro, Gris), 1x Otro producto (Talla L · Rojo)"; total="180000"##
El campo total es el precio TOTAL acordado del pedido en números (sin puntos ni signos).
En items incluye SIEMPRE, entre paréntesis, la talla, el color y cualquier opción que el cliente eligió para cada producto — el vendedor necesita ese detalle completo para despachar.
El campo departamento es OBLIGATORIO: en Colombia hay ciudades con el mismo nombre en varios departamentos. Si el cliente no lo ha dicho, pregúntaselo antes de cerrar el pedido.
Reglas del marcador: usa comillas dobles normales ("), NO uses JSON, NO uses llaves {}, NO uses barras invertidas (\\), NO escapes las comillas. Usa los nombres EXACTOS de los productos del catálogo y las cantidades acordadas. No lo menciones ni lo muestres al cliente; el sistema registra el pedido solo y le confirma. Ponlo una sola vez, cuando de verdad tengas nombre y dirección; si te falta algún dato, pídelo primero.
FLUJO OBLIGATORIO DEL CIERRE: primero muestra el "Resumen de tu pedido" y pregunta "¿Confirmas que los datos están correctos?". En cuanto el cliente confirme (diga "sí", "sisas", "dale", "correcto", "confirmo", etc.), tu SIGUIENTE mensaje DEBE incluir el marcador ##PEDIDO...## SÍ o SÍ (con los datos del resumen). Nunca digas "el sistema procesará tu pedido" o "te llegará la confirmación" sin haber puesto el marcador en ESE mismo mensaje.

NO ENTRES EN BUCLE DE CONFIRMACIÓN: un "sí", "confirmo", "correcto", "dale" del cliente confirma EL PEDIDO, aunque lo haya dicho justo después de que le pediste un dato suelto (como el punto de referencia). Si ya mostraste el resumen y tienes nombre, ciudad y dirección, ese "sí" cierra la venta: pon el marcador ##PEDIDO. JAMÁS vuelvas a preguntar "¿confirmas?" ni pidas de nuevo datos que el cliente ya te dio. Nunca pidas confirmación dos veces seguidas.

FORMATO DE TU RESPUESTA: responde SIEMPRE en texto plano, exactamente lo que verá el cliente. NUNCA respondas en formato JSON, NUNCA empieces con «text:» o «"text":», y NUNCA encierres toda tu respuesta entre comillas. Escribe el mensaje directo, nada más.

OBLIGATORIO SOBRE EL PEDIDO: NUNCA le digas al cliente que su pedido "quedó registrado", "ya está creado", "confirmado" o similar si en ESE MISMO mensaje no incluiste el marcador ##PEDIDO ...##. Si todavía te falta el nombre, la ciudad o la dirección exacta, pídelos primero y NO afirmes que el pedido quedó registrado. El mensaje de confirmación al cliente lo envía el sistema automáticamente, no lo escribas tú.`;

  const nombreMedia = (tipo: string) =>
    tipo === 'audio' ? 'una nota de voz' : tipo === 'image' ? 'una imagen' : tipo === 'video' ? 'un video' : 'un archivo';
  const historia = (db.prepare('SELECT de, texto, tipo FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 16').all(leadId) as { de: string; texto: string; tipo: string }[])
    .reverse()
    .map((m) => ({
      role: m.de === 'cliente' ? ('user' as const) : ('assistant' as const),
      // Limpiamos respuestas viejas mal formateadas ("text": "...") para que el modelo no las copie.
      content: (m.de === 'cliente' ? m.texto : desenvolver(m.texto || '')) || (m.tipo && m.tipo !== 'texto' ? `[el cliente envió ${nombreMedia(m.tipo)}]` : ''),
    }))
    .filter((m) => m.content);

  // Si el último mensaje del cliente es multimedia sin texto (nota de voz, foto…),
  // DeepSeek no lo puede oír/ver: le pedimos que responda igual, pidiendo texto.
  const ultimo = db.prepare("SELECT texto, tipo FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 1").get(leadId) as
    | { texto: string; tipo: string }
    | undefined;
  const mediaSinTexto = !!ultimo && ultimo.tipo !== 'texto' && !String(ultimo.texto || '').trim();
  const systemFinal = mediaSinTexto
    ? `${system}\n\nEl cliente acaba de enviar ${nombreMedia(ultimo!.tipo)} que NO puedes ${ultimo!.tipo === 'audio' ? 'escuchar' : 'ver'}. Salúdalo con calidez y pídele amablemente que te escriba por texto su pregunta o qué producto le interesa. No digas que eres una IA.`
    : system;

  const destino = lead.wa_id || lead.tel;
  const pn = lead.tel; // número real, para que WhatsApp entregue (resuelve el LID)
  const activos = productRows.filter((p) => Number(p.mensaje_inicial_activo) !== 0);
  const nombreCorto = lead.nombre ? ' ' + String(lead.nombre).split(' ')[0] : '';
  // Envía un mensaje del bot al cliente (lo guarda y lo manda por WhatsApp).
  const responder = async (texto: string) => {
    const tt = rellenar(texto, lead);
    const mid = uid();
    db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(mid, leadId, 'bot', tt);
    marcarEnviado(mid, await sendWhatsappText(storeId, destino, tt, pn));
  };
  const limpiarPendiente = () => db.prepare("UPDATE leads SET pendiente_info = '' WHERE id = ?").run(leadId);

  // Disparador: SOLO cuando el mensaje del cliente coincide de verdad con la
  // frase disparadora del producto (la de los anuncios). Un simple "hola" no
  // dispara: exigimos que la mayoría de las palabras del disparador estén en
  // el mensaje (o que sea idéntico), no que compartan una palabra suelta.
  let presentacionEnviada = false;
  if (ultimo?.tipo === 'texto' && ultimo.texto) {
    const t = norm(ultimo.texto);
    const tWords = new Set(t.split(' ').filter(Boolean));
    // Puntuamos CADA producto por su disparador y disparamos SOLO el mejor. Antes
    // se disparaban TODOS los que pasaran el umbral, así que "blusas Noelia" podía
    // enviar también el flujo de "blusas Sara". Ahora gana uno solo.
    const candidatos = activos
      .map((p) => {
        const disp = norm(String(p.disparador || ''));
        if (disp.length < 6) return { p, score: 0 }; // sin disparador configurado, no dispara
        const dWords = disp.split(' ').filter((w) => w.length >= 3);
        if (!dWords.length) return { p, score: 0 };
        const overlap = dWords.filter((w) => tWords.has(w)).length / dWords.length;
        // Exacto o contenido = máxima; si no, el % de palabras del disparador presentes.
        const score = t === disp || t.includes(disp) ? 1 + disp.length / 10000 : overlap;
        return { p, score };
      })
      .filter((c) => c.score >= 0.75)
      .sort((a, b) => b.score - a.score);
    const mejor = candidatos[0];
    // Si dos productos DISTINTOS quedan casi empatados (dos "blusas" parecidas), NO
    // disparamos ninguno: dejamos que la IA pregunte cuál, en vez de enviar los dos.
    const ambiguo = !!(mejor && candidatos[1] && candidatos[1].score >= mejor.score - 0.1 && String(candidatos[1].p.id) !== String(mejor.p.id));
    if (mejor && !ambiguo) {
      if (await enviarPresentacion(storeId, leadId, destino, mejor.p, pn)) presentacionEnviada = true;
    }
  }

  // Si el disparador ya envió el mensaje inicial completo, la conversación
  // termina en el último bloque de esa estructura: NO llamamos a la IA para
  // que no agregue una pregunta redundante encima de la presentación.
  if (presentacionEnviada) { limpiarPendiente(); return; }

  // Disparador interno "Más información": el CTA de los anuncios no coincide con
  // el disparador específico. Cuando el cliente lo toca, el bot está OBLIGADO a
  // preguntarle sobre CUÁL producto/servicio quiere info; cuando el cliente lo
  // elige (o dice que sí), se dispara el mensaje inicial tal cual.
  if (ultimo?.tipo === 'texto' && String(ultimo.texto || '').trim() && activos.length) {
    const t = String(ultimo.texto);

    if (lead.pendiente_info) {
      // Ya le preguntamos: intentamos identificar el producto elegido.
      let elegido = identificarProducto(t, activos);
      // Si le propusimos UN producto y solo dijo "sí/dale/eso", ese es.
      if (!elegido && lead.pendiente_info !== 'ASK' && esAfirmacion(t)) {
        elegido = activos.find((p) => String(p.id) === lead.pendiente_info) || null;
      }
      limpiarPendiente(); // salimos del estado pase lo que pase (no quedar pegados)
      if (elegido && (await enviarPresentacion(storeId, leadId, destino, elegido, pn))) return;
      // Si no lo identificamos, seguimos al flujo normal de IA (que puede ayudar).
    } else if (esMasInfo(t)) {
      const directo = identificarProducto(t, activos); // ¿nombró el producto en el mismo mensaje?
      if (directo) {
        if (await enviarPresentacion(storeId, leadId, destino, directo, pn)) return;
        // Lo nombró pero no hay piezas que enviar: que la IA atienda.
      } else {
        // Obligatorio: preguntar sobre cuál producto/servicio quiere la información.
        await esperarRespuestaHumana(t0);
        if (activos.length === 1) {
          db.prepare('UPDATE leads SET pendiente_info = ? WHERE id = ?').run(String(activos[0].id), leadId);
          await responder(`¡Hola${nombreCorto}! 😊 Con gusto te doy toda la información. ¿Te interesa nuestro ${String(activos[0].nombre)}?`);
        } else {
          const lista = activos.slice(0, 6).map((p) => `• ${String(p.nombre)}`).join('\n');
          const extra = activos.length > 6 ? '\n\nO dime cuál viste en el anuncio 🙂' : '';
          db.prepare("UPDATE leads SET pendiente_info = 'ASK' WHERE id = ?").run(leadId);
          await responder(`¡Hola${nombreCorto}! 😊 ¡Claro! ¿Sobre cuál de estos quieres información?\n\n${lista}${extra}`);
        }
        return;
      }
    }
  }

  try {
    const res = await fetch(ia.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ia.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ia.model, messages: [{ role: 'system', content: systemFinal }, ...historia], max_tokens: 700, temperature: 0.7 }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      console.error(`[ia] ${ia.proveedor} respondió`, res.status, detalle);
      registrarLog(storeId, 'error', 'ia', `La IA (${ia.proveedor}) falló (HTTP ${res.status}). Revisa la API key o el saldo. ${String(detalle).slice(0, 160)}`, leadId);
      return;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const brutoRaw = body.choices?.[0]?.message?.content?.trim();
    if (!brutoRaw) return;
    // A veces DeepSeek envuelve su respuesta como JSON ("text": "..."). La
    // desenvolvemos para no mandar esa basura al cliente ni contaminar el marcador.
    const bruto = desenvolver(brutoRaw);

    // La IA marca cuándo debe enviar fotos. Toleramos TODAS las variantes para que
    // el marcador NUNCA se le escape crudo al cliente: ##MEDIA:Nombre##,
    // ##MEDIA:Nombre|Valor##, ##MEDIA## e incluso "##media" suelto (sin nombre ni cierre).
    // El nombre solo se toma tras ':' (así "##media" suelto no se traga la frase de cierre).
    const marca = /##\s*MEDIA\b\s*(?::\s*([^#\n]*))?\s*(?:##)?/i;
    const marcaStrip = /##\s*MEDIA\b\s*(?::\s*[^#\n]*)?\s*(?:##)?/gi;
    // El pedido va en su propia línea; capturamos hasta el fin de línea porque
    // la dirección puede tener '#'. No dependemos de un cierre '##'.
    const marcaPed = /##\s*PEDIDO\b([^\n]*)/i;
    const m = bruto.match(marca);
    const mp = bruto.match(marcaPed);
    const texto = bruto.replace(marcaStrip, '').replace(/[^\n]*##\s*PEDIDO\b[^\n]*/gi, '').replace(/```+/g, '').replace(/[ \t]{2,}/g, ' ').trim();
    // ¿Enviamos fotos? Sí si la IA puso el marcador (con o sin nombre) o si el
    // cliente pidió fotos explícitamente (red de seguridad, igual que la del pedido).
    const nombreMarca = m && m[1] ? m[1].replace('|', ' ').trim() : '';
    const pidioMedia = ultimo?.tipo === 'texto' && pidioFotos(ultimo?.texto || '');
    if (m || pidioMedia) {
      // De QUÉ producto: el nombre del marcador; si no trae nombre, el texto del
      // cliente; si aún no resuelve, el último producto hablado en el chat; y si la
      // tienda tiene un solo producto activo, ese.
      const r0 = resolverProductoYColor(nombreMarca || ultimo?.texto || '', productRows);
      let prod = r0.prod;
      const valName = r0.valName;
      if (!prod) {
        const contexto = historia.map((h) => h.content).filter(Boolean).join(' ');
        prod = resolverProductoYColor(contexto, productRows).prod || (activos.length === 1 ? activos[0] : null);
      }
      if (prod) {
        const foto = valName ? fotoDeOpcion(prod, valName) : null;
        if (foto) {
          // Color con foto propia → esa foto exacta.
          await enviarUnaFoto(storeId, leadId, destino, foto, pn);
        } else if (valName) {
          // Color sin foto propia → una sola imagen de referencia (catálogo de colores), nunca el saludo.
          const ref = fotoReferencia(prod);
          if (ref) await enviarUnaFoto(storeId, leadId, destino, ref, pn);
        } else {
          // Piden fotos en general → todas las fotos/videos sueltos; si no hay, el catálogo de referencia.
          const enviadas = await enviarMediaProducto(storeId, leadId, destino, prod, pn);
          if (!enviadas) {
            const ref = fotoReferencia(prod);
            if (ref) await enviarUnaFoto(storeId, leadId, destino, ref, pn);
          }
        }
      }
    }
    let pedidoCreado = mp ? await crearPedido(storeId, lead, mp[1], productRows, destino, pn) : false;

    // RED DE SEGURIDAD: la IA mostró el "Resumen de tu pedido" y el cliente confirmó
    // (sí/sisas/dale/correcto…), pero la IA NO puso el marcador o lo puso mal. Tomamos
    // el pedido del último resumen que envió la IA, para no perder ventas ni quedar en
    // un bucle de "¿confirmas?". Aplica aunque hubiera un marcador fallido (mp): el
    // guard anti-duplicado de crearPedido evita crear dos.
    if (!pedidoCreado && esAfirmacion(ultimo?.texto || '')) {
      const inner = pedidoDesdeResumen(leadId);
      if (inner) pedidoCreado = await crearPedido(storeId, lead, inner, productRows, destino, pn);
    }

    // Si se creó el pedido, el mensaje de confirmación ya lo mandó crearPedido;
    // no repetimos con el texto de la IA.
    if (texto && !pedidoCreado) {
      const textoFinal = rellenar(texto, lead);
      await esperarRespuestaHumana(t0); // el bot tarda ~4-5 s en total (parece que "escribe")
      const mid = uid();
      db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(mid, leadId, 'bot', textoFinal);
      const send = await sendWhatsappText(storeId, destino, textoFinal, pn);
      marcarEnviado(mid, send);
      if (send.ok) { console.log('[ia] respuesta enviada por WhatsApp'); registrarLog(storeId, 'info', 'respuesta', 'El asistente respondió al cliente.', leadId); }
      else console.error('[ia] respuesta generada pero NO enviada:', send.error, '| destino:', destino);
    }
  } catch (e) {
    console.error(`[ia] error llamando a ${ia.proveedor}`, e);
    registrarLog(storeId, 'error', 'ia', `Error inesperado generando la respuesta del asistente: ${String((e as Error)?.message || e).slice(0, 160)}`, leadId);
  }
}

/**
 * Si DeepSeek envuelve la respuesta como JSON ({"text":"..."}) o empieza con
 * «text: "..."», recupera solo el mensaje real en texto plano. Si no hay
 * envoltura, devuelve el texto tal cual.
 */
const CLAVES_TEXTO = 'text|mensaje|respuesta|reply|message|content';
function desescapar(v: string): string {
  return v.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
}
/**
 * A veces la IA envuelve su respuesta como JSON ("text": "...") o dentro de un
 * bloque de código ```json ... ```; y a veces ese JSON llega CORTADO (por el
 * límite de tokens). Aquí SIEMPRE sacamos solo el texto para el cliente y NUNCA
 * dejamos escapar llaves/JSON/backticks crudos.
 */
export function desenvolver(s: string): string {
  let t = s.trim();
  // 1) Quitar cercos de código markdown: ```json ... ``` o ``` ... ``` (aunque el
  //    cierre falte porque la respuesta se cortó).
  const conCerco = t.match(/^```(?:json|txt|text)?\s*([\s\S]*?)\s*```$/i);
  if (conCerco) t = conCerco[1].trim();
  else if (/^```/.test(t)) t = t.replace(/^```(?:json|txt|text)?\s*/i, '').trim();

  const pareceJson = t.startsWith('{') || new RegExp('^"?(?:' + CLAVES_TEXTO + ')"?\\s*:', 'i').test(t);
  if (pareceJson) {
    // 2a) Intento de parseo completo (JSON bien formado).
    if (t.startsWith('{') && t.endsWith('}')) {
      try {
        const o = JSON.parse(t) as Record<string, unknown>;
        for (const k of ['text', 'mensaje', 'respuesta', 'reply', 'message', 'content']) {
          if (typeof o[k] === 'string') return (o[k] as string).trim();
        }
      } catch { /* seguimos con extracción tolerante */ }
    }
    // 2b) JSON cortado o con más campos (ej: {"text":"...","order":{...}): sacamos
    //     el valor de "text" aunque después venga "order". Soporta escapes.
    const m = t.match(new RegExp('"?(?:' + CLAVES_TEXTO + ')"?\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"', 'i'));
    if (m) return desescapar(m[1]);
    // 2c) Empezaba como JSON pero no pudimos sacar el texto: NO mandamos el crudo.
    return '';
  }
  return s;
}

/** Reemplaza placeholders tipo {{phone}} / {{nombre}} por los datos reales del cliente. */
function rellenar(texto: string, lead: { nombre?: string; tel?: string }): string {
  return texto
    .replace(/\{\{\s*(phone|telefono|teléfono|celular|whatsapp|tel|numero|número)\s*\}\}/gi, lead.tel || '')
    .replace(/\{\{\s*(nombre|name|cliente|client|customer)\s*\}\}/gi, lead.nombre || '')
    .replace(/\{\{\s*[^}]*\}\}/g, '') // cualquier otro placeholder no resuelto: se quita
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Quita comillas, barras invertidas, llaves y demás restos si la IA formatea de más. */
function limpiarValor(v: string): string {
  return v.replace(/\\+/g, '').replace(/^[\s"'`{}[\]]+|[\s"'`{}[\]]+$/g, '').trim();
}
function campoPedido(s: string, k: string): string {
  // Primero el valor entre comillas (tolera el # de las direcciones colombianas),
  // y si no, hasta el siguiente ';'.
  const q = s.match(new RegExp(k + '\\s*[:=]\\s*"([^"]+)"', 'i'));
  if (q) return limpiarValor(q[1]);
  const u = s.match(new RegExp(k + '\\s*[:=]\\s*([^;]+)', 'i'));
  return u ? limpiarValor(u[1]) : '';
}

/** ¿El cliente está confirmando (sí, sisas, dale, correcto…)? Mensajes cortos. */
function esAfirmacion(t: string): boolean {
  const s = norm(t);
  if (!s || s.length > 45) return false;
  const words = new Set(s.split(' ').filter(Boolean));
  const yes = ['si', 'sisas', 'sisa', 'sip', 'sipi', 'claro', 'dale', 'dalee', 'listo', 'correcto', 'confirmo', 'confirmado', 'ok', 'oka', 'okay', 'okey', 'eso', 'vale', 'va', 'sale', 'perfecto', 'hagale', 'deacuerdo', 'acuerdo', 'positivo', 'afirmativo'];
  if (yes.some((y) => words.has(y))) return true;
  return /\b(si|sisas|dale|listo|correcto|confirm\w*|perfecto|de una|hagale|todo bien|esta bien|asi es)\b/.test(s);
}

/**
 * Detecta el CTA genérico de los anuncios ("Más información", "Info", "Me
 * interesa"…), que NO coincide con el disparador específico de ningún producto.
 * Solo mensajes cortos: una frase larga con "más información sobre el envío" no
 * debe activar el disparador interno de producto.
 */
function esMasInfo(t: string): boolean {
  const s = norm(t);
  if (!s || s.split(' ').length > 5) return false;
  if (/\b(mas)\s+(info\w*|detalle\w*)\b/.test(s)) return true;
  if (/\binformacion\b/.test(s)) return true;
  if (/\b(me interesa|quiero saber|quiero mas|deseo informacion|necesito informacion|mas detalles)\b/.test(s)) return true;
  return ['info', 'mas info', 'interesado', 'interesada', 'informes'].includes(s);
}

/**
 * Intenta identificar de qué producto habla el cliente, casando su mensaje con
 * el NOMBRE o el disparador de cada producto activo. Devuelve null si no hay una
 * coincidencia clara o si hay empate entre dos productos (para no adivinar).
 */
function identificarProducto(t: string, activos: Record<string, unknown>[]): Record<string, unknown> | null {
  const tn = norm(t);
  if (!tn) return null;
  const tWords = new Set(tn.split(' ').filter(Boolean));
  const puntuar = (cand: string): number => {
    const cn = norm(cand);
    if (cn.length < 3) return 0;
    if (tn.includes(cn)) return 1;
    const words = cn.split(' ').filter((w) => w.length >= 3);
    if (!words.length) return 0;
    return words.filter((w) => tWords.has(w)).length / words.length;
  };
  const scored = activos
    .map((p) => ({ p, s: Math.max(puntuar(String(p.nombre || '')), puntuar(String(p.disparador || ''))) }))
    .sort((a, b) => b.s - a.s);
  if (!scored.length || scored[0].s < 0.6) return null;
  if (scored[1] && scored[1].s >= scored[0].s - 0.01) return null; // empate → no adivinar
  return scored[0].p;
}

/** Limpia un valor tomado del "Resumen de tu pedido": quita asteriscos y emojis del inicio. */
function limpiarResumen(v: string): string {
  return v.replace(/[*_`]/g, '').replace(/^[^\p{L}\p{N}$#]+/u, '').replace(/\s+$/g, '').replace(/[,;]+$/, '').trim();
}
/** Extrae un campo del resumen por su etiqueta (Nombre, Ciudad, Dirección…). */
function campoResumen(txt: string, etiqueta: string): string {
  const m = txt.match(new RegExp('\\*?\\s*' + etiqueta + '[^:*]*:\\*?\\s*([^*\\n]+)', 'i'));
  return m ? limpiarResumen(m[1]) : '';
}

/**
 * RED DE SEGURIDAD: reconstruye el pedido a partir del último "Resumen de tu
 * pedido" que envió la IA, para cuando el cliente confirma pero la IA no puso
 * el marcador ##PEDIDO##. Devuelve el "inner" listo para crearPedido, o ''.
 */
function pedidoDesdeResumen(leadId: string): string {
  // Miramos bastante atrás: si el bot re-preguntó "¿confirmas?" varias veces, el
  // "Resumen de tu pedido" real pudo quedar varios mensajes atrás.
  const rows = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'bot' AND texto != '' ORDER BY created_at DESC LIMIT 16").all(leadId) as { texto: string }[];
  const resumen = rows.map((r) => r.texto).find((t) => /resumen/i.test(t) && /(direcc|total|ciudad)/i.test(t));
  if (!resumen) return '';
  const cliente = campoResumen(resumen, 'Nombre');
  const ciudad = campoResumen(resumen, 'Ciudad');
  const direccion = campoResumen(resumen, 'Direcci');
  const total = (campoResumen(resumen, 'Total').match(/\d/g) || []).join('');
  const prodField = campoResumen(resumen, 'Producto') || resumen;
  const items: string[] = [];
  // Conserva el detalle (talla/color) que viene tras el nombre: "3 x Bota — Talla: L — Negro, Camel"
  // se convierte en "3x Bota (Talla: L · Negro, Camel)" para que el pedido quede completo.
  const re = /(\d+)\s*[xX×]\s*(.+?)(?=\s+\d+\s*[xX×]|$)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(prodField))) {
    const trozos = mm[2].split(/\s*[—–]\s*/).map((t) => t.trim()).filter(Boolean);
    const base = trozos[0] || mm[2].trim();
    const detalle = trozos.slice(1).join(' · ');
    items.push(detalle ? `${mm[1]}x ${base} (${detalle})` : `${mm[1]}x ${base}`);
  }
  if (!items.length || (!direccion && !ciudad)) return '';
  const departamento = campoResumen(resumen, 'Departamento');
  console.log(`[ia] pedido tomado del resumen (la IA no puso el marcador) para lead ${leadId}`);
  return ` cliente="${cliente}"; departamento="${departamento}"; ciudad="${ciudad}"; direccion="${direccion}"; items="${items.join(', ')}"; total="${total}"`;
}

/** Registra el pedido cuando la IA cierra la venta y le confirma al cliente. Devuelve true si lo creó. */
export interface PedidoItem { qty: number; nombre: string; precio: number }
export interface PedidoExtraido { cliente: string; departamento: string; ciudad: string; direccion: string; items: PedidoItem[]; total: number }

/**
 * Convierte el "inner" de un ##PEDIDO (o del resumen) en datos estructurados,
 * casando cada ítem con un producto de la tienda para tomar su precio. NO escribe
 * nada: se usa para el flujo de "completar pedido desde el chat" (con revisión).
 */
export function parsearPedidoInner(storeId: string, inner: string): PedidoExtraido {
  const productRows = db.prepare('SELECT nombre, precio FROM products WHERE store_id = ?').all(storeId) as Record<string, unknown>[];
  const cliente = campoPedido(inner, 'cliente');
  const ciudad = campoPedido(inner, 'ciudad');
  const direccion = campoPedido(inner, 'direccion');
  const departamento = campoPedido(inner, 'departamento');
  const itemsRaw = campoPedido(inner, 'items');
  const partes: string[] = [];
  let buf = ''; let dentro = 0;
  for (const ch of itemsRaw) {
    if (ch === '(') dentro++;
    if (ch === ')') dentro = Math.max(0, dentro - 1);
    if (ch === ',' && dentro === 0) { partes.push(buf); buf = ''; } else buf += ch;
  }
  if (buf.trim()) partes.push(buf);
  const items = partes.map((s) => s.trim()).filter(Boolean).map((it) => {
    const mm = it.match(/(\d+)\s*[xX×]\s*(.+)/);
    const qty = mm ? parseInt(mm[1], 10) || 1 : 1;
    const completo = limpiarValor(mm ? mm[2] : it);
    const base = completo.split('(')[0].split('—')[0].trim().toLowerCase();
    const prod = productRows.find((p) => String(p.nombre).toLowerCase() === base)
      || productRows.find((p) => String(p.nombre).toLowerCase().includes(base) || base.includes(String(p.nombre).toLowerCase()));
    return { qty, nombre: completo, precio: prod ? Number(prod.precio) : 0 };
  }).filter((i) => i.nombre);
  const total = parseInt(campoPedido(inner, 'total').replace(/[^0-9]/g, ''), 10) || items.reduce((a, it) => a + it.qty * it.precio, 0);
  return { cliente, departamento, ciudad, direccion, items, total };
}

/**
 * Lee la conversación de un chat y pide a la IA extraer el pedido como marcador
 * ##PEDIDO. Primero intenta reconstruirlo del "Resumen de tu pedido" (determinista)
 * y, si no hay, usa el modelo. Devuelve el "inner" (sin escribir nada) o ''.
 */
export async function extraerPedidoDelChat(storeId: string, leadId: string): Promise<string> {
  // 1) Intento determinista: el resumen que ya envió el bot.
  const porResumen = pedidoDesdeResumen(leadId);
  if (porResumen) return porResumen;
  // 2) IA sobre la conversación.
  const ia = resolverTexto(storeId);
  if (!ia) return '';
  const productos = (db.prepare('SELECT nombre, precio FROM products WHERE store_id = ? LIMIT 80').all(storeId) as { nombre: string; precio: number }[])
    .map((p) => `- ${p.nombre}: ${Number(p.precio) > 0 ? '$' + Number(p.precio).toLocaleString('es-CO') : 'gratis'}`).join('\n');
  const historia = (db.prepare('SELECT de, texto, tipo FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 40').all(leadId) as { de: string; texto: string; tipo: string }[])
    .reverse()
    .map((m) => `${m.de === 'cliente' ? 'CLIENTE' : 'TIENDA'}: ${(m.texto || '').trim() || `[${m.tipo}]`}`)
    .filter((l) => l.length > 8)
    .join('\n');
  if (!historia.trim()) return '';
  const system = `Eres un extractor de pedidos de una tienda por WhatsApp en Colombia. Te doy una conversación y el catálogo. Devuelve EXCLUSIVAMENTE una línea con el marcador, sin explicaciones ni texto extra:
##PEDIDO cliente="Nombre y apellido"; departamento="Departamento"; ciudad="Ciudad"; direccion="Dirección exacta"; items="2x Nombre EXACTO del catálogo (Talla M · Negro), 1x Otro producto (Talla L · Rojo)"; total="139900"##
Reglas: usa SOLO datos que aparezcan en la conversación; NO inventes. Si un dato no está, déjalo vacío ("" ). En items pon la cantidad, el nombre EXACTO del catálogo y entre paréntesis la talla y el color que el cliente pidió. En total pon el valor final acordado (solo números). Si no hay un pedido real en la conversación, responde exactamente: SIN_PEDIDO`;
  try {
    const res = await fetch(ia.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ia.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ia.model, messages: [{ role: 'system', content: system }, { role: 'user', content: `CATÁLOGO:\n${productos || '(sin productos)'}\n\nCONVERSACIÓN:\n${historia}` }], max_tokens: 320, temperature: 0 }),
    });
    if (!res.ok) return '';
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let out = (body.choices?.[0]?.message?.content || '').trim();
    out = desenvolver(out) || out;
    if (/SIN_PEDIDO/i.test(out)) return '';
    const m = out.match(/##PEDIDO(.*?)##/s);
    return m ? m[1] : (/(cliente|items)\s*=/.test(out) ? out : '');
  } catch { return ''; }
}

async function crearPedido(storeId: string, lead: { id: string; nombre: string; tel: string }, inner: string, productRows: Record<string, unknown>[], destino: string, pn?: string): Promise<boolean> {
  const cliente = campoPedido(inner, 'cliente') || lead.nombre || 'Cliente';
  const ciudad = campoPedido(inner, 'ciudad');
  const direccion = campoPedido(inner, 'direccion');
  const itemsRaw = campoPedido(inner, 'items');
  // Departamento: si la IA no lo puso en el marcador, lo rescatamos del último
  // "Resumen de tu pedido" del chat (hay ciudades repetidas entre departamentos).
  let departamento = campoPedido(inner, 'departamento');
  if (!departamento) {
    const rows = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'bot' AND texto != '' ORDER BY created_at DESC LIMIT 8").all(lead.id) as { texto: string }[];
    const resumen = rows.map((r) => r.texto).find((t) => /departamento/i.test(t));
    if (resumen) departamento = campoResumen(resumen, 'Departamento');
  }
  // Los ítems pueden traer el detalle entre paréntesis: "2x Bota Recta (Talla M · Negro, Gris)".
  // Separamos por comas SOLO fuera de paréntesis para no partir la lista de colores.
  const partes: string[] = [];
  let buf = '';
  let dentro = 0;
  for (const ch of itemsRaw) {
    if (ch === '(') dentro++;
    if (ch === ')') dentro = Math.max(0, dentro - 1);
    if (ch === ',' && dentro === 0) { partes.push(buf); buf = ''; } else buf += ch;
  }
  if (buf.trim()) partes.push(buf);
  const items = partes.map((s) => s.trim()).filter(Boolean).map((it) => {
    const mm = it.match(/(\d+)\s*[xX×]\s*(.+)/);
    const qty = mm ? parseInt(mm[1], 10) || 1 : 1;
    const completo = limpiarValor(mm ? mm[2] : it); // nombre CON el detalle (talla/color)
    const base = completo.split('(')[0].split('—')[0].trim().toLowerCase(); // nombre solo, para buscar el precio
    const prod = productRows.find((p) => String(p.nombre).toLowerCase() === base)
      || productRows.find((p) => String(p.nombre).toLowerCase().includes(base) || base.includes(String(p.nombre).toLowerCase()));
    // Guardamos el nombre COMPLETO (con talla y color): el vendedor lo necesita para despachar.
    return { qty, nombre: completo, precio: prod ? Number(prod.precio) : 0 };
  }).filter((i) => i.nombre);
  if (!items.length || (!direccion && !ciudad)) return false; // datos insuficientes, esperamos

  // Evita duplicados si la IA repite el marcador: un pedido "Nuevo" por número en los últimos 10 min.
  const dup = db.prepare("SELECT id FROM orders WHERE store_id = ? AND tel = ? AND estado = 'Nuevo' AND created_at > datetime('now','-10 minutes')").get(storeId, lead.tel || '');
  if (dup) { console.log(`[ia] pedido no creado: ya hay uno reciente para ${lead.tel}`); return false; }

  const total = parseInt(campoPedido(inner, 'total').replace(/[^0-9]/g, ''), 10) || items.reduce((a, it) => a + it.qty * it.precio, 0);
  const numero = ((db.prepare('SELECT MAX(numero) n FROM orders WHERE store_id = ?').get(storeId) as { n: number | null }).n || 1048) + 1;
  const oid = uid();
  // Atribución exacta: copiamos el anuncio del que vino este chat al pedido.
  const adLead = db.prepare('SELECT ad_id, ad_ref FROM leads WHERE id = ?').get(lead.id) as { ad_id: string; ad_ref: string } | undefined;
  db.prepare('INSERT INTO orders (id, store_id, numero, cliente, ciudad, tel, direccion, estado, total, departamento, ad_id, ad_ref) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(oid, storeId, numero, cliente, ciudad, lead.tel || '', direccion, 'Nuevo', total, departamento, adLead?.ad_id || '', adLead?.ad_ref || '');
  for (const it of items) {
    db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio) VALUES (?,?,?,?,?)').run(uid(), oid, it.qty, it.nombre, it.precio);
  }
  db.prepare("UPDATE leads SET etapa = 'Listo para comprar', etiqueta = 'Venta' WHERE id = ?").run(lead.id);
  console.log(`[ia] pedido DF-${numero} creado para ${cliente} · ${items.map((i) => i.qty + 'x ' + i.nombre).join(', ')}`);
  registrarLog(storeId, 'info', 'pedido', `Pedido DF-${numero} creado para ${cliente} (${items.map((i) => i.qty + 'x ' + i.nombre).join(', ')}).`, lead.id);
  // Notifica al dueño por Web Push (app cerrada) con un resumen corto del pedido.
  {
    const nprod = items.reduce((a, i) => a + i.qty, 0);
    void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `Nuevo pedido DF-${numero} 🛒`, `${cliente} · $${total.toLocaleString('es-CO')} · ${nprod} producto${nprod === 1 ? '' : 's'}`, { url: '/' })).catch(() => {});
  }

  // Si la tienda tiene WooCommerce conectado, enviamos el pedido allí AUTOMÁTICAMENTE
  // (Effi/Dropi lo despachan desde WooCommerce). No bloquea la respuesta del bot y
  // es idempotente: si falla, el pedido igual queda en DealFlow y se puede reenviar
  // a mano desde el detalle del pedido.
  void (async () => {
    try {
      const woo = await import('./woocommerce.js');
      // Auto-despacho SIN botón: el proveedor preferido de la tienda (aunque haya dos
      // conectados) o, si no hay preferido, el único conectado. Con dos y sin preferido,
      // el dueño elige por pedido desde el detalle.
      const prov = woo.proveedorAutoDespacho(storeId);
      if (!prov) {
        if (woo.proveedoresConectados(storeId).length === 0) console.log('[woo] pedido no auto-enviado: no hay WooCommerce conectado');
        else console.log('[woo] pedido no auto-enviado: hay 2 proveedores y no hay preferido, se elige a mano');
        return;
      }
      const skus: Record<string, string> = {};
      for (const p of db.prepare("SELECT nombre, sku FROM products WHERE store_id = ? AND sku != ''").all(storeId) as { nombre: string; sku: string }[]) skus[p.nombre] = p.sku;
      const r = await woo.crearPedido(storeId, { cliente, ciudad, departamento, tel: lead.tel || '', direccion, nota: '', envio: 0, total }, items, skus, prov);
      const nombreProv = prov === 'dropi' ? 'Dropi' : 'Effi';
      if ('error' in r) { console.warn(`[woo] pedido DF-${numero} NO se envió a ${nombreProv}: ${r.error}`); registrarLog(storeId, 'error', 'despacho', `El pedido DF-${numero} no se pudo enviar a ${nombreProv}: ${r.error}`, lead.id); }
      else {
        db.prepare('UPDATE orders SET woo_id = ?, despacho_proveedor = ?, transportadora = ? WHERE id = ?').run(r.wooId, prov, nombreProv, oid);
        console.log(`[woo] pedido DF-${numero} enviado a ${nombreProv} (#${r.numero})`);
        if (r.sinMapear.length) {
          // El pedido está en WooCommerce, pero estos ítems no casaron por SKU y el proveedor NO los despachará.
          registrarLog(storeId, 'warn', 'despacho', `DF-${numero} llegó a WooCommerce, pero ${r.sinMapear.length} producto(s) NO coinciden por SKU con un producto de ${nombreProv} y NO se van a despachar: ${r.sinMapear.join(', ')}. Ponles el MISMO SKU del producto de ${nombreProv} en la sección Productos.`, lead.id);
        } else {
          registrarLog(storeId, 'info', 'despacho', `Pedido DF-${numero} enviado a ${nombreProv} (WooCommerce #${r.numero}) con ${r.mapeados} producto(s) mapeado(s) por SKU.`, lead.id);
        }
      }
    } catch (e) { console.error('[woo] error auto-enviando pedido', e); }
  })();

  // Mensaje de confirmación al cliente.
  const primerNombre = cliente.split(' ')[0];
  const producto = (items[0]?.nombre || 'tu pedido').split('(')[0].split('—')[0].trim();
  const confirmacion = `Tu pedido ya quedó registrado exitosamente 🎉\n\nTe llegará un mensaje de confirmación con el número de pedido y los detalles del envío en un momento 📲\n\n¡Gracias por tu compra, ${primerNombre}! Que disfrutes mucho tus ${producto} 🙌😊`;
  const midConf = uid();
  db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(midConf, lead.id, 'bot', confirmacion);
  marcarEnviado(midConf, await sendWhatsappText(storeId, destino, confirmacion, pn));
  return true;
}

/** Normaliza texto: minúsculas, sin acentos ni signos, para comparar. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Imagen de referencia del producto (típicamente el catálogo de colores):
 * la primera foto suelta y, si no hay, la primera imagen del mensaje inicial.
 * Se usa cuando piden un color que no tiene su propia foto: mostramos UNA sola
 * imagen de referencia, no todo el saludo.
 */
function fotoReferencia(p: Record<string, unknown>): string | null {
  const fotos = pj<string[]>(p.fotos_subidas as string, []);
  if (fotos.length) return fotos[0];
  const img = pj<{ tipo: string; valor?: string; valores?: string[] }[]>(p.mensaje_bloques as string, []).find((b) => b.tipo === 'imagen');
  return img?.valores?.[0] || img?.valor || null;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Hace que el bot tarde entre BOT_DELAY_MIN y BOT_DELAY_MAX ms (por defecto 4–5 s)
 * en responder, contando desde que llegó el mensaje. Si la IA ya se demoró más,
 * no espera de más. Se siente natural, como si el vendedor estuviera escribiendo.
 */
async function esperarRespuestaHumana(desde: number): Promise<void> {
  const min = Number(process.env.BOT_DELAY_MIN) || 4000;
  const max = Number(process.env.BOT_DELAY_MAX) || 5000;
  if (max <= 0) return;
  const objetivo = min + Math.random() * Math.max(0, max - min);
  const restante = objetivo - (Date.now() - desde);
  if (restante > 0) await dormir(restante);
}

/** ¿El cliente está pidiendo fotos/imágenes/catálogo de un producto? */
function pidioFotos(t: string): boolean {
  return /\b(foto|fotos|imagen|imagenes|muestrame|muestra|enviame|mandame|ensename|catalogo|fotico|fotos?porfa)\b/.test(norm(t));
}

const STOP = new Set(['los', 'las', 'del', 'con', 'por', 'para', 'que', 'una', 'uno', 'unos', 'unas', 'mis', 'tus', 'sus', 'este', 'esta', 'esos', 'esas', 'porfa', 'hola', 'tienes', 'tiene', 'quiero', 'dame', 'foto', 'fotos', 'imagen', 'imagenes', 'muestrame', 'muestra', 'enviame', 'mandame', 'ver', 'the', 'and']);

/** Palabras distintivas (nombre + disparador) que identifican a un producto. */
function tokensProducto(p: Record<string, unknown>): Set<string> {
  const txt = norm(String(p.nombre) + ' ' + String(p.disparador || ''));
  return new Set(txt.split(' ').filter((w) => w.length >= 3 && !STOP.has(w)));
}
/** Igualdad tolerante a plurales: jogger↔joggers, negro↔negros. */
function coincide(a: string, b: string): boolean {
  return a === b || a === b + 's' || b === a + 's' || a === b + 'es' || b === a + 'es';
}
const enQuery = (t: string, qw: Set<string>) => [...qw].some((w) => coincide(t, w));

/**
 * Resuelve a qué producto (y opción/color) se refiere un texto, por coincidencia
 * de PALABRAS distintivas del nombre y el disparador (los clientes lo nombran
 * informal, ej. "jogger negro" para "Bota Recta Ambar" cuyo disparador menciona
 * "jogger"). Si dos productos empatan (ambiguo), devuelve null para que la IA
 * pregunte cuál.
 */
function resolverProductoYColor(query: string, productRows: Record<string, unknown>[]): { prod: Record<string, unknown> | null; valName: string } {
  const q = norm(query);
  const qw = new Set(q.split(' ').filter(Boolean));
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;
  let empate = false;
  for (const p of productRows) {
    const pn = norm(String(p.nombre));
    const toks = tokensProducto(p);
    if (!toks.size) continue;
    let score = [...toks].filter((t) => enQuery(t, qw)).length; // # de palabras distintivas del producto presentes
    if (pn.length >= 4 && q.includes(pn)) score += 5; // nombre completo tal cual: gana claro
    if (score > bestScore + 1e-9) { best = p; bestScore = score; empate = false; }
    else if (Math.abs(score - bestScore) < 1e-9 && score > 0) empate = true;
  }
  if (!best || bestScore < 1 || empate) return { prod: null, valName: '' };
  // Color/valor de opción: el que aparezca en el texto (soporta valores de 1 o 2 palabras).
  let valName = '';
  for (const o of pj<{ valores: (string | { valor: string })[] }[]>(best.opciones as string, [])) {
    for (const v of o.valores || []) {
      const val = typeof v === 'string' ? v : v?.valor;
      if (!val) continue;
      const nv = norm(val);
      if (enQuery(nv, qw) || (nv.includes(' ') && q.includes(nv))) valName = val;
    }
  }
  return { prod: best, valName };
}

/** Busca la foto de una opción por su valor (ej: "Blanco"). */
function fotoDeOpcion(prod: Record<string, unknown>, valName: string): string | null {
  const v = norm(valName);
  const ops = pj<{ valores: (string | { valor: string; foto?: string })[] }[]>(prod.opciones as string, []);
  const items = ops.flatMap((o) => o.valores || []).filter((x): x is { valor: string; foto?: string } => typeof x !== 'string' && !!x.foto);
  return (items.find((x) => norm(x.valor) === v) || items.find((x) => norm(x.valor).includes(v) || v.includes(norm(x.valor))))?.foto || null;
}

/** Envía una sola foto (ej: la de una opción de color) sin marcar presentación. */
async function enviarUnaFoto(storeId: string, leadId: string, destino: string, valor: string, pn?: string) {
  const media = materializar(storeId, valor);
  if (!media) return;
  const r = await sendWhatsappMedia(storeId, destino, { buffer: media.buffer, mime: media.mime, tipo: media.tipo }, '', '', pn);
  const mid = uid();
  db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)')
    .run(mid, leadId, 'bot', '', media.tipo, media.url, media.mime, null);
  marcarEnviado(mid, r);
  console.log(`[ia] foto de opción enviada`);
}

/**
 * Envía una vez por chat la presentación de un producto: bloques
 * (texto/imagen/video) o, si no hay, sus fotos y videos.
 * Devuelve true si realmente envió la presentación (para que la IA NO agregue
 * una respuesta encima y el chat termine en el último bloque del mensaje inicial).
 */
async function enviarPresentacion(storeId: string, leadId: string, destino: string, p: Record<string, unknown>, pn?: string, forzar = false): Promise<boolean> {
  if (!forzar && Number(p.mensaje_inicial_activo) === 0) return false; // mensaje inicial apagado para este producto
  const pid = String(p.id);
  // Candado por TIEMPO: evita repetir la misma presentación en ráfaga (mismos
  // minutos), pero permite volver a mostrarla más tarde (p. ej. una 2.ª compra).
  // Un envío MANUAL (forzar) desde el inbox se salta el candado.
  const reciente = db.prepare("SELECT 1 FROM sent_presentations WHERE lead_id = ? AND product_id = ? AND created_at > datetime('now','-3 minutes')").get(leadId, pid);
  if (!forzar && reciente) return false;
  db.prepare(
    `INSERT INTO sent_presentations (lead_id, product_id, created_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(lead_id, product_id) DO UPDATE SET created_at = datetime('now')`,
  ).run(leadId, pid);

  const bloques = pj<{ tipo: string; valor?: string; valores?: string[] }[]>(p.mensaje_bloques as string, []);
  const fotos = pj<string[]>(p.fotos_subidas as string, []);
  const videos = pj<string[]>(p.videos as string, []);
  // Si armaste el mensaje inicial con bloques, se envía EXACTAMENTE esa
  // estructura (textos, imágenes y videos en tu orden), sin repetir con las
  // fotos principales. Un bloque de imagen/video puede traer VARIAS piezas
  // (valores[]); se envía una tras otra, en orden. Solo si no hay bloques
  // usamos fotos + videos.
  const piezas: { tipo: string; valor: string }[] = bloques.length
    ? bloques.flatMap((b) => {
        if (b.tipo === 'texto') return [{ tipo: 'texto', valor: b.valor || '' }];
        const lista = Array.isArray(b.valores) && b.valores.length ? b.valores : b.valor ? [b.valor] : [];
        return lista.map((v) => ({ tipo: b.tipo, valor: v }));
      })
    : [...fotos.slice(0, 6).map((v) => ({ tipo: 'imagen', valor: v })), ...videos.slice(0, 2).map((v) => ({ tipo: 'video', valor: v }))];
  if (!piezas.length) {
    console.log(`[ia] "${p.nombre}": el cliente lo pidió pero no hay fotos/videos cargados`);
    return false;
  }

  const lead = db.prepare('SELECT nombre, tel FROM leads WHERE id = ?').get(leadId) as { nombre: string; tel: string } | undefined;
  // Pausa entre piezas para que WhatsApp ENTREGUE en el orden en que se armó el
  // mensaje inicial. Sin esta pausa, los mensajes salen en el mismo segundo y
  // WhatsApp los reordena (los videos suelen adelantarse al texto).
  const gap = Number(process.env.BOT_MSG_GAP) || 1200;
  let enviadas = 0;
  let idx = 0;
  for (const b of piezas) {
    let ok = false;
    if (b.tipo === 'texto') {
      const valor = rellenar(b.valor, lead || {});
      if (valor.trim()) {
        const mid = uid();
        db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(mid, leadId, 'bot', valor);
        const r = await sendWhatsappText(storeId, destino, valor, pn);
        marcarEnviado(mid, r);
        ok = r.ok;
      }
    } else {
      const media = materializar(storeId, b.valor);
      if (media) {
        const r = await sendWhatsappMedia(storeId, destino, { buffer: media.buffer, mime: media.mime, tipo: media.tipo }, '', '', pn);
        const mid = uid();
        db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)')
          .run(mid, leadId, 'bot', '', media.tipo, media.url, media.mime, null);
        marcarEnviado(mid, r);
        ok = r.ok;
      }
    }
    if (ok) enviadas++;
    // Espera entre piezas (no después de la última) para conservar el orden.
    if (ok && gap > 0 && idx < piezas.length - 1) await dormir(gap);
    idx++;
  }
  console.log(`[ia] presentación de "${p.nombre}" enviada (${enviadas}/${piezas.length} piezas, en orden)`);
  if (enviadas > 0) registrarLog(storeId, 'info', 'disparador', `Mensaje inicial de "${p.nombre}" enviado (${enviadas} de ${piezas.length} piezas).`, leadId);
  else registrarLog(storeId, 'warn', 'disparador', `Se activó "${p.nombre}" pero NO se envió ninguna pieza del mensaje inicial (revisa la conexión de WhatsApp).`, leadId);
  return enviadas > 0;
}

/**
 * Envío MANUAL del mensaje inicial de un producto desde el inbox (útil cuando el
 * disparador de Meta falla o hay que reactivar el chat a mano). Envía la
 * presentación completa y deja el chat en manos del asistente, esperando la
 * respuesta del cliente.
 */
export async function enviarMensajeInicialManual(storeId: string, leadId: string, productId: string): Promise<{ ok: boolean; error?: string }> {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(productId, storeId) as Record<string, unknown> | undefined;
  if (!p) return { ok: false, error: 'Producto no encontrado en esta tienda.' };
  const lead = db.prepare('SELECT wa_id, tel FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { wa_id: string | null; tel: string } | undefined;
  if (!lead) return { ok: false, error: 'Chat no encontrado.' };
  const destino = lead.wa_id || lead.tel;
  const enviado = await enviarPresentacion(storeId, leadId, destino, p, lead.tel, true);
  if (!enviado) return { ok: false, error: 'Este producto no tiene mensaje inicial cargado (fotos/textos).' };
  // El bot queda a cargo, esperando la respuesta del cliente. Se reinicia el
  // contador de seguimiento para no encimar recordatorios.
  db.prepare("UPDATE leads SET asignado = 'Asistente (bot)', seguimiento_nivel = 0 WHERE id = ?").run(leadId);
  return { ok: true };
}

/**
 * Envía las fotos y videos SUELTOS del producto (cuando el cliente los pide).
 * NO usa los bloques del mensaje inicial: esos están reservados para el
 * disparador, así una petición de fotos nunca reenvía el saludo. Sin candado.
 */
async function enviarMediaProducto(storeId: string, leadId: string, destino: string, p: Record<string, unknown>, pn?: string): Promise<number> {
  const fotos = pj<string[]>(p.fotos_subidas as string, []);
  const videos = pj<string[]>(p.videos as string, []);
  const piezas: { tipo: string; valor: string }[] = [
    ...fotos.slice(0, 8).map((v) => ({ tipo: 'imagen', valor: v })),
    ...videos.slice(0, 3).map((v) => ({ tipo: 'video', valor: v })),
  ];
  if (!piezas.length) return 0;
  let enviadas = 0;
  for (const b of piezas) {
    const media = materializar(storeId, b.valor);
    if (!media) continue;
    const r = await sendWhatsappMedia(storeId, destino, { buffer: media.buffer, mime: media.mime, tipo: media.tipo }, '', '', pn);
    const mid = uid();
    db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)')
      .run(mid, leadId, 'bot', '', media.tipo, media.url, media.mime, null);
    marcarEnviado(mid, r);
    if (r.ok) enviadas++;
  }
  console.log(`[ia] multimedia de "${p.nombre}" enviada a pedido (${enviadas}/${piezas.length})`);
  return enviadas;
}
