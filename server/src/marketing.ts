import { saveOutgoingMedia } from './media.js';

/** Genera 3 variaciones de copy publicitario con DeepSeek. */
export async function generarCopys(input: { idea: string; plataforma: string; tono: string; objetivo: string }): Promise<{ copys?: string[]; error?: string }> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { error: 'Falta configurar la IA (DEEPSEEK_API_KEY) en el servidor.' };
  const system = `Eres un copywriter experto en anuncios para tiendas que venden por WhatsApp e Instagram en Colombia. Escribe copys que venden, con gancho, claros y con llamado a la acción. Usa emojis con moderación. Responde SOLO un JSON válido: {"copys":["...","...","..."]} con 3 variaciones distintas, cada una lista para publicar.`;
  const user = `Producto o idea del anuncio: ${input.idea}
Plataforma: ${input.plataforma || 'Instagram/Facebook'}
Tono: ${input.tono || 'cercano y vendedor'}
Objetivo: ${input.objetivo || 'que escriban por WhatsApp para comprar'}`;
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 700,
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return { error: 'La IA no respondió. Intenta de nuevo.' };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const txt = body.choices?.[0]?.message?.content || '';
    let copys: string[] = [];
    try {
      const parsed = JSON.parse(txt) as { copys?: unknown };
      if (Array.isArray(parsed.copys)) copys = parsed.copys.map((c) => String(c)).filter(Boolean);
    } catch {
      copys = txt.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    }
    if (!copys.length) return { error: 'No pudimos generar el copy. Intenta con otra descripción.' };
    return { copys: copys.slice(0, 3) };
  } catch {
    return { error: 'No pudimos hablar con la IA. Revisa la conexión del servidor.' };
  }
}

/** Genera una imagen con OpenAI (si está configurada OPENAI_API_KEY) y la guarda. */
export async function generarImagen(storeId: string, prompt: string): Promise<{ url?: string; error?: string; sinConfigurar?: boolean }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { sinConfigurar: true, error: 'Para generar imágenes con IA agrega la variable OPENAI_API_KEY en el servidor.' };
  if (!prompt.trim()) return { error: 'Describe la imagen que quieres.' };
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, n: 1, size: '1024x1024' }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } };
    if (!res.ok) return { error: body.error?.message || 'OpenAI no aceptó la solicitud.' };
    const first = body.data?.[0];
    if (first?.b64_json) {
      const saved = saveOutgoingMedia(storeId, `data:image/png;base64,${first.b64_json}`, 'anuncio.png');
      if (saved) return { url: saved.url };
    }
    if (first?.url) return { url: first.url };
    return { error: 'OpenAI no devolvió la imagen.' };
  } catch {
    return { error: 'No pudimos hablar con OpenAI.' };
  }
}
