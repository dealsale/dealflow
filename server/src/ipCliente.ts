/**
 * IP real del visitante de una landing (la que se le manda a Meta con los eventos).
 *
 * Las landings pasan por Cloudflare (y a veces por el worker de dominios) antes de llegar
 * al servidor, y por el camino la cabecera X-Forwarded-For puede quedar con la IP de
 * Cloudflare. Si a Meta le llega esa IP, no coincide con la del navegador y la calidad de
 * coincidencia baja. Aquí se revisan todas las cabeceras posibles y se toma la primera IP
 * que NO sea de Cloudflare ni privada.
 */
import type { Request } from 'express';
import { isIP } from 'node:net';

// Rangos publicados por Cloudflare (cloudflare.com/ips).
const CF_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CF_V6 = ['2400:cb00:', '2606:4700:', '2803:f800:', '2405:b500:', '2405:8100:', '2a06:98c', '2c0f:f248:'];

const aNumero = (ip: string) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
const RANGOS = CF_V4.map((r) => { const [base, bits] = r.split('/'); const tam = 2 ** (32 - Number(bits)); const ini = Math.floor(aNumero(base) / tam) * tam; return [ini, ini + tam] as const; });

function esCloudflareOPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = aNumero(ip);
    if (RANGOS.some(([a, b]) => n >= a && n < b)) return true;
    return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip);
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    return CF_V6.some((p) => s.startsWith(p)) || s === '::1' || /^f[cd]/.test(s) || s.startsWith('fe80');
  }
  return true; // no es una IP
}

const limpiar = (v: string) => v.trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '').replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1');

/** Todas las IP candidatas, en orden de confianza. */
export function ipsCandidatas(req: Request): string[] {
  const h = (k: string) => String(req.headers[k] || '');
  return [h('x-df-ip'), h('cf-connecting-ip'), h('true-client-ip'), ...h('x-forwarded-for').split(','), h('x-real-ip'), String(req.socket.remoteAddress || '')]
    .map(limpiar).filter((x) => isIP(x));
}

/** La IP del visitante: la primera que no sea de Cloudflare ni privada ('' si no hay ninguna). */
export function ipCliente(req: Request): string {
  return ipsCandidatas(req).find((ip) => !esCloudflareOPrivada(ip)) || '';
}
