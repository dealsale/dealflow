import { saveOutgoingMedia } from './media.js';
import { db, uid, j, pj } from './db.js';

export interface CopyAnuncio {
  titulo: string;
  descripcion: string;
  texto: string;
  hashtags?: string;
}

// Formatos de contenido que puede pedir la tienda (cambian el estilo del copy).
const FORMATOS: Record<string, { nombre: string; guia: string }> = {
  anuncio: { nombre: 'Anuncio de Facebook/Instagram', guia: 'Anuncio pagado: hook fuerte en la primera línea, beneficios, oferta/precio y CTA claro a WhatsApp.' },
  historia: { nombre: 'Historia / Reel', guia: 'Texto corto y directo para una Historia o Reel: 3-5 líneas con mucho gancho, ideal para leer en 3 segundos, con emojis y un CTA para deslizar o escribir.' },
  organico: { nombre: 'Post orgánico', guia: 'Post orgánico para el feed: tono más cercano y de valor (tip, historia o pregunta), que genere comentarios, sin sonar a anuncio, con CTA suave.' },
  producto: { nombre: 'Descripción de producto', guia: 'Descripción de producto persuasiva para catálogo o web: beneficios, materiales/uso y por qué comprarlo, en 4-6 líneas.' },
};

// Tamaños de imagen por red social (los que acepta gpt-image-1).
const TAMANOS: Record<string, string> = {
  feed: '1024x1024', // cuadrado (feed)
  historia: '1024x1536', // vertical (historias/reels)
  horizontal: '1536x1024', // horizontal (portada/anuncio ancho)
};

/**
 * Agente copywriter: genera N copys de anuncio de Facebook/Instagram (título +
 * descripción + texto principal) a partir de un prompt y, opcionalmente, una
 * imagen del producto (la analiza si el proveedor soporta visión — OpenAI).
 */
export async function generarCopys(
  _storeId: string,
  input: { idea: string; plataforma: string; tono: string; objetivo: string; cantidad?: number; imagen?: string; formato?: string },
): Promise<{ copys?: CopyAnuncio[]; error?: string }> {
  // El Marketing IA usa SIEMPRE la cuenta de OpenAI de DealFlow (se cobra por créditos).
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: 'El Marketing IA no está disponible ahora mismo. (Falta configurar OpenAI en el servidor.)' };
  const ia = { url: 'https://api.openai.com/v1/chat/completions', model: process.env.OPENAI_MARKETING_MODEL || 'gpt-4o-mini', key };
  const n = Math.min(5, Math.max(1, Number(input.cantidad) || 3));
  const conImagen = !!input.imagen && input.imagen.startsWith('data:image');
  const fmt = FORMATOS[input.formato || 'anuncio'] || FORMATOS.anuncio;

  const system = `Eres un copywriter senior de marketing para ecommerce con pago contra entrega en Colombia. Escribes con gancho, beneficios concretos, prueba social cuando aplica, urgencia sin sonar falso y llamado a la acción claro. Emojis con moderación y español colombiano cercano.
FORMATO PEDIDO: ${fmt.nombre}. ${fmt.guia}
Cada pieza tiene:
- "titulo": el titular (máximo 40 caracteres, con gancho).
- "descripcion": una bajada corta (máximo 25 palabras).
- "texto": el texto principal según el formato pedido.
- "hashtags": 5 a 8 hashtags relevantes en una sola línea separados por espacio (incluye locales/de nicho). Si no aplican, cadena vacía.
Responde SOLO un JSON válido: {"copys":[{"titulo":"...","descripcion":"...","texto":"...","hashtags":"..."}]} con EXACTAMENTE ${n} piezas distintas entre sí (ángulos diferentes: dolor, beneficio, oferta, prueba social, urgencia…).`;

  const textoUser = `${conImagen ? 'Analiza la imagen del producto adjunta y ' : ''}Genera ${n} piezas en formato "${fmt.nombre}".
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
            return { titulo: String(o.titulo || '').trim(), descripcion: String(o.descripcion || '').trim(), texto: String(o.texto || '').trim(), hashtags: String(o.hashtags || '').trim() };
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

/** Genera una imagen con la cuenta OpenAI de DealFlow (calidad media) y la guarda. */
export async function generarImagen(storeId: string, prompt: string, cantidad = 1, tamano = 'feed'): Promise<{ urls?: string[]; error?: string; sinConfigurar?: boolean }> {
  // El Marketing IA usa SIEMPRE la cuenta de OpenAI de DealFlow (se cobra por créditos).
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { sinConfigurar: true, error: 'El Marketing IA no está disponible ahora mismo. (Falta configurar OpenAI en el servidor.)' };
  if (!prompt.trim()) return { error: 'Describe la imagen que quieres.' };
  const n = Math.min(5, Math.max(1, Number(cantidad) || 1));
  const size = TAMANOS[tamano] || TAMANOS.feed;
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, n, size, quality: process.env.OPENAI_IMAGE_QUALITY || 'medium' }),
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

// ── Historial: guardar y reusar lo generado ──────────────────────────
export function guardarItem(storeId: string, tipo: 'copy' | 'imagen', contenido: unknown, meta: unknown): void {
  db.prepare('INSERT INTO marketing_items (id, store_id, tipo, contenido, meta) VALUES (?,?,?,?,?)')
    .run(uid(), storeId, tipo, j(contenido), j(meta));
}

export function listarHistorial(storeId: string, limite = 60): unknown[] {
  const rows = db.prepare('SELECT id, tipo, contenido, meta, favorito, created_at FROM marketing_items WHERE store_id = ? ORDER BY favorito DESC, created_at DESC LIMIT ?').all(storeId, limite) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id, tipo: r.tipo, favorito: !!r.favorito, fecha: r.created_at,
    contenido: pj(r.contenido as string, {}), meta: pj(r.meta as string, {}),
  }));
}

export function favoritoItem(storeId: string, id: string, favorito: boolean): void {
  db.prepare('UPDATE marketing_items SET favorito = ? WHERE id = ? AND store_id = ?').run(favorito ? 1 : 0, id, storeId);
}

export function borrarItem(storeId: string, id: string): void {
  db.prepare('DELETE FROM marketing_items WHERE id = ? AND store_id = ?').run(id, storeId);
}
