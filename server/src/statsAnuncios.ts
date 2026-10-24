/**
 * Conversión por anuncio (estilo "WhatsApp conversion"): de cada pauta, cuántos chats
 * llegaron, cuántos respondieron, cuántos compraron, cuántos pedidos se despacharon,
 * cuántos llegaron (entregados) o se devolvieron, cuánto dinero dejó y qué productos vendió.
 *
 * Atribución (igual que /stats): chats = leads creados en el rango con ese anuncio;
 * pedidos = pedidos creados en el rango cuyo cliente vino de ese anuncio (por el anuncio
 * guardado en el pedido o, en pedidos viejos, por el teléfono). Fechas en hora de Bogotá.
 */
import { db, pj } from './db.js';

const ORGANICO = 'organico';
const EN_CAMINO = ['Guía generada', 'En tránsito', 'En reparto', 'Novedad'];

export interface FilaAnuncio {
  id: string; titular: string; canal: string; url: string; media: string; producto: string;
  chats: number; respondieron: number; pedidos: number; conversion: number;
  confirmados: number; despachados: number; enCamino: number; entregados: number; devueltos: number; cancelados: number;
  ventas: number; ventasEntregadas: number; ticket: number; tasaEntrega: number;
  productos: { nombre: string; unidades: number; ventas: number }[];
  serie: { fecha: string; chats: number; pedidos: number; ventas: number }[];
}

export function conversionPorAnuncio(sid: string, desde: string, hasta: string): { anuncios: FilaAnuncio[]; organico: FilaAnuncio | null } {
  const F = "date(l.created_at, '-5 hours')";
  const FO = "date(o.created_at, '-5 hours')";
  const VAL = "(CASE WHEN o.total > 0 THEN o.total ELSE COALESCE((SELECT SUM(qty*precio) FROM order_items WHERE order_id = o.id),0) + o.envio END)";
  const normTel = (t: string) => String(t || '').replace(/\D/g, '').slice(-10);

  // Datos de cada anuncio y teléfono → anuncio (para pedidos viejos sin ad_id).
  const refDeAd = new Map<string, string>();
  const telAAd = new Map<string, string>();
  for (const l of db.prepare("SELECT tel, wa_id, ad_id, ad_ref FROM leads WHERE store_id = ? AND ad_id != '' ORDER BY created_at").all(sid) as { tel: string; wa_id: string; ad_id: string; ad_ref: string }[]) {
    refDeAd.set(l.ad_id, l.ad_ref);
    const k = normTel(l.tel) || normTel(l.wa_id);
    if (k.length >= 7) telAAd.set(k, l.ad_id);
  }
  const prodDeAd = new Map<string, string>();
  try {
    for (const r of db.prepare('SELECT a.ad_id, p.nombre FROM anuncio_producto a JOIN products p ON p.id = a.product_id WHERE a.store_id = ?').all(sid) as { ad_id: string; nombre: string }[]) prodDeAd.set(r.ad_id, r.nombre);
  } catch { /* tabla aún no creada */ }

  const filas = new Map<string, FilaAnuncio>();
  const fila = (id: string): FilaAnuncio => {
    let f = filas.get(id);
    if (!f) {
      const a = pj<{ titular?: string; canal?: string; url?: string; media?: string }>(refDeAd.get(id) || '', {});
      f = {
        id, titular: id === ORGANICO ? 'Sin anuncio (orgánico)' : a.titular || 'Anuncio', canal: a.canal || '', url: a.url || '', media: a.media || '', producto: prodDeAd.get(id) || '',
        chats: 0, respondieron: 0, pedidos: 0, conversion: 0, confirmados: 0, despachados: 0, enCamino: 0, entregados: 0, devueltos: 0, cancelados: 0,
        ventas: 0, ventasEntregadas: 0, ticket: 0, tasaEntrega: 0, productos: [], serie: [],
      };
      filas.set(id, f);
    }
    return f;
  };
  const series = new Map<string, Map<string, { chats: number; pedidos: number; ventas: number }>>();
  const dia = (id: string, d: string) => {
    let m = series.get(id); if (!m) { m = new Map(); series.set(id, m); }
    let x = m.get(d); if (!x) { x = { chats: 0, pedidos: 0, ventas: 0 }; m.set(d, x); }
    return x;
  };

  // Chats que llegaron y cuántos respondieron (el cliente escribió 2 o más mensajes).
  for (const l of db.prepare(
    `SELECT COALESCE(NULLIF(l.ad_id,''), '${ORGANICO}') ad, ${F} d,
       (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id AND m.de = 'cliente') nc
     FROM leads l WHERE l.store_id = ? AND ${F} BETWEEN ? AND ?`,
  ).all(sid, desde, hasta) as { ad: string; d: string; nc: number }[]) {
    const f = fila(l.ad);
    f.chats++;
    if (l.nc >= 2) f.respondieron++;
    dia(l.ad, l.d).chats++;
  }

  // Pedidos del rango: estado, valor y productos.
  const pedidos = db.prepare(
    `SELECT o.id, o.ad_id adId, o.tel, o.estado, o.guia, o.effi_remision rem, o.dropi_order_id dropi, ${FO} d, ${VAL} val
     FROM orders o WHERE o.store_id = ? AND ${FO} BETWEEN ? AND ?`,
  ).all(sid, desde, hasta) as { id: string; adId: string; tel: string; estado: string; guia: string; rem: string; dropi: string; d: string; val: number }[];
  const itemsDe = db.prepare('SELECT i.qty, i.nombre, i.precio, p.nombre prod FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = ?');
  const prods = new Map<string, Map<string, { unidades: number; ventas: number }>>();
  for (const o of pedidos) {
    const ad = o.adId || telAAd.get(normTel(o.tel)) || ORGANICO;
    const f = fila(ad);
    const val = Number(o.val) || 0;
    f.pedidos++;
    if (o.estado === 'Cancelado') { f.cancelados++; continue; } // no suma ventas
    f.ventas += val;
    const x = dia(ad, o.d); x.pedidos++; x.ventas += val;
    if (o.estado !== 'Nuevo') f.confirmados++;
    if (o.guia || o.rem || o.dropi || EN_CAMINO.includes(o.estado) || o.estado === 'Entregado' || o.estado === 'Devuelto') f.despachados++;
    if (EN_CAMINO.includes(o.estado)) f.enCamino++;
    if (o.estado === 'Entregado') { f.entregados++; f.ventasEntregadas += val; }
    if (o.estado === 'Devuelto') f.devueltos++;
    // Productos vendidos: el valor del pedido se reparte entre sus productos.
    const its = itemsDe.all(o.id) as { qty: number; nombre: string; precio: number; prod: string | null }[];
    const suma = its.reduce((a, i) => a + (Number(i.qty) || 1) * (Number(i.precio) || 0), 0);
    const uds = its.reduce((a, i) => a + (Number(i.qty) || 1), 0) || 1;
    let mp = prods.get(ad); if (!mp) { mp = new Map(); prods.set(ad, mp); }
    for (const i of its) {
      const nombre = (i.prod || String(i.nombre || '').split('(')[0].trim()) || 'Producto';
      const q = Number(i.qty) || 1;
      const parte = suma > 0 ? (q * (Number(i.precio) || 0)) / suma : q / uds;
      const p = mp.get(nombre) || { unidades: 0, ventas: 0 };
      p.unidades += q; p.ventas += Math.round(val * parte);
      mp.set(nombre, p);
    }
  }

  // Serie continua de días (máx. 92 para no inflar la respuesta).
  const fechas: string[] = [];
  for (let t = new Date(desde + 'T12:00:00Z').getTime(), fin = new Date(hasta + 'T12:00:00Z').getTime(), i = 0; t <= fin && i < 92; t += 86400000, i++) fechas.push(new Date(t).toISOString().slice(0, 10));

  for (const f of filas.values()) {
    const efectivos = f.pedidos - f.cancelados;
    f.conversion = f.chats ? Math.round((f.pedidos / f.chats) * 1000) / 10 : 0;
    f.ticket = efectivos ? Math.round(f.ventas / efectivos) : 0;
    const cerrados = f.entregados + f.devueltos;
    f.tasaEntrega = cerrados ? Math.round((f.entregados / cerrados) * 1000) / 10 : 0;
    f.productos = [...(prods.get(f.id) || new Map()).entries()].map(([nombre, p]) => ({ nombre, ...p })).sort((a, b) => b.unidades - a.unidades || b.ventas - a.ventas);
    const s = series.get(f.id);
    f.serie = fechas.map((fecha) => ({ fecha, ...(s?.get(fecha) || { chats: 0, pedidos: 0, ventas: 0 }) }));
  }
  const organico = filas.get(ORGANICO) || null;
  filas.delete(ORGANICO);
  const anuncios = [...filas.values()].sort((a, b) => b.ventas - a.ventas || b.chats - a.chats);
  return { anuncios, organico };
}
