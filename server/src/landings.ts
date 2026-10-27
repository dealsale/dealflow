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
import { precioDe } from './preciosServicios.js';
import { renderLanding, renderCatalogo } from './landingPlantillas.js';

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

// Dominio propio de la tienda para sus landings (tutienda.com/producto).
for (const col of ["landing_dominio TEXT NOT NULL DEFAULT ''", "landing_dominio_estado TEXT NOT NULL DEFAULT ''", "landing_dominio_detalle TEXT NOT NULL DEFAULT ''", "landing_dominio_cf TEXT NOT NULL DEFAULT ''", "landing_inicio TEXT NOT NULL DEFAULT ''"]) {
  try { db.exec(`ALTER TABLE stores ADD COLUMN ${col}`); } catch { /* ya existe */ }
}

// Tienda en línea: membresía mensual para todas las tiendas (el precio está en Admin → Planes).
for (const col of ["tienda_vence TEXT NOT NULL DEFAULT ''", "tienda_config TEXT NOT NULL DEFAULT '{}'"]) {
  try { db.exec(`ALTER TABLE stores ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
const hoyCo = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const masDias = (fecha: string, n: number) => { const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Días de gracia después de vencer: las páginas siguen en línea mientras renueva. */
export const GRACIA_DIAS = 3;
export interface Membresia { activa: boolean; cortesia: boolean; vence: string; diasRestantes: number; enGracia: boolean; precio: number }
// Las cortesías de antes (interruptor del superadmin) pasan a 30 días de membresía, una sola vez,
// para que nadie pierda lo publicado de golpe. Desde ahora todas funcionan con membresía.
if (!db.prepare("SELECT 1 FROM app_flags WHERE clave = 'tienda_cortesias_a_membresia'").get()) {
  db.prepare("UPDATE stores SET tienda_vence = date('now','-5 hours','+30 days') WHERE landings_habilitado = 1 AND (tienda_vence = '' OR tienda_vence < date('now','-5 hours','+30 days'))").run();
  db.prepare('UPDATE stores SET landings_habilitado = 0').run();
  db.prepare("INSERT INTO app_flags (clave) VALUES ('tienda_cortesias_a_membresia')").run();
}
export function membresiaTienda(storeId: string): Membresia {
  const r = db.prepare('SELECT tienda_vence FROM stores WHERE id = ?').get(storeId) as { tienda_vence: string } | undefined;
  const cortesia = false;
  const vence = txt(r?.tienda_vence);
  const hoy = hoyCo();
  const dias = vence ? Math.round((Date.parse(vence + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / 864e5) : -1;
  return { activa: cortesia || dias >= 0, cortesia, vence, diasRestantes: dias, enGracia: !cortesia && !!vence && dias < 0 && dias >= -GRACIA_DIAS, precio: precioDe('tienda_online') };
}
/** ¿Puede crear y publicar? (membresía al día o cortesía) */
export const landingsHabilitadas = (storeId: string) => membresiaTienda(storeId).activa;
/** ¿Sus páginas siguen en línea? (incluye los días de gracia) */
export const tiendaEnLinea = (storeId: string) => { const m = membresiaTienda(storeId); return m.activa || m.enGracia; };
/** Suma un mes (30 días) desde hoy o desde el vencimiento, si aún no vence. */
export function extenderMembresia(storeId: string, dias = 30): string {
  const m = membresiaTienda(storeId);
  const base = m.vence && m.vence >= hoyCo() ? m.vence : hoyCo();
  const nueva = masDias(base, dias);
  db.prepare('UPDATE stores SET tienda_vence = ? WHERE id = ?').run(nueva, storeId);
  return nueva;
}
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const esc = (s: unknown) => txt(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const slugify = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'producto';

// ── Datos de una landing ───────────────────────────────────────────────
export interface OpcionL { nombre: string; valores: { valor: string; foto: string }[] }
export interface BundleL { cantidad: number; titulo: string; subtitulo: string; precio: number; precioAntes: number; insignia: string; imagen: string }
export interface TestimonioL { autor: string; avatar: string; tiempo: string; texto: string; imagen: string; reacciones: string; comentarioAutor: string; comentarioAvatar: string; comentarioTexto: string }
export interface LandingDatos {
  /** Diseño de la página (por ahora "premium"; con el tiempo habrá más). */
  plantilla: string;
  nombre: string;
  mostrarTitulo: boolean;
  precio: number;
  precioAntes: number;
  calificacion: number;
  resenas: string;
  destacado: string;
  /** Frases de la barra que se mueve arriba (ENVÍO GRATIS · PAGO CONTRA ENTREGA…). */
  anuncios: string[];
  bannerSuperior: string;
  galeria: string[];
  opciones: OpcionL[];
  tituloOfertas: string;
  bundles: BundleL[];
  bundleInicial: number;
  /** Precio normal de UNA unidad (antes de la promo). Con antesAuto, el tachado de cada oferta = unidades × este precio. */
  precioUnidadAntes: number;
  antesAuto: boolean;
  boton: string;
  botonSub: string;
  tituloForm: string;
  botonForm: string;
  beneficios: string[];
  descripcion: string;
  envioMin: number;
  envioMax: number;
  imagenes: string[];
  tituloTestimonios: string;
  testimonios: TestimonioL[];
  colorPrincipal: string;
  colorBoton: string;
  colorAcento: string;
  logo: string;
  nombreTienda: string;
  whatsapp: string;
  pixelMeta: string;
  confirmarWhatsapp: boolean;
  autoDespacho: boolean;
  pedirCorreo: boolean;
  gracias: string;
  /** SEO: lo que sale en Google y al compartir el enlace (vacío = se arma solo). */
  seoTitulo: string;
  seoDescripcion: string;
  seoImagen: string;
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
  const precioUnidadAntes = Math.max(0, Math.round(num(r.precioUnidadAntes)));
  const antesAuto = r.antesAuto === true && precioUnidadAntes > 0;
  if (antesAuto) for (const b of bundles) b.precioAntes = b.cantidad * precioUnidadAntes;
  // Landings creadas antes: el anuncio era una sola frase.
  const anuncios = Array.isArray(r.anuncios) ? r.anuncios : txt(r.anuncio).trim() ? txt(r.anuncio).split(/\s+[+·|]\s+/) : [];
  return {
    plantilla: ['premium'].includes(txt(r.plantilla)) ? txt(r.plantilla) : 'premium',
    nombre: corto(r.nombre, 120) || 'Producto',
    mostrarTitulo: r.mostrarTitulo !== false,
    precio: Math.max(0, Math.round(num(r.precio))),
    precioAntes: Math.max(0, Math.round(num(r.precioAntes))),
    calificacion: Math.max(0, Math.min(5, num(r.calificacion, 4.8))),
    resenas: corto(r.resenas, 60),
    destacado: corto(r.destacado, 140),
    anuncios: anuncios.map((x) => corto(x, 60).replace(/^[^\p{L}\p{N}$]+/u, '')).filter(Boolean).slice(0, 6),
    bannerSuperior: url(r.bannerSuperior),
    galeria: (Array.isArray(r.galeria) ? r.galeria : []).map(url).filter(Boolean).slice(0, 15),
    opciones: arr(r.opciones, 3, (o) => ({ nombre: corto(o.nombre, 30), valores: arr(o.valores, 30, (v) => ({ valor: corto(v.valor, 40), foto: url(v.foto) })).filter((v) => v.valor) }))
      .filter((o) => o.nombre && o.valores.length),
    tituloOfertas: corto(r.tituloOfertas, 60),
    bundles,
    bundleInicial: Math.max(0, Math.min(bundles.length - 1, Math.round(num(r.bundleInicial)))),
    precioUnidadAntes, antesAuto,
    boton: corto(r.boton, 60) || 'ENVÍO GRATIS · PAGO CONTRA ENTREGA',
    botonSub: corto(r.botonSub, 60),
    tituloForm: corto(r.tituloForm, 80) || 'Ingresa tus datos para realizar el pedido',
    botonForm: corto(r.botonForm, 50) || 'COMPRAR AHORA Y PAGAR EN CASA',
    beneficios: (Array.isArray(r.beneficios) ? r.beneficios : []).map((x) => corto(x, 50)).filter(Boolean).slice(0, 6),
    descripcion: largo(r.descripcion, 6000),
    envioMin: Math.max(0, Math.min(60, Math.round(num(r.envioMin, 2)))),
    envioMax: Math.max(0, Math.min(60, Math.round(num(r.envioMax, 5)))),
    imagenes: (Array.isArray(r.imagenes) ? r.imagenes : []).map(url).filter(Boolean).slice(0, 30),
    tituloTestimonios: corto(r.tituloTestimonios, 80),
    testimonios: arr(r.testimonios, 20, (t) => ({ autor: corto(t.autor, 50), avatar: url(t.avatar), tiempo: corto(t.tiempo, 30), texto: largo(t.texto, 700), imagen: url(t.imagen), reacciones: corto(t.reacciones, 10),
      comentarioAutor: corto(t.comentarioAutor, 50), comentarioAvatar: url(t.comentarioAvatar), comentarioTexto: largo(t.comentarioTexto, 300) }))
      .filter((t) => t.autor || t.texto),
    colorPrincipal: color(r.colorPrincipal, '#121212'),
    colorBoton: color(r.colorBoton, '#16a34a'),
    colorAcento: color(r.colorAcento, '#0f3a3f'),
    logo: url(r.logo),
    nombreTienda: corto(r.nombreTienda, 60),
    whatsapp: txt(r.whatsapp).replace(/\D/g, '').slice(0, 15),
    pixelMeta: txt(r.pixelMeta).replace(/\D/g, '').slice(0, 20),
    confirmarWhatsapp: r.confirmarWhatsapp !== false,
    autoDespacho: r.autoDespacho === true,
    pedirCorreo: r.pedirCorreo === true,
    gracias: largo(r.gracias, 400),
    seoTitulo: corto(r.seoTitulo, 70),
    seoDescripcion: corto(r.seoDescripcion, 170),
    seoImagen: url(r.seoImagen),
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
  const bundles: BundleL[] = precioBase > 0 ? [{ cantidad: 1, titulo: 'Lleva 1', subtitulo: 'Envío gratis', precio: precioBase, precioAntes: antesUno, insignia: '', imagen: '' }] : [];
  for (const b of combos.slice(0, 3)) {
    const antes = antesUno * num(b.cantidad);
    bundles.push({ cantidad: num(b.cantidad), titulo: b.etiqueta || `Lleva ${b.cantidad}`, subtitulo: `${pesos(num(b.precio) / num(b.cantidad))} cada uno`, precio: num(b.precio), precioAntes: antes > num(b.precio) ? antes : 0, insignia: bundles.length === 1 ? 'Más vendida 🔥' : 'Más ahorro 💰', imagen: '' });
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
    calificacion: 4.8, resenas: '+de 1.200 clientes felices', destacado: 'Calidad premium | Garantía de satisfacción',
    anuncios: ['ENVÍO GRATIS', 'PAGO CONTRA ENTREGA'],
    tituloOfertas: '', beneficios: [], boton: 'ENVÍO GRATIS PAGO CONTRA ENTREGA', botonSub: 'Aquí eliges tallas y colores',
    envioMin: 2, envioMax: 5, tituloTestimonios: 'Lo que dicen nuestros clientes',
    testimonios: [
      { autor: 'Camila Sánchez', tiempo: 'Hace 2 días', texto: 'Me llegó súper rápido y la calidad es increíble. ¡Totalmente recomendado! 😍', reacciones: '39', comentarioAutor: 'María Nieto', comentarioTexto: '¡Te queda hermoso amiga! 😍' },
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
  const dom = dominioActivo(txt(r.store_id));
  return {
    id: txt(r.id), slug: txt(r.slug), nombre: txt(r.nombre), productId: txt(r.product_id), estado: txt(r.estado), desbloqueada: !!r.desbloqueada, modo: txt(r.modo),
    vistas: num(r.vistas), pedidos: num(r.pedidos), url: dom ? `https://${dom}/${txt(r.slug)}` : `${BASE_TIENDA}/l/${t}/${txt(r.slug)}`, publicadaAt: (r.publicada_at as string) || null, updatedAt: txt(r.updated_at),
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
  const m = membresiaTienda(storeId);
  if (!m.activa && m.precio > 0) return { requierePago: true, precio: m.precio };
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
  if (!s || !tiendaEnLinea(s.id)) return null;
  const r = db.prepare("SELECT id, datos FROM landings WHERE store_id = ? AND slug = ? AND estado = 'publicada'").get(s.id, String(slug).toLowerCase()) as { id: string; datos: string } | undefined;
  if (!r) return null;
  return { storeId: s.id, id: r.id, datos: limpiarDatos(pj(r.datos, {})) };
}
// ── La tienda (página de inicio con todos los productos publicados) ─────
export interface TiendaConfig { nombre: string; logo: string; favicon: string; banner: string; titulo: string; descripcion: string; anuncios: string[]; colorPrincipal: string; colorBoton: string; colorAcento: string; whatsapp: string; pixelMeta: string; seoTitulo: string; seoDescripcion: string; seoImagen: string }
export function configTienda(storeId: string): TiendaConfig {
  const r = db.prepare('SELECT nombre, tienda_config FROM stores WHERE id = ?').get(storeId) as { nombre: string; tienda_config: string } | undefined;
  const c = pj<Fila>(txt(r?.tienda_config), {}) || {};
  return {
    nombre: corto(c.nombre, 60) || txt(r?.nombre), logo: url(c.logo), favicon: url(c.favicon), banner: url(c.banner),
    titulo: corto(c.titulo, 90), descripcion: largo(c.descripcion, 400),
    anuncios: (Array.isArray(c.anuncios) ? c.anuncios : ['ENVÍO GRATIS', 'PAGO CONTRA ENTREGA']).map((x) => corto(x, 60)).filter(Boolean).slice(0, 6),
    colorPrincipal: color(c.colorPrincipal, '#121212'), colorBoton: color(c.colorBoton, '#16a34a'), colorAcento: color(c.colorAcento, '#0f3a3f'),
    whatsapp: txt(c.whatsapp).replace(/\D/g, '').slice(0, 15), pixelMeta: txt(c.pixelMeta).replace(/\D/g, '').slice(0, 20),
    seoTitulo: corto(c.seoTitulo, 70), seoDescripcion: corto(c.seoDescripcion, 170), seoImagen: url(c.seoImagen),
  };
}
export function guardarConfigTienda(storeId: string, raw: unknown): TiendaConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Fila;
  db.prepare('UPDATE stores SET tienda_config = ? WHERE id = ?').run(JSON.stringify({ ...configTienda(storeId), ...r }), storeId);
  const limpio = configTienda(storeId);
  db.prepare('UPDATE stores SET tienda_config = ? WHERE id = ?').run(JSON.stringify(limpio), storeId);
  return limpio;
}
export interface ProductoCatalogo { slug: string; nombre: string; foto: string; foto2: string; precio: number; precioAntes: number; calificacion: number; resenas: string }
export function catalogoTienda(storeId: string): ProductoCatalogo[] {
  return (db.prepare("SELECT slug, datos FROM landings WHERE store_id = ? AND estado = 'publicada' ORDER BY publicada_at DESC").all(storeId) as { slug: string; datos: string }[]).map((r) => {
    const d = limpiarDatos(pj(r.datos, {}));
    const b = d.bundles[0];
    const precio = b ? b.precio / b.cantidad : d.precio;
    const antes = b ? b.precioAntes / b.cantidad : d.precioAntes;
    return { slug: r.slug, nombre: d.nombre, foto: d.galeria[0] || '', foto2: d.galeria[1] || '', precio: Math.round(precio), precioAntes: Math.round(antes > precio ? antes : 0), calificacion: d.calificacion, resenas: d.resenas };
  });
}
/** Página de inicio de la tienda: la landing elegida o, si no hay, el catálogo. `base` = prefijo de los enlaces. */
export function inicioTienda(storeId: string, base: string, origen = ''): { html: string; landingId: string } | null {
  if (!tiendaEnLinea(storeId)) return null;
  const ini = txt((db.prepare('SELECT landing_inicio FROM stores WHERE id = ?').get(storeId) as { landing_inicio: string } | undefined)?.landing_inicio);
  if (ini) {
    const r = db.prepare("SELECT id, datos FROM landings WHERE store_id = ? AND id = ? AND estado = 'publicada'").get(storeId, ini) as { id: string; datos: string } | undefined;
    if (r) return { html: renderLanding(limpiarDatos(pj(r.datos, {})), { id: r.id, inicio: base, tienda: configTienda(storeId), url: origen ? origen + base : '' }), landingId: r.id };
  }
  return { html: renderCatalogo(configTienda(storeId), catalogoTienda(storeId), base, false, origen), landingId: '' };
}

/** Landing publicada de una tienda por su dirección (para el dominio propio). Sin slug = la de inicio. */
export function landingDeTienda(storeId: string, slug: string): { storeId: string; id: string; datos: LandingDatos } | null {
  if (!tiendaEnLinea(storeId)) return null;
  let r: { id: string; datos: string } | undefined;
  if (slug) r = db.prepare("SELECT id, datos FROM landings WHERE store_id = ? AND slug = ? AND estado = 'publicada'").get(storeId, slug.toLowerCase()) as typeof r;
  else {
    const ini = txt((db.prepare('SELECT landing_inicio FROM stores WHERE id = ?').get(storeId) as { landing_inicio: string } | undefined)?.landing_inicio);
    r = (ini ? db.prepare("SELECT id, datos FROM landings WHERE store_id = ? AND id = ? AND estado = 'publicada'").get(storeId, ini) : undefined) as typeof r
      || db.prepare("SELECT id, datos FROM landings WHERE store_id = ? AND estado = 'publicada' ORDER BY publicada_at DESC LIMIT 1").get(storeId) as typeof r;
  }
  return r ? { storeId, id: r.id, datos: limpiarDatos(pj(r.datos, {})) } : null;
}

// ── Dominio propio ─────────────────────────────────────────────────────
/**
 * La tienda apunta su dominio (CNAME) a LANDINGS_CNAME y sus landings quedan en
 * https://sudominio.com/<landing>. El certificado lo pone el proxy (Cloudflare for SaaS
 * si están CF_API_TOKEN y CF_ZONE_ID; si no, el dominio se agrega a mano en el hosting).
 */
/**
 * Dominio de DealFlow para las landings (ej. dflw.store, en Cloudflare). Con él cada tienda
 * tiene gratis <su-nombre>.dflw.store y los dominios propios apuntan a landings.dflw.store.
 * Vacío = todavía no está configurado: las landings siguen en app.dealflow.sbs/l/…
 */
let hosts: Map<string, string> | null = null;
const refrescarHosts = () => { hosts = null; };
export const RAIZ_LANDINGS = (process.env.LANDINGS_RAIZ || '').toLowerCase().replace(/^\.+|\.+$/g, '');
export const CNAME_LANDINGS = (process.env.LANDINGS_CNAME || (RAIZ_LANDINGS ? `landings.${RAIZ_LANDINGS}` : 'landings.dealflow.sbs')).toLowerCase();
try { db.exec("ALTER TABLE stores ADD COLUMN landing_sub TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_landing_sub ON stores(landing_sub) WHERE landing_sub <> ''");
const SUB_RESERVADOS = new Set(['www', 'landings', 'app', 'api', 'admin', 'mail', 'correo', 'smtp', 'ftp', 'dealflow', 'soporte', 'ayuda', 'blog', 'tienda', 'tiendas', 'static', 'cdn', 'dev', 'test', 'staging', 'l']);
/** Subdominio gratis de la tienda (la primera vez sale del nombre de la tienda). */
export function subdominioTienda(storeId: string): string {
  const r = db.prepare('SELECT landing_sub FROM stores WHERE id = ?').get(storeId) as { landing_sub: string } | undefined;
  if (!r) return '';
  if (r.landing_sub) return r.landing_sub;
  let base = slugTienda(storeId).replace(/-+/g, '-').slice(0, 40) || 'tienda';
  if (SUB_RESERVADOS.has(base)) base += '-shop';
  let sub = base;
  for (let n = 2; db.prepare('SELECT 1 FROM stores WHERE landing_sub = ?').get(sub); n++) sub = `${base}-${n}`;
  db.prepare("UPDATE stores SET landing_sub = ? WHERE id = ? AND landing_sub = ''").run(sub, storeId);
  return (db.prepare('SELECT landing_sub FROM stores WHERE id = ?').get(storeId) as { landing_sub: string }).landing_sub;
}
export function cambiarSubdominio(storeId: string, valor: string): { ok: true } | { error: string } {
  const sub = String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (sub.length < 3) return { error: 'El nombre debe tener al menos 3 letras o números.' };
  if (SUB_RESERVADOS.has(sub)) return { error: `"${sub}" está reservado. Elige otro.` };
  if (db.prepare('SELECT 1 FROM stores WHERE landing_sub = ? AND id != ?').get(sub, storeId)) return { error: `${sub}.${RAIZ_LANDINGS || 'dflw.store'} ya lo tiene otra tienda. Elige otro.` };
  db.prepare('UPDATE stores SET landing_sub = ? WHERE id = ?').run(sub, storeId);
  refrescarHosts();
  return { ok: true };
}
const cf = () => (process.env.CF_API_TOKEN && process.env.CF_ZONE_ID ? { token: process.env.CF_API_TOKEN, zona: process.env.CF_ZONE_ID } : null);

/** Tienda dueña de un host (con o sin www). */
export function tiendaDeHost(host: string): string | null {
  if (!hosts) {
    hosts = new Map();
    for (const r of db.prepare("SELECT id, landing_dominio FROM stores WHERE landing_dominio != ''").all() as { id: string; landing_dominio: string }[]) {
      hosts.set(r.landing_dominio, r.id);
      hosts.set(r.landing_dominio.startsWith('www.') ? r.landing_dominio.slice(4) : 'www.' + r.landing_dominio, r.id);
    }
    setTimeout(refrescarHosts, 60e3).unref?.();
  }
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const propio = hosts.get(h);
  if (propio) return propio;
  // <tienda>.dflw.store (el subdominio gratis)
  if (RAIZ_LANDINGS && h.endsWith('.' + RAIZ_LANDINGS)) {
    const sub = h.slice(0, -RAIZ_LANDINGS.length - 1);
    if (!sub.includes('.') && !SUB_RESERVADOS.has(sub)) {
      const r = db.prepare('SELECT id FROM stores WHERE landing_sub = ?').get(sub) as { id: string } | undefined;
      if (r) return r.id;
    }
  }
  return null;
}
function dominioActivo(storeId: string): string {
  const r = db.prepare('SELECT landing_dominio, landing_dominio_estado FROM stores WHERE id = ?').get(storeId) as { landing_dominio: string; landing_dominio_estado: string } | undefined;
  if (r?.landing_dominio && r.landing_dominio_estado === 'activo') return r.landing_dominio;
  return RAIZ_LANDINGS ? `${subdominioTienda(storeId)}.${RAIZ_LANDINGS}` : '';
}
export function normalizarDominio(v: string): string | null {
  const d = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d)) return null;
  if ((RAIZ_LANDINGS && (d === RAIZ_LANDINGS || d.endsWith('.' + RAIZ_LANDINGS))) || /(^|\.)dealflow\.(sbs|co)$/.test(d) || /(^|\.)(railway\.app|up\.railway\.app|myshopify\.com)$/.test(d)) return null;
  return d;
}
export interface EstadoDominio { dominio: string; estado: string; detalle: string; cname: string; nombreRegistro: string; inicio: string; raiz: string; sub: string }
export function estadoDominio(storeId: string): EstadoDominio {
  const r = db.prepare('SELECT landing_dominio, landing_dominio_estado, landing_dominio_detalle, landing_inicio FROM stores WHERE id = ?').get(storeId) as Fila | undefined;
  const dom = txt(r?.landing_dominio);
  const partes = dom.split('.');
  return { dominio: dom, estado: txt(r?.landing_dominio_estado), detalle: txt(r?.landing_dominio_detalle), cname: CNAME_LANDINGS, nombreRegistro: partes.length > 2 ? partes.slice(0, partes.length - 2).join('.') : '@', inicio: txt(r?.landing_inicio), raiz: RAIZ_LANDINGS, sub: RAIZ_LANDINGS ? subdominioTienda(storeId) : '' };
}
async function cfApi(metodo: string, ruta: string, cuerpo?: unknown): Promise<Fila | null> {
  const c = cf();
  if (!c) return null;
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${c.zona}${ruta}`, { method: metodo, headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(15000) });
    return await r.json() as Fila;
  } catch (e) { return { success: false, errors: [{ message: (e as Error).message }] }; }
}
export async function conectarDominio(storeId: string, valor: string): Promise<EstadoDominio | { error: string }> {
  const dom = normalizarDominio(valor);
  if (!dom) return { error: 'Escribe un dominio válido, por ejemplo www.tutienda.com.' };
  const otro = db.prepare("SELECT id FROM stores WHERE (landing_dominio = ? OR landing_dominio = ?) AND id != ?").get(dom, dom.startsWith('www.') ? dom.slice(4) : 'www.' + dom, storeId);
  if (otro) return { error: 'Ese dominio ya está conectado a otra tienda de DealFlow.' };
  await quitarDominio(storeId);
  let cfId = ''; let detalle = `Crea en tu proveedor de dominio un registro CNAME que apunte a ${CNAME_LANDINGS}.`;
  const r = await cfApi('POST', '/custom_hostnames', { hostname: dom, ssl: { method: 'http', type: 'dv' } });
  if (r) {
    if (r.success) cfId = txt((r.result as Fila)?.id);
    else detalle = `No se pudo registrar el dominio en el proxy: ${((r.errors as Fila[]) || []).map((e) => txt(e.message)).join(' · ') || 'error desconocido'}`;
  }
  db.prepare("UPDATE stores SET landing_dominio = ?, landing_dominio_estado = 'pendiente', landing_dominio_detalle = ?, landing_dominio_cf = ? WHERE id = ?").run(dom, detalle, cfId, storeId);
  refrescarHosts();
  registrarLog(storeId, 'info', 'landing', `Dominio propio conectado: ${dom} (pendiente de verificar).`);
  return estadoDominio(storeId);
}
export async function quitarDominio(storeId: string): Promise<void> {
  const r = db.prepare('SELECT landing_dominio_cf FROM stores WHERE id = ?').get(storeId) as { landing_dominio_cf: string } | undefined;
  if (r?.landing_dominio_cf) await cfApi('DELETE', `/custom_hostnames/${r.landing_dominio_cf}`);
  db.prepare("UPDATE stores SET landing_dominio = '', landing_dominio_estado = '', landing_dominio_detalle = '', landing_dominio_cf = '' WHERE id = ?").run(storeId);
  refrescarHosts();
}
/** Comprueba que el dominio ya llega a DealFlow con HTTPS (pide /l/ping por el dominio). */
export async function verificarDominio(storeId: string): Promise<EstadoDominio> {
  const e = estadoDominio(storeId);
  if (!e.dominio) return e;
  let estado = 'pendiente'; let detalle = '';
  try {
    const r = await fetch(`https://${e.dominio}/l/ping`, { signal: AbortSignal.timeout(9000), redirect: 'follow' });
    const j = await r.json().catch(() => ({})) as Fila;
    if (j.df === 'landings') { estado = 'activo'; detalle = '¡Listo! Tus landings ya cargan en tu dominio.'; }
    else detalle = `Tu dominio responde, pero todavía no apunta a DealFlow (respondió ${r.status}). Revisa que el CNAME apunte a ${CNAME_LANDINGS}.`;
  } catch (x) {
    const m = (x as Error).message || '';
    detalle = /certificate|SSL|TLS|ERR_TLS|self.signed/i.test(m + String((x as { cause?: unknown }).cause || ''))
      ? 'El dominio ya apunta, pero el certificado de seguridad (HTTPS) aún se está generando. Vuelve a verificar en unos minutos.'
      : `Todavía no encontramos tu dominio apuntando a DealFlow. Crea el CNAME hacia ${CNAME_LANDINGS} (los cambios de DNS pueden tardar hasta unas horas).`;
  }
  if (estado !== 'activo') {
    const c = db.prepare('SELECT landing_dominio_cf FROM stores WHERE id = ?').get(storeId) as { landing_dominio_cf: string };
    if (c.landing_dominio_cf) {
      const r = await cfApi('GET', `/custom_hostnames/${c.landing_dominio_cf}`);
      const res = (r?.result || {}) as Fila;
      if (r?.success && txt(res.status) === 'active' && txt((res.ssl as Fila)?.status) === 'active') detalle += ' (El proxy ya tiene el certificado listo.)';
      else if (r?.success) detalle += ` (Proxy: ${txt(res.status) || 'pendiente'}, certificado: ${txt((res.ssl as Fila)?.status) || 'pendiente'}.)`;
    }
  }
  db.prepare('UPDATE stores SET landing_dominio_estado = ?, landing_dominio_detalle = ? WHERE id = ?').run(estado, detalle, storeId);
  return estadoDominio(storeId);
}
export function elegirInicio(storeId: string, landingId: string): boolean {
  if (landingId && !db.prepare('SELECT 1 FROM landings WHERE id = ? AND store_id = ?').get(landingId, storeId)) return false;
  db.prepare('UPDATE stores SET landing_inicio = ? WHERE id = ?').run(landingId || '', storeId);
  return true;
}

export function contarVista(id: string) { try { db.prepare('UPDATE landings SET vistas = vistas + 1 WHERE id = ?').run(id); } catch { /* opcional */ } }

/** HTML de la landing con su plantilla. */
export { renderLanding, renderCatalogo, paginaNoDisponible } from './landingPlantillas.js';

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
  if (!l || !tiendaEnLinea(txt(l.store_id))) return { error: 'Esta página ya no está recibiendo pedidos.' };
  const storeId = txt(l.store_id);
  const d = limpiarDatos(pj(txt(l.datos), {}));
  const bundles = d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: '1 unidad', subtitulo: '', precio: d.precio, precioAntes: 0, insignia: '', imagen: '' }];
  const bundle = bundles[Math.max(0, Math.min(bundles.length - 1, Math.round(num(b.bundle))))];
  const nombre = [corto(b.nombre, 60), corto(b.apellido, 60)].filter(Boolean).join(' ');
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

/** sitemap.xml de la tienda (página de inicio + cada producto publicado). */
export function sitemapTienda(storeId: string, origen: string): string {
  const filas = db.prepare("SELECT slug, updated_at FROM landings WHERE store_id = ? AND estado = 'publicada' ORDER BY publicada_at DESC").all(storeId) as { slug: string; updated_at: string }[];
  const u = (loc: string, mod?: string) => `<url><loc>${loc.replace(/&/g, '&amp;')}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u(origen + '/')}${filas.map((f) => u(`${origen}/${f.slug}`, f.updated_at)).join('')}</urlset>`;
}
