/**
 * Cifrado propio de DealFlow (además del cifrado de disco de Railway).
 *
 * AES-256-GCM con la llave de la variable DATA_ENCRYPTION_KEY (32 bytes, en hex o
 * base64). La llave vive en las variables del servidor, NUNCA en el disco: así una
 * copia del disco o de un respaldo no sirve sin ella. Se cifran:
 *  - las copias diarias y los archivos de la papelera (archivos completos),
 *  - los tokens de acceso de Shopify guardados en la base (texto con prefijo enc:v1:).
 *
 * Sin llave configurada todo sigue funcionando como antes (sin cifrar) y el panel
 * del superadmin lo avisa. Leer un texto sin prefijo devuelve el mismo texto, así
 * que los datos guardados antes del cifrado se siguen leyendo.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const PREFIJO = 'enc:v1:';
const MAGIA = Buffer.from('DFENC1');

let llaveCache: Buffer | null | undefined;
function llave(): Buffer | null {
  if (llaveCache !== undefined) return llaveCache;
  const v = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
  let k: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(v)) k = Buffer.from(v, 'hex');
  else if (v) { try { const b = Buffer.from(v, 'base64'); if (b.length === 32) k = b; } catch { /* inválida */ } }
  if (v && !k) console.error('[cifrado] DATA_ENCRYPTION_KEY no es válida (deben ser 32 bytes en hex o base64): se sigue SIN cifrar.');
  llaveCache = k;
  return k;
}
export const cifradoActivo = () => !!llave();

/** Genera una llave nueva (para que el superadmin la copie a las variables de Railway). */
export const llaveNueva = () => randomBytes(32).toString('hex');

export function cifrarTexto(s: string): string {
  const k = llave();
  if (!k || !s || s.startsWith(PREFIJO)) return s;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return PREFIJO + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function descifrarTexto(s: string): string {
  if (!s || !s.startsWith(PREFIJO)) return s;
  const k = llave();
  if (!k) throw new Error('Hay datos cifrados pero falta DATA_ENCRYPTION_KEY en el servidor.');
  const b = Buffer.from(s.slice(PREFIJO.length), 'base64');
  const d = createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

/** Cifra un archivo completo: MAGIA + iv(12) + datos + tag(16). */
export async function cifrarArchivo(origen: string, destino: string): Promise<void> {
  const k = llave();
  if (!k) throw new Error('Sin llave de cifrado.');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const out = createWriteStream(destino);
  out.write(Buffer.concat([MAGIA, iv]));
  await pipeline(createReadStream(origen), c, out);
  // El tag va al final (pipeline ya cerró el archivo: se agrega aparte).
  const fd = openSync(destino, 'a');
  try { writeSync(fd, c.getAuthTag()); } finally { closeSync(fd); }
}

export function esArchivoCifrado(ruta: string): boolean {
  try {
    const fd = openSync(ruta, 'r');
    try { const b = Buffer.alloc(MAGIA.length); readSync(fd, b, 0, b.length, 0); return b.equals(MAGIA); } finally { closeSync(fd); }
  } catch { return false; }
}

/** Descifra un archivo creado con cifrarArchivo (verifica que no se haya alterado). */
export async function descifrarArchivo(origen: string, destino: string): Promise<void> {
  const k = llave();
  if (!k) throw new Error('Este archivo está cifrado y falta DATA_ENCRYPTION_KEY en el servidor.');
  const tam = statSync(origen).size;
  const cab = MAGIA.length + 12;
  if (tam < cab + 16) throw new Error('Archivo cifrado incompleto.');
  const fd = openSync(origen, 'r');
  const iv = Buffer.alloc(12); const tag = Buffer.alloc(16);
  try { readSync(fd, iv, 0, 12, MAGIA.length); readSync(fd, tag, 0, 16, tam - 16); } finally { closeSync(fd); }
  const d = createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  await pipeline(createReadStream(origen, { start: cab, end: tam - 17 }), d, createWriteStream(destino));
}

/** Versión en memoria (archivos chicos como los de la papelera). Reemplaza el archivo por su versión cifrada. */
export function cifrarArchivoSync(ruta: string): boolean {
  const k = llave();
  if (!k || esArchivoCifrado(ruta)) return false;
  const datos = readFileSync(ruta);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(datos), c.final()]);
  writeFileSync(`${ruta}.tmp`, Buffer.concat([MAGIA, iv, ct, c.getAuthTag()]));
  renameSync(`${ruta}.tmp`, ruta);
  return true;
}

/** Copia descifrada (en memoria) de un archivo cifrado a `destino`. Si no está cifrado, lo copia tal cual. */
export function descifrarArchivoSync(origen: string, destino: string): void {
  const b = readFileSync(origen);
  if (!b.subarray(0, MAGIA.length).equals(MAGIA)) { writeFileSync(destino, b); return; }
  const k = llave();
  if (!k) throw new Error('Este archivo está cifrado y falta DATA_ENCRYPTION_KEY en el servidor.');
  const iv = b.subarray(MAGIA.length, MAGIA.length + 12);
  const d = createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(b.subarray(b.length - 16));
  writeFileSync(destino, Buffer.concat([d.update(b.subarray(MAGIA.length + 12, b.length - 16)), d.final()]));
}
