/**
 * Instrucciones maestras de la tienda (Marketing IA): un texto que la tienda escribe una vez
 * (estilo de su marca, colores, qué nunca debe salir…) y que se le agrega a TODO lo que genera:
 * ideas, fotos, guiones y tomas de video UGC, e imágenes de campañas.
 */
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS mk_ajustes (
  store_id TEXT PRIMARY KEY,
  instrucciones TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

export const MAX_INSTRUCCIONES = 2000;

export function instruccionesMaestras(storeId: string): string {
  const r = db.prepare('SELECT instrucciones FROM mk_ajustes WHERE store_id = ?').get(storeId) as { instrucciones: string } | undefined;
  return (r?.instrucciones || '').trim();
}

export function guardarInstrucciones(storeId: string, texto: string): string {
  const t = String(texto || '').trim().slice(0, MAX_INSTRUCCIONES);
  db.prepare(`INSERT INTO mk_ajustes (store_id, instrucciones) VALUES (?, ?)
    ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, updated_at = datetime('now')`).run(storeId, t);
  return t;
}

/** Bloque listo para pegar al final de un prompt (vacío si la tienda no escribió nada). */
export function bloqueMaestro(storeId: string): string {
  const t = instruccionesMaestras(storeId);
  return t ? `\n\nINSTRUCCIONES MAESTRAS DE LA TIENDA (respétalas siempre, salvo que choquen con las reglas de contenido): ${t}` : '';
}
