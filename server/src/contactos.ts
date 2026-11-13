/**
 * Contactos importados (CSV de otro bot) y etiquetas personalizadas.
 *
 *  - Las etiquetas van por CELULAR (últimos 10 dígitos): sirven igual para un chat que ya existe
 *    y para un contacto importado que todavía no ha escrito.
 *  - Los importados quedan en su propia lista, no en el Inbox ni en las estadísticas: el chat se
 *    crea solo cuando se le envía una campaña o cuando el contacto escribe. Así importar 5.000
 *    contactos no llena el Inbox ni infla los "chats nuevos" del día.
 *  - Solo se importan con la confirmación de que esos contactos aceptaron mensajes de la tienda
 *    (Meta lo exige para las plantillas de marketing).
 */
import { db, uid, registrarLog } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS contactos_importados (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, tel10 TEXT NOT NULL, wa TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '',
  origen TEXT NOT NULL DEFAULT '', lead_id TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (store_id, tel10)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS contacto_etiquetas (
  store_id TEXT NOT NULL, tel10 TEXT NOT NULL, etiqueta TEXT NOT NULL, creado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, tel10, etiqueta)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_contacto_etiquetas_et ON contacto_etiquetas(store_id, etiqueta)');

const txt = (v: unknown) => (v == null ? '' : String(v));
export const tel10 = (t: unknown) => { const d = txt(t).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };

/** Celular colombiano a formato de WhatsApp (57 + 10 dígitos). '' si no es un celular válido. */
export function aWhatsapp(t: unknown): string {
  let d = txt(t).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('057')) d = d.slice(3);
  return /^3\d{9}$/.test(d) ? '57' + d : '';
}

/** Nombre de etiqueta limpio: sin espacios dobles, máximo 40 caracteres. */
export const limpiarEtiqueta = (e: unknown) => txt(e).replace(/\s+/g, ' ').trim().slice(0, 40);

export interface FilaContacto { nombre?: string; telefono?: string; etiquetas?: string }
export interface ResultadoImportacion { creados: number; yaEran: number; invalidos: number; repetidos: number; ejemplosInvalidos: string[]; etiqueta: string }

/**
 * Importa contactos. Cada fila: nombre, teléfono y (opcional) etiquetas propias separadas por coma o
 * punto y coma. A todos se les pone `etiqueta`. Un celular que ya es un chat no se duplica: solo
 * recibe la etiqueta.
 */
export function importarContactos(storeId: string, filas: FilaContacto[], etiqueta: string, origen: string): ResultadoImportacion | { error: string } {
  const et = limpiarEtiqueta(etiqueta);
  if (!et) return { error: 'Escribe la etiqueta para estos contactos (ej. "Bot anterior").' };
  if (!Array.isArray(filas) || !filas.length) return { error: 'El archivo no trae contactos.' };
  if (filas.length > 20000) return { error: 'Máximo 20.000 contactos por archivo. Divídelo en partes.' };
  const leadPorTel = new Map<string, string>();
  for (const l of db.prepare('SELECT id, tel, wa_id FROM leads WHERE store_id = ?').all(storeId) as { id: string; tel: string; wa_id: string }[]) {
    for (const k of [tel10(l.tel), tel10(String(l.wa_id || '').split('@')[0])]) if (k && !leadPorTel.has(k)) leadPorTel.set(k, l.id);
  }
  const ins = db.prepare('INSERT OR IGNORE INTO contactos_importados (id, store_id, tel10, wa, nombre, origen, lead_id) VALUES (?,?,?,?,?,?,?)');
  const insEt = db.prepare('INSERT OR IGNORE INTO contacto_etiquetas (store_id, tel10, etiqueta) VALUES (?,?,?)');
  const vistos = new Set<string>();
  const r: ResultadoImportacion = { creados: 0, yaEran: 0, invalidos: 0, repetidos: 0, ejemplosInvalidos: [], etiqueta: et };
  db.transaction(() => {
    for (const f of filas) {
      const wa = aWhatsapp(f.telefono);
      if (!wa) { r.invalidos++; if (r.ejemplosInvalidos.length < 5) r.ejemplosInvalidos.push(txt(f.telefono).slice(0, 30) || '(vacío)'); continue; }
      const k = wa.slice(2);
      if (vistos.has(k)) { r.repetidos++; continue; }
      vistos.add(k);
      const lead = leadPorTel.get(k) || '';
      if (lead) r.yaEran++;
      else if (ins.run(uid(), storeId, k, wa, txt(f.nombre).replace(/\s+/g, ' ').trim().slice(0, 80), origen.slice(0, 60), '').changes) r.creados++;
      else r.yaEran++;
      for (const e of [et, ...txt(f.etiquetas).split(/[;,|]/).map(limpiarEtiqueta)].filter(Boolean)) insEt.run(storeId, k, e);
    }
  })();
  registrarLog(storeId, 'info', 'contactos', `Importación "${et}": ${r.creados} contactos nuevos, ${r.yaEran} ya estaban, ${r.invalidos} con celular inválido.`);
  return r;
}

/** Etiquetas de la tienda con cuántos contactos tiene cada una. */
export function etiquetasTienda(storeId: string): { etiqueta: string; n: number }[] {
  return db.prepare('SELECT etiqueta, COUNT(*) n FROM contacto_etiquetas WHERE store_id = ? GROUP BY etiqueta ORDER BY n DESC, etiqueta').all(storeId) as { etiqueta: string; n: number }[];
}

/** Etiquetas de un celular (para mostrarlas en el chat). */
export function etiquetasDe(storeId: string, tel: string): string[] {
  const k = tel10(tel);
  if (!k) return [];
  return (db.prepare('SELECT etiqueta FROM contacto_etiquetas WHERE store_id = ? AND tel10 = ? ORDER BY etiqueta').all(storeId, k) as { etiqueta: string }[]).map((x) => x.etiqueta);
}

export function ponerEtiqueta(storeId: string, tel: string, etiqueta: string): boolean {
  const k = tel10(tel); const e = limpiarEtiqueta(etiqueta);
  if (!k || !e) return false;
  db.prepare('INSERT OR IGNORE INTO contacto_etiquetas (store_id, tel10, etiqueta) VALUES (?,?,?)').run(storeId, k, e);
  return true;
}
export function quitarEtiqueta(storeId: string, tel: string, etiqueta: string): void {
  db.prepare('DELETE FROM contacto_etiquetas WHERE store_id = ? AND tel10 = ? AND etiqueta = ?').run(storeId, tel10(tel), limpiarEtiqueta(etiqueta));
}
/** Borra una etiqueta de todos (y los importados que solo tenían esa y nunca escribieron). */
export function borrarEtiqueta(storeId: string, etiqueta: string): number {
  const e = limpiarEtiqueta(etiqueta);
  const n = db.prepare('DELETE FROM contacto_etiquetas WHERE store_id = ? AND etiqueta = ?').run(storeId, e).changes;
  db.prepare(`DELETE FROM contactos_importados WHERE store_id = ? AND lead_id = ''
    AND NOT EXISTS (SELECT 1 FROM contacto_etiquetas t WHERE t.store_id = contactos_importados.store_id AND t.tel10 = contactos_importados.tel10)`).run(storeId);
  return n;
}

/**
 * Chat de un contacto importado: lo crea la primera vez que se le escribe (campaña), con su nombre.
 * Si ya escribió por su cuenta, se usa ese chat.
 */
export async function chatDeContacto(storeId: string, contactoId: string): Promise<string> {
  const c = db.prepare('SELECT id, tel10, wa, nombre, lead_id FROM contactos_importados WHERE id = ? AND store_id = ?').get(contactoId, storeId) as { id: string; tel10: string; wa: string; nombre: string; lead_id: string } | undefined;
  if (!c) return '';
  if (c.lead_id && db.prepare('SELECT 1 FROM leads WHERE id = ?').get(c.lead_id)) return c.lead_id;
  const { ensureLead } = await import('./wa.js');
  const { id } = ensureLead(storeId, c.wa, c.nombre, '+' + c.wa);
  db.prepare('UPDATE contactos_importados SET lead_id = ? WHERE id = ?').run(id, c.id);
  return id;
}
