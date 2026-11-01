/**
 * Medidor de rendimiento del servidor (para el panel del equipo DealFlow).
 *
 * Node atiende todo en un solo hilo y SQLite (better-sqlite3) es síncrono: si una consulta o
 * una tarea de fondo tarda 3 s, TODAS las peticiones esperan esos 3 s. Aquí se mide:
 *  - Bloqueos del hilo (cuánto se atrasó un reloj de 100 ms) y qué estaba corriendo en ese
 *    momento (peticiones en curso y tareas de fondo).
 *  - Las rutas más lentas (por ruta normalizada) y las últimas peticiones lentas.
 *  - Tamaño de la base de datos, del WAL y de las tablas más grandes.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const hist = monitorEventLoopDelay({ resolution: 20 });
hist.enable();
const inicio = Date.now();

const enCurso = new Map<number, { ruta: string; t: number }>();
const trabajos = new Map<string, number>();
let seq = 0;

interface Bloqueo { t: number; ms: number; peticiones: string[]; tareas: string[] }
const bloqueos: Bloqueo[] = [];
interface Lenta { t: number; ms: number; ruta: string; estado: number }
const lentas: Lenta[] = [];
const porRuta = new Map<string, { n: number; total: number; max: number }>();

/** Ruta sin ids (para agrupar): /api/orders/8f3a…/guia → /api/orders/:id/guia */
const normalizar = (u: string) => u.split('?')[0]
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
  .replace(/\/[0-9a-z_-]{16,}(?=\/|$)/gi, '/:id')
  .replace(/\/\d+(?=\/|$)/g, '/:n');

// Reloj de 100 ms: si se atrasa más de 250 ms, el hilo estuvo bloqueado.
let esperado = Date.now() + 100;
setInterval(() => {
  const ahora = Date.now();
  const atraso = ahora - esperado;
  esperado = ahora + 100;
  if (atraso < 250) return;
  bloqueos.push({
    t: ahora, ms: atraso,
    peticiones: [...enCurso.values()].map((p) => `${p.ruta} (${ahora - p.t} ms)`).slice(0, 6),
    tareas: [...trabajos].map(([n, t]) => `${n} (${ahora - t} ms)`),
  });
  if (bloqueos.length > 200) bloqueos.shift();
}, 100).unref?.();

/** Middleware: mide cada petición a la API. */
export function medirPeticiones(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/webhooks/')) return next();
  const id = ++seq; const t = Date.now();
  const ruta = `${req.method} ${normalizar(req.originalUrl || req.url)}`;
  enCurso.set(id, { ruta, t });
  res.on('close', () => {
    enCurso.delete(id);
    const ms = Date.now() - t;
    const a = porRuta.get(ruta) || { n: 0, total: 0, max: 0 };
    a.n++; a.total += ms; a.max = Math.max(a.max, ms);
    porRuta.set(ruta, a);
    if (ms >= 800) { lentas.push({ t, ms, ruta, estado: res.statusCode }); if (lentas.length > 300) lentas.shift(); }
  });
  next();
}

/** Marca una tarea de fondo mientras corre (para saber quién bloquea). */
export function trabajo<T>(nombre: string, fn: () => T | Promise<T>): Promise<T | undefined> {
  const t = Date.now();
  trabajos.set(nombre, t);
  return Promise.resolve().then(fn).catch((e) => { console.warn(`[${nombre}]`, e); return undefined; }).finally(() => {
    trabajos.delete(nombre);
    const ms = Date.now() - t;
    const k = `tarea ${nombre}`;
    const a = porRuta.get(k) || { n: 0, total: 0, max: 0 };
    a.n++; a.total += ms; a.max = Math.max(a.max, ms);
    porRuta.set(k, a);
  });
}

/** Reporte para el panel. */
export async function reporte() {
  const { db, DATA_DIR } = await import('./db.js');
  const tam = (f: string) => { try { return statSync(path.join(DATA_DIR, f)).size; } catch { return 0; } };
  const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
    .map(({ name }) => { const t = Date.now(); let n = 0; try { n = (db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get() as { n: number }).n; } catch { /* nada */ } return { tabla: name, filas: n, ms: Date.now() - t }; })
    .sort((a, b) => b.filas - a.filas).slice(0, 12);
  const mem = process.memoryUsage();
  const hace = Date.now() - 3600_000;
  return {
    arriba: Math.round((Date.now() - inicio) / 1000),
    memoriaMB: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
    hilo: { p50: Math.round(hist.percentile(50) / 1e6), p99: Math.round(hist.percentile(99) / 1e6), max: Math.round(hist.max / 1e6) },
    bloqueos: bloqueos.filter((b) => b.t > hace).slice(-25).reverse(),
    rutas: [...porRuta].map(([ruta, a]) => ({ ruta, n: a.n, prom: Math.round(a.total / a.n), max: a.max })).sort((a, b) => b.prom * b.n - a.prom * a.n).slice(0, 25),
    lentas: lentas.filter((l) => l.t > hace).slice(-30).reverse(),
    base: { dbMB: +(tam('dealflow.db') / 1048576).toFixed(1), walMB: +(tam('dealflow.db-wal') / 1048576).toFixed(1), tablas },
  };
}

/** Reinicia los contadores (para medir desde cero). */
export function reiniciar(): void { hist.reset(); bloqueos.length = 0; lentas.length = 0; porRuta.clear(); }
