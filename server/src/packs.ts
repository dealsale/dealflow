/**
 * Packs en pedidos de Shopify (webhook, app o extensión): muchas tiendas venden "Pack x6",
 * "Combo 4 unidades" o "Paga 3 lleva 6" como UNA línea con cantidad 1. DealFlow (y Effi,
 * Dropi) deben ver las unidades reales: 6 unidades del producto, no 1.
 *
 * Las unidades salen de:
 *   1. el combo del producto en DealFlow (products.bundles) cuyo precio o etiqueta coincide
 *      con la línea, o
 *   2. el texto de la línea (título, variante y propiedades): "pack x6", "6 unidades"…
 * Si el producto/variante de DealFlow ya ES el pack (su nombre dice "pack x6"), no se toca.
 */
import { db, pj, registrarLog } from './db.js';
import { trazar } from './trazabilidad.js';
import { idsDeItem } from './emparejar.js';

// "Kit", "set" o "caja" NO cuentan: un "Kit de 5 piezas" es un solo artículo.
const PALABRA = String.raw`(?:pack|paquete|combo|lleva|llevas|promo(?:ci[oó]n)?|oferta)`;
const UNIDAD = String.raw`(?:unidades|unidad|unds?\.?|uds?\.?|pares|productos)`;
// Fuerte: dice "pack/combo/lleva…" (vale en el título y en la variante).
const FUERTE = new RegExp(String.raw`\b${PALABRA}\s*(?:de\s+|por\s+|x\s*|×\s*)?(\d{1,3})\b(?:\s*${UNIDAD}\b)?`, 'i');
// Débiles: "6 unidades", "x6". Solo en la variante o las propiedades de la línea (en el
// título del producto suelen describir el artículo: "Brochas x12" es un solo artículo).
const DEBILES = [
  new RegExp(String.raw`\b(\d{1,3})\s*${UNIDAD}\b`, 'i'),
  /(?:^|[\s(·,/-])[x×]\s?(\d{1,3})(?=$|[\s)·,/])/i,
];

/** Unidades que trae el texto ("Pack x6" → 6). 1 si no dice nada. */
export function unidadesDelTexto(texto: string, variante = ''): { n: number; frase: string } {
  for (const [re, t] of [[FUERTE, `${texto} ${variante}`], ...DEBILES.map((d) => [d, variante] as const)] as const) {
    const m = String(t || '').match(re);
    const n = m ? Number(m[1]) : 0;
    if (n >= 2 && n <= 100) return { n, frase: m![0].trim() };
  }
  return { n: 1, frase: '' };
}
/** Quita del nombre la frase del pack: "Medias (Negro · Pack x6)" → "Medias (Negro)". */
export function quitarPack(nombre: string, frase: string): string {
  if (!frase) return nombre;
  // "Paga 3 lleva 6": también sale el "paga 3".
  const limpio = nombre.replace(frase, ' ').replace(/^ll/i.test(frase) ? /\bpaga\s*\d{1,3}\b/i : /$^/, ' ')
    .replace(/\(\s*(?:[·,/-]\s*)*\)/g, '')
    .replace(/\(\s*[·,/-]\s*/g, '(').replace(/\s*[·,/-]\s*\)/g, ')')
    .replace(/\s*·\s*·\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ').replace(/\s+\)/g, ')').trim()
    .replace(/[\s·,/-]+$/, '');
  return limpio || nombre;
}

interface Bundle { cantidad?: number; precio?: number; etiqueta?: string }
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Nombre del producto + variante de DealFlow (para saber si ya es un pack). */
function nombreDealflow(productId: string, variantId: string): string {
  if (!productId) return '';
  const p = db.prepare('SELECT nombre FROM products WHERE id = ?').get(productId) as { nombre: string } | undefined;
  const v = variantId ? db.prepare('SELECT label FROM variants WHERE id = ?').get(variantId) as { label: string } | undefined : undefined;
  return `${p?.nombre || ''} ${v?.label || ''}`;
}

export interface LineaPack { qty: number; precio: number; nombre: string; productId: string; variantId: string; unidadesPorPack: number }

/**
 * Convierte una línea (cantidad + precio por línea) en unidades reales.
 * `textoExtra`: variante y propiedades de la línea, donde las apps de packs suelen escribir.
 */
export function desempacar(storeId: string, l: { qty: number; precio: number; nombre: string; productId: string; variantId: string }, textoExtra = ''): LineaPack {
  const igual = { ...l, unidadesPorPack: 1 };
  // La variante: la que manda Shopify o, en pedidos ya guardados, lo que va entre paréntesis.
  const variante = textoExtra || (l.nombre.match(/\(([^)]*)\)\s*$/) || ['', ''])[1];
  const t = unidadesDelTexto(l.nombre, variante);
  let n = t.n;
  let nombre = t.n > 1 ? quitarPack(l.nombre, t.frase) : l.nombre;
  let ids = { productId: l.productId, variantId: l.variantId };
  // Con el nombre sin el pack se empareja mejor la variante (talla/color) de DealFlow.
  if (t.n > 1 && !ids.variantId) { const x = idsDeItem(storeId, nombre); if (x.productId) ids = x; }
  // Combos del producto en DealFlow: por etiqueta o por precio de la línea. Si la línea no
  // se emparejó con una variante, se busca el producto por su nombre.
  const prodId = ids.productId || (db.prepare('SELECT id FROM products WHERE store_id = ? AND lower(trim(nombre)) = lower(trim(?)) LIMIT 1').get(storeId, nombre.split('(')[0]) as { id: string } | undefined)?.id || '';
  if (prodId && !ids.productId) ids = { productId: prodId, variantId: '' };
  if (prodId) {
    const bundles = pj<Bundle[]>((db.prepare('SELECT bundles FROM products WHERE id = ?').get(prodId) as { bundles: string } | undefined)?.bundles || '', []);
    const porEtiqueta = bundles.find((b) => (b.cantidad || 0) > 1 && b.etiqueta && norm(`${l.nombre} ${textoExtra}`).includes(norm(b.etiqueta)));
    const porPrecio = l.qty === 1 ? bundles.find((b) => (b.cantidad || 0) > 1 && b.precio && Math.abs(b.precio - l.precio) <= 1) : undefined;
    const b = porEtiqueta || (n === 1 ? porPrecio : undefined);
    if (b?.cantidad) n = Number(b.cantidad);
  }
  if (n <= 1) return igual;
  // El producto de DealFlow ya ES el pack ("Medias pack x6" como un solo artículo): no se toca.
  const dfNombre = nombreDealflow(ids.productId, ids.variantId);
  if (unidadesDelTexto(dfNombre, dfNombre).n === n) return igual;
  // Si la cantidad ya viene en unidades (Shopify manda 6 y el título dice pack x6), tampoco.
  if (l.qty === n) return { ...igual, nombre, ...ids };
  return { qty: l.qty * n, precio: Math.round(l.precio / n), nombre, productId: ids.productId, variantId: ids.variantId, unidadesPorPack: n };
}

/**
 * Una sola vez: corrige los pedidos de Shopify que ya entraron con el pack como 1 unidad.
 * Los que ya se enviaron a Effi/Dropi se corrigen en DealFlow y se avisan en el registro,
 * porque su remisión/guía salió con la cantidad vieja.
 */
export function corregirPacksAntiguos(): void {
  if (db.prepare("SELECT 1 FROM app_flags WHERE clave = 'packs_shopify_v1'").get()) return;
  try {
    const items = db.prepare(`SELECT i.id, i.qty, i.nombre, i.precio, i.product_id, i.variant_id, o.id AS order_id, o.store_id, o.numero, o.effi_remision, o.dropi_order_id
        FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.origen = 'shopify'`).all() as Record<string, unknown>[];
    const upd = db.prepare('UPDATE order_items SET qty = ?, precio = ?, nombre = ?, product_id = ?, variant_id = ? WHERE id = ?');
    const avisos = new Map<string, string[]>();
    let n = 0;
    db.transaction(() => {
      for (const i of items) {
        const storeId = String(i.store_id);
        const r = desempacar(storeId, { qty: Number(i.qty) || 1, precio: Number(i.precio) || 0, nombre: String(i.nombre), productId: String(i.product_id || ''), variantId: String(i.variant_id || '') });
        if (r.unidadesPorPack <= 1) continue;
        upd.run(r.qty, r.precio, r.nombre, r.productId, r.variantId, i.id);
        n++;
        const enviado = String(i.effi_remision || '') || String(i.dropi_order_id || '');
        trazar(storeId, String(i.order_id), { etapa: 'pedido', nivel: enviado ? 'warn' : 'info', titulo: `Pack corregido: ${i.qty}× ${i.nombre} → ${r.qty} unidades de ${r.nombre}`, detalle: enviado ? 'Este pedido ya se había enviado al proveedor con la cantidad anterior: revisa la remisión/guía.' : 'Se corrigió antes de despacharlo.' });
        const lista = avisos.get(storeId) || [];
        lista.push(`DF-${i.numero}${enviado ? ' (ya enviado: revisa la remisión)' : ''}`);
        avisos.set(storeId, lista);
      }
    })();
    for (const [storeId, l] of avisos) registrarLog(storeId, 'warn', 'pedido', `Se corrigieron ${l.length} pedido(s) de Shopify que traían packs contados como 1 unidad: ${l.slice(0, 40).join(', ')}${l.length > 40 ? '…' : ''}.`);
    if (n) console.log(`[packs] ${n} línea(s) de pedidos de Shopify corregidas`);
  } catch (e) { console.error('[packs] corrigiendo pedidos antiguos:', e); return; }
  db.prepare("INSERT OR IGNORE INTO app_flags (clave) VALUES ('packs_shopify_v1')").run();
}
