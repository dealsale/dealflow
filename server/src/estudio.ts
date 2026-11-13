/**
 * Estudio de creativos (Marketing IA): videos UGC y fotos de producto para vender cualquier
 * producto en e-commerce, generados con la cuenta OpenAI de DealFlow y cobrados SOLO con
 * créditos (sin membresías: la tienda ya paga su mensualidad; DealFlow gana con las recargas).
 *
 * Flujo:
 *   1. Proyecto = brief del producto (+ foto real del producto, recomendada).
 *   2. Paquete: la IA (texto, con visión de la foto) propone N videos y N fotos con ángulos
 *      distintos, cada uno con su prompt, hook y textos de anuncio.
 *   3. Cada pieza se genera aparte (la tienda ve el costo antes): fotos con gpt-image
 *      (edits sobre la foto real si la hay) y videos con Sora (la foto como primer cuadro).
 *      Los créditos se descuentan al pedir y se devuelven si la generación falla.
 *   4. Los videos se consultan cada 20 s hasta que terminan; el MP4 y su miniatura quedan en
 *      el almacenamiento de la tienda (las URLs de OpenAI no son permanentes).
 *   5. La tienda aprueba o descarta y descarga todo en un .zip con la carpeta de entrega.
 *
 * Variables: OPENAI_API_KEY · OPENAI_IMAGE_MODEL (gpt-image-1) · OPENAI_VIDEO_MODEL (sora-2)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
import { db, uid } from './db.js';
import { abonar, cobrar, saldo } from './creditos.js';
import { chatJSON, SIN_OPENAI } from './marketing.js';
import { mediaDir, mediaPath } from './media.js';

const OPENAI = process.env.OPENAI_BASE || 'https://api.openai.com/v1';
const txt = (v: unknown) => (v == null ? '' : String(v));

db.exec(`CREATE TABLE IF NOT EXISTS estudio_proyectos (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '{}',
  foto TEXT NOT NULL DEFAULT '',        -- /api/media/... foto real del producto (referencia)
  copys TEXT NOT NULL DEFAULT '{}',     -- textos de anuncio sugeridos (primarios, títulos, descripciones)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_estudio_proy_store ON estudio_proyectos(store_id, created_at)');
db.exec(`CREATE TABLE IF NOT EXISTS estudio_piezas (
  id TEXT PRIMARY KEY,
  proyecto_id TEXT NOT NULL REFERENCES estudio_proyectos(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL,
  tipo TEXT NOT NULL,                   -- video | imagen
  orden INTEGER NOT NULL DEFAULT 0,
  angulo TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  texto TEXT NOT NULL DEFAULT '',       -- texto principal del anuncio
  titular TEXT NOT NULL DEFAULT '',
  uso TEXT NOT NULL DEFAULT '',         -- dónde se usa (feed, historia, catálogo…)
  formato TEXT NOT NULL DEFAULT '9:16',
  modelo TEXT NOT NULL DEFAULT '',
  segundos INTEGER NOT NULL DEFAULT 0,
  calidad TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'borrador', -- borrador | generando | listo | fallido | aprobado | descartado
  creditos INTEGER NOT NULL DEFAULT 0,  -- lo que costó (se devuelve si falla)
  externo TEXT NOT NULL DEFAULT '',     -- id del trabajo en OpenAI (videos)
  progreso INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL DEFAULT '',
  miniatura TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_estudio_piezas_proy ON estudio_piezas(proyecto_id, tipo, orden)');
db.exec("CREATE INDEX IF NOT EXISTS idx_estudio_piezas_gen ON estudio_piezas(estado) WHERE estado = 'generando'");

// ── Precios en créditos ──────────────────────────────────────────────────────
// Referencia: 1 crédito ≈ $40 COP en el paquete más chico. Costos de OpenAI aprox. (dólar ≈ $4.000):
//   sora-2 ≈ US$0,10/s · sora-2-pro ≈ US$0,30/s · imagen media ≈ US$0,04–0,07 · alta ≈ US$0,17–0,25.
// Los precios dejan ~3x sobre el costo. Se pueden ajustar con las variables ESTUDIO_CRED_*.
const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.round(Number(v)) : d);
export const PRECIOS_ESTUDIO = {
  paquete: num(process.env.ESTUDIO_CRED_PAQUETE, 3), // la IA arma el paquete de ideas y prompts
  imagenMedia: num(process.env.ESTUDIO_CRED_IMAGEN, 20),
  imagenAlta: num(process.env.ESTUDIO_CRED_IMAGEN_ALTA, 60),
  videoSegundo: num(process.env.ESTUDIO_CRED_VIDEO_S, 30), // sora-2
  videoProSegundo: num(process.env.ESTUDIO_CRED_VIDEO_PRO_S, 90), // sora-2-pro
};
export const MODELOS_VIDEO = ['sora-2', 'sora-2-pro'] as const;
export const SEGUNDOS = [4, 8, 12] as const;

export function costoPieza(p: { tipo: string; modelo?: string; segundos?: number; calidad?: string }): number {
  if (p.tipo === 'video') {
    const s = SEGUNDOS.includes(Number(p.segundos) as 4) ? Number(p.segundos) : 8;
    return s * (p.modelo === 'sora-2-pro' ? PRECIOS_ESTUDIO.videoProSegundo : PRECIOS_ESTUDIO.videoSegundo);
  }
  return p.calidad === 'high' ? PRECIOS_ESTUDIO.imagenAlta : PRECIOS_ESTUDIO.imagenMedia;
}

// ── Brief ────────────────────────────────────────────────────────────────────
export interface BriefEstudio {
  producto: string;
  categoria: string;
  precio: number;
  publico: string;
  variantes: string;    // colores, tallas, sabores, presentaciones…
  oferta: string;
  beneficios: string[];
  estilo: string;       // ugc | ecommerce | mixto
  formato: string;      // 9:16 | 1:1 | 16:9
  videos: number;
  imagenes: number;
  notas: string;
}
function limpiarBrief(b: Record<string, unknown>): BriefEstudio {
  const t = (v: unknown, n = 300) => txt(v).trim().slice(0, n);
  const ben = Array.isArray(b.beneficios) ? b.beneficios : txt(b.beneficios).split('\n');
  return {
    producto: t(b.producto, 120), categoria: t(b.categoria, 80), precio: Math.max(0, Math.round(Number(b.precio) || 0)),
    publico: t(b.publico), variantes: t(b.variantes), oferta: t(b.oferta),
    beneficios: ben.map((x) => t(x, 160)).filter(Boolean).slice(0, 8),
    estilo: ['ugc', 'ecommerce', 'mixto'].includes(txt(b.estilo)) ? txt(b.estilo) : 'mixto',
    formato: ['9:16', '1:1', '16:9'].includes(txt(b.formato)) ? txt(b.formato) : '9:16',
    videos: Math.min(13, Math.max(0, Math.round(Number(b.videos ?? 6)))),
    imagenes: Math.min(10, Math.max(0, Math.round(Number(b.imagenes ?? 4)))),
    notas: t(b.notas, 600),
  };
}

// ── Proyectos ────────────────────────────────────────────────────────────────
type Fila = Record<string, unknown>;
const pj = <T,>(s: unknown, d: T): T => { try { return JSON.parse(txt(s)) as T; } catch { return d; } };

function mapPieza(p: Fila) {
  return {
    id: txt(p.id), tipo: txt(p.tipo), orden: Number(p.orden) || 0, angulo: txt(p.angulo), hook: txt(p.hook), prompt: txt(p.prompt),
    texto: txt(p.texto), titular: txt(p.titular), uso: txt(p.uso), formato: txt(p.formato), modelo: txt(p.modelo), segundos: Number(p.segundos) || 0,
    calidad: txt(p.calidad), estado: txt(p.estado), creditos: Number(p.creditos) || 0, progreso: Number(p.progreso) || 0,
    url: txt(p.url), miniatura: txt(p.miniatura), error: txt(p.error), actualizado: txt(p.updated_at),
  };
}
export function listarProyectos(storeId: string) {
  return (db.prepare(`SELECT p.id, p.nombre, p.foto, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM estudio_piezas x WHERE x.proyecto_id = p.id AND x.tipo = 'video' AND x.url != '') videos,
      (SELECT COUNT(*) FROM estudio_piezas x WHERE x.proyecto_id = p.id AND x.tipo = 'imagen' AND x.url != '') imagenes,
      (SELECT COUNT(*) FROM estudio_piezas x WHERE x.proyecto_id = p.id AND x.estado = 'generando') generando
    FROM estudio_proyectos p WHERE p.store_id = ? ORDER BY p.updated_at DESC LIMIT 100`).all(storeId) as Fila[])
    .map((p) => ({ id: txt(p.id), nombre: txt(p.nombre), foto: txt(p.foto), videos: Number(p.videos), imagenes: Number(p.imagenes), generando: Number(p.generando), actualizado: txt(p.updated_at) }));
}
export function obtenerProyecto(storeId: string, id: string) {
  const p = db.prepare('SELECT * FROM estudio_proyectos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!p) return null;
  const piezas = (db.prepare("SELECT * FROM estudio_piezas WHERE proyecto_id = ? AND estado != 'descartado' ORDER BY tipo DESC, orden").all(id) as Fila[]).map(mapPieza);
  return { id: txt(p.id), nombre: txt(p.nombre), brief: pj<BriefEstudio | Record<string, never>>(p.brief, {}), foto: txt(p.foto), copys: pj(p.copys, {}), piezas };
}

/** Guarda una imagen (data URL) como foto de referencia del producto. */
function guardarFotoReferencia(storeId: string, dataUrl: string): string {
  const m = /^data:(image\/(png|jpe?g|webp));base64,(.+)$/s.exec(dataUrl || '');
  if (!m) return '';
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 12 * 1024 * 1024) return '';
  const file = uid() + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]);
  writeFileSync(path.join(mediaDir(storeId), file), buf);
  return `/api/media/${storeId}/${file}`;
}

export function guardarProyecto(storeId: string, id: string | null, body: Record<string, unknown>): { id: string } | { error: string } {
  const brief = limpiarBrief((body.brief || {}) as Record<string, unknown>);
  if (!brief.producto) return { error: 'Escribe el nombre del producto.' };
  let foto = '';
  if (typeof body.fotoDataUrl === 'string' && body.fotoDataUrl.startsWith('data:image')) {
    foto = guardarFotoReferencia(storeId, body.fotoDataUrl);
    if (!foto) return { error: 'La foto no es válida (usa JPG, PNG o WEBP de máximo 12 MB).' };
  } else if (typeof body.foto === 'string' && body.foto.startsWith(`/api/media/${storeId}/`)) foto = body.foto;
  const nombre = txt(body.nombre).trim().slice(0, 120) || brief.producto;
  if (id) {
    const r = db.prepare(`UPDATE estudio_proyectos SET nombre = ?, brief = ?, foto = CASE WHEN ? != '' THEN ? ELSE foto END, updated_at = datetime('now') WHERE id = ? AND store_id = ?`)
      .run(nombre, JSON.stringify(brief), foto, foto, id, storeId);
    return r.changes ? { id } : { error: 'Proyecto no encontrado.' };
  }
  const nuevo = uid();
  db.prepare('INSERT INTO estudio_proyectos (id, store_id, nombre, brief, foto) VALUES (?,?,?,?,?)').run(nuevo, storeId, nombre, JSON.stringify(brief), foto);
  return { id: nuevo };
}
export function borrarProyecto(storeId: string, id: string): void {
  db.prepare('DELETE FROM estudio_piezas WHERE proyecto_id = ? AND store_id = ?').run(id, storeId);
  db.prepare('DELETE FROM estudio_proyectos WHERE id = ? AND store_id = ?').run(id, storeId);
}

// ── Paquete de ideas y prompts (IA de texto) ────────────────────────────────
const RESTRICCIONES = 'Sin texto en pantalla, sin logos ni marcas de terceros, sin rostros de personas reales ni celebridades, sin menores de edad, sin deformaciones en manos ni en el producto.';
const POLITICAS_META = [
  'Nada de promesas médicas, de salud o de pérdida de peso garantizada (di «moldea», «ayuda a», nunca «adelgaza» o «cura»).',
  'Nada de antes/después que sugiera cambios corporales irreales.',
  'No aludas a atributos personales de quien lee («¿Tienes barriga?», «¿Sufres de…?»).',
  'Nada de precios falsos, urgencia engañosa ni marcas de terceros.',
].join(' ');

const ANGULOS_BASE = 'hook de problema→solución, demostración del producto en uso, unboxing contraentrega (llega a la puerta y lo abre), detalle de calidad en macro, ocasión de uso real (lifestyle), testimonio estilo UGC (persona hablando a cámara en su casa, grabado con celular), variantes/colores disponibles, comparación con la alternativa común, «3 razones para comprarlo».';

interface PaqueteIA {
  videos?: { angulo?: string; hook?: string; prompt?: string; texto?: string; titular?: string }[];
  imagenes?: { uso?: string; prompt?: string; texto?: string; titular?: string }[];
  copys?: { textos?: string[]; titulares?: string[]; descripciones?: string[] };
}

function dataUrlDe(storeId: string, url: string): string {
  if (!url.startsWith(`/api/media/${storeId}/`)) return '';
  const p = mediaPath(storeId, url.split('/').pop()!);
  if (!existsSync(p)) return '';
  const ext = path.extname(p).slice(1).toLowerCase();
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${readFileSync(p).toString('base64')}`;
}

export async function generarPaquete(storeId: string, id: string): Promise<{ ok: true; videos: number; imagenes: number } | { error: string; sinCreditos?: boolean }> {
  const pr = db.prepare('SELECT * FROM estudio_proyectos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!pr) return { error: 'Proyecto no encontrado.' };
  if (!process.env.OPENAI_API_KEY) return { error: SIN_OPENAI };
  const b = pj<BriefEstudio>(pr.brief, limpiarBrief({}));
  if (!b.videos && !b.imagenes) return { error: 'Pide al menos un video o una foto.' };
  const costo = PRECIOS_ESTUDIO.paquete;
  if (!cobrar(storeId, costo, `Estudio IA: ideas y prompts para ${b.producto}`)) return { error: `Necesitas ${costo} créditos para armar el paquete.`, sinCreditos: true };
  const estilo = b.estilo === 'ugc' ? 'UGC (contenido estilo usuario real grabado con celular, natural y cercano)' : b.estilo === 'ecommerce' ? 'e-commerce de catálogo (producto limpio, fondo de estudio, tomas de producto profesionales)' : 'mezcla de UGC (estilo usuario real con celular) y e-commerce de catálogo';
  const system = `Eres director creativo de anuncios de e-commerce en Colombia (ventas por WhatsApp y contraentrega). Creas piezas para vender CUALQUIER tipo de producto (moda, belleza, hogar, tecnología, mascotas, salud y bienestar, accesorios, juguetes, comida…): adapta las escenas a la categoría real del producto, no asumas que es ropa.
Devuelve SOLO un JSON con esta forma:
{"videos":[{"angulo":"","hook":"","prompt":"","texto":"","titular":""}],"imagenes":[{"uso":"","prompt":"","texto":"","titular":""}],"copys":{"textos":[""],"titulares":[""],"descripciones":[""]}}
Reglas:
- "videos": exactamente ${b.videos}. Cada uno con un ÁNGULO DISTINTO (rota entre: ${ANGULOS_BASE}). "hook" = lo que pasa o se dice en los primeros 2 segundos para detener el scroll.
- El "prompt" de cada video es para Sora (generador de video), en español, con esta estructura en líneas: Formato (vertical ${b.formato}, estilo ${estilo}) · Escena · Sujeto (el producto, fiel a la foto de referencia en color, forma y detalles) · Acción (qué pasa segundo a segundo) · Cámara · Luz · Beneficio a mostrar · Restricciones: ${RESTRICCIONES}
- Si hay personas: adultos genéricos generados (nunca reales), preferiblemente tomas sin rostro o de espaldas, manos, cuello hacia abajo.
- "imagenes": exactamente ${b.imagenes}, para anuncios y catálogo (packshot fondo blanco, producto en uso, detalle, variantes, foto estilo cliente real, banner con espacio para oferta…). "uso" = dónde sirve. El "prompt" es para un generador de imágenes, fotográfico y realista, con las mismas restricciones.
- "texto" (texto principal del anuncio, 1–3 frases, cálido, colombiano, con la oferta) y "titular" (máx. 40 caracteres) para cada pieza.
- "copys": 5 textos principales, 5 titulares y 3 descripciones extra.
- Políticas de Meta (obligatorias): ${POLITICAS_META}`;
  const user = `Producto: ${b.producto}
Categoría: ${b.categoria || 'no indicada (dedúcela)'}
Precio: ${b.precio ? '$' + b.precio.toLocaleString('es-CO') + ' COP' : 'no indicado'}
Público: ${b.publico || 'no indicado'}
Variantes: ${b.variantes || 'no indicadas'}
Oferta: ${b.oferta || 'pago contraentrega'}
Beneficios: ${b.beneficios.join('; ') || 'dedúcelos de la foto y el producto'}
Notas: ${b.notas || '—'}
${pr.foto ? 'Te adjunto la foto real del producto: describe el producto con fidelidad en cada prompt.' : 'No hay foto: describe el producto de forma genérica pero creíble.'}`;
  const r = await chatJSON<PaqueteIA>(system, user, { imagen: dataUrlDe(storeId, txt(pr.foto)) || undefined, maxTokens: 6000, temperatura: 0.8 });
  if (r.error || !r.data) { abonar(storeId, costo, 'Devolución: no se pudo armar el paquete'); return { error: r.error || 'La IA no respondió.' }; }
  const vids = (r.data.videos || []).filter((v) => txt(v.prompt).trim()).slice(0, b.videos);
  const imgs = (r.data.imagenes || []).filter((v) => txt(v.prompt).trim()).slice(0, b.imagenes);
  if (!vids.length && !imgs.length) { abonar(storeId, costo, 'Devolución: la IA no devolvió piezas'); return { error: 'La IA no devolvió ideas. Intenta de nuevo.' }; }
  const modeloVideo = process.env.OPENAI_VIDEO_MODEL || 'sora-2';
  const ultimo = (tipo: string) => (db.prepare('SELECT COALESCE(MAX(orden),0) n FROM estudio_piezas WHERE proyecto_id = ? AND tipo = ?').get(id, tipo) as { n: number }).n;
  const ins = db.prepare(`INSERT INTO estudio_piezas (id, proyecto_id, store_id, tipo, orden, angulo, hook, prompt, texto, titular, uso, formato, modelo, segundos, calidad)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    let ov = ultimo('video'), oi = ultimo('imagen');
    for (const v of vids) ins.run(uid(), id, storeId, 'video', ++ov, txt(v.angulo).slice(0, 80), txt(v.hook).slice(0, 300), txt(v.prompt).slice(0, 4000), txt(v.texto).slice(0, 600), txt(v.titular).slice(0, 80), '', b.formato, modeloVideo, 8, '');
    for (const v of imgs) ins.run(uid(), id, storeId, 'imagen', ++oi, '', '', txt(v.prompt).slice(0, 4000), txt(v.texto).slice(0, 600), txt(v.titular).slice(0, 80), txt(v.uso).slice(0, 80), b.formato, process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', 0, 'medium');
    db.prepare("UPDATE estudio_proyectos SET copys = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(r.data!.copys || {}), id);
  })();
  return { ok: true, videos: vids.length, imagenes: imgs.length };
}

/** Pieza a mano (sin pasar por la IA de ideas): la tienda escribe su propio prompt. */
export function agregarPieza(storeId: string, proyectoId: string, b: Record<string, unknown>): { id: string } | { error: string } {
  const pr = db.prepare('SELECT brief FROM estudio_proyectos WHERE id = ? AND store_id = ?').get(proyectoId, storeId) as Fila | undefined;
  if (!pr) return { error: 'Proyecto no encontrado.' };
  const tipo = b.tipo === 'video' ? 'video' : 'imagen';
  const prompt = txt(b.prompt).trim().slice(0, 4000);
  if (prompt.length < 10) return { error: 'Describe lo que quieres ver (mínimo una frase).' };
  const formato = pj<BriefEstudio>(pr.brief, limpiarBrief({})).formato;
  const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM estudio_piezas WHERE proyecto_id = ? AND tipo = ?').get(proyectoId, tipo) as { n: number }).n;
  const id = uid();
  db.prepare(`INSERT INTO estudio_piezas (id, proyecto_id, store_id, tipo, orden, angulo, prompt, formato, modelo, segundos, calidad) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, proyectoId, storeId, tipo, orden, tipo === 'video' ? 'Personalizado' : '', prompt, formato,
      tipo === 'video' ? (process.env.OPENAI_VIDEO_MODEL || 'sora-2') : (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'), tipo === 'video' ? 8 : 0, tipo === 'video' ? '' : 'medium');
  return { id };
}

export function editarPieza(storeId: string, id: string, b: Record<string, unknown>): { ok: true } | { error: string } {
  const p = db.prepare('SELECT * FROM estudio_piezas WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!p) return { error: 'Pieza no encontrada.' };
  const sets: string[] = []; const vals: unknown[] = [];
  const poner = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  if (typeof b.prompt === 'string') poner('prompt', b.prompt.slice(0, 4000));
  if (typeof b.texto === 'string') poner('texto', b.texto.slice(0, 600));
  if (typeof b.titular === 'string') poner('titular', b.titular.slice(0, 80));
  if (typeof b.modelo === 'string' && p.tipo === 'video' && (MODELOS_VIDEO as readonly string[]).includes(b.modelo)) poner('modelo', b.modelo);
  if (b.segundos != null && p.tipo === 'video' && SEGUNDOS.includes(Number(b.segundos) as 4)) poner('segundos', Number(b.segundos));
  if (typeof b.calidad === 'string' && p.tipo === 'imagen' && ['medium', 'high'].includes(b.calidad)) poner('calidad', b.calidad);
  if (typeof b.formato === 'string' && ['9:16', '1:1', '16:9'].includes(b.formato)) poner('formato', b.formato);
  if (typeof b.estado === 'string' && ['aprobado', 'descartado'].includes(b.estado) && p.estado !== 'generando') poner('estado', b.estado);
  if (b.estado === 'listo' && p.estado === 'aprobado') poner('estado', 'listo'); // quitar la aprobación
  if (!sets.length) return { ok: true };
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE estudio_piezas SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return { ok: true };
}

// ── Generación ───────────────────────────────────────────────────────────────
const tamanoImagen = (f: string) => (f === '16:9' ? '1536x1024' : f === '1:1' ? '1024x1024' : '1024x1536');
const tamanoVideo = (f: string, modelo: string) => (f === '16:9' ? (modelo === 'sora-2-pro' ? '1792x1024' : '1280x720') : modelo === 'sora-2-pro' ? '1024x1792' : '720x1280');

/** Foto de referencia escalada y con relleno al tamaño EXACTO que pide Sora (input_reference). */
function referenciaVideo(storeId: string, foto: string, size: string): Buffer | null {
  if (!foto.startsWith(`/api/media/${storeId}/`)) return null;
  const src = mediaPath(storeId, foto.split('/').pop()!);
  if (!existsSync(src)) return null;
  const [w, h] = size.split('x');
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-ref-'));
    const out = path.join(dir, 'ref.png');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=white`, '-frames:v', '1', out], { timeout: 30_000 });
    return r.status === 0 && existsSync(out) ? readFileSync(out) : null;
  } catch { return null; } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
}

function guardarArchivo(storeId: string, buf: Buffer, ext: string): string {
  const file = uid() + '.' + ext;
  writeFileSync(path.join(mediaDir(storeId), file), buf);
  return `/api/media/${storeId}/${file}`;
}

function fallo(p: Fila, error: string): void {
  db.prepare("UPDATE estudio_piezas SET estado = 'fallido', error = ?, updated_at = datetime('now') WHERE id = ?").run(error.slice(0, 400), txt(p.id));
  if (Number(p.creditos) > 0) abonar(txt(p.store_id), Number(p.creditos), `Devolución: ${p.tipo === 'video' ? 'video' : 'foto'} que no se pudo generar`, txt(p.id));
}

const mensajeOpenAI = (b: { error?: { message?: string; code?: string } }, http: number) => {
  const m = b.error?.message || '';
  if (/safety|moderation|policy|rejected/i.test(m + (b.error?.code || ''))) return 'OpenAI rechazó el contenido por sus políticas (personas reales, marcas, menores…). Ajusta el prompt o la foto y vuelve a intentar.';
  return m ? `OpenAI: ${m}` : `OpenAI respondió ${http}`;
};

/** Pide la generación de una pieza: cobra, y la imagen se hace al momento; el video queda en cola en OpenAI. */
export async function generarPieza(storeId: string, id: string): Promise<{ ok: true; estado: string } | { error: string; sinCreditos?: boolean }> {
  const p = db.prepare('SELECT * FROM estudio_piezas WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!p) return { error: 'Pieza no encontrada.' };
  if (p.estado === 'generando') return { error: 'Esta pieza ya se está generando.' };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: SIN_OPENAI };
  const pr = db.prepare('SELECT foto, brief FROM estudio_proyectos WHERE id = ?').get(txt(p.proyecto_id)) as Fila;
  const costo = costoPieza({ tipo: txt(p.tipo), modelo: txt(p.modelo), segundos: Number(p.segundos), calidad: txt(p.calidad) });
  if (saldo(storeId) < costo || !cobrar(storeId, costo, `Estudio IA: ${p.tipo === 'video' ? `video ${p.segundos}s (${p.modelo})` : 'foto'} · ${txt(p.angulo || p.uso || 'pieza').slice(0, 40)}`)) {
    return { error: `Necesitas ${costo} créditos para esta ${p.tipo === 'video' ? 'pieza de video' : 'foto'}. Recarga para seguir.`, sinCreditos: true };
  }
  db.prepare("UPDATE estudio_piezas SET estado = 'generando', creditos = ?, error = '', progreso = 0, externo = '', updated_at = datetime('now') WHERE id = ?").run(costo, id);
  const fila = { ...p, creditos: costo } as Fila;
  const foto = txt(pr?.foto);
  const prompt = `${txt(p.prompt)}\n\n${RESTRICCIONES}`;

  if (p.tipo === 'imagen') {
    try {
      const size = tamanoImagen(txt(p.formato));
      const modelo = txt(p.modelo) || 'gpt-image-1';
      let res: Response;
      const ref = foto.startsWith(`/api/media/${storeId}/`) ? mediaPath(storeId, foto.split('/').pop()!) : '';
      if (ref && existsSync(ref)) {
        // Con la foto real: edits mantiene el producto fiel.
        const form = new FormData();
        form.append('model', modelo);
        form.append('prompt', prompt);
        form.append('size', size);
        form.append('quality', txt(p.calidad) || 'medium');
        const ext = path.extname(ref).slice(1).toLowerCase();
        form.append('image[]', new Blob([new Uint8Array(readFileSync(ref))], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }), `producto.${ext}`);
        res = await fetch(`${OPENAI}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(240_000) });
      } else {
        res = await fetch(`${OPENAI}/images/generations`, {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, prompt, size, quality: txt(p.calidad) || 'medium', n: 1 }), signal: AbortSignal.timeout(240_000),
        });
      }
      const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string; code?: string } };
      const b64 = body.data?.[0]?.b64_json;
      if (!res.ok || !b64) { fallo(fila, mensajeOpenAI(body, res.status)); return { error: mensajeOpenAI(body, res.status) }; }
      const url = guardarArchivo(storeId, Buffer.from(b64, 'base64'), 'png');
      db.prepare("UPDATE estudio_piezas SET estado = 'listo', url = ?, progreso = 100, updated_at = datetime('now') WHERE id = ?").run(url, id);
      tocarProyecto(txt(p.proyecto_id));
      return { ok: true, estado: 'listo' };
    } catch (e) {
      const m = (e as Error)?.name === 'TimeoutError' ? 'OpenAI tardó demasiado. Intenta de nuevo.' : 'No pudimos hablar con OpenAI.';
      fallo(fila, m); return { error: m };
    }
  }

  // Video (Sora): se crea el trabajo y se consulta en segundo plano.
  try {
    const modelo = txt(p.modelo) || 'sora-2';
    const size = tamanoVideo(txt(p.formato), modelo);
    const form = new FormData();
    form.append('model', modelo);
    form.append('prompt', prompt);
    form.append('seconds', String(Number(p.segundos) || 8));
    form.append('size', size);
    const ref = foto ? referenciaVideo(storeId, foto, size) : null;
    if (ref) form.append('input_reference', new Blob([new Uint8Array(ref)], { type: 'image/png' }), 'referencia.png');
    const res = await fetch(`${OPENAI}/videos`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60_000) });
    const body = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string; code?: string } };
    if (!res.ok || !body.id) { fallo(fila, mensajeOpenAI(body, res.status)); return { error: mensajeOpenAI(body, res.status) }; }
    db.prepare("UPDATE estudio_piezas SET externo = ?, updated_at = datetime('now') WHERE id = ?").run(body.id, id);
    tocarProyecto(txt(p.proyecto_id));
    return { ok: true, estado: 'generando' };
  } catch {
    fallo(fila, 'No pudimos hablar con OpenAI para crear el video.');
    return { error: 'No pudimos hablar con OpenAI para crear el video.' };
  }
}

const tocarProyecto = (id: string) => db.prepare("UPDATE estudio_proyectos SET updated_at = datetime('now') WHERE id = ?").run(id);

/** Revisa los videos en curso: progreso, descarga del MP4 y la miniatura, o devolución si fallan. */
export async function revisarVideos(storeId?: string): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return;
  const filas = db.prepare(`SELECT * FROM estudio_piezas WHERE estado = 'generando' AND tipo = 'video' ${storeId ? 'AND store_id = ?' : ''} ORDER BY updated_at LIMIT 30`).all(...(storeId ? [storeId] : [])) as Fila[];
  for (const p of filas) {
    const ext = txt(p.externo);
    if (!ext) {
      // Quedó «generando» sin trabajo (p. ej. se reinició el servidor a la mitad): se devuelve.
      if (Date.now() - Date.parse(txt(p.updated_at).replace(' ', 'T') + 'Z') > 10 * 60_000) fallo(p, 'El video no alcanzó a crearse. Se devolvieron los créditos.');
      continue;
    }
    try {
      const r = await fetch(`${OPENAI}/videos/${encodeURIComponent(ext)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
      const v = (await r.json().catch(() => ({}))) as { status?: string; progress?: number; error?: { message?: string; code?: string } };
      if (!r.ok) { if (r.status === 404) fallo(p, 'OpenAI ya no tiene este video.'); continue; }
      if (v.status === 'failed') { fallo(p, mensajeOpenAI(v, 200)); continue; }
      if (v.status !== 'completed') {
        db.prepare('UPDATE estudio_piezas SET progreso = ? WHERE id = ?').run(Math.max(0, Math.min(99, Math.round(Number(v.progress) || 0))), txt(p.id));
        // Más de 40 minutos sin terminar: se da por perdido.
        if (Date.now() - Date.parse(txt(p.updated_at).replace(' ', 'T') + 'Z') > 40 * 60_000) fallo(p, 'El video tardó demasiado en OpenAI. Se devolvieron los créditos.');
        continue;
      }
      const mp4 = await fetch(`${OPENAI}/videos/${encodeURIComponent(ext)}/content`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(180_000) });
      if (!mp4.ok) continue; // se reintenta en la próxima vuelta
      const url = guardarArchivo(txt(p.store_id), Buffer.from(await mp4.arrayBuffer()), 'mp4');
      let miniatura = '';
      try {
        const th = await fetch(`${OPENAI}/videos/${encodeURIComponent(ext)}/content?variant=thumbnail`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) });
        if (th.ok) miniatura = guardarArchivo(txt(p.store_id), Buffer.from(await th.arrayBuffer()), (th.headers.get('content-type') || '').includes('png') ? 'png' : 'webp');
      } catch { /* sin miniatura */ }
      db.prepare("UPDATE estudio_piezas SET estado = 'listo', url = ?, miniatura = ?, progreso = 100, updated_at = datetime('now') WHERE id = ?").run(url, miniatura, txt(p.id));
      tocarProyecto(txt(p.proyecto_id));
    } catch (e) { console.warn('[estudio] revisar video', txt(p.id), (e as Error)?.message); }
  }
}

let corriendo = false;
export function iniciarEstudio(): void {
  setInterval(() => {
    if (corriendo) return;
    corriendo = true;
    void revisarVideos().catch((e) => console.warn('[estudio]', e)).finally(() => { corriendo = false; });
  }, 20_000).unref();
}

// ── Descarga en .zip (carpeta de entrega) ────────────────────────────────────
/** ZIP sin compresión (los MP4/PNG ya vienen comprimidos), con nombres en UTF-8. */
function zip(archivos: { nombre: string; datos: Buffer }[]): Buffer {
  const partes: Buffer[] = []; const central: Buffer[] = []; let pos = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, 'utf8');
    const crc = crc32(a.datos) >>> 0;
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(0, 8);
    loc.writeUInt32LE(0, 10); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(a.datos.length, 18); loc.writeUInt32LE(a.datos.length, 22);
    loc.writeUInt16LE(nombre.length, 26); loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(a.datos.length, 20); cen.writeUInt32LE(a.datos.length, 24);
    cen.writeUInt16LE(nombre.length, 28); cen.writeUInt32LE(pos, 42);
    partes.push(loc, nombre, a.datos); central.push(cen, nombre);
    pos += loc.length + nombre.length + a.datos.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, cd, fin]);
}

export function zipProyecto(storeId: string, id: string, soloAprobados: boolean): { nombre: string; datos: Buffer } | { error: string } {
  const p = obtenerProyecto(storeId, id);
  if (!p) return { error: 'Proyecto no encontrado.' };
  const piezas = p.piezas.filter((x) => x.url && (soloAprobados ? x.estado === 'aprobado' : ['listo', 'aprobado'].includes(x.estado)));
  if (!piezas.length) return { error: soloAprobados ? 'Todavía no has aprobado piezas.' : 'Todavía no hay piezas generadas.' };
  const raiz = (p.nombre || 'PRODUCTO').toUpperCase().replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'PRODUCTO';
  const archivos: { nombre: string; datos: Buffer }[] = [];
  let nv = 0, ni = 0;
  const textos: string[] = [];
  for (const x of piezas) {
    const ruta = mediaPath(storeId, x.url.split('/').pop()!);
    if (!existsSync(ruta)) continue;
    const nombre = x.tipo === 'video' ? `${++nv}VIDEO.mp4` : `${++ni}FOTO${path.extname(ruta) || '.png'}`;
    archivos.push({ nombre: `${raiz}/CAMPANAS/CAMPANA 1/${nombre}`, datos: readFileSync(ruta) });
    textos.push(`${nombre}${x.angulo ? ` · ${x.angulo}` : x.uso ? ` · ${x.uso}` : ''}\n  Titular: ${x.titular || '—'}\n  Texto: ${x.texto || '—'}\n`);
  }
  if (!archivos.length) return { error: 'Los archivos ya no están en el servidor.' };
  const c = p.copys as { textos?: string[]; titulares?: string[]; descripciones?: string[] };
  const extra = [
    c.textos?.length ? `\nTEXTOS PRINCIPALES EXTRA\n${c.textos.map((t) => `- ${t}`).join('\n')}` : '',
    c.titulares?.length ? `\nTITULARES EXTRA\n${c.titulares.map((t) => `- ${t}`).join('\n')}` : '',
    c.descripciones?.length ? `\nDESCRIPCIONES\n${c.descripciones.map((t) => `- ${t}`).join('\n')}` : '',
  ].join('\n');
  archivos.push({ nombre: `${raiz}/CAMPANAS/CAMPANA 1/TEXTOS DE ANUNCIOS.txt`, datos: Buffer.from(`${p.nombre}\nTextos sugeridos para cada pieza\n\n${textos.join('\n')}${extra}\n`, 'utf8') });
  const b = p.brief as Partial<BriefEstudio>;
  archivos.push({ nombre: `${raiz}/NOTAS IMPORTANTES.txt`, datos: Buffer.from([
    `Producto: ${b.producto || p.nombre}`, b.precio ? `Precio: $${Number(b.precio).toLocaleString('es-CO')} COP` : '', b.oferta ? `Oferta: ${b.oferta}` : '',
    b.variantes ? `Variantes: ${b.variantes}` : '', b.beneficios?.length ? `Beneficios:\n${b.beneficios.map((x) => `- ${x}`).join('\n')}` : '',
    '', 'Contenido generado con IA (DealFlow · Marketing IA). Revisa cada pieza antes de publicarla y, si Meta lo pide, márcala como contenido creado con IA.',
  ].filter((l) => l !== '').join('\n') + '\n', 'utf8') });
  return { nombre: `${raiz}.zip`, datos: zip(archivos) };
}

export function preciosPublicos() {
  return {
    paquete: PRECIOS_ESTUDIO.paquete,
    imagen: { medium: PRECIOS_ESTUDIO.imagenMedia, high: PRECIOS_ESTUDIO.imagenAlta },
    video: Object.fromEntries(MODELOS_VIDEO.map((m) => [m, Object.fromEntries(SEGUNDOS.map((s) => [s, costoPieza({ tipo: 'video', modelo: m, segundos: s })]))])),
    disponible: !!process.env.OPENAI_API_KEY,
  };
}
