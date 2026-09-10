import { existsSync, copyFileSync } from 'node:fs';
import { db, uid, j, pj } from './db.js';
import { mediaPath } from './media.js';

/**
 * Biblioteca de productos del administrador.
 *
 * El superadmin clona un producto real de una tienda hacia la biblioteca; ahí
 * queda un "snapshot" completo (reglas, fotos, estructura, combos, opciones…).
 * Cada tienda cliente puede importar esos productos: unos gratis, otros con un
 * pago único. La multimedia de la biblioteca vive en un espacio propio
 * (__biblioteca__) para no depender de que la tienda origen siga existiendo.
 */

const LIB = '__biblioteca__'; // "tienda" sintética donde viven los archivos de la biblioteca
const aLib = (file: string) => `/api/library/media/${file}`;
const aStore = (storeId: string) => (file: string) => `/api/media/${storeId}/${file}`;

/** Copia un archivo de media entre espacios y devuelve la nueva URL (o la misma si no aplica). */
function copiarArchivo(url: unknown, srcStore: string, dstStore: string, outUrl: (f: string) => string): unknown {
  if (typeof url !== 'string') return url;
  const m = url.match(/\/api\/(?:media\/[^/]+|library\/media)\/([^/?#]+)/);
  if (!m) return url; // data: URL u otra cosa → tal cual
  const file = m[1];
  const src = mediaPath(srcStore, file);
  if (!existsSync(src)) return url;
  const ext = file.includes('.') ? file.split('.').pop() : 'bin';
  const nuevo = uid() + '.' + ext;
  try { copyFileSync(src, mediaPath(dstStore, nuevo)); } catch { return url; }
  return outUrl(nuevo);
}

const remapUrls = (str: unknown, src: string, dst: string, outUrl: (f: string) => string) =>
  j(pj<string[]>(str as string, []).map((u) => copiarArchivo(u, src, dst, outUrl)));

const remapBloques = (str: unknown, src: string, dst: string, outUrl: (f: string) => string) =>
  j(pj<{ tipo: string; valor?: string; valores?: string[] }[]>(str as string, []).map((b) => {
    if (b.tipo === 'texto') return b;
    const out: { tipo: string; valor?: string; valores?: string[] } = { ...b };
    if (Array.isArray(b.valores)) out.valores = b.valores.map((u) => copiarArchivo(u, src, dst, outUrl) as string);
    if (typeof b.valor === 'string') out.valor = copiarArchivo(b.valor, src, dst, outUrl) as string;
    return out;
  }));

// A diferencia de las plantillas, la biblioteca SÍ conserva la foto de cada
// opción (Color Negro con su foto, etc.), copiándola al espacio destino.
const remapOpciones = (str: unknown, src: string, dst: string, outUrl: (f: string) => string) =>
  j(pj<{ nombre: string; valores: (string | { valor: string; foto?: string })[] }[]>(str as string, []).map((o) => ({
    ...o,
    valores: (o.valores || []).map((v) => {
      if (typeof v === 'string') return { valor: v };
      return v.foto ? { valor: v.valor, foto: copiarArchivo(v.foto, src, dst, outUrl) as string } : { valor: v.valor };
    }),
  })));

interface Snapshot {
  row: Record<string, unknown>;
  variants: Record<string, unknown>[];
}

/**
 * Clona un producto existente de una tienda hacia la biblioteca del admin,
 * copiando su multimedia al espacio de la biblioteca. Devuelve el id creado.
 */
export function agregarProductoABiblioteca(
  productId: string,
  opts: { gratis: boolean; precioImportacion: number },
): { id: string } | { error: string } {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown> | undefined;
  if (!row) return { error: 'Producto no encontrado.' };
  const src = String(row.store_id);
  const variants = db.prepare('SELECT label, stock, fotos, fotos_subidas, orden FROM variants WHERE product_id = ? ORDER BY orden').all(productId) as Record<string, unknown>[];

  // Copiamos la multimedia del producto (tienda origen → biblioteca).
  const rowLib: Record<string, unknown> = {
    ...row,
    fotos_subidas: remapUrls(row.fotos_subidas, src, LIB, aLib),
    testimonios: remapUrls(row.testimonios, src, LIB, aLib),
    videos: remapUrls(row.videos, src, LIB, aLib),
    mensaje_bloques: remapBloques(row.mensaje_bloques, src, LIB, aLib),
    opciones: remapOpciones(row.opciones, src, LIB, aLib),
  };
  const variantsLib = variants.map((v) => ({ ...v, fotos_subidas: remapUrls(v.fotos_subidas, src, LIB, aLib) }));
  const snapshot: Snapshot = { row: rowLib, variants: variantsLib };

  const id = uid();
  const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM library_products').get() as { n: number }).n;
  db.prepare(
    `INSERT INTO library_products (id, nombre, precio, gratis, precio_importacion, activo, source_store_id, snapshot, orden)
     VALUES (?,?,?,?,?,1,?,?,?)`,
  ).run(id, String(row.nombre), Number(row.precio) || 0, opts.gratis ? 1 : 0, opts.gratis ? 0 : Math.max(0, Math.round(opts.precioImportacion || 0)), LIB, j(snapshot), orden);
  return { id };
}

/** Clona un producto de la biblioteca dentro de una tienda cliente (copiando su multimedia). */
export function importarLibraryEnTienda(libId: string, storeId: string, pagado: boolean): { productId: string } | { error: string } {
  const lib = db.prepare('SELECT id, snapshot FROM library_products WHERE id = ?').get(libId) as { id: string; snapshot: string } | undefined;
  if (!lib) return { error: 'Producto de biblioteca no encontrado.' };
  const snap = pj<Snapshot>(lib.snapshot, { row: {}, variants: [] });
  const row = snap.row || {};
  if (!row.nombre) return { error: 'Este producto de la biblioteca está incompleto.' };

  const out = aStore(storeId);
  const pid = uid();
  db.prepare(
    `INSERT INTO products (id, store_id, plantilla_id, nombre, precio, color, txt, reglas, fotos, fotos_subidas, descripcion, caracteristicas, mensaje_inicial, faqs, testimonios, modos_uso, videos, mensaje_bloques, bundles, opciones, contenido_paquete, disparador, mensaje_inicial_activo, tipo, duracion, sku)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    pid, storeId, '', row.nombre, Number(row.precio) || 0, row.color || '#E0E7FF', row.txt || '#4338CA',
    (row.reglas as string) || '[]', (row.fotos as string) || '[]', remapUrls(row.fotos_subidas, LIB, storeId, out),
    row.descripcion || '', row.caracteristicas || '', row.mensaje_inicial || '', (row.faqs as string) || '[]',
    remapUrls(row.testimonios, LIB, storeId, out), row.modos_uso || '', remapUrls(row.videos, LIB, storeId, out),
    remapBloques(row.mensaje_bloques, LIB, storeId, out), (row.bundles as string) || '[]', remapOpciones(row.opciones, LIB, storeId, out),
    row.contenido_paquete || '', row.disparador || '', row.mensaje_inicial_activo == null ? 1 : row.mensaje_inicial_activo,
    row.tipo || 'producto', row.duracion || '', row.sku || '',
  );
  const variants = Array.isArray(snap.variants) ? snap.variants : [];
  if (variants.length) {
    for (const v of variants) {
      db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, fotos_subidas, orden) VALUES (?,?,?,?,?,?,?)')
        .run(uid(), pid, v.label || 'Única', 0, v.fotos || 0, remapUrls(v.fotos_subidas, LIB, storeId, out), v.orden || 0);
    }
  } else {
    db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos) VALUES (?,?,?,?,0)').run(uid(), pid, 'Única', 0);
  }

  db.prepare(
    `INSERT INTO library_imports (id, store_id, library_product_id, product_id, pagado) VALUES (?,?,?,?,?)
     ON CONFLICT(store_id, library_product_id) DO UPDATE SET product_id = excluded.product_id, pagado = MAX(library_imports.pagado, excluded.pagado)`,
  ).run(uid(), storeId, libId, pid, pagado ? 1 : 0);
  return { productId: pid };
}

/** ¿La tienda ya adquirió (gratis o pagó) este producto de la biblioteca? */
export function yaAdquirido(storeId: string, libId: string): boolean {
  return !!db.prepare('SELECT 1 FROM library_imports WHERE store_id = ? AND library_product_id = ?').get(storeId, libId);
}

export function getLibraryProduct(libId: string) {
  return db.prepare('SELECT id, nombre, precio, gratis, precio_importacion, activo FROM library_products WHERE id = ?').get(libId) as
    | { id: string; nombre: string; precio: number; gratis: number; precio_importacion: number; activo: number }
    | undefined;
}

/** Vista previa (nombre + primera foto) de un snapshot de biblioteca. */
function portada(snapshot: string): string | null {
  const snap = pj<Snapshot>(snapshot, { row: {}, variants: [] });
  const fotos = pj<string[]>((snap.row?.fotos_subidas as string) || '[]', []);
  if (fotos.length) return fotos[0];
  const bloque = pj<{ tipo: string; valor?: string; valores?: string[] }[]>((snap.row?.mensaje_bloques as string) || '[]', []).find((b) => b.tipo === 'imagen');
  return bloque?.valores?.[0] || bloque?.valor || null;
}

/** Lista la biblioteca para una tienda cliente (solo activos), con estado de adquisición. */
export function listarBiblioteca(storeId: string) {
  const rows = db.prepare('SELECT id, nombre, precio, gratis, precio_importacion, snapshot FROM library_products WHERE activo = 1 ORDER BY orden, created_at').all() as
    { id: string; nombre: string; precio: number; gratis: number; precio_importacion: number; snapshot: string }[];
  const mios = new Set((db.prepare('SELECT library_product_id FROM library_imports WHERE store_id = ?').all(storeId) as { library_product_id: string }[]).map((r) => r.library_product_id));
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    precio: r.precio,
    gratis: !!r.gratis,
    precioImportacion: r.precio_importacion,
    portada: portada(r.snapshot),
    adquirido: mios.has(r.id),
  }));
}

/** Lista la biblioteca completa para el superadmin. */
export function listarBibliotecaAdmin() {
  const rows = db.prepare('SELECT id, nombre, precio, gratis, precio_importacion, activo, snapshot, created_at FROM library_products ORDER BY orden, created_at').all() as
    { id: string; nombre: string; precio: number; gratis: number; precio_importacion: number; activo: number; snapshot: string; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    precio: r.precio,
    gratis: !!r.gratis,
    precioImportacion: r.precio_importacion,
    activo: !!r.activo,
    portada: portada(r.snapshot),
    importos: (db.prepare('SELECT COUNT(*) n FROM library_imports WHERE library_product_id = ?').get(r.id) as { n: number }).n,
  }));
}

export function actualizarLibraryProduct(id: string, patch: { nombre?: string; gratis?: boolean; precioImportacion?: number; activo?: boolean }): { ok: boolean } {
  const lib = db.prepare('SELECT id FROM library_products WHERE id = ?').get(id) as { id: string } | undefined;
  if (!lib) return { ok: false };
  if (typeof patch.nombre === 'string') db.prepare('UPDATE library_products SET nombre = ? WHERE id = ?').run(patch.nombre.trim() || 'Producto', id);
  if (typeof patch.gratis === 'boolean') db.prepare('UPDATE library_products SET gratis = ? WHERE id = ?').run(patch.gratis ? 1 : 0, id);
  if (typeof patch.precioImportacion === 'number') db.prepare('UPDATE library_products SET precio_importacion = ? WHERE id = ?').run(Math.max(0, Math.round(patch.precioImportacion)), id);
  if (typeof patch.activo === 'boolean') db.prepare('UPDATE library_products SET activo = ? WHERE id = ?').run(patch.activo ? 1 : 0, id);
  return { ok: true };
}

export function eliminarLibraryProduct(id: string): { ok: boolean } {
  db.prepare('DELETE FROM library_products WHERE id = ?').run(id);
  return { ok: true };
}
