import { db } from './db.js';

/**
 * Auditoría anti-baneo de una tienda.
 *
 * Recorre TODOS los chats de la tienda (chat por chat, mensaje por mensaje) y
 * calcula las señales que Meta usa para desactivar números de WhatsApp Business.
 * No adivina: mide sobre el historial real guardado en DealFlow.
 *
 * Señales (las causas #1 de baneo según la política de WhatsApp Business):
 *  - Negocio escribe primero (sin que el cliente contacte) → falta de opt-in.
 *  - Mensajes fuera de la ventana de 24 h en texto libre (sin plantilla).
 *  - Ráfagas: varias piezas (fotos/videos) disparadas en pocos segundos.
 *  - Mismo texto reenviado a muchos chats distintos (patrón de difusión/spam).
 *  - Envíos fallidos (el número ya venía siendo frenado por Meta).
 */

const ms = (s: unknown): number => {
  const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z');
  return isNaN(t) ? 0 : t;
};
const OUT = new Set(['bot', 'vendedor']);

export interface Hallazgo {
  gravedad: 'alta' | 'media' | 'baja' | 'ok';
  titulo: string;
  detalle: string;
  dato?: string;
}

export interface ReporteBaneo {
  tienda: { id: string; nombre: string };
  rango: { desde: string; hasta: string; dias: number };
  totales: {
    chats: number; entrantes: number; salientes: number; mediaSalientes: number;
    fallidos: number;
  };
  senales: {
    iniciadosPorNegocio: number; ejemplosIniciados: string[];
    fueraDe24h: number;
    rafagas: number; rafagaMax: number; gapMinSaliente: number;
    picoPorMinuto: number;
    difusion: { texto: string; chats: number }[];
    respuestaPromSeg: number; respuestasInstantaneas: number;
  };
  volumenDiario: { dia: string; salientes: number }[];
  hallazgos: Hallazgo[];
  veredicto: string;
}

interface MsgRow { lead_id: string; de: string; tipo: string | null; texto: string | null; estado: string | null; created_at: string }

export function auditarBaneo(storeId: string, desde?: string, hasta?: string): ReporteBaneo | null {
  const tienda = db.prepare('SELECT id, nombre FROM stores WHERE id = ?').get(storeId) as { id: string; nombre: string } | undefined;
  if (!tienda) return null;

  // Rango opcional de fecha/hora (para ver qué pasó en un periodo concreto). Se
  // interpreta en hora local de Bogotá (UTC-5) que es como el dueño piensa la hora.
  const aMs = (s: string | undefined, finDelDia: boolean): number => {
    if (!s) return finDelDia ? Number.POSITIVE_INFINITY : 0;
    let t = String(s).trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += finDelDia ? 'T23:59:59' : 'T00:00:00';
    const ms = Date.parse(t + '-05:00'); // Bogotá
    return isNaN(ms) ? (finDelDia ? Number.POSITIVE_INFINITY : 0) : ms;
  };
  const desdeMs = aMs(desde, false);
  const hastaMs = aMs(hasta, true);
  const hayFiltro = desdeMs > 0 || hastaMs < Number.POSITIVE_INFINITY;
  const enRango = (ts: number) => ts >= desdeMs && ts <= hastaMs;

  // Solo chats que tocan WhatsApp (el chat web no influye en el baneo de Meta).
  const leads = db.prepare(
    "SELECT id, tel FROM leads WHERE store_id = ? AND COALESCE(canal,'') <> 'web' AND COALESCE(wa_id,'') NOT LIKE 'web:%'",
  ).all(storeId) as { id: string; tel: string }[];
  const telDe = new Map(leads.map((l) => [l.id, l.tel] as const));
  const ids = leads.map((l) => l.id);

  const totales = { chats: leads.length, entrantes: 0, salientes: 0, mediaSalientes: 0, fallidos: 0 };
  const senales = {
    iniciadosPorNegocio: 0, ejemplosIniciados: [] as string[],
    fueraDe24h: 0, rafagas: 0, rafagaMax: 0, gapMinSaliente: Number.POSITIVE_INFINITY,
    picoPorMinuto: 0, difusion: [] as { texto: string; chats: number }[],
    respuestaPromSeg: 0, respuestasInstantaneas: 0,
  };

  if (!ids.length) {
    return {
      tienda, rango: { desde: '', hasta: '', dias: 0 }, totales,
      senales: { ...senales, gapMinSaliente: 0 },
      volumenDiario: [], hallazgos: [{ gravedad: 'ok', titulo: 'Sin chats de WhatsApp', detalle: 'Esta tienda no tiene historial de chats de WhatsApp para auditar.' }],
      veredicto: 'Sin datos suficientes para auditar.',
    };
  }

  // Traemos los mensajes de esta tienda ordenados por chat y por tiempo.
  const ph = ids.map(() => '?').join(',');
  const msgs = db.prepare(
    `SELECT lead_id, de, tipo, texto, estado, created_at FROM messages WHERE lead_id IN (${ph}) ORDER BY lead_id, created_at`,
  ).all(...ids) as MsgRow[];

  // Acumuladores globales.
  let minFecha = Number.POSITIVE_INFINITY, maxFecha = 0;
  const salientesPorMinuto = new Map<number, number>(); // minuto (epoch/60000) -> conteo
  const salientesPorDia = new Map<string, number>();
  const textoAChats = new Map<string, Set<string>>(); // texto saliente -> chats distintos
  const chatsEnRango = new Set<string>();
  let sumaRespuesta = 0, nRespuesta = 0;

  // Recorremos por chat (los mensajes ya vienen agrupados por lead_id).
  let i = 0;
  while (i < msgs.length) {
    const lead = msgs[i].lead_id;
    const chat: MsgRow[] = [];
    while (i < msgs.length && msgs[i].lead_id === lead) { chat.push(msgs[i]); i++; }

    // ¿El primer mensaje del chat lo mandó el negocio? (escribir primero = sin opt-in)
    // Solo cuenta si ese primer mensaje cae en el rango analizado.
    const primero = chat[0];
    if (primero && OUT.has(primero.de) && enRango(ms(primero.created_at))) {
      senales.iniciadosPorNegocio++;
      if (senales.ejemplosIniciados.length < 12) senales.ejemplosIniciados.push(telDe.get(lead) || lead);
    }

    // La "ventana" queda abierta desde que el cliente escribe y NO se cierra
    // con cada saliente (varios mensajes del bot en una misma conversación
    // siguen dentro de la ventana). Solo un nuevo mensaje del cliente la reabre.
    // Nota: el ESTADO (ventana, racha) se actualiza SIEMPRE para no perder
    // precisión en el borde del rango; los CONTEOS solo suman si el mensaje
    // está dentro del rango de fecha/hora pedido.
    let ventanaHasta = 0;             // ts límite (último 'cliente' + 24 h); 0 = cerrada
    let esperandoRespuesta = false;   // para medir el tiempo de la 1.ª respuesta
    let respuestaDesde = 0;
    let rachaOut = 0; let prevOutTs = 0;

    const cerrarRacha = () => {
      if (rachaOut >= 3 && enRango(prevOutTs)) { senales.rafagas++; if (rachaOut > senales.rafagaMax) senales.rafagaMax = rachaOut; }
    };

    for (const m of chat) {
      const ts = ms(m.created_at);
      const dentro = enRango(ts);
      if (ts && dentro) { if (ts < minFecha) minFecha = ts; if (ts > maxFecha) maxFecha = ts; chatsEnRango.add(lead); }
      const dia = String(m.created_at).slice(0, 10);

      if (m.de === 'cliente') {
        if (dentro) totales.entrantes++;
        ventanaHasta = ts + 24 * 3600 * 1000;
        esperandoRespuesta = true; respuestaDesde = ts;
        rachaOut = 0; prevOutTs = 0; // se corta cualquier racha de salientes
      } else if (OUT.has(m.de)) {
        if (dentro) {
          totales.salientes++;
          if (m.tipo && m.tipo !== 'texto') totales.mediaSalientes++;
          if (String(m.estado || '') === 'fallido') totales.fallidos++;
          salientesPorDia.set(dia, (salientesPorDia.get(dia) || 0) + 1);
          salientesPorMinuto.set(Math.floor(ts / 60000), (salientesPorMinuto.get(Math.floor(ts / 60000)) || 0) + 1);
        }

        // Fuera de la ventana de 24 h (o sin que el cliente haya escrito nunca).
        const fuera = !ventanaHasta || ts > ventanaHasta;
        if (fuera && dentro) senales.fueraDe24h++;

        // Tiempo de la PRIMERA respuesta del negocio tras el mensaje del cliente.
        if (esperandoRespuesta && ts >= respuestaDesde) {
          const seg = (ts - respuestaDesde) / 1000;
          if (dentro && seg <= 3600) { sumaRespuesta += seg; nRespuesta++; if (seg < 2) senales.respuestasInstantaneas++; }
          esperandoRespuesta = false;
        }

        // Ráfagas: 3+ salientes casi instantáneos (menos de 3 s entre uno y otro).
        if (prevOutTs && ts - prevOutTs < 3000) {
          if (rachaOut === 0) rachaOut = 1;
          rachaOut++;
          const gap = ts - prevOutTs;
          if (dentro && gap < senales.gapMinSaliente) senales.gapMinSaliente = gap;
        } else {
          cerrarRacha();
          rachaOut = 0;
        }
        prevOutTs = ts;

        // Difusión sospechosa: MISMO texto a varios chats, fuera de la ventana.
        const txt = (m.texto || '').trim();
        if (fuera && dentro && txt.length >= 8) {
          const set = textoAChats.get(txt) || new Set<string>();
          set.add(lead); textoAChats.set(txt, set);
        }
      }
    }
    cerrarRacha();
  }

  // Pico de salientes en un minuto.
  for (const n of salientesPorMinuto.values()) if (n > senales.picoPorMinuto) senales.picoPorMinuto = n;
  // Difusión: textos enviados a 5+ chats distintos, top 8.
  senales.difusion = [...textoAChats.entries()]
    .map(([texto, set]) => ({ texto: texto.length > 80 ? texto.slice(0, 80) + '…' : texto, chats: set.size }))
    .filter((x) => x.chats >= 5)
    .sort((a, b) => b.chats - a.chats)
    .slice(0, 8);
  senales.respuestaPromSeg = nRespuesta ? Math.round(sumaRespuesta / nRespuesta) : 0;
  if (!isFinite(senales.gapMinSaliente)) senales.gapMinSaliente = 0;

  // Cuando hay filtro, "chats" = los que tuvieron actividad en el rango.
  if (hayFiltro) totales.chats = chatsEnRango.size;

  const volumenDiario = [...salientesPorDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, salientes]) => ({ dia, salientes }));
  const rangoDesde = minFecha === Number.POSITIVE_INFINITY ? '' : new Date(minFecha).toISOString().slice(0, 10);
  const rangoHasta = maxFecha ? new Date(maxFecha).toISOString().slice(0, 10) : '';
  const dias = minFecha === Number.POSITIVE_INFINITY ? 0 : Math.max(1, Math.round((maxFecha - minFecha) / 86400000) + 1);

  // ── Hallazgos (diagnóstico legible) ─────────────────────────────────
  const hallazgos: Hallazgo[] = [];
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  if (senales.iniciadosPorNegocio > 0) {
    const p = pct(senales.iniciadosPorNegocio, totales.chats);
    hallazgos.push({
      gravedad: p >= 10 ? 'alta' : 'media',
      titulo: 'Mensajes a clientes que no escribieron primero',
      detalle: `${senales.iniciadosPorNegocio} de ${totales.chats} chats (${p}%) los inició el negocio. Escribir sin que el cliente contacte primero es la causa #1 de baneo (falta de opt-in) y dispara reportes.`,
      dato: senales.ejemplosIniciados.slice(0, 6).join(', '),
    });
  }
  if (senales.fueraDe24h > 0) {
    const p = pct(senales.fueraDe24h, totales.salientes);
    hallazgos.push({
      gravedad: p >= 15 ? 'alta' : 'media',
      titulo: 'Mensajes fuera de la ventana de 24 h (texto libre)',
      detalle: `${senales.fueraDe24h} mensajes salientes (${p}% del total) se enviaron sin que el cliente hubiera escrito en las últimas 24 h. Fuera de esa ventana Meta exige plantilla aprobada; el texto libre es infracción.`,
    });
  }
  if (senales.rafagas > 0) {
    hallazgos.push({
      gravedad: senales.rafagaMax >= 5 ? 'alta' : 'media',
      titulo: 'Ráfagas de mensajes (varias piezas en segundos)',
      detalle: `${senales.rafagas} ráfagas detectadas (la mayor, ${senales.rafagaMax} mensajes seguidos; el envío más rápido, ${(senales.gapMinSaliente / 1000).toFixed(1)} s entre uno y otro). Enviar fotos/videos en ráfaga molesta y genera bloqueos.`,
    });
  }
  if (senales.picoPorMinuto >= 10) {
    hallazgos.push({
      gravedad: senales.picoPorMinuto >= 20 ? 'alta' : 'media',
      titulo: 'Picos de volumen por minuto',
      detalle: `Hubo hasta ${senales.picoPorMinuto} mensajes salientes en un mismo minuto. Los picos súbitos de volumen son señal de spam para Meta.`,
    });
  }
  if (senales.difusion.length) {
    const top = senales.difusion[0];
    hallazgos.push({
      gravedad: top.chats >= 20 ? 'alta' : 'media',
      titulo: 'Mismo mensaje enviado a muchos chats (difusión)',
      detalle: `Se detectó texto idéntico reenviado a varios chats (el más repetido, a ${top.chats} chats distintos). La difusión masiva del mismo mensaje es patrón típico de spam.`,
      dato: `"${top.texto}"`,
    });
  }
  if (totales.fallidos > 0) {
    const p = pct(totales.fallidos, totales.salientes);
    hallazgos.push({
      gravedad: p >= 10 ? 'alta' : 'baja',
      titulo: 'Envíos fallidos',
      detalle: `${totales.fallidos} envíos fallaron (${p}%). Una tasa alta suele indicar que Meta ya venía frenando el número por calidad antes del baneo.`,
    });
  }
  if (!hallazgos.length) {
    hallazgos.push({ gravedad: 'ok', titulo: 'Sin infracciones evidentes en el historial', detalle: 'No se detectaron patrones claros de infracción en los chats guardados. El baneo pudo venir por reportes/bloqueos de usuarios (que Meta no expone) o por contenido puntual.' });
  }

  const altas = hallazgos.filter((h) => h.gravedad === 'alta');
  const veredicto = altas.length
    ? `Causa más probable del baneo: ${altas[0].titulo.toLowerCase()}. Se hallaron ${altas.length} señal(es) de gravedad alta.`
    : hallazgos.some((h) => h.gravedad === 'media')
      ? 'No hay una causa única contundente, pero sí varias señales medias que sumadas bajan la calidad y pueden desencadenar el baneo.'
      : 'El historial no muestra infracciones claras; probablemente fueron reportes/bloqueos de usuarios, que Meta no revela.';

  return { tienda, rango: { desde: rangoDesde, hasta: rangoHasta, dias }, totales, senales, volumenDiario, hallazgos, veredicto };
}
