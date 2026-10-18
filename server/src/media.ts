import path from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { db, uid } from './db.js';

/** Convierte un audio (webm, mp4…) a ogg/opus, el formato de nota de voz de WhatsApp. Devuelve null si no hay ffmpeg. */
export function audioAOgg(buffer: Buffer): Buffer | null {
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1'], {
      input: buffer,
      maxBuffer: 60 * 1024 * 1024,
    });
    if (r.status === 0 && r.stdout && r.stdout.length > 0) return r.stdout;
  } catch {
    /* sin ffmpeg */
  }
  return null;
}

const DATA_DIR = process.env.DATA_DIR || './data';

export function mediaDir(storeId: string) {
  const dir = path.resolve(DATA_DIR, 'media', storeId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function mediaPath(storeId: string, file: string) {
  return path.resolve(mediaDir(storeId), path.basename(file));
}

/** Extensión sugerida a partir del tipo/mime, para nombrar el archivo. */
export function mediaExt(tipo: string, mime: string): string {
  const fromMime = mime && mime.includes('/') ? mime.split('/')[1].split(';')[0] : '';
  if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime;
  return tipo === 'image' ? 'jpg' : tipo === 'video' ? 'mp4' : tipo === 'audio' ? 'ogg' : 'bin';
}

/** Tipo de mensaje (image/video/audio/document) a partir del mime. */
export function tipoDeMime(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Guarda un archivo saliente (data URL) en disco y devuelve su URL pública. */
export function saveOutgoingMedia(storeId: string, dataUrl: string, nombre: string): { url: string; buffer: Buffer; mime: string; tipo: string } | null {
  // El data URL puede traer parámetros (ej: data:audio/webm;codecs=opus;base64,…);
  // cortamos por ';base64,' para no romper con ese ';codecs=…' del medio.
  const idx = dataUrl.indexOf(';base64,');
  if (!dataUrl.startsWith('data:') || idx < 0) return null;
  const mime = dataUrl.slice(5, idx).split(';')[0].trim() || 'application/octet-stream';
  const buffer = Buffer.from(dataUrl.slice(idx + 8), 'base64');
  const tipo = tipoDeMime(mime);
  const file = uid() + '.' + mediaExt(tipo, mime);
  writeFileSync(path.join(mediaDir(storeId), file), buffer);
  return { url: '/api/media/' + storeId + '/' + file, buffer, mime, tipo };
}

/** Primera página de un PDF como PNG (pdftoppm). null si no hay poppler o falla. */
export function pdfAPng(pdf: Buffer): Buffer | null {
  // pdftoppm no lee de stdin en todas las versiones: usamos archivos temporales.
  const dir = mkdtempSync(path.join(tmpdir(), 'guia-'));
  try {
    const entrada = path.join(dir, 'in.pdf');
    writeFileSync(entrada, pdf);
    const r = spawnSync('pdftoppm', ['-png', '-r', '130', '-f', '1', '-l', '1', '-singlefile', entrada, path.join(dir, 'out')], { timeout: 30000 });
    if (r.status === 0) return readFileSync(path.join(dir, 'out.png'));
  } catch {
    /* sin poppler o PDF inválido */
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ }
  }
  return null;
}

/** Guarda un buffer en la carpeta de la tienda con un nombre dado; devuelve su URL. */
export function guardarArchivo(storeId: string, nombre: string, buffer: Buffer): string {
  const file = path.basename(nombre);
  writeFileSync(path.join(mediaDir(storeId), file), buffer);
  return '/api/media/' + storeId + '/' + file;
}

/** Registra un mensaje saliente con adjunto en la conversación. */
export function saveOutgoingMessage(leadId: string, texto: string, tipo: string, mediaUrl: string | null, mime: string | null, nombre: string | null): string {
  const id = uid();
  db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)').run(
    id, leadId, 'vendedor', texto, tipo, mediaUrl, mime, nombre,
  );
  return id;
}
