import { db, uid, j, pj } from './db.js';

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number; // 0 = gratis
  features: string[];
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'ecommerce-v10',
    nombre: 'Ecomerce v.10',
    descripcion: 'Deja tu asistente listo para vender ropa por WhatsApp en minutos: instrucciones y reglas de venta profesionales. Los productos los agregas tú desde la Biblioteca de productos (unos gratis, otros de pago único) o creando los tuyos.',
    precio: 0,
    features: [
      'Instrucciones del asistente listas para vender',
      'Todas las reglas de venta ya cargadas',
      'Tono y flujo de cierre profesional para ropa',
      'Luego importa productos desde la Biblioteca',
    ],
  },
];

const ECOMMERCE_INSTRUCCIONES = `Eres el asistente de ventas de una tienda de ropa que vende por WhatsApp en Colombia. Atiende con calidez, en tono cercano de "tú", con respuestas cortas y claras. Tu meta es ayudar al cliente a elegir y cerrar la venta sin presionar. Presenta el producto que le interesa, resuelve dudas de tallas, colores y envío, ofrece los combos cuando pidan 2 o más, y cuando el cliente confirme que quiere comprar, pídele nombre, ciudad y dirección para registrar el pedido. El envío es contra entrega (paga al recibir).`;

const ECOMMERCE_REGLAS = [
  'El envío es contra entrega por Dropi: el cliente paga cuando recibe el pedido.',
  'Antes de cerrar el pedido, confirma siempre talla, color, ciudad y dirección.',
  'Si el cliente pide 2 o más unidades, ofrece el combo correspondiente.',
  'No inventes productos, precios ni promociones que no estén en el catálogo.',
];

// Plantillas de asistente basadas en SERVICIOS (soporte, atención, reservas, educación).
// Contenido de fábrica: instrucciones + reglas + servicios de ejemplo.
/**
 * Tienda maestra desde la que se CONGELA (una sola vez) el contenido de la
 * plantilla. Se resuelve por la variable de entorno TEMPLATE_MASTER_STORE
 * (id, correo o nombre) y, por defecto, por la tienda llamada "Samy Store".
 */
function tiendaMaestraId(): string | undefined {
  const cfg = (process.env.TEMPLATE_MASTER_STORE || '').trim();
  if (cfg) {
    const r = db.prepare('SELECT id FROM stores WHERE id = ? OR correo = ? OR nombre = ? COLLATE NOCASE').get(cfg, cfg, cfg) as { id: string } | undefined;
    if (r) return r.id;
  }
  const r = db.prepare("SELECT id FROM stores WHERE nombre = 'Samy Store' COLLATE NOCASE ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  return r?.id;
}

interface Snapshot { source_store_id: string; instrucciones: string; reglas: string; productos: string }

/** ¿El snapshot congelado tiene contenido usable (al menos un producto o instrucciones)? */
function snapshotUtil(snap: Snapshot | undefined): snap is Snapshot {
  if (!snap) return false;
  const prods = pj<unknown[]>(snap.productos || '[]', []);
  return (Array.isArray(prods) && prods.length > 0) || (snap.instrucciones || '').trim().length > 0;
}

/**
 * CONGELA la versión actual de la tienda maestra dentro de la plantilla.
 * Guarda una copia (asistente + productos + variantes) que NO cambia después,
 * aunque la tienda maestra agregue productos o creativos nuevos.
 * Devuelve false si la maestra no tiene contenido.
 */
export function congelarPlantilla(templateId: string, masterId: string): boolean {
  const a = (db.prepare('SELECT instrucciones, reglas FROM assistants WHERE store_id = ?').get(masterId) as { instrucciones: string; reglas: string } | undefined) || { instrucciones: '', reglas: '[]' };
  const productos = (db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY created_at').all(masterId) as Record<string, unknown>[]).map((row) => ({
    row,
    variants: db.prepare('SELECT label, stock, fotos, fotos_subidas, orden FROM variants WHERE product_id = ? ORDER BY orden').all(row.id as string),
  }));
  if (productos.length === 0 && !(a.instrucciones || '').trim()) return false;
  db.prepare(
    `INSERT INTO templates_content (template_id, source_store_id, instrucciones, reglas, productos, updated_at)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(template_id) DO UPDATE SET source_store_id = excluded.source_store_id, instrucciones = excluded.instrucciones,
       reglas = excluded.reglas, productos = excluded.productos, updated_at = datetime('now')`,
  ).run(templateId, masterId, a.instrucciones, a.reglas, j(productos));
  return true;
}

/**
 * Al arrancar el servidor: si la plantilla aún no está congelada y existe la
 * tienda maestra con contenido, congela AHORA la versión actual. A partir de
 * ese momento queda fija; los productos nuevos de la maestra no la afectan.
 */
export function congelarSiFalta() {
  for (const p of PLANTILLAS) {
    const snap = db.prepare('SELECT source_store_id, instrucciones, reglas, productos FROM templates_content WHERE template_id = ?').get(p.id) as Snapshot | undefined;
    if (snapshotUtil(snap)) continue; // ya congelada
    const master = tiendaMaestraId();
    if (master) congelarPlantilla(p.id, master);
  }
}

/**
 * Aplica el snapshot congelado a la tienda destino. Instala SOLO el asistente
 * (instrucciones y reglas): las plantillas ya NO instalan productos. Los
 * productos se agregan después desde la Biblioteca de productos del admin.
 */
function aplicarSnapshot(snap: Snapshot, storeId: string, _plantillaId: string) {
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
  ).run(storeId, snap.instrucciones, snap.reglas);
}

/** Instala una plantilla en la tienda: deja el asistente y los productos listos. */
export function instalarPlantilla(storeId: string, plantillaId: string, force = false): { ok?: boolean; error?: string; yaInstalada?: boolean } {
  const p = PLANTILLAS.find((x) => x.id === plantillaId);
  if (!p) return { error: 'Plantilla no encontrada.' };
  const ya = db.prepare('SELECT 1 FROM installed_templates WHERE store_id = ? AND template_id = ?').get(storeId, plantillaId);
  if (ya && !force) return { yaInstalada: true, error: 'Esta plantilla ya está instalada en tu tienda.' };

  // Contenido CONGELADO de la plantilla (no cambia aunque la tienda maestra agregue productos después).
  let snap = db.prepare('SELECT source_store_id, instrucciones, reglas, productos FROM templates_content WHERE template_id = ?').get(plantillaId) as Snapshot | undefined;
  // Si todavía no está congelada, congelamos la versión ACTUAL de la maestra una sola vez.
  if (!snapshotUtil(snap)) {
    const master = tiendaMaestraId();
    if (master && master !== storeId && congelarPlantilla(plantillaId, master)) {
      snap = db.prepare('SELECT source_store_id, instrucciones, reglas, productos FROM templates_content WHERE template_id = ?').get(plantillaId) as Snapshot | undefined;
    }
  }

  if (snapshotUtil(snap)) {
    aplicarSnapshot(snap, storeId, plantillaId);
  } else if (plantillaId === 'ecommerce-v10') {
    // Respaldo de fábrica si no hay tienda maestra con contenido: solo el
    // asistente (instrucciones + reglas). Los productos van por la Biblioteca.
    db.prepare(
      `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
       ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
    ).run(storeId, ECOMMERCE_INSTRUCCIONES, j(ECOMMERCE_REGLAS));
  }

  db.prepare('INSERT OR IGNORE INTO installed_templates (store_id, template_id) VALUES (?,?)').run(storeId, plantillaId);
  return { ok: true };
}

/**
 * Desinstala una plantilla. Si borrarDatos=true, elimina los productos/servicios
 * que trajo esa plantilla y limpia el asistente. Si false, solo limpia el
 * asistente (instrucciones, reglas y prompt) y conserva los productos.
 */
export function desinstalarPlantilla(storeId: string, plantillaId: string, borrarDatos: boolean): { ok?: boolean; error?: string; borrados?: number } {
  const inst = db.prepare('SELECT 1 FROM installed_templates WHERE store_id = ? AND template_id = ?').get(storeId, plantillaId);
  if (!inst) return { error: 'Esa plantilla no está instalada.' };
  let borrados = 0;
  if (borrarDatos) {
    const r = db.prepare('DELETE FROM products WHERE store_id = ? AND plantilla_id = ?').run(storeId, plantillaId);
    borrados = r.changes;
  }
  // Limpia el asistente (instrucciones, reglas y prompt principal) en ambos casos.
  db.prepare("UPDATE assistants SET instrucciones = '', reglas = '[]' WHERE store_id = ?").run(storeId);
  db.prepare('DELETE FROM installed_templates WHERE store_id = ? AND template_id = ?').run(storeId, plantillaId);
  return { ok: true, borrados };
}

/** Lista las plantillas con su estado (instalada o no) para la tienda. */
export function listarPlantillas(storeId: string) {
  const instaladas = new Set(
    (db.prepare('SELECT template_id FROM installed_templates WHERE store_id = ?').all(storeId) as { template_id: string }[]).map((r) => r.template_id),
  );
  return PLANTILLAS.map((p) => ({ ...p, instalada: instaladas.has(p.id) }));
}
