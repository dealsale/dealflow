import { promises as dns } from 'node:dns';
import net from 'node:net';

/**
 * Descarga una imagen de una URL que mandó una tienda (p. ej. la foto externa de un producto)
 * sin dejar que el servidor se use para llegar a direcciones internas (SSRF): solo https, solo
 * IPs públicas, sin seguir redirecciones, máximo 15 MB y solo si de verdad es una imagen.
 */
const MAX_BYTES = 15 * 1024 * 1024;

/** ¿La IP es privada, local, de enlace local, de metadatos de la nube o reservada? */
export function ipInterna(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (v4) return ipInterna(v4[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true; // si no se reconoce, no se arriesga
}

export async function descargarImagenSegura(src: string, timeoutMs = 30_000): Promise<Buffer | null> {
  let url: URL;
  try { url = new URL(src); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  try {
    const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((d) => d.address);
    if (!ips.length || ips.some(ipInterna)) return null;
  } catch { return null; }
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    if (!/^image\//i.test(res.headers.get('content-type') || '')) return null;
    if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_BYTES ? null : buf;
  } catch { return null; }
}

/**
 * Igual que descargarImagenSegura pero para un VIDEO (referencias del Estudio que pega el equipo):
 * solo https a IPs públicas, sin redirecciones, solo si de verdad es video, máximo `maxBytes`.
 */
export async function descargarVideoSeguro(src: string, maxBytes = 80 * 1024 * 1024, timeoutMs = 120_000): Promise<{ buf: Buffer; tipo: string } | { error: string }> {
  let url: URL;
  try { url = new URL(src); } catch { return { error: 'Ese enlace no es válido.' }; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return { error: 'El enlace tiene que empezar por https://.' };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  try {
    const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((d) => d.address);
    if (!ips.length || ips.some(ipInterna)) return { error: 'No se puede bajar de esa dirección.' };
  } catch { return { error: 'No encontramos esa página.' }; }
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { error: `La página respondió ${res.status}: revisa que el enlace sea del video y sea público.` };
    const tipo = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^video\/(mp4|quicktime|webm)$/.test(tipo)) return { error: 'Ese enlace no es un video MP4, MOV o WEBM (debe ser el enlace directo al archivo).' };
    if (Number(res.headers.get('content-length') || 0) > maxBytes) return { error: `El video pesa más de ${Math.round(maxBytes / 1048576)} MB.` };
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > maxBytes ? { error: `El video pesa más de ${Math.round(maxBytes / 1048576)} MB.` } : { buf, tipo };
  } catch { return { error: 'No pudimos bajar el video (tardó demasiado o la página no respondió).' }; }
}
