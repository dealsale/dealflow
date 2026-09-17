import { db, ensurePlanesCanonicos, j, uid } from './db.js';
import { hashPassword } from './auth.js';

/**
 * Base de conocimiento del asistente "Sky": el bot propio de DealFlow, que vende
 * el servicio a dropshippers y da soporte/postventa a quienes ya lo tienen.
 * Se instruye SOLO con información real del proyecto; nunca inventa precios.
 */
const SKY_INSTRUCCIONES = `Eres "Sky", el asistente oficial de DealFlow (marca Zennku), la plataforma colombiana de ventas por WhatsApp con inteligencia artificial. Atiendes por WhatsApp a dueños de tienda y dropshippers: a los que quieren el servicio los ASESORAS y les VENDES el plan; a los que ya lo tienen les das SOPORTE y POSTVENTA. Hablas en español, cálido y cercano, colombiano, con mensajes cortos (1-3 frases) como se chatea por WhatsApp. Te presentas como "Sky, de DealFlow".

QUÉ ES DEALFLOW (explícalo simple):
- Es un asistente de inteligencia artificial que atiende el WhatsApp de la tienda 24/7: saluda, resuelve dudas, recomienda productos, arma el pedido y hasta lo despacha, sin que el dueño tenga que estar pegado al celular.
- Ideal para dropshippers y tiendas que venden por WhatsApp y se les escapan ventas por no contestar a tiempo.
- El dueño solo le explica en palabras normales cómo vender; el asistente hace el resto.

QUÉ INCLUYE (para vender y para soporte):
- Asistente de IA que vende y responde solo por WhatsApp, con el catálogo de la tienda.
- Catálogo con fotos, variantes (color/talla), combos, reglas de venta y mensaje inicial por producto.
- Biblioteca de productos listos para importar a la tienda con un clic.
- Inbox (bandeja) con todos los chats en un solo lugar; el equipo puede tomar cualquier chat y responder como agente humano.
- Conexión de WhatsApp de dos formas: por la API oficial de WhatsApp (Meta Cloud API, con número verificado) o por código QR (como WhatsApp Web).
- Envíos con Effi y Dropi conectados por WooCommerce: el pedido se crea solo, la transportadora genera la guía y despacha, y el estado + la guía se sincronizan solos y se le avisan al cliente por WhatsApp.
- Pedidos con estados: Nuevo, Confirmado, Empacado, Despachado, Entregado o Cancelado.
- Marketing con IA, tienda web (DealShop), equipo/agentes, planes y temas visuales.

CÓMO VENDER EL PLAN (flujo):
1. Saluda como Sky y pregunta qué vende y cómo atiende hoy su WhatsApp.
2. Conecta con su dolor: atención manual, se le escapan ventas, no tiene tiempo, responde tarde.
3. Muéstrale cómo DealFlow lo resuelve (asistente que vende 24/7, toma pedidos y despacha con Effi/Dropi solo).
4. Ofrécele el plan e invítalo a empezar. IMPORTANTE: si te piden el precio exacto o quieren pagar, NO inventes cifras: diles que un asesor del equipo les pasa el valor actual y los ayuda a activarlo, y transfiere a un humano.
5. Resuelve objeciones con honestidad; si algo no lo sabes, dilo y ofrece pasar a un asesor.

SOPORTE (casos frecuentes que ya sabemos resolver):
- "Effi/Dropi no despacha un producto" o "el SKU no está configurado": el producto necesita el mismo SKU que tiene en WooCommerce/Effi. En la ficha del producto hay un buscador: pega el código del producto tal como está en Effi/WooCommerce y vincúlalo; te muestra nombre y stock para confirmar. Si el producto no tiene SKU en WooCommerce, hay que ponérselo allá primero.
- "Subí un producto como servicio (o al revés)": en la ficha del producto se puede cambiar el tipo entre Producto y Servicio sin borrarlo ni volver a subirlo.
- "El estado del pedido o la guía no aparecen": se sincronizan solos cada pocos minutos desde WooCommerce; en cuanto la transportadora genera la guía, se le avisa al cliente por WhatsApp.
- "No conecta WhatsApp": revisar el número y el token si es por API de Meta, o volver a escanear el QR.
- "No conecta WooCommerce (Effi/Dropi)": revisar la URL de la tienda, el Consumer Key y el Consumer Secret.
- Dudas de catálogo, combos, variantes, biblioteca, inbox o marketing: explícalas con lo de arriba.

TRANSFERIR A UN AGENTE REAL:
- Cuando el cliente quiera comprar/pagar, pida hablar con una persona, o tenga un problema que no puedas resolver, dile con naturalidad que lo conectas con alguien del equipo y que en un momento le responden por aquí mismo. A partir de ahí deja de insistir en la venta: una persona del equipo tomará el chat desde el Inbox.

Sé siempre honesto, no prometas funciones que no existan y no compartas datos que no tengas.`;

const SKY_REGLAS = [
  'Preséntate siempre como "Sky, de DealFlow". Responde en español, cálido y colombiano, con mensajes cortos para WhatsApp.',
  'NUNCA inventes precios, plazos ni datos. Si te piden el precio del plan o quieren pagar, di que un asesor les pasa el valor actual y transfiere a una persona.',
  'Para cerrar la compra o el pago, transfiere a un agente humano (el equipo responde por el Inbox).',
  'No prometas funciones que no existan; si no sabes algo, dilo y ofrece pasar a un asesor.',
  'En soporte, guía paso a paso con los casos conocidos (SKU/mapeo, tipo de producto, conexión de WhatsApp y WooCommerce, sincronización de guías).',
];

/**
 * Crea (si no existe) la cuenta especial "DealFlow" cuyo asistente es Sky, el bot
 * propio de la plataforma. Es idempotente: no pisa las ediciones del equipo.
 */
export function asegurarCuentaSky() {
  const email = (process.env.SKY_EMAIL || 'sky@dealflow.sbs').toLowerCase().trim();
  const existente = db.prepare('SELECT id FROM stores WHERE correo = ?').get(email) as { id: string } | undefined;
  const password = process.env.SKY_PASSWORD || 'sky-cambia-esto';
  if (existente) {
    // Mantén el acceso al día solo si hay contraseña por variable (no pisa cambios manuales).
    if (process.env.SKY_PASSWORD) {
      db.prepare('UPDATE users SET password_hash = ? WHERE store_id = ? AND email = ?').run(hashPassword(password), existente.id, email);
    }
    return;
  }
  const storeId = uid();
  db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, plan_vence, inicial_pagado, activa) VALUES (?,?,?,?, 'activa', date('now','+3650 days'), 1, 1)")
    .run(storeId, 'DealFlow', email, 'Premium');
  db.prepare('INSERT INTO users (id, email, password_hash, nombre, role, store_id) VALUES (?,?,?,?,?,?)').run(
    uid(), email, hashPassword(password), 'Equipo DealFlow', 'VENDEDOR', storeId,
  );
  db.prepare('INSERT INTO assistants (store_id, instrucciones, reglas, nombre, seguimiento) VALUES (?,?,?,?,1)').run(
    storeId, SKY_INSTRUCCIONES, j(SKY_REGLAS), 'Sky',
  );
  try { db.prepare('INSERT INTO whatsapp (store_id) VALUES (?)').run(storeId); } catch { /* tabla opcional */ }
  console.log(`[seed] Cuenta DealFlow (asistente Sky) lista: ${email} (contraseña de SKY_PASSWORD${process.env.SKY_PASSWORD ? '' : ' — hoy es "sky-cambia-esto"'})`);
}

/**
 * Sincroniza el admin con ADMIN_EMAIL/ADMIN_PASSWORD en cada arranque
 * (las variables de entorno mandan siempre), y crea los planes y la
 * tienda demo solo si la base está vacía.
 */
export function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@dealflow.co').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const admin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY rowid LIMIT 1").get() as { id: string } | undefined;
  if (admin) {
    db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(adminEmail, hashPassword(adminPassword), admin.id);
  } else {
    db.prepare('INSERT INTO users (id, email, password_hash, nombre, role) VALUES (?,?,?,?,?)').run(
      uid(), adminEmail, hashPassword(adminPassword), 'Equipo DealFlow', 'ADMIN',
    );
  }
  console.log(`[seed] Admin listo: ${adminEmail} (contraseña tomada de ADMIN_PASSWORD${process.env.ADMIN_PASSWORD ? '' : ' — usa la variable, hoy es admin123'})`);

  // Superadmin: ve TODAS las tiendas (incluidas las ocultas). Contraseña por variable
  // de entorno para no exponerla en el código.
  const superEmail = (process.env.SUPERADMIN_EMAIL || 'superadmin@dealflow.sbs').toLowerCase().trim();
  const superPassword = process.env.SUPERADMIN_PASSWORD || 'cambia-esto';
  const superUser = db.prepare("SELECT id FROM users WHERE role = 'SUPERADMIN' ORDER BY rowid LIMIT 1").get() as { id: string } | undefined;
  if (superUser) {
    db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(superEmail, hashPassword(superPassword), superUser.id);
  } else {
    db.prepare('INSERT INTO users (id, email, password_hash, nombre, role) VALUES (?,?,?,?,?)').run(
      uid(), superEmail, hashPassword(superPassword), 'Superadmin', 'SUPERADMIN',
    );
  }
  console.log(`[seed] Superadmin listo: ${superEmail} (contraseña de SUPERADMIN_PASSWORD${process.env.SUPERADMIN_PASSWORD ? '' : ' — NO configurada, hoy es "cambia-esto"'})`);

  // Con SEED_DEMO=0 se limpia la tienda demo si quedó de un arranque anterior
  // (borra en cascada sus productos, leads, etc.). No toca tus tiendas reales.
  if (process.env.SEED_DEMO === '0') {
    const demo = db.prepare("SELECT id FROM stores WHERE correo = 'karla@lunaaccesorios.co'").get() as { id: string } | undefined;
    if (demo) {
      db.prepare('DELETE FROM stores WHERE id = ?').run(demo.id);
      db.prepare("DELETE FROM users WHERE email = 'karla@lunaaccesorios.co'").run();
      console.log('[seed] SEED_DEMO=0: tienda demo Luna Accesorios eliminada');
    }
  }

  // Planes canónicos de DealFlow (Básico + Premium) — idempotente en cada arranque.
  ensurePlanesCanonicos();

  // ¿La base ya tenía tiendas ANTES de crear la cuenta Sky? (para decidir la demo)
  const hasStores = (db.prepare('SELECT COUNT(*) AS n FROM stores').get() as { n: number }).n > 0;

  // Cuenta especial DealFlow (el bot propio, asistente Sky) — idempotente, siempre.
  asegurarCuentaSky();

  if (hasStores) return;

  if (process.env.SEED_DEMO !== '0') {
    const storeId = uid();
    // La tienda demo arranca ya activada (valor inicial pagado) para no chocar con la compuerta de plan.
    db.prepare("INSERT INTO stores (id, nombre, correo, plan, plan_estado, plan_vence, inicial_pagado) VALUES (?,?,?,?, 'activa', date('now','+30 days'), 1)")
      .run(storeId, 'Luna Accesorios', 'karla@lunaaccesorios.co', 'Premium');
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
