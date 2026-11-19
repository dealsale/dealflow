/**
 * Video UGC con Seedance (Marketing IA) — «tipo Novoads».
 *
 * La tienda arma el video en 4 pasos: producto → personaje (y voz) → guion → generar. Por dentro:
 *   1. El guion se divide en 4 tomas (gancho, problema, producto en uso, cierre con oferta).
 *   2. Cada toma se genera con Seedance (BytePlus ModelArk) usando como referencia la foto del
 *      personaje y las fotos reales del producto, para que salgan iguales en todo el video.
 *      Con voz «la persona habla», Seedance genera también el audio (la persona dice su parte).
 *      Con «voz en off», el audio lo pone OpenAI (texto a voz) en el montaje.
 *   3. DealFlow monta el video con ffmpeg: une las tomas, pone subtítulos y el texto de la oferta.
 *   4. El video queda como pieza del Estudio (proyecto «Videos UGC») y se lanza a Meta desde ahí.
 * Todo se cobra en créditos al pedir; lo que falla se devuelve solo.
 *
 * Variables:
 *   SEEDANCE_API_KEY (o ARK_API_KEY) · SEEDANCE_BASE_URL (https://ark.ap-southeast.bytepluses.com/api/v3)
 *   SEEDANCE_MODEL (dreamina-seedance-2-0-260128) · SEEDANCE_MODEL_RAPIDO (dreamina-seedance-2-0-fast-260128)
 *   SEEDANCE_RESOLUTION (720p) · OPENAI_API_KEY · OPENAI_TTS_MODEL (gpt-4o-mini-tts)
 *   UGC_CRED_SEG (30) · UGC_CRED_SEG_RAPIDO (20) · UGC_CRED_ACTOR (100) · UGC_CRED_GUION (2)
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { db, uid } from './db.js';
import { abonar, cobrar, saldo } from './creditos.js';
import { chatJSON, SIN_OPENAI } from './marketing.js';
import { mediaDir, mediaPath } from './media.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const pj = <T>(s: unknown, d: T): T => { try { const v = JSON.parse(txt(s)); return (v ?? d) as T; } catch { return d; } };
const OPENAI = () => process.env.OPENAI_BASE || 'https://api.openai.com/v1';
const SEEDANCE = () => (process.env.SEEDANCE_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '');
const claveSeedance = () => process.env.SEEDANCE_API_KEY || process.env.ARK_API_KEY || '';
const modeloSeedance = (calidad: string) => (calidad === 'rapida'
  ? process.env.SEEDANCE_MODEL_RAPIDO || 'dreamina-seedance-2-0-fast-260128'
  : process.env.SEEDANCE_MODEL || 'dreamina-seedance-2-0-260128');
export const SIN_SEEDANCE = 'El video UGC todavía no está activo: falta la clave de Seedance (BytePlus) en el servidor.';
const FUENTE = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'].find((f) => existsSync(f)) || '';

// ── Precios en créditos (ajustables sin tocar código) ───────────────────────
const n = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.round(Number(v)) : d);
export const PRECIOS_UGC = {
  segundo: n(process.env.UGC_CRED_SEG, 30),
  segundoRapido: n(process.env.UGC_CRED_SEG_RAPIDO, 20),
  actor: n(process.env.UGC_CRED_ACTOR, 100),
  guion: n(process.env.UGC_CRED_GUION, 2),
};
const tarifa = (calidad: string) => (calidad === 'rapida' ? PRECIOS_UGC.segundoRapido : PRECIOS_UGC.segundo);

// ── Opciones ────────────────────────────────────────────────────────────────
export const VOCES = [
  { id: 'coral', nombre: 'Mujer cálida' }, { id: 'nova', nombre: 'Mujer energética' }, { id: 'shimmer', nombre: 'Mujer suave' },
  { id: 'ash', nombre: 'Hombre cercano' }, { id: 'echo', nombre: 'Hombre tranquilo' }, { id: 'onyx', nombre: 'Hombre grave' },
];
export const CAMARAS = ['selfie', 'primer plano', 'plano medio', 'detalle del producto'];
const ETIQUETAS = ['Gancho', 'Problema', 'Producto en uso', 'Cierre con oferta'];
const SEGUNDOS: Record<number, number[]> = { 15: [4, 4, 4, 4], 30: [7, 8, 8, 7] };
const TAMANO: Record<string, [number, number]> = { '9:16': [720, 1280], '1:1': [720, 720], '16:9': [1280, 720] };

export interface ConfigUgc {
  producto: { id: string; nombre: string; fotos: string[]; notas: string; precio: number };
  voz: { modo: 'persona' | 'locutor'; id: string };
  duracion: 15 | 30;
  tono: string; objetivo: string; oferta: string; cta: string;
  formato: '9:16' | '1:1' | '16:9';
  subtitulos: 'blanco' | 'caja' | 'no';
  textoFinal: string;
  calidad: 'alta' | 'rapida';
}
export interface ParteGuion { etiqueta: string; texto: string; escena: string; camara: string; segundos: number; habla: boolean }
interface Toma { estado: 'pendiente' | 'generando' | 'lista' | 'fallida'; task: string; url: string; error: string; creditos: number; devuelto: boolean; inicio: string }

db.exec(`CREATE TABLE IF NOT EXISTS ugc_actores (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '', genero TEXT NOT NULL DEFAULT '', edad TEXT NOT NULL DEFAULT '',
  estilo TEXT NOT NULL DEFAULT '', apariencia TEXT NOT NULL DEFAULT '', ambiente TEXT NOT NULL DEFAULT '', voz TEXT NOT NULL DEFAULT '',
  imagen TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ugc_videos (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}', guion TEXT NOT NULL DEFAULT '[]', tomas TEXT NOT NULL DEFAULT '[]',
  estado TEXT NOT NULL DEFAULT 'borrador',   -- borrador | generando | parcial | montando | listo | fallido
  video TEXT NOT NULL DEFAULT '', miniatura TEXT NOT NULL DEFAULT '', creditos INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '', pieza_id TEXT NOT NULL DEFAULT '', montajes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_ugc_videos_store ON ugc_videos(store_id, created_at)');

const CONFIG_BASE: ConfigUgc = {
  producto: { id: '', nombre: '', fotos: [], notas: '', precio: 0 }, voz: { modo: 'persona', id: 'coral' }, duracion: 30,
  tono: 'cercano', objetivo: 'vender', oferta: 'Pago contra entrega y envío gratis', cta: 'Escríbenos por WhatsApp',
  formato: '9:16', subtitulos: 'blanco', textoFinal: 'Paga al recibir · Envío gratis', calidad: 'alta',
};
const corto = (v: unknown, max: number) => txt(v).replace(/\s+/g, ' ').trim().slice(0, max);
function limpiarConfig(b: Fila, previo: ConfigUgc = CONFIG_BASE): ConfigUgc {
  const p = (b.producto && typeof b.producto === 'object' ? b.producto : {}) as Fila;
  const v = (b.voz && typeof b.voz === 'object' ? b.voz : {}) as Fila;
  const pick = <T extends string>(x: unknown, ops: readonly T[], d: T): T => (ops.includes(x as T) ? (x as T) : d);
  return {
    producto: {
      id: corto(p.id ?? previo.producto.id, 80), nombre: corto(p.nombre ?? previo.producto.nombre, 120),
      fotos: (Array.isArray(p.fotos) ? (p.fotos as unknown[]) : previo.producto.fotos).map(txt).filter((u) => /^(data:image\/|\/api\/media\/|https?:\/\/)/.test(u)).slice(0, 4),
      notas: corto(p.notas ?? previo.producto.notas, 600), precio: Math.max(0, Math.round(Number(p.precio ?? previo.producto.precio) || 0)),
    },
    voz: { modo: pick(v.modo ?? previo.voz.modo, ['persona', 'locutor'] as const, 'persona'), id: pick(v.id ?? previo.voz.id, VOCES.map((x) => x.id), 'coral') },
    duracion: Number(b.duracion ?? previo.duracion) === 15 ? 15 : 30,
    tono: corto(b.tono ?? previo.tono, 40) || 'cercano', objetivo: corto(b.objetivo ?? previo.objetivo, 60) || 'vender',
    oferta: corto(b.oferta ?? previo.oferta, 140), cta: corto(b.cta ?? previo.cta, 100),
    formato: pick(b.formato ?? previo.formato, ['9:16', '1:1', '16:9'] as const, '9:16'),
    subtitulos: pick(b.subtitulos ?? previo.subtitulos, ['blanco', 'caja', 'no'] as const, 'blanco'),
    textoFinal: corto(b.textoFinal ?? previo.textoFinal, 60),
    calidad: pick(b.calidad ?? previo.calidad, ['alta', 'rapida'] as const, 'alta'),
  };
}
function limpiarGuion(lista: unknown, duracion: number): ParteGuion[] {
  const segs = SEGUNDOS[duracion] || SEGUNDOS[30];
  const l = Array.isArray(lista) ? (lista as Fila[]) : [];
  return ETIQUETAS.map((etiqueta, i) => {
    const x = l[i] || {};
    const s = Math.round(Number(x.segundos) || segs[i]);
    return {
      etiqueta, texto: corto(x.texto, 260), escena: corto(x.escena, 400),
      camara: CAMARAS.includes(txt(x.camara)) ? txt(x.camara) : i === 2 ? 'detalle del producto' : 'selfie',
      segundos: Math.min(12, Math.max(4, s)), habla: x.habla === undefined ? i !== 2 : !!x.habla,
    };
  });
}
export const costoVideo = (guion: ParteGuion[], calidad: string) => guion.reduce((a, p) => a + p.segundos, 0) * tarifa(calidad);

function mapActor(a: Fila) { return { id: txt(a.id), nombre: txt(a.nombre), genero: txt(a.genero), edad: txt(a.edad), estilo: txt(a.estilo), apariencia: txt(a.apariencia), ambiente: txt(a.ambiente), voz: txt(a.voz), imagen: txt(a.imagen) }; }
function mapVideo(v: Fila) {
  const config = { ...CONFIG_BASE, ...pj<ConfigUgc>(v.config, CONFIG_BASE) };
  const guion = limpiarGuion(pj(v.guion, []), config.duracion);
  const tomas = pj<Toma[]>(v.tomas, []);
  return {
    id: txt(v.id), nombre: txt(v.nombre), actorId: txt(v.actor_id), config, guion, estado: txt(v.estado),
    tomas: tomas.map((t) => ({ estado: t.estado, url: t.url, error: t.error, creditos: t.creditos })),
    video: txt(v.video), miniatura: txt(v.miniatura), creditos: Number(v.creditos) || 0, error: txt(v.error), piezaId: txt(v.pieza_id),
    costo: costoVideo(guion, config.calidad), creado: txt(v.created_at), actualizado: txt(v.updated_at),
  };
}
export type VideoUgc = ReturnType<typeof mapVideo>;

export function estadoUgc(storeId: string) {
  return {
    activo: { seedance: !!claveSeedance(), openai: !!process.env.OPENAI_API_KEY, subtitulos: !!FUENTE },
    precios: PRECIOS_UGC, voces: VOCES, camaras: CAMARAS, saldo: saldo(storeId),
    actores: (db.prepare('SELECT * FROM ugc_actores WHERE store_id = ? ORDER BY created_at DESC').all(storeId) as Fila[]).map(mapActor),
    videos: (db.prepare('SELECT * FROM ugc_videos WHERE store_id = ? ORDER BY created_at DESC LIMIT 40').all(storeId) as Fila[]).map(mapVideo),
  };
}
export function obtenerVideo(storeId: string, id: string) {
  const v = db.prepare('SELECT * FROM ugc_videos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  return v ? mapVideo(v) : null;
}

// ── Archivos ─────────────────────────────────────────────────────────────────
function guardarArchivo(storeId: string, buf: Buffer, ext: string): string {
  const file = `ugc-${uid()}.${ext}`;
  writeFileSync(path.join(mediaDir(storeId), file), buf);
  return `/api/media/${storeId}/${file}`;
}
const rutaMedia = (storeId: string, url: string) => (url.startsWith(`/api/media/${storeId}/`) ? mediaPath(storeId, url.split('/').pop()!) : '');
async function bytesDe(storeId: string, src: string): Promise<Buffer | null> {
  const m = /^data:image\/[a-z+]+;base64,(.+)$/is.exec(src);
  if (m) return Buffer.from(m[1], 'base64');
  const r = rutaMedia(storeId, src);
  if (r) return existsSync(r) ? readFileSync(r) : null;
  if (/^https?:\/\//.test(src)) { try { const res = await fetch(src, { signal: AbortSignal.timeout(30_000) }); return res.ok ? Buffer.from(await res.arrayBuffer()) : null; } catch { return null; } }
  return null;
}
/** Imagen de referencia para Seedance: JPG de máx. 1024 px como data URL (las fotos de DealFlow no son públicas). */
async function referencia(storeId: string, src: string): Promise<string> {
  const buf = await bytesDe(storeId, src);
  if (!buf) return '';
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-ugc-ref-'));
    writeFileSync(path.join(dir, 'in'), buf);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(dir, 'in'), '-vf', "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease", '-frames:v', '1', '-q:v', '3', path.join(dir, 'out.jpg')], { timeout: 30_000 });
    const out = path.join(dir, 'out.jpg');
    return r.status === 0 && existsSync(out) ? `data:image/jpeg;base64,${readFileSync(out).toString('base64')}` : '';
  } catch { return ''; } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
}

// ── Personajes ───────────────────────────────────────────────────────────────
export async function crearActor(storeId: string, b: Fila): Promise<{ actor: ReturnType<typeof mapActor> } | { error: string; sinCreditos?: boolean }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: SIN_OPENAI };
  const d = {
    nombre: corto(b.nombre, 40) || 'Mi personaje', genero: corto(b.genero, 20) || 'mujer', edad: corto(b.edad, 20) || '25 a 35',
    estilo: corto(b.estilo, 80) || 'casual', apariencia: corto(b.apariencia, 240), ambiente: corto(b.ambiente, 120) || 'una sala de casa bien iluminada',
    voz: VOCES.some((v) => v.id === b.voz) ? txt(b.voz) : 'coral',
  };
  const costo = PRECIOS_UGC.actor;
  if (saldo(storeId) < costo || !cobrar(storeId, costo, `Video UGC: crear personaje ${d.nombre}`)) return { error: `Necesitas ${costo} créditos para crear un personaje.`, sinCreditos: true };
  const prompt = `Foto vertical tipo selfie, realista, tomada con celular, luz natural. Persona ficticia (no es una persona real ni famosa): ${d.genero} latinoamericano(a) de ${d.edad} años${d.apariencia ? `, ${d.apariencia}` : ''}, ropa ${d.estilo}, en ${d.ambiente}. Mira a cámara con una sonrisa natural, de la cintura para arriba, cara bien visible y nítida. Sin texto, sin logos, sin marcas, sin filtros exagerados.`;
  try {
    const res = await fetch(`${OPENAI()}/images/generations`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1536', quality: 'medium', n: 1 }), signal: AbortSignal.timeout(240_000),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    const b64 = body.data?.[0]?.b64_json;
    if (!res.ok || !b64) { abonar(storeId, costo, 'Devolución: personaje que no se pudo crear'); return { error: body.error?.message ? `OpenAI: ${body.error.message}` : 'No se pudo crear el personaje. Te devolvimos los créditos.' }; }
    const imagen = guardarArchivo(storeId, Buffer.from(b64, 'base64'), 'png');
    const id = uid();
    db.prepare('INSERT INTO ugc_actores (id, store_id, nombre, genero, edad, estilo, apariencia, ambiente, voz, imagen) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, storeId, d.nombre, d.genero, d.edad, d.estilo, d.apariencia, d.ambiente, d.voz, imagen);
    return { actor: mapActor(db.prepare('SELECT * FROM ugc_actores WHERE id = ?').get(id) as Fila) };
  } catch (e) {
    abonar(storeId, costo, 'Devolución: personaje que no se pudo crear');
    return { error: (e as Error)?.name === 'TimeoutError' ? 'OpenAI tardó demasiado. Te devolvimos los créditos.' : 'No pudimos hablar con OpenAI. Te devolvimos los créditos.' };
  }
}
export function borrarActor(storeId: string, id: string): void {
  db.prepare('DELETE FROM ugc_actores WHERE id = ? AND store_id = ?').run(id, storeId);
}

// ── Borrador del video ───────────────────────────────────────────────────────
export function guardarVideo(storeId: string, id: string | null, b: Fila): { video: VideoUgc } | { error: string } {
  const previo = id ? (db.prepare('SELECT * FROM ugc_videos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined) : undefined;
  if (id && !previo) return { error: 'Video no encontrado.' };
  if (previo && ['generando', 'montando'].includes(txt(previo.estado))) return { error: 'Este video se está generando: espera a que termine para cambiarlo.' };
  const config = limpiarConfig(b.config && typeof b.config === 'object' ? (b.config as Fila) : {}, previo ? { ...CONFIG_BASE, ...pj<ConfigUgc>(previo.config, CONFIG_BASE) } : CONFIG_BASE);
  const guion = b.guion !== undefined ? limpiarGuion(b.guion, config.duracion) : limpiarGuion(pj(previo?.guion, []), config.duracion);
  // Si cambió la duración, las tomas toman los segundos de la nueva duración.
  if (previo && pj<ConfigUgc>(previo.config, CONFIG_BASE).duracion !== config.duracion && b.guion === undefined) guion.forEach((p, i) => { p.segundos = (SEGUNDOS[config.duracion] || SEGUNDOS[30])[i]; });
  const actorId = b.actorId !== undefined ? txt(b.actorId) : txt(previo?.actor_id);
  const nombre = corto(b.nombre, 80) || txt(previo?.nombre) || (config.producto.nombre ? `UGC · ${config.producto.nombre}` : 'Video UGC');
  if (previo) {
    db.prepare("UPDATE ugc_videos SET nombre = ?, actor_id = ?, config = ?, guion = ?, updated_at = datetime('now') WHERE id = ?").run(nombre, actorId, JSON.stringify(config), JSON.stringify(guion), id);
    return { video: obtenerVideo(storeId, id!)! };
  }
  const nuevo = uid();
  db.prepare('INSERT INTO ugc_videos (id, store_id, nombre, actor_id, config, guion) VALUES (?,?,?,?,?,?)').run(nuevo, storeId, nombre, actorId, JSON.stringify(config), JSON.stringify(guion));
  return { video: obtenerVideo(storeId, nuevo)! };
}
export function borrarVideo(storeId: string, id: string): void {
  db.prepare("DELETE FROM ugc_videos WHERE id = ? AND store_id = ? AND estado NOT IN ('generando','montando')").run(id, storeId);
}

const POLITICAS = 'Habla como vocera de la marca, NUNCA como un cliente real que «lo compró y le funcionó» (Meta no permite testimonios falsos con personajes de IA). Nada de promesas médicas o de pérdida de peso garantizada, ni antes/después irreales, ni aludir a atributos personales de quien mira («¿Tienes barriga?»). Nada de precios falsos ni urgencia engañosa.';

/** La IA escribe (o reescribe una parte de) el guion: 4 partes con lo que se dice, la escena y el plano. */
export async function generarGuion(storeId: string, id: string, soloParte = -1): Promise<{ video: VideoUgc } | { error: string; sinCreditos?: boolean }> {
  const v = db.prepare('SELECT * FROM ugc_videos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!v) return { error: 'Video no encontrado.' };
  if (['generando', 'montando'].includes(txt(v.estado))) return { error: 'Este video se está generando.' };
  const config = { ...CONFIG_BASE, ...pj<ConfigUgc>(v.config, CONFIG_BASE) };
  if (!config.producto.nombre) return { error: 'Primero elige el producto.' };
  const actor = db.prepare('SELECT * FROM ugc_actores WHERE id = ? AND store_id = ?').get(txt(v.actor_id), storeId) as Fila | undefined;
  const costo = PRECIOS_UGC.guion;
  if (saldo(storeId) < costo || !cobrar(storeId, costo, `Video UGC: guion de ${config.producto.nombre.slice(0, 40)}`)) return { error: `Necesitas ${costo} créditos para el guion.`, sinCreditos: true };
  const segs = SEGUNDOS[config.duracion] || SEGUNDOS[30];
  const actual = limpiarGuion(pj(v.guion, []), config.duracion);
  const system = `Eres guionista de anuncios UGC (contenido estilo creador, grabado con celular) para tiendas online de Colombia. Escribes en español de Colombia, natural, como se habla. Devuelve SOLO JSON: {"partes":[{"texto":"","escena":"","camara":"","habla":true}]} con EXACTAMENTE 4 partes en este orden: ${ETIQUETAS.join(', ')}.
- "texto": lo que se dice en voz alta en esa toma. Corto: unas ${segs.map((s) => Math.round(s * 2.3)).join(', ')} palabras respectivamente (se dice en esos segundos: ${segs.join(', ')}).
- "escena": qué se ve, para un generador de video: acción de la persona, el producto, el lugar y la luz. Concreta y visual, 1 o 2 frases.
- "camara": una de ${CAMARAS.map((c) => `"${c}"`).join(', ')}.
- "habla": true si la persona habla a cámara en esa toma; en «${ETIQUETAS[2]}» normalmente false (se ve el producto en uso y la voz sigue de fondo).
- El cierre incluye la oferta y el llamado a la acción.
- ${POLITICAS}`;
  const user = `Producto: ${config.producto.nombre}${config.producto.precio ? ` · precio $${config.producto.precio.toLocaleString('es-CO')}` : ''}
Lo que lo hace especial (de la tienda): ${config.producto.notas || '—'}
Oferta: ${config.oferta || '—'} · Llamado a la acción: ${config.cta || '—'}
Tono: ${config.tono} · Objetivo del anuncio: ${config.objetivo} · Duración total: ${config.duracion} s
Quién presenta: ${actor ? `${txt(actor.nombre)}, ${txt(actor.genero)} de ${txt(actor.edad)}, estilo ${txt(actor.estilo)}, en ${txt(actor.ambiente)}` : 'una persona joven y cercana'}
${soloParte >= 0 ? `Reescribe SOLO la parte «${ETIQUETAS[soloParte]}» con otra idea; las demás déjalas igual:\n${JSON.stringify(actual.map((p) => ({ texto: p.texto, escena: p.escena, camara: p.camara, habla: p.habla })))}` : 'Escribe el guion completo.'}`;
  const r = await chatJSON<{ partes?: Fila[] }>(system, user, { maxTokens: 1200, temperatura: 0.9 });
  if (r.error || !Array.isArray(r.data?.partes) || r.data!.partes!.length < 4) { abonar(storeId, costo, 'Devolución: guion que no se pudo escribir'); return { error: r.error || 'La IA no devolvió el guion completo. Te devolvimos los créditos.' }; }
  const nuevas = limpiarGuion(r.data!.partes!.map((p, i) => ({ ...p, segundos: actual[i]?.segundos || segs[i] })), config.duracion);
  const guion = soloParte >= 0 ? actual.map((p, i) => (i === soloParte ? nuevas[i] : p)) : nuevas;
  db.prepare("UPDATE ugc_videos SET guion = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(guion), id);
  return { video: obtenerVideo(storeId, id)! };
}

// ── Generación con Seedance ──────────────────────────────────────────────────
function promptToma(p: ParteGuion, config: ConfigUgc, actor: Fila | undefined, conVoz: boolean): string {
  const ratio = config.formato;
  return [
    `Video ${ratio === '9:16' ? 'vertical' : ratio === '16:9' ? 'horizontal' : 'cuadrado'} estilo UGC, grabado con celular, luz natural, realista, movimiento de cámara en mano suave.`,
    actor ? `Personaje: la persona de la primera imagen de referencia (misma cara, pelo, piel y ropa), ${txt(actor.genero)} de ${txt(actor.edad)} años.` : 'Personaje: una persona joven latinoamericana, cercana.',
    `Producto: el de las demás imágenes de referencia (${config.producto.nombre}); respeta su forma, color y detalles exactos, no lo cambies.`,
    `Escena: ${p.escena || p.texto}. Plano: ${p.camara}.`,
    conVoz && p.habla ? `La persona mira a cámara y dice en español de Colombia, con naturalidad y buena dicción: "${p.texto}"` : 'La persona no habla en esta toma.',
    'Sin texto en pantalla, sin subtítulos, sin logos, sin marcas de agua.',
  ].join('\n');
}

const mensajeSeedance = (b: Fila, http: number): string => {
  const e = (b.error || {}) as Fila;
  const m = txt(e.message || b.message);
  if (http === 401 || http === 403) return 'BytePlus rechazó la clave de Seedance (revisa SEEDANCE_API_KEY y que el modelo esté activado en tu cuenta).';
  if (/sensitive|policy|moderat|risk/i.test(m + txt(e.code))) return 'Seedance rechazó la toma por sus políticas de contenido. Cambia la escena o las fotos y vuelve a intentar.';
  return m ? `Seedance: ${m.slice(0, 200)}` : `Seedance respondió ${http}.`;
};

async function lanzarToma(storeId: string, videoId: string, i: number): Promise<void> {
  const v = db.prepare('SELECT * FROM ugc_videos WHERE id = ?').get(videoId) as Fila | undefined;
  if (!v) return;
  const config = { ...CONFIG_BASE, ...pj<ConfigUgc>(v.config, CONFIG_BASE) };
  const guion = limpiarGuion(pj(v.guion, []), config.duracion);
  const tomas = pj<Toma[]>(v.tomas, []);
  const p = guion[i], t = tomas[i];
  if (!p || !t) return;
  const actor = db.prepare('SELECT * FROM ugc_actores WHERE id = ?').get(txt(v.actor_id)) as Fila | undefined;
  const conVoz = config.voz.modo === 'persona';
  const refs: string[] = [];
  if (actor && txt(actor.imagen)) { const r = await referencia(storeId, txt(actor.imagen)); if (r) refs.push(r); }
  for (const f of config.producto.fotos.slice(0, 3)) { const r = await referencia(storeId, f); if (r) refs.push(r); }
  const body = {
    model: modeloSeedance(config.calidad),
    content: [{ type: 'text', text: promptToma(p, config, actor, conVoz) }, ...refs.map((url) => ({ type: 'image_url', image_url: { url }, role: 'reference_image' }))],
    ratio: config.formato, duration: p.segundos, resolution: process.env.SEEDANCE_RESOLUTION || '720p',
    generate_audio: conVoz && p.habla, watermark: false,
  };
  const marcar = (cambios: Partial<Toma>) => {
    const fila = db.prepare('SELECT tomas FROM ugc_videos WHERE id = ?').get(videoId) as Fila | undefined;
    const ts = pj<Toma[]>(fila?.tomas, []);
    if (!ts[i]) return;
    ts[i] = { ...ts[i], ...cambios };
    db.prepare("UPDATE ugc_videos SET tomas = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(ts), videoId);
  };
  try {
    const res = await fetch(`${SEEDANCE()}/contents/generations/tasks`, {
      method: 'POST', headers: { Authorization: `Bearer ${claveSeedance()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
    const r = (await res.json().catch(() => ({}))) as Fila;
    if (!res.ok || !txt(r.id)) { fallaToma(storeId, videoId, i, mensajeSeedance(r, res.status)); return; }
    marcar({ estado: 'generando', task: txt(r.id), error: '', inicio: new Date().toISOString() });
  } catch (e) {
    fallaToma(storeId, videoId, i, (e as Error)?.name === 'TimeoutError' ? 'Seedance tardó demasiado en responder.' : 'No pudimos hablar con Seedance.');
  }
}

/** Toma fallida: se marca y se devuelven sus créditos (una sola vez). */
function fallaToma(storeId: string, videoId: string, i: number, error: string): void {
  const v = db.prepare('SELECT tomas FROM ugc_videos WHERE id = ?').get(videoId) as Fila | undefined;
  const ts = pj<Toma[]>(v?.tomas, []);
  const t = ts[i];
  if (!t) return;
  if (!t.devuelto && t.creditos > 0) abonar(storeId, t.creditos, `Devolución: toma ${i + 1} del video UGC que no se pudo generar`, videoId);
  ts[i] = { ...t, estado: 'fallida', error: error.slice(0, 300), devuelto: true };
  db.prepare("UPDATE ugc_videos SET tomas = ?, creditos = MAX(0, creditos - ?), updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(ts), t.devuelto ? 0 : t.creditos, videoId);
}

/** Cobra y manda a generar las 4 tomas. */
export async function generarVideo(storeId: string, id: string): Promise<{ video: VideoUgc } | { error: string; sinCreditos?: boolean }> {
  const v = db.prepare('SELECT * FROM ugc_videos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!v) return { error: 'Video no encontrado.' };
  if (['generando', 'montando'].includes(txt(v.estado))) return { error: 'Este video ya se está generando.' };
  if (!claveSeedance()) return { error: SIN_SEEDANCE };
  const config = { ...CONFIG_BASE, ...pj<ConfigUgc>(v.config, CONFIG_BASE) };
  const guion = limpiarGuion(pj(v.guion, []), config.duracion);
  if (!config.producto.nombre || !config.producto.fotos.length) return { error: 'Elige el producto y al menos una foto.' };
  const actor = db.prepare('SELECT * FROM ugc_actores WHERE id = ? AND store_id = ?').get(txt(v.actor_id), storeId) as Fila | undefined;
  if (!actor) return { error: 'Elige quién presenta el video (o crea un personaje).' };
  if (guion.some((p) => !p.texto && !p.escena)) return { error: 'Completa el guion: cada toma necesita lo que se dice o la escena.' };
  if (config.voz.modo === 'locutor' && !process.env.OPENAI_API_KEY) return { error: SIN_OPENAI };
  const costo = costoVideo(guion, config.calidad);
  if (saldo(storeId) < costo || !cobrar(storeId, costo, `Video UGC ${config.duracion}s: ${config.producto.nombre.slice(0, 40)}`)) return { error: `Necesitas ${costo} créditos para este video. Recarga para seguir.`, sinCreditos: true };
  const t = tarifa(config.calidad);
  const ahora = new Date().toISOString();
  const tomas: Toma[] = guion.map((p) => ({ estado: 'pendiente', task: '', url: '', error: '', creditos: p.segundos * t, devuelto: false, inicio: ahora }));
  db.prepare("UPDATE ugc_videos SET tomas = ?, estado = 'generando', creditos = creditos + ?, error = '', video = '', miniatura = '', montajes = 0, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(tomas), costo, id);
  for (let i = 0; i < tomas.length; i++) await lanzarToma(storeId, id, i);
  return { video: obtenerVideo(storeId, id)! };
}

/** Rehace una sola toma (opcionalmente con otro texto o escena); cobra solo esa. */
export async function rehacerToma(storeId: string, id: string, i: number, b: Fila): Promise<{ video: VideoUgc } | { error: string; sinCreditos?: boolean }> {
  const v = db.prepare('SELECT * FROM ugc_videos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!v) return { error: 'Video no encontrado.' };
  if (['generando', 'montando'].includes(txt(v.estado))) return { error: 'Espera a que termine lo que se está generando.' };
  if (!claveSeedance()) return { error: SIN_SEEDANCE };
  const config = { ...CONFIG_BASE, ...pj<ConfigUgc>(v.config, CONFIG_BASE) };
  const guion = limpiarGuion(pj(v.guion, []), config.duracion);
  const tomas = pj<Toma[]>(v.tomas, []);
  if (!guion[i] || !tomas[i]) return { error: 'Esa toma no existe.' };
  if (b.texto !== undefined) guion[i].texto = corto(b.texto, 260);
  if (b.escena !== undefined) guion[i].escena = corto(b.escena, 400);
  if (CAMARAS.includes(txt(b.camara))) guion[i].camara = txt(b.camara);
  const costo = guion[i].segundos * tarifa(config.calidad);
  if (saldo(storeId) < costo || !cobrar(storeId, costo, `Video UGC: rehacer toma ${i + 1} (${guion[i].etiqueta})`)) return { error: `Necesitas ${costo} créditos para rehacer esta toma.`, sinCreditos: true };
  tomas[i] = { estado: 'pendiente', task: '', url: '', error: '', creditos: costo, devuelto: false, inicio: new Date().toISOString() };
  db.prepare("UPDATE ugc_videos SET guion = ?, tomas = ?, estado = 'generando', creditos = creditos + ?, error = '', updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(guion), JSON.stringify(tomas), costo, id);
  await lanzarToma(storeId, id, i);
  return { video: obtenerVideo(storeId, id)! };
}

/** Revisa las tomas en curso; cuando están todas, monta el video. */
export async function revisarUgc(): Promise<void> {
  const videos = db.prepare("SELECT * FROM ugc_videos WHERE estado IN ('generando','montando') ORDER BY updated_at LIMIT 20").all() as Fila[];
  for (const v of videos) {
    const id = txt(v.id), storeId = txt(v.store_id);
    if (txt(v.estado) === 'montando') { await montar(storeId, id).catch((e) => console.warn('[ugc] montaje', id, e)); continue; }
    const tomas = pj<Toma[]>(v.tomas, []);
    for (let i = 0; i < tomas.length; i++) {
      const t = tomas[i];
      if (t.estado === 'pendiente' && !t.task) {
        // Quedó sin trabajo (p. ej. reinicio del servidor a la mitad): se vuelve a pedir (no si se acaba de pedir).
        if (!t.inicio || Date.now() - Date.parse(t.inicio) > 3 * 60_000) { await lanzarToma(storeId, id, i); }
        continue;
      }
      if (t.estado !== 'generando' || !t.task) continue;
      try {
        const res = await fetch(`${SEEDANCE()}/contents/generations/tasks/${encodeURIComponent(t.task)}`, { headers: { Authorization: `Bearer ${claveSeedance()}` }, signal: AbortSignal.timeout(30_000) });
        const r = (await res.json().catch(() => ({}))) as Fila;
        if (!res.ok) { if (res.status === 404) fallaToma(storeId, id, i, 'Seedance ya no tiene esta toma.'); continue; }
        const estado = txt(r.status);
        if (/failed|cancel|expired/i.test(estado)) { fallaToma(storeId, id, i, mensajeSeedance(r, 200)); continue; }
        if (estado !== 'succeeded') {
          if (t.inicio && Date.now() - Date.parse(t.inicio) > 30 * 60_000) fallaToma(storeId, id, i, 'La toma tardó demasiado en Seedance. Se devolvieron sus créditos.');
          continue;
        }
        const urlVideo = txt(((r.content || {}) as Fila).video_url);
        if (!urlVideo) { fallaToma(storeId, id, i, 'Seedance terminó la toma sin video.'); continue; }
        const mp4 = await fetch(urlVideo, { signal: AbortSignal.timeout(180_000) });
        if (!mp4.ok) continue; // se reintenta en la próxima vuelta (la URL de Seedance dura horas)
        const url = guardarArchivo(storeId, Buffer.from(await mp4.arrayBuffer()), 'mp4');
        const fila = db.prepare('SELECT tomas FROM ugc_videos WHERE id = ?').get(id) as Fila;
        const ts = pj<Toma[]>(fila.tomas, []);
        ts[i] = { ...ts[i], estado: 'lista', url, error: '' };
        db.prepare("UPDATE ugc_videos SET tomas = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(ts), id);
      } catch (e) { console.warn('[ugc] revisar toma', id, i, (e as Error)?.message); }
    }
    const ahora = pj<Toma[]>((db.prepare('SELECT tomas FROM ugc_videos WHERE id = ?').get(id) as Fila).tomas, []);
    if (ahora.some((t) => t.estado === 'generando' || t.estado === 'pendiente')) continue;
    if (ahora.every((t) => t.estado === 'lista')) {
      db.prepare("UPDATE ugc_videos SET estado = 'montando', updated_at = datetime('now') WHERE id = ?").run(id);
      await montar(storeId, id).catch((e) => console.warn('[ugc] montaje', id, e));
    } else {
      // Alguna toma falló: el video espera a que la tienda la rehaga (sus créditos ya volvieron).
      db.prepare("UPDATE ugc_videos SET estado = 'parcial', error = ?, updated_at = datetime('now') WHERE id = ?").run('Una o más tomas no se pudieron generar (sus créditos se devolvieron). Rehazlas para terminar el video.', id);
    }
  }
}

// ── Voz en off (OpenAI) y montaje (ffmpeg) ───────────────────────────────────
async function voz(texto: string, vozId: string): Promise<Buffer | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !texto.trim()) return null;
  try {
    const res = await fetch(`${OPENAI()}/audio/speech`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: vozId, input: texto, response_format: 'mp3', instructions: 'Habla en español de Colombia, natural, cercano y con energía, como un creador de contenido en redes.' }),
      signal: AbortSignal.timeout(60_000),
    });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch { return null; }
}
const ff = (args: string[], timeout = 180_000) => spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout, encoding: 'utf8' });
function duracionDe(archivo: string): number {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo], { timeout: 20_000, encoding: 'utf8' });
  return Number(txt(r.stdout).trim()) || 0;
}
function tieneAudio(archivo: string): boolean {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', archivo], { timeout: 20_000, encoding: 'utf8' });
  return txt(r.stdout).trim().length > 0;
}
/** Parte el texto en líneas cortas para los subtítulos (máx. 3). */
function lineas(texto: string, max: number): string[] {
  const out: string[] = [];
  let l = '';
  for (const w of texto.split(/\s+/).filter(Boolean)) {
    if ((l + ' ' + w).trim().length > max && l) { out.push(l); l = w; } else l = (l + ' ' + w).trim();
  }
  if (l) out.push(l);
  if (out.length > 3) return [...out.slice(0, 2), out.slice(2).join(' ')].map((x) => (x.length > max + 8 ? x.slice(0, max + 6) + '…' : x));
  return out;
}

/** Une las tomas: subtítulos, voz en off (si aplica), texto de la oferta al final; guarda el MP4 y lo deja en el Estudio. */
export async function montar(storeId: string, id: string): Promise<void> {
  const v = db.prepare('SELECT * FROM ugc_videos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!v) return;
  const config = { ...CONFIG_BASE, ...pj<ConfigUgc>(v.config, CONFIG_BASE) };
  const guion = limpiarGuion(pj(v.guion, []), config.duracion);
  const tomas = pj<Toma[]>(v.tomas, []);
  const [W, H] = TAMANO[config.formato] || TAMANO['9:16'];
  // Letra de ~6 % del ancho y líneas que ocupan máx. ~85 % (la negrita de DejaVu mide ~0,64 del tamaño por letra).
  const fs = Math.round(W * 0.062), maxCar = Math.max(12, Math.floor((W * 0.85) / (fs * 0.64)));
  let dir = '';
  const fallar = (m: string) => {
    const intentos = Number(v.montajes) + 1;
    db.prepare("UPDATE ugc_videos SET estado = ?, error = ?, montajes = ?, updated_at = datetime('now') WHERE id = ?").run(intentos >= 3 ? 'fallido' : 'montando', m.slice(0, 300), intentos, id);
  };
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-ugc-'));
    const segmentos: string[] = [];
    for (let i = 0; i < guion.length; i++) {
      const p = guion[i];
      const src = rutaMedia(storeId, tomas[i]?.url || '');
      if (!src || !existsSync(src)) return fallar(`Falta el video de la toma ${i + 1}.`);
      const dClip = duracionDe(src) || p.segundos;
      let vozArch = '';
      if (config.voz.modo === 'locutor' && p.texto) {
        const b = await voz(p.texto, config.voz.id);
        if (b) { vozArch = path.join(dir, `voz${i}.mp3`); writeFileSync(vozArch, b); }
      }
      const dVoz = vozArch ? duracionDe(vozArch) : 0;
      const D = Math.max(dClip, dVoz ? dVoz + 0.4 : 0);
      // Video: llenar el formato, 30 fps, congelar el último cuadro si la voz dura más; subtítulos y oferta.
      const filtros = [`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1${D > dClip + 0.05 ? `,tpad=stop_mode=clone:stop_duration=${(D - dClip + 0.1).toFixed(2)}` : ''}`];
      if (FUENTE && config.subtitulos !== 'no' && p.texto) {
        const ls = lineas(p.texto, maxCar);
        ls.forEach((l, k) => {
          const f = path.join(dir, `s${i}_${k}.txt`); writeFileSync(f, l);
          const y = `h*0.64+${k}*${Math.round(fs * 1.25)}`;
          filtros.push(config.subtitulos === 'caja'
            ? `drawtext=fontfile=${FUENTE}:textfile=${f}:fontsize=${fs}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=14:x=(w-text_w)/2:y=${y}`
            : `drawtext=fontfile=${FUENTE}:textfile=${f}:fontsize=${fs}:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=${y}`);
        });
      }
      if (FUENTE && i === guion.length - 1 && config.textoFinal) {
        const f = path.join(dir, 'oferta.txt'); writeFileSync(f, config.textoFinal);
        filtros.push(`drawtext=fontfile=${FUENTE}:textfile=${f}:fontsize=${Math.round(fs * 0.85)}:fontcolor=black:box=1:boxcolor=0xFDE047:boxborderw=16:x=(w-text_w)/2:y=h*0.88`);
      }
      const args = ['-i', src];
      const clipAudio = tieneAudio(src);
      if (vozArch) args.push('-i', vozArch);
      let audio = '';
      if (vozArch && clipAudio) audio = `[0:a]volume=0.15,aresample=44100,apad[b];[1:a]aresample=44100,adelay=200|200,apad[v];[b][v]amix=inputs=2:duration=longest:normalize=0[a]`;
      else if (vozArch) audio = `[1:a]aresample=44100,adelay=200|200,apad[a]`;
      else if (clipAudio) audio = `[0:a]aresample=44100,apad[a]`;
      else { args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'); audio = `[${vozArch ? 2 : 1}:a]anull[a]`; }
      const seg = path.join(dir, `seg${i}.mp4`);
      const r = ff([...args, '-filter_complex', `[0:v]${filtros.join(',')}[vv];${audio}`, '-map', '[vv]', '-map', '[a]', '-t', D.toFixed(2),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', seg]);
      if (r.status !== 0 || !existsSync(seg)) return fallar(`No se pudo armar la toma ${i + 1}: ${txt(r.stderr).slice(-200)}`);
      segmentos.push(seg);
    }
    const lista = path.join(dir, 'lista.txt');
    writeFileSync(lista, segmentos.map((s) => `file '${s}'`).join('\n'));
    const final = path.join(dir, 'final.mp4');
    const r = ff(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', final]);
    if (r.status !== 0 || !existsSync(final)) return fallar(`No se pudo unir el video: ${txt(r.stderr).slice(-200)}`);
    const thumb = path.join(dir, 'thumb.jpg');
    ff(['-ss', '1', '-i', final, '-frames:v', '1', '-vf', 'scale=360:-2', thumb], 30_000);
    const video = guardarArchivo(storeId, readFileSync(final), 'mp4');
    const miniatura = existsSync(thumb) ? guardarArchivo(storeId, readFileSync(thumb), 'jpg') : '';
    const piezaId = alEstudio(storeId, v, config, guion, video, miniatura, Math.round(duracionDe(final)));
    db.prepare("UPDATE ugc_videos SET estado = 'listo', video = ?, miniatura = ?, pieza_id = ?, error = '', updated_at = datetime('now') WHERE id = ?").run(video, miniatura, piezaId, id);
  } catch (e) {
    fallar(`Error al montar: ${(e as Error)?.message || e}`);
  } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
}

/** El video terminado queda como pieza del Estudio (proyecto «Videos UGC»): desde ahí se lanza a Meta. */
function alEstudio(storeId: string, v: Fila, config: ConfigUgc, guion: ParteGuion[], url: string, miniatura: string, segundos: number): string {
  try {
    let proy = db.prepare("SELECT id FROM estudio_proyectos WHERE store_id = ? AND nombre = 'Videos UGC' LIMIT 1").get(storeId) as { id: string } | undefined;
    if (!proy) {
      const pid = uid();
      db.prepare('INSERT INTO estudio_proyectos (id, store_id, nombre, brief) VALUES (?,?,?,?)').run(pid, storeId, 'Videos UGC', JSON.stringify({ producto: 'Videos UGC', categoria: '', precio: 0, publico: '', variantes: '', oferta: config.oferta, beneficios: [], estilo: 'ugc', formato: config.formato, videos: 0, imagenes: 0, notas: 'Videos hechos en Video UGC (Seedance).' }));
      proy = { id: pid };
    }
    const texto = guion.map((p) => p.texto).filter(Boolean).join(' ');
    const ya = txt(v.pieza_id) && db.prepare('SELECT id FROM estudio_piezas WHERE id = ?').get(txt(v.pieza_id));
    if (ya) {
      db.prepare("UPDATE estudio_piezas SET url = ?, miniatura = ?, texto = ?, hook = ?, segundos = ?, estado = 'listo', updated_at = datetime('now') WHERE id = ?").run(url, miniatura, texto, guion[0]?.texto || '', segundos, txt(v.pieza_id));
      return txt(v.pieza_id);
    }
    const id = uid();
    db.prepare(`INSERT INTO estudio_piezas (id, proyecto_id, store_id, tipo, orden, angulo, hook, prompt, texto, titular, uso, formato, modelo, segundos, calidad, estado, url, miniatura, progreso)
      VALUES (?,?,?,'video',0,?,?,?,?,?,?,?,?,?,?,'listo',?,?,100)`)
      .run(id, proy.id, storeId, `UGC · ${config.producto.nombre}`.slice(0, 120), guion[0]?.texto || '', 'Video UGC (Seedance)', texto, config.producto.nombre, 'Reels e historias', config.formato, 'seedance', segundos, config.calidad, url, miniatura);
    return id;
  } catch (e) { console.warn('[ugc] al Estudio', e); return ''; }
}

/** Vuelve a intentar el montaje (gratis: las tomas ya están pagadas). */
export async function reintentarMontaje(storeId: string, id: string): Promise<{ video: VideoUgc } | { error: string }> {
  const v = db.prepare('SELECT * FROM ugc_videos WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!v) return { error: 'Video no encontrado.' };
  if (!pj<Toma[]>(v.tomas, []).every((t) => t.estado === 'lista')) return { error: 'Faltan tomas por generar.' };
  db.prepare("UPDATE ugc_videos SET estado = 'montando', montajes = 0, error = '', updated_at = datetime('now') WHERE id = ?").run(id);
  await montar(storeId, id);
  return { video: obtenerVideo(storeId, id)! };
}

let iniciado = false;
let corriendo = false;
export function iniciarUgc(): void {
  if (iniciado) return;
  iniciado = true;
  setInterval(() => {
    if (corriendo) return;
    corriendo = true;
    revisarUgc().catch((e) => console.warn('[ugc]', e)).finally(() => { corriendo = false; });
  }, 20_000).unref?.();
}
