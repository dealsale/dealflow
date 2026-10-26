/**
 * Análisis de ventas con filtros cruzados: canal, origen (anuncio u orgánico), producto,
 * campaña, anuncio, ciudad y estado del pedido. Devuelve los KPI, series por día, embudo,
 * y cortes por producto, ciudad, estado, canal, hora del día y día de la semana.
 *
 * Misma atribución que /stats y /stats/anuncios: el pedido va al anuncio guardado en el
 * pedido o, en pedidos viejos, al del teléfono. Fechas en hora de Bogotá.
 */
import { db } from './db.js';
import './metaInsights.js'; // crea ads_insights / anuncio_producto si aún no existen

export interface FiltrosAnalisis { canal?: string; origen?: string; producto?: string; campana?: string; ad?: string; ciudad?: string; estado?: string }

const EN_CAMINO = ['Guía generada', 'En tránsito', 'En reparto', 'Novedad'];
// Pedidos que llegan por su propio canal (el chat que se abre después es solo para confirmar).
const ORIGEN_PROPIO = ['shopify', 'landing', 'web'];
// Las ventas no cuentan los pedidos cancelados ni los devueltos (esa plata no entró).
const NO_VENTA = ['Cancelado', 'Devuelto'];
const normCiudad = (c: string) => String(c || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());

export function analisis(sid: string, desde: string, hasta: string, f: FiltrosAnalisis) {
  const normTel = (t: string) => String(t || '').replace(/\D/g, '').slice(-10);
  const VAL = "(CASE WHEN o.total > 0 THEN o.total ELSE COALESCE((SELECT SUM(qty*precio) FROM order_items WHERE order_id = o.id),0) + o.envio END)";

  // Anuncio → campaña / producto, y teléfono → anuncio.
  const campDeAd = new Map<string, { id: string; nombre: string }>();
  for (const r of db.prepare('SELECT ad_id, MAX(campaign_id) cid, MAX(campaign_name) cn FROM ads_insights WHERE store_id = ? GROUP BY ad_id').all(sid) as { ad_id: string; cid: string; cn: string }[]) campDeAd.set(r.ad_id, { id: r.cid, nombre: r.cn });
  const prodDeAd = new Map<string, string>();
  try { for (const r of db.prepare('SELECT ad_id, product_id FROM anuncio_producto WHERE store_id = ?').all(sid) as { ad_id: string; product_id: string }[]) prodDeAd.set(r.ad_id, r.product_id); } catch { /* sin tabla */ }
  const telAAd = new Map<string, string>();
  const nombreAd = new Map<string, string>();
  for (const l of db.prepare("SELECT tel, wa_id, ad_id, ad_ref FROM leads WHERE store_id = ? AND ad_id != '' ORDER BY created_at").all(sid) as { tel: string; wa_id: string; ad_id: string; ad_ref: string }[]) {
    const k = normTel(l.tel) || normTel(l.wa_id);
    if (k.length >= 7) telAAd.set(k, l.ad_id);
    try { const t = JSON.parse(l.ad_ref || '{}').titular; if (t) nombreAd.set(l.ad_id, t); } catch { /* */ }
  }
  for (const r of db.prepare('SELECT ad_id, MAX(ad_name) n FROM ads_insights WHERE store_id = ? GROUP BY ad_id').all(sid) as { ad_id: string; n: string }[]) if (r.n) nombreAd.set(r.ad_id, r.n);

  const pasaAd = (ad: string) => {
    if (f.origen === 'anuncio' && !ad) return false;
    if (f.origen === 'organico' && ad) return false;
    if (f.ad && ad !== f.ad) return false;
    if (f.campana && campDeAd.get(ad)?.id !== f.campana) return false;
    return true;
  };

  // ── Pedidos del rango ──
  const pedidosRaw = db.prepare(
    `SELECT o.id, o.ad_id adId, o.tel, o.estado, o.ciudad, o.origen, o.lead_id leadId, o.guia, o.effi_remision rem, o.dropi_order_id dropi,
       date(o.created_at, '-5 hours') d, CAST(strftime('%H', o.created_at, '-5 hours') AS INTEGER) h, CAST(strftime('%w', o.created_at, '-5 hours') AS INTEGER) w, ${VAL} val
     FROM orders o WHERE o.store_id = ? AND date(o.created_at, '-5 hours') BETWEEN ? AND ?`,
  ).all(sid, desde, hasta) as { id: string; adId: string; tel: string; estado: string; ciudad: string; origen: string; leadId: string; guia: string; rem: string; dropi: string; d: string; h: number; w: number; val: number }[];
  const canalLead = new Map<string, string>();
  {
    const ids = [...new Set(pedidosRaw.map((o) => o.leadId).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 500) {
      const parte = ids.slice(i, i + 500);
      for (const r of db.prepare(`SELECT id, canal FROM leads WHERE id IN (${parte.map(() => '?').join(',')})`).all(...parte) as { id: string; canal: string }[]) canalLead.set(r.id, r.canal || 'whatsapp');
    }
  }
  const itemsDe = db.prepare('SELECT i.qty, i.nombre, i.precio, i.product_id pid, p.nombre prod FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = ?');
  const pedidos = pedidosRaw.map((o) => {
    const ad = o.adId || telAAd.get(normTel(o.tel)) || '';
    const canal = ORIGEN_PROPIO.includes(o.origen) ? o.origen : o.leadId ? canalLead.get(o.leadId) || 'whatsapp' : o.origen || 'manual';
    const items = itemsDe.all(o.id) as { qty: number; nombre: string; precio: number; pid: string | null; prod: string | null }[];
    return { ...o, ad, canal, ciudad: normCiudad(o.ciudad), items, val: Number(o.val) || 0 };
  }).filter((o) =>
    pasaAd(o.ad)
    && (!f.canal || o.canal === f.canal)
    && (!f.ciudad || o.ciudad === f.ciudad)
    && (!f.estado || o.estado === f.estado)
    && (!f.producto || o.items.some((i) => i.pid === f.producto)));

  // ── Chats del rango ── (ciudad y estado son del pedido: no filtran chats)
  const leadsRaw = db.prepare(
    `SELECT l.id, l.ad_id ad, COALESCE(NULLIF(l.canal,''),'whatsapp') canal, date(l.created_at, '-5 hours') d, CAST(strftime('%H', l.created_at, '-5 hours') AS INTEGER) h,
       (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id AND m.de = 'cliente') nc
     FROM leads l WHERE l.store_id = ? AND date(l.created_at, '-5 hours') BETWEEN ? AND ?`,
  ).all(sid, desde, hasta) as { id: string; ad: string; canal: string; d: string; h: number; nc: number }[];
  const leadsConProducto = new Set(f.producto ? pedidos.map((o) => o.leadId).filter(Boolean) : []);
  const leads = leadsRaw.filter((l) => pasaAd(l.ad) && (!f.canal || l.canal === f.canal)
    && (!f.producto || prodDeAd.get(l.ad) === f.producto || leadsConProducto.has(l.id)));

  // ── Gasto de Meta del rango ── (solo depende de anuncio/campaña/producto/origen)
  const gastoDia = new Map<string, number>();
  let gasto = 0;
  if (f.origen !== 'organico') {
    for (const r of db.prepare('SELECT ad_id, fecha, gasto FROM ads_insights WHERE store_id = ? AND fecha BETWEEN ? AND ?').all(sid, desde, hasta) as { ad_id: string; fecha: string; gasto: number }[]) {
      if (f.ad && r.ad_id !== f.ad) continue;
      if (f.campana && campDeAd.get(r.ad_id)?.id !== f.campana) continue;
      if (f.producto && prodDeAd.get(r.ad_id) !== f.producto) continue;
      gasto += r.gasto;
      gastoDia.set(r.fecha, (gastoDia.get(r.fecha) || 0) + r.gasto);
    }
  }

  // ── KPI ──
  const validos = pedidos.filter((o) => !NO_VENTA.includes(o.estado));
  const ventas = validos.reduce((a, o) => a + o.val, 0);
  const entregados = pedidos.filter((o) => o.estado === 'Entregado');
  const devueltos = pedidos.filter((o) => o.estado === 'Devuelto').length;
  const despachados = pedidos.filter((o) => o.guia || o.rem || o.dropi || EN_CAMINO.includes(o.estado) || o.estado === 'Entregado' || o.estado === 'Devuelto').length;
  const unidades = validos.reduce((a, o) => a + o.items.reduce((b, i) => b + (Number(i.qty) || 1), 0), 0);
  const chats = leads.length;
  const respondieron = leads.filter((l) => l.nc >= 2).length;
  const kpis = {
    chats, chatsAnuncio: leads.filter((l) => l.ad).length, respondieron,
    pedidos: pedidos.length, cancelados: pedidos.filter((o) => o.estado === 'Cancelado').length, despachados, entregados: entregados.length, devueltos,
    ventas, ventasEntregadas: entregados.reduce((a, o) => a + o.val, 0), unidades,
    ticket: validos.length ? Math.round(ventas / validos.length) : 0,
    conversion: chats ? Math.round((pedidos.length / chats) * 1000) / 10 : 0,
    tasaEntrega: entregados.length + devueltos ? Math.round((entregados.length / (entregados.length + devueltos)) * 1000) / 10 : 0,
    gasto: Math.round(gasto), roas: gasto ? Math.round((ventas / gasto) * 100) / 100 : 0,
    costoPedido: gasto && validos.length ? Math.round(gasto / validos.length) : 0, costoChat: gasto && chats ? Math.round(gasto / chats) : 0,
  };

  // ── Serie por día ──
  const serie: { fecha: string; chats: number; pedidos: number; ventas: number; gasto: number; entregados: number }[] = [];
  const idx = new Map<string, number>();
  for (let t = new Date(desde + 'T12:00:00Z').getTime(), fin = new Date(hasta + 'T12:00:00Z').getTime(), i = 0; t <= fin && i < 366; t += 86400000, i++) {
    const fecha = new Date(t).toISOString().slice(0, 10);
    idx.set(fecha, serie.length);
    serie.push({ fecha, chats: 0, pedidos: 0, ventas: 0, gasto: Math.round(gastoDia.get(fecha) || 0), entregados: 0 });
  }
  for (const l of leads) { const i = idx.get(l.d); if (i !== undefined) serie[i].chats++; }
  for (const o of pedidos) {
    const i = idx.get(o.d); if (i === undefined) continue;
    serie[i].pedidos++;
    if (!NO_VENTA.includes(o.estado)) serie[i].ventas += o.val;
    if (o.estado === 'Entregado') serie[i].entregados++;
  }

  // ── Cortes ──
  const porHora = Array.from({ length: 24 }, (_, h) => ({ h, chats: 0, pedidos: 0 }));
  for (const l of leads) if (porHora[l.h]) porHora[l.h].chats++;
  for (const o of pedidos) if (porHora[o.h]) porHora[o.h].pedidos++;
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const porSemana = DIAS.map((dia) => ({ dia, pedidos: 0, ventas: 0 }));
  for (const o of validos) { porSemana[o.w].pedidos++; porSemana[o.w].ventas += o.val; }

  const prod = new Map<string, { id: string; nombre: string; unidades: number; pedidos: number; ventas: number }>();
  for (const o of validos) {
    const suma = o.items.reduce((a, i) => a + (Number(i.qty) || 1) * (Number(i.precio) || 0), 0);
    const uds = o.items.reduce((a, i) => a + (Number(i.qty) || 1), 0) || 1;
    const vistos = new Set<string>();
    for (const i of o.items) {
      const nombre = i.prod || String(i.nombre || '').split('(')[0].trim() || 'Producto';
      const k = i.pid || nombre;
      const q = Number(i.qty) || 1;
      const parte = suma > 0 ? (q * (Number(i.precio) || 0)) / suma : q / uds;
      const p = prod.get(k) || { id: i.pid || '', nombre, unidades: 0, pedidos: 0, ventas: 0 };
      p.unidades += q; p.ventas += Math.round(o.val * parte);
      if (!vistos.has(k)) { p.pedidos++; vistos.add(k); }
      prod.set(k, p);
    }
  }
  const ciudades = new Map<string, { ciudad: string; pedidos: number; ventas: number; entregados: number; devueltos: number }>();
  for (const o of pedidos) {
    const c = ciudades.get(o.ciudad || '—') || { ciudad: o.ciudad || '—', pedidos: 0, ventas: 0, entregados: 0, devueltos: 0 };
    c.pedidos++; if (!NO_VENTA.includes(o.estado)) c.ventas += o.val; if (o.estado === 'Entregado') c.entregados++; if (o.estado === 'Devuelto') c.devueltos++;
    ciudades.set(c.ciudad, c);
  }
  const porEstado = new Map<string, number>();
  for (const o of pedidos) porEstado.set(o.estado, (porEstado.get(o.estado) || 0) + 1);
  const porCanal = new Map<string, { canal: string; chats: number; pedidos: number; ventas: number }>();
  const canalDe = (c: string) => { let x = porCanal.get(c); if (!x) { x = { canal: c, chats: 0, pedidos: 0, ventas: 0 }; porCanal.set(c, x); } return x; };
  for (const l of leads) canalDe(l.canal).chats++;
  for (const o of pedidos) { const x = canalDe(o.canal); x.pedidos++; if (!NO_VENTA.includes(o.estado)) x.ventas += o.val; }
  const porOrigen = { anuncio: { chats: 0, pedidos: 0, ventas: 0 }, organico: { chats: 0, pedidos: 0, ventas: 0 } };
  for (const l of leads) porOrigen[l.ad ? 'anuncio' : 'organico'].chats++;
  for (const o of pedidos) { const x = porOrigen[o.ad ? 'anuncio' : 'organico']; x.pedidos++; if (!NO_VENTA.includes(o.estado)) x.ventas += o.val; }

  // ── Opciones de los filtros (de todo el rango, sin filtrar) ──
  const opciones = {
    canales: [...new Set([...leadsRaw.map((l) => l.canal), ...pedidosRaw.map((o) => (ORIGEN_PROPIO.includes(o.origen) ? o.origen : o.leadId ? canalLead.get(o.leadId) || 'whatsapp' : o.origen || 'manual'))])].filter(Boolean),
    ciudades: [...new Map(pedidosRaw.map((o) => [normCiudad(o.ciudad), 0])).keys()].filter(Boolean).sort(),
    estados: [...new Set(pedidosRaw.map((o) => o.estado))],
    productos: (db.prepare("SELECT id, nombre FROM products WHERE store_id = ? ORDER BY nombre").all(sid) as { id: string; nombre: string }[]),
    campanas: [...new Map([...campDeAd.values()].filter((c) => c.id).map((c) => [c.id, c.nombre || c.id])).entries()].map(([id, nombre]) => ({ id, nombre })),
    anuncios: [...new Set([...leadsRaw.map((l) => l.ad), ...pedidosRaw.map((o) => o.adId)].filter(Boolean)), ...campDeAd.keys()]
      .filter((v, i, a) => a.indexOf(v) === i).filter((id) => !f.campana || campDeAd.get(id)?.id === f.campana)
      .map((id) => ({ id, nombre: nombreAd.get(id) || id })),
  };

  return {
    rango: { desde, hasta }, filtros: f, kpis, serie,
    embudo: [
      { paso: 'Chats', n: chats }, { paso: 'Respondieron', n: respondieron }, { paso: 'Pedidos', n: pedidos.length },
      { paso: 'Despachados', n: despachados }, { paso: 'Entregados', n: entregados.length },
    ],
    porProducto: [...prod.values()].sort((a, b) => b.ventas - a.ventas).slice(0, 20),
    porCiudad: [...ciudades.values()].sort((a, b) => b.pedidos - a.pedidos).slice(0, 15),
    porEstado: [...porEstado.entries()].map(([estado, n]) => ({ estado, n })).sort((a, b) => b.n - a.n),
    porCanal: [...porCanal.values()].sort((a, b) => b.chats - a.chats),
    porOrigen, porHora, porSemana, opciones,
  };
}
