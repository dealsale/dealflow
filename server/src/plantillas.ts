import { db, uid, j } from './db.js';

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
    descripcion: 'Deja tu asistente listo para vender ropa por WhatsApp en minutos: instrucciones, reglas de venta y un producto de ejemplo (Jogger Dama) ya configurado con tallas, colores, combos y mensaje inicial.',
    precio: 0,
    features: [
      'Instrucciones del asistente listas para vender',
      'Reglas de venta (envío contra entrega, ciudad, combos)',
      'Producto de ejemplo: Jogger Dama Bota Recta',
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

/** Instala una plantilla en la tienda: deja el asistente y un producto listos. */
export function instalarPlantilla(storeId: string, plantillaId: string): { ok?: boolean; error?: string; yaInstalada?: boolean } {
  const p = PLANTILLAS.find((x) => x.id === plantillaId);
  if (!p) return { error: 'Plantilla no encontrada.' };
  const ya = db.prepare('SELECT 1 FROM installed_templates WHERE store_id = ? AND template_id = ?').get(storeId, plantillaId);
  if (ya) return { yaInstalada: true, error: 'Esta plantilla ya está instalada en tu tienda.' };

  if (plantillaId === 'ecommerce-v10') {
    // 1) Asistente: instrucciones + reglas.
    db.prepare(
      `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
       ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
    ).run(storeId, ECOMMERCE_INSTRUCCIONES, j(ECOMMERCE_REGLAS));

    // 2) Producto de ejemplo: Jogger Dama Bota Recta.
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

  db.prepare('INSERT INTO installed_templates (store_id, template_id) VALUES (?,?)').run(storeId, plantillaId);
  return { ok: true };
}

/** Lista las plantillas con su estado (instalada o no) para la tienda. */
export function listarPlantillas(storeId: string) {
  const instaladas = new Set(
    (db.prepare('SELECT template_id FROM installed_templates WHERE store_id = ?').all(storeId) as { template_id: string }[]).map((r) => r.template_id),
  );
  return PLANTILLAS.map((p) => ({ ...p, instalada: instaladas.has(p.id) }));
}
