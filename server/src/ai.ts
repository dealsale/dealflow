import { existsSync, readFileSync } from 'node:fs';
import { db, pj, uid } from './db.js';
import { sendWhatsappText, sendWhatsappMedia } from './wa.js';
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
  const mm = valor.match(/\/api\/media\/[^/]+\/([^/?#]+)/);
  if (!mm) return null;
  const p = mediaPath(storeId, mm[1]);
  if (!existsSync(p)) return null;
  const ext = (mm[1].split('.').pop() || '').toLowerCase();
  const mime = MIME_POR_EXT[ext] || 'application/octet-stream';
  return { buffer: readFileSync(p), mime, tipo: tipoDeMime(mime), url: valor };
}

/**
 * Si la tienda tiene IA disponible (DEEPSEEK_API_KEY) y el chat lo atiende
 * el asistente, genera la respuesta con el contexto de la tienda y la envía.
 */
export async function maybeAutoReply(storeId: string, leadId: string) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    console.log('[ia] DEEPSEEK_API_KEY no está configurada: el asistente no responde');
    return;
  }
  const lead = db.prepare('SELECT id, nombre, asignado, wa_id, tel FROM leads WHERE id = ?').get(leadId) as
    | { id: string; nombre: string; asignado: string; wa_id: string | null; tel: string }
    | undefined;
  if (!lead) return;
  if (!/asistente|bot/i.test(lead.asignado)) {
    console.log(`[ia] el chat lo atiende "${lead.asignado}": no respondo (usa "Devolver al asistente")`);
    return;
  }

  const assistant = db.prepare('SELECT instrucciones, reglas FROM assistants WHERE store_id = ?').get(storeId) as
    | { instrucciones: string; reglas: string }
    | undefined;
  const store = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined;
  const productRows = db.prepare('SELECT * FROM products WHERE store_id = ?').all(storeId) as Record<string, unknown>[];
  const products = productRows.map((p) => {
    const vars = (db.prepare('SELECT label, stock FROM variants WHERE product_id = ?').all(p.id as string) as { label: string; stock: number }[])
      .map((v) => `${v.label} (${v.stock} disp.)`).join(', ');
    const reglas = pj<string[]>(p.reglas as string, []).map((r) => `  · Regla: ${r}`).join('\n');
    const faqs = pj<{ pregunta: string; respuesta: string }[]>(p.faqs as string, []).map((f) => `  · P: ${f.pregunta} → R: ${f.respuesta}`).join('\n');
    const bloques = pj<{ tipo: string; valor: string }[]>(p.mensaje_bloques as string, [])
      .filter((b) => b.tipo === 'texto').map((b) => b.valor).join(' ');
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
    const variantesTxt = opciones ? '' : ` Variantes: ${vars || 'única'}.`;
    return `- ${p.nombre}: $${Number(p.precio).toLocaleString('es-CO')} COP.${variantesTxt}${extra ? '\n' + extra : ''}${combos ? '\n' + combos : ''}${reglas ? '\n' + reglas : ''}${faqs ? '\n' + faqs : ''}`;
  }).join('\n');
  const promos = (db.prepare('SELECT titulo, descripcion FROM promos WHERE store_id = ? AND activa = 1').all(storeId) as { titulo: string; descripcion: string }[])
    .map((p) => `- ${p.titulo}: ${p.descripcion}`).join('\n');
  const reglas = pj<string[]>(assistant?.reglas || '[]', []).map((r) => `- ${r}`).join('\n');

  const system = `Eres el asistente de ventas por WhatsApp de la tienda "${store?.nombre || 'la tienda'}".
${assistant?.instrucciones || 'Atiende con calidez y ayuda a cerrar la venta.'}

REGLAS GENERALES DE LA TIENDA:
${reglas || '- Sé honesto y claro.'}

MUY IMPORTANTE: cada producto puede tener sus PROPIAS reglas (aparecen como "· Regla:" dentro de él). Esas reglas del producto son EXCEPCIONES y tienen PRIORIDAD sobre las reglas generales. Ejemplo: si la regla general dice que no se venden 2 unidades, pero un producto tiene una regla que sí permite llevar 2 por cierto precio, respeta la del producto. Usa siempre la descripción, características, modo de uso, combos, precios y reglas EXACTAS del producto del catálogo; no inventes ni generalices.

CATÁLOGO (precios en COP):
${products || '(sin productos cargados aún)'}

PROMOS ACTIVAS:
${promos || '(ninguna)'}

Estás chateando por WhatsApp: respuestas cortas (1-3 frases), tono cercano de "tú", sin inventar productos ni precios que no estén en el catálogo. El cliente se llama ${lead.nombre}.

PRODUCTO CORRECTO (muy importante): si el cliente nombra un producto de forma general y en el CATÁLOGO hay VARIOS productos que coinciden con ese nombre (por ejemplo pide "jogger" y existen "Jogger Bota Recta Hombre", "Jogger Bota Recta Dama", "Jogger Clásico", "Jogger Clásico Dama"), NO adivines ni elijas uno al azar: pregúntale al cliente CUÁL de esos modelos exactos quiere y NO envíes fotos ni pongas el marcador todavía. Solo cuando quede claro el modelo exacto, usa su NOMBRE EXACTO del catálogo en el marcador ##MEDIA##.

FOTOS Y VIDEOS: cuando el cliente pregunte o muestre interés en un producto específico (aunque lo nombre de forma informal, ej. "la camisa"), incluye al inicio de tu respuesta, en una línea sola, el marcador ##MEDIA:Nombre exacto del producto del catálogo## y luego una frase MUY corta de cierre (una pregunta). Si el cliente pide en general "fotos", "imágenes", "más fotos", "videos" o material del producto SIN nombrar un color, usa SIEMPRE ##MEDIA:Nombre exacto## (sin barra ni color): el sistema envía TODAS las fotos y videos. Usa ##MEDIA:Nombre del producto|Color## SOLO si pide expresamente la foto de un color específico Y ese color muestra 📷 en el catálogo. Si el color que pide NO tiene 📷, NO prometas enviar su foto ni pongas el marcador: dile con amabilidad que puedes mostrarle el catálogo de colores o las fotos generales, y ofrécelas con ##MEDIA:Nombre exacto##. El sistema envía la multimedia automáticamente; no digas que "no puedes enviar fotos".

CERRAR EL PEDIDO: cuando el cliente confirme que quiere comprar Y ya tengas su NOMBRE, CIUDAD y DIRECCIÓN, agrega al final de tu respuesta, en una línea sola, EXACTAMENTE con este formato:
##PEDIDO cliente="Nombre Apellido"; ciudad="Ciudad"; direccion="Dirección exacta"; items="2x Nombre exacto del producto, 1x Otro producto"; total="180000"##
El campo total es el precio TOTAL acordado del pedido en números (sin puntos ni signos).
Reglas del marcador: usa comillas dobles normales ("), NO uses JSON, NO uses llaves {}, NO uses barras invertidas (\\), NO escapes las comillas. Usa los nombres EXACTOS de los productos del catálogo y las cantidades acordadas. No lo menciones ni lo muestres al cliente; el sistema registra el pedido solo y le confirma. Ponlo una sola vez, cuando de verdad tengas nombre y dirección; si te falta algún dato, pídelo primero.
FLUJO OBLIGATORIO DEL CIERRE: primero muestra el "Resumen de tu pedido" y pregunta "¿Confirmas que los datos están correctos?". En cuanto el cliente confirme (diga "sí", "sisas", "dale", "correcto", "confirmo", etc.), tu SIGUIENTE mensaje DEBE incluir el marcador ##PEDIDO...## SÍ o SÍ (con los datos del resumen). Nunca digas "el sistema procesará tu pedido" o "te llegará la confirmación" sin haber puesto el marcador en ESE mismo mensaje.

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

  // Disparador: SOLO cuando el mensaje del cliente coincide de verdad con la
  // frase disparadora del producto (la de los anuncios). Un simple "hola" no
  // dispara: exigimos que la mayoría de las palabras del disparador estén en
  // el mensaje (o que sea idéntico), no que compartan una palabra suelta.
  if (ultimo?.tipo === 'texto' && ultimo.texto) {
    const t = norm(ultimo.texto);
    const tWords = new Set(t.split(' ').filter(Boolean));
    for (const p of productRows) {
      if (Number(p.mensaje_inicial_activo) === 0) continue;
      const disp = norm(String(p.disparador || ''));
      if (disp.length < 6) continue; // sin disparador configurado, no dispara
      const dWords = disp.split(' ').filter((w) => w.length >= 3);
      if (!dWords.length) continue;
      const overlap = dWords.filter((w) => tWords.has(w)).length / dWords.length;
      if (t === disp || t.includes(disp) || overlap >= 0.75) {
        await enviarPresentacion(storeId, leadId, destino, p, pn);
      }
    }
  }

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemFinal }, ...historia], max_tokens: 300, temperature: 0.7 }),
    });
    if (!res.ok) {
      console.error('[ia] DeepSeek respondió', res.status, await res.text().catch(() => ''));
      return;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const brutoRaw = body.choices?.[0]?.message?.content?.trim();
    if (!brutoRaw) return;
    // A veces DeepSeek envuelve su respuesta como JSON ("text": "..."). La
    // desenvolvemos para no mandar esa basura al cliente ni contaminar el marcador.
    const bruto = desenvolver(brutoRaw);

    // La IA marca con ##MEDIA:Nombre## cuando el cliente pide un producto; con
    // ##MEDIA:Nombre|Valor## pide la foto de una opción específica.
    const marca = /##\s*MEDIA:\s*([^#]+?)\s*##/i;
    // El pedido va en su propia línea; capturamos hasta el fin de línea porque
    // la dirección puede tener '#'. No dependemos de un cierre '##'.
    const marcaPed = /##\s*PEDIDO\b([^\n]*)/i;
    const m = bruto.match(marca);
    const mp = bruto.match(marcaPed);
    const texto = bruto.replace(new RegExp(marca, 'gi'), '').replace(/[^\n]*##\s*PEDIDO\b[^\n]*/gi, '').trim();
    // Base para resolver qué foto enviar: el marcador de la IA si lo puso; si NO
    // lo puso pero el cliente pidió fotos explícitamente, usamos su mensaje (red
    // de seguridad para la multimedia, igual que la del pedido).
    const pidioMedia = ultimo?.tipo === 'texto' && pidioFotos(ultimo?.texto || '');
    const baseMedia = m ? m[1].replace('|', ' ') : pidioMedia ? ultimo?.texto || '' : '';
    if (baseMedia.trim()) {
      const { prod, valName } = resolverProductoYColor(baseMedia, productRows);
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
    // (sí/sisas/dale/correcto…), pero la IA NO puso el marcador. Tomamos el pedido
    // del último resumen que envió la IA, para no perder ventas por un descuido del modelo.
    if (!pedidoCreado && !mp && esAfirmacion(ultimo?.texto || '')) {
      const inner = pedidoDesdeResumen(leadId);
      if (inner) pedidoCreado = await crearPedido(storeId, lead, inner, productRows, destino, pn);
    }

    // Si se creó el pedido, el mensaje de confirmación ya lo mandó crearPedido;
    // no repetimos con el texto de la IA.
    if (texto && !pedidoCreado) {
      const textoFinal = rellenar(texto, lead);
      db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), leadId, 'bot', textoFinal);
      const send = await sendWhatsappText(storeId, destino, textoFinal, pn);
      if (send.ok) console.log('[ia] respuesta enviada por WhatsApp');
      else console.error('[ia] respuesta generada pero NO enviada:', send.error, '| destino:', destino);
    }
  } catch (e) {
    console.error('[ia] error llamando a DeepSeek', e);
  }
}

/**
 * Si DeepSeek envuelve la respuesta como JSON ({"text":"..."}) o empieza con
 * «text: "..."», recupera solo el mensaje real en texto plano. Si no hay
 * envoltura, devuelve el texto tal cual.
 */
function desenvolver(s: string): string {
  const t = s.trim();
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      for (const k of ['text', 'mensaje', 'respuesta', 'reply', 'message', 'content']) {
        if (typeof o[k] === 'string') return (o[k] as string).trim();
      }
    } catch {
      /* no era JSON válido; seguimos abajo */
    }
  }
  const m = t.match(/^"?(?:text|mensaje|respuesta|reply|message|content)"?\s*:\s*"([\s\S]*)"\s*}?\s*$/i);
  if (m) return m[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
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
  const rows = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de = 'bot' AND texto != '' ORDER BY created_at DESC LIMIT 6").all(leadId) as { texto: string }[];
  const resumen = rows.map((r) => r.texto).find((t) => /resumen/i.test(t) && /(direcc|total|ciudad)/i.test(t));
  if (!resumen) return '';
  const cliente = campoResumen(resumen, 'Nombre');
  const ciudad = campoResumen(resumen, 'Ciudad');
  const direccion = campoResumen(resumen, 'Direcci');
  const total = (campoResumen(resumen, 'Total').match(/\d/g) || []).join('');
  const prodField = campoResumen(resumen, 'Producto') || resumen;
  const items: string[] = [];
  const re = /(\d+)\s*[xX×]\s*([^—\-,\n*]+)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(prodField))) items.push(`${mm[1]}x ${mm[2].trim()}`);
  if (!items.length || (!direccion && !ciudad)) return '';
  console.log(`[ia] pedido tomado del resumen (la IA no puso el marcador) para lead ${leadId}`);
  return ` cliente="${cliente}"; ciudad="${ciudad}"; direccion="${direccion}"; items="${items.join(', ')}"; total="${total}"`;
}

/** Registra el pedido cuando la IA cierra la venta y le confirma al cliente. Devuelve true si lo creó. */
async function crearPedido(storeId: string, lead: { id: string; nombre: string; tel: string }, inner: string, productRows: Record<string, unknown>[], destino: string, pn?: string): Promise<boolean> {
  const cliente = campoPedido(inner, 'cliente') || lead.nombre || 'Cliente';
  const ciudad = campoPedido(inner, 'ciudad');
  const direccion = campoPedido(inner, 'direccion');
  const itemsRaw = campoPedido(inner, 'items');
  const items = itemsRaw.split(',').map((s) => s.trim()).filter(Boolean).map((it) => {
    const mm = it.match(/(\d+)\s*[xX×]\s*(.+)/);
    const qty = mm ? parseInt(mm[1], 10) || 1 : 1;
    const nom = limpiarValor(mm ? mm[2] : it).toLowerCase();
    const prod = productRows.find((p) => String(p.nombre).toLowerCase() === nom)
      || productRows.find((p) => String(p.nombre).toLowerCase().includes(nom) || nom.includes(String(p.nombre).toLowerCase()));
    return { qty, nombre: prod ? String(prod.nombre) : limpiarValor(mm ? mm[2] : it), precio: prod ? Number(prod.precio) : 0 };
  }).filter((i) => i.nombre);
  if (!items.length || (!direccion && !ciudad)) return false; // datos insuficientes, esperamos

  // Evita duplicados si la IA repite el marcador: un pedido "Nuevo" por número en los últimos 10 min.
  const dup = db.prepare("SELECT id FROM orders WHERE store_id = ? AND tel = ? AND estado = 'Nuevo' AND created_at > datetime('now','-10 minutes')").get(storeId, lead.tel || '');
  if (dup) { console.log(`[ia] pedido no creado: ya hay uno reciente para ${lead.tel}`); return false; }

  const total = parseInt(campoPedido(inner, 'total').replace(/[^0-9]/g, ''), 10) || items.reduce((a, it) => a + it.qty * it.precio, 0);
  const numero = ((db.prepare('SELECT MAX(numero) n FROM orders WHERE store_id = ?').get(storeId) as { n: number | null }).n || 1048) + 1;
  const oid = uid();
  db.prepare('INSERT INTO orders (id, store_id, numero, cliente, ciudad, tel, direccion, estado, total) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(oid, storeId, numero, cliente, ciudad, lead.tel || '', direccion, 'Nuevo', total);
  for (const it of items) {
    db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio) VALUES (?,?,?,?,?)').run(uid(), oid, it.qty, it.nombre, it.precio);
  }
  db.prepare("UPDATE leads SET etapa = 'Listo para comprar', etiqueta = 'Venta' WHERE id = ?").run(lead.id);
  console.log(`[ia] pedido DF-${numero} creado para ${cliente} · ${items.map((i) => i.qty + 'x ' + i.nombre).join(', ')}`);

  // Mensaje de confirmación al cliente.
  const primerNombre = cliente.split(' ')[0];
  const producto = items[0]?.nombre || 'tu pedido';
  const confirmacion = `Tu pedido ya quedó registrado exitosamente 🎉\n\nTe llegará un mensaje de confirmación con el número de pedido y los detalles del envío en un momento 📲\n\n¡Gracias por tu compra, ${primerNombre}! Que disfrutes mucho tus ${producto} 🙌😊`;
  db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), lead.id, 'bot', confirmacion);
  await sendWhatsappText(storeId, destino, confirmacion, pn);
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
  const img = pj<{ tipo: string; valor: string }[]>(p.mensaje_bloques as string, []).find((b) => b.tipo === 'imagen');
  return img?.valor || null;
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
  await sendWhatsappMedia(storeId, destino, { buffer: media.buffer, mime: media.mime, tipo: media.tipo }, '', '', pn);
  db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid(), leadId, 'bot', '', media.tipo, media.url, media.mime, null);
  console.log(`[ia] foto de opción enviada`);
}

/** Envía una vez por chat la presentación de un producto: bloques (texto/imagen/video) o, si no hay, sus fotos y videos. */
async function enviarPresentacion(storeId: string, leadId: string, destino: string, p: Record<string, unknown>, pn?: string) {
  if (Number(p.mensaje_inicial_activo) === 0) return; // mensaje inicial apagado para este producto
  const pid = String(p.id);
  // Candado por TIEMPO: evita repetir la misma presentación en ráfaga (mismos
  // minutos), pero permite volver a mostrarla más tarde (p. ej. una 2.ª compra).
  const reciente = db.prepare("SELECT 1 FROM sent_presentations WHERE lead_id = ? AND product_id = ? AND created_at > datetime('now','-3 minutes')").get(leadId, pid);
  if (reciente) return;
  db.prepare(
    `INSERT INTO sent_presentations (lead_id, product_id, created_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(lead_id, product_id) DO UPDATE SET created_at = datetime('now')`,
  ).run(leadId, pid);

  const bloques = pj<{ tipo: string; valor: string }[]>(p.mensaje_bloques as string, []);
  const fotos = pj<string[]>(p.fotos_subidas as string, []);
  const videos = pj<string[]>(p.videos as string, []);
  // Si armaste el mensaje inicial con bloques, se envía EXACTAMENTE esa
  // estructura (textos, imágenes y videos en tu orden), sin repetir con las
  // fotos principales. Solo si no hay bloques usamos fotos + videos.
  const piezas: { tipo: string; valor: string }[] = bloques.length
    ? bloques.map((b) => ({ tipo: b.tipo, valor: b.valor }))
    : [...fotos.slice(0, 6).map((v) => ({ tipo: 'imagen', valor: v })), ...videos.slice(0, 2).map((v) => ({ tipo: 'video', valor: v }))];
  if (!piezas.length) {
    console.log(`[ia] "${p.nombre}": el cliente lo pidió pero no hay fotos/videos cargados`);
    return;
  }

  const lead = db.prepare('SELECT nombre, tel FROM leads WHERE id = ?').get(leadId) as { nombre: string; tel: string } | undefined;
  let enviadas = 0;
  for (const b of piezas) {
    if (b.tipo === 'texto') {
      const valor = rellenar(b.valor, lead || {});
      if (!valor.trim()) continue;
      db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), leadId, 'bot', valor);
      const r = await sendWhatsappText(storeId, destino, valor, pn);
      if (r.ok) enviadas++;
    } else {
      const media = materializar(storeId, b.valor);
      if (!media) continue;
      const r = await sendWhatsappMedia(storeId, destino, { buffer: media.buffer, mime: media.mime, tipo: media.tipo }, '', '', pn);
      db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)')
        .run(uid(), leadId, 'bot', '', media.tipo, media.url, media.mime, null);
      if (r.ok) enviadas++;
    }
  }
  console.log(`[ia] presentación de "${p.nombre}" enviada (${enviadas}/${piezas.length} piezas)`);
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
    db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)')
      .run(uid(), leadId, 'bot', '', media.tipo, media.url, media.mime, null);
    if (r.ok) enviadas++;
  }
  console.log(`[ia] multimedia de "${p.nombre}" enviada a pedido (${enviadas}/${piezas.length})`);
  return enviadas;
}
