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
  } finally {
    corriendo = false;
  }
}

/** Lee una orden de Dropi (API oficial): guía, PDF y estado; avisa la guía si es nueva. */
async function sincronizarDropi(o: OrdenSync): Promise<{ estado: string; guia: string } | { error: string }> {
  let r: { estado: string; guia: string; guiaUrl?: string } | { error: string };
  try {
    const { credDropi, estadoOrden } = await import('./dropiApi.js');
    const c = credDropi(o.store_id);
    if (!c) return { error: 'Dropi API sin conectar.' };
    const rr = await estadoOrden(c, o.dropi_order_id);
    r = 'error' in rr ? rr : { estado: rr.estado, guia: rr.guia, guiaUrl: rr.guiaUrl };
  } catch { return { error: 'No pudimos consultar el pedido en Dropi.' }; }
  if ('error' in r) return { error: r.error };

  const guiaNueva = (r.guia || '').trim();
  const cambios: string[] = [];
  const params: unknown[] = [];
  if (guiaNueva && guiaNueva !== (o.guia || '')) { cambios.push('guia = ?'); params.push(guiaNueva); }
  if (r.guiaUrl && r.guiaUrl !== (o.guia_url || '')) { cambios.push('guia_url = ?'); params.push(r.guiaUrl); }
  if (r.estado) { cambios.push('estado_woo = ?'); params.push(r.estado); }
  const destino = siguienteEstado(o.estado, estadoLogistico(r.estado, !!(guiaNueva || o.guia)));
  if (destino) { cambios.push('estado = ?'); params.push(destino); }
  if (destino === 'Devuelto') void import('./effiExtras.js').then((m) => m.alQuedarDevuelto(o.store_id, o.id)).catch(() => {});
  if (cambios.length) {
    params.push(o.id);
    db.prepare(`UPDATE orders SET ${cambios.join(', ')} WHERE id = ?`).run(...params);
  }
  if (guiaNueva && !o.guia_avisada && o.tel) await avisarGuiaAlCliente(o.store_id, o.id);
  return { estado: r.estado, guia: guiaNueva };
}

/** Sincroniza un pedido de Dropi puntual (botón "Actualizar" del detalle). */
export async function sincronizarPedidoDropi(storeId: string, rowId: string): Promise<{ estado: string; guia: string } | { error: string }> {
  const o = db.prepare(`SELECT ${COLS} FROM orders WHERE id = ? AND store_id = ?`).get(rowId, storeId) as OrdenSync | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  if (!o.dropi_order_id) return { error: 'Este pedido aún no se ha despachado.' };
  return sincronizarDropi(o);
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
