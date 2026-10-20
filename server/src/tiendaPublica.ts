/**
 * URL pública propia de cada tienda: https://app.dealflow.sbs/tienda/<slug>.
 *
 * Sirve como "URL de la tienda" al crear el token de integración en Dropi (Dropi
 * lo pide pensando en WooCommerce/Dropify). Así ningún cliente necesita tener
 * página web propia. El slug se asigna UNA vez y no cambia aunque la tienda cambie
 * de nombre: si cambiara, Dropi rechazaría el token (la URL debe ser idéntica).
 */
import { db } from './db.js';

try { db.exec("ALTER TABLE stores ADD COLUMN slug TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug) WHERE slug <> ''");

export const BASE_TIENDA = (process.env.PUBLIC_APP_URL || 'https://app.dealflow.sbs').replace(/\/+$/, '');

const slugify = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tienda';

/** Slug estable de la tienda (lo crea la primera vez). */
export function slugTienda(storeId: string): string {
  const s = db.prepare('SELECT nombre, slug FROM stores WHERE id = ?').get(storeId) as { nombre: string; slug: string } | undefined;
  if (!s) return '';
  if (s.slug) return s.slug;
  const base = slugify(s.nombre);
  let slug = base;
  for (let n = 2; db.prepare('SELECT 1 FROM stores WHERE slug = ?').get(slug); n++) slug = `${base}-${n}`;
  db.prepare("UPDATE stores SET slug = ? WHERE id = ? AND slug = ''").run(slug, storeId);
  return (db.prepare('SELECT slug FROM stores WHERE id = ?').get(storeId) as { slug: string }).slug;
}

export const urlTienda = (storeId: string) => { const s = slugTienda(storeId); return s ? `${BASE_TIENDA}/tienda/${s}` : ''; };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Página pública sencilla de la tienda (por si Dropi u otro servicio la visita). Null si no existe. */
export function paginaTienda(slug: string): string | null {
  const s = db.prepare('SELECT nombre FROM stores WHERE slug = ? AND activa = 1').get(String(slug || '').toLowerCase()) as { nombre: string } | undefined;
  if (!s) return null;
  const nombre = esc(s.nombre);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nombre}</title><meta name="description" content="${nombre} · tienda en línea">
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0b1026;color:#e8ebff}
main{text-align:center;padding:32px 16px}h1{font-size:clamp(28px,6vw,44px);margin:0 0 8px}p{margin:0;color:#a6adda}small{display:block;margin-top:28px;color:#6f77a8;font-size:12px}</style>
</head><body><main><h1>${nombre}</h1><p>Tienda en línea · pedidos por WhatsApp</p><small>Con la tecnología de DealFlow</small></main></body></html>`;
}
