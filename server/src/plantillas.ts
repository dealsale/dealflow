import { existsSync, copyFileSync } from 'node:fs';
import { db, uid, j, pj } from './db.js';
import { mediaPath } from './media.js';

/** Copia un archivo de media de una tienda a otra y devuelve la nueva URL. */
function copiarMediaUrl(from: string, to: string, url: unknown): unknown {
  if (typeof url !== 'string' || !url.startsWith('/api/media/')) return url;
  const m = url.match(/\/api\/media\/[^/]+\/([^/?#]+)/);
  if (!m) return url;
  const src = mediaPath(from, m[1]);
  if (!existsSync(src)) return url;
  const ext = m[1].includes('.') ? m[1].split('.').pop() : 'bin';
  const file = uid() + '.' + ext;
  try { copyFileSync(src, mediaPath(to, file)); } catch { return url; }
  return '/api/media/' + to + '/' + file;
}
const remapUrls = (from: string, to: string, str: unknown) =>
  j(pj<string[]>(str as string, []).map((u) => copiarMediaUrl(from, to, u)));
const remapBloques = (from: string, to: string, str: unknown) =>
  j(pj<{ tipo: string; valor: string }[]>(str as string, []).map((b) => (b.tipo === 'texto' ? b : { ...b, valor: copiarMediaUrl(from, to, b.valor) })));
const remapOpciones = (from: string, to: string, str: unknown) =>
  j(pj<{ nombre: string; valores: (string | { valor: string; foto?: string })[] }[]>(str as string, []).map((o) => ({
    ...o,
    valores: (o.valores || []).map((v) => (typeof v === 'string' ? { valor: v } : v.foto ? { ...v, foto: copiarMediaUrl(from, to, v.foto) } : v)),
  })));

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
    descripcion: 'Deja tu asistente listo para vender ropa por WhatsApp en minutos: instrucciones, reglas de venta y los productos ya configurados con tallas, colores, combos, multimedia y mensaje inicial.',
    precio: 0,
    features: [
      'Instrucciones del asistente listas para vender',
      'Todas las reglas de venta ya cargadas',
      'Productos de ejemplo con fotos, videos y mensajes',
      'Tallas, colores, combos y mensaje inicial incluidos',
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

/**
 * Tienda maestra de la que la plantilla toma su contenido EN VIVO (asistente +
 * productos + multimedia). Se resuelve por la variable de entorno
 * TEMPLATE_MASTER_STORE (id, correo o nombre) y, por defecto, por la tienda
 * llamada "Samy Store".
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

/**
 * Copia EN VIVO el asistente y los productos (con su multimedia) de la tienda
 * maestra hacia la tienda destino. Devuelve false si la maestra no tiene nada.
 */
function copiarDesdeTienda(from: string, to: string): boolean {
  const a = db.prepare('SELECT instrucciones, reglas FROM assistants WHERE store_id = ?').get(from) as { instrucciones: string; reglas: string } | undefined;
  const productos = db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY created_at').all(from) as Record<string, unknown>[];
  const tieneContenido = productos.length > 0 || (a?.instrucciones || '').trim().length > 0;
  if (!tieneContenido) return false;

  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
  ).run(to, a?.instrucciones || '', a?.reglas || '[]');

  for (const row of productos) {
    const variants = db.prepare('SELECT label, stock, fotos, fotos_subidas, orden FROM variants WHERE product_id = ? ORDER BY orden').all(row.id as string) as Record<string, unknown>[];
    const pid = uid();
    db.prepare(
      `INSERT INTO products (id, store_id, nombre, precio, color, txt, reglas, fotos, fotos_subidas, descripcion, caracteristicas, mensaje_inicial, faqs, testimonios, modos_uso, videos, mensaje_bloques, bundles, opciones, contenido_paquete, disparador, mensaje_inicial_activo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      pid, to, row.nombre, row.precio, row.color || '#E0E7FF', row.txt || '#4338CA',
      (row.reglas as string) || '[]', (row.fotos as string) || '[]', remapUrls(from, to, row.fotos_subidas),
      row.descripcion || '', row.caracteristicas || '', row.mensaje_inicial || '', (row.faqs as string) || '[]',
      remapUrls(from, to, row.testimonios), row.modos_uso || '', remapUrls(from, to, row.videos),
      remapBloques(from, to, row.mensaje_bloques), (row.bundles as string) || '[]', remapOpciones(from, to, row.opciones),
      row.contenido_paquete || '', row.disparador || '', row.mensaje_inicial_activo == null ? 1 : row.mensaje_inicial_activo,
    );
    for (const v of variants) {
      db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, fotos_subidas, orden) VALUES (?,?,?,?,?,?,?)')
        .run(uid(), pid, v.label, v.stock || 0, v.fotos || 0, remapUrls(from, to, v.fotos_subidas), v.orden || 0);
    }
  }
  return true;
}

/** Instala una plantilla en la tienda: deja el asistente y los productos listos. */
export function instalarPlantilla(storeId: string, plantillaId: string, force = false): { ok?: boolean; error?: string; yaInstalada?: boolean } {
  const p = PLANTILLAS.find((x) => x.id === plantillaId);
  if (!p) return { error: 'Plantilla no encontrada.' };
  const ya = db.prepare('SELECT 1 FROM installed_templates WHERE store_id = ? AND template_id = ?').get(storeId, plantillaId);
  if (ya && !force) return { yaInstalada: true, error: 'Esta plantilla ya está instalada en tu tienda.' };

  // 1) Contenido EN VIVO de la tienda maestra (Samy Store): asistente + productos + multimedia.
  const master = tiendaMaestraId();
  const copiada = master && master !== storeId ? copiarDesdeTienda(master, storeId) : false;

  // 2) Respaldo: si no hay tienda maestra con contenido, usamos la plantilla de fábrica.
  if (!copiada && plantillaId === 'ecommerce-v10') {
    db.prepare(
      `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
       ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
    ).run(storeId, ECOMMERCE_INSTRUCCIONES, j(ECOMMERCE_REGLAS));

    const pid = uid();
    db.prepare(
      `INSERT INTO products (id, store_id, nombre, precio, color, txt, descripcion, caracteristicas, reglas, opciones, bundles, mensaje_bloques, contenido_paquete, disparador, mensaje_inicial_activo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    ).run(
      pid, storeId, 'Jogger Dama Bota Recta', 59900, '#F3E8FF', '#7E22CE',
      'Jogger de dama bota recta, en tela suave tipo licra-algodón que estiliza la figura. Cómodo para el día a día y para salir, con tiro alto que marca la cintura.',
      'Tela: 95% algodón, 5% licra. Tiro alto. Bolsillos laterales. Pretina ancha que no aprieta. Horma que estiliza.',
      j(['Si piden 2 o más, ofrece el combo "2 joggers por $99.900" sin que lo pidan.', 'Confirma talla y color antes de cerrar el pedido.']),
      j([
        { nombre: 'Talla', valores: [{ valor: 'S' }, { valor: 'M' }, { valor: 'L' }, { valor: 'XL' }] },
        { nombre: 'Color', valores: [{ valor: 'Negro' }, { valor: 'Gris' }, { valor: 'Beige' }] },
      ]),
      j([
        { cantidad: 2, precio: 99900, etiqueta: 'El más pedido' },
        { cantidad: 3, precio: 139900 },
      ]),
      j([{ tipo: 'texto', valor: '¡Hola! 😊 Mira nuestro Jogger Dama Bota Recta, el más pedido: tiro alto, súper cómodo y estiliza la figura. Está en $59.900, y si llevas 2 te salen en $99.900 🔥 ¿Te digo las tallas y colores disponibles?' }]),
      '1 jogger dama en la talla y color que elijas, empacado con cuidado. Envío contra entrega.',
      '¡Hola! Me interesan los joggers de dama.',
    );
    db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos) VALUES (?,?,?,?,0)').run(uid(), pid, 'Única', 0);
  }

  db.prepare('INSERT OR IGNORE INTO installed_templates (store_id, template_id) VALUES (?,?)').run(storeId, plantillaId);
  return { ok: true };
}

/** Lista las plantillas con su estado (instalada o no) para la tienda. */
export function listarPlantillas(storeId: string) {
  const instaladas = new Set(
    (db.prepare('SELECT template_id FROM installed_templates WHERE store_id = ?').all(storeId) as { template_id: string }[]).map((r) => r.template_id),
  );
  return PLANTILLAS.map((p) => ({ ...p, instalada: instaladas.has(p.id) }));
}
