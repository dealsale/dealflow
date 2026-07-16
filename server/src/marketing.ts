import { saveOutgoingMedia } from './media.js';
import { db, pj } from './db.js';

export interface CopyAnuncio {
  titulo: string;
  descripcion: string;
  texto: string;
}

/**
 * Agente copywriter: genera N copys de anuncio de Facebook/Instagram (título +
 * descripción + texto principal) a partir de un prompt y, opcionalmente, una
 * imagen del producto (la analiza si el proveedor soporta visión — OpenAI).
 */
export async function generarCopys(
  storeId: string,
  input: { idea: string; plataforma: string; tono: string; objetivo: string; cantidad?: number; imagen?: string },
): Promise<{ copys?: CopyAnuncio[]; error?: string }> {
  const { resolverIA } = await import('./ai.js');
  const ia = resolverIA(storeId);
  if (!ia) return { error: 'Configura tu IA en Integraciones (DeepSeek, OpenAI o Grok) para generar copys.' };
  const n = Math.min(5, Math.max(1, Number(input.cantidad) || 3));
  const conImagen = !!input.imagen && input.imagen.startsWith('data:image');
  if (conImagen && ia.proveedor !== 'openai') {
    return { error: 'Para generar copys desde una imagen, tu agente debe ser OpenAI (Integraciones → OpenAI → "Usar como agente"). Con DeepSeek o Grok, describe el producto en texto.' };
  }

  const system = `Eres un copywriter senior especializado en anuncios de Facebook e Instagram para ecommerce con pago contra entrega en Colombia. Escribes con gancho (hook fuerte en la primera línea), beneficios concretos, prueba social cuando aplica, urgencia sin sonar falso y llamado a la acción claro (normalmente escribir al WhatsApp o pedir ya). Emojis con moderación y español colombiano cercano.
Cada COPY es un anuncio completo de Facebook con tres partes:
- "titulo": el headline del anuncio (máximo 40 caracteres, directo y con gancho).
- "descripcion": la descripción corta del anuncio (máximo 25 palabras).
- "texto": el texto principal (primary text), de 4 a 8 líneas: hook, beneficios, oferta/precio y CTA.
Responde SOLO un JSON válido: {"copys":[{"titulo":"...","descripcion":"...","texto":"..."}]} con EXACTAMENTE ${n} copys distintos entre sí (ángulos diferentes: dolor, beneficio, oferta, prueba social, urgencia…).`;

  const textoUser = `${conImagen ? 'Analiza la imagen del producto adjunta y ' : ''}Genera ${n} copys para este anuncio.
Producto o idea: ${input.idea || (conImagen ? 'el producto de la imagen' : '')}
Plataforma: ${input.plataforma || 'Facebook/Instagram'}
Tono: ${input.tono || 'cercano y vendedor'}
Objetivo: ${input.objetivo || 'que escriban por WhatsApp para comprar'}`;

  const userContent: unknown = conImagen
    ? [{ type: 'text', text: textoUser }, { type: 'image_url', image_url: { url: input.imagen } }]
    : textoUser;

  try {
    const res = await fetch(ia.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ia.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ia.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
        max_tokens: 400 + n * 380,
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[marketing] IA respondió', res.status, err.slice(0, 300));
      return { error: 'La IA no respondió. Intenta de nuevo.' };
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const txt = body.choices?.[0]?.message?.content || '';
    let copys: CopyAnuncio[] = [];
    try {
      const parsed = JSON.parse(txt) as { copys?: unknown };
      if (Array.isArray(parsed.copys)) {
        copys = parsed.copys
          .map((c) => {
            const o = c as Record<string, unknown>;
            return { titulo: String(o.titulo || '').trim(), descripcion: String(o.descripcion || '').trim(), texto: String(o.texto || '').trim() };
          })
          .filter((c) => c.texto || c.titulo);
      }
    } catch { /* JSON inválido */ }
    if (!copys.length) return { error: 'No pudimos generar los copys. Intenta con otra descripción.' };
    return { copys: copys.slice(0, n) };
  } catch {
    return { error: 'No pudimos hablar con la IA. Revisa la conexión del servidor.' };
  }
}

/** Genera una imagen con OpenAI (si está configurada OPENAI_API_KEY) y la guarda. */
export async function generarImagen(storeId: string, prompt: string, cantidad = 1): Promise<{ urls?: string[]; error?: string; sinConfigurar?: boolean }> {
  // Primero la clave de OpenAI de la TIENDA (Integraciones); si no, la del servidor.
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'openai'").get(storeId) as { config: string } | undefined;
  const propia = row ? (pj<Record<string, string>>(row.config, {}).apiKey || '').trim() : '';
  const key = propia || process.env.OPENAI_API_KEY;
  if (!key) return { sinConfigurar: true, error: 'Para generar imágenes conecta OpenAI en Integraciones (con tu API key).' };
  if (!prompt.trim()) return { error: 'Describe la imagen que quieres.' };
  const n = Math.min(5, Math.max(1, Number(cantidad) || 1));
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, n, size: '1024x1024' }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } };
    if (!res.ok) return { error: body.error?.message || 'OpenAI no aceptó la solicitud.' };
    const urls: string[] = [];
    for (const item of body.data || []) {
      if (item.b64_json) {
        const saved = saveOutgoingMedia(storeId, `data:image/png;base64,${item.b64_json}`, 'anuncio.png');
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
