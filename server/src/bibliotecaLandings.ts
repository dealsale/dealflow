/**
 * Biblioteca de landings: igual que la Biblioteca de productos, pero con páginas del
 * Creador de landings. El superadmin ve TODAS las landings de todas las tiendas y
 * manda cualquiera a la biblioteca (con sus imágenes copiadas a un espacio propio) o
 * directo a otra tienda. Cada tienda importa de la biblioteca como borrador en su Tienda
 * en línea: unas gratis, otras con un pago único.
 *
 * Una landing es más que sus datos: puede tener código propio (modo código) o usar una
 * plantilla HTML de la tienda. Las copias llevan todo eso, con las imágenes copiadas al
 * espacio destino. Al copiar se quitan los datos de la tienda de origen (nombre, logo,
 * WhatsApp, píxel) y se ponen los de la tienda destino; el producto se elige después.
 */
import { db, uid, pj } from './db.js';
import { verLanding, crearLanding, guardarLanding, copiarMediaPublica, configTienda, urlPublicaLanding, type LandingDatos } from './landings.js';
import { plantillaDe, guardarPlantilla } from './plantillasTienda.js';
import { MASTER_STORE_ID } from './biblioteca.js';

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
// De qué landing salió (para marcarla en el catálogo) + código propio y plantilla de la tienda.
for (const col of [
  "origen_landing_id TEXT NOT NULL DEFAULT ''", "codigo TEXT NOT NULL DEFAULT ''", "codigo_gracias TEXT NOT NULL DEFAULT ''", 'modo_codigo INTEGER NOT NULL DEFAULT 0',
  "plantilla_nombre TEXT NOT NULL DEFAULT ''", "plantilla_html TEXT NOT NULL DEFAULT ''", "plantilla_gracias TEXT NOT NULL DEFAULT ''",
]) {
  try { db.exec(`ALTER TABLE library_landings ADD COLUMN ${col}`); } catch { /* ya existe */ }
}

const LIB = '__biblioteca__';
const txt = (v: unknown) => (v == null ? '' : String(v));
type Fila = {
  id: string; nombre: string; datos: string; origen: string; gratis: number; precio_importacion: number; activo: number; created_at: string;
  origen_landing_id: string; codigo: string; codigo_gracias: string; modo_codigo: number; plantilla_nombre: string; plantilla_html: string; plantilla_gracias: string;
};

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
/** Lo mismo dentro de un HTML (código propio o plantilla): cada /l/media/… que aparezca. */
function copiarImagenesEnHtml(html: string, dst: string, cache = new Map<string, string>()): string {
  if (!html) return html;
  return html.replace(/\/l\/media\/[^/"'\s)]+\/[^"'\s)?#<>]+/g, (u) => {
    if (!cache.has(u)) cache.set(u, copiarMediaPublica(u, dst) || u);
    return cache.get(u)!;
  });
}

const portada = (d: Partial<LandingDatos>) => d.galeria?.[0] || d.seoImagen || d.imagenes?.[0] || d.bannerSuperior || null;

/** Todo lo que hace falta para clonar una landing tal cual se ve. */
interface Paquete {
  nombre: string; datos: LandingDatos;
  codigo: string; codigoGracias: string; modoCodigo: boolean;
  plantillaNombre: string; plantillaHtml: string; plantillaGracias: string;
}

function paqueteDeLanding(storeId: string, landingId: string): Paquete | null {
  const l = verLanding(storeId, landingId);
  if (!l) return null;
  const f = db.prepare('SELECT codigo, codigo_gracias, modo_codigo, plantilla_id FROM landings WHERE id = ?').get(landingId) as Record<string, unknown>;
  const p = plantillaDe(storeId, txt(f.plantilla_id));
  return {
    nombre: l.datos.nombre || l.nombre, datos: l.datos,
    codigo: txt(f.codigo), codigoGracias: txt(f.codigo_gracias), modoCodigo: !!f.modo_codigo,
    plantillaNombre: p ? txt(p.nombre) : '', plantillaHtml: p ? txt(p.html) : '', plantillaGracias: p ? txt(p.gracias) : '',
  };
}

function paqueteDeBiblioteca(r: Fila): Paquete {
  return {
    nombre: r.nombre, datos: pj<LandingDatos>(r.datos, {} as LandingDatos),
    codigo: txt(r.codigo), codigoGracias: txt(r.codigo_gracias), modoCodigo: !!r.modo_codigo,
    plantillaNombre: txt(r.plantilla_nombre), plantillaHtml: txt(r.plantilla_html), plantillaGracias: txt(r.plantilla_gracias),
  };
}

/** El paquete con sus imágenes copiadas al espacio destino (biblioteca o tienda). */
function paqueteEn(p: Paquete, dst: string): Paquete {
  const cache = new Map<string, string>();
  return {
    ...p,
    datos: copiarImagenes(p.datos, dst, cache),
    codigo: copiarImagenesEnHtml(p.codigo, dst, cache), codigoGracias: copiarImagenesEnHtml(p.codigoGracias, dst, cache),
    plantillaHtml: copiarImagenesEnHtml(p.plantillaHtml, dst, cache), plantillaGracias: copiarImagenesEnHtml(p.plantillaGracias, dst, cache),
  };
}

const nombreTienda = (storeId: string) => (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || '';

/** Crea la landing en la tienda destino como borrador, con los datos de esa tienda. */
function crearEnTienda(paquete: Paquete, origenNombre: string, storeId: string): { landingId: string } | { error: string } {
  const q = paqueteEn(paquete, storeId);
  const tienda = configTienda(storeId);
  // El nombre de la tienda de origen no puede quedar en los textos de otra tienda.
  let { datos, codigo, codigoGracias, plantillaHtml, plantillaGracias } = q;
  if (origenNombre.trim() && origenNombre.trim().toLowerCase() !== tienda.nombre.trim().toLowerCase()) {
    const re = new RegExp(origenNombre.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const limpio = tienda.nombre.replace(/["\\<>]/g, '');
    datos = JSON.parse(JSON.stringify(datos).replace(re, limpio));
    codigo = codigo.replace(re, limpio); codigoGracias = codigoGracias.replace(re, limpio);
    plantillaHtml = plantillaHtml.replace(re, limpio); plantillaGracias = plantillaGracias.replace(re, limpio);
  }
  datos = { ...datos, nombreTienda: tienda.nombre, logo: tienda.logo, whatsapp: tienda.whatsapp, pixelMeta: tienda.pixelMeta };
  const nueva = crearLanding(storeId, datos.nombre || q.nombre);
  const r = guardarLanding(storeId, nueva.id, { datos });
  if ('error' in r) return r;
  // Código propio (modo código), tal cual lo tenía la landing original.
  if (codigo.trim() || codigoGracias.trim()) {
    db.prepare('UPDATE landings SET codigo = ?, codigo_gracias = ?, modo_codigo = ? WHERE id = ?').run(codigo, codigoGracias, q.modoCodigo && codigo.trim() ? 1 : 0, nueva.id);
  }
  // Plantilla HTML de la tienda de origen: se crea en la tienda destino (una sola vez) y se le asigna.
  if (plantillaHtml.trim()) {
    const ya = db.prepare('SELECT id FROM landing_plantillas WHERE store_id = ? AND html = ? AND gracias = ?').get(storeId, plantillaHtml, plantillaGracias) as { id: string } | undefined;
    const pid = ya?.id || (() => { const pl = guardarPlantilla(storeId, null, { nombre: q.plantillaNombre || `Plantilla · ${q.nombre}`.slice(0, 80), html: plantillaHtml, gracias: plantillaGracias }); return 'error' in pl ? '' : pl.id; })();
    if (pid) db.prepare('UPDATE landings SET plantilla_id = ? WHERE id = ?').run(pid, nueva.id);
  }
  return { landingId: nueva.id };
}

export function agregarLandingABiblioteca(storeId: string, landingId: string, opts: { gratis: boolean; precioImportacion: number }): { id: string } | { error: string } {
  const p = paqueteDeLanding(storeId, landingId);
  if (!p) return { error: 'Landing no encontrada.' };
  const q = paqueteEn(p, LIB);
  const id = uid();
  const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM library_landings').get() as { n: number }).n;
  db.prepare(`INSERT INTO library_landings (id, nombre, datos, origen, gratis, precio_importacion, orden, origen_landing_id, codigo, codigo_gracias, modo_codigo, plantilla_nombre, plantilla_html, plantilla_gracias)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, q.nombre, JSON.stringify(q.datos), nombreTienda(storeId), opts.gratis ? 1 : 0, opts.gratis ? 0 : Math.max(0, Math.round(opts.precioImportacion || 0)), orden,
      landingId, q.codigo, q.codigoGracias, q.modoCodigo ? 1 : 0, q.plantillaNombre, q.plantillaHtml, q.plantillaGracias);
  return { id };
}

/** Manda una landing de una tienda DIRECTO a otra tienda (como borrador), sin pasar por la biblioteca. */
export function enviarLandingATienda(storeIdOrigen: string, landingId: string, storeIdDestino: string): { landingId: string } | { error: string } {
  const p = paqueteDeLanding(storeIdOrigen, landingId);
  if (!p) return { error: 'Landing no encontrada.' };
  return crearEnTienda(p, nombreTienda(storeIdOrigen), storeIdDestino);
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
  const r = crearEnTienda(paqueteDeBiblioteca(lib), lib.origen, storeId);
  if ('error' in r) return r;
  db.prepare(`INSERT INTO library_landing_imports (id, store_id, library_landing_id, landing_id, pagado) VALUES (?,?,?,?,?)
    ON CONFLICT(store_id, library_landing_id) DO UPDATE SET landing_id = excluded.landing_id, pagado = MAX(library_landing_imports.pagado, excluded.pagado)`)
    .run(uid(), storeId, libId, r.landingId, pagado ? 1 : 0);
  return r;
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
      modoCodigo: !!r.modo_codigo, conPlantilla: !!txt(r.plantilla_html).trim(),
      importos: (db.prepare('SELECT COUNT(*) n FROM library_landing_imports WHERE library_landing_id = ?').get(r.id) as { n: number }).n,
    };
  });
}

/**
 * Catálogo del superadmin: TODAS las landings de todas las tiendas (menos la tienda
 * interna de la biblioteca), con lo necesario para verlas, mandarlas a la biblioteca o a
 * otra tienda. `incluirOcultas`: el superadmin ve también las tiendas ocultas.
 */
export function listarTodasLasLandings(incluirOcultas: boolean) {
  const enBiblioteca = new Map((db.prepare("SELECT id, origen_landing_id FROM library_landings WHERE origen_landing_id != ''").all() as { id: string; origen_landing_id: string }[]).map((r) => [r.origen_landing_id, r.id]));
  const rows = db.prepare(`SELECT l.id, l.store_id, l.slug, l.nombre, l.datos, l.estado, l.vistas, l.pedidos, l.updated_at, l.publicada_at, l.modo_codigo, l.plantilla_id, s.nombre AS tienda
    FROM landings l JOIN stores s ON s.id = l.store_id
    WHERE l.store_id != ? ${incluirOcultas ? '' : 'AND COALESCE(s.oculta, 0) = 0'} ORDER BY l.updated_at DESC`).all(MASTER_STORE_ID) as Record<string, unknown>[];
  return rows.map((r) => {
    const d = pj<Partial<LandingDatos>>(txt(r.datos), {});
    return {
      id: txt(r.id), storeId: txt(r.store_id), tienda: txt(r.tienda), nombre: d.nombre || txt(r.nombre), estado: txt(r.estado),
      precio: Number(d.precio) || 0, portada: portada(d), vistas: Number(r.vistas) || 0, pedidos: Number(r.pedidos) || 0,
      updatedAt: txt(r.updated_at), publicadaAt: r.publicada_at ? txt(r.publicada_at) : null,
      modoCodigo: !!r.modo_codigo, conPlantilla: !!txt(r.plantilla_id),
      url: r.estado === 'publicada' ? urlPublicaLanding(txt(r.store_id), txt(r.slug)) : '',
      enBiblioteca: enBiblioteca.get(txt(r.id)) || '',
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
