import { db, uid } from './db.js';

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
