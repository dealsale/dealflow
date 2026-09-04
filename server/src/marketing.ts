import { saveOutgoingMedia } from './media.js';

/**
 * Capa de IA compartida del Marketing (la paga DealFlow con su cuenta de
 * OpenAI y se cobra a la tienda por créditos). Aquí viven las dos primitivas:
 * pedirle un JSON al modelo de texto y generar imágenes.
 */

// Base de la API de OpenAI (variable por si algún día se usa un proxy).
const OPENAI = process.env.OPENAI_BASE || 'https://api.openai.com/v1';

// Tamaños de imagen por ubicación del anuncio (los que acepta gpt-image-1).
export const TAMANOS: Record<string, string> = {
  feed: '1024x1024', // cuadrado (feed de Facebook/Instagram)
  historia: '1024x1536', // vertical (historias y reels)
  horizontal: '1536x1024', // horizontal (portada / anuncio ancho)
};

function claveOpenAI(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

export const SIN_OPENAI = 'El Marketing IA no está disponible ahora mismo. (Falta configurar OpenAI en el servidor.)';

/**
 * Le pide al modelo una respuesta en JSON. `imagen` opcional (data URL) activa
 * visión para que analice la foto del producto.
 */
export async function chatJSON<T>(
  system: string,
  user: string,
  opciones: { imagen?: string; maxTokens?: number; temperatura?: number } = {},
): Promise<{ data?: T; error?: string }> {
  const key = claveOpenAI();
  if (!key) return { error: SIN_OPENAI };
  const conImagen = !!opciones.imagen && opciones.imagen.startsWith('data:image');
  const contenido: unknown = conImagen
    ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: opciones.imagen } }]
    : user;
  try {
    const res = await fetch(`${OPENAI}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MARKETING_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: contenido }],
        max_tokens: opciones.maxTokens || 1200,
        temperature: opciones.temperatura ?? 0.85,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[marketing] IA respondió', res.status, err.slice(0, 300));
      return { error: 'La IA no respondió. Intenta de nuevo.' };
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    try {
      return { data: JSON.parse(body.choices?.[0]?.message?.content || '') as T };
    } catch {
      return { error: 'La IA devolvió una respuesta que no pudimos leer. Intenta de nuevo.' };
    }
  } catch {
    return { error: 'No pudimos hablar con la IA. Revisa la conexión del servidor.' };
  }
}

/** Genera imágenes con la cuenta OpenAI de DealFlow y las guarda en la tienda. */
export async function generarImagen(
  storeId: string,
  prompt: string,
  cantidad = 1,
  tamano = 'feed',
): Promise<{ urls?: string[]; error?: string; sinConfigurar?: boolean }> {
  const key = claveOpenAI();
  if (!key) return { sinConfigurar: true, error: SIN_OPENAI };
  if (!prompt.trim()) return { error: 'Describe la imagen que quieres.' };
  const n = Math.min(4, Math.max(1, Number(cantidad) || 1));
  const size = TAMANOS[tamano] || TAMANOS.feed;
  try {
    const res = await fetch(`${OPENAI}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, n, size, quality: process.env.OPENAI_IMAGE_QUALITY || 'medium' }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } };
    if (!res.ok) return { error: body.error?.message || 'OpenAI no aceptó la solicitud.' };
    const urls: string[] = [];
    for (const item of body.data || []) {
      if (item.b64_json) {
        const saved = saveOutgoingMedia(storeId, `data:image/png;base64,${item.b64_json}`, 'creativo.png');
        if (saved) urls.push(saved.url);
      } else if (item.url) {
        urls.push(item.url);
      }
    }
    if (!urls.length) return { error: 'OpenAI no devolvió las imágenes.' };
    return { urls };
  } catch {
    return { error: 'No pudimos hablar con OpenAI.' };
  }
}
