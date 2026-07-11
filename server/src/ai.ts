import { db, pj, uid } from './db.js';
import { sendWhatsappText, sendWhatsappMedia } from './wa.js';
import { saveOutgoingMedia } from './media.js';

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
    const extra = [p.descripcion && `  Descripción: ${p.descripcion}`, p.caracteristicas && `  Características: ${p.caracteristicas}`,
      p.modos_uso && `  Modo de uso: ${p.modos_uso}`, guion && `  Si preguntan por este producto, preséntalo así: ${guion}`]
      .filter(Boolean).join('\n');
    return `- ${p.nombre}: $${Number(p.precio).toLocaleString('es-CO')} COP. Variantes: ${vars || 'única'}.${extra ? '\n' + extra : ''}${combos ? '\n' + combos : ''}${reglas ? '\n' + reglas : ''}${faqs ? '\n' + faqs : ''}`;
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

FOTOS Y VIDEOS: cuando el cliente pregunte o muestre interés en un producto específico (aunque lo nombre de forma informal, ej. "la camisa"), y todavía no le hayas enviado su material, incluye al inicio de tu respuesta, en una línea sola, el marcador ##MEDIA:Nombre exacto del producto del catálogo## y luego una frase MUY corta de cierre (una pregunta). El sistema enviará automáticamente las fotos y videos de ese producto; no describas que "no puedes enviar fotos". Usa el marcador una sola vez por producto.`;

  const nombreMedia = (tipo: string) =>
    tipo === 'audio' ? 'una nota de voz' : tipo === 'image' ? 'una imagen' : tipo === 'video' ? 'un video' : 'un archivo';
  const historia = (db.prepare('SELECT de, texto, tipo FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 16').all(leadId) as { de: string; texto: string; tipo: string }[])
    .reverse()
    .map((m) => ({
      role: m.de === 'cliente' ? ('user' as const) : ('assistant' as const),
      content: m.texto || (m.tipo && m.tipo !== 'texto' ? `[el cliente envió ${nombreMedia(m.tipo)}]` : ''),
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
    const bruto = body.choices?.[0]?.message?.content?.trim();
    if (!bruto) return;
    const destino = lead.wa_id || lead.tel;
    const pn = lead.tel; // número real, para que WhatsApp entregue (resuelve el LID)

    // La IA marca con ##MEDIA:Nombre## cuando el cliente pide un producto: enviamos su presentación (bloques/fotos/videos).
    const marca = /##\s*MEDIA:\s*([^#]+?)\s*##/i;
    const m = bruto.match(marca);
    const texto = bruto.replace(new RegExp(marca, 'gi'), '').trim();
    if (m) {
      const pedido = m[1].trim().toLowerCase();
      const prod = productRows.find((p) => String(p.nombre).trim().toLowerCase() === pedido)
        || productRows.find((p) => String(p.nombre).toLowerCase().includes(pedido) || pedido.includes(String(p.nombre).toLowerCase()));
      if (prod) await enviarPresentacion(storeId, leadId, destino, prod, pn);
    }

    if (texto) {
      db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), leadId, 'bot', texto);
      const send = await sendWhatsappText(storeId, destino, texto, pn);
      if (send.ok) console.log('[ia] respuesta enviada por WhatsApp');
      else console.error('[ia] respuesta generada pero NO enviada:', send.error, '| destino:', destino);
    }
  } catch (e) {
    console.error('[ia] error llamando a DeepSeek', e);
  }
}

/** Envía una vez por chat la presentación de un producto: bloques (texto/imagen/video) o, si no hay, sus fotos y videos. */
async function enviarPresentacion(storeId: string, leadId: string, destino: string, p: Record<string, unknown>, pn?: string) {
  const pid = String(p.id);
  const yaEnviada = db.prepare('SELECT 1 FROM sent_presentations WHERE lead_id = ? AND product_id = ?').get(leadId, pid);
  if (yaEnviada) return;
  db.prepare('INSERT OR IGNORE INTO sent_presentations (lead_id, product_id) VALUES (?,?)').run(leadId, pid);

  const bloques = pj<{ tipo: string; valor: string }[]>(p.mensaje_bloques as string, []);
  const fotos = pj<string[]>(p.fotos_subidas as string, []);
  const videos = pj<string[]>(p.videos as string, []);
  // Reunimos TODO el material del producto (no solo los bloques): así, cuando
  // el cliente pide fotos, sí le llegan las fotos aunque el mensaje inicial
  // tenga un video. Orden: primero el texto de presentación, luego las
  // imágenes y por último los videos.
  const textos = bloques.filter((b) => b.tipo === 'texto');
  const imgsBloque = bloques.filter((b) => b.tipo === 'imagen').map((b) => b.valor);
  const vidsBloque = bloques.filter((b) => b.tipo === 'video').map((b) => b.valor);
  const imagenes = [...imgsBloque, ...fotos.filter((f) => !imgsBloque.includes(f))].slice(0, 6);
  const clips = [...vidsBloque, ...videos.filter((v) => !vidsBloque.includes(v))].slice(0, 2);
  const piezas: { tipo: string; valor: string }[] = [
    ...textos.map((b) => ({ tipo: 'texto', valor: b.valor })),
    ...imagenes.map((v) => ({ tipo: 'imagen', valor: v })),
    ...clips.map((v) => ({ tipo: 'video', valor: v })),
  ];
  if (!piezas.length) {
    console.log(`[ia] "${p.nombre}": el cliente lo pidió pero no hay fotos/videos cargados`);
    return;
  }

  let enviadas = 0;
  for (const b of piezas) {
    if (b.tipo === 'texto') {
      if (!b.valor.trim()) continue;
      db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), leadId, 'bot', b.valor);
      const r = await sendWhatsappText(storeId, destino, b.valor, pn);
      if (r.ok) enviadas++;
    } else {
      const media = saveOutgoingMedia(storeId, b.valor, '');
      if (!media) continue;
      const r = await sendWhatsappMedia(storeId, destino, { buffer: media.buffer, mime: media.mime, tipo: media.tipo }, '', '', pn);
      db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)')
        .run(uid(), leadId, 'bot', '', media.tipo, media.url, media.mime, null);
      if (r.ok) enviadas++;
    }
  }
  console.log(`[ia] presentación de "${p.nombre}" enviada (${enviadas}/${piezas.length} piezas)`);
}
