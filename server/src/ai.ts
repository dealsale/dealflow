import { db, pj, uid } from './db.js';
import { sendWhatsappText } from './wa.js';

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
  const products = (db.prepare('SELECT * FROM products WHERE store_id = ?').all(storeId) as Record<string, unknown>[]).map((p) => {
    const vars = (db.prepare('SELECT label, stock FROM variants WHERE product_id = ?').all(p.id as string) as { label: string; stock: number }[])
      .map((v) => `${v.label} (${v.stock} disp.)`).join(', ');
    const reglas = pj<string[]>(p.reglas as string, []).map((r) => `  · Regla: ${r}`).join('\n');
    const faqs = pj<{ pregunta: string; respuesta: string }[]>(p.faqs as string, []).map((f) => `  · P: ${f.pregunta} → R: ${f.respuesta}`).join('\n');
    const bloques = pj<{ tipo: string; valor: string }[]>(p.mensaje_bloques as string, [])
      .filter((b) => b.tipo === 'texto').map((b) => b.valor).join(' ');
    const guion = bloques || (p.mensaje_inicial as string);
    const extra = [p.descripcion && `  Descripción: ${p.descripcion}`, p.caracteristicas && `  Características: ${p.caracteristicas}`,
      p.modos_uso && `  Modo de uso: ${p.modos_uso}`, guion && `  Si preguntan por este producto, preséntalo así: ${guion}`]
      .filter(Boolean).join('\n');
    return `- ${p.nombre}: $${Number(p.precio).toLocaleString('es-CO')} COP. Variantes: ${vars || 'única'}.${extra ? '\n' + extra : ''}${reglas ? '\n' + reglas : ''}${faqs ? '\n' + faqs : ''}`;
  }).join('\n');
  const promos = (db.prepare('SELECT titulo, descripcion FROM promos WHERE store_id = ? AND activa = 1').all(storeId) as { titulo: string; descripcion: string }[])
    .map((p) => `- ${p.titulo}: ${p.descripcion}`).join('\n');
  const reglas = pj<string[]>(assistant?.reglas || '[]', []).map((r) => `- ${r}`).join('\n');

  const system = `Eres el asistente de ventas por WhatsApp de la tienda "${store?.nombre || 'la tienda'}".
${assistant?.instrucciones || 'Atiende con calidez y ayuda a cerrar la venta.'}

REGLAS QUE SE CUMPLEN SIEMPRE:
${reglas || '- Sé honesto y claro.'}

CATÁLOGO (precios en COP):
${products || '(sin productos cargados aún)'}

PROMOS ACTIVAS:
${promos || '(ninguna)'}

Estás chateando por WhatsApp: respuestas cortas (1-3 frases), tono cercano de "tú", sin inventar productos ni precios que no estén en el catálogo. El cliente se llama ${lead.nombre}.`;

  const historia = (db.prepare('SELECT de, texto, tipo FROM messages WHERE lead_id = ? ORDER BY created_at DESC LIMIT 16').all(leadId) as { de: string; texto: string; tipo: string }[])
    .reverse()
    .map((m) => ({
      role: m.de === 'cliente' ? ('user' as const) : ('assistant' as const),
      content: m.texto || (m.tipo && m.tipo !== 'texto' ? `[${m.tipo} adjunto]` : ''),
    }))
    .filter((m) => m.content);

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: system }, ...historia], max_tokens: 300, temperature: 0.7 }),
    });
    if (!res.ok) {
      console.error('[ia] DeepSeek respondió', res.status, await res.text().catch(() => ''));
      return;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const texto = body.choices?.[0]?.message?.content?.trim();
    if (!texto) return;
    db.prepare('INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?,?,?)').run(uid(), leadId, 'bot', texto);
    const send = await sendWhatsappText(storeId, lead.wa_id || lead.tel, texto);
    if (send.ok) console.log('[ia] respuesta enviada por WhatsApp');
    else console.error('[ia] respuesta generada pero NO enviada:', send.error, '| destino:', lead.wa_id || lead.tel);
  } catch (e) {
    console.error('[ia] error llamando a DeepSeek', e);
  }
}
