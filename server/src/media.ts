import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { db, uid } from './db.js';

/**
 * Convierte un audio (webm, mp4/m4a de Safari/iPhone, mp3…) a ogg/opus mono, el formato de nota
 * de voz de WhatsApp. Usa archivos temporales (no pipes): el mp4 de Safari trae el índice al
 * final y ffmpeg no siempre lo puede leer desde un pipe. Devuelve null si no hay ffmpeg o falla.
 */
export function audioAOgg(buffer: Buffer): Buffer | null {
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-audio-'));
    const entrada = path.join(dir, 'in');
    const salida = path.join(dir, 'out.ogg');
    writeFileSync(entrada, buffer);
    const r = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', entrada,
      // Igual que una nota de voz nativa de WhatsApp: el celular es mucho más estricto que el PC
      // ("Este audio no está disponible porque algo falló con el archivo de audio").
      '-vn', '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
      '-avoid_negative_ts', 'make_zero', '-ac', '1', '-ar', '16000',
      '-c:a', 'libopus', '-b:a', '24k', '-vbr', 'on', '-application', 'voip', '-frame_duration', '20',
      '-f', 'ogg', salida,
    ], { timeout: 60_000 });
    if (r.status === 0 && existsSync(salida)) {
      const out = readFileSync(salida);
      if (out.length > 0) return out;
    }
    console.error('[media] ffmpeg no pudo convertir la nota de voz:', r.error?.message || String(r.stderr || '').trim().slice(0, 300));
  } catch (e) {
    console.error('[media] sin ffmpeg para convertir la nota de voz', e);
  } finally {
    if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ }
  }
  return null;
}

/**
 * Versión para ESCUCHAR en el panel: AAC en .m4a, que suena en cualquier navegador (Safari del
 * iPhone y la app instalada no reproducen webm ni ogg, que es lo que graban Chrome/Android y lo que
 * manda WhatsApp). Se convierte una vez y queda guardada junto al original. null si no se pudo.
 */
export function audioParaEscuchar(archivo: string): string | null {
  if (/\.(m4a|mp3|aac)$/i.test(archivo)) return archivo;
  const destino = archivo + '.escuchar.m4a';
  if (existsSync(destino)) return destino;
  const tmp = destino + '.tmp.m4a';
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', archivo, '-vn', '-map', '0:a:0', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', tmp], { timeout: 60_000 });
    if (r.status === 0 && existsSync(tmp)) { renameSync(tmp, destino); return destino; }
    console.error('[media] no se pudo preparar el audio para escuchar:', r.error?.message || String(r.stderr || '').trim().slice(0, 300));
  } catch (e) { console.error('[media] sin ffmpeg para preparar el audio', e); }
  try { rmSync(tmp, { force: true }); } catch { /* nada */ }
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
 * ¿La guía de este pedido es de Interrapidísimo (su etiqueta viene acostada)? Se mira la
 * transportadora y, como en los pedidos de Effi a veces viene vacía, también los datos de
 * la guía de Effi, el estado y el enlace del documento.
 */
export function guiaAcostada(o: Record<string, unknown>): boolean {
  const t = [o.transportadora, o.effi_guia_info, o.estado_woo, o.guia_url].map((x) => String(x ?? '')).join(' ');
  return /inter\s*-?\s*rap/i.test(t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

/** Texto de las primeras páginas de un PDF (pdftotext). '' si no tiene texto (escaneado) o falla. */
export function textoDePdf(pdf: Buffer, paginas = 2): string {
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'pdftxt-'));
    const entrada = path.join(dir, 'in.pdf');
    writeFileSync(entrada, pdf);
    const r = spawnSync('pdftotext', ['-layout', '-f', '1', '-l', String(paginas), '-enc', 'UTF-8', entrada, '-'], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
    if (r.status !== 0) return '';
    return String(r.stdout || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 2500);
  } catch { return ''; } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
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
  const flag = 'guias_png_v3'; // v3: también endereza las de Interrapidísimo que llegaron por el aviso automático
  if (db.prepare('SELECT 1 FROM app_flags WHERE clave = ?').get(flag)) return;
  db.prepare('INSERT INTO app_flags (clave) VALUES (?)').run(flag);
  const filas = (db.prepare("SELECT id, store_id, numero, guia_url, transportadora, effi_guia_info, estado_woo FROM orders WHERE guia_url LIKE '%.pdf%' AND created_at > datetime('now','-60 days')").all() as { id: string; store_id: string; numero: number; guia_url: string; transportadora: string; effi_guia_info: string; estado_woo: string }[])
    .filter((f) => guiaAcostada(f)); // solo las que hay que enderezar
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
      const png = pdfAPng(pdf, { enderezar: guiaAcostada(f) });
      if (!png) continue;
      const url = guardarArchivo(f.store_id, `guia-DF${f.numero}-${uid().slice(0, 6)}.png`, png);
      db.prepare('UPDATE orders SET guia_img = ? WHERE id = ?').run(url, f.id);
      n++;
    } catch { /* sigue con la próxima */ }
  }
  if (n) console.log(`[guías] ${n} imagen(es) de guía reconvertidas (recortadas/enderezadas)`);
}

// ── Archivos para WhatsApp: tipo real y formatos que WhatsApp acepta ─────────────────────────
/** Tipo real de un archivo por sus primeros bytes ('' si no se reconoce). */
export function mimeReal(buf: Buffer): string {
  if (!buf || buf.length < 12) return '';
  const h = buf.subarray(0, 16);
  const asc = (a: number, b: number) => h.subarray(a, b).toString('latin1');
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h[0] === 0x89 && asc(1, 4) === 'PNG') return 'image/png';
  if (asc(0, 4) === 'GIF8') return 'image/gif';
  if (asc(0, 4) === 'RIFF' && asc(8, 12) === 'WEBP') return 'image/webp';
  if (asc(0, 4) === 'RIFF' && asc(8, 12) === 'AVI ') return 'video/x-msvideo';
  if (asc(0, 4) === 'RIFF' && asc(8, 12) === 'WAVE') return 'audio/wav';
  if (asc(0, 2) === 'BM') return 'image/bmp';
  if (asc(0, 4) === '%PDF') return 'application/pdf';
  if (asc(0, 4) === 'OggS') return 'audio/ogg';
  if (asc(0, 3) === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return 'video/webm';
  if (asc(4, 8) === 'ftyp') {
    const marca = asc(8, 12).toLowerCase();
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)/.test(marca)) return 'image/heic';
    if (/^avi[fs]/.test(marca)) return 'image/avif';
    if (marca.startsWith('qt')) return 'video/quicktime';
    if (marca.startsWith('m4a') || marca.startsWith('m4b')) return 'audio/mp4';
    if (marca.startsWith('3g')) return 'video/3gpp';
    return 'video/mp4';
  }
  if (asc(0, 4) === 'PK\u0003\u0004') return 'application/zip'; // docx/xlsx/pptx también son zip: se deja el del nombre
  return '';
}

/** Tipos que WhatsApp (Cloud API) acepta, por tipo de mensaje. */
const WA_OK: Record<string, RegExp> = {
  image: /^image\/(jpeg|png)$/,
  video: /^video\/(mp4|3gpp)$/,
  audio: /^audio\/(aac|mp4|mpeg|amr|ogg|opus)$/,
  document: /^(application\/(pdf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/plain)$/,
};
const LIMITE_WA: Record<string, number> = { image: 5 * 1024 * 1024, video: 16 * 1024 * 1024, audio: 16 * 1024 * 1024, document: 100 * 1024 * 1024 };

/** Convierte con ffmpeg (caché por contenido: el mismo video del producto no se convierte con cada cliente). */
function convertir(buf: Buffer, destinoExt: 'jpg' | 'mp4', args: string[]): Buffer | null {
  const hash = createHash('sha1').update(buf).digest('hex');
  const cacheDir = path.resolve(DATA_DIR, 'media', '__wa__');
  const cache = path.join(cacheDir, `${hash}.${destinoExt}`);
  try { if (existsSync(cache)) return readFileSync(cache); } catch { /* sigue */ }
  let dir = '';
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'df-wa-'));
    const entrada = path.join(dir, 'in'), salida = path.join(dir, `out.${destinoExt}`);
    writeFileSync(entrada, buf);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', entrada, ...args, salida], { timeout: 180_000 });
    if (r.status !== 0 || !existsSync(salida)) { console.error('[media] ffmpeg no pudo convertir para WhatsApp:', String(r.stderr || r.error?.message || '').trim().slice(0, 300)); return null; }
    const out = readFileSync(salida);
    try { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cache, out); } catch { /* sin caché */ }
    return out;
  } catch (e) { console.error('[media] sin ffmpeg para convertir', e); return null; } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* nada */ } }
}

/**
 * Deja el archivo en un formato que WhatsApp acepte antes de enviarlo:
 *  - el tipo se toma del contenido (un .MOV guardado como «.quicktime» o un .heic llegaban como
 *    «application/octet-stream» y Meta respondía «Param file must be a file with one of the following types…»);
 *  - fotos que no son JPG/PNG (webp, gif, heic, avif, bmp…) → JPG; videos que no son MP4 H.264
 *    (mov, webm, avi…) o pasan de 16 MB → MP4 H.264/AAC.
 * Los audios se convierten aparte (nota de voz a ogg/opus). Si no se puede, explica por qué.
 */
export function prepararParaWhatsapp(media: { buffer: Buffer; mime: string; tipo: string }, nombre = ''): { buffer: Buffer; mime: string; tipo: string; nombre: string } | { error: string } {
  let mime = media.mime.split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg' || mime === 'image/pjpeg') mime = 'image/jpeg';
  const real = mimeReal(media.buffer);
  // El contenido manda (salvo los documentos de Office, que por dentro son un zip).
  if (real && !(real === 'application/zip' && /officedocument|msword|ms-excel|ms-powerpoint/.test(mime))) mime = real;
  let tipo = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document';
  const base = (nombre || 'archivo').replace(/\.[a-z0-9]{2,10}$/i, '') || 'archivo';
  if (tipo === 'image' && !WA_OK.image.test(mime)) {
    // GIF animado: mejor como video (WhatsApp no anima GIF enviados como imagen).
    if (mime === 'image/gif') {
      const mp4 = convertir(media.buffer, 'mp4', ['-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-an']);
      if (mp4) return { buffer: mp4, mime: 'video/mp4', tipo: 'video', nombre: `${base}.mp4` };
    }
    const jpg = convertir(media.buffer, 'jpg', ['-frames:v', '1', '-q:v', '3']);
    if (!jpg) return { error: `WhatsApp no acepta fotos en formato ${mime.split('/')[1].toUpperCase()} y no se pudo convertir a JPG.` };
    return { buffer: jpg, mime: 'image/jpeg', tipo: 'image', nombre: `${base}.jpg` };
  }
  if (tipo === 'image' && media.buffer.length > LIMITE_WA.image) {
    const jpg = convertir(media.buffer, 'jpg', ['-frames:v', '1', '-vf', "scale='min(2048,iw)':-2", '-q:v', '5']);
    if (jpg) return { buffer: jpg, mime: 'image/jpeg', tipo: 'image', nombre: `${base}.jpg` };
  }
  if (tipo === 'video') {
    // iPhone graba en HEVC (H.265): WhatsApp en muchos celulares no lo reproduce; se pasa a H.264.
    const hevc = media.buffer.subarray(0, Math.min(media.buffer.length, 400_000)).includes(Buffer.from('hvc1'));
    if (!WA_OK.video.test(mime) || hevc || media.buffer.length > LIMITE_WA.video) {
      const grande = media.buffer.length > LIMITE_WA.video;
      const mp4 = convertir(media.buffer, 'mp4', ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', grande ? '30' : '26', '-vf', "scale='min(1280,iw)':-2", '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart']);
      if (!mp4) return { error: `WhatsApp no acepta videos en formato ${mime.split('/')[1].toUpperCase()} y no se pudo convertir a MP4.` };
      if (mp4.length > LIMITE_WA.video) return { error: 'El video pesa más de 16 MB, el máximo de WhatsApp. Súbelo más corto o más liviano.' };
      return { buffer: mp4, mime: 'video/mp4', tipo: 'video', nombre: `${base}.mp4` };
    }
  }
  if (tipo === 'document' && !WA_OK.document.test(mime)) {
    return { error: `WhatsApp no acepta archivos de tipo «${mime || 'desconocido'}». Envía una foto (JPG/PNG), un video MP4 o un PDF.` };
  }
  if (media.buffer.length > (LIMITE_WA[tipo] || LIMITE_WA.document)) return { error: `El archivo pesa más de lo que permite WhatsApp para ${tipo === 'image' ? 'fotos (5 MB)' : tipo === 'audio' ? 'audios (16 MB)' : 'documentos (100 MB)'}.` };
  // El nombre con la extensión del formato real (un JPG llamado «.heic» confunde al celular).
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'text/plain' ? 'txt' : tipo === 'document' && nombre ? (nombre.split('.').pop() || 'pdf') : mediaExt(tipo, mime);
  return { buffer: media.buffer, mime, tipo, nombre: tipo === 'document' && nombre ? nombre : `${base}.${ext}` };
}
