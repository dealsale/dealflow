/**
 * Precios blindados: el servidor calcula cuánto vale un pedido con el CATÁLOGO
 * (precio normal, precio de promoción y combos) y no se fía del total que escribe la IA.
 *
 * - `precio_promo` > 0 reemplaza al precio normal por unidad (la promo siempre se aplica).
 * - Los combos ("3 por $X") se combinan con la unidad para dar el total más bajo.
 * - Los combos cuentan TODAS las unidades del mismo producto, aunque sean de tallas o
 *   colores distintos (3 camisillas de colores distintos = combo de 3).
 */
import { db } from './db.js';

export interface PreciosProducto { id: string; nombre: string; normal: number; unidad: number; promo: number; combos: { cantidad: number; precio: number }[] }

const pj = <T>(s: unknown, d: T): T => { try { return s ? JSON.parse(String(s)) as T : d; } catch { return d; } };

export function preciosDeProducto(p: Record<string, unknown>): PreciosProducto {
  const normal = Math.max(0, Math.round(Number(p.precio) || 0));
  const promo = Math.max(0, Math.round(Number(p.precio_promo) || 0));
  const unidad = promo > 0 && (!normal || promo < normal) ? promo : normal;
  const combos = pj<{ cantidad: number; precio: number }[]>(p.bundles, [])
    .map((b) => ({ cantidad: Math.round(Number(b.cantidad) || 0), precio: Math.round(Number(b.precio) || 0) }))
    .filter((b) => b.cantidad >= 1 && b.precio > 0);
  return { id: String(p.id), nombre: String(p.nombre || ''), normal, unidad, promo: unidad < normal ? unidad : 0, combos };
}

/** Total más bajo para `q` unidades combinando combos y precio por unidad. */
export function totalPorCantidad(pp: PreciosProducto, q: number): number {
  const n = Math.max(0, Math.round(q));
  if (!n) return 0;
  const best = new Array<number>(n + 1).fill(Infinity);
  best[0] = 0;
  for (let i = 1; i <= n; i++) {
    if (pp.unidad > 0) best[i] = best[i - 1] + pp.unidad;
    for (const c of pp.combos) if (c.cantidad <= i && best[i - c.cantidad] + c.precio < best[i]) best[i] = best[i - c.cantidad] + c.precio;
  }
  return Number.isFinite(best[n]) ? best[n] : 0;
}

/** Tabla "1 → $X, 2 → $Y…" para el prompt (la IA no hace cuentas: lee la tabla). */
export function tablaPrecios(pp: PreciosProducto, hasta = 6): string {
  if (!pp.unidad && !pp.combos.length) return '';
  const fmt = (n: number) => '$' + n.toLocaleString('es-CO');
  return Array.from({ length: hasta }, (_, i) => i + 1).map((q) => `${q} = ${fmt(totalPorCantidad(pp, q))}`).join(' · ');
}

export interface Revision {
  esperado: number;            // total correcto de los productos según el catálogo
  totalFinal: number;          // el que se guarda en el pedido
  ajuste: '' | 'sobrecobro' | 'subcobro';
  detalle: string;             // "3 × Camisilla de compresión = $269.700"
  unitarios: Map<string, number>; // precio unitario efectivo por producto (para los ítems)
  /** Precios más bajos escritos en reglas / mensaje inicial / promos que NO están configurados como promo o combo. */
  promosEnTexto: string[];
  /** Hay reglas de precio en texto: no se sube un total que la IA bajó (pudo aplicar esa regla). */
  reglasTexto: boolean;
}

/** Montos en pesos escritos en un texto ("$89.900", "89900", "89 mil"). */
export function montosEn(texto: string): number[] {
  const out: number[] = [];
  for (const m of String(texto || '').matchAll(/\$?\s?(\d{1,3}(?:[.,]\d{3})+|\d{5,7})(?!\d)/g)) out.push(Number(m[1].replace(/[.,]/g, '')));
  for (const m of String(texto || '').matchAll(/(\d{2,3})\s?mil\b/gi)) out.push(Number(m[1]) * 1000);
  return out.filter((n) => n >= 1000);
}

/** Textos del producto donde suele quedar escrita una promo. */
function textosDePromo(storeId: string, f: Record<string, unknown>): string[] {
  const t: string[] = [...pj<string[]>(f.reglas, []).map(String)];
  for (const b of pj<{ tipo: string; valor?: string }[]>(f.mensaje_bloques, [])) if (b.tipo === 'texto') t.push(String(b.valor || ''));
  for (const m of pj<{ bloques?: { tipo: string; valor?: string }[] }[]>(f.mensajes_iniciales, [])) for (const b of m.bloques || []) if (b.tipo === 'texto') t.push(String(b.valor || ''));
  t.push(String(f.mensaje_inicial || ''));
  const nombre = String(f.nombre || '').toLowerCase();
  for (const p of db.prepare('SELECT titulo, descripcion FROM promos WHERE store_id = ? AND activa = 1').all(storeId) as { titulo: string; descripcion: string }[]) {
    const tx = `${p.titulo} ${p.descripcion}`;
    if (nombre && tx.toLowerCase().includes(nombre.split(' ')[0])) t.push(tx);
  }
  return t.filter(Boolean);
}

/**
 * Revisa el total que puso la IA contra el catálogo. `productoDe` resuelve el id del
 * producto de cada ítem (los que no se resuelven no se cuentan y no se corrige nada).
 * `envioMax`: lo que se tolera por encima del catálogo como valor de envío.
 */
export function revisarTotal(storeId: string, items: { qty: number; productId: string }[], totalIA: number, envioMax = 25_000): Revision | null {
  if (!items.length || items.some((i) => !i.productId)) return null;
  const porProd = new Map<string, number>();
  for (const it of items) porProd.set(it.productId, (porProd.get(it.productId) || 0) + Math.max(1, Number(it.qty) || 1));
  const filas = db.prepare(`SELECT * FROM products WHERE store_id = ? AND id IN (${[...porProd.keys()].map(() => '?').join(',')})`).all(storeId, ...porProd.keys()) as Record<string, unknown>[];
  if (filas.length !== porProd.size) return null;
  let esperado = 0; let sinPromo = 0;
  const partes: string[] = [];
  const promosEnTexto: string[] = [];
  let reglasTexto = false;
  const unitarios = new Map<string, number>();
  for (const f of filas) {
    const pp = preciosDeProducto(f);
    const q = porProd.get(pp.id)!;
    const t = totalPorCantidad(pp, q);
    if (!t) return null; // producto sin precio: no hay con qué comparar
    esperado += t;
    sinPromo += pp.normal * q;
    unitarios.set(pp.id, Math.round(t / q));
    partes.push(`${q} × ${pp.nombre} = $${t.toLocaleString('es-CO')}`);
    const conocidos = new Set([pp.normal, pp.unidad, ...pp.combos.map((c) => c.precio)]);
    const montos = textosDePromo(storeId, f).flatMap(montosEn).filter((n) => !conocidos.has(n));
    if (montos.length) reglasTexto = true;
    const bajos = [...new Set(montos.filter((n) => n < pp.unidad && n >= pp.unidad * 0.3))];
    if (bajos.length) promosEnTexto.push(`${pp.nombre}: ${bajos.map((n) => '$' + n.toLocaleString('es-CO')).join(', ')} (precio configurado $${pp.unidad.toLocaleString('es-CO')})`);
  }
  const detalle = partes.join(' + ');
  const T = Math.round(Number(totalIA) || 0);
  if (!T) return { esperado, totalFinal: esperado, ajuste: '', detalle, unitarios, promosEnTexto, reglasTexto };
  // Dentro de lo esperado (+ un envío razonable): se respeta lo que puso la IA.
  if (T >= esperado - 100 && T <= esperado + envioMax) return { esperado, totalFinal: T, ajuste: '', detalle, unitarios, promosEnTexto, reglasTexto };
  if (T > esperado) {
    // Cobró de más (p. ej. ignoró la promo o el combo). Si lo de más parece envío
    // sobre el precio normal, ese envío se conserva.
    const envio = T - sinPromo >= 0 && T - sinPromo <= envioMax ? T - sinPromo : 0;
    return { esperado, totalFinal: esperado + envio, ajuste: 'sobrecobro', detalle, unitarios, promosEnTexto, reglasTexto };
  }
  // Cobró de menos. Si hay reglas de precio escritas en texto, la IA pudo aplicarlas: se respeta y se avisa.
  if (reglasTexto) return { esperado, totalFinal: T, ajuste: '', detalle, unitarios, promosEnTexto, reglasTexto };
  return { esperado, totalFinal: esperado, ajuste: 'subcobro', detalle, unitarios, promosEnTexto, reglasTexto };
}
