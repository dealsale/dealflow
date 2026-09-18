import { existsSync, copyFileSync } from 'node:fs';
import { db, uid, j, pj } from './db.js';
import { hashPassword } from './auth.js';
import { mediaPath } from './media.js';

/** Tienda "master" (interna) donde el admin crea productos que viven SOLO en la biblioteca. */
export const MASTER_STORE_ID = '__bibmaster__';
const MASTER_EMAIL = 'biblioteca@dealflow.internal';

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
  /** Nombre de la tienda de origen, para neutralizarlo al importar en otra tienda. */
  origen?: string;
}

/** Nombre de la tienda dueña de un producto (para neutralizarlo al importar). */
function nombreTiendaDeProducto(storeId: string): string {
  const s = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined;
  return (s?.nombre || '').trim();
}

/**
 * Construye el snapshot de un producto. Si `copiarMediaA` está definido, copia su
 * multimedia a ese espacio (para clones que deben sobrevivir a la tienda origen);
 * si no, deja las URLs tal cual (para productos "master" que siguen vivos).
 */
function snapshotDesdeProducto(productId: string, copiarMediaA?: string): { snapshot: Snapshot; row: Record<string, unknown> } | null {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const src = String(row.store_id);
  const variants = db.prepare('SELECT label, stock, fotos, fotos_subidas, orden FROM variants WHERE product_id = ? ORDER BY orden').all(productId) as Record<string, unknown>[];
  const origen = nombreTiendaDeProducto(src);
  if (!copiarMediaA) {
    // Sin copiar: el snapshot referencia la multimedia de la tienda origen (master).
    return { snapshot: { row: { ...row }, variants: variants.map((v) => ({ ...v })), origen }, row };
  }
  const out = copiarMediaA === LIB ? aLib : aStore(copiarMediaA);
  const rowLib: Record<string, unknown> = {
    ...row,
    fotos_subidas: remapUrls(row.fotos_subidas, src, copiarMediaA, out),
    testimonios: remapUrls(row.testimonios, src, copiarMediaA, out),
    videos: remapUrls(row.videos, src, copiarMediaA, out),
    mensaje_bloques: remapBloques(row.mensaje_bloques, src, copiarMediaA, out),
    opciones: remapOpciones(row.opciones, src, copiarMediaA, out),
  };
  const variantsLib = variants.map((v) => ({ ...v, fotos_subidas: remapUrls(v.fotos_subidas, src, copiarMediaA, out) }));
  return { snapshot: { row: rowLib, variants: variantsLib, origen }, row };
}

/**
 * Clona un producto existente de una tienda hacia la biblioteca del admin,
 * copiando su multimedia al espacio de la biblioteca. Devuelve el id creado.
 */
export function agregarProductoABiblioteca(
  productId: string,
  opts: { gratis: boolean; precioImportacion: number; editable?: boolean },
): { id: string } | { error: string } {
  const built = snapshotDesdeProducto(productId, LIB);
  if (!built) return { error: 'Producto no encontrado.' };
  const { snapshot, row } = built;
  const id = uid();
  const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM library_products').get() as { n: number }).n;
  db.prepare(
    `INSERT INTO library_products (id, nombre, precio, gratis, precio_importacion, activo, source_store_id, snapshot, orden, editable)
     VALUES (?,?,?,?,?,1,?,?,?,?)`,
  ).run(id, String(row.nombre), Number(row.precio) || 0, opts.gratis ? 1 : 0, opts.gratis ? 0 : Math.max(0, Math.round(opts.precioImportacion || 0)), LIB, j(snapshot), orden, opts.editable === false ? 0 : 1);
  return { id };
}

/**
 * Crea (si hace falta) la tienda "master" interna de la biblioteca, con un dueño
 * oculto que el admin impersona para editar los productos de la biblioteca con el
 * editor completo. Es idempotente.
 */
export function asegurarMasterStore(): void {
  const existe = db.prepare('SELECT id FROM stores WHERE id = ?').get(MASTER_STORE_ID);
  if (!existe) {
    db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, inicial_pagado, activa, oculta) VALUES (?,?,?, 'Interno', 'activa', 1, 1, 1)")
      .run(MASTER_STORE_ID, 'Biblioteca de productos DealFlow', MASTER_EMAIL);
    db.prepare('INSERT INTO assistants (store_id) VALUES (?)').run(MASTER_STORE_ID);
    try { db.prepare('INSERT INTO whatsapp (store_id) VALUES (?)').run(MASTER_STORE_ID); } catch { /* tabla opcional */ }
  }
  const dueno = db.prepare('SELECT id FROM users WHERE store_id = ?').get(MASTER_STORE_ID);
  if (!dueno) {
    db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)')
      .run(uid(), MASTER_EMAIL, hashPassword(uid() + uid()), 'Biblioteca DealFlow', 'VENDEDOR', MASTER_STORE_ID);
  }
}

/** El dueño (oculto) de la tienda master, para impersonarlo. */
export function duenoMasterStore(): { id: string; email: string; nombre: string; role: string; store_id: string } | undefined {
  return db.prepare('SELECT id, email, nombre, role, store_id FROM users WHERE store_id = ?').get(MASTER_STORE_ID) as
    | { id: string; email: string; nombre: string; role: string; store_id: string }
    | undefined;
}

/**
 * Mantiene la entrada de biblioteca al día con el producto "master" del que nace.
 * Se llama tras crear/editar un producto en la tienda master.
 */
export function sincronizarSnapshotMaster(productId: string): void {
  const built = snapshotDesdeProducto(productId); // sin copiar media: sigue viva en la master
  if (!built) return;
  const { snapshot, row } = built;
  const existing = db.prepare('SELECT id FROM library_products WHERE master_product_id = ?').get(productId) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE library_products SET nombre = ?, precio = ?, snapshot = ? WHERE master_product_id = ?')
      .run(String(row.nombre), Number(row.precio) || 0, j(snapshot), productId);
  } else {
    const id = uid();
    const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM library_products').get() as { n: number }).n;
    // Nace gratis y activo; el admin ajusta gratis/precio/visibilidad desde la lista.
    db.prepare(
      `INSERT INTO library_products (id, nombre, precio, gratis, precio_importacion, activo, source_store_id, snapshot, orden, editable, master_product_id)
       VALUES (?,?,?,1,0,1,?,?,?,1,?)`,
    ).run(id, String(row.nombre), Number(row.precio) || 0, MASTER_STORE_ID, j(snapshot), orden, productId);
  }
}

/** Al borrar un producto master, quita su entrada de la biblioteca. */
export function eliminarLibraryDeMaster(productId: string): void {
  db.prepare('DELETE FROM library_products WHERE master_product_id = ?').run(productId);
}

/** Clona un producto de la biblioteca dentro de una tienda cliente (copiando su multimedia). */
export function importarLibraryEnTienda(libId: string, storeId: string, pagado: boolean): { productId: string } | { error: string } {
  const lib = db.prepare('SELECT id, snapshot, source_store_id FROM library_products WHERE id = ?').get(libId) as { id: string; snapshot: string; source_store_id: string } | undefined;
  if (!lib) return { error: 'Producto de biblioteca no encontrado.' };
  const snap = pj<Snapshot>(lib.snapshot, { row: {}, variants: [] });
  const row = snap.row || {};
  if (!row.nombre) return { error: 'Este producto de la biblioteca está incompleto.' };

  // Neutraliza el nombre de la tienda de ORIGEN en los textos: si el producto traía
  // "Bienvenido a Tienda A" y lo importa la Tienda B, se reemplaza por "Tienda B".
  // Así no se filtra información de otra tienda dentro del mensaje inicial/estructura.
  const destinoNombre = nombreTiendaDeProducto(storeId);
  const origenNombre = (snap.origen || '').trim();
  if (origenNombre && destinoNombre && origenNombre.toLowerCase() !== destinoNombre.toLowerCase()) {
    const re = new RegExp(origenNombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const CAMPOS = ['nombre', 'descripcion', 'caracteristicas', 'mensaje_inicial', 'faqs', 'reglas', 'mensaje_bloques', 'contenido_paquete', 'modos_uso', 'disparador', 'opciones'];
    for (const k of CAMPOS) if (typeof row[k] === 'string') row[k] = (row[k] as string).replace(re, destinoNombre);
  }

  // Espacio de media de origen: LIB para clones, la tienda master para los creados por el admin.
  const src = lib.source_store_id || LIB;
  const out = aStore(storeId);
  const pid = uid();
  db.prepare(
    `INSERT INTO products (id, store_id, plantilla_id, nombre, precio, color, txt, reglas, fotos, fotos_subidas, descripcion, caracteristicas, mensaje_inicial, faqs, testimonios, modos_uso, videos, mensaje_bloques, bundles, opciones, contenido_paquete, disparador, mensaje_inicial_activo, tipo, duracion, sku)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    pid, storeId, '', row.nombre, Number(row.precio) || 0, row.color || '#E0E7FF', row.txt || '#4338CA',
    (row.reglas as string) || '[]', (row.fotos as string) || '[]', remapUrls(row.fotos_subidas, src, storeId, out),
    row.descripcion || '', row.caracteristicas || '', row.mensaje_inicial || '', (row.faqs as string) || '[]',
    remapUrls(row.testimonios, src, storeId, out), row.modos_uso || '', remapUrls(row.videos, src, storeId, out),
    remapBloques(row.mensaje_bloques, src, storeId, out), (row.bundles as string) || '[]', remapOpciones(row.opciones, src, storeId, out),
    row.contenido_paquete || '', row.disparador || '', row.mensaje_inicial_activo == null ? 1 : row.mensaje_inicial_activo,
    row.tipo || 'producto', row.duracion || '', row.sku || '',
  );
  const variants = Array.isArray(snap.variants) ? snap.variants : [];
  if (variants.length) {
    for (const v of variants) {
      db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, fotos_subidas, orden) VALUES (?,?,?,?,?,?,?)')
        .run(uid(), pid, v.label || 'Única', 0, v.fotos || 0, remapUrls(v.fotos_subidas, src, storeId, out), v.orden || 0);
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

/**
 * ¿Este producto tiene la ESTRUCTURA bloqueada (no editable)?
 *
 * ENFORCEMENT DESACTIVADO A PROPÓSITO: hoy NADA se bloquea, para GARANTIZAR que
 * las ediciones de cada tienda siempre se guarden y el bot use la estructura
 * editada de cada tienda (multitienda). El flag `editable` de la biblioteca se
 * sigue guardando para reactivar el bloqueo en el futuro, pero no se aplica aún.
 */
export function esImportBloqueado(_productId: string): boolean {
  return false;
}

/** Ids de productos con estructura bloqueada. Enforcement desactivado: ninguno. */
export function productosBloqueados(_storeId: string): Set<string> {
  return new Set();
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
  const rows = db.prepare('SELECT id, nombre, precio, gratis, precio_importacion, activo, editable, snapshot, created_at FROM library_products ORDER BY orden, created_at').all() as
    { id: string; nombre: string; precio: number; gratis: number; precio_importacion: number; activo: number; editable: number; snapshot: string; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    precio: r.precio,
    gratis: !!r.gratis,
    precioImportacion: r.precio_importacion,
    activo: !!r.activo,
    editable: r.editable !== 0,
    portada: portada(r.snapshot),
    importos: (db.prepare('SELECT COUNT(*) n FROM library_imports WHERE library_product_id = ?').get(r.id) as { n: number }).n,
  }));
}

export function actualizarLibraryProduct(id: string, patch: { nombre?: string; gratis?: boolean; precioImportacion?: number; activo?: boolean; editable?: boolean }): { ok: boolean } {
  const lib = db.prepare('SELECT id FROM library_products WHERE id = ?').get(id) as { id: string } | undefined;
  if (!lib) return { ok: false };
  if (typeof patch.nombre === 'string') db.prepare('UPDATE library_products SET nombre = ? WHERE id = ?').run(patch.nombre.trim() || 'Producto', id);
  if (typeof patch.gratis === 'boolean') db.prepare('UPDATE library_products SET gratis = ? WHERE id = ?').run(patch.gratis ? 1 : 0, id);
  if (typeof patch.precioImportacion === 'number') db.prepare('UPDATE library_products SET precio_importacion = ? WHERE id = ?').run(Math.max(0, Math.round(patch.precioImportacion)), id);
  if (typeof patch.activo === 'boolean') db.prepare('UPDATE library_products SET activo = ? WHERE id = ?').run(patch.activo ? 1 : 0, id);
  if (typeof patch.editable === 'boolean') db.prepare('UPDATE library_products SET editable = ? WHERE id = ?').run(patch.editable ? 1 : 0, id);
  return { ok: true };
}

export function eliminarLibraryProduct(id: string): { ok: boolean } {
  // Si nació como producto "master" (creado por el admin), borramos también ese producto.
  const lib = db.prepare('SELECT master_product_id FROM library_products WHERE id = ?').get(id) as { master_product_id: string } | undefined;
  if (lib?.master_product_id) {
    db.prepare('DELETE FROM variants WHERE product_id = ?').run(lib.master_product_id);
    db.prepare('DELETE FROM products WHERE id = ?').run(lib.master_product_id);
  }
  db.prepare('DELETE FROM library_products WHERE id = ?').run(id);
  return { ok: true };
}
