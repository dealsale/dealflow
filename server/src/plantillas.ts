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
// Las plantillas NO traen fotos pegadas a cada color/opción: son del catálogo de
// la tienda maestra. Cada tienda pone las suyas, así que al instalar se quitan.
const remapOpciones = (_from: string, _to: string, str: unknown) =>
  j(pj<{ nombre: string; valores: (string | { valor: string; foto?: string })[] }[]>(str as string, []).map((o) => ({
    ...o,
    valores: (o.valores || []).map((v) => (typeof v === 'string' ? { valor: v } : { valor: v.valor })),
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
  {
    id: 'soporte-tecnico',
    nombre: 'Soporte técnico',
    descripcion: 'Un agente que diagnostica problemas con preguntas, da pasos de solución y escala a un técnico cuando hace falta. Trae servicios de soporte listos.',
    precio: 0,
    features: ['Diagnóstico guiado paso a paso', 'Escala a un técnico y toma datos', 'Servicios de soporte de ejemplo'],
  },
  {
    id: 'atencion-cliente',
    nombre: 'Atención al cliente',
    descripcion: 'Responde dudas frecuentes, estado de pedidos, cambios, devoluciones y garantías, y pasa el chat a un agente cuando el caso lo necesita.',
    precio: 0,
    features: ['Preguntas frecuentes y estado de pedidos', 'Cambios, devoluciones y garantías', 'Deriva a un agente humano'],
  },
  {
    id: 'reservas',
    nombre: 'Reservas / Booking',
    descripcion: 'Muestra tus servicios con duración y precio, agenda la cita, toma los datos y confirma. Ideal para salones, consultorios y servicios con cita.',
    precio: 0,
    features: ['Agenda citas por chat', 'Servicios con duración y precio', 'Toma datos y confirma la reserva'],
  },
  {
    id: 'educacion',
    nombre: 'Educación',
    descripcion: 'Informa sobre cursos, horarios y precios, resuelve dudas e inscribe alumnos. Trae cursos de ejemplo listos para editar.',
    precio: 0,
    features: ['Info de cursos, horarios y precios', 'Inscribe alumnos por chat', 'Ofrece la clase demo gratis'],
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
interface Servicio { nombre: string; precio: number; duracion?: string; descripcion?: string; disparador?: string; mensajeInicial?: string }
interface Fabrica { instrucciones: string; reglas: string[]; servicios: Servicio[] }

const FABRICA: Record<string, Fabrica> = {
  'soporte-tecnico': {
    instrucciones: 'Eres el asistente de soporte técnico de la tienda. Atiende con paciencia y en lenguaje claro. Cuando alguien reporte una falla, primero pregúntale: qué equipo o producto es, qué estaba haciendo y qué mensaje o problema ve. Luego da pasos de solución numerados y sencillos, de a uno, y confirma si funcionó antes de seguir. Si tras los pasos no se resuelve, ofrece agendar Soporte remoto o una Visita técnica y toma su nombre y teléfono. No prometas soluciones que no existan.',
    reglas: [
      'Pide siempre el modelo/versión del equipo y una descripción de la falla antes de dar una solución.',
      'Da los pasos de a uno y confirma si funcionó antes de continuar.',
      'Si no se resuelve en el chat, ofrece Soporte remoto o Visita técnica y toma nombre y contacto.',
      'Si es un caso de garantía, explica el proceso y qué necesita el cliente.',
    ],
    servicios: [
      { nombre: 'Diagnóstico gratis', precio: 0, duracion: '20 min', descripcion: 'Revisamos tu caso y te decimos qué tiene, sin costo.', mensajeInicial: '¡Hola! Cuéntame qué equipo es y qué falla estás viendo, y te ayudo a resolverlo. 🙂' },
      { nombre: 'Soporte remoto', precio: 30000, duracion: '45 min', descripcion: 'Nos conectamos a tu equipo y resolvemos el problema a distancia.' },
      { nombre: 'Visita técnica a domicilio', precio: 60000, duracion: '1 h', descripcion: 'Un técnico va a tu ubicación a revisar y reparar.' },
      { nombre: 'Plan de mantenimiento mensual', precio: 80000, duracion: 'mensual', descripcion: 'Revisiones y soporte prioritario todos los meses.' },
    ],
  },
  'atencion-cliente': {
    instrucciones: 'Eres el asistente de atención al cliente de la tienda. Responde con amabilidad y resuelve rápido. Ayuda con: estado de pedidos (pide el número de pedido o el documento), cambios y devoluciones (explica la política), garantías y preguntas frecuentes. Si el caso necesita a una persona o el cliente está molesto, ofrece pasar el chat a un agente y toma sus datos. Respuestas cortas y claras.',
    reglas: [
      'Para el estado de un pedido, pide el número de pedido o el documento del cliente.',
      'Explica la política de cambios y devoluciones antes de prometer uno.',
      'Si el cliente está molesto o el caso es delicado, ofrece pasarlo a un agente humano.',
      'No inventes políticas ni tiempos de entrega que no conozcas.',
    ],
    servicios: [
      { nombre: 'Estado de mi pedido', precio: 0, descripcion: 'Consulta en qué va tu pedido con tu número o documento.', mensajeInicial: '¡Hola! ¿En qué te ayudo? Puedo ver el estado de tu pedido, gestionar cambios o pasarte con un agente. 🙂' },
      { nombre: 'Cambios y devoluciones', precio: 0, descripcion: 'Te explicamos cómo cambiar o devolver un producto.' },
      { nombre: 'Garantía', precio: 0, descripcion: 'Revisamos tu caso de garantía y el proceso a seguir.' },
      { nombre: 'Hablar con un agente', precio: 0, descripcion: 'Te pasamos con una persona del equipo.' },
    ],
  },
  reservas: {
    instrucciones: 'Eres el asistente de reservas de la tienda. Muestra los servicios disponibles con su duración y precio, pregunta qué día y hora le sirve al cliente, confirma la reserva y toma su nombre y teléfono. Sé claro con los tiempos. Si piden algo fuera de lo que ofreces, dilo con amabilidad y sugiere una alternativa.',
    reglas: [
      'Muestra siempre la duración y el precio del servicio antes de agendar.',
      'Confirma día, hora, nombre y teléfono antes de dar la reserva por hecha.',
      'No agendes dos citas a la misma hora.',
      'Explica la política de cancelación si el cliente pregunta.',
    ],
    servicios: [
      { nombre: 'Cita de valoración', precio: 0, duracion: '20 min', descripcion: 'Primera cita para conocer lo que necesitas.', mensajeInicial: '¡Hola! 😊 ¿Qué servicio te gustaría reservar y para qué día? Te digo horarios disponibles.' },
      { nombre: 'Corte de cabello', precio: 25000, duracion: '30 min', descripcion: 'Corte y peinado.' },
      { nombre: 'Manicure', precio: 35000, duracion: '45 min', descripcion: 'Manicure completo.' },
      { nombre: 'Peinado para evento', precio: 60000, duracion: '1 h', descripcion: 'Peinado especial para tu evento.' },
    ],
  },
  educacion: {
    instrucciones: 'Eres el asistente de un centro educativo. Informa sobre los cursos: de qué tratan, a quién van dirigidos, horarios, precio y forma de pago. Resuelve dudas e inscribe a los interesados tomando su nombre, contacto y el curso que quieren. Sé claro y motivador, sin exagerar resultados.',
    reglas: [
      'Da la información exacta de cada curso (horario, precio, requisitos).',
      'Ofrece la clase demo gratis a quien esté indeciso.',
      'Para inscribir, toma nombre, contacto y el curso que quiere.',
      'No prometas certificaciones o resultados que la institución no ofrezca.',
    ],
    servicios: [
      { nombre: 'Clase demo gratis', precio: 0, duracion: '1 h', descripcion: 'Una clase de prueba para que conozcas cómo enseñamos.', mensajeInicial: '¡Hola! 🎓 ¿Qué te gustaría aprender? Te cuento los cursos, horarios y precios, y puedes empezar con una clase demo gratis.' },
      { nombre: 'Curso de Inglés Básico', precio: 150000, duracion: 'mensual', descripcion: 'Nivel principiante, clases 2 veces por semana.' },
      { nombre: 'Diplomado en Marketing Digital', precio: 600000, descripcion: 'Programa completo con certificado.' },
      { nombre: 'Mensualidad', precio: 120000, duracion: 'mensual', descripcion: 'Pago mensual del programa en el que estés inscrito.' },
    ],
  },
};

/** Aplica una plantilla de servicios (contenido de fábrica) a la tienda. */
function aplicarFabrica(plantillaId: string, storeId: string, fab: Fabrica) {
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
  ).run(storeId, fab.instrucciones, j(fab.reglas));
  for (const s of fab.servicios) {
    const pid = uid();
    db.prepare(
      `INSERT INTO products (id, store_id, tipo, plantilla_id, nombre, precio, duracion, color, txt, descripcion, mensaje_bloques, disparador, mensaje_inicial_activo)
       VALUES (?,?, 'servicio', ?, ?, ?, ?, '#E0E7FF', '#4338CA', ?, ?, ?, 1)`,
    ).run(
      pid, storeId, plantillaId, s.nombre, s.precio, s.duracion || '', s.descripcion || '',
      j(s.mensajeInicial ? [{ tipo: 'texto', valor: s.mensajeInicial }] : []), s.disparador || '',
    );
    db.prepare("INSERT INTO variants (id, product_id, label, stock, fotos) VALUES (?,?,?,0,0)").run(uid(), pid, 'Única');
  }
}

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

/** Aplica el snapshot congelado a la tienda destino, copiando su multimedia. */
function aplicarSnapshot(snap: Snapshot, storeId: string, plantillaId: string) {
  db.prepare(
    `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
  ).run(storeId, snap.instrucciones, snap.reglas);
  const from = snap.source_store_id;
  const prods = pj<{ row: Record<string, unknown>; variants: Record<string, unknown>[] }[]>(snap.productos, []);
  for (const { row, variants } of prods) {
    const pid = uid();
    db.prepare(
      `INSERT INTO products (id, store_id, plantilla_id, nombre, precio, color, txt, reglas, fotos, fotos_subidas, descripcion, caracteristicas, mensaje_inicial, faqs, testimonios, modos_uso, videos, mensaje_bloques, bundles, opciones, contenido_paquete, disparador, mensaje_inicial_activo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      pid, storeId, plantillaId, row.nombre, row.precio, row.color || '#E0E7FF', row.txt || '#4338CA',
      (row.reglas as string) || '[]', (row.fotos as string) || '[]', remapUrls(from, storeId, row.fotos_subidas),
      row.descripcion || '', row.caracteristicas || '', row.mensaje_inicial || '', (row.faqs as string) || '[]',
      remapUrls(from, storeId, row.testimonios), row.modos_uso || '', remapUrls(from, storeId, row.videos),
      remapBloques(from, storeId, row.mensaje_bloques), (row.bundles as string) || '[]', remapOpciones(from, storeId, row.opciones),
      row.contenido_paquete || '', row.disparador || '', row.mensaje_inicial_activo == null ? 1 : row.mensaje_inicial_activo,
    );
    for (const v of variants || []) {
      db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, fotos_subidas, orden) VALUES (?,?,?,?,?,?,?)')
        .run(uid(), pid, v.label, v.stock || 0, v.fotos || 0, remapUrls(from, storeId, v.fotos_subidas), v.orden || 0);
    }
  }
}

/** Instala una plantilla en la tienda: deja el asistente y los productos listos. */
export function instalarPlantilla(storeId: string, plantillaId: string, force = false): { ok?: boolean; error?: string; yaInstalada?: boolean } {
  const p = PLANTILLAS.find((x) => x.id === plantillaId);
  if (!p) return { error: 'Plantilla no encontrada.' };
  const ya = db.prepare('SELECT 1 FROM installed_templates WHERE store_id = ? AND template_id = ?').get(storeId, plantillaId);
  if (ya && !force) return { yaInstalada: true, error: 'Esta plantilla ya está instalada en tu tienda.' };

  // Las plantillas de servicios (soporte, atención, reservas, educación) usan su
  // contenido de fábrica; NO se copian de la tienda maestra (esa es de ropa).
  if (FABRICA[plantillaId]) {
    aplicarFabrica(plantillaId, storeId, FABRICA[plantillaId]);
    db.prepare('INSERT OR IGNORE INTO installed_templates (store_id, template_id) VALUES (?,?)').run(storeId, plantillaId);
    return { ok: true };
  }

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
    // Respaldo de fábrica si no hay tienda maestra con contenido.
    db.prepare(
      `INSERT INTO assistants (store_id, instrucciones, reglas) VALUES (?,?,?)
       ON CONFLICT(store_id) DO UPDATE SET instrucciones = excluded.instrucciones, reglas = excluded.reglas`,
    ).run(storeId, ECOMMERCE_INSTRUCCIONES, j(ECOMMERCE_REGLAS));

    const pid = uid();
    db.prepare(
      `INSERT INTO products (id, store_id, plantilla_id, nombre, precio, color, txt, descripcion, caracteristicas, reglas, opciones, bundles, mensaje_bloques, contenido_paquete, disparador, mensaje_inicial_activo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    ).run(
      pid, storeId, plantillaId, 'Jogger Dama Bota Recta', 59900, '#F3E8FF', '#7E22CE',
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
