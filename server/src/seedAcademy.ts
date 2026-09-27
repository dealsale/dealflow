import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { db, uid } from './db.js';
import { mediaDir } from './media.js';

/**
 * Precarga cursos base de Academy (contenido real de cómo usar DealFlow) para
 * que el portal no arranque vacío. Idempotente: solo corre si NO hay cursos.
 * El admin puede editar, despublicar, reordenar o reemplazar por videos.
 */

interface Lec { titulo: string; tipo: 'video' | 'articulo'; contenido?: string; videoUrl?: string; duracion?: string }
interface Cur { titulo: string; descripcion: string; nivel: string; lecciones: Lec[] }

const CURSOS: Cur[] = [
  {
    titulo: 'Primeros pasos con DealFlow',
    descripcion: 'Qué es DealFlow, cómo moverte por el panel y cómo conectar tu WhatsApp para empezar a vender.',
    nivel: 'Básico',
    lecciones: [
      {
        titulo: '¿Qué es DealFlow y cómo te ayuda a vender?', tipo: 'articulo', duracion: '3 min',
        contenido: 'DealFlow es tu asistente de ventas por WhatsApp con inteligencia artificial. Atiende a tus clientes 24/7: saluda, resuelve dudas, recomienda productos, arma el pedido y hasta coordina el despacho, sin que tengas que estar pegado al celular.\n\nTú le explicas en palabras normales cómo vender (qué productos tienes, precios, formas de pago) y el asistente hace el resto. En este portal aprenderás a configurarlo paso a paso.',
      },
      {
        titulo: 'Recorrido por el panel', tipo: 'articulo', duracion: '4 min',
        contenido: 'El menú de la izquierda tiene todo lo que necesitas:\n\n• Resumen: tus ventas del mes y estadísticas.\n• Inbox/Chats: las conversaciones con tus clientes en vivo.\n• Productos: tu catálogo (fotos, precios, tallas/colores).\n• Asistente: las instrucciones y el tono de tu bot.\n• Pedidos: los pedidos que se van cerrando.\n• Estadísticas: gráficos de chats, leads, anuncios y ventas.\n• Integraciones: conectar WhatsApp, WooCommerce, etc.\n\nTómate un minuto para hacer clic en cada sección y familiarizarte.',
      },
      {
        titulo: 'Conectar tu WhatsApp', tipo: 'articulo', duracion: '5 min',
        contenido: 'Ve a Integraciones → WhatsApp. Lo recomendado es la conexión oficial (WhatsApp Cloud API): da el botón de "Conexión automática", elige tu cuenta de WhatsApp Business y tu número, y listo — el asistente queda recibiendo y respondiendo mensajes.\n\nLa conexión oficial es más estable y es la ÚNICA que permite usar plantillas de mensajes (necesarias para escribirle a un cliente después de 24 horas). Evita depender del método por QR.',
      },
    ],
  },
  {
    titulo: 'Cómo subir un producto',
    descripcion: 'Crea productos con fotos, precios y variantes, y arma el mensaje de bienvenida que envía el bot.',
    nivel: 'Básico',
    lecciones: [
      {
        titulo: 'Crear tu primer producto', tipo: 'articulo', duracion: '4 min',
        contenido: 'En la sección Productos, dale a "Nuevo producto". Ponle nombre, precio y una descripción corta y clara. Guarda.\n\nConsejo: escribe el nombre como lo busca tu cliente (ej. "Jogger jaspeado") y usa la descripción para resaltar beneficios (material, tallas disponibles, envío).',
      },
      {
        titulo: 'Fotos, tallas y colores (variantes)', tipo: 'articulo', duracion: '5 min',
        contenido: 'Sube varias fotos del producto: la primera es la principal. Luego agrega las variantes (tallas y/o colores) con su stock. Así el asistente sabe qué ofrecer y cuándo algo está agotado.\n\nMantén el stock al día: si vendes por WooCommerce, DealFlow puede sincronizarlo automáticamente.',
      },
      {
        titulo: 'El mensaje inicial (el saludo del bot)', tipo: 'articulo', duracion: '5 min',
        contenido: 'Cada producto puede tener un "mensaje inicial": la secuencia de fotos, videos y textos que el asistente envía cuando un cliente pregunta por él.\n\nImportante (anti-baneo): DealFlow envía esas piezas con pausas humanas, nunca todas de golpe. No lo desactives. Mantén el saludo enfocado: 1 o 2 fotos buenas y un texto claro venden más que una ráfaga de 10 imágenes.',
      },
    ],
  },
  {
    titulo: 'El asistente y las automatizaciones',
    descripcion: 'Instruye a tu bot, crea flujos de remarketing y aplica las buenas prácticas para no ser baneado por WhatsApp.',
    nivel: 'Intermedio',
    lecciones: [
      {
        titulo: 'Instrucciones y tono del asistente', tipo: 'articulo', duracion: '6 min',
        contenido: 'En la sección Asistente le dices al bot cómo vender: qué ofrecer, cómo responder precios, formas de pago y envío, y qué NO hacer. Escribe como si le explicaras a un vendedor nuevo.\n\nDefine también el tono (cercano, formal), si usa emojis y qué tan largos son los mensajes. Entre más claras las instrucciones, mejor vende.',
      },
      {
        titulo: 'Flujos de remarketing', tipo: 'articulo', duracion: '5 min',
        contenido: 'Los flujos son mensajes (texto, foto, audio, video) que reenganchan a un cliente. Se envían desde el chat, y solo a clientes que dieron su consentimiento (opt-in).\n\nRecuerda: el remarketing automático viene APAGADO por defecto. Si lo activas, hazlo con cabeza. Y fuera de las 24 horas desde el último mensaje del cliente, solo se pueden enviar plantillas aprobadas por Meta.',
      },
      {
        titulo: 'Buenas prácticas anti-baneo', tipo: 'articulo', duracion: '6 min',
        contenido: 'WhatsApp banea números que parecen spam. Para evitarlo:\n\n1. No le escribas primero a gente que no te contactó.\n2. No envíes mensajes en ráfaga (DealFlow ya lo controla por ti).\n3. Responde rápido y útil para bajar los bloqueos/reportes.\n4. Fuera de 24 h, usa solo plantillas aprobadas.\n5. Consigue el opt-in antes de mandar promociones.\n\nSeguir esto mantiene tu número sano y tus ventas fluyendo.',
      },
    ],
  },
];

export function seedAcademy(): void {
  const hay = (db.prepare('SELECT COUNT(*) n FROM academy_cursos').get() as { n: number }).n;
  if (hay > 0) return;
  const insCurso = db.prepare("INSERT INTO academy_cursos (id, titulo, descripcion, nivel, orden, publicado) VALUES (?,?,?,?,?,1)");
  const insSec = db.prepare("INSERT INTO academy_secciones (id, curso_id, titulo, orden) VALUES (?,?,?,0)");
  const insLec = db.prepare("INSERT INTO academy_lecciones (id, curso_id, seccion_id, titulo, tipo, video_url, contenido, duracion, orden, publicado) VALUES (?,?,?,?,?,?,?,?,?,1)");
  const tx = db.transaction(() => {
    CURSOS.forEach((c, ci) => {
      const cid = uid();
      insCurso.run(cid, c.titulo, c.descripcion, c.nivel, ci);
      const sid = uid();
      insSec.run(sid, cid, 'Contenido del curso');
      c.lecciones.forEach((l, li) => insLec.run(uid(), cid, sid, l.titulo, l.tipo, l.videoUrl || '', l.contenido || '', l.duracion || '', li));
    });
  });
  tx();
  console.log(`[seed] ${CURSOS.length} cursos de Academy precargados`);
}

// ── Curso visual (guía con capturas reales) ──────────────────────────────────
// A diferencia de seedAcademy(), este corre AUNQUE ya existan cursos: se guarda
// con su propia bandera en app_flags para que un solo despliegue lo agregue una
// vez. Las capturas viven en server/assets/academy (versionadas en el repo); al
// sembrar las copiamos al directorio de media de Academy con nombres estables y
// referenciamos su URL servida (/api/academy/media/<archivo>). El admin puede
// luego editarlo, reordenarlo o borrarlo como cualquier otro curso.

interface PasoImg { archivo: string; caption: string }
interface LecImg { titulo: string; contenido: string; duracion: string; imagenes: PasoImg[] }

const ASSETS_DIR = path.resolve(import.meta.dirname, '../assets/academy');

// Copia la captura al espacio de media de Academy (nombre estable, con prefijo
// para no chocar con archivos subidos a mano) y devuelve su URL servida.
function copiarCaptura(archivo: string): string {
  const destNombre = 'curso-visual-' + archivo;
  const dest = path.join(mediaDir('__academy__'), destNombre);
  const src = path.join(ASSETS_DIR, archivo);
  if (existsSync(src) && !existsSync(dest)) {
    try { copyFileSync(src, dest); } catch { /* si falla, la lección se ve sin esa imagen */ }
  }
  return '/api/academy/media/' + destNombre;
}

const CURSO_VISUAL: { titulo: string; descripcion: string; nivel: string; secciones: { titulo: string; lecciones: LecImg[] }[] } = {
  titulo: 'Primeros pasos: productos, variantes y despacho',
  descripcion: 'La guía visual para montar tu catálogo con tallas/colores y dejarlo listo para despachar por Dropi o Effi. Paso a paso, con capturas reales de DealFlow.',
  nivel: 'Básico',
  secciones: [
    {
      titulo: 'Productos y variantes',
      lecciones: [
        {
          titulo: 'Crea tu producto y arma sus tallas/colores',
          duracion: '4 min',
          contenido: 'Cada producto puede tener variantes (talla, color…). Sigue estos pasos: crea el producto, abre la pestaña Variantes, agrega tus grupos de Opciones y genera todas las combinaciones con un clic — así no se te olvida ninguna.',
          imagenes: [
            { archivo: 'dashboard.png', caption: 'Este es tu panel. Entra a "Productos" en el menú de la izquierda.' },
            { archivo: 'producto.png', caption: 'Abre un producto (o crea uno nuevo con "+ Nuevo producto"). Se despliega su ficha completa: nombre, precio, SKU y más abajo sus secciones.' },
            { archivo: 'variantes_vacio.png', caption: 'Entra a la sección "Variantes". Aquí creas los grupos de Opciones — por ejemplo "Talla" y "Color" — con los valores que maneje ese producto.' },
            { archivo: 'opciones.png', caption: 'Agrega cada grupo con su botón "+ Agregar grupo", y dentro de cada uno ve sumando sus valores (S, M, L… Negro, Verde…). Cuando termines, aparece el botón morado para generar las combinaciones.' },
            { archivo: 'generadas.png', caption: '¡Un clic y listo! Se crean automáticamente TODAS las combinaciones que falten (talla × color), sin duplicar las que ya tenías. El mensaje verde confirma cuántas se crearon.' },
          ],
        },
      ],
    },
    {
      titulo: 'Envíos y despacho',
      lecciones: [
        {
          titulo: 'Conecta Dropi o Effi para despachar solo',
          duracion: '3 min',
          contenido: 'En Integraciones eliges con cuál trabajas: Dropi por su API directa (cotiza transportadoras y trae la guía) o Effi por WooCommerce. Puedes tener las dos conectadas y elegir por producto o por pedido.',
          imagenes: [
            { archivo: 'integraciones.png', caption: 'Ve a "Integraciones" en el menú. En "Envíos" están Effi (WooCommerce) y Dropi; para Dropi lo recomendado es "Dropi (API directa)": pega el token que genera Dropi en "Mis Integraciones" y listo.' },
          ],
        },
        {
          titulo: 'Revisa y despacha tus pedidos',
          duracion: '3 min',
          contenido: 'Cada venta que cierra tu asistente llega aquí como un pedido nuevo. Ábrelo para ver los datos de envío, lo que pidió el cliente, y el bloque de Despacho para enviarlo por Dropi o Effi.',
          imagenes: [
            { archivo: 'pedidos.png', caption: 'En "Pedidos" ves todos los pedidos ordenados por fecha, con el cliente, la ciudad y qué compró. Desde aquí también cambias el estado o eliminas un pedido.' },
            { archivo: 'pedido_detalle.png', caption: 'Al abrir uno ves los datos de envío, los productos y, en "Despacho", el botón para enviarlo a Dropi o Effi (si aún no conectaste ninguno, te lo recuerda aquí mismo).' },
          ],
        },
      ],
    },
  ],
};

export function seedAcademyCursoVisual(): void {
  const flag = 'academy_curso_visual_v1';
  if (db.prepare('SELECT 1 FROM app_flags WHERE clave = ?').get(flag)) return;

  const insCurso = db.prepare("INSERT INTO academy_cursos (id, titulo, descripcion, nivel, orden, publicado) VALUES (?,?,?,?,?,1)");
  const insSec = db.prepare("INSERT INTO academy_secciones (id, curso_id, titulo, orden) VALUES (?,?,?,?)");
  const insLec = db.prepare("INSERT INTO academy_lecciones (id, curso_id, seccion_id, titulo, tipo, video_url, contenido, duracion, orden, publicado, imagenes) VALUES (?,?,?,?,?,?,?,?,?,1,?)");

  // Copiamos las capturas FUERA de la transacción de SQLite (es I/O de disco).
  const urls = new Map<string, string>();
  for (const sec of CURSO_VISUAL.secciones)
    for (const lec of sec.lecciones)
      for (const img of lec.imagenes)
        if (!urls.has(img.archivo)) urls.set(img.archivo, copiarCaptura(img.archivo));

  const tx = db.transaction(() => {
    const cid = uid();
    // orden 0 para que aparezca de primero (es la guía de arranque).
    insCurso.run(cid, CURSO_VISUAL.titulo, CURSO_VISUAL.descripcion, CURSO_VISUAL.nivel, 0);
    CURSO_VISUAL.secciones.forEach((sec, si) => {
      const sid = uid();
      insSec.run(sid, cid, sec.titulo, si);
      sec.lecciones.forEach((lec, li) => {
        const imagenes = lec.imagenes.map((img) => ({ url: urls.get(img.archivo) || '', caption: img.caption }));
        insLec.run(uid(), cid, sid, lec.titulo, 'articulo', '', lec.contenido, lec.duracion, li, JSON.stringify(imagenes));
      });
    });
    db.prepare('INSERT INTO app_flags (clave) VALUES (?)').run(flag);
  });
  tx();
  console.log('[seed] Curso visual de Academy precargado (guía con capturas)');
}
