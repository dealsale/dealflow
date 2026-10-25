/**
 * Creador de landings: una página de aterrizaje por producto (estilo de las tiendas
 * de dropshipping en Shopify: galería, variantes, ofertas por cantidad, formulario
 * contra entrega, imágenes largas y testimonios estilo Facebook).
 *
 *  - Cada tienda crea las que quiera como borrador. Publicar la PRIMERA es gratis
 *    (cantidad configurable por el equipo DealFlow); de ahí en adelante cada landing
 *    nueva se paga UNA vez (Wompi) y queda suya para siempre, sin mensualidad.
 *  - Se sirve en https://app.dealflow.sbs/l/<tienda>/<landing>.
 *  - El formulario crea el pedido en DealFlow (origen "landing") y, si está activo,
 *    le envía al cliente la confirmación por WhatsApp (Sí / No).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { db, pj, uid, registrarLog, DATA_DIR } from './db.js';
import { slugTienda, BASE_TIENDA } from './tiendaPublica.js';
import { trazar } from './trazabilidad.js';
import { idsDeItem } from './emparejar.js';
import { mediaPath } from './media.js';

db.exec(`CREATE TABLE IF NOT EXISTS landings (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  nombre TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  datos TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'borrador',
  desbloqueada INTEGER NOT NULL DEFAULT 0,
  modo TEXT NOT NULL DEFAULT '',
  vistas INTEGER NOT NULL DEFAULT 0,
  pedidos INTEGER NOT NULL DEFAULT 0,
  publicada_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_landings_slug ON landings(store_id, slug)');
db.exec('CREATE TABLE IF NOT EXISTS landings_ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
try { db.exec("ALTER TABLE orders ADD COLUMN landing_id TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
// El superadmin decide qué tiendas pueden usar el Creador de landings.
try { db.exec('ALTER TABLE stores ADD COLUMN landings_habilitado INTEGER NOT NULL DEFAULT 0'); } catch { /* ya existe */ }

export const landingsHabilitadas = (storeId: string) =>
  !!(db.prepare('SELECT landings_habilitado FROM stores WHERE id = ?').get(storeId) as { landings_habilitado: number } | undefined)?.landings_habilitado;
export function habilitarLandings(storeId: string, si: boolean): boolean {
  return db.prepare('UPDATE stores SET landings_habilitado = ? WHERE id = ?').run(si ? 1 : 0, storeId).changes > 0;
}
/** Tiendas con su permiso y cuántas landings tienen (para el menú del superadmin). */
export function tiendasLandings(): { id: string; tienda: string; correo: string; plan: string; activa: boolean; habilitado: boolean; landings: number; publicadas: number; pedidos: number }[] {
  return (db.prepare(`SELECT s.id, s.nombre, s.correo, s.plan, s.activa, s.landings_habilitado,
      (SELECT COUNT(*) FROM landings l WHERE l.store_id = s.id) n,
      (SELECT COUNT(*) FROM landings l WHERE l.store_id = s.id AND l.estado = 'publicada') pub,
      (SELECT COALESCE(SUM(pedidos),0) FROM landings l WHERE l.store_id = s.id) ped
    FROM stores s WHERE COALESCE(s.oculta,0) = 0 ORDER BY s.landings_habilitado DESC, s.nombre COLLATE NOCASE`).all() as Fila[])
    .map((r) => ({ id: txt(r.id), tienda: txt(r.nombre), correo: txt(r.correo), plan: txt(r.plan), activa: !!r.activa, habilitado: !!r.landings_habilitado, landings: num(r.n), publicadas: num(r.pub), pedidos: num(r.ped) }));
}

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const esc = (s: unknown) => txt(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const slugify = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'producto';

// ── Ajustes del equipo DealFlow ─────────────────────────────────────────
export interface AjustesLandings { precio: number; gratis: number }
export function ajustesLandings(): AjustesLandings {
  const g = (k: string, d: number) => num((db.prepare('SELECT valor FROM landings_ajustes WHERE clave = ?').get(k) as { valor: string } | undefined)?.valor, d);
  return { precio: Math.max(0, Math.round(g('precio', 49900))), gratis: Math.max(0, Math.round(g('gratis', 1))) };
}
export function guardarAjustesLandings(p: Partial<AjustesLandings>): AjustesLandings {
  const up = db.prepare('INSERT INTO landings_ajustes (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  if (p.precio !== undefined) up.run('precio', String(Math.max(0, Math.round(num(p.precio)))));
  if (p.gratis !== undefined) up.run('gratis', String(Math.max(0, Math.min(50, Math.round(num(p.gratis))))));
  return ajustesLandings();
}

/** Cuántas landings gratis le quedan a la tienda y cuánto cuesta una nueva. */
export function cuotaLandings(storeId: string): { gratisTotal: number; gratisUsadas: number; gratisRestantes: number; precio: number } {
  const a = ajustesLandings();
  const usadas = (db.prepare("SELECT COUNT(*) n FROM landings WHERE store_id = ? AND modo = 'gratis'").get(storeId) as { n: number }).n;
  return { gratisTotal: a.gratis, gratisUsadas: usadas, gratisRestantes: Math.max(0, a.gratis - usadas), precio: a.precio };
}

// ── Datos de una landing ───────────────────────────────────────────────
export interface OpcionL { nombre: string; valores: { valor: string; foto: string }[] }
export interface BundleL { cantidad: number; titulo: string; subtitulo: string; precio: number; precioAntes: number; insignia: string; imagen: string }
export interface TestimonioL { autor: string; avatar: string; tiempo: string; texto: string; imagen: string; reacciones: string }
export interface LandingDatos {
  nombre: string;
  precio: number;
  precioAntes: number;
  calificacion: number;
  resenas: string;
  destacado: string;
  anuncio: string;
  bannerSuperior: string;
  galeria: string[];
  opciones: OpcionL[];
  tituloOfertas: string;
  bundles: BundleL[];
  bundleInicial: number;
  boton: string;
  beneficios: string[];
  descripcion: string;
  envioMin: number;
  envioMax: number;
  imagenes: string[];
  tituloTestimonios: string;
  testimonios: TestimonioL[];
  colorPrincipal: string;
  colorBoton: string;
  logo: string;
  nombreTienda: string;
  whatsapp: string;
  pixelMeta: string;
  confirmarWhatsapp: boolean;
  autoDespacho: boolean;
  pedirCorreo: boolean;
  gracias: string;
}

const color = (v: unknown, d: string) => (/^#[0-9a-f]{3,8}$/i.test(txt(v).trim()) ? txt(v).trim() : d);
const url = (v: unknown) => { const s = txt(v).trim(); return /^(https?:\/\/|\/l\/media\/)/i.test(s) ? s.slice(0, 600) : ''; };
const corto = (v: unknown, n: number) => txt(v).replace(/\s+/g, ' ').trim().slice(0, n);
const largo = (v: unknown, n: number) => txt(v).replace(/\r/g, '').slice(0, n);

/** Normaliza lo que manda el editor (nada sale de aquí sin límite ni tipo). */
export function limpiarDatos(raw: unknown): LandingDatos {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Fila;
  const arr = <T>(v: unknown, n: number, f: (x: Fila) => T) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => f((x && typeof x === 'object' ? x : {}) as Fila));
  const bundles = arr(r.bundles, 6, (b) => ({
    cantidad: Math.max(1, Math.min(20, Math.round(num(b.cantidad, 1)))), titulo: corto(b.titulo, 60), subtitulo: corto(b.subtitulo, 90),
    precio: Math.max(0, Math.round(num(b.precio))), precioAntes: Math.max(0, Math.round(num(b.precioAntes))), insignia: corto(b.insignia, 30), imagen: url(b.imagen),
  })).filter((b) => b.precio > 0);
  return {
    nombre: corto(r.nombre, 120) || 'Producto',
    precio: Math.max(0, Math.round(num(r.precio))),
    precioAntes: Math.max(0, Math.round(num(r.precioAntes))),
    calificacion: Math.max(0, Math.min(5, num(r.calificacion, 4.8))),
    resenas: corto(r.resenas, 60),
    destacado: corto(r.destacado, 140),
    anuncio: corto(r.anuncio, 120),
    bannerSuperior: url(r.bannerSuperior),
    galeria: (Array.isArray(r.galeria) ? r.galeria : []).map(url).filter(Boolean).slice(0, 15),
    opciones: arr(r.opciones, 3, (o) => ({ nombre: corto(o.nombre, 30), valores: arr(o.valores, 30, (v) => ({ valor: corto(v.valor, 40), foto: url(v.foto) })).filter((v) => v.valor) }))
      .filter((o) => o.nombre && o.valores.length),
    tituloOfertas: corto(r.tituloOfertas, 60),
    bundles,
    bundleInicial: Math.max(0, Math.min(bundles.length - 1, Math.round(num(r.bundleInicial)))),
    boton: corto(r.boton, 60) || 'PEDIR AHORA · PAGO CONTRA ENTREGA',
    beneficios: (Array.isArray(r.beneficios) ? r.beneficios : []).map((x) => corto(x, 50)).filter(Boolean).slice(0, 6),
    descripcion: largo(r.descripcion, 6000),
    envioMin: Math.max(0, Math.min(60, Math.round(num(r.envioMin, 2)))),
    envioMax: Math.max(0, Math.min(60, Math.round(num(r.envioMax, 5)))),
    imagenes: (Array.isArray(r.imagenes) ? r.imagenes : []).map(url).filter(Boolean).slice(0, 30),
    tituloTestimonios: corto(r.tituloTestimonios, 80),
    testimonios: arr(r.testimonios, 20, (t) => ({ autor: corto(t.autor, 50), avatar: url(t.avatar), tiempo: corto(t.tiempo, 30), texto: largo(t.texto, 700), imagen: url(t.imagen), reacciones: corto(t.reacciones, 10) }))
      .filter((t) => t.autor || t.texto),
    colorPrincipal: color(r.colorPrincipal, '#121212'),
    colorBoton: color(r.colorBoton, '#f01111'),
    logo: url(r.logo),
    nombreTienda: corto(r.nombreTienda, 60),
    whatsapp: txt(r.whatsapp).replace(/\D/g, '').slice(0, 15),
    pixelMeta: txt(r.pixelMeta).replace(/\D/g, '').slice(0, 20),
    confirmarWhatsapp: r.confirmarWhatsapp !== false,
    autoDespacho: r.autoDespacho === true,
    pedirCorreo: r.pedirCorreo === true,
    gracias: largo(r.gracias, 400),
  };
}

// ── Archivos públicos de las landings ──────────────────────────────────
const dirMedia = (storeId: string) => { const d = path.resolve(DATA_DIR, 'landings-media', storeId.replace(/[^a-zA-Z0-9_-]/g, '')); mkdirSync(d, { recursive: true }); return d; };
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export function archivoPublico(storeId: string, file: string): string | null {
  const f = path.basename(file);
  if (!/^[a-z0-9_-]+\.(jpg|png|webp|gif)$/i.test(f)) return null;
  const p = path.join(dirMedia(storeId), f);
  return existsSync(p) ? p : null;
}
function guardarPublico(storeId: string, buf: Buffer, mime: string): string {
  const ext = EXT[mime] || 'jpg';
  const file = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}.${ext}`;
  writeFileSync(path.join(dirMedia(storeId), file), buf);
  return `/l/media/${storeId}/${file}`;
}
/** Sube una imagen (data URL) para la landing. */
export function subirImagen(storeId: string, dataUrl: string): { url: string } | { error: string } {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'Sube una imagen JPG, PNG, WEBP o GIF.' };
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 10 * 1024 * 1024) return { error: 'La imagen pesa más de 10 MB.' };
  return { url: guardarPublico(storeId, buf, m[1]) };
}
/** Foto del producto (privada, /api/media/… o data URL) → copia pública para la landing. */
function hacerPublica(storeId: string, src: string): string {
  try {
    if (src.startsWith('data:')) { const r = subirImagen(storeId, src); return 'url' in r ? r.url : ''; }
    const m = /^\/api\/media\/([^/]+)\/([^/?#]+)/.exec(src);
    if (m && m[1] === storeId) {
      const p = mediaPath(storeId, decodeURIComponent(m[2]));
      if (!existsSync(p)) return '';
      const ext = path.extname(p).slice(1).toLowerCase().replace('jpeg', 'jpg');
      if (!['jpg', 'png', 'webp', 'gif'].includes(ext)) return '';
      return guardarPublico(storeId, readFileSync(p), ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
    }
    return /^https?:\/\//.test(src) ? src : '';
  } catch { return ''; }
}

/** Arranque de la landing con lo que ya hay en el producto (nombre, precio, fotos, variantes, combos). */
function datosDesdeProducto(storeId: string, productId: string): Partial<LandingDatos> {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(productId, storeId) as Fila | undefined;
  if (!p) return {};
  const fotos = (pj<string[]>(txt(p.fotos_subidas), []) || []).slice(0, 8).map((f) => hacerPublica(storeId, f)).filter(Boolean);
  const precioBase = num(p.precio_promo) > 0 ? num(p.precio_promo) : num(p.precio);
  const opciones = (pj<{ nombre: string; valores: { valor: string; foto?: string }[] }[]>(txt(p.opciones), []) || []).slice(0, 3)
    .map((o) => ({ nombre: o.nombre, valores: (o.valores || []).map((v) => ({ valor: v.valor, foto: v.foto ? hacerPublica(storeId, v.foto) : '' })) }));
  const combos = (pj<{ cantidad: number; precio: number; etiqueta?: string }[]>(txt(p.bundles), []) || []).filter((b) => num(b.cantidad) > 1 && num(b.precio) > 0);
  const antesUno = num(p.precio) > precioBase ? num(p.precio) : Math.round(precioBase * 1.6 / 1000) * 1000;
  const bundles: BundleL[] = precioBase > 0 ? [{ cantidad: 1, titulo: '1 unidad', subtitulo: 'Precio normal', precio: precioBase, precioAntes: antesUno, insignia: '', imagen: '' }] : [];
  for (const b of combos.slice(0, 3)) {
    const antes = antesUno * num(b.cantidad);
    bundles.push({ cantidad: num(b.cantidad), titulo: b.etiqueta || `Lleva ${b.cantidad}`, subtitulo: precioBase * num(b.cantidad) > num(b.precio) ? `Ahorras ${pesos(precioBase * num(b.cantidad) - num(b.precio))}` : '', precio: num(b.precio), precioAntes: antes > num(b.precio) ? antes : 0, insignia: bundles.length === 1 ? 'MÁS VENDIDO' : 'MEJOR PRECIO', imagen: '' });
  }
  return {
    nombre: txt(p.nombre), precio: precioBase, precioAntes: antesUno,
    galeria: fotos, opciones, bundles, bundleInicial: bundles.length > 1 ? 1 : 0,
    descripcion: [txt(p.descripcion), txt(p.caracteristicas)].filter((x) => x.trim()).join('\n\n'),
  };
}

function plantillaInicial(storeId: string, productId: string): LandingDatos {
  const tienda = db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined;
  return limpiarDatos({
    calificacion: 4.9, resenas: '+1.200 clientes felices', destacado: 'Calidad premium | Garantía de satisfacción',
    anuncio: '🚚 ENVÍO GRATIS + PAGO CONTRA ENTREGA EN TODA COLOMBIA',
    tituloOfertas: '¡Aprovecha nuestras ofertas!', beneficios: ['🚚 Envío gratis', '💵 Pago contra entrega', '🔒 Compra 100% segura'],
    envioMin: 2, envioMax: 5, tituloTestimonios: 'Lo que dicen nuestros clientes',
    testimonios: [
      { autor: 'Camila Sánchez', tiempo: 'Hace 2 días', texto: 'Me llegó súper rápido y la calidad es increíble. ¡Totalmente recomendado! 😍', reacciones: '39' },
      { autor: 'Laura Gómez', tiempo: 'Hace 4 días', texto: 'Pagué cuando me llegó, todo perfecto. Ya pedí el segundo.', reacciones: '21' },
    ],
    nombreTienda: tienda?.nombre || '', confirmarWhatsapp: true,
    gracias: '¡Gracias por tu compra! En unos minutos te escribimos por WhatsApp para confirmar tu pedido.',
    ...(productId ? datosDesdeProducto(storeId, productId) : {}),
  });
}

// ── CRUD ───────────────────────────────────────────────────────────────
export interface LandingFila { id: string; slug: string; nombre: string; productId: string; estado: string; desbloqueada: boolean; modo: string; vistas: number; pedidos: number; url: string; publicadaAt: string | null; updatedAt: string }
function aFila(r: Fila): LandingFila {
  const t = slugTienda(txt(r.store_id));
  return {
    id: txt(r.id), slug: txt(r.slug), nombre: txt(r.nombre), productId: txt(r.product_id), estado: txt(r.estado), desbloqueada: !!r.desbloqueada, modo: txt(r.modo),
    vistas: num(r.vistas), pedidos: num(r.pedidos), url: `${BASE_TIENDA}/l/${t}/${txt(r.slug)}`, publicadaAt: (r.publicada_at as string) || null, updatedAt: txt(r.updated_at),
  };
}
export function listarLandings(storeId: string): LandingFila[] {
  return (db.prepare('SELECT * FROM landings WHERE store_id = ? ORDER BY updated_at DESC').all(storeId) as Fila[]).map(aFila);
}
export function verLanding(storeId: string, id: string): (LandingFila & { datos: LandingDatos }) | null {
  const r = db.prepare('SELECT * FROM landings WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  return r ? { ...aFila(r), datos: limpiarDatos(pj(txt(r.datos), {})) } : null;
}
function slugLibre(storeId: string, base: string, excepto = ''): string {
  let s = slugify(base);
  for (let n = 2; db.prepare('SELECT 1 FROM landings WHERE store_id = ? AND slug = ? AND id != ?').get(storeId, s, excepto); n++) s = `${slugify(base)}-${n}`;
  return s;
}
export function crearLanding(storeId: string, nombre: string, productId = ''): LandingFila & { datos: LandingDatos } {
  const pid = productId && db.prepare('SELECT 1 FROM products WHERE id = ? AND store_id = ?').get(productId, storeId) ? productId : '';
  const datos = plantillaInicial(storeId, pid);
  if (nombre.trim()) datos.nombre = corto(nombre, 120);
  const id = uid();
  db.prepare('INSERT INTO landings (id, store_id, slug, nombre, product_id, datos) VALUES (?,?,?,?,?,?)')
    .run(id, storeId, slugLibre(storeId, datos.nombre), datos.nombre, pid, JSON.stringify(datos));
  return verLanding(storeId, id)!;
}
export function guardarLanding(storeId: string, id: string, b: { datos?: unknown; slug?: string; productId?: string }): (LandingFila & { datos: LandingDatos }) | { error: string } {
  const r = db.prepare('SELECT id FROM landings WHERE id = ? AND store_id = ?').get(id, storeId);
  if (!r) return { error: 'Landing no encontrada.' };
  if (b.datos !== undefined) {
    const d = limpiarDatos(b.datos);
    db.prepare("UPDATE landings SET datos = ?, nombre = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(d), d.nombre, id);
  }
  if (b.slug !== undefined) {
    const s = slugify(b.slug);
    if (db.prepare('SELECT 1 FROM landings WHERE store_id = ? AND slug = ? AND id != ?').get(storeId, s, id)) return { error: `Ya tienes otra landing con la dirección "${s}".` };
    db.prepare("UPDATE landings SET slug = ?, updated_at = datetime('now') WHERE id = ?").run(s, id);
  }
  if (b.productId !== undefined) {
    const pid = b.productId && db.prepare('SELECT 1 FROM products WHERE id = ? AND store_id = ?').get(b.productId, storeId) ? b.productId : '';
    db.prepare('UPDATE landings SET product_id = ? WHERE id = ?').run(pid, id);
  }
  return verLanding(storeId, id)!;
}
export function borrarLanding(storeId: string, id: string): boolean {
  return db.prepare('DELETE FROM landings WHERE id = ? AND store_id = ?').run(id, storeId).changes > 0;
}
export function duplicarLanding(storeId: string, id: string): (LandingFila & { datos: LandingDatos }) | null {
  const l = verLanding(storeId, id);
  if (!l) return null;
  const nid = uid();
  db.prepare('INSERT INTO landings (id, store_id, slug, nombre, product_id, datos) VALUES (?,?,?,?,?,?)')
    .run(nid, storeId, slugLibre(storeId, l.datos.nombre + ' copia'), l.datos.nombre, l.productId, JSON.stringify(l.datos));
  return verLanding(storeId, nid);
}

/**
 * Publicar: si ya está desbloqueada (gratis o pagada) se publica; si a la tienda aún le
 * quedan landings gratis, usa una; si no, hay que pagarla.
 */
export function publicarLanding(storeId: string, id: string): { ok: true; landing: LandingFila } | { requierePago: true; precio: number } | { error: string } {
  const r = db.prepare('SELECT * FROM landings WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!r) return { error: 'Landing no encontrada.' };
  const d = limpiarDatos(pj(txt(r.datos), {}));
  if (!d.galeria.length) return { error: 'Agrega al menos una foto del producto en la galería antes de publicar.' };
  if (!d.precio && !d.bundles.length) return { error: 'Ponle precio al producto (o al menos una oferta) antes de publicar.' };
  if (!r.desbloqueada) {
    const c = cuotaLandings(storeId);
    if (c.gratisRestantes > 0 || c.precio <= 0) {
      db.prepare("UPDATE landings SET desbloqueada = 1, modo = ? WHERE id = ?").run(c.gratisRestantes > 0 ? 'gratis' : 'sin-costo', id);
    } else return { requierePago: true, precio: c.precio };
  }
  db.prepare("UPDATE landings SET estado = 'publicada', publicada_at = COALESCE(publicada_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(id);
  registrarLog(storeId, 'info', 'landing', `Landing publicada: ${d.nombre}.`);
  return { ok: true, landing: verLanding(storeId, id)! };
}
export function despublicarLanding(storeId: string, id: string): boolean {
  return db.prepare("UPDATE landings SET estado = 'borrador', updated_at = datetime('now') WHERE id = ? AND store_id = ?").run(id, storeId).changes > 0;
}

// ── Página pública ─────────────────────────────────────────────────────
export function landingPublica(tienda: string, slug: string): { storeId: string; id: string; datos: LandingDatos } | null {
  const s = db.prepare('SELECT id FROM stores WHERE slug = ?').get(String(tienda).toLowerCase()) as { id: string } | undefined;
  if (!s) return null;
  const r = db.prepare("SELECT id, datos FROM landings WHERE store_id = ? AND slug = ? AND estado = 'publicada'").get(s.id, String(slug).toLowerCase()) as { id: string; datos: string } | undefined;
  if (!r) return null;
  return { storeId: s.id, id: r.id, datos: limpiarDatos(pj(r.datos, {})) };
}
export function contarVista(id: string) { try { db.prepare('UPDATE landings SET vistas = vistas + 1 WHERE id = ?').run(id); } catch { /* opcional */ } }

const DEPARTAMENTOS = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'];

/** Descripción con formato sencillo: párrafos, listas (- o ✓) y **negrita**. */
function formatoTexto(t: string): string {
  const neg = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return t.split(/\n{2,}/).map((bloque) => {
    const lineas = bloque.split('\n').filter((l) => l.trim());
    if (lineas.length && lineas.every((l) => /^\s*([-•*✓✔✅]|\d+[.)])\s+/.test(l))) {
      return `<ul>${lineas.map((l) => `<li>${neg(l.replace(/^\s*([-•*✓✔✅]|\d+[.)])\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lineas.map(neg).join('<br>')}</p>`;
  }).join('');
}

const estrellas = (n: number) => {
  let h = '';
  for (let i = 1; i <= 5; i++) {
    const lleno = Math.max(0, Math.min(1, n - i + 1));
    h += `<span class="st"><span style="width:${Math.round(lleno * 100)}%">★</span>★</span>`;
  }
  return h;
};

/** HTML completo de la landing. `vista` = vista previa del editor (sin pedidos reales ni píxel). */
export function renderLanding(d: LandingDatos, o: { id: string; vista?: boolean; titulo?: string }): string {
  const bundles = d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: '1 unidad', subtitulo: '', precio: d.precio, precioAntes: d.precioAntes, insignia: '', imagen: '' }];
  const sel = bundles[Math.min(d.bundleInicial, bundles.length - 1)];
  const ahorro = sel.precioAntes > sel.precio && sel.precio > 0 ? Math.round((1 - sel.precio / sel.precioAntes) * 100) : 0;
  const cfg = {
    id: o.id, vista: !!o.vista, nombre: d.nombre, opciones: d.opciones, bundles, inicial: Math.min(d.bundleInicial, bundles.length - 1),
    foto: d.galeria[0] || '', pedirCorreo: d.pedirCorreo, gracias: d.gracias || '¡Gracias por tu compra! Te escribiremos por WhatsApp para confirmar tu pedido.',
    pixel: o.vista ? '' : d.pixelMeta, deps: DEPARTAMENTOS,
  };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const hoy = new Date(Date.now() - 5 * 3600e3); // hora de Colombia
  const dia = (n: number) => { const x = new Date(hoy); x.setUTCDate(x.getUTCDate() + n); return x.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  const titulo = esc(o.titulo || `${d.nombre}${d.nombreTienda ? ' | ' + d.nombreTienda : ''}`);
  const ofertas = bundles.length > 1 || d.bundles.length;

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${titulo}</title>
<meta name="description" content="${esc((d.destacado || d.descripcion).slice(0, 160))}">
<meta property="og:title" content="${titulo}">${d.galeria[0] ? `<meta property="og:image" content="${esc(d.galeria[0].startsWith('/') ? BASE_TIENDA + d.galeria[0] : d.galeria[0])}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
${cfg.pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${cfg.pixel}');fbq('track','PageView');fbq('track','ViewContent',{content_name:${JSON.stringify(d.nombre).replace(/</g, '\\u003c')},value:${sel.precio},currency:'COP'});</script>` : ''}
<style>
:root{--p:${d.colorPrincipal};--b:${d.colorBoton};--t:#121212;--m:#6b6b6b;--bd:#e6e6e6;--bg2:#f5f5f5}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--t);font:15px/1.55 Inter,system-ui,-apple-system,sans-serif}
img{max-width:100%;display:block}
h1,h2,h3,.pp{font-family:Poppins,system-ui,sans-serif;letter-spacing:.3px}
.anuncio{background:var(--p);color:#fff;text-align:center;font:600 12px/1.3 Poppins,sans-serif;letter-spacing:.6px;padding:9px 14px;text-transform:uppercase}
header{display:flex;justify-content:center;align-items:center;padding:12px 16px;border-bottom:1px solid var(--bd)}
header img{max-height:46px;width:auto}header .tn{font:800 20px Poppins,sans-serif;text-transform:uppercase;letter-spacing:1px}
.banner img{width:100%}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px}
.prod{display:grid;grid-template-columns:1fr;gap:22px;padding:18px 0 8px}
@media(min-width:900px){.prod{grid-template-columns:1.1fr 1fr;gap:48px;padding:36px 0}.info{position:sticky;top:16px;align-self:start}}
.gal{position:relative}
.slides{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;border-radius:12px;background:var(--bg2)}
.slides::-webkit-scrollbar{display:none}
.slides img{flex:0 0 100%;width:100%;aspect-ratio:1/1;object-fit:cover;scroll-snap-align:center}
.flecha{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:18px;cursor:pointer;display:none}
@media(min-width:900px){.flecha{display:block}}
.flecha.izq{left:10px}.flecha.der{right:10px}
.thumbs{display:flex;gap:8px;margin-top:10px;overflow-x:auto;scrollbar-width:none}
.thumbs img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:2px solid transparent;cursor:pointer;flex:0 0 auto;opacity:.7}
.thumbs img.on{border-color:var(--p);opacity:1}
.rating{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--m)}
.st{position:relative;display:inline-block;color:#ddd;font-size:17px;line-height:1}
.st span{position:absolute;left:0;top:0;overflow:hidden;color:#ffb400;white-space:nowrap}
h1{font-size:26px;line-height:1.2;margin:8px 0 10px;font-weight:700}
@media(min-width:900px){h1{font-size:32px}}
.precio{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.precio .ya{font:700 26px Poppins,sans-serif;color:var(--b)}
.precio .antes{color:var(--m);text-decoration:line-through;font-size:17px}
.precio .ahorro{background:var(--b);color:#fff;font:700 12px Poppins,sans-serif;padding:5px 10px;border-radius:6px;text-transform:uppercase}
.dest{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;background:var(--bg2);border-radius:8px;padding:10px 12px;font-size:14px;font-weight:600;margin:12px 0;text-align:center}
.opt{margin:16px 0}.opt .lab{font-size:14px;margin-bottom:8px}.opt .lab b{font-weight:700}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{border:1px solid rgba(18,18,18,.55);background:#fff;border-radius:40px;padding:8px 18px;font:500 14px Inter,sans-serif;cursor:pointer;color:var(--t);display:flex;align-items:center;gap:8px}
.pill img{width:26px;height:26px;border-radius:50%;object-fit:cover}
.pill.on{background:var(--p);border-color:var(--p);color:#fff}
.ofertas{margin:18px 0}
.ofertas h3{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;margin:0 0 12px;text-align:center;justify-content:center}
.ofertas h3:before,.ofertas h3:after{content:"";flex:1;height:2px;background:var(--bd)}
.bnd{position:relative;display:flex;align-items:center;gap:12px;border:2px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:12px;cursor:pointer;background:#fff;transition:border-color .15s,background .15s}
.bnd.on{border-color:var(--p);background:color-mix(in srgb,var(--p) 6%,#fff)}
.bnd .rad{width:20px;height:20px;border-radius:50%;border:2px solid #bbb;flex:0 0 auto;display:grid;place-items:center}
.bnd.on .rad{border-color:var(--p)}.bnd.on .rad:after{content:"";width:10px;height:10px;border-radius:50%;background:var(--p)}
.bnd img{width:54px;height:54px;object-fit:cover;border-radius:8px}
.bnd .tx{flex:1;min-width:0}.bnd .t1{font:700 15px Poppins,sans-serif}.bnd .t2{font-size:12.5px;color:var(--m)}
.bnd .t2.verde{color:#16a34a;font-weight:600}
.bnd .pr{text-align:right}.bnd .pr .a{font:700 16px Poppins,sans-serif}.bnd .pr .b{font-size:12.5px;color:var(--m);text-decoration:line-through}
.bnd .ins{position:absolute;top:-11px;right:12px;background:var(--b);color:#fff;font:700 10.5px Poppins,sans-serif;padding:3px 10px;border-radius:20px;letter-spacing:.4px;text-transform:uppercase}
.cta{width:100%;border:0;border-radius:6px;background:var(--b);color:#fff;font:700 16px/1.25 Poppins,sans-serif;padding:17px 14px;cursor:pointer;text-transform:uppercase;letter-spacing:.4px;box-shadow:0 6px 18px -6px color-mix(in srgb,var(--b) 70%,transparent);animation:latir 2.2s ease-in-out infinite}
.cta small{display:block;font:500 12px Inter,sans-serif;text-transform:none;opacity:.9;margin-top:3px}
@keyframes latir{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}
.benef{display:flex;justify-content:space-around;gap:8px;margin:14px 0;font-size:12.5px;font-weight:600;text-align:center;flex-wrap:wrap}
.envio{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--bd);border-radius:10px;padding:12px 14px;font-size:14px;margin:14px 0}
.envio .ic{font-size:22px;line-height:1}
.desc{font-size:15px;color:#333;margin:18px 0}.desc ul{padding-left:20px;margin:8px 0}.desc li{margin:4px 0}.desc p{margin:0 0 10px}
.largas{max-width:760px;margin:0 auto}.largas img{width:100%}
.testi{background:var(--bg2);padding:36px 0 40px;margin-top:10px}
.testi h2{text-align:center;font-size:24px;margin:0 0 20px;padding:0 16px}
.posts{display:flex;align-items:flex-start;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 16px 12px;scrollbar-width:none}
.posts::-webkit-scrollbar{display:none}
@media(min-width:900px){.posts{display:grid;grid-template-columns:repeat(3,1fr);max-width:1200px;margin:0 auto;overflow:visible}}
.post{flex:0 0 86%;scroll-snap-align:center;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.12);padding:12px 14px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.post .cab{display:flex;gap:9px;align-items:center;margin-bottom:8px}
.post .av{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#ccd;display:grid;place-items:center;color:#fff;font-weight:700}
.post .nm{font-weight:600;color:#050505}.post .tm{font-size:12.5px;color:#65676b}
.post .img{margin:10px -14px 0;width:calc(100% + 28px);max-width:none;aspect-ratio:1/1;object-fit:cover}
.post .rx{display:flex;align-items:center;gap:6px;color:#65676b;font-size:13px;margin-top:10px;padding-bottom:8px;border-bottom:1px solid #e4e6eb}
.post .rx i{font-style:normal;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:10px;margin-right:-8px;border:2px solid #fff}
.post .ac{display:flex;justify-content:space-around;color:#65676b;font-weight:600;font-size:13px;padding-top:7px}
footer{text-align:center;font-size:12px;color:var(--m);padding:26px 16px 110px}
.pegado{position:fixed;left:0;right:0;bottom:0;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -6px 20px -8px rgba(0,0,0,.25);transform:translateY(110%);transition:transform .25s;z-index:40}
.pegado.on{transform:none}.pegado .cta{padding:14px;font-size:15px;animation:none}
@media(min-width:900px){.pegado{display:none}}
.wa{position:fixed;right:16px;bottom:96px;width:54px;height:54px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:41}
@media(min-width:900px){.wa{bottom:24px}}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:flex-end;justify-content:center;z-index:60}
.modal.on{display:flex}
@media(min-width:640px){.modal{align-items:center}}
.caja{background:#fff;width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:16px 16px 0 0;padding:18px 18px 22px;animation:subir .22s ease-out}
@media(min-width:640px){.caja{border-radius:14px}}
@keyframes subir{from{transform:translateY(30px);opacity:.4}to{transform:none;opacity:1}}
.caja h3{margin:0 0 4px;font-size:18px;text-align:center}.caja .sub{text-align:center;font-size:13px;color:var(--m);margin-bottom:14px}
.cerrar{float:right;border:0;background:none;font-size:24px;line-height:1;cursor:pointer;color:var(--m)}
.res{display:flex;gap:10px;align-items:center;background:var(--bg2);border-radius:10px;padding:10px;margin-bottom:12px}
.res img{width:54px;height:54px;border-radius:8px;object-fit:cover}.res .n{font-weight:600;font-size:14px}.res .q{font-size:12.5px;color:var(--m)}
.res .tot{margin-left:auto;font:700 17px Poppins,sans-serif}
.uni{border:1px dashed var(--bd);border-radius:10px;padding:8px 10px;margin-bottom:8px}
.uni .ut{font-size:12px;font-weight:700;color:var(--m);margin-bottom:6px}
.uni .row{display:flex;gap:8px}.uni select{flex:1}
.campo{position:relative;margin-bottom:10px}
.campo label{display:block;font-size:12.5px;font-weight:600;margin-bottom:4px}
.campo input,.campo select,.uni select,.campo textarea{width:100%;border:1px solid rgba(18,18,18,.4);border-radius:6px;padding:11px 12px;font:15px Inter,sans-serif;background:#fff;color:var(--t)}
.campo input:focus,.campo select:focus{outline:2px solid color-mix(in srgb,var(--p) 40%,transparent);border-color:var(--p)}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.err{color:#dc2626;font-size:13px;margin:6px 0;min-height:1px}
.seg{display:flex;justify-content:center;gap:14px;font-size:12px;color:var(--m);margin-top:10px}
.ok{text-align:center;padding:18px 4px}.ok .ic{font-size:54px}.ok h3{font-size:22px;margin:8px 0}
</style></head><body>
${d.anuncio ? `<div class="anuncio">${esc(d.anuncio)}</div>` : ''}
${d.logo || d.nombreTienda ? `<header>${d.logo ? `<img src="${esc(d.logo)}" alt="${esc(d.nombreTienda)}">` : `<span class="tn">${esc(d.nombreTienda)}</span>`}</header>` : ''}
${d.bannerSuperior ? `<div class="banner"><img src="${esc(d.bannerSuperior)}" alt=""></div>` : ''}
<main class="wrap"><section class="prod">
  <div class="gal">
    <div class="slides" id="slides">${(d.galeria.length ? d.galeria : ['']).map((g, i) => g ? `<img src="${esc(g)}" alt="${esc(d.nombre)}" ${i ? 'loading="lazy"' : ''}>` : '<div style="flex:0 0 100%;aspect-ratio:1/1;display:grid;place-items:center;color:#999">Agrega fotos del producto</div>').join('')}</div>
    ${d.galeria.length > 1 ? `<button class="flecha izq" data-dir="-1" aria-label="Anterior">‹</button><button class="flecha der" data-dir="1" aria-label="Siguiente">›</button>
    <div class="thumbs" id="thumbs">${d.galeria.map((g, i) => `<img src="${esc(g)}" data-i="${i}" class="${i ? '' : 'on'}" alt="" loading="lazy">`).join('')}</div>` : ''}
  </div>
  <div class="info">
    ${d.calificacion > 0 ? `<div class="rating"><span>${estrellas(d.calificacion)}</span><span>${esc(d.calificacion.toFixed(1))}${d.resenas ? ' · ' + esc(d.resenas) : ''}</span></div>` : ''}
    <h1>${esc(d.nombre)}</h1>
    <div class="precio"><span class="ya" id="precioYa">${pesos(sel.precio)}</span>${sel.precioAntes > sel.precio ? `<span class="antes" id="precioAntes">${pesos(sel.precioAntes)}</span>` : `<span class="antes" id="precioAntes"></span>`}<span class="ahorro" id="ahorro"${ahorro ? '' : ' hidden'}>Ahorra ${ahorro}%</span></div>
    ${d.destacado ? `<div class="dest">${d.destacado.split('|').map((x) => `<span>✓ ${esc(x.trim())}</span>`).join('')}</div>` : ''}
    ${d.opciones.map((op, oi) => `<div class="opt"><div class="lab">${esc(op.nombre)}: <b id="opv${oi}">${esc(op.valores[0]?.valor || '')}</b></div><div class="pills">${op.valores.map((v, vi) => `<button type="button" class="pill${vi ? '' : ' on'}" data-o="${oi}" data-v="${vi}">${v.foto ? `<img src="${esc(v.foto)}" alt="">` : ''}${esc(v.valor)}</button>`).join('')}</div></div>`).join('')}
    ${ofertas ? `<div class="ofertas">${d.tituloOfertas ? `<h3>${esc(d.tituloOfertas)}</h3>` : ''}${bundles.map((b, i) => `<div class="bnd${i === cfg.inicial ? ' on' : ''}" data-b="${i}" role="radio" tabindex="0" aria-checked="${i === cfg.inicial}">${b.insignia ? `<span class="ins">${esc(b.insignia)}</span>` : ''}<span class="rad"></span>${b.imagen ? `<img src="${esc(b.imagen)}" alt="">` : ''}<div class="tx"><div class="t1">${esc(b.titulo || `${b.cantidad} unidad${b.cantidad > 1 ? 'es' : ''}`)}</div>${b.subtitulo ? `<div class="t2${/ahorr|gratis|regalo/i.test(b.subtitulo) ? ' verde' : ''}">${esc(b.subtitulo)}</div>` : ''}</div><div class="pr"><div class="a">${pesos(b.precio)}</div>${b.precioAntes > b.precio ? `<div class="b">${pesos(b.precioAntes)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
    <button class="cta" id="cta" type="button">${esc(d.boton)}<small>Pagas cuando lo recibes en tu casa</small></button>
    ${d.beneficios.length ? `<div class="benef">${d.beneficios.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
    ${d.envioMax > 0 ? `<div class="envio"><span class="ic">🚚</span><div>Recibe tu pedido entre el <strong>${esc(dia(d.envioMin))}</strong> y el <strong>${esc(dia(d.envioMax))}</strong></div></div>` : ''}
    ${d.descripcion.trim() ? `<div class="desc">${formatoTexto(d.descripcion)}</div>` : ''}
  </div>
</section></main>
${d.imagenes.length ? `<section class="largas">${d.imagenes.map((g) => `<img src="${esc(g)}" alt="" loading="lazy">`).join('')}</section>` : ''}
${d.imagenes.length ? `<div class="wrap" style="max-width:560px;padding-top:18px"><button class="cta" type="button" data-abrir>${esc(d.boton)}</button></div>` : ''}
${d.testimonios.length ? `<section class="testi">${d.tituloTestimonios ? `<h2>${esc(d.tituloTestimonios)}</h2>` : ''}<div class="posts">${d.testimonios.map((t) => `<article class="post"><div class="cab">${t.avatar ? `<img class="av" src="${esc(t.avatar)}" alt="">` : `<span class="av" style="background:hsl(${(t.autor.charCodeAt(0) || 0) * 37 % 360} 45% 55%)">${esc(t.autor.slice(0, 1).toUpperCase())}</span>`}<div><div class="nm">${esc(t.autor)}</div><div class="tm">${esc(t.tiempo || 'Hace 1 día')} · 🌎</div></div></div><div>${esc(t.texto).replace(/\n/g, '<br>')}</div>${t.imagen ? `<img class="img" src="${esc(t.imagen)}" alt="" loading="lazy">` : ''}<div class="rx"><i style="background:#1877f2">👍</i><i style="background:#f33e58">❤️</i><i style="background:#f7b125">🥰</i><span style="margin-left:12px">${esc(t.reacciones || '12')}</span></div><div class="ac"><span>👍 Me gusta</span><span>💬 Comentar</span><span>↗ Compartir</span></div></article>`).join('')}</div></section>` : ''}
<footer>© ${new Date().getFullYear()} ${esc(d.nombreTienda || d.nombre)} · Pago contra entrega en toda Colombia</footer>
<div class="pegado" id="pegado"><button class="cta" type="button" data-abrir>${esc(d.boton)}</button></div>
${d.whatsapp ? `<a class="wa" href="https://wa.me/${esc(d.whatsapp)}?text=${encodeURIComponent('Hola, quiero información de ' + d.nombre)}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg></a>` : ''}
<div class="modal" id="modal" aria-hidden="true"><div class="caja" role="dialog" aria-modal="true" id="caja"></div></div>
<script>
(function(){
var C=${json};
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var fmt=function(n){return '$'+Math.round(n).toLocaleString('es-CO')};
var escH=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var sel=C.opciones.map(function(){return 0}),bi=C.inicial;
// Galería
var sl=$('#slides');
function irA(i){if(!sl)return;var n=sl.children.length;i=(i+n)%n;sl.scrollTo({left:i*sl.clientWidth,behavior:'smooth'})}
if(sl){sl.addEventListener('scroll',function(){var i=Math.round(sl.scrollLeft/sl.clientWidth);$$('#thumbs img').forEach(function(t,k){t.classList.toggle('on',k===i)})},{passive:true})}
$$('#thumbs img').forEach(function(t){t.onclick=function(){irA(+t.dataset.i)}});
$$('.flecha').forEach(function(b){b.onclick=function(){irA(Math.round(sl.scrollLeft/sl.clientWidth)+(+b.dataset.dir))}});
// Variantes
$$('.pill').forEach(function(p){p.onclick=function(){var o=+p.dataset.o,v=+p.dataset.v;sel[o]=v;$$('.pill[data-o="'+o+'"]').forEach(function(x){x.classList.toggle('on',x===p)});$('#opv'+o).textContent=C.opciones[o].valores[v].valor;
  var f=C.opciones[o].valores[v].foto;if(f&&sl){var k=$$('img',sl).findIndex(function(im){return im.getAttribute('src')===f});if(k>=0)irA(k)}}});
// Ofertas
function pintarPrecio(){var b=C.bundles[bi];$('#precioYa').textContent=fmt(b.precio);$('#precioAntes').textContent=b.precioAntes>b.precio?fmt(b.precioAntes):'';var a=$('#ahorro');if(b.precioAntes>b.precio){a.hidden=false;a.textContent='Ahorra '+Math.round((1-b.precio/b.precioAntes)*100)+'%'}else a.hidden=true}
$$('.bnd').forEach(function(el){var f=function(){bi=+el.dataset.b;$$('.bnd').forEach(function(x){x.classList.toggle('on',x===el);x.setAttribute('aria-checked',x===el)});pintarPrecio()};el.onclick=f;el.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();f()}}});
// Barra fija en celular
var cta=$('#cta'),peg=$('#pegado');
if(cta&&peg&&'IntersectionObserver' in window){new IntersectionObserver(function(e){peg.classList.toggle('on',!e[0].isIntersecting&&e[0].boundingClientRect.top<0)}).observe(cta)}
// Formulario contra entrega
var modal=$('#modal'),caja=$('#caja');
function cerrar(){modal.classList.remove('on');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''}
modal.addEventListener('click',function(e){if(e.target===modal)cerrar()});
document.addEventListener('keydown',function(e){if(e.key==='Escape')cerrar()});
function selects(u){return C.opciones.map(function(op,oi){return '<select data-u="'+u+'" data-o="'+oi+'" aria-label="'+escH(op.nombre)+'">'+op.valores.map(function(v,vi){return '<option value="'+vi+'"'+(vi===sel[oi]?' selected':'')+'>'+escH(v.valor)+'</option>'}).join('')+'</select>'}).join('')}
function abrir(){
  var b=C.bundles[bi];
  if(window.fbq)fbq('track','InitiateCheckout',{value:b.precio,currency:'COP',num_items:b.cantidad});
  var unidades='';
  if(C.opciones.length){
    if(b.cantidad>1){for(var u=0;u<b.cantidad;u++)unidades+='<div class="uni"><div class="ut">Unidad '+(u+1)+'</div><div class="row">'+selects(u)+'</div></div>'}
    else unidades='<div class="uni"><div class="row">'+selects(0)+'</div></div>';
  }
  caja.innerHTML='<button class="cerrar" type="button" aria-label="Cerrar">×</button><h3>Completa tu pedido</h3><div class="sub">💵 Pago contra entrega · Pagas al recibir</div>'+
  '<div class="res">'+(C.foto?'<img src="'+escH(C.foto)+'" alt="">':'')+'<div><div class="n">'+escH(C.nombre)+'</div><div class="q">'+escH(b.titulo||(b.cantidad+' unidad(es)'))+'</div></div><div class="tot">'+fmt(b.precio)+'</div></div>'+unidades+
  '<form id="f" novalidate><div class="campo"><label>Nombre y apellido</label><input name="nombre" autocomplete="name" required></div>'+
  '<div class="campo"><label>Celular (WhatsApp)</label><input name="tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="300 123 4567" required></div>'+
  (C.pedirCorreo?'<div class="campo"><label>Correo (opcional)</label><input name="correo" type="email" autocomplete="email"></div>':'')+
  '<div class="dos"><div class="campo"><label>Departamento</label><select name="departamento" required><option value="">Elige…</option>'+C.deps.map(function(d){return '<option>'+escH(d)+'</option>'}).join('')+'</select></div>'+
  '<div class="campo"><label>Ciudad / municipio</label><input name="ciudad" autocomplete="address-level2" required></div></div>'+
  '<div class="campo"><label>Dirección completa</label><input name="direccion" autocomplete="street-address" placeholder="Calle 10 # 20-30, apto 301" required></div>'+
  '<div class="campo"><label>Barrio / indicaciones (opcional)</label><input name="barrio"></div>'+
  '<div class="err" id="err"></div><button class="cta" id="enviar" type="submit" style="animation:none">Completar pedido · '+fmt(b.precio)+'</button>'+
  '<div class="seg"><span>🔒 Datos protegidos</span><span>🚚 Envío a toda Colombia</span></div></form>';
  modal.classList.add('on');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  $('.cerrar',caja).onclick=cerrar;
  $('#f').onsubmit=enviar;
}
$$('#cta,[data-abrir]').forEach(function(b){b.onclick=abrir});
function enviar(e){
  e.preventDefault();var f=e.target,err=$('#err'),btn=$('#enviar'),b=C.bundles[bi];
  var v=function(n){var x=f.elements[n];return x?String(x.value||'').trim():''};
  var tel=v('tel').replace(/\\D/g,'').replace(/^57(?=3\\d{9}$)/,'');
  if(v('nombre').length<3)return err.textContent='Escribe tu nombre y apellido.';
  if(!/^3\\d{9}$/.test(tel))return err.textContent='Escribe un celular de 10 dígitos (empieza por 3).';
  if(!v('departamento'))return err.textContent='Elige tu departamento.';
  if(v('ciudad').length<3)return err.textContent='Escribe tu ciudad o municipio.';
  if(v('direccion').length<5)return err.textContent='Escribe la dirección completa.';
  var unidades=[];var n=C.opciones.length?Math.max(1,b.cantidad>1?b.cantidad:1):0;
  for(var u=0;u<n;u++){unidades.push(C.opciones.map(function(op,oi){var s=$('select[data-u="'+u+'"][data-o="'+oi+'"]',caja);return op.valores[s?+s.value:sel[oi]].valor}))}
  err.textContent='';
  if(C.vista){err.textContent='Vista previa: los pedidos se reciben cuando la landing esté publicada.';return}
  btn.disabled=true;btn.textContent='Enviando tu pedido…';
  fetch('/l/api/'+encodeURIComponent(C.id)+'/pedido',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bundle:bi,unidades:unidades,nombre:v('nombre'),tel:tel,correo:v('correo'),departamento:v('departamento'),ciudad:v('ciudad'),direccion:v('direccion'),barrio:v('barrio'),url:location.href})})
  .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
  .then(function(r){
    if(!r.ok)throw new Error(r.j.error||'No pudimos recibir tu pedido.');
    if(window.fbq)fbq('track','Purchase',{value:b.precio,currency:'COP',content_name:C.nombre,num_items:b.cantidad},{eventID:r.j.eventId||''});
    caja.innerHTML='<div class="ok"><div class="ic">🎉</div><h3>¡Pedido recibido!</h3><p>'+escH(C.gracias)+'</p><p style="color:#6b6b6b;font-size:13px">Pedido #'+escH(r.j.numero)+'</p><button class="cta" type="button" style="animation:none" id="listo">Listo</button></div>';
    $('#listo').onclick=cerrar;
  }).catch(function(x){btn.disabled=false;btn.textContent='Completar pedido · '+fmt(b.precio);err.textContent=x.message});
}
})();
</script>
</body></html>`;
}

// ── Pedido desde la landing ────────────────────────────────────────────
const intentos = new Map<string, number[]>();
/** Crea el pedido en DealFlow (origen "landing") y pide la confirmación por WhatsApp. */
export async function pedidoLanding(landingId: string, b: Fila, ip: string): Promise<{ ok: true; numero: number; eventId: string } | { error: string }> {
  // Antispam: máximo 5 pedidos por IP cada 10 minutos.
  const ahora = Date.now();
  const lista = (intentos.get(ip) || []).filter((t) => ahora - t < 10 * 60e3);
  if (lista.length >= 5) return { error: 'Recibimos varios pedidos seguidos desde tu conexión. Espera unos minutos e intenta de nuevo.' };
  lista.push(ahora); intentos.set(ip, lista);

  const l = db.prepare("SELECT * FROM landings WHERE id = ? AND estado = 'publicada'").get(landingId) as Fila | undefined;
  if (!l) return { error: 'Esta página ya no está recibiendo pedidos.' };
  const storeId = txt(l.store_id);
  const d = limpiarDatos(pj(txt(l.datos), {}));
  const bundles = d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: '1 unidad', subtitulo: '', precio: d.precio, precioAntes: 0, insignia: '', imagen: '' }];
  const bundle = bundles[Math.max(0, Math.min(bundles.length - 1, Math.round(num(b.bundle))))];
  const nombre = corto(b.nombre, 80);
  const tel = txt(b.tel).replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');
  const ciudad = corto(b.ciudad, 60), departamento = corto(b.departamento, 60);
  const direccion = [corto(b.direccion, 160), corto(b.barrio, 120)].filter(Boolean).join(' · ');
  if (nombre.length < 3) return { error: 'Escribe tu nombre y apellido.' };
  if (!/^3\d{9}$/.test(tel)) return { error: 'Escribe un celular válido de 10 dígitos.' };
  if (!ciudad || !departamento || direccion.length < 5) return { error: 'Completa la ciudad, el departamento y la dirección.' };
  if (!bundle || bundle.precio <= 0) return { error: 'Este producto no tiene precio todavía.' };

  // Una línea por cada variante distinta (si pidió 3 y son de colores distintos, salen 3 líneas).
  const unidades = (Array.isArray(b.unidades) ? b.unidades : []).slice(0, bundle.cantidad).map((u) => (Array.isArray(u) ? u : []).map((x, i) => {
    const op = d.opciones[i]; const v = corto(x, 40);
    return op && op.valores.some((y) => y.valor === v) ? v : op?.valores[0]?.valor || '';
  }).filter(Boolean).join(' · '));
  const grupos = new Map<string, number>();
  if (d.opciones.length) {
    for (let i = 0; i < bundle.cantidad; i++) { const k = unidades[i] || unidades[0] || d.opciones.map((o) => o.valores[0]?.valor).filter(Boolean).join(' · '); grupos.set(k, (grupos.get(k) || 0) + 1); }
  } else grupos.set('', bundle.cantidad);
  const precioUnidad = Math.round(bundle.precio / bundle.cantidad);

  const numero = ((db.prepare('SELECT MAX(numero) n FROM orders WHERE store_id = ?').get(storeId) as { n: number | null }).n || 1048) + 1;
  const oid = uid();
  const nota = [`Landing: ${d.nombre}`, bundle.titulo ? `Oferta: ${bundle.titulo}` : '', 'Contra entrega', txt(b.correo) ? `Correo: ${corto(b.correo, 80)}` : ''].filter(Boolean).join(' · ');
  db.prepare(`INSERT INTO orders (id, store_id, numero, cliente, ciudad, departamento, tel, direccion, estado, transportadora, total, envio, nota, origen, landing_id)
    VALUES (?,?,?,?,?,?,?,?,'Nuevo','',?,0,?,'landing',?)`).run(oid, storeId, numero, nombre, ciudad, departamento, tel, direccion, bundle.precio, nota, landingId);
  for (const [variante, qty] of grupos) {
    const nom = d.nombre + (variante ? ` (${variante})` : '');
    let ids = idsDeItem(storeId, nom);
    const pid = txt(l.product_id);
    if (pid && ids.productId !== pid) ids = { productId: pid, variantId: '' };
    db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio, product_id, variant_id) VALUES (?,?,?,?,?,?,?)').run(uid(), oid, qty, nom, precioUnidad, ids.productId, ids.variantId);
  }
  db.prepare('UPDATE landings SET pedidos = pedidos + 1 WHERE id = ?').run(landingId);
  trazar(storeId, oid, { etapa: 'pedido', nivel: 'ok', titulo: `Pedido DF-${numero} creado desde la landing «${d.nombre}»`, detalle: txt(b.url).slice(0, 200), datos: { cliente: nombre, tel, ciudad, departamento, total: bundle.precio, oferta: bundle.titulo, productos: [...grupos].map(([v, q]) => `${q}× ${d.nombre}${v ? ` (${v})` : ''}`) } });
  registrarLog(storeId, 'info', 'pedido', `Pedido DF-${numero} llegó de la landing «${d.nombre}» (${nombre}).`);
  void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `Nuevo pedido de tu landing DF-${numero} 🛒`, `${nombre} · ${pesos(bundle.precio)}`, { url: '/pedidos' })).catch(() => {});
  void import('./correo.js').then((c) => c.correoPedidoNuevo(storeId, oid, 'Landing')).catch(() => {});
  if (d.confirmarWhatsapp) void import('./shopifyPedidos.js').then((m) => m.enviarConfirmacion(storeId, oid)).catch(() => {});
  return { ok: true, numero, eventId: oid };
}

/** ¿Despachar solo al confirmar? (lo elige cada landing). */
export function autoDespachoDeLanding(landingId: string): boolean {
  const r = db.prepare('SELECT datos FROM landings WHERE id = ?').get(landingId) as { datos: string } | undefined;
  return r ? limpiarDatos(pj(r.datos, {})).autoDespacho : false;
}
