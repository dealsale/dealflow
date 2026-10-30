/**
 * Versión de los chats y de los pedidos de cada tienda, para sondeos INCREMENTALES.
 *
 * Antes el Inbox descargaba el resumen de TODOS los chats cada 5 s (con 2.000 chats,
 * casi 1 MB cada vez) y Pedidos todos los pedidos (2 MB), se hubiera cambiado algo o no.
 * Ahora unos triggers de SQLite suben un contador por tienda cada vez que cambia un chat,
 * llega un mensaje o cambia un pedido, y le ponen esa versión a la fila que cambió. La app
 * manda la última versión que vio y recibe SOLO las filas más nuevas (o nada).
 */
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS store_version (
  store_id TEXT PRIMARY KEY, v_leads INTEGER NOT NULL DEFAULT 0, v_orders INTEGER NOT NULL DEFAULT 0
)`);
for (const [tabla] of [['leads'], ['orders']]) {
  try { db.exec(`ALTER TABLE ${tabla} ADD COLUMN v INTEGER NOT NULL DEFAULT 0`); } catch { /* ya existe */ }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_store_v ON leads(store_id, v)');
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_store_v ON orders(store_id, v)');

// Sube el contador de la tienda y devuelve el nuevo valor (dentro de un trigger no se
// puede "devolver", así que el trigger lo lee de la tabla justo después de subirlo).
const BUMP_LEADS = (sid: string) => `
  INSERT INTO store_version (store_id, v_leads) VALUES (${sid}, 1)
    ON CONFLICT(store_id) DO UPDATE SET v_leads = v_leads + 1;`;
const BUMP_ORDERS = (sid: string) => `
  INSERT INTO store_version (store_id, v_orders) VALUES (${sid}, 1)
    ON CONFLICT(store_id) DO UPDATE SET v_orders = v_orders + 1;`;

db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_leads_ins AFTER INSERT ON leads BEGIN
  ${BUMP_LEADS('NEW.store_id')}
  UPDATE leads SET v = (SELECT v_leads FROM store_version WHERE store_id = NEW.store_id) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_leads_upd AFTER UPDATE ON leads FOR EACH ROW WHEN NEW.v = OLD.v BEGIN
  ${BUMP_LEADS('NEW.store_id')}
  UPDATE leads SET v = (SELECT v_leads FROM store_version WHERE store_id = NEW.store_id) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_leads_del AFTER DELETE ON leads BEGIN
  ${BUMP_LEADS('OLD.store_id')}
END;
CREATE TRIGGER IF NOT EXISTS trg_messages_ins AFTER INSERT ON messages BEGIN
  UPDATE leads SET v = v WHERE id = NEW.lead_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_messages_upd AFTER UPDATE ON messages BEGIN
  UPDATE leads SET v = v WHERE id = NEW.lead_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_messages_del AFTER DELETE ON messages BEGIN
  UPDATE leads SET v = v WHERE id = OLD.lead_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_orders_ins AFTER INSERT ON orders BEGIN
  ${BUMP_ORDERS('NEW.store_id')}
  UPDATE orders SET v = (SELECT v_orders FROM store_version WHERE store_id = NEW.store_id) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_orders_upd AFTER UPDATE ON orders FOR EACH ROW WHEN NEW.v = OLD.v BEGIN
  ${BUMP_ORDERS('NEW.store_id')}
  UPDATE orders SET v = (SELECT v_orders FROM store_version WHERE store_id = NEW.store_id) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_orders_del AFTER DELETE ON orders BEGIN
  ${BUMP_ORDERS('OLD.store_id')}
END;
CREATE TRIGGER IF NOT EXISTS trg_order_items_ins AFTER INSERT ON order_items BEGIN
  UPDATE orders SET v = v WHERE id = NEW.order_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_order_items_upd AFTER UPDATE ON order_items BEGIN
  UPDATE orders SET v = v WHERE id = NEW.order_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_order_items_del AFTER DELETE ON order_items BEGIN
  UPDATE orders SET v = v WHERE id = OLD.order_id;
END;
`);
// Las novedades viven en otra tabla (la crea novedades.ts): si ya existe, un cambio en una
// novedad también marca su pedido como cambiado.
if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'novedades'").get()) {
  db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_novedades_ins AFTER INSERT ON novedades WHEN NEW.order_id IS NOT NULL BEGIN
  UPDATE orders SET v = v WHERE id = NEW.order_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_novedades_upd AFTER UPDATE ON novedades WHEN NEW.order_id IS NOT NULL BEGIN
  UPDATE orders SET v = v WHERE id = NEW.order_id;
END;
`);
}

// Tiendas que ya existían antes de este contador: arrancan en versión 1 (sus filas quedan
// en v = 0, o sea "más viejas" que 1). Sin esto la app vería versión 0 = "no sé nada" y
// seguiría bajando la lista completa en cada sondeo hasta el primer cambio.
db.exec('INSERT OR IGNORE INTO store_version (store_id, v_leads, v_orders) SELECT id, 1, 1 FROM stores');
// (Un contador en 0 significa que ningún trigger lo tocó todavía: todas sus filas están en v = 0.)
db.exec('UPDATE store_version SET v_leads = 1 WHERE v_leads = 0');
db.exec('UPDATE store_version SET v_orders = 1 WHERE v_orders = 0');

/** Versión actual de los chats y los pedidos de la tienda. */
export function versionesDe(storeId: string): { leads: number; orders: number } {
  const r = db.prepare('SELECT v_leads, v_orders FROM store_version WHERE store_id = ?').get(storeId) as { v_leads: number; v_orders: number } | undefined;
  return { leads: r?.v_leads || 0, orders: r?.v_orders || 0 };
}

/** ¿`desde` es una versión válida que la app vio antes? (0 o vacío = quiere todo). */
export function versionPedida(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
