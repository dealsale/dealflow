/**
 * Biblioteca de landings: igual que la Biblioteca de productos, pero con páginas del
 * Creador de landings. El superadmin clona una landing de cualquier tienda a la
 * biblioteca (con sus imágenes copiadas a un espacio propio) y cada tienda la importa
 * como borrador en su Tienda en línea: unas gratis, otras con un pago único.
 * Al importar se quitan los datos de la tienda de origen (nombre, logo, WhatsApp,
 * píxel) y se ponen los de la tienda destino; el producto se elige después.
 */
import { db, uid, pj } from './db.js';
import { verLanding, crearLanding, guardarLanding, copiarMediaPublica, configTienda, type LandingDatos } from './landings.js';

db.exec(`CREATE TABLE IF NOT EXISTS library_landings (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  datos TEXT NOT NULL DEFAULT '{}',
  origen TEXT NOT NULL DEFAULT '',
  gratis INTEGER NOT NULL DEFAULT 1,
  precio_importacion INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS library_landing_imports (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  library_landing_id TEXT NOT NULL,
  landing_id TEXT NOT NULL DEFAULT '',
  pagado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, library_landing_id)
)`);

const LIB = '__biblioteca__';
type Fila = { id: string; nombre: string; datos: string; origen: string; gratis: number; precio_importacion: number; activo: number; created_at: string };

/** Copia todas las imágenes de la landing (/l/media/…) al espacio destino, en cualquier campo. */
function copiarImagenes<T>(v: T, dst: string, cache = new Map<string, string>()): T {
  if (typeof v === 'string') {
    if (!v.startsWith('/l/media/')) return v;
    if (!cache.has(v)) cache.set(v, copiarMediaPublica(v, dst));
    return cache.get(v) as unknown as T;
  }
  if (Array.isArray(v)) return v.map((x) => copiarImagenes(x, dst, cache)) as unknown as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copiarImagenes(x, dst, cache)])) as T;
  return v;
}

const portada = (d: Partial<LandingDatos>) => d.galeria?.[0] || d.seoImagen || d.imagenes?.[0] || d.bannerSuperior || null;

export function agregarLandingABiblioteca(storeId: string, landingId: string, opts: { gratis: boolean; precioImportacion: number }): { id: string } | { error: string } {
  const l = verLanding(storeId, landingId);
  if (!l) return { error: 'Landing no encontrada.' };
  const origen = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || '';
  const datos = copiarImagenes(l.datos, LIB);
  const id = uid();
  const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM library_landings').get() as { n: number }).n;
  db.prepare('INSERT INTO library_landings (id, nombre, datos, origen, gratis, precio_importacion, orden) VALUES (?,?,?,?,?,?,?)')
    .run(id, l.datos.nombre || l.nombre, JSON.stringify(datos), origen, opts.gratis ? 1 : 0, opts.gratis ? 0 : Math.max(0, Math.round(opts.precioImportacion || 0)), orden);
  return { id };
}

export function getLibraryLanding(id: string): Fila | undefined {
  return db.prepare('SELECT * FROM library_landings WHERE id = ?').get(id) as Fila | undefined;
}

export const yaAdquiridaLanding = (storeId: string, libId: string) =>
  !!db.prepare('SELECT 1 FROM library_landing_imports WHERE store_id = ? AND library_landing_id = ?').get(storeId, libId);

/** Crea la landing de la biblioteca como borrador en la tienda, con los datos de esa tienda. */
export function importarLandingEnTienda(libId: string, storeId: string, pagado: boolean): { landingId: string } | { error: string } {
  const lib = getLibraryLanding(libId);
  if (!lib) return { error: 'Landing de biblioteca no encontrada.' };
  let datos = copiarImagenes(pj<LandingDatos>(lib.datos, {} as LandingDatos), storeId);
  const tienda = configTienda(storeId);
  // El nombre de la tienda de origen no puede quedar en los textos de otra tienda.
  if (lib.origen.trim() && lib.origen.trim().toLowerCase() !== tienda.nombre.trim().toLowerCase()) {
    const re = new RegExp(lib.origen.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    datos = JSON.parse(JSON.stringify(datos).replace(re, tienda.nombre.replace(/["\\]/g, '')));
  }
  datos = { ...datos, nombreTienda: tienda.nombre, logo: tienda.logo, whatsapp: tienda.whatsapp, pixelMeta: tienda.pixelMeta };
  const nueva = crearLanding(storeId, datos.nombre || lib.nombre);
  const r = guardarLanding(storeId, nueva.id, { datos });
  if ('error' in r) return r;
  db.prepare(`INSERT INTO library_landing_imports (id, store_id, library_landing_id, landing_id, pagado) VALUES (?,?,?,?,?)
    ON CONFLICT(store_id, library_landing_id) DO UPDATE SET landing_id = excluded.landing_id, pagado = MAX(library_landing_imports.pagado, excluded.pagado)`)
    .run(uid(), storeId, libId, nueva.id, pagado ? 1 : 0);
  return { landingId: nueva.id };
}

export function listarBibliotecaLandings(storeId: string) {
  const mias = new Set((db.prepare('SELECT library_landing_id FROM library_landing_imports WHERE store_id = ?').all(storeId) as { library_landing_id: string }[]).map((r) => r.library_landing_id));
  return (db.prepare('SELECT * FROM library_landings WHERE activo = 1 ORDER BY orden, created_at').all() as Fila[]).map((r) => {
    const d = pj<Partial<LandingDatos>>(r.datos, {});
    return { id: r.id, nombre: r.nombre, precio: Number(d.precio) || 0, gratis: !!r.gratis, precioImportacion: r.precio_importacion, portada: portada(d), adquirida: mias.has(r.id) };
  });
}

export function listarBibliotecaLandingsAdmin() {
  return (db.prepare('SELECT * FROM library_landings ORDER BY orden, created_at').all() as Fila[]).map((r) => {
    const d = pj<Partial<LandingDatos>>(r.datos, {});
    return {
      id: r.id, nombre: r.nombre, origen: r.origen, precio: Number(d.precio) || 0, gratis: !!r.gratis, precioImportacion: r.precio_importacion, activo: !!r.activo, portada: portada(d),
      importos: (db.prepare('SELECT COUNT(*) n FROM library_landing_imports WHERE library_landing_id = ?').get(r.id) as { n: number }).n,
    };
  });
}

export function actualizarLibraryLanding(id: string, p: { nombre?: string; gratis?: boolean; precioImportacion?: number; activo?: boolean }): boolean {
  if (!getLibraryLanding(id)) return false;
  if (typeof p.nombre === 'string') db.prepare('UPDATE library_landings SET nombre = ? WHERE id = ?').run(p.nombre.trim().slice(0, 120) || 'Landing', id);
  if (typeof p.gratis === 'boolean') db.prepare('UPDATE library_landings SET gratis = ? WHERE id = ?').run(p.gratis ? 1 : 0, id);
  if (typeof p.precioImportacion === 'number') db.prepare('UPDATE library_landings SET precio_importacion = ? WHERE id = ?').run(Math.max(0, Math.round(p.precioImportacion)), id);
  if (typeof p.activo === 'boolean') db.prepare('UPDATE library_landings SET activo = ? WHERE id = ?').run(p.activo ? 1 : 0, id);
  return true;
}

export function eliminarLibraryLanding(id: string): void {
  db.prepare('DELETE FROM library_landings WHERE id = ?').run(id);
}
