import { db, j, uid } from './db.js';
import { hashPassword } from './auth.js';

/** Crea el admin, los planes y (opcional) la tienda demo si la base está vacía. */
export function seed() {
  const hasUsers = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n > 0;
  if (hasUsers) return;

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@dealflow.co';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (id, email, password_hash, nombre, role) VALUES (?,?,?,?,?)').run(
    uid(), adminEmail, hashPassword(adminPassword), 'Equipo DealFlow', 'ADMIN',
  );
  console.log(`[seed] Admin creado: ${adminEmail} (contraseña: ${process.env.ADMIN_PASSWORD ? 'la de ADMIN_PASSWORD' : adminPassword + ' — cámbiala'})`);

  for (const [nombre, precio, features] of [
    ['Inicio', 49900, ['1 número de WhatsApp', 'Hasta 100 pedidos al mes', 'Asistente con catálogo y promos']],
    ['Crecimiento', 99900, ['1 número de WhatsApp', 'Pedidos ilimitados', 'Flujos y asignación de chats', 'Integración con Dropi']],
    ['Pro', 199900, ['3 números de WhatsApp', 'Todo lo de Crecimiento', 'Varios usuarios por cuenta', 'Acceso por API']],
  ] as [string, number, string[]][]) {
    db.prepare('INSERT INTO plans (id, nombre, precio, features) VALUES (?,?,?,?)').run(uid(), nombre, precio, j(features));
  }

  if (process.env.SEED_DEMO !== '0') {
    const storeId = uid();
    db.prepare('INSERT INTO stores (id, nombre, correo, plan) VALUES (?,?,?,?)').run(storeId, 'Luna Accesorios', 'karla@lunaaccesorios.co', 'Crecimiento');
    db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)').run(
      uid(), 'karla@lunaaccesorios.co', hashPassword('demo123'), 'Karla', 'VENDEDOR', storeId,
    );
    db.prepare('INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)').run(
      storeId,
      'Vende como una asesora amable de Luna Accesorios. Saluda por el nombre si lo sabes. Recomienda máximo 2 productos por mensaje. Si preguntan por tallas, pide la talla habitual antes de sugerir. Cierra siempre preguntando la ciudad para cotizar el envío.',
      j(['Si preguntan por envío, pide la ciudad antes de dar el precio.', 'Nunca ofrezcas más del 10% de descuento.']),
    );
    db.prepare('INSERT INTO whatsapp (store_id) VALUES (?)').run(storeId);

    const productos: [string, number, string, string, string[], [string, number, number][]][] = [
      ['Jogger jaspeado', 44900, '#D1FAE5', '#047857', ['Si piden 2 o más, ofrece la promo "3 joggers por $109.900" sin que la pidan.'], [['M · Verde', 6, 2], ['L · Verde', 4, 2], ['M · Negro', 7, 3], ['L · Negro', 4, 3]]],
      ['Camiseta oversize algodón', 59900, '#E0E7FF', '#4338CA', ['Si compran 2 o más, aplica la promo "2 por $99.900" sin que la pidan.'], [['S · Blanco', 8, 0], ['M · Blanco', 6, 0], ['M · Negro', 7, 0], ['L · Negro', 3, 0]]],
      ['Jean mom fit tiro alto', 129900, '#DBEAFE', '#1D4ED8', ['Sugiere la guía de tallas antes de confirmar.'], [['6 · Azul claro', 4, 0], ['8 · Azul claro', 5, 0], ['10 · Azul oscuro', 3, 0]]],
      ['Gorra bordada logo', 39900, '#DCFCE7', '#15803D', ['Producto de entrada: ofrécela como complemento de cualquier compra.'], [['Única · Negra', 18, 0], ['Única · Beige', 12, 0]]],
    ];
    for (const [nombre, precio, color, txt, reglas, variantes] of productos) {
      const pid = uid();
      db.prepare('INSERT INTO products (id, store_id, nombre, precio, color, txt, reglas, fotos) VALUES (?,?,?,?,?,?,?,?)').run(
        pid, storeId, nombre, precio, color, txt, j(reglas), j(['Frente', 'Detalle']),
      );
      variantes.forEach(([label, stock, fotos], i) => {
        db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, orden) VALUES (?,?,?,?,?,?)').run(uid(), pid, label, stock, fotos, i);
      });
    }

    db.prepare('INSERT INTO promos (id, store_id, tipo, titulo, descripcion, vigencia) VALUES (?,?,?,?,?,?)').run(
      uid(), storeId, 'Promoción', '3 joggers por $109.900', 'Tres joggers jaspeados en cualquier talla y color.', 'Sin fecha de vencimiento',
    );

    const pedidos: [string, string, string, string, string, number, [number, string, number][]][] = [
      ['Mariana López', 'Bogotá', '+57 310 442 8811', 'Cra 15 # 82-40, apto 302', 'Nuevo', 9900, [[2, 'Camiseta oversize algodón', 59900], [1, 'Gorra bordada logo', 39900]]],
      ['Sofía Ramírez', 'Cali', '+57 315 662 9034', 'Av 6N # 25-30', 'Confirmado', 12000, [[3, 'Jogger jaspeado', 44900]]],
    ];
    pedidos.forEach(([cliente, ciudad, tel, direccion, estado, envio, items], i) => {
      const oid = uid();
      db.prepare('INSERT INTO orders (id, store_id, numero, cliente, ciudad, tel, direccion, estado, envio) VALUES (?,?,?,?,?,?,?,?,?)').run(
        oid, storeId, 1048 + i, cliente, ciudad, tel, direccion, estado, envio,
      );
      for (const [qty, nombre, precio] of items) {
        db.prepare('INSERT INTO order_items (id, order_id, qty, nombre, precio) VALUES (?,?,?,?,?)').run(uid(), oid, qty, nombre, precio);
      }
    });

    console.log('[seed] Tienda demo creada: karla@lunaaccesorios.co / demo123');
  }
}
