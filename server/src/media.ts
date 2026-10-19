import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Primera página de un PDF como PNG (pdftoppm), lista para WhatsApp:
 *  - se recorta el margen blanco (muchas guías vienen en una hoja carta con la
 *    etiqueta chiquita en una esquina);
 *  - `enderezar`: si la etiqueta viene acostada (más ancha que alta, como las de
 *    Interrapidísimo), se gira 90° a la izquierda para que quede derecha.
 * null si no hay poppler o falla.
 */
export function pdfAPng(pdf: Buffer, opts: { enderezar?: boolean } = {}): Buffer | null {
  // pdftoppm no lee de stdin en todas las versiones: usamos archivos temporales.
  const dir = mkdtempSync(path.join(tmpdir(), 'guia-'));
  try {
    const entrada = path.join(dir, 'in.pdf');
    writeFileSync(entrada, pdf);
    // PPM (crudo) para poder recortar y girar sin librerías de imágenes.
    const r = spawnSync('pdftoppm', ['-r', '200', '-f', '1', '-l', '1', '-singlefile', entrada, path.join(dir, 'out')], { timeout: 30000 });
    if (r.status === 0) {
      const img = leerPpm(readFileSync(path.join(dir, 'out.ppm')));
      if (img) {
        let res = recortarBlanco(img);
        if (opts.enderezar && res.w > res.h * 1.15) res = girarIzquierda(res);
        return pngDe(res);
      }
    }
  } catch {
    /* sin poppler o PDF inválido */
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ }
  }
  return null;
}

interface Rgb { w: number; h: number; px: Buffer } // 3 bytes por pixel

function leerPpm(b: Buffer): Rgb | null {
  // Cabecera "P6 <ancho> <alto> 255" + un espacio, luego los pixeles RGB.
  const campos: string[] = []; let i = 0;
  while (campos.length < 4 && i < 200) {
    while (/\s/.test(String.fromCharCode(b[i]))) i++;
    if (b[i] === 35) { while (b[i] !== 10) i++; continue; } // comentario
    let t = ''; while (!/\s/.test(String.fromCharCode(b[i]))) t += String.fromCharCode(b[i++]);
    campos.push(t);
  }
  if (campos[0] !== 'P6' || Number(campos[3]) !== 255) return null;
  const w = Number(campos[1]); const h = Number(campos[2]);
  return { w, h, px: b.subarray(i + 1, i + 1 + w * h * 3) };
}

/** Quita el margen blanco alrededor del contenido (con un borde de aire). */
function recortarBlanco(im: Rgb): Rgb {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) {
    const fila = y * im.w * 3;
    for (let x = 0; x < im.w; x++) {
      const k = fila + x * 3;
      if (im.px[k] < 225 || im.px[k + 1] < 225 || im.px[k + 2] < 225) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return im; // página en blanco
  const m = 24;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(im.w - 1, x1 + m); y1 = Math.min(im.h - 1, y1 + m);
  const w = x1 - x0 + 1; const h = y1 - y0 + 1;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) im.px.copy(px, y * w * 3, ((y0 + y) * im.w + x0) * 3, ((y0 + y) * im.w + x0 + w) * 3);
  return { w, h, px };
}

/** Gira 90° en contra de las manecillas del reloj. */
function girarIzquierda(im: Rgb): Rgb {
  const w = im.h; const h = im.w;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      // (x, y) → (y, ancho - 1 - x)
      const de = (y * im.w + x) * 3; const a = ((im.w - 1 - x) * w + y) * 3;
      px[a] = im.px[de]; px[a + 1] = im.px[de + 1]; px[a + 2] = im.px[de + 2];
    }
  }
  return { w, h, px };
}

/** Codifica RGB a PNG (zlib de Node, sin dependencias). */
function pngDe(im: Rgb): Buffer {
  const crcTabla = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf: Buffer) => { let c = -1; for (const v of buf) c = crcTabla[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const bloque = (tipo: string, datos: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(im.w, 0); ihdr.writeUInt32BE(im.h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const crudo = Buffer.alloc((im.w * 3 + 1) * im.h);
  for (let y = 0; y < im.h; y++) { crudo[y * (im.w * 3 + 1)] = 0; im.px.copy(crudo, y * (im.w * 3 + 1) + 1, y * im.w * 3, (y + 1) * im.w * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), bloque('IDAT', deflateSync(crudo, { level: 6 })), bloque('IEND', Buffer.alloc(0))]);
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

/**
 * Una sola vez: vuelve a convertir las guías en PDF que ya estaban guardadas como
 * imagen (antes salían chiquitas en una hoja grande y las de Interrapidísimo,
 * de lado). Corre en segundo plano al arrancar.
 */
export async function reconvertirGuias(): Promise<void> {
  const flag = 'guias_png_v2';
  if (db.prepare('SELECT 1 FROM app_flags WHERE clave = ?').get(flag)) return;
  db.prepare('INSERT INTO app_flags (clave) VALUES (?)').run(flag);
  const filas = db.prepare("SELECT id, store_id, numero, guia_url, transportadora FROM orders WHERE guia_url LIKE '%.pdf%' AND created_at > datetime('now','-60 days')").all() as { id: string; store_id: string; numero: number; guia_url: string; transportadora: string }[];
  let n = 0;
  for (const f of filas) {
    try {
      let pdf: Buffer | null = null;
      if (f.guia_url.startsWith('/api/media/')) {
        const ruta = mediaPath(f.store_id, f.guia_url.split('/').pop()!);
        if (existsSync(ruta)) pdf = readFileSync(ruta);
      } else if (/^https?:\/\//.test(f.guia_url)) {
        const r = await fetch(f.guia_url, { signal: AbortSignal.timeout(20000) });
        if (r.ok) pdf = Buffer.from(await r.arrayBuffer());
      }
      if (!pdf) continue;
      const enderezar = /inter\s*rap/i.test(String(f.transportadora || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const png = pdfAPng(pdf, { enderezar });
      if (!png) continue;
      const url = guardarArchivo(f.store_id, `guia-DF${f.numero}-${uid().slice(0, 6)}.png`, png);
      db.prepare('UPDATE orders SET guia_img = ? WHERE id = ?').run(url, f.id);
      n++;
    } catch { /* sigue con la próxima */ }
  }
  if (n) console.log(`[guías] ${n} imagen(es) de guía reconvertidas (recortadas/enderezadas)`);
}
