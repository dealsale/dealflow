import { db } from './db.js';

/**
 * Vinculación de variantes con Effi, Dropi y Skydropx, por producto.
 *
 * Todo se vincula solo (al guardar, al abrir el producto y en los repasos periódicos), salvo
 * lo que la tienda fijó a mano, que nunca se toca. «Quitar todo» desconecta todas las
 * variantes de un producto en una integración y PAUSA su vinculación automática: si no, el
 * repaso siguiente las volvería a vincular. Se reanuda con «Vincular solo de nuevo».
 */
try { db.exec("ALTER TABLE products ADD COLUMN vinculo_pausado TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

export type IntegVinculo = 'effi' | 'dropi' | 'skydropx';
export const esIntegVinculo = (x: unknown): x is IntegVinculo => x === 'effi' || x === 'dropi' || x === 'skydropx';

const lista = (s: string) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** ¿La vinculación automática de este producto está pausada en esa integración? */
export function vinculoPausado(productId: string, integ: IntegVinculo): boolean {
  const r = db.prepare('SELECT vinculo_pausado FROM products WHERE id = ?').get(productId) as { vinculo_pausado: string } | undefined;
  return lista(r?.vinculo_pausado || '').includes(integ);
}

/** Productos de la tienda con la vinculación automática pausada en esa integración. */
export function productosPausados(storeId: string, integ: IntegVinculo): Set<string> {
  const filas = db.prepare("SELECT id, vinculo_pausado FROM products WHERE store_id = ? AND vinculo_pausado != ''").all(storeId) as { id: string; vinculo_pausado: string }[];
  return new Set(filas.filter((f) => lista(f.vinculo_pausado).includes(integ)).map((f) => f.id));
}

export function pausarVinculo(storeId: string, productId: string, integ: IntegVinculo, pausar: boolean): void {
  const r = db.prepare('SELECT vinculo_pausado FROM products WHERE id = ? AND store_id = ?').get(productId, storeId) as { vinculo_pausado: string } | undefined;
  if (!r) return;
  const s = new Set(lista(r.vinculo_pausado));
  if (pausar) s.add(integ); else s.delete(integ);
  db.prepare('UPDATE products SET vinculo_pausado = ? WHERE id = ? AND store_id = ?').run([...s].join(','), productId, storeId);
}

/** «Quitar todo»: desconecta todas las variantes del producto en esa integración y pausa la automática. */
export function quitarVinculos(storeId: string, productId: string, integ: IntegVinculo): number {
  if (!db.prepare('SELECT 1 FROM products WHERE id = ? AND store_id = ?').get(productId, storeId)) return 0;
  let n = 0;
  if (integ === 'effi') {
    n = db.prepare(`UPDATE variants SET refs = json_remove(COALESCE(refs,'{}'), '$.effi_id', '$.effi_auto', '$.effi_prov_id', '$.effi_sin')
      WHERE product_id = ? AND (COALESCE(json_extract(refs,'$.effi_id'),'') != '' OR COALESCE(json_extract(refs,'$.effi_prov_id'),'') != '' OR COALESCE(json_extract(refs,'$.effi_sin'),0) = 1)`).run(productId).changes;
  } else if (integ === 'dropi') {
    n = db.prepare("UPDATE variants SET refs = json_remove(COALESCE(refs,'{}'), '$.dropi') WHERE product_id = ? AND COALESCE(json_extract(refs,'$.dropi'),'') != ''").run(productId).changes;
    // Sin esto, el repaso de cada 6 h lo volvería a sincronizar con Dropi.
    db.prepare("UPDATE products SET variantes_fuente = '' WHERE id = ? AND variantes_fuente = 'dropi'").run(productId);
  } else {
    try { n = db.prepare('DELETE FROM skydropx_vinculos WHERE store_id = ? AND product_id = ?').run(storeId, productId).changes; } catch { /* aún no existe la tabla */ }
  }
  pausarVinculo(storeId, productId, integ, true);
  return n;
}
