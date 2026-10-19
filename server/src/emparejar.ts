/**
 * Empareja un ítem de pedido ("Vestido Layla (Talla M · Blanco)") con el producto
 * y la variante EXACTOS del catálogo de la tienda.
 *
 * Se usa en dos momentos:
 *  - Al crear el pedido: se guarda product_id/variant_id en order_items, así el
 *    despacho ya no depende del nombre (que puede cambiar o venir distinto).
 *  - Al despachar pedidos viejos sin ids: se empareja por nombre, tolerando
 *    palabras de más/de menos y errores de tipeo.
 */
import { db } from './db.js';

export const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface VarBase { productId: string; variantId: string | null; producto: string; label: string }

/** Todas las variantes (y productos sin variantes) de la tienda. */
export function variantesBase(storeId: string): VarBase[] {
  const out: VarBase[] = [];
  const prods = db.prepare('SELECT id, nombre FROM products WHERE store_id = ?').all(storeId) as { id: string; nombre: string }[];
  const vst = db.prepare('SELECT id, label FROM variants WHERE product_id = ?');
  for (const p of prods) {
    const vs = vst.all(p.id) as { id: string; label: string }[];
    if (!vs.length) out.push({ productId: p.id, variantId: null, producto: p.nombre, label: '' });
    for (const v of vs) out.push({ productId: p.id, variantId: v.id, producto: p.nombre, label: v.label || '' });
  }
  return out;
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
const mismoToken = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);

/**
 * Qué tanto se parece el nombre de un ítem a un producto (0 a 1). Tolera palabras
 * de más en el ítem (la talla/color escritos sin paréntesis) y errores de tipeo.
 */
export function parecido(itemBase: string, itemCompleto: string, producto: string): number {
  const nb = norm(itemBase); const np = norm(producto);
  if (!nb || !np) return 0;
  if (nb === np) return 1;
  const tp = np.split(' ').filter((t) => t.length >= 2);
  const tb = nb.split(' ').filter((t) => t.length >= 2);
  const tc = norm(itemCompleto).split(' ').filter((t) => t.length >= 1);
  if (!tp.length || !tb.length) return 0;
  // Todas las palabras del producto están en el ítem completo (con o sin variante).
  if (tp.every((t) => tc.some((x) => mismoToken(x, t)))) return 0.95;
  const comunes = tp.filter((t) => tb.some((x) => mismoToken(x, t))).length;
  const jaccard = comunes / (tp.length + tb.length - comunes);
  if (np.includes(nb) || nb.includes(np)) return Math.max(0.85, jaccard);
  return jaccard;
}

export interface Emparejado<T extends VarBase> { v?: T; motivo: string; parecidos: { producto: string; puntaje: number }[] }

/** Elige la variante del ítem dentro de `todas`. */
export function emparejarItem<T extends VarBase>(nombreItem: string, todas: T[]): Emparejado<T> {
  const base = nombreItem.split('(')[0].split(' - ')[0].trim();
  // Puntaje por producto (una vez por producto, no por variante).
  const porProducto = new Map<string, { producto: string; puntaje: number }>();
  for (const v of todas) if (!porProducto.has(v.productId)) porProducto.set(v.productId, { producto: v.producto, puntaje: parecido(base, nombreItem, v.producto) });
  const ranking = [...porProducto.entries()].sort((a, b) => b[1].puntaje - a[1].puntaje || b[1].producto.length - a[1].producto.length);
  const parecidos = ranking.slice(0, 5).map(([, x]) => ({ producto: x.producto, puntaje: Math.round(x.puntaje * 100) / 100 }));
  const [mejor, segundo] = ranking;
  if (!mejor || mejor[1].puntaje < 0.6) return { motivo: 'el producto no existe con ese nombre en DealFlow', parecidos };
  // Dos productos casi igual de parecidos: preferimos no adivinar (salvo coincidencia exacta).
  if (segundo && mejor[1].puntaje < 1 && segundo[1].puntaje >= mejor[1].puntaje - 0.05 && segundo[1].puntaje >= 0.6) {
    return { motivo: `hay varios productos parecidos (${mejor[1].producto} / ${segundo[1].producto})`, parecidos };
  }
  const vs = todas.filter((v) => v.productId === mejor[0]);
  if (vs.length === 1) return { v: vs[0], motivo: '', parecidos };
  const unicas = vs.filter((v) => !v.label || norm(v.label) === 'unica');
  const m = nombreItem.match(/\(([^)]+)\)/);
  const etiqueta = norm((m ? m[1] : nombreItem.includes(' - ') ? nombreItem.split(' - ').slice(1).join(' ') : '').replace(/talla|color/gi, ''));
  if (etiqueta) {
    const tokE = etiqueta.split(' ').filter(Boolean);
    const hit = vs.find((v) => norm(v.label) === etiqueta)
      // Mismas palabras en cualquier orden ("M · Blanco" = "Blanco · M").
      || vs.find((v) => { const tl = norm(v.label).split(' ').filter(Boolean); return tl.length === tokE.length && tl.every((t) => tokE.includes(t)); })
      || vs.find((v) => v.label && (etiqueta.includes(norm(v.label)) || norm(v.label).includes(etiqueta)));
    if (hit) return { v: hit, motivo: '', parecidos };
  }
  // Variante escrita sin paréntesis ("Vestido Dianne Azul rey M"): todas las palabras del label en el nombre.
  const full = norm(nombreItem);
  let mejorV: T | undefined; let score = 0;
  for (const v of vs) {
    const toks = norm(v.label).split(' ').filter((t) => t.length > 0);
    if (toks.length && toks.every((t) => new RegExp(`(^| )${t}( |$)`).test(full)) && toks.length > score) { mejorV = v; score = toks.length; }
  }
  if (mejorV) return { v: mejorV, motivo: '', parecidos };
  if (unicas.length === 1 && !etiqueta) return { v: unicas[0], motivo: '', parecidos };
  return { motivo: `no se identificó la talla/color "${m ? m[1] : ''}" entre las variantes de ${mejor[1].producto}`, parecidos };
}

/** Para guardar en order_items al crear el pedido. */
export function idsDeItem(storeId: string, nombreItem: string): { productId: string; variantId: string } {
  try {
    const r = emparejarItem(nombreItem, variantesBase(storeId));
    if (r.v) return { productId: r.v.productId, variantId: r.v.variantId || '' };
    // Producto claro pero variante no: al menos el producto.
    return { productId: '', variantId: '' };
  } catch { return { productId: '', variantId: '' }; }
}
