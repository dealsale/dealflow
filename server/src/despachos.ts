import { db } from './db.js';

/**
 * Sincronización automática de despachos (sin botón), en segundo plano:
 *  - Dropi por API oficial: lee estado, guía y PDF de las órdenes creadas.
 *  - Effi por API: los webhooks traen los cambios al instante; como respaldo
 *    consultamos los pedidos que siguen en camino.
 * El estado del pedido sigue al de la guía y avisa la guía al
 * cliente por WhatsApp la primera vez que aparece.
 */

// Con guía, el estado del pedido sigue al de la transportadora (ver estadosPedido.ts).
import { estadoLogistico, siguienteEstado } from './estadosPedido.js';

interface OrdenSync {
  id: string; store_id: string; numero: number; tel: string; guia: string | null;
  estado: string; dropi_order_id: string; guia_url: string | null; guia_avisada: number;
}
const COLS = 'id, store_id, numero, tel, guia, estado, dropi_order_id, guia_url, guia_avisada';

let corriendo = false;
const avisado = new Map<string, string>(); // orderId → último motivo registrado (no repetir)
const intentoAviso = new Map<string, number>(); // orderId → último intento de avisar la guía
// Dropi da el número de guía antes que el PDF: se espera el PDF hasta 90 min para mandar la FOTO de la guía.
const guiaVista = new Map<string, number>(); // orderId → cuándo apareció el número de guía (Dropi)
const ESPERA_PDF = 90 * 60_000;
const intentoImagen = new Map<string, number>(); // orderId → último intento de mandar la imagen que llegó después

/** Un ciclo de sincronización de despachos para TODAS las tiendas. */
export async function sincronizarDespachos(): Promise<void> {
  if (corriendo) return; // evita solapamiento si un ciclo tarda
  corriendo = true;
  try {
    const dropi = db.prepare(
      `SELECT ${COLS} FROM orders
        WHERE COALESCE(dropi_order_id,'') != '' AND estado NOT IN ('Entregado','Devuelto','Cancelado')
        ORDER BY created_at DESC LIMIT 150`,
    ).all() as OrdenSync[];
    for (const o of dropi) { try { await sincronizarDropi(o); } catch { /* sigue con el próximo */ } }

    const effiPend = db.prepare(
      `SELECT id, store_id FROM orders
        WHERE COALESCE(effi_doc,'') != '' AND estado NOT IN ('Entregado','Devuelto','Cancelado')
          AND created_at > datetime('now','-20 days')
        ORDER BY created_at DESC LIMIT 120`,
    ).all() as { id: string; store_id: string }[];
    if (effiPend.length) {
      const { consultarEstadoEffi } = await import('./effiApi.js');
      for (const o of effiPend) { try { await consultarEstadoEffi(o.store_id, o.id); } catch { /* sigue con el próximo */ } }
    }
    // Guías hechas a mano en Effi y unidas a pedidos viejos: su estado por número de guía.
    try { const { consultarGuiasSueltas } = await import('./effiExtras.js'); await consultarGuiasSueltas(); } catch (e) { console.warn('[despachos] guías sueltas', e); }
    // Novedades de entrega que reporta la transportadora (Effi).
    try { const { sincronizarNovedadesTodas } = await import('./novedades.js'); await sincronizarNovedadesTodas(); } catch (e) { console.warn('[despachos] novedades', e); }
    // Dropi: órdenes creadas directo en Dropi (no desde DealFlow) → se unen a su pedido por el celular.
    try { const { unirOrdenesDropiTodas } = await import('./dropiApi.js'); await unirOrdenesDropiTodas(); } catch (e) { console.warn('[despachos] unir Dropi', e); }
    // Red de seguridad: toda guía reciente que todavía no le llegó al cliente se le envía
    // (Effi de cualquier transportadora, Dropi, guía puesta a mano…). Un intento cada 2 h por pedido.
    await avisarGuiasPendientes();
  } finally {
    corriendo = false;
  }
}

/** Lee una orden de Dropi (API oficial): guía, PDF y estado; avisa la guía si es nueva. */
async function sincronizarDropi(o: OrdenSync): Promise<{ estado: string; guia: string } | { error: string }> {
  let r: { estado: string; guia: string; guiaUrl?: string; transportadora?: string } | { error: string };
  try {
    const { credDropi, estadoOrden } = await import('./dropiApi.js');
    const c = credDropi(o.store_id);
    if (!c) return { error: 'Dropi API sin conectar.' };
    const rr = await estadoOrden(c, o.dropi_order_id);
    r = 'error' in rr ? rr : { estado: rr.estado, guia: rr.guia, guiaUrl: rr.guiaUrl, transportadora: rr.transportadora };
    // Rastro para el dueño (una vez por motivo): por qué no avanza este pedido.
    const motivo = 'error' in rr ? `error:${rr.error}` : (!rr.guia ? `sin-guia:${rr.estado}` : '');
    if (motivo && avisado.get(o.id) !== motivo) {
      avisado.set(o.id, motivo);
      const { trazar } = await import('./trazabilidad.js');
      if ('error' in rr) trazar(o.store_id, o.id, { etapa: 'despacho', nivel: 'warn', titulo: 'No se pudo leer el pedido en Dropi', detalle: rr.error });
      else trazar(o.store_id, o.id, { etapa: 'despacho', nivel: /guia|generad/i.test(rr.estado) ? 'warn' : 'info', titulo: `Dropi: ${rr.estado || 'sin estado'} · todavía sin guía`, detalle: /guia|generad/i.test(rr.estado) ? 'Dropi dice que la guía ya está generada, pero no encontramos el número en su respuesta. Abajo va la respuesta completa de Dropi para ubicarlo.' : rr.estado ? 'La guía aparece cuando Dropi (o el proveedor) procesa la orden. Si sigue así, revisa la orden en Dropi: puede estar pendiente de confirmar, sin saldo o sin stock.' : 'Dropi respondió sin estado.', datos: { orden: o.dropi_order_id, llavesRespuesta: rr.llaves, ...(/guia|generad/i.test(rr.estado) ? { respuestaDropi: rr.cruda } : {}) } });
    }
  } catch { return { error: 'No pudimos consultar el pedido en Dropi.' }; }
  if ('error' in r) return { error: r.error };

  const guiaNueva = (r.guia || '').trim();
  const cambios: string[] = [];
  const params: unknown[] = [];
  if (guiaNueva && guiaNueva !== (o.guia || '')) { cambios.push('guia = ?'); params.push(guiaNueva); }
  if (r.guiaUrl && r.guiaUrl !== (o.guia_url || '')) { cambios.push('guia_url = ?'); params.push(r.guiaUrl); }
  if (r.estado) { cambios.push('estado_woo = ?'); params.push(r.estado); }
  // La transportadora real (Interrapidísimo, Envía…) para el mensaje al cliente.
  if (r.transportadora && r.transportadora.trim()) { cambios.push('transportadora = ?'); params.push(r.transportadora.trim().slice(0, 60)); }
  const destino = siguienteEstado(o.estado, estadoLogistico(r.estado, !!(guiaNueva || o.guia)));
  if (destino) { cambios.push('estado = ?'); params.push(destino); }
  if (destino === 'Devuelto') void import('./effiExtras.js').then((m) => m.alQuedarDevuelto(o.store_id, o.id)).catch(() => {});
  if (cambios.length) {
    params.push(o.id);
    db.prepare(`UPDATE orders SET ${cambios.join(', ')} WHERE id = ?`).run(...params);
  }
  // Aviso de la guía: si falla (p. ej. plantilla sin aprobar), se reintenta cada hora, no cada 4 min.
  // Sin PDF todavía: se espera un rato para mandarla con la foto (no solo el número en texto).
  if (guiaNueva && !guiaVista.has(o.id)) guiaVista.set(o.id, Date.now());
  const conPdf = !!(r.guiaUrl || o.guia_url);
  const esperandoPdf = !conPdf && Date.now() - (guiaVista.get(o.id) || 0) < ESPERA_PDF;
  if (guiaNueva && !o.guia_avisada && o.tel && !esperandoPdf && Date.now() - (intentoAviso.get(o.id) || 0) > 3600_000) {
    intentoAviso.set(o.id, Date.now());
    await avisarGuiaAlCliente(o.store_id, o.id);
  }
  return { estado: r.estado, guia: guiaNueva };
}

/** Guías de los últimos días que aún no se le han avisado al cliente (o cuyo aviso falló). */
async function avisarGuiasPendientes(): Promise<void> {
  // Guías avisadas en texto cuyo PDF llegó después: se manda la imagen al chat.
  const conImagenPendiente = db.prepare(`SELECT id, store_id FROM orders WHERE guia_avisada = 1 AND (COALESCE(guia_url,'') != '' OR COALESCE(guia_img,'') != '')
      AND guia_aviso LIKE '%"con":"texto"%' AND guia_aviso NOT LIKE '%"imagenLuego":true%' AND created_at > datetime('now','-5 days') LIMIT 40`).all() as { id: string; store_id: string }[];
  if (conImagenPendiente.length) {
    const { enviarImagenGuiaLuego } = await import('./avisoGuia.js');
    for (const o of conImagenPendiente) {
      if (Date.now() - (intentoImagen.get(o.id) || 0) < 30 * 60_000) continue;
      intentoImagen.set(o.id, Date.now());
      try { await enviarImagenGuiaLuego(o.store_id, o.id); } catch { /* el próximo ciclo */ }
    }
  }
  const filas = db.prepare(`SELECT id, store_id FROM orders WHERE COALESCE(guia,'') != '' AND guia_avisada = 0 AND COALESCE(tel,'') != ''
      AND estado NOT IN ('Entregado','Devuelto','Cancelado') AND created_at > datetime('now','-6 days')
    ORDER BY created_at DESC LIMIT 60`).all() as { id: string; store_id: string }[];
  for (const o of filas) {
    if (Date.now() - (intentoAviso.get(o.id) || 0) < 2 * 3600_000) continue;
    if (guiaVista.has(o.id) && Date.now() - guiaVista.get(o.id)! < ESPERA_PDF && !(db.prepare('SELECT guia_url FROM orders WHERE id = ?').get(o.id) as { guia_url: string } | undefined)?.guia_url) continue;
    intentoAviso.set(o.id, Date.now());
    try { await avisarGuiaAlCliente(o.store_id, o.id); } catch { /* el próximo ciclo */ }
  }
}

/** Sincroniza un pedido de Dropi puntual (botón "Actualizar" del detalle). */
export async function sincronizarPedidoDropi(storeId: string, rowId: string): Promise<{ estado: string; guia: string } | { error: string }> {
  const o = db.prepare(`SELECT ${COLS} FROM orders WHERE id = ? AND store_id = ?`).get(rowId, storeId) as OrdenSync | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  if (!o.dropi_order_id) return { error: 'Este pedido aún no se ha despachado.' };
  // Desde el botón "Actualizar": la consulta a Dropi (con su respuesta) queda en el registro del pedido.
  avisado.delete(o.id);
  const { conPedido } = await import('./trazabilidad.js');
  return conPedido(storeId, o.id, () => sincronizarDropi(o));
}

/** Aviso de la guía al chat del pedido y, si el cliente dejó otro celular, plantilla a ese número. */
export async function avisarGuiaAlCliente(storeId: string, orderId: string): Promise<void> {
  const { avisarGuia } = await import('./avisoGuia.js');
  await avisarGuia(storeId, orderId);
}

/** Arranca el ciclo en segundo plano (intervalo configurable por env). */
export function iniciarSincronizacionDespachos(): void {
  const min = Number(process.env.SYNC_DESPACHO_MIN || process.env.WOO_SYNC_DESPACHO_MIN || 4);
  setTimeout(() => { void sincronizarDespachos(); }, 20_000);
  setInterval(() => { void sincronizarDespachos(); }, Math.max(1, min) * 60_000);
  console.log(`[despachos] sincronización cada ${min}min (Dropi API + Effi API)`);
}
