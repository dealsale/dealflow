/**
 * Nombres de producto que en realidad son el saludo de un anuncio («¡Hola! Deseo información
 * sobre los JOGGERS CON CREMALLERA»): el nombre sale en cada pedido, en la guía y en los
 * mensajes al cliente, así que se limpia a «JOGGERS CON CREMALLERA». El saludo no se pierde:
 * si el producto no tenía frase disparadora, queda como disparador (que es donde iba).
 */
import { db, registrarLog } from './db.js';

const SALUDO = /^[\s¡!¿.,]*(hola+|holi|buen[oa]s?(\s+(d[ií]as|tardes|noches))?|saludos)[\s!¡.,]*/i;
const PIDE = /^(yo\s+)?(deseo|quiero|quisiera|me\s+gustar[ií]a|necesito|me\s+interesan?|estoy\s+interesad[oa]\s+en)((\s+(recibir|tener|saber|obtener|conocer|pedir|m[aá]s))*\s+(informaci[oó]n|info|detalles|precios?|el\s+precio))?(\s+(sobre|de|del|acerca\s+de|en|por))?(\s+(los|las|el|la|este|esta|estos|estas|unos|unas|un|una))?\s+/i;

/** Devuelve el nombre sin el saludo; si no parece un saludo, el mismo nombre. */
export function limpiarNombreSaludo(nombre: string): string {
  const original = String(nombre || '');
  const sinSaludo = original.replace(SALUDO, '');
  if (!PIDE.test(sinSaludo)) return original; // sin «deseo/quiero… información» no se toca («Hola Kitty» queda igual)
  const limpio = sinSaludo.replace(PIDE, '').replace(/[\s?¿!¡.,:;]+$/, '').trim();
  if (limpio.length < 3 || /^(m[aá]s\s+)?(informaci[oó]n|info|detalles|precios?|el\s+precio)$/i.test(limpio)) return original;
  return limpio;
}

/** Al guardar: nombre limpio y, si hacía falta, el saludo como frase disparadora. */
export function nombreAlGuardar(productId: string | null, nombre: string): { nombre: string; disparador?: string } {
  const limpio = limpiarNombreSaludo(nombre);
  if (limpio === nombre) return { nombre };
  const disp = productId ? String((db.prepare('SELECT disparador FROM products WHERE id = ?').get(productId) as { disparador?: string } | undefined)?.disparador || '') : '';
  return disp.trim().length >= 6 ? { nombre: limpio } : { nombre: limpio, disparador: nombre.trim() };
}

/**
 * Una sola vez: arregla los productos que ya tenían el saludo como nombre y el nombre en sus
 * pedidos que todavía no tienen guía (los que ya se despacharon quedan como salieron).
 */
db.exec("CREATE TABLE IF NOT EXISTS tareas_unicas (nombre TEXT PRIMARY KEY, hecho_at TEXT NOT NULL DEFAULT (datetime('now')))");
const TAREA = 'nombres-saludo-v1';

export function repararNombresSaludo(): { productos: number; items: number } {
  const res = { productos: 0, items: 0 };
  if (db.prepare('SELECT 1 FROM tareas_unicas WHERE nombre = ?').get(TAREA)) return res;
  const filas = db.prepare('SELECT id, store_id, nombre, disparador FROM products').all() as { id: string; store_id: string; nombre: string; disparador: string }[];
  const itemsDe = db.prepare(`SELECT oi.id, oi.nombre FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = ? AND COALESCE(o.guia,'') = '' AND COALESCE(o.effi_guia,'') = '' AND COALESCE(o.dropi_order_id,'') = ''`);
  const ponerItem = db.prepare('UPDATE order_items SET nombre = ? WHERE id = ?');
  db.transaction(() => {
    for (const p of filas) {
      const limpio = limpiarNombreSaludo(p.nombre);
      if (limpio === p.nombre) continue;
      const disp = String(p.disparador || '').trim().length >= 6 ? p.disparador : p.nombre.trim();
      db.prepare('UPDATE products SET nombre = ?, disparador = ? WHERE id = ?').run(limpio, disp, p.id);
      res.productos++;
      let n = 0;
      for (const it of itemsDe.all(p.id) as { id: string; nombre: string }[]) {
        for (const viejo of [p.nombre, p.nombre.trim()]) {
          if (it.nombre.startsWith(viejo)) { ponerItem.run((limpio + it.nombre.slice(viejo.length)).replace(/\s{2,}/g, ' '), it.id); n++; break; }
        }
      }
      res.items += n;
      registrarLog(p.store_id, 'info', 'producto', `El producto se llamaba «${p.nombre.trim().slice(0, 90)}» (el saludo del anuncio): ahora se llama «${limpio}»${disp === p.nombre.trim() ? ' y el saludo quedó como frase disparadora' : ''}. Se corrigió en ${n} producto${n === 1 ? '' : 's'} de pedidos sin guía.`);
    }
    db.prepare('INSERT OR IGNORE INTO tareas_unicas (nombre) VALUES (?)').run(TAREA);
  })();
  if (res.productos) console.log(`[productos] ${res.productos} nombres con saludo corregidos (${res.items} ítems de pedidos sin guía)`);
  return res;
}

if (process.env.NOMBRES_SALUDO !== 'off') {
  setTimeout(() => { try { repararNombresSaludo(); } catch (e) { console.warn('[productos] no se pudieron corregir los nombres con saludo', e); } }, 15_000).unref();
}
