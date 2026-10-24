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
import { randomUUID } from 'node:crypto';

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
export const mismoToken = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);

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
  // Varios productos con el mismo nombre (o casi): se usa el que SÍ tiene la talla/color pedidos.
  const empatados = ranking.filter(([, x]) => x.puntaje >= 0.6 && x.puntaje >= mejor[1].puntaje - 0.05);
  if (empatados.length > 1) {
    const conVariante = empatados.map(([pid]) => emparejarItem(nombreItem, todas.filter((v) => v.productId === pid))).filter((r) => r.v);
    if (conVariante.length === 1 || (conVariante.length > 1 && mejor[1].puntaje === 1)) return { ...conVariante[0], parecidos };
  }
  // Dos productos casi igual de parecidos: preferimos no adivinar (salvo coincidencia exacta).
  if (segundo && mejor[1].puntaje < 1 && segundo[1].puntaje >= mejor[1].puntaje - 0.05 && segundo[1].puntaje >= 0.6) {
    return { motivo: `hay varios productos parecidos (${mejor[1].producto} / ${segundo[1].producto})`, parecidos };
  }
  const vs = todas.filter((v) => v.productId === mejor[0]);
  if (vs.length === 1) return { v: vs[0], motivo: '', parecidos };
  const unicas = vs.filter((v) => !v.label || norm(v.label) === 'unica');
  const m = nombreItem.match(/\(([^)]+)\)/);
  // Palabras de la talla/color pedidas, sin rótulos ("Talla XL · Amarillo" → xl, amarillo).
  const tokE = tokensVariante(m ? m[1] : nombreItem.includes(' - ') ? nombreItem.split(' - ').slice(1).join(' ') : '');
  if (tokE.length) {
    // 1) Mismas palabras en cualquier orden (tolerando "amarilla"/"amarillo").
    const exacta = vs.find((v) => { const tl = tokensVariante(v.label); return tl.length === tokE.length && tl.every((t) => tokE.some((x) => mismoToken(x, t))); });
    if (exacta) return { v: exacta, motivo: '', parecidos };
    // 2) Todas las palabras de la variante están en lo pedido (la de más palabras gana).
    let mejorV: T | undefined; let score = 0;
    for (const v of vs) {
      const tl = tokensVariante(v.label);
      if (tl.length && tl.every((t) => tokE.some((x) => mismoToken(x, t))) && tl.length > score) { mejorV = v; score = tl.length; }
    }
    if (mejorV) return { v: mejorV, motivo: '', parecidos };
    // 3) Lo pedido está contenido en la variante ("Negro · L" ⊂ "Negro con blanco · L"):
    //    gana la que menos palabras de más tenga, solo si es la única con ese mínimo.
    const cands = vs.map((v) => ({ v, tl: tokensVariante(v.label) }))
      .filter((x) => tokE.every((t) => x.tl.some((y) => mismoToken(y, t))))
      .map((x) => ({ v: x.v, extra: x.tl.length - tokE.length }))
      .sort((a, b) => a.extra - b.extra);
    if (cands.length && (cands.length === 1 || cands[1].extra > cands[0].extra)) return { v: cands[0].v, motivo: '', parecidos };
  }
  // Variante escrita sin paréntesis ("Vestido Dianne Azul rey M"): todas las palabras del label en el nombre.
  const full = tokensVariante(nombreItem);
  let mejorV: T | undefined; let score = 0;
  for (const v of vs) {
    const tl = tokensVariante(v.label);
    if (tl.length && tl.every((t) => full.some((x) => mismoToken(x, t))) && tl.length > score) { mejorV = v; score = tl.length; }
  }
  if (mejorV) return { v: mejorV, motivo: '', parecidos };
  if (unicas.length === 1 && !tokE.length) return { v: unicas[0], motivo: '', parecidos };
  // Solo las variantes parecidas (misma talla o mismo color), no la lista completa.
  const cerca = vs.filter((v) => { const tl = tokensVariante(v.label); return tokE.some((t) => tl.some((x) => mismoToken(x, t))); });
  return {
    motivo: `el producto ${mejor[1].producto} no tiene la variante "${m ? m[1] : ''}"${cerca.length ? ` (parecidas: ${cerca.slice(0, 10).map((v) => v.label).join(', ')}${cerca.length > 10 ? '…' : ''})` : ` (tiene ${vs.length} variantes y ninguna con esa talla o color)`}. Créala en el producto o corrige el pedido${empatados.length > 1 ? `. Ojo: tienes ${empatados.length} productos con nombre parecido (${empatados.map(([, x]) => x.producto).join(', ')}) y ninguno tiene esa variante; elimina el duplicado` : ''}`,
    parecidos,
  };
}

// Rótulos que no identifican la variante ("Talla", "Color"…): se ignoran al comparar.
// "Unicolor", "liso"… describen el color pero el cliente casi nunca los dice: "Negro" = "Negro Unicolor".
const ROTULOS = new Set(['talla', 'tallas', 'color', 'colores', 'size', 'tamano', 'referencia', 'ref', 'unicolor', 'liso', 'lisa', 'solido', 'solida', 'entero', 'entera']);
export function tokensVariante(s: string): string[] {
  const alias: Record<string, string> = { xxl: '2xl', xxxl: '3xl', xxs: '2xs' };
  // "T8" / "T-8" = talla 8.
  return norm(s).split(' ').filter((t) => t && !ROTULOS.has(t)).map((t) => alias[t] || t.replace(/^t(\d{1,2})$/, '$1'));
}

// Palabras que describen el TIPO de prenda y no el producto: "Pantalón Helen" en Effi
// puede llamarse "Helen" o "Jean Helen". No sirven para saber de qué producto es.
const GENERICAS = new Set(['pantalon', 'pantalones', 'jean', 'jeans', 'vestido', 'blusa', 'camisa', 'camiseta', 'conjunto', 'set', 'falda', 'short', 'shorts', 'chaqueta', 'buzo', 'top', 'body', 'enterizo', 'leggins', 'legging', 'licra', 'sudadera', 'bolso', 'zapato', 'zapatos', 'tenis', 'sandalia', 'sandalias', 'dama', 'mujer', 'hombre', 'nino', 'nina', 'de', 'la', 'el', 'con', 'y', 'para']);
const VACIAS = new Set(['de', 'la', 'el', 'con', 'y', 'para', 'unica', 'u']);

/** Palabras distintivas del nombre de un producto, para buscarlo en Effi. */
export function palabrasClave(producto: string): string[] {
  return norm(producto).split(' ').filter((t) => t.length >= 3 && !GENERICAS.has(t));
}

export interface ArticuloBase { id: string; descripcion: string; stock?: number | null; drop?: number }

/**
 * Empareja las variantes de UN producto con artículos de Effi por nombre, aunque el
 * orden de las palabras cambie ("Pantalón Helen" + "Talla 8 · Negro" ↔
 * "PANTALON HELEN NEGRO T8"). Un artículo es del producto si contiene sus palabras
 * distintivas; lo que le sobra al nombre (talla, color) tiene que ser exactamente la
 * variante. Nunca asigna el mismo artículo a dos variantes. Devuelve variantId → artículo.
 */
export function emparejarArticulos<A extends ArticuloBase>(producto: string, variantes: { variantId: string; label: string }[], arts: A[], usados: Set<string> = new Set()): Map<string, A> {
  const out = new Map<string, A>();
  const tp = norm(producto).split(' ').filter(Boolean);
  const clave = palabrasClave(producto);
  if (!clave.length) return out;
  const tiene = (lista: string[], t: string) => lista.some((x) => (t.length < 4 || x.length < 4 ? x === t : mismoToken(x, t)));
  // Artículos del producto, con lo que les sobra del nombre.
  const cands = arts.map((a) => {
    const ta = tokensVariante(a.descripcion);
    return { a, ta, resto: ta.filter((t) => !tiene(tp, t) && !VACIAS.has(t) && !GENERICAS.has(t)) };
  }).filter((x) => clave.every((t) => x.ta.includes(t))); // exacto: "Helen" no es "Helena"
  if (!cands.length) return out;
  // Entre artículos iguales: primero el del proveedor (dropshipping), luego el de más stock.
  const mejor = (lista: typeof cands) => [...lista].sort((x, y) => ((y.a.drop === 1 ? 1 : 0) - (x.a.drop === 1 ? 1 : 0)) || (Number(y.a.stock ?? -1) - Number(x.a.stock ?? -1)) || Number(y.a.id) - Number(x.a.id))[0];
  const pendientes = variantes.map((v) => ({ v, tv: tokensVariante(v.label).filter((t) => !VACIAS.has(t)) }));
  // 1) Lo que sobra es EXACTAMENTE la variante (mismas palabras, cualquier orden).
  for (const { v, tv } of pendientes) {
    const exactos = cands.filter((c) => !usados.has(c.a.id) && c.resto.length === tv.length && tv.every((t) => tiene(c.resto, t)));
    if (!exactos.length) continue;
    const a = mejor(exactos).a;
    out.set(v.variantId, a); usados.add(a.id);
  }
  // 2) La variante está contenida y es el artículo con menos palabras de más (sin empates).
  for (const { v, tv } of pendientes) {
    if (out.has(v.variantId) || !tv.length) continue;
    const sub = cands.filter((c) => !usados.has(c.a.id) && tv.every((t) => tiene(c.resto, t))).map((c) => ({ c, extra: c.resto.length - tv.length })).sort((x, y) => x.extra - y.extra);
    if (sub.length && (sub.length === 1 || sub[1].extra > sub[0].extra)) { out.set(v.variantId, sub[0].c.a); usados.add(sub[0].c.a.id); }
  }
  return out;
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

/**
 * Un ítem con VARIAS variantes en el detalle ("4x Falda (Talla L · Verde menta, Verde
 * militar, Blanco, Negro)") se separa en un ítem por variante: en Effi (y en Dropi)
 * cada talla/color es un artículo distinto. Solo separa cuando la lista casa con la
 * cantidad (4 colores y 4 unidades, u 8 unidades = 2 de cada uno).
 */
export function separarVariantes(qty: number, nombre: string): { qty: number; nombre: string }[] {
  const m = String(nombre).match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return [{ qty, nombre }];
  const [, base, detalle] = m;
  const partes = detalle.split(/\s*·\s*/);
  const conLista = partes.map((p, i) => ({ i, vals: p.split(/\s*(?:,|\by\b|\/)\s*/i).map((x) => x.trim()).filter(Boolean) })).filter((x) => x.vals.length > 1);
  if (conLista.length !== 1) return [{ qty, nombre }];
  const { i, vals } = conLista[0];
  if (qty < vals.length || qty % vals.length !== 0) return [{ qty, nombre }];
  // "Talla L" + lista de colores: el prefijo de la parte (p. ej. "Color: ") se conserva.
  const pre = (partes[i].match(/^([^:]+:\s*)/) || ['', ''])[1];
  return vals.map((v) => {
    const ps = [...partes];
    ps[i] = pre && !v.startsWith(pre) ? `${pre}${v.replace(pre, '')}` : v;
    return { qty: qty / vals.length, nombre: `${base} (${ps.join(' · ')})` };
  });
}

/** Separa en la base los ítems de un pedido que traen varias variantes juntas. Devuelve cuántos separó. */
export function separarItemsPedido(storeId: string, orderId: string): number {
  const items = db.prepare('SELECT id, qty, nombre, precio FROM order_items WHERE order_id = ?').all(orderId) as { id: string; qty: number; nombre: string; precio: number }[];
  let n = 0;
  for (const it of items) {
    const partes = separarVariantes(Number(it.qty) || 1, it.nombre);
    if (partes.length < 2) continue;
    db.transaction(() => {
      db.prepare('DELETE FROM order_items WHERE id = ?').run(it.id);
      for (const p of partes) {
        const ids = idsDeItem(storeId, p.nombre);
        db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio, product_id, variant_id) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), orderId, p.qty, p.nombre, it.precio, ids.productId, ids.variantId);
      }
    })();
    n++;
  }
  return n;
}

// Palabras de color y talla: si el cliente pide una que el producto no tiene, NO se vende.
const COLORES = new Set(['negro', 'negra', 'blanco', 'blanca', 'rojo', 'roja', 'azul', 'verde', 'amarillo', 'amarilla', 'naranja', 'naranjado', 'naranjada', 'anaranjado', 'anaranjada',
  'mostaza', 'salmon', 'rosado', 'rosada', 'rosa', 'fucsia', 'morado', 'morada', 'lila', 'violeta', 'purpura', 'gris', 'beige', 'cafe', 'marron', 'chocolate', 'vinotinto', 'vino',
  'terracota', 'coral', 'turquesa', 'celeste', 'crema', 'hueso', 'nude', 'camel', 'kaki', 'caqui', 'dorado', 'dorada', 'plateado', 'plateada', 'menta', 'militar', 'oliva', 'mora',
  'aguamarina', 'arena', 'champana', 'cobre', 'perla', 'marfil', 'ladrillo', 'durazno', 'melon', 'uva', 'lavanda', 'magenta', 'cereza', 'granate', 'bordo', 'azulado', 'jean', 'indigo']);
const TALLAS = /^(\d{0,1}x{0,3}[sml]|xl|\d?xl|xs|\d{1,2}|unica|u)$/;

export interface Verificacion { ok: boolean; v?: VarBase; motivo: string; producto?: string; pedido?: string; disponibles?: string }

/**
 * Verifica que lo que se va a vender EXISTE: el producto y, si tiene tallas/colores,
 * esa talla/color exacta. Más estricto que emparejarItem: si el cliente pidió un color
 * que el producto no tiene ("Naranjado" en uno que solo tiene Mostaza), aunque el
 * emparejador haya caído en otra variante, NO se acepta.
 */
export function verificarVariante(storeId: string, nombreItem: string, todas: VarBase[] = variantesBase(storeId)): Verificacion {
  const r = emparejarItem(nombreItem, todas);
  const detalle = (nombreItem.match(/\(([^)]+)\)/) || ['', ''])[1] || (nombreItem.includes(' - ') ? nombreItem.split(' - ').slice(1).join(' ') : '');
  const pidio = detalle || nombreItem;
  const prodId = r.v?.productId || (r.parecidos[0] && r.parecidos[0].puntaje >= 0.6 ? todas.find((v) => v.producto === r.parecidos[0].producto)?.productId : undefined);
  const vs = prodId ? todas.filter((v) => v.productId === prodId) : [];
  const fila = prodId ? db.prepare('SELECT nombre, opciones FROM products WHERE id = ?').get(prodId) as { nombre: string; opciones: string } | undefined : undefined;
  let opciones: { nombre: string; valores: (string | { valor: string })[] }[] = [];
  try { opciones = JSON.parse(fila?.opciones || '[]'); } catch { /* sin opciones */ }
  const valoresOpc = opciones.flatMap((o) => (o.valores || []).map((x) => (typeof x === 'string' ? x : x.valor)).filter(Boolean));
  const etiquetas = vs.map((v) => v.label).filter(Boolean);
  // Lo que SÍ hay, por posición ("Color · Talla"): para decírselo al cliente.
  const disponibles = (() => {
    if (opciones.length) return opciones.filter((o) => o.valores?.length).map((o) => `${o.nombre}: ${o.valores.map((x) => (typeof x === 'string' ? x : x.valor)).join(', ')}`).join(' / ');
    const partes = etiquetas.map((l) => l.split(/\s*·\s*/));
    const n = Math.max(0, ...partes.map((p) => p.length));
    return Array.from({ length: n }, (_, i) => [...new Set(partes.map((p) => p[i]).filter(Boolean))].join(', ')).join(' / ');
  })();
  if (!r.v) {
    if (/no tiene la variante/.test(r.motivo) && fila) return { ok: false, motivo: r.motivo, producto: fila.nombre, pedido: pidio, disponibles };
    return { ok: false, motivo: r.motivo, pedido: pidio };
  }
  // Palabras pedidas que no están en la variante elegida ni en el nombre del producto.
  const tokPedido = tokensVariante(detalle || nombreItem.replace(new RegExp(r.v.producto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ''));
  const tokLabel = tokensVariante(r.v.label);
  const tokNombre = tokensVariante(r.v.producto);
  const sobran = tokPedido.filter((t) => !tokLabel.some((x) => mismoToken(x, t)) && !tokNombre.some((x) => mismoToken(x, t)));
  if (!sobran.length) return { ok: true, v: r.v, motivo: '' };
  // Valores que este producto maneja (de sus variantes y de sus opciones).
  const tokValores = [...etiquetas, ...valoresOpc].flatMap(tokensVariante);
  const hayColores = tokValores.some((t) => COLORES.has(t));
  const hayTallas = tokValores.some((t) => TALLAS.test(t));
  const malos = sobran.filter((t) => {
    // Producto sin variantes creadas: vale cualquier valor de sus opciones.
    if (!etiquetas.length && valoresOpc.flatMap(tokensVariante).some((x) => mismoToken(x, t))) return false;
    // Es un valor de OTRA variante/opción del mismo producto (pidió Negro y cayó en Blanco).
    if (tokValores.some((x) => mismoToken(x, t))) return true;
    // Es un color/talla que el producto no tiene, en un producto que sí maneja colores/tallas.
    if (COLORES.has(t)) return hayColores;
    if (TALLAS.test(t)) return hayTallas;
    return false;
  });
  if (!malos.length) return { ok: true, v: r.v, motivo: '' };
  return { ok: false, motivo: `el producto ${r.v.producto} no tiene la variante "${pidio}"`, producto: r.v.producto, pedido: pidio, disponibles };
}
