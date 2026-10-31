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

// ── Resumen de cada chat guardado EN el lead (rendimiento con miles de chats) ──────────
// La lista de chats, el embudo de Leads, el remarketing y los seguimientos necesitaban, por
// CADA chat, buscar su último mensaje, contar los no leídos y revisar con LIKE todos sus
// mensajes (con 4.000 chats y 160.000 mensajes: 0,5–5 s por consulta, y better-sqlite3
// bloquea el servidor mientras tanto). Ahora un trigger lo mantiene al insertar cada mensaje.
export const PATRONES_LEAD = {
  INTENCION: ['precio', 'cuanto', 'cuánto', 'vale', 'valor', 'quiero', 'talla', 'color', 'envio', 'envío', 'comprar', 'compro', 'pedido', 'disponible', 'contraentrega', 'contra entrega', 'lo llevo', 'me lo', 'domicilio', 'pago'],
  PIDE_DATOS: ['dirección', 'direccion', 'nombre completo', 'ciudad', 'barrio', 'punto de referencia'],
  DIO_DATOS: ['calle', 'carrera', 'cra ', 'cll', 'barrio', 'avenida', 'apto', 'apartamento', 'conjunto', 'manzana', 'diagonal', 'transversal'],
};
const likeCol = (col: string, pats: string[]) => '(' + pats.map((p) => `lower(${col}) LIKE '%${p}%'`).join(' OR ') + ')';
const ES_RESUMEN = (col: string) => `(lower(${col}) LIKE '%resumen de tu pedido%' OR lower(${col}) LIKE '%order summary%')`;
for (const col of ['visto_equipo_at TEXT', "ult_at TEXT", "ult_de TEXT NOT NULL DEFAULT ''", "ult_texto TEXT NOT NULL DEFAULT ''", "ult_tipo TEXT NOT NULL DEFAULT ''", "ult_cliente_at TEXT",
  'sin_leer INTEGER NOT NULL DEFAULT 0', 'n_msgs INTEGER NOT NULL DEFAULT 0', 'n_cliente INTEGER NOT NULL DEFAULT 0', 'f_resumen_at TEXT',
  'f_pidio INTEGER NOT NULL DEFAULT 0', 'f_dio INTEGER NOT NULL DEFAULT 0', 'f_intencion INTEGER NOT NULL DEFAULT 0', 'res_ok INTEGER NOT NULL DEFAULT 0']) {
  try { db.exec(`ALTER TABLE leads ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_ult_at ON leads(ult_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_store_res ON leads(store_id, res_ok)');
db.exec(`DROP TRIGGER IF EXISTS trg_messages_resumen;
CREATE TRIGGER trg_messages_resumen AFTER INSERT ON messages BEGIN
  UPDATE leads SET
    ult_at = CASE WHEN NEW.created_at >= COALESCE(ult_at,'') THEN NEW.created_at ELSE ult_at END,
    ult_de = CASE WHEN NEW.created_at >= COALESCE(ult_at,'') THEN NEW.de ELSE ult_de END,
    ult_texto = CASE WHEN NEW.created_at >= COALESCE(ult_at,'') THEN substr(COALESCE(NEW.texto,''), 1, 300) ELSE ult_texto END,
    ult_tipo = CASE WHEN NEW.created_at >= COALESCE(ult_at,'') THEN COALESCE(NEW.tipo,'texto') ELSE ult_tipo END,
    ult_cliente_at = CASE WHEN NEW.de = 'cliente' AND NEW.created_at >= COALESCE(ult_cliente_at,'') THEN NEW.created_at ELSE ult_cliente_at END,
    sin_leer = sin_leer + CASE WHEN NEW.de = 'cliente' AND NEW.created_at > COALESCE(visto_equipo_at,'') THEN 1 ELSE 0 END,
    n_msgs = n_msgs + 1,
    n_cliente = n_cliente + CASE WHEN NEW.de = 'cliente' THEN 1 ELSE 0 END,
    f_resumen_at = CASE WHEN NEW.de != 'cliente' AND ${ES_RESUMEN('NEW.texto')} AND NEW.created_at >= COALESCE(f_resumen_at,'') THEN NEW.created_at ELSE f_resumen_at END,
    f_pidio = CASE WHEN f_pidio = 1 OR (NEW.de != 'cliente' AND ${likeCol('NEW.texto', PATRONES_LEAD.PIDE_DATOS)}) THEN 1 ELSE 0 END,
    f_dio = CASE WHEN f_dio = 1 OR (NEW.de = 'cliente' AND ${likeCol('NEW.texto', PATRONES_LEAD.DIO_DATOS)}) THEN 1 ELSE 0 END,
    f_intencion = CASE WHEN f_intencion = 1 OR (NEW.de = 'cliente' AND ${likeCol('NEW.texto', PATRONES_LEAD.INTENCION)}) THEN 1 ELSE 0 END
  WHERE id = NEW.lead_id;
END;
DROP TRIGGER IF EXISTS trg_messages_resumen_del;
CREATE TRIGGER trg_messages_resumen_del AFTER DELETE ON messages BEGIN
  UPDATE leads SET
    ult_at = (SELECT created_at FROM messages WHERE lead_id = OLD.lead_id ORDER BY created_at DESC LIMIT 1),
    ult_de = COALESCE((SELECT de FROM messages WHERE lead_id = OLD.lead_id ORDER BY created_at DESC LIMIT 1), ''),
    ult_texto = COALESCE((SELECT substr(texto, 1, 300) FROM messages WHERE lead_id = OLD.lead_id ORDER BY created_at DESC LIMIT 1), ''),
    ult_tipo = COALESCE((SELECT tipo FROM messages WHERE lead_id = OLD.lead_id ORDER BY created_at DESC LIMIT 1), ''),
    n_msgs = MAX(0, n_msgs - 1),
    n_cliente = MAX(0, n_cliente - CASE WHEN OLD.de = 'cliente' THEN 1 ELSE 0 END)
  WHERE id = OLD.lead_id;
END;`);

/** Calcula el resumen de los chats que aún no lo tienen (los que existían antes de este cambio). */
export function completarResumenLeads(lote = 400): number {
  const ids = (db.prepare('SELECT id FROM leads WHERE res_ok = 0 ORDER BY created_at DESC LIMIT ?').all(lote) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return 0;
  const upd = db.prepare(`UPDATE leads SET
      ult_at = (SELECT created_at FROM messages m WHERE m.lead_id = leads.id ORDER BY m.created_at DESC LIMIT 1),
      ult_de = COALESCE((SELECT de FROM messages m WHERE m.lead_id = leads.id ORDER BY m.created_at DESC LIMIT 1), ''),
      ult_texto = COALESCE((SELECT substr(texto, 1, 300) FROM messages m WHERE m.lead_id = leads.id ORDER BY m.created_at DESC LIMIT 1), ''),
      ult_tipo = COALESCE((SELECT tipo FROM messages m WHERE m.lead_id = leads.id ORDER BY m.created_at DESC LIMIT 1), ''),
      ult_cliente_at = (SELECT created_at FROM messages m WHERE m.lead_id = leads.id AND m.de = 'cliente' ORDER BY m.created_at DESC LIMIT 1),
      sin_leer = (SELECT COUNT(*) FROM messages m WHERE m.lead_id = leads.id AND m.de = 'cliente' AND m.created_at > COALESCE(leads.visto_equipo_at, '')),
      n_msgs = (SELECT COUNT(*) FROM messages m WHERE m.lead_id = leads.id),
      n_cliente = (SELECT COUNT(*) FROM messages m WHERE m.lead_id = leads.id AND m.de = 'cliente'),
      f_resumen_at = (SELECT MAX(created_at) FROM messages m WHERE m.lead_id = leads.id AND m.de != 'cliente' AND ${ES_RESUMEN('m.texto')}),
      f_pidio = EXISTS(SELECT 1 FROM messages m WHERE m.lead_id = leads.id AND m.de != 'cliente' AND ${likeCol('m.texto', PATRONES_LEAD.PIDE_DATOS)}),
      f_dio = EXISTS(SELECT 1 FROM messages m WHERE m.lead_id = leads.id AND m.de = 'cliente' AND ${likeCol('m.texto', PATRONES_LEAD.DIO_DATOS)}),
      f_intencion = EXISTS(SELECT 1 FROM messages m WHERE m.lead_id = leads.id AND m.de = 'cliente' AND ${likeCol('m.texto', PATRONES_LEAD.INTENCION)}),
      res_ok = 1
    WHERE id = ?`);
  db.transaction(() => { for (const id of ids) upd.run(id); })();
  return ids.length;
}
/** En segundo plano y de a poco (sin congelar el servidor): los chats viejos quedan con su resumen. */
export function iniciarResumenLeads(): void {
  const pendientes = (db.prepare('SELECT COUNT(*) n FROM leads WHERE res_ok = 0').get() as { n: number }).n;
  if (!pendientes) return;
  console.log(`[leads] calculando el resumen de ${pendientes} chats (una sola vez, de a poco)…`);
  const t0 = Date.now();
  const paso = () => {
    const n = completarResumenLeads();
    if (n) setTimeout(paso, 25).unref?.();
    else console.log(`[leads] resumen de chats listo en ${Math.round((Date.now() - t0) / 1000)} s`);
  };
  setTimeout(paso, 3000).unref?.();
}
