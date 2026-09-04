import { db, uid, j, pj } from './db.js';
import { chatJSON, generarImagen } from './marketing.js';

/**
 * Campañas publicitarias con IA. Una campaña se arma en tres pasos, en orden,
 * porque cada uno alimenta al siguiente:
 *   1. PRODUCTO  → la IA estudia lo que se vende y arma el brief (público,
 *      dolores, beneficios y ángulos de venta).
 *   2. CREATIVOS → con ese brief genera las imágenes del anuncio.
 *   3. TEXTOS    → con el brief y el creativo escribe los textos con la
 *      estructura exacta de Meta: textos principales, títulos y descripciones.
 * Al final la campaña se puede publicar en el Administrador de anuncios del
 * cliente (ver metaAds.ts).
 */

export interface Brief {
  producto: string;
  descripcion: string;
  precio: string;
  publico: string;
  dolores: string[];
  beneficios: string[];
  angulos: string[];
  propuesta: string;
  ideasCreativo: string[]; // ideas visuales para el paso 2
}

export interface CopysAnuncio {
  textos: string[]; // texto principal (cuerpo del anuncio)
  titulos: string[]; // títulos / headline
  descripciones: string[]; // descripción (bajo el título)
}

export interface Campana {
  id: string;
  nombre: string;
  estado: string; // borrador | lista | publicada
  paso: number; // 1..4
  objetivo: string;
  brief: Brief | null;
  creativos: string[];
  copys: CopysAnuncio | null;
  publicacion: Record<string, unknown> | null;
  fecha: string;
}

const OBJETIVOS: Record<string, string> = {
  mensajes: 'que la persona escriba por WhatsApp para comprar',
  ventas: 'que la persona compre el producto',
  trafico: 'que la persona visite la tienda o página',
  reconocimiento: 'que la persona conozca y recuerde la marca',
};

const BASE_COPY = `Eres un director creativo de publicidad para ecommerce con pago contra entrega en Colombia. Escribes en español colombiano cercano, con gancho real, beneficios concretos y sin promesas falsas. Emojis con moderación.`;

function fila(r: Record<string, unknown>): Campana {
  return {
    id: String(r.id),
    nombre: String(r.nombre),
    estado: String(r.estado),
    paso: Number(r.paso) || 1,
    objetivo: String(r.objetivo || 'mensajes'),
    brief: r.brief ? pj<Brief | null>(r.brief as string, null) : null,
    creativos: pj<string[]>(r.creativos as string, []),
    copys: r.copys ? pj<CopysAnuncio | null>(r.copys as string, null) : null,
    publicacion: r.publicacion ? pj<Record<string, unknown> | null>(r.publicacion as string, null) : null,
    fecha: String(r.updated_at || r.created_at || ''),
  };
}

function tocar(id: string) {
  db.prepare("UPDATE campanas SET updated_at = datetime('now') WHERE id = ?").run(id);
}

// ── CRUD ──────────────────────────────────────────────────────────────
export function listar(storeId: string): Campana[] {
  const rows = db.prepare('SELECT * FROM campanas WHERE store_id = ? ORDER BY updated_at DESC').all(storeId) as Record<string, unknown>[];
  return rows.map(fila);
}

export function obtener(storeId: string, id: string): Campana | null {
  const r = db.prepare('SELECT * FROM campanas WHERE id = ? AND store_id = ?').get(id, storeId) as Record<string, unknown> | undefined;
  return r ? fila(r) : null;
}

export function crear(storeId: string, nombre: string, objetivo: string): string {
  const id = uid();
  db.prepare('INSERT INTO campanas (id, store_id, nombre, objetivo) VALUES (?,?,?,?)')
    .run(id, storeId, nombre.trim() || 'Campaña sin nombre', OBJETIVOS[objetivo] ? objetivo : 'mensajes');
  return id;
}

export function renombrar(storeId: string, id: string, nombre: string): void {
  db.prepare('UPDATE campanas SET nombre = ? WHERE id = ? AND store_id = ?').run(nombre.trim() || 'Campaña sin nombre', id, storeId);
  tocar(id);
}

export function borrar(storeId: string, id: string): void {
  db.prepare('DELETE FROM campanas WHERE id = ? AND store_id = ?').run(id, storeId);
}

/** Guarda ediciones manuales del dueño sobre lo que generó la IA. */
export function guardarPartes(storeId: string, id: string, partes: { brief?: Brief; creativos?: string[]; copys?: CopysAnuncio }): boolean {
  const c = obtener(storeId, id);
  if (!c) return false;
  if (partes.brief) db.prepare('UPDATE campanas SET brief = ? WHERE id = ?').run(j(partes.brief), id);
  if (partes.creativos) db.prepare('UPDATE campanas SET creativos = ? WHERE id = ?').run(j(partes.creativos), id);
  if (partes.copys) db.prepare('UPDATE campanas SET copys = ? WHERE id = ?').run(j(partes.copys), id);
  tocar(id);
  return true;
}

// ── Paso 1: conocer el producto ───────────────────────────────────────
export async function analizarProducto(
  storeId: string,
  id: string,
  input: { idea: string; precio?: string; imagen?: string; publico?: string },
): Promise<{ brief?: Brief; error?: string }> {
  const c = obtener(storeId, id);
  if (!c) return { error: 'Campaña no encontrada.' };
  const conImagen = !!input.imagen && input.imagen.startsWith('data:image');
  if (!input.idea.trim() && !conImagen) return { error: 'Cuéntanos qué vendes (o sube una foto del producto).' };

  const system = `${BASE_COPY}
Tu trabajo ahora es ESTUDIAR el producto antes de crear nada. Devuelve SOLO un JSON válido con esta forma exacta:
{"producto":"nombre corto","descripcion":"qué es y para qué sirve, 2-3 líneas","precio":"precio si se conoce, si no cadena vacía","publico":"a quién le sirve: edad, género, situación y ciudad/país si aplica","dolores":["3 a 5 problemas concretos que resuelve"],"beneficios":["3 a 5 beneficios en lenguaje del cliente"],"angulos":["3 a 5 ángulos de venta distintos: dolor, deseo, oferta, prueba social, urgencia"],"propuesta":"la propuesta de valor en una frase","ideasCreativo":["3 ideas visuales concretas para la foto del anuncio"]}`;

  const user = `${conImagen ? 'Analiza la imagen del producto adjunta y ' : ''}estudia este producto para una campaña cuyo objetivo es ${OBJETIVOS[c.objetivo] || OBJETIVOS.mensajes}.
Producto: ${input.idea || 'el de la imagen'}
${input.precio ? `Precio: ${input.precio}` : ''}
${input.publico ? `Público que cree el dueño: ${input.publico}` : ''}`;

  const r = await chatJSON<Brief>(system, user, { imagen: input.imagen, maxTokens: 1400, temperatura: 0.7 });
  if (r.error || !r.data) return { error: r.error || 'No pudimos estudiar el producto.' };

  const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : []);
  const brief: Brief = {
    producto: String(r.data.producto || input.idea || '').trim(),
    descripcion: String(r.data.descripcion || '').trim(),
    precio: String(r.data.precio || input.precio || '').trim(),
    publico: String(r.data.publico || '').trim(),
    dolores: lista(r.data.dolores),
    beneficios: lista(r.data.beneficios),
    angulos: lista(r.data.angulos),
    propuesta: String(r.data.propuesta || '').trim(),
    ideasCreativo: lista(r.data.ideasCreativo),
  };
  if (!brief.producto && !brief.descripcion) return { error: 'No pudimos entender el producto. Descríbelo con más detalle.' };

  db.prepare("UPDATE campanas SET brief = ?, paso = MAX(paso, 2), estado = 'borrador' WHERE id = ?").run(j(brief), id);
  tocar(id);
  return { brief };
}

// ── Paso 2: creativos (imágenes) ──────────────────────────────────────
export async function crearCreativos(
  storeId: string,
  id: string,
  input: { instruccion?: string; cantidad?: number; tamano?: string },
): Promise<{ creativos?: string[]; error?: string }> {
  const c = obtener(storeId, id);
  if (!c) return { error: 'Campaña no encontrada.' };
  if (!c.brief) return { error: 'Primero estudia el producto (paso 1).' };
  const b = c.brief;

  // El prompt de imagen sale del brief: así el creativo habla del mismo producto.
  const prompt = [
    `Fotografía publicitaria profesional para un anuncio de Facebook e Instagram.`,
    `Producto: ${b.producto}. ${b.descripcion}`,
    b.publico ? `Dirigido a: ${b.publico}.` : '',
    input.instruccion?.trim() ? `Indicación del cliente: ${input.instruccion.trim()}.` : (b.ideasCreativo[0] ? `Idea visual: ${b.ideasCreativo[0]}.` : ''),
    `Iluminación cuidada, colores vivos, composición limpia con espacio para texto, aspecto real y creíble.`,
    `Sin texto ni letras dentro de la imagen, sin marcas de agua, sin collage.`,
  ].filter(Boolean).join(' ');

  const r = await generarImagen(storeId, prompt, input.cantidad || 1, input.tamano || 'feed');
  if (r.error || !r.urls) return { error: r.error || 'No pudimos generar el creativo.' };

  const todos = [...c.creativos, ...r.urls].slice(0, 12);
  db.prepare("UPDATE campanas SET creativos = ?, paso = MAX(paso, 3) WHERE id = ?").run(j(todos), id);
  tocar(id);
  return { creativos: todos };
}

// ── Paso 3: textos del anuncio (estructura de Meta) ───────────────────
export async function crearTextos(
  storeId: string,
  id: string,
  input: { tono?: string; cantidad?: number },
): Promise<{ copys?: CopysAnuncio; error?: string }> {
  const c = obtener(storeId, id);
  if (!c) return { error: 'Campaña no encontrada.' };
  if (!c.brief) return { error: 'Primero estudia el producto (paso 1).' };
  const b = c.brief;
  const n = Math.min(6, Math.max(2, Number(input.cantidad) || 4));

  const system = `${BASE_COPY}
Escribes anuncios para el Administrador de anuncios de Meta, respetando su estructura y límites:
- "textos": TEXTO PRINCIPAL, el cuerpo del anuncio. Gancho en la primera línea, beneficios, y llamado a la acción. Ideal menos de 125 caracteres antes del "ver más", puede seguir después.
- "titulos": TÍTULO corto y potente, máximo 40 caracteres.
- "descripciones": DESCRIPCIÓN de apoyo, máximo 30 caracteres.
Devuelve SOLO un JSON válido: {"textos":["..."],"titulos":["..."],"descripciones":["..."]} con EXACTAMENTE ${n} de cada uno, todos distintos entre sí y cada uno con un ángulo diferente.`;

  const user = `Escribe los textos del anuncio con este brief:
Producto: ${b.producto}
Qué es: ${b.descripcion}
${b.precio ? `Precio: ${b.precio}` : ''}
Público: ${b.publico}
Dolores: ${b.dolores.join(' | ')}
Beneficios: ${b.beneficios.join(' | ')}
Ángulos a cubrir: ${b.angulos.join(' | ')}
Propuesta de valor: ${b.propuesta}
Objetivo de la campaña: ${OBJETIVOS[c.objetivo] || OBJETIVOS.mensajes}
Tono: ${input.tono || 'cercano y vendedor'}`;

  const r = await chatJSON<CopysAnuncio>(system, user, { maxTokens: 400 + n * 320, temperatura: 0.95 });
  if (r.error || !r.data) return { error: r.error || 'No pudimos escribir los textos.' };

  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []);
  const copys: CopysAnuncio = {
    textos: lista(r.data.textos, n),
    titulos: lista(r.data.titulos, n),
    descripciones: lista(r.data.descripciones, n),
  };
  if (!copys.textos.length && !copys.titulos.length) return { error: 'No pudimos escribir los textos. Intenta de nuevo.' };

  db.prepare("UPDATE campanas SET copys = ?, paso = MAX(paso, 4), estado = 'lista' WHERE id = ?").run(j(copys), id);
  tocar(id);
  return { copys };
}
