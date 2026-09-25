import { db, uid } from './db.js';

/**
 * Precarga el set genérico de plantillas de mensajes de Meta (sin nombre de
 * tienda, solo variables {{n}}). Es idempotente: solo inserta las que falten
 * por nombre, así no duplica al reiniciar ni pisa lo que el superadmin edite.
 * El superadmin luego las revisa y les da "Publicar en todas".
 */

interface Boton { tipo: 'QUICK_REPLY' | 'URL'; texto: string; url?: string }
interface Semilla {
  nombre: string; categoria: 'UTILITY' | 'MARKETING'; idioma: string;
  encabezado?: string; cuerpo: string; pie?: string; botones?: Boton[]; ejemplos?: string[];
}

const PLANTILLAS: Semilla[] = [
  // ── Utilidad ──
  {
    nombre: 'confirmacion_pedido', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 ¡Gracias por tu compra! Tu pedido quedó confirmado:\n{{2}}\nTotal: {{3}}\nTe avisamos apenas salga para entrega. Cualquier duda, respóndenos por aquí.',
    ejemplos: ['Camila', '2 camisetas talla M', '$120.000'],
  },
  {
    nombre: 'pedido_en_camino', categoria: 'UTILITY', idioma: 'es',
    cuerpo: '¡Buenas noticias, {{1}}! 🚚 Tu pedido ya va en camino.\nTransportadora: {{2}}\nGuía de rastreo: {{3}}\nLlega en un estimado de {{4}}. ¡Gracias por confiar en nosotros!',
    ejemplos: ['Camila', 'Servientrega', '1234567890', '2 a 3 días hábiles'],
  },
  {
    nombre: 'recordatorio_abono', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}}, te recordamos que tu pedido {{2}} está apartado.\nPara despacharlo necesitamos confirmar el pago de {{3}}.\nCuando quieras, respóndenos por aquí y te ayudamos a completarlo. 🙌',
    ejemplos: ['Camila', '#1098', '$60.000'],
  },
  {
    nombre: 'pedido_incompleto', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 Notamos que dejaste tu pedido a medias.\nAún tenemos disponible: {{2}}\n¿Quieres que lo dejemos listo para envío? Respóndenos y lo terminamos en un minuto.',
    ejemplos: ['Camila', 'el vestido negro talla S'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Sí, quiero terminarlo' }, { tipo: 'QUICK_REPLY', texto: 'Ahora no' }],
  },
  // ── Marketing (requieren opt-in) ──
  {
    nombre: 'nueva_coleccion', categoria: 'MARKETING', idioma: 'es',
    cuerpo: '{{1}}, ya llegó lo nuevo 🔥\nEstrenamos {{2}} y sabemos que te va a encantar.\nMíralo antes de que se agote y aparta el tuyo respondiéndonos por aquí.',
    pie: 'Responde BAJA para no recibir más novedades.',
    ejemplos: ['Camila', 'la colección de verano'],
  },
  {
    nombre: 'te_extranamos', categoria: 'MARKETING', idioma: 'es',
    cuerpo: '¡Hola {{1}}! Hace rato no sabemos de ti y llegaron prendas nuevas 😍\nTenemos algo especial para ti: {{2}}.\nEscríbenos por aquí y te asesoramos con gusto.',
    pie: 'Responde BAJA para no recibir promociones.',
    ejemplos: ['Camila', '10% en tu próxima compra'],
  },
  {
    nombre: 'promo_tiempo_limitado', categoria: 'MARKETING', idioma: 'es',
    cuerpo: '{{1}}, solo por hoy: {{2}} 🛍️\nAprovecha antes de que termine {{3}}.\nResponde por aquí y te ayudamos a elegir tu talla y color.',
    pie: 'Responde BAJA para no recibir promociones.',
    ejemplos: ['Camila', '20% en toda la tienda', 'hoy a medianoche'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Quiero aprovechar' }, { tipo: 'QUICK_REPLY', texto: 'BAJA' }],
  },
  {
    nombre: 'carrito_abandonado', categoria: 'MARKETING', idioma: 'es',
    cuerpo: '{{1}}, ¿te quedaste pensando en {{2}}? 👀\nTodavía lo tenemos disponible para ti.\nRespóndenos y lo dejamos apartado hoy mismo.',
    pie: 'Responde BAJA para no recibir promociones.',
    ejemplos: ['Camila', 'el bolso café'],
  },
];

export function seedPlantillas(): void {
  const existe = db.prepare('SELECT 1 FROM meta_templates WHERE nombre = ?');
  const insert = db.prepare(
    `INSERT INTO meta_templates (id, nombre, categoria, idioma, encabezado, cuerpo, pie, botones, ejemplos)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  let nuevas = 0;
  for (const p of PLANTILLAS) {
    if (existe.get(p.nombre)) continue;
    insert.run(uid(), p.nombre, p.categoria, p.idioma, p.encabezado || '', p.cuerpo, p.pie || '',
      JSON.stringify(p.botones || []), JSON.stringify(p.ejemplos || []));
    nuevas++;
  }
  if (nuevas) console.log(`[seed] ${nuevas} plantilla(s) de Meta precargadas`);
}
