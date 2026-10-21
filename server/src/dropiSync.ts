/**
 * Sincronizar un producto con Dropi a partir de su ID.
 *
 * Con el ID del producto en Dropi se traen TODAS sus variaciones (talla, color…)
 * y en DealFlow:
 *  - cada variante que ya existe se vincula sola con su variación (por sus palabras,
 *    sin importar el orden ni "Blanca"/"Blanco"),
 *  - las variaciones que no existían se crean,
 *  - las opciones del producto (Talla, Color) se completan con los valores de Dropi,
 *  - el stock de cada variante se toma de Dropi cuando Dropi lo informa.
 * Desde ese momento las variantes del producto las define Dropi (variantes_fuente =
 * 'dropi'): ya no se arman combinando opciones, así no aparecen combinaciones que
 * Dropi no tiene. Las variantes de DealFlow que no existen en Dropi NO se borran
 * (pueden tener pedidos o fotos): se informan para que el dueño decida.
 */
import { db, pj, uid, registrarLog } from './db.js';
import { mismoToken, norm, tokensVariante } from './emparejar.js';
import { credDropi, productoDropi } from './dropiApi.js';

try { db.exec("ALTER TABLE products ADD COLUMN variantes_fuente TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

const VACIAS = new Set(['y', 'con', 'de', 'unica', 'u']);
const tokens = (s: string) => tokensVariante(s).filter((t) => !VACIAS.has(t));
const iguales = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.some((x) => (t.length < 4 || x.length < 4 ? x === t : mismoToken(x, t))));

/** "TALLA" / "size" / "Talla " → "Talla"; "COLOR"/"colour" → "Color". */
function nombreGrupo(n: string): string {
  const k = norm(n);
  if (/^(talla|tallas|size|sizes|medida)$/.test(k)) return 'Talla';
  if (/^(color|colores|colour)$/.test(k)) return 'Color';
  const t = String(n || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Opción';
}
// Tallas en mayúscula (S, M, XL, 2XL); lo demás con inicial mayúscula ("VERDE" → "Verde").
const bonito = (v: string) => { const t = String(v || '').trim(); return /^(\d*x{0,4}[sml]|\d+[a-z]?)$/i.test(t) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); };

export interface ResultadoSyncDropi { tipo: 'SIMPLE' | 'VARIABLE'; nombreDropi: string; vinculadas: number; creadas: number; conStock: number; sinDropi: string[]; total: number }

export async function sincronizarProductoDropi(storeId: string, productId: string, dropiIdBody?: string, silencioso = false): Promise<ResultadoSyncDropi | { error: string }> {
  const cred = credDropi(storeId);
  if (!cred) return { error: 'Conecta Dropi en Integraciones primero.' };
  const p = db.prepare('SELECT id, nombre, sku, opciones, despacho_proveedor FROM products WHERE id = ? AND store_id = ?').get(productId, storeId) as { id: string; nombre: string; sku: string; opciones: string; despacho_proveedor: string } | undefined;
  if (!p) return { error: 'Producto no encontrado.' };
  const dropiId = String(dropiIdBody || p.sku || '').replace(/\D/g, '');
  if (!dropiId) return { error: 'Escribe el ID del producto en Dropi (el número que sale en Dropi en el detalle del producto).' };
  const dp = await productoDropi(cred, dropiId);
  if ('error' in dp) return dp;

  // El producto queda vinculado a Dropi (SKU del producto = ID en Dropi).
  db.prepare("UPDATE products SET sku = ?, despacho_proveedor = CASE WHEN COALESCE(despacho_proveedor,'') = '' THEN 'dropi' ELSE despacho_proveedor END WHERE id = ?").run(dropiId, productId);
  if (dp.tipo === 'SIMPLE' || !dp.variaciones.length) {
    return { tipo: 'SIMPLE', nombreDropi: dp.name, vinculadas: 0, creadas: 0, conStock: 0, sinDropi: [], total: 0 };
  }

  // Orden de los grupos: el de las opciones actuales del producto, luego los nuevos de Dropi.
  const opciones = pj<{ nombre: string; valores: { valor: string; foto?: string }[] }[]>(p.opciones, []);
  const ordenGrupos = opciones.map((g) => nombreGrupo(g.nombre));
  for (const v of dp.variaciones) for (const a of v.attrs) { const g = nombreGrupo(a.nombre); if (!ordenGrupos.includes(g)) ordenGrupos.push(g); }

  const existentes = db.prepare("SELECT id, label, COALESCE(refs,'{}') refs FROM variants WHERE product_id = ? ORDER BY orden").all(productId) as { id: string; label: string; refs: string }[];
  const usadas = new Set<string>();
  let vinculadas = 0, creadas = 0, conStock = 0;
  let orden = (db.prepare('SELECT COALESCE(MAX(orden),0) o FROM variants WHERE product_id = ?').get(productId) as { o: number }).o;
  const ponerRef = db.prepare("UPDATE variants SET refs = json_set(COALESCE(refs,'{}'), '$.dropi', ?), sku = ? WHERE id = ?");
  const ponerStock = db.prepare('UPDATE variants SET stock = ? WHERE id = ?');
  const insertar = db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, orden, refs, sku) VALUES (?,?,?,?,0,?,?,?)');

  db.transaction(() => {
    for (const v of dp.variaciones) {
      const valores = v.attrs.length ? v.attrs : [{ nombre: '', valor: v.atributos }];
      const tv = tokens(valores.map((a) => a.valor).join(' '));
      // 1) Por vínculo ya guardado; 2) por palabras de la etiqueta.
      let fila = existentes.find((e) => !usadas.has(e.id) && String(pj<Record<string, string>>(e.refs, {}).dropi || '') === String(v.id));
      if (!fila && tv.length) fila = existentes.find((e) => !usadas.has(e.id) && iguales(tokens(e.label), tv));
      if (fila) {
        usadas.add(fila.id);
        ponerRef.run(String(v.id), String(v.id), fila.id);
        vinculadas++;
      } else {
        // Variación nueva: etiqueta en el orden de los grupos ("M · Negro").
        const porGrupo = new Map<string, string>();
        for (const a of valores) porGrupo.set(nombreGrupo(a.nombre), bonito(a.valor));
        const label = [...ordenGrupos.filter((g) => porGrupo.has(g)).map((g) => porGrupo.get(g)!), ...[...porGrupo.entries()].filter(([g]) => !ordenGrupos.includes(g)).map(([, x]) => x)].join(' · ') || bonito(v.atributos);
        const id = uid();
        orden += 1;
        insertar.run(id, productId, label, v.stock != null ? Math.max(0, Math.round(v.stock)) : 0, orden, JSON.stringify({ dropi: String(v.id) }), String(v.id));
        usadas.add(id);
        creadas++;
        if (v.stock != null) conStock++;
        continue;
      }
      if (v.stock != null) { ponerStock.run(Math.max(0, Math.round(v.stock)), fila.id); conStock++; }
    }

    // Opciones del producto completas con los valores de Dropi (se conservan fotos y orden).
    const grupos = new Map<string, { nombre: string; valores: { valor: string; foto?: string }[] }>();
    for (const g of opciones) grupos.set(nombreGrupo(g.nombre), { nombre: g.nombre, valores: [...(g.valores || [])] });
    for (const v of dp.variaciones) for (const a of v.attrs) {
      const k = nombreGrupo(a.nombre);
      if (!grupos.has(k)) grupos.set(k, { nombre: k, valores: [] });
      const g = grupos.get(k)!;
      if (!g.valores.some((x) => iguales(tokens(x.valor), tokens(a.valor)))) g.valores.push({ valor: bonito(a.valor) });
    }
    const nuevas = ordenGrupos.filter((k) => grupos.has(k)).map((k) => grupos.get(k)!);
    db.prepare("UPDATE products SET opciones = ?, variantes_fuente = 'dropi' WHERE id = ?").run(JSON.stringify(nuevas), productId);
  })();

  const sinDropi = existentes.filter((e) => !usadas.has(e.id) && norm(e.label) !== 'unica').map((e) => e.label);
  if (!silencioso || creadas) registrarLog(storeId, 'info', 'dropi', `Producto "${p.nombre}" sincronizado con Dropi #${dropiId}: ${vinculadas} vinculadas, ${creadas} nuevas${sinDropi.length ? `, ${sinDropi.length} sin variación en Dropi` : ''}.`);
  return { tipo: 'VARIABLE', nombreDropi: dp.name, vinculadas, creadas, conStock, sinDropi, total: dp.variaciones.length };
}

/** Repaso periódico: re-sincroniza (stock y variaciones nuevas) los productos ya vinculados con Dropi. */
export function iniciarSyncDropi(): void {
  const vuelta = async () => {
    const prods = db.prepare("SELECT p.id, p.store_id FROM products p JOIN store_integrations s ON s.store_id = p.store_id AND s.tipo = 'dropi_api' WHERE p.variantes_fuente = 'dropi' AND p.sku != ''").all() as { id: string; store_id: string }[];
    for (const p of prods) {
      try { await sincronizarProductoDropi(p.store_id, p.id, undefined, true); } catch (e) { console.error('[dropi-sync]', e); }
      await new Promise((r) => setTimeout(r, 1500)); // sin ráfagas contra Dropi
    }
  };
  setTimeout(() => void vuelta(), 5 * 60_000);
  setInterval(() => void vuelta(), 6 * 3600_000);
}
