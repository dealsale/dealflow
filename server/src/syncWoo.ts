import { db, uid, registrarLog } from './db.js';
import { estadoPedido, sincronizarInventario, proveedoresConectados, type WooProv } from './woocommerce.js';
import { sendWhatsappText } from './wa.js';

/**
 * Sincronización automática con el WooCommerce de Effi/Dropi (sin botón):
 *  - lee estado y número de guía de los pedidos ya despachados,
 *  - auto-avanza el estado del pedido (Despachado / Entregado / Cancelado),
 *  - le avisa al cliente por WhatsApp EN CUANTO aparece la guía (una sola vez),
 *  - y mantiene el inventario al día.
 * Todo corre en segundo plano (ver index.ts).
 */

const wooProv = (v: unknown): WooProv | undefined => (v === 'dropi' ? 'dropi' : v === 'effi' ? 'effi' : undefined);
const nombreProv = (p?: string) => (p === 'dropi' ? 'Dropi' : p === 'effi' ? 'Effi' : 'la transportadora');

// Orden del pipeline: solo avanzamos hacia adelante, nunca retrocedemos el estado
// que el dueño haya puesto a mano.
const ORDEN_ESTADO = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado', 'Cancelado'];
const rank = (e: string) => { const i = ORDEN_ESTADO.indexOf(e); return i < 0 ? 0 : i; };

/** Mapea el estado (texto en español de Woo o Dropi) al del pipeline de DealFlow. */
function estadoDePipeline(estadoWoo: string, hayGuia: boolean): string | null {
  const e = (estadoWoo || '').toLowerCase();
  if (/entregado/.test(e)) return 'Entregado';
  if (/cancelad|devuelt|devoluc|rechaz|fallid/.test(e)) return 'Cancelado';
  if (/enviado|despach|guia|gu[ií]a|ruta|transit|reparto/.test(e) || hayGuia) return 'Despachado';
  return null; // sin cambio claro
}

interface OrdenSync {
  id: string; store_id: string; numero: number; tel: string; guia: string | null;
  estado: string; despacho_proveedor: string; transportadora: string | null; woo_id: string;
  dropi_order_id: string; guia_url: string | null; guia_avisada: number;
}

let corriendoDespachos = false;

/** Un ciclo de sincronización de despachos para TODAS las tiendas. */
export async function sincronizarDespachos(): Promise<void> {
  if (corriendoDespachos) return; // evita solapamiento si un ciclo tarda
  corriendoDespachos = true;
  try {
    const pendientes = db.prepare(
      `SELECT id, store_id, numero, tel, guia, estado, despacho_proveedor, transportadora, woo_id, dropi_order_id, guia_url, guia_avisada
         FROM orders
        WHERE (COALESCE(woo_id,'') != '' OR COALESCE(dropi_order_id,'') != '') AND COALESCE(despacho_proveedor,'') != ''
          AND estado NOT IN ('Entregado','Cancelado')
        ORDER BY created_at DESC LIMIT 150`,
    ).all() as OrdenSync[];

    for (const o of pendientes) { await procesarOrden(o); }
  } finally {
    corriendoDespachos = false;
  }
}

/**
 * Sincroniza UN pedido contra el WooCommerce de su proveedor: actualiza guía,
 * estado y avisa la guía al cliente si es la primera vez. Devuelve lo leído
 * (o un error) para que el botón manual "Sincronizar" muestre el resultado.
 */
export async function procesarOrden(o: OrdenSync): Promise<{ estado: string; guia: string } | { error: string }> {
  // Dos caminos: si el pedido se creó por la API directa de Dropi (dropi_order_id),
  // consultamos Dropi; si no, el WooCommerce del proveedor (Effi/Dropi por Woo).
  let r: { estado: string; guia: string; guiaUrl?: string } | { error: string };
  if ((o.dropi_order_id || '').trim()) {
    try {
      const { credDropi, estadoOrden } = await import('./dropiApi.js');
      const c = credDropi(o.store_id);
      if (!c) return { error: 'Dropi API sin conectar.' };
      const rr = await estadoOrden(c, o.dropi_order_id);
      r = 'error' in rr ? rr : { estado: rr.estado, guia: rr.guia, guiaUrl: rr.guiaUrl };
    } catch { return { error: 'No pudimos consultar el pedido en Dropi.' }; }
  } else {
    const prov = wooProv(o.despacho_proveedor);
    try { r = await estadoPedido(o.store_id, o.woo_id, prov); } catch { return { error: 'No pudimos consultar el pedido.' }; }
  }
  if ('error' in r) return { error: r.error };

  const guiaNueva = (r.guia || '').trim();
  const cambios: string[] = [];
  const params: unknown[] = [];

  if (guiaNueva && guiaNueva !== (o.guia || '')) { cambios.push('guia = ?'); params.push(guiaNueva); }
  if ('guiaUrl' in r && r.guiaUrl && r.guiaUrl !== (o.guia_url || '')) { cambios.push('guia_url = ?'); params.push(r.guiaUrl); }
  if (r.estado) { cambios.push('estado_woo = ?'); params.push(r.estado); }

  // Auto-avance del estado del pedido (solo hacia adelante).
  const destino = estadoDePipeline(r.estado, !!guiaNueva);
  if (destino && rank(destino) > rank(o.estado)) { cambios.push('estado = ?'); params.push(destino); }

  if (cambios.length) {
    params.push(o.id);
    db.prepare(`UPDATE orders SET ${cambios.join(', ')} WHERE id = ?`).run(...params);
  }

  // Aviso al cliente cuando la guía aparece por primera vez.
  if (guiaNueva && !o.guia_avisada && o.tel) await avisarGuiaAlCliente(o, guiaNueva);

  return { estado: r.estado, guia: guiaNueva };
}

/**
 * Sincroniza los pedidos locales que apuntan a un `woo_id` (lo dispara el webhook
 * de WooCommerce). No confía en el cuerpo del webhook: vuelve a leer el pedido de
 * Woo con las credenciales de la tienda (procesarOrden). Devuelve cuántos procesó.
 */
export async function sincronizarPorWooId(wooId: string): Promise<number> {
  const id = String(wooId || '').trim();
  if (!id) return 0;
  const ordenes = db.prepare(
    `SELECT id, store_id, numero, tel, guia, estado, despacho_proveedor, transportadora, woo_id, dropi_order_id, guia_url, guia_avisada
       FROM orders WHERE woo_id = ? AND COALESCE(despacho_proveedor,'') != '' LIMIT 5`,
  ).all(id) as OrdenSync[];
  for (const o of ordenes) { try { await procesarOrden(o); } catch { /* seguimos */ } }
  return ordenes.length;
}

/** Sincroniza un pedido puntual desde su id de fila (para el botón manual). */
export async function sincronizarPedido(storeId: string, rowId: string): Promise<{ estado: string; guia: string } | { error: string }> {
  const o = db.prepare(
    `SELECT id, store_id, numero, tel, guia, estado, despacho_proveedor, transportadora, woo_id, dropi_order_id, guia_url, guia_avisada
       FROM orders WHERE id = ? AND store_id = ?`,
  ).get(rowId, storeId) as OrdenSync | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  if (!o.woo_id && !o.dropi_order_id) return { error: 'Este pedido aún no se ha despachado.' };
  return procesarOrden(o);
}

/** Manda el WhatsApp de "tu pedido va en camino" con la guía, y lo deja anotado en el chat. */
async function avisarGuiaAlCliente(o: OrdenSync, guia: string): Promise<void> {
  // La transportadora real (Interrapidísimo, Servientrega…) si el dueño la eligió;
  // si no, el nombre del proveedor como respaldo.
  const transp = (o.transportadora || '').trim() || nombreProv(o.despacho_proveedor);
  const texto = `¡Buenas noticias! 🎉 Tu pedido DF-${o.numero} ya salió a despacho.\n\n📦 Guía: ${guia}\n🚚 Transportadora: ${transp}\n\nTe avisaremos cuando esté por llegar. ¡Gracias por tu compra!`;
  const envio = await sendWhatsappText(o.store_id, o.tel, texto);
  if (!envio.ok) {
    // No lo marcamos como avisado: se reintenta en el próximo ciclo (puede ser
    // que la ventana de 24h de WhatsApp esté cerrada; el dueño igual ve la guía en el panel).
    registrarLog(o.store_id, 'warn', 'despacho', `No pudimos avisarle la guía de DF-${o.numero} al cliente por WhatsApp: ${envio.error || 'error'}. La guía sí quedó en el pedido.`);
    return;
  }
  db.prepare('UPDATE orders SET guia_avisada = 1 WHERE id = ?').run(o.id);
  registrarLog(o.store_id, 'info', 'despacho', `Le avisamos al cliente la guía de DF-${o.numero} (${guia}, ${transp}) por WhatsApp.`);
  // Lo dejamos también en la conversación del cliente si lo encontramos por teléfono.
  try {
    const tel = String(o.tel).replace(/[^0-9]/g, '');
    const lead = db.prepare(
      `SELECT id FROM leads WHERE store_id = ? AND REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ? LIMIT 1`,
    ).get(o.store_id, `%${tel.slice(-10)}`) as { id: string } | undefined;
    if (lead) db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado) VALUES (?,?, 'bot', ?, 'enviado')").run(uid(), lead.id, texto);
  } catch { /* si no casa el lead, no pasa nada */ }
}

let corriendoInventario = false;

/** Sincroniza el inventario desde WooCommerce para cada tienda con proveedor conectado. */
export async function sincronizarInventarios(): Promise<void> {
  if (corriendoInventario) return;
  corriendoInventario = true;
  try {
    const tiendas = db.prepare('SELECT id FROM stores WHERE COALESCE(activa,1) = 1').all() as { id: string }[];
    for (const t of tiendas) {
      const provs = proveedoresConectados(t.id);
      if (!provs.length) continue;
      // Un solo proveedor basta para el stock (el inventario es el mismo catálogo);
      // preferimos el primero conectado.
      try { await sincronizarInventario(t.id, provs[0]); } catch { /* seguimos con la próxima tienda */ }
    }
  } finally {
    corriendoInventario = false;
  }
}

/** Arranca los ciclos en segundo plano. Intervalos configurables por env. */
export function iniciarSincronizacionWoo(): void {
  const despachoMin = Number(process.env.WOO_SYNC_DESPACHO_MIN || 4);
  const inventarioMin = Number(process.env.WOO_SYNC_INVENTARIO_MIN || 30);
  // Primer arranque un poco después de levantar, para no competir con el boot.
  setTimeout(() => { void sincronizarDespachos(); }, 20_000);
  setInterval(() => { void sincronizarDespachos(); }, Math.max(1, despachoMin) * 60_000);
  setInterval(() => { void sincronizarInventarios(); }, Math.max(5, inventarioMin) * 60_000);
  console.log(`[woo-sync] despachos cada ${despachoMin}min · inventario cada ${inventarioMin}min`);
}
