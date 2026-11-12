/**
 * Precios de los servicios de DealFlow que se cobran aparte del plan (membresías y, más
 * adelante, microtransacciones). El equipo los edita en Admin → Planes; los cobros por
 * Wompi toman el precio de aquí.
 */
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS precios_servicios (
  clave TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio INTEGER NOT NULL DEFAULT 0,
  unidad TEXT NOT NULL DEFAULT 'mes',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

export interface PrecioServicio { clave: string; nombre: string; descripcion: string; precio: number; unidad: 'mes' | 'unico' | 'uso' }

// Servicios que existen hoy (se crean la primera vez con su precio por defecto).
const BASE: PrecioServicio[] = [
  { clave: 'tienda_online', nombre: 'Tienda en línea', descripcion: 'Membresía mensual: productos y landings ilimitados, subdominio gratis y dominio propio.', precio: 25000, unidad: 'mes' },
];
{
  const ins = db.prepare('INSERT OR IGNORE INTO precios_servicios (clave, nombre, descripcion, precio, unidad) VALUES (?,?,?,?,?)');
  // La mensualidad que ya se hubiera configurado antes se conserva.
  let previa: number | null = null;
  try { const r = db.prepare("SELECT valor FROM landings_ajustes WHERE clave = 'mensualidad'").get() as { valor: string } | undefined; if (r) previa = Math.max(0, Math.round(Number(r.valor) || 0)); } catch { /* no existía */ }
  for (const s of BASE) ins.run(s.clave, s.nombre, s.descripcion, s.clave === 'tienda_online' && previa !== null ? previa : s.precio, s.unidad);
}

// Una sola vez: la Tienda en línea por aparte vale $80.000/mes (antes el valor por defecto era $25.000).
try {
  if (!db.prepare("SELECT 1 FROM app_flags WHERE clave = 'tienda_online_80k'").get()) {
    db.prepare("UPDATE precios_servicios SET precio = 80000, descripcion = ?, updated_at = datetime('now') WHERE clave = 'tienda_online' AND precio = 25000")
      .run('Membresía mensual por aparte (los planes que la incluyen no la pagan): productos y landings ilimitados, subdominio gratis y dominio propio.');
    db.prepare("INSERT INTO app_flags (clave) VALUES ('tienda_online_80k')").run();
  }
} catch { /* app_flags aún no existe: se hace en el próximo arranque */ }

export function listarPrecios(): PrecioServicio[] {
  return db.prepare('SELECT clave, nombre, descripcion, precio, unidad FROM precios_servicios ORDER BY nombre').all() as PrecioServicio[];
}
export function precioDe(clave: string): number {
  return Math.max(0, Number((db.prepare('SELECT precio FROM precios_servicios WHERE clave = ?').get(clave) as { precio: number } | undefined)?.precio) || 0);
}
export function cambiarPrecio(clave: string, precio: number): PrecioServicio | null {
  const n = Math.max(0, Math.min(100_000_000, Math.round(Number(precio) || 0)));
  if (!db.prepare("UPDATE precios_servicios SET precio = ?, updated_at = datetime('now') WHERE clave = ?").run(n, clave).changes) return null;
  return listarPrecios().find((p) => p.clave === clave) || null;
}
