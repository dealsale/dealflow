/**
 * Biblioteca de Marketing IA: TODO lo que la tienda generó o subió, en un solo lugar.
 *   - Fotos IA (piezas del Estudio) y videos de «Video UGC» (también quedan como piezas del Estudio).
 *   - Lo que la tienda sube (fotos y videos propios): pieza del proyecto especial «Mis archivos».
 *   - Sus modelos y personajes (Video UGC) y las imágenes creadas dentro de las campañas.
 * Desde aquí se descargan, se borran y se eligen para las campañas de Meta.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db, uid } from './db.js';
import { mediaDir, mediaPath, mimeReal } from './media.js';
import { ffmpeg } from './proceso.js';
import './estudio.js'; // tablas estudio_proyectos / estudio_piezas
import './ugc.js'; // tabla ugc_actores

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const pj = <T>(s: unknown, d: T): T => { try { const v = JSON.parse(txt(s)); return (v ?? d) as T; } catch { return d; } };

export type OrigenMedio = 'fotos' | 'ugc' | 'subido' | 'modelo' | 'campana' | 'video';
export interface MedioBiblioteca { id: string; tipo: 'imagen' | 'video'; url: string; miniatura: string; nombre: string; origen: OrigenMedio; fecha: string; borrable: boolean }

export const MAX_FOTO = 15 * 1024 * 1024;
export const MAX_VIDEO = 95 * 1024 * 1024; // Cloudflare corta las subidas de más de 100 MB
const esVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)$/i.test(u.split('?')[0]);

/** Proyecto especial donde quedan los archivos que sube la tienda (no sale en «Fotos IA»). */
function proyectoMisArchivos(storeId: string): string {
  const p = db.prepare("SELECT id FROM estudio_proyectos WHERE store_id = ? AND nombre = 'Mis archivos' LIMIT 1").get(storeId) as { id: string } | undefined;
  if (p) return p.id;
  const id = uid();
  db.prepare('INSERT INTO estudio_proyectos (id, store_id, nombre, brief) VALUES (?,?,?,?)').run(id, storeId, 'Mis archivos', JSON.stringify({
    producto: 'Mis archivos', categoria: '', precio: 0, publico: '', variantes: '', oferta: '', beneficios: [], estilo: 'mixto', formato: '9:16', videos: 0, imagenes: 0, notas: 'Fotos y videos que subió la tienda.',
  }));
  return id;
}

export function listarBiblioteca(storeId: string): MedioBiblioteca[] {
  const out: MedioBiblioteca[] = [];
  const vistos = new Set<string>();
  const add = (m: MedioBiblioteca) => { if (!m.url || vistos.has(m.url)) return; vistos.add(m.url); out.push(m); };
  const piezas = db.prepare(`SELECT p.id, p.tipo, p.url, p.miniatura, p.titular, p.uso, p.angulo, p.modelo, p.updated_at, x.nombre proyecto
    FROM estudio_piezas p JOIN estudio_proyectos x ON x.id = p.proyecto_id
    WHERE p.store_id = ? AND p.url != '' AND p.estado IN ('listo','aprobado') ORDER BY p.updated_at DESC LIMIT 600`).all(storeId) as Fila[];
  for (const p of piezas) {
    const modelo = txt(p.modelo);
    const origen: OrigenMedio = modelo === 'propio' ? 'subido' : modelo === 'seedance' ? 'ugc' : p.tipo === 'video' ? 'video' : 'fotos';
    const nombre = origen === 'subido' ? txt(p.titular) || 'Archivo' : origen === 'ugc' ? txt(p.angulo) || 'Video UGC' : `${txt(p.proyecto)} · ${txt(p.uso || p.angulo) || (p.tipo === 'video' ? 'Video' : 'Foto')}`;
    add({ id: txt(p.id), tipo: p.tipo === 'video' ? 'video' : 'imagen', url: txt(p.url), miniatura: txt(p.miniatura), nombre: nombre.slice(0, 120), origen, fecha: txt(p.updated_at), borrable: true });
  }
  const actores = db.prepare('SELECT id, nombre, imagen, origen, created_at FROM ugc_actores WHERE store_id = ? ORDER BY created_at DESC').all(storeId) as Fila[];
  for (const a of actores) add({ id: `modelo:${txt(a.id)}`, tipo: 'imagen', url: txt(a.imagen), miniatura: '', nombre: `${txt(a.origen) === 'propio' ? 'Modelo' : 'Personaje IA'} · ${txt(a.nombre)}`, origen: 'modelo', fecha: txt(a.created_at), borrable: false });
  const campanas = db.prepare('SELECT nombre, creativos, updated_at FROM campanas WHERE store_id = ? ORDER BY updated_at DESC LIMIT 200').all(storeId) as Fila[];
  for (const c of campanas) {
    for (const u of pj<string[]>(c.creativos, [])) {
      if (typeof u !== 'string') continue;
      add({ id: `campana:${u}`, tipo: esVideoUrl(u) ? 'video' : 'imagen', url: u, miniatura: '', nombre: `Campaña · ${txt(c.nombre)}`.slice(0, 120), origen: 'campana', fecha: txt(c.updated_at), borrable: false });
    }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Portada JPG de un video (para verlo en la Biblioteca y como portada en Meta). */
async function portada(archivo: string): Promise<Buffer | null> {
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-bib-'));
    const out = path.join(dir, 'p.jpg');
    const r = await ffmpeg(['-ss', '0.5', '-i', archivo, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', out], 30_000);
    return r.status === 0 && existsSync(out) ? readFileSync(out) : null;
  } catch { return null; } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
}

/** La tienda sube una foto o un video propio (bytes crudos). Gratis. */
export async function subirMedio(storeId: string, buf: Buffer, nombreArchivo: string): Promise<{ medio: MedioBiblioteca } | { error: string }> {
  if (!Buffer.isBuffer(buf) || !buf.length) return { error: 'No llegó ningún archivo.' };
  const mime = mimeReal(buf);
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' } as Record<string, string>)[mime];
  if (!ext) return { error: 'Formato no soportado. Sube fotos JPG, PNG o WEBP, o videos MP4 o MOV.' };
  const tipo = mime.startsWith('video/') ? 'video' : 'imagen';
  if (tipo === 'imagen' && buf.length > MAX_FOTO) return { error: 'La foto pesa más de 15 MB.' };
  if (tipo === 'video' && buf.length > MAX_VIDEO) return { error: 'El video pesa más de 95 MB. Expórtalo más liviano (720p o 1080p) y vuelve a subirlo.' };
  const file = `bib-${uid()}.${ext}`;
  const ruta = path.join(mediaDir(storeId), file);
  writeFileSync(ruta, buf);
  const url = `/api/media/${storeId}/${file}`;
  let miniatura = '';
  if (tipo === 'video') {
    const p = await portada(ruta);
    if (p) { const f = `bib-${uid()}.jpg`; writeFileSync(path.join(mediaDir(storeId), f), p); miniatura = `/api/media/${storeId}/${f}`; }
  }
  let nombre = txt(nombreArchivo).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!nombre) nombre = tipo === 'video' ? 'Mi video' : 'Mi foto';
  const proyectoId = proyectoMisArchivos(storeId);
  const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM estudio_piezas WHERE proyecto_id = ? AND tipo = ?').get(proyectoId, tipo) as { n: number }).n;
  const id = uid();
  db.prepare(`INSERT INTO estudio_piezas (id, proyecto_id, store_id, tipo, orden, titular, uso, formato, modelo, estado, url, miniatura, progreso)
    VALUES (?,?,?,?,?,?, 'Subido por ti', '', 'propio', 'listo', ?, ?, 100)`).run(id, proyectoId, storeId, tipo, orden, nombre, url, miniatura);
  db.prepare("UPDATE estudio_proyectos SET updated_at = datetime('now') WHERE id = ?").run(proyectoId);
  return { medio: { id, tipo, url, miniatura, nombre, origen: 'subido', fecha: new Date().toISOString().replace('T', ' ').slice(0, 19), borrable: true } };
}

/** Lo subido se borra del todo; lo generado con IA se descarta (sale de la Biblioteca y del Estudio). */
export function borrarMedio(storeId: string, id: string): { ok: true } | { error: string } {
  const p = db.prepare('SELECT id, modelo, url, miniatura FROM estudio_piezas WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!p) return { error: 'Ese archivo ya no está.' };
  if (txt(p.modelo) === 'propio') {
    for (const u of [txt(p.url), txt(p.miniatura)]) {
      if (u.startsWith(`/api/media/${storeId}/`)) try { rmSync(mediaPath(storeId, u.split('/').pop()!), { force: true }); } catch { /* nada */ }
    }
    db.prepare('DELETE FROM estudio_piezas WHERE id = ?').run(id);
  } else {
    db.prepare("UPDATE estudio_piezas SET estado = 'descartado', updated_at = datetime('now') WHERE id = ?").run(id);
  }
  return { ok: true };
}

/** La pieza (Estudio) de un archivo de la tienda; si no existe (p. ej. un video viejo), se registra en «Mis archivos». */
export function piezaDeUrl(storeId: string, url: string): { id: string; proyectoId: string } | null {
  if (!esDeLaTienda(storeId, url)) return null;
  const p = db.prepare("SELECT id, proyecto_id FROM estudio_piezas WHERE store_id = ? AND url = ? AND estado != 'descartado' ORDER BY updated_at DESC LIMIT 1").get(storeId, url) as Fila | undefined;
  if (p) return { id: txt(p.id), proyectoId: txt(p.proyecto_id) };
  if (!existsSync(mediaPath(storeId, url.split('/').pop()!))) return null;
  const proyectoId = proyectoMisArchivos(storeId);
  const tipo = esVideoUrl(url) ? 'video' : 'imagen';
  const id = uid();
  db.prepare(`INSERT INTO estudio_piezas (id, proyecto_id, store_id, tipo, orden, titular, uso, formato, modelo, estado, url, progreso)
    VALUES (?,?,?,?,0,?, 'Subido por ti', '', 'propio', 'listo', ?, 100)`).run(id, proyectoId, storeId, tipo, tipo === 'video' ? 'Video de campaña' : 'Foto de campaña', url);
  return { id, proyectoId };
}

/** ¿Esta URL es un archivo de la tienda que está en su Biblioteca? (para no meter URLs ajenas a las campañas). */
export function esDeLaTienda(storeId: string, url: string): boolean {
  return url.startsWith(`/api/media/${storeId}/`) && !url.includes('..');
}
