import { db, uid } from './db.js';
import { sendWhatsappText, marcarEnviado } from './wa.js';

/**
 * Seguimiento automático ("¿sigues ahí?"): si el cliente no responde, el bot le
 * vuelve a escribir para reactivar la conversación y aprovechar la ventana de
 * 24 h de Meta. Es comportamiento propio del asistente (un buen agente de ventas
 * siempre hace seguimiento): NO hay que activarlo, corre solo. Tres recordatorios
 * escalonados: 5 minutos, 30 minutos y 1 hora sin respuesta.
 *
 * Reglas de seguridad:
 *  - Solo chats que atiende el asistente (no pisa a un agente humano).
 *  - Solo si el ÚLTIMO mensaje es nuestro (esperamos al cliente) y el cliente
 *    escribió hace menos de 24 h (fuera de esa ventana Meta no deja texto libre).
 *  - En WhatsApp, esa ventana de 24 h aplica; en el chat WEB no hay tal límite.
 */

// Umbrales de cada recordatorio (en minutos) y el nivel que representan.
const TIERS: { nivel: number; min: number }[] = [
  { nivel: 1, min: 5 },
  { nivel: 2, min: 30 },
  { nivel: 3, min: 60 },
];

function mensajeSeguimiento(nivel: number, nombre: string): string {
  const n = nombre ? ' ' + String(nombre).split(' ')[0] : '';
  if (nivel === 1) return `¡Hola${n}! 👋 ¿Sigues por ahí? Cualquier duda con gusto te ayudo. 😊`;
  if (nivel === 2) return `Sigo por aquí para ayudarte cuando quieras${n}. ¿Te quedó alguna duda o te ayudo a completar tu pedido? 🛍️`;
  return `Cuando gustes retomamos${n}, seguimos justo donde lo dejamos. Escríbeme y con gusto te ayudo. 🙌`;
}

interface LeadSeg {
  id: string; store_id: string; nombre: string; wa_id: string | null; tel: string; canal: string;
  asignado: string; etiqueta: string; seguimiento_nivel: number; ultimo_de: string | null;
  idle_min: number | null; ventana_min: number | null;
}

let corriendo = false;

/** Un ciclo de seguimiento para todas las tiendas con la función encendida. */
export async function correrSeguimiento(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    // Corre para TODAS las tiendas (es comportamiento propio del asistente, no una
    // opción). El filtro real es por chat: que lo atienda el asistente, etc.
    const leads = db.prepare(
      `SELECT l.id, l.store_id, l.nombre, l.wa_id, l.tel, l.canal, l.asignado, l.etiqueta, l.seguimiento_nivel,
              (SELECT de FROM messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS ultimo_de,
              (julianday('now') - julianday((SELECT created_at FROM messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1))) * 1440 AS idle_min,
              (julianday('now') - julianday((SELECT created_at FROM messages WHERE lead_id = l.id AND de = 'cliente' ORDER BY created_at DESC LIMIT 1))) * 1440 AS ventana_min
         FROM leads l
        WHERE COALESCE(l.seguimiento_nivel,0) < 3
          -- La tienda puede apagar el seguimiento automático (viene encendido por defecto).
          AND NOT EXISTS (SELECT 1 FROM assistants a WHERE a.store_id = l.store_id AND a.seguimiento_off = 1)
          -- La venta ya cerrada NO se persigue (el bot marca 'Venta' y crea el pedido al cerrar).
          AND COALESCE(l.etiqueta,'') != 'Venta'
          AND NOT EXISTS (
            SELECT 1 FROM orders o WHERE o.store_id = l.store_id AND COALESCE(o.tel,'') != ''
              AND replace(replace(replace(o.tel,' ',''),'+',''),'-','') LIKE '%' || substr(replace(replace(replace(l.tel,' ',''),'+',''),'-',''), -10))
          AND EXISTS (SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.created_at > datetime('now','-1 day'))`,
    ).all() as LeadSeg[];

    for (const l of leads) {
      // El chat lo debe atender el asistente (no un humano).
      if (l.asignado && !/asistente|bot/i.test(l.asignado)) continue;
      // El último mensaje debe ser nuestro (esperamos respuesta del cliente).
      if (l.ultimo_de !== 'bot' && l.ultimo_de !== 'vendedor') continue;
      if (l.ventana_min == null) continue; // el cliente nunca escribió
      // Ventana de 24 h de Meta (no aplica al chat web).
      if (l.canal !== 'web' && l.ventana_min >= 24 * 60) continue;

      // El silencio se mide desde el ÚLTIMO mensaje del cliente (los recordatorios
      // que enviamos, al ser mensajes del bot, no reinician ese reloj). Así 5/30/60
      // cuentan desde que el cliente dejó de responder. Enviamos solo el recordatorio
      // más avanzado que corresponda (si el proceso estuvo caído, no van los tres seguidos).
      let objetivo = 0;
      for (const tier of TIERS) if (l.ventana_min >= tier.min) objetivo = tier.nivel;
      if (objetivo <= (l.seguimiento_nivel || 0)) continue;

      // La IA redacta el recordatorio con el contexto del chat (retoma lo último
      // que hablaron) y decide si vale la pena escribir. Si no hay IA o falla,
      // usamos un texto de respaldo.
      let generado = '';
      try {
        const { generarSeguimientoIA } = await import('./ai.js');
        generado = await generarSeguimientoIA(l.store_id, l.id, objetivo);
      } catch { /* usamos el respaldo */ }
      // 'NADA' = la IA considera que la conversación ya está cerrada (venta hecha,
      // el cliente se despidió, etc.): no molestamos más y detenemos el seguimiento.
      if (generado === 'NADA') { db.prepare('UPDATE leads SET seguimiento_nivel = 3 WHERE id = ?').run(l.id); continue; }
      const texto = generado || mensajeSeguimiento(objetivo, l.nombre);
      const destino = l.wa_id || l.tel;
      const pn = l.tel;
      try {
        const mid = uid();
        db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'bot', ?)").run(mid, l.id, texto);
        marcarEnviado(mid, await sendWhatsappText(l.store_id, destino, texto, pn));
      } catch { /* si falla el envío, igual marcamos el nivel para no reintentar en bucle */ }
      db.prepare('UPDATE leads SET seguimiento_nivel = ? WHERE id = ?').run(objetivo, l.id);
    }
  } finally {
    corriendo = false;
  }
}

/** Reinicia el contador de recordatorios de un lead (cuando el cliente vuelve a escribir). */
export function reiniciarSeguimiento(leadId: string): void {
  try { db.prepare('UPDATE leads SET seguimiento_nivel = 0 WHERE id = ?').run(leadId); } catch { /* noop */ }
}

/** Arranca el ciclo en segundo plano (cada minuto). */
export function iniciarSeguimiento(): void {
  setInterval(() => { void correrSeguimiento(); }, 60_000);
  console.log('[seguimiento] recordatorios automáticos activos (5 min / 30 min / 1 h) en todos los chats del asistente');
}
