/**
 * Fechas en hora de Colombia, RÁPIDAS. Colombia es UTC-5 todo el año (sin horario de verano),
 * así que basta restar 5 h. `toLocaleDateString({ timeZone })` crea un formateador nuevo en cada
 * llamada (~0,1–0,3 ms): con 4.000 chats y 3.000 pedidos congelaba la app varios segundos.
 */
const OFF = 5 * 3600e3;
/** Milisegundos de un datetime del servidor ("2026-10-31 14:05:00", UTC) o ISO. */
export function msDe(iso: string | number | Date | undefined | null): number {
  if (iso == null || iso === '') return NaN;
  if (typeof iso === 'number') return iso;
  if (iso instanceof Date) return iso.getTime();
  const s = String(iso);
  return Date.parse(s.length <= 10 ? s + 'T00:00:00Z' : s.replace(' ', 'T') + (/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
}
/** 'YYYY-MM-DD' en Colombia (de un instante en ms, o de ahora). */
export function ymdCO(ms: number = Date.now()): string {
  return isNaN(ms) ? '' : new Date(ms - OFF).toISOString().slice(0, 10);
}
/** 'HH:MM' (24 h) en Colombia. */
export function hhmmCO(ms: number): string {
  if (isNaN(ms)) return '';
  const d = new Date(ms - OFF);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
const cache = new Map<string, { format: (d: Date | number) => string }>();
/** Formateador reutilizable (se crea una sola vez por combinación de opciones). Una fecha inválida da ''. */
export function fmtCO(locale: string, opts: Intl.DateTimeFormatOptions): { format: (d: Date | number) => string } {
  const k = locale + JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) {
    const dtf = new Intl.DateTimeFormat(locale, { timeZone: 'America/Bogota', ...opts });
    f = { format: (d) => { try { return dtf.format(d); } catch { return ''; } } };
    cache.set(k, f);
  }
  return f;
}
