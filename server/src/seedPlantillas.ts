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
    // Guía del pedido. Se usa sola cuando: (a) el cliente dejó un celular de
    // contacto distinto al del chat (ese número nunca nos escribió), o (b) la
    // ventana de 24 h del chat está cerrada. Variables: nombre, tienda, pedido,
    // transportadora y número de guía.
    nombre: 'guia_envio_pedido', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 Te escribimos de {{2}}.\nTu pedido {{3}} ya fue despachado 📦\n\n🚚 Transportadora: {{4}}\n🧾 Número de guía: {{5}}\n\nCon este número puedes hacerle seguimiento a tu envío. Si el pago es contra entrega, ten el valor listo al recibirlo. ¿Alguna duda? Responde este mensaje y te ayudamos.',
    pie: 'Mensaje sobre tu compra',
    ejemplos: ['Camila', 'Luna Accesorios', 'DF-1049', 'Interrapidísimo', '240012345678'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Recibido, gracias' }, { tipo: 'QUICK_REPLY', texto: 'Tengo una duda' }],
  },
  {
    // Confirma el pedido en el celular de contacto cuando es distinto al del chat
    // (la transportadora llamará a ese número).
    nombre: 'confirmar_contacto_pedido', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 Recibimos tu pedido {{2}} en {{3}}:\n{{4}}\n\nDejaste este número como contacto para la entrega. ¿Nos confirmas que es correcto? La transportadora te llamará aquí para coordinar.',
    pie: 'Mensaje sobre tu compra',
    ejemplos: ['Camila', 'DF-1049', 'Luna Accesorios', '2 camisetas talla M · Total $120.000'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Sí, es correcto' }, { tipo: 'QUICK_REPLY', texto: 'No, es otro número' }],
  },
  {
    // Novedad de envío reportada por la transportadora, cuando la ventana de 24 h
    // está cerrada. Variables: nombre, tienda, pedido, transportadora y motivo.
    nombre: 'novedad_envio_pedido', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 Te escribimos de {{2}}.\nLa transportadora {{4}} reportó una novedad con tu pedido {{3}}: {{5}}.\n\nPara que lo recibas sin problema, respóndenos por aquí y dinos si te lo vuelven a llevar a la misma dirección (y qué día te queda bien) o a otra dirección en tu ciudad.',
    pie: 'Mensaje sobre tu compra',
    ejemplos: ['Camila', 'Luna Accesorios', 'DF-1049', 'Interrapidísimo', 'cliente ausente'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Misma dirección' }, { tipo: 'QUICK_REPLY', texto: 'Otra dirección' }],
  },
  {
    // Cambio de estado del envío (en camino, en reparto, novedad, entregado) cuando el
    // cliente no escribe hace más de 24 h. Variables: nombre, tienda, pedido, frase del
    // estado (una línea) y número de guía.
    nombre: 'estado_envio_pedido', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 Te escribimos de {{2}}.\nTu pedido {{3}} {{4}}.\n\n🧾 Guía: {{5}}\n\n¿Alguna duda? Responde este mensaje y te ayudamos.',
    pie: 'Mensaje sobre tu compra',
    ejemplos: ['Camila', 'Luna Accesorios', 'DF-1049', 'salió a reparto 🛵: hoy te lo entregan, ten el celular a mano', '240012345678'],
  },
  {
    // Pedido que entró por la tienda online (Shopify): el comprador confirma con un
    // botón y, si dice que sí, se despacha solo. Variables: nombre, tienda, productos, total.
    nombre: 'confirmacion_pedido_tienda', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 Recibimos tu pedido en {{2}}:\n{{3}}\nTotal: {{4}}\n\n¿Confirmas que te lo enviemos?',
    pie: 'Responde con uno de los botones',
    ejemplos: ['Camila', 'Luna Accesorios', '1× Jean mom fit (Talla 8 · Azul)', '$129.900 · pago contra entrega'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Sí, confirmo' }, { tipo: 'QUICK_REPLY', texto: 'No' }],
  },
  {
    // Igual que la anterior, pero con TODOS los datos del pedido, como el resumen que muestra el
    // bot (Shopify, extensión de Chrome y Tienda en línea). Variables: nombre, tienda, número de
    // pedido, productos, total, nombre completo, celular, dirección, ciudad y departamento.
    // Mientras Meta no la apruebe, se sigue usando "confirmacion_pedido_tienda".
    nombre: 'confirmacion_pedido_completa', categoria: 'UTILITY', idioma: 'es',
    cuerpo: 'Hola {{1}} 👋 Recibimos tu pedido {{3}} en {{2}}.\n\n🛍️ Pediste: {{4}}\n💰 Total: {{5}}\n\n📦 Datos de envío\n👤 Nombre: {{6}}\n📞 Celular: {{7}}\n🏠 Dirección: {{8}}\n🏙️ Ciudad: {{9}}\n📍 Departamento: {{10}}\n\nRevisa con cuidado que todos los datos estén bien, así la transportadora te lo entrega sin problema. ¿Confirmas que los datos están correctos y que te lo enviemos?',
    pie: 'Responde con uno de los botones',
    ejemplos: ['Camila', 'Luna Accesorios', 'DF-1049', '2× Jean mom fit (Talla 8 · Azul)', '$129.900 · pago contra entrega', 'Camila Torres', '3001234567', 'CRA 7 # 45 - 20 APTO 301', 'Medellín', 'Antioquia'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Sí, confirmo' }, { tipo: 'QUICK_REPLY', texto: 'No' }],
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
    cuerpo: 'Hola {{1}}, ya llegó lo nuevo 🔥\nEstrenamos {{2}} y sabemos que te va a encantar.\nMíralo antes de que se agote y aparta el tuyo respondiéndonos por aquí.',
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
    cuerpo: '¡Hola {{1}}! Solo por hoy: {{2}} 🛍️\nAprovecha antes de que termine {{3}}.\nResponde por aquí y te ayudamos a elegir tu talla y color.',
    pie: 'Responde BAJA para no recibir promociones.',
    ejemplos: ['Camila', '20% en toda la tienda', 'hoy a medianoche'],
    botones: [{ tipo: 'QUICK_REPLY', texto: 'Quiero aprovechar' }, { tipo: 'QUICK_REPLY', texto: 'BAJA' }],
  },
  {
    nombre: 'carrito_abandonado', categoria: 'MARKETING', idioma: 'es',
    cuerpo: 'Hola {{1}}, ¿te quedaste pensando en {{2}}? 👀\nTodavía lo tenemos disponible para ti.\nRespóndenos y lo dejamos apartado hoy mismo.',
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
  // Meta rechaza el cuerpo que empieza o termina con una variable: las precargadas que
  // quedaron así se corrigen con el texto nuevo (las que el equipo cambió no se tocan).
  const mala = db.prepare('SELECT id, cuerpo FROM meta_templates WHERE nombre = ?');
  const arreglar = db.prepare('UPDATE meta_templates SET cuerpo = ? WHERE id = ?');
  for (const p of PLANTILLAS) {
    const r = mala.get(p.nombre) as { id: string; cuerpo: string } | undefined;
    if (r && r.cuerpo !== p.cuerpo && problemaVariables(r.cuerpo) && !problemaVariables(p.cuerpo)) {
      arreglar.run(p.cuerpo, r.id);
      console.log(`[seed] plantilla ${p.nombre}: se quitó la variable del inicio/final`);
    }
  }
}

/** Meta no acepta un cuerpo que empiece o termine con una variable ({{1}}…). */
export function problemaVariables(cuerpo: string): string {
  const t = String(cuerpo || '').trim();
  if (/^\{\{\s*\d+\s*\}\}/.test(t)) return 'Meta no acepta plantillas que empiecen con una variable. Pon texto antes, por ejemplo: "Hola {{1}}, …".';
  if (/\{\{\s*\d+\s*\}\}[\s.!?¡¿,;:)]*$/.test(t)) return 'Meta no acepta plantillas que terminen con una variable. Agrega una frase después, por ejemplo: "… {{3}}. ¡Gracias!".';
  return '';
}
