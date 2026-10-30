/**
 * Mensajes rápidos del Inbox: textos guardados que se insertan escribiendo "/" en el chat
 * (ej. "/envio" → "El envío es gratis y llega en 2 a 4 días hábiles…"). Son de la tienda:
 * todo el equipo los ve y los usa.
 */
import { db, uid } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS respuestas_rapidas (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, atajo TEXT NOT NULL, texto TEXT NOT NULL,
  usos INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_respuestas_rapidas_store ON respuestas_rapidas(store_id)');

export interface RespuestaRapida { id: string; atajo: string; texto: string; usos: number }

const limpiarAtajo = (s: string) => String(s || '').trim().replace(/^\/+/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

export function listarRespuestas(storeId: string): RespuestaRapida[] {
  return db.prepare('SELECT id, atajo, texto, usos FROM respuestas_rapidas WHERE store_id = ? ORDER BY usos DESC, atajo').all(storeId) as RespuestaRapida[];
}

export function guardarRespuesta(storeId: string, id: string | null, atajo: string, texto: string): RespuestaRapida | { error: string } {
  const a = limpiarAtajo(atajo);
  const t = String(texto || '').trim().slice(0, 4000);
  if (!a) return { error: 'Ponle un atajo (ej. envio, precios, gracias).' };
  if (!t) return { error: 'Escribe el mensaje.' };
  const otro = db.prepare('SELECT id FROM respuestas_rapidas WHERE store_id = ? AND atajo = ?').get(storeId, a) as { id: string } | undefined;
  if (otro && otro.id !== id) return { error: `Ya tienes un mensaje rápido con el atajo /${a}.` };
  if (id) {
    const r = db.prepare('UPDATE respuestas_rapidas SET atajo = ?, texto = ? WHERE id = ? AND store_id = ?').run(a, t, id, storeId);
    if (!r.changes) return { error: 'Mensaje rápido no encontrado.' };
  } else {
    if ((db.prepare('SELECT COUNT(*) n FROM respuestas_rapidas WHERE store_id = ?').get(storeId) as { n: number }).n >= 300) return { error: 'Llegaste al máximo de 300 mensajes rápidos.' };
    id = uid();
    db.prepare('INSERT INTO respuestas_rapidas (id, store_id, atajo, texto) VALUES (?,?,?,?)').run(id, storeId, a, t);
  }
  return db.prepare('SELECT id, atajo, texto, usos FROM respuestas_rapidas WHERE id = ?').get(id) as RespuestaRapida;
}

export function borrarRespuesta(storeId: string, id: string) {
  db.prepare('DELETE FROM respuestas_rapidas WHERE id = ? AND store_id = ?').run(id, storeId);
}

export function usarRespuesta(storeId: string, id: string) {
  db.prepare('UPDATE respuestas_rapidas SET usos = usos + 1 WHERE id = ? AND store_id = ?').run(id, storeId);
}
