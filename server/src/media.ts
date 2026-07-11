import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { db, uid } from './db.js';

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
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const buffer = Buffer.from(m[2], 'base64');
  const tipo = tipoDeMime(mime);
  const file = uid() + '.' + mediaExt(tipo, mime);
  writeFileSync(path.join(mediaDir(storeId), file), buffer);
  return { url: '/api/media/' + storeId + '/' + file, buffer, mime, tipo };
}

/** Registra un mensaje saliente con adjunto en la conversación. */
export function saveOutgoingMessage(leadId: string, texto: string, tipo: string, mediaUrl: string | null, mime: string | null, nombre: string | null) {
  db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre) VALUES (?,?,?,?,?,?,?,?)').run(
    uid(), leadId, 'vendedor', texto, tipo, mediaUrl, mime, nombre,
  );
}
