/**
 * Más de Effi, alrededor del envío:
 *  1. Rastreo: el historial de estados de la guía (con fecha y hora), para el
 *     pedido y para que el asistente responda "¿dónde va mi pedido?".
 *  2. Cobertura: antes de cerrar la venta, ¿alguna transportadora llega a la
 *     ciudad del cliente y con contraentrega? (y en cuántos días).
 *  3. Recaudos: lo que Effi ya consignó en tu Wallet por cada guía contraentrega,
 *     lo que descontó de flete y lo que falta por pagar.
 *  4. Devoluciones: registrar en Effi la devolución de venta del pedido devuelto
 *     para que el inventario vuelva a cuadrar.
 */
import { db, pj, registrarLog } from './db.js';
import { cfgEffi, effi, mensajeError, prepararRemision, resolverUbicacion } from './effiApi.js';
import { conPedido, trazar } from './trazabilidad.js';
import { nombreTransportadora } from './transportadoras.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const fechaCO = (dias = 0) => new Date(Date.now() - 5 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);

db.exec(`CREATE TABLE IF NOT EXISTS guia_historial (
  order_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT '',
  estado_global TEXT NOT NULL DEFAULT '',
  observacion TEXT NOT NULL DEFAULT '',
  foto TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (order_id, fecha, estado)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS effi_cobertura (
  store_id TEXT NOT NULL, destino TEXT NOT NULL, datos TEXT NOT NULL, ts TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, destino)
)`);

// ── 1. Rastreo de la guía ──────────────────────────────────────────────

export interface PasoRastreo { fecha: string; estado: string; estadoGlobal: string; observacion: string; foto: string }

/** Historial guardado del pedido (más reciente primero). */
export function rastreoGuardado(orderId: string): PasoRastreo[] {
  return (db.prepare('SELECT fecha, estado, estado_global, observacion, foto FROM guia_historial WHERE order_id = ? ORDER BY fecha DESC').all(orderId) as Fila[])
    .map((f) => ({ fecha: txt(f.fecha), estado: txt(f.estado), estadoGlobal: txt(f.estado_global), observacion: txt(f.observacion), foto: txt(f.foto) }));
}

/** Trae de Effi el historial de la guía (si lo de la caché tiene más de `frescuraMin`). */
export async function rastrearGuia(storeId: string, orderId: string, frescuraMin = 10): Promise<PasoRastreo[] | { error: string }> {
  const o = db.prepare('SELECT id, guia, created_at, historial_ts FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const guia = txt(o.guia);
  if (!guia) return { error: 'El pedido todavía no tiene guía.' };
  const ultima = txt(o.historial_ts);
  if (ultima && Date.now() - new Date(ultima.replace(' ', 'T') + 'Z').getTime() < frescuraMin * 60_000) return rastreoGuardado(orderId);
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return rastreoGuardado(orderId);
  // Effi exige rango de máximo 31 días: desde la creación del pedido (o hace 30 días).
  const creado = txt(o.created_at).slice(0, 10);
  const desde = creado && creado > fechaCO(-30) ? creado : fechaCO(-30);
  const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/hist_est_guia_transporte', { query: { cambio_estado_desde: desde, cambio_estado_hasta: fechaCO(0), guia, por_pagina: 100 } });
  if (!r.ok) return rastreoGuardado(orderId).length ? rastreoGuardado(orderId) : { error: mensajeError(r) };
  const ins = db.prepare('INSERT OR REPLACE INTO guia_historial (order_id, fecha, estado, estado_global, observacion, foto) VALUES (?,?,?,?,?,?)');
  for (const h of r.body.data || []) {
    ins.run(orderId, txt(h.fecha_hist_est), txt(h.estado_new), txt(h.estado_new_efficommerce), txt(h.observacion_hist_est), txt(h.url_foto));
  }
  db.prepare("UPDATE orders SET historial_ts = datetime('now') WHERE id = ?").run(orderId);
  return rastreoGuardado(orderId);
}

/**
 * Para el asistente: el envío de los pedidos recientes de este chat (estado,
 * transportadora, guía y últimos movimientos). Refresca el rastreo si está viejo.
 */
export async function contextoEnvioLead(storeId: string, leadId: string): Promise<string> {
  const lead = db.prepare('SELECT tel FROM leads WHERE id = ?').get(leadId) as { tel: string } | undefined;
  const diez = String(lead?.tel || '').replace(/\D/g, '').slice(-10);
  const pedidos = db.prepare(
    `SELECT id, numero, estado, estado_woo, transportadora, guia, despacho_proveedor, created_at FROM orders
      WHERE store_id = ? AND created_at > datetime('now','-40 days')
        AND (lead_id = ? OR (? != '' AND REPLACE(REPLACE(tel,' ',''),'+','') LIKE ?))
      ORDER BY created_at DESC LIMIT 2`,
  ).all(storeId, leadId, diez, `%${diez}`) as Fila[];
  if (!pedidos.length) return '';
  const lineas: string[] = [];
  for (const p of pedidos) {
    let pasos: PasoRastreo[] = [];
    if (txt(p.guia) && txt(p.despacho_proveedor) === 'effi' && !['Entregado', 'Devuelto', 'Cancelado'].includes(txt(p.estado))) {
      const r = await rastrearGuia(storeId, txt(p.id), 30).catch(() => [] as PasoRastreo[]);
      if (Array.isArray(r)) pasos = r;
    } else pasos = rastreoGuardado(txt(p.id));
    const mov = pasos.slice(0, 3).map((s) => `${s.fecha.slice(0, 16)} ${s.estado}${s.observacion ? ` (${s.observacion})` : ''}`).join('; ');
    lineas.push(`- Pedido DF-${txt(p.numero)}: estado ${txt(p.estado)}${txt(p.transportadora) ? ` · ${nombreTransportadora(txt(p.transportadora)) || txt(p.transportadora)}` : ''}${txt(p.guia) ? ` · guía ${txt(p.guia)}` : ' · aún sin guía'}${mov ? ` · últimos movimientos (UTC): ${mov}` : ''}`);
  }
  return `\n\nENVÍOS DE ESTE CLIENTE (datos reales, úsalos si pregunta por su pedido, la guía o cuándo llega; no inventes fechas):\n${lineas.join('\n')}`;
}

// ── 2. Cobertura ─────────────────────────────────────────────────────

export interface Cobertura { destino: string; transportadoras: { nombre: string; recaudo: boolean; dias: number }[]; conRecaudo: boolean; dias: number | null; error?: string }
const cacheRemitente = new Map<string, { ciudad: string; ts: number }>();

/** Ciudad de origen: la del remitente configurado para las guías (o el primero). */
async function ciudadOrigen(storeId: string, apiKey: string, remitente: string): Promise<string> {
  const k = `${storeId}:${remitente}`;
  const c = cacheRemitente.get(k);
  if (c && Date.now() - c.ts < 6 * 3600_000) return c.ciudad;
  const r = await effi<Fila[]>(apiKey, 'GET', '/api/remitente', { query: { por_pagina: 100 } });
  const lista = r.ok ? r.body.data || [] : [];
  const rem = lista.find((x) => txt(x.codigo) === remitente) || lista[0];
  const ciudad = rem ? txt(rem.ciudad) : '';
  if (ciudad) cacheRemitente.set(k, { ciudad, ts: Date.now() });
  return ciudad;
}

/** ¿Llegan a esa ciudad? Caché de 7 días por ciudad destino. */
export async function coberturaCiudad(storeId: string, departamento: string, ciudad: string): Promise<Cobertura | null> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey || !ciudad.trim()) return null;
  const clave = `${norm(departamento)}|${norm(ciudad)}`;
  const cache = db.prepare("SELECT datos FROM effi_cobertura WHERE store_id = ? AND destino = ? AND ts > datetime('now','-7 days')").get(storeId, clave) as { datos: string } | undefined;
  if (cache) return pj<Cobertura | null>(cache.datos, null);
  const ubic = await resolverUbicacion(c.apiKey, departamento, ciudad);
  if ('error' in ubic) return { destino: ciudad, transportadoras: [], conRecaudo: false, dias: null, error: ubic.error };
  const origen = await ciudadOrigen(storeId, c.apiKey, c.guia.remitente);
  if (!origen) return null;
  const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/cobertura_transportadora_efficommerce', { query: { ciudad_origen: origen, ciudad_destino: ubic.ciudad, por_pagina: 100 } });
  if (!r.ok) return null;
  const porT = new Map<string, { nombre: string; recaudo: boolean; dias: number }>();
  for (const f of r.body.data || []) {
    if (txt(f.vigente) === '0') continue;
    const nombre = nombreTransportadora(txt(f.nombre_transportadora_efficommerce)) || txt(f.nombre_transportadora_efficommerce);
    const prev = porT.get(nombre);
    const dias = Number(f.cant_dias_promesa_entrega) || 0;
    const recaudo = txt(f.recaudo) === '1';
    if (!prev) porT.set(nombre, { nombre, recaudo, dias });
    else { prev.recaudo ||= recaudo; prev.dias = Math.min(prev.dias || dias, dias || prev.dias); }
  }
  const transportadoras = [...porT.values()].sort((a, b) => Number(b.recaudo) - Number(a.recaudo) || a.dias - b.dias);
  const conR = transportadoras.filter((t) => t.recaudo);
  const res: Cobertura = { destino: ubic.nombre, transportadoras, conRecaudo: conR.length > 0, dias: (conR.length ? conR : transportadoras).reduce<number | null>((m, t) => (t.dias && (m == null || t.dias < m) ? t.dias : m), null) };
  db.prepare('INSERT OR REPLACE INTO effi_cobertura (store_id, destino, datos) VALUES (?,?,?)').run(storeId, clave, JSON.stringify(res));
  return res;
}

export function textoCobertura(cb: Cobertura): string {
  if (cb.error) return cb.error;
  if (!cb.transportadoras.length) return `Ninguna transportadora de Effi llega a ${cb.destino}.`;
  if (!cb.conRecaudo) return `Llegan a ${cb.destino} (${cb.transportadoras.map((t) => t.nombre).join(', ')}), pero ninguna con pago contraentrega.`;
  return `Contraentrega disponible a ${cb.destino}${cb.dias ? ` · ${cb.dias} día${cb.dias === 1 ? '' : 's'} aprox.` : ''} (${cb.transportadoras.filter((t) => t.recaudo).map((t) => t.nombre).join(', ')}).`;
}

// ── 3. Recaudos contraentrega (Effi Wallet) ────────────────────────────

export interface ResumenRecaudos {
  mes: string; recaudado: number; descuentos: number; retirado: number; neto: number;
  pendientes: { orderId: string; numero: number; cliente: string; guia: string; total: number; entregado: string }[];
  pagados: { orderId: string; numero: number; cliente: string; guia: string; total: number; recaudo: number; descuentos: number; fecha: string }[];
  movimientos: number; error?: string;
}
const cacheRecaudos = new Map<string, { ts: number; r: ResumenRecaudos }>();

export async function recaudosMes(storeId: string, mes: string): Promise<ResumenRecaudos | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  if (!/^\d{4}-\d{2}$/.test(mes)) mes = fechaCO(0).slice(0, 7);
  const k = `${storeId}:${mes}`;
  const ca = cacheRecaudos.get(k);
  if (ca && Date.now() - ca.ts < 10 * 60_000) return ca.r;
  const [a, m] = mes.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const movs: Fila[] = [];
  for (let pagina = 1; pagina <= 30; pagina++) {
    const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/movimiento_dinero_effi', { query: { fecha_desde: `${mes}-01`, fecha_hasta: fin, pagina, por_pagina: 100 } });
    if (!r.ok) { if (pagina === 1) return { error: mensajeError(r) }; break; }
    movs.push(...(r.body.data || []));
    const pg = r.body.paginacion;
    if (!pg || pagina >= pg.total_paginas) break;
  }
  const porGuia = new Map<string, { recaudo: number; descuentos: number; fecha: string }>();
  let recaudado = 0; let descuentos = 0; let retirado = 0;
  for (const mv of movs) {
    if (txt(mv.vigente) === '0') continue;
    const valor = Number(mv.valor) || 0;
    const guia = txt(mv.guia_inicial);
    if (guia) {
      const g = porGuia.get(guia) || { recaudo: 0, descuentos: 0, fecha: '' };
      if (valor > 0) { g.recaudo += valor; recaudado += valor; g.fecha = txt(mv.fecha_trans) || g.fecha; } else { g.descuentos += -valor; descuentos += -valor; }
      porGuia.set(guia, g);
    } else if (valor < 0 && (txt(mv.cuenta) || txt(mv.solicitud_retiro) || /retiro/i.test(txt(mv.tipo_movimiento)))) {
      retirado += -valor;
    } else if (valor < 0) descuentos += -valor;
  }
  const ordenes = db.prepare("SELECT id, numero, cliente, guia, CASE WHEN COALESCE(total,0) > 0 THEN total ELSE COALESCE((SELECT SUM(qty * precio) FROM order_items i WHERE i.order_id = orders.id), 0) + COALESCE(envio,0) END AS total, estado, created_at FROM orders WHERE store_id = ? AND despacho_proveedor = 'effi' AND COALESCE(guia,'') != ''").all(storeId) as Fila[];
  const pagados: ResumenRecaudos['pagados'] = [];
  for (const o of ordenes) {
    const g = porGuia.get(txt(o.guia));
    if (g) pagados.push({ orderId: txt(o.id), numero: Number(o.numero), cliente: txt(o.cliente), guia: txt(o.guia), total: Number(o.total) || 0, recaudo: g.recaudo, descuentos: g.descuentos, fecha: g.fecha });
  }
  // Pendientes: entregados en los últimos 45 días sin recaudo en Effi (en este mes ni en el anterior ya consultado).
  const pagadosAntes = new Set<string>();
  for (const [kk, v] of cacheRecaudos) if (kk.startsWith(storeId + ':') && kk !== k) v.r.pagados.forEach((p) => pagadosAntes.add(p.guia));
  const pendientes = (db.prepare("SELECT id, numero, cliente, guia, CASE WHEN COALESCE(total,0) > 0 THEN total ELSE COALESCE((SELECT SUM(qty * precio) FROM order_items i WHERE i.order_id = orders.id), 0) + COALESCE(envio,0) END AS total, created_at FROM orders WHERE store_id = ? AND despacho_proveedor = 'effi' AND estado = 'Entregado' AND COALESCE(guia,'') != '' AND created_at > datetime('now','-45 days')").all(storeId) as Fila[])
    .filter((o) => !porGuia.has(txt(o.guia)) && !pagadosAntes.has(txt(o.guia)))
    .map((o) => ({ orderId: txt(o.id), numero: Number(o.numero), cliente: txt(o.cliente), guia: txt(o.guia), total: Number(o.total) || 0, entregado: txt(o.created_at).slice(0, 10) }));
  const res: ResumenRecaudos = { mes, recaudado, descuentos, retirado, neto: recaudado - descuentos, pendientes, pagados: pagados.sort((x, y) => y.fecha.localeCompare(x.fecha)), movimientos: movs.length };
  cacheRecaudos.set(k, { ts: Date.now(), r: res });
  return res;
}

// ── 4. Devoluciones ─────────────────────────────────────────────────

/** Registra en Effi la devolución de venta del pedido (entra la mercancía a la bodega). */
export function registrarDevolucion(storeId: string, orderId: string, origen: 'panel' | 'auto' = 'panel'): Promise<{ ok: true; devolucion: string } | { error: string }> {
  return conPedido(storeId, orderId, async () => {
    const c = cfgEffi(storeId);
    if (!c?.apiKey) return { error: 'Effi no está conectado.' };
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
    if (!o) return { error: 'Pedido no encontrado.' };
    if (txt(o.effi_devolucion)) return { ok: true as const, devolucion: txt(o.effi_devolucion) };
    const doc = pj<Fila>(txt(o.effi_doc), {});
    if (!doc.id) return { error: 'Este pedido no tiene remisión en Effi.' };
    // Los productos de la remisión: los guardados al crearla o, en remisiones viejas, recalculados.
    let con = doc.conceptos as { articulo: number[]; descripcion: string[]; cantidad: number[]; precio: number[]; descuento: number[] } | undefined;
    if (!con?.articulo?.length) {
      const prep = await prepararRemision(storeId, orderId, false, 'devolucion');
      if ('error' in prep) return { error: `No pudimos armar los productos de la devolución: ${prep.error}` };
      const b = prep.body as Fila;
      con = { articulo: b.articulo as number[], descripcion: b.descripcion as string[], cantidad: b.cantidad as number[], precio: b.precio as number[], descuento: (b.descuento as number[]) || [] };
    }
    // El flete no se devuelve: solo la mercancía.
    const idx = con.articulo.map((a, i) => i).filter((i) => !(c.articuloFlete && String(con!.articulo[i]) === String(c.articuloFlete)));
    if (!idx.length) return { error: 'La remisión no tiene productos para devolver.' };
    const body: Record<string, unknown> = {
      idempotency_key: `dfdv-${storeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${txt(o.numero)}`.slice(0, 36),
      sucursal_remision_v: Number(doc.sucursal), id_remision_v: Number(doc.id),
      sucursal: Number(c.sucursal), bodega: Number(c.bodega), centro_costos: Number(c.centroCostos),
      articulo: idx.map((i) => con!.articulo[i]), descripcion: idx.map((i) => con!.descripcion[i]),
      cantidad: idx.map((i) => con!.cantidad[i]), precio: idx.map((i) => con!.precio[i]), descuento: idx.map((i) => con!.descuento?.[i] || 0),
      t_destinacion: 1,
      observacion: `DealFlow DF-${txt(o.numero)} · pedido devuelto por la transportadora${txt(o.guia) ? ` (guía ${txt(o.guia)})` : ''}`.slice(0, 255),
    };
    const r = await effi<Fila>(c.apiKey, 'POST', '/api/devolucion_v', { body });
    let d = r.body.data;
    if (!r.ok && r.http === 409 && d) { /* ya estaba creada con esta llave */ } else if (!r.ok || !d) {
      const e = `Effi no registró la devolución: ${mensajeError(r)}`;
      trazar(storeId, orderId, { etapa: 'devolucion', nivel: 'error', titulo: e });
      registrarLog(storeId, 'warn', 'despacho', `DF-${txt(o.numero)}: ${e}`);
      return { error: e };
    }
    d = d || {};
    const id = txt(d.id_transaccion) || `${txt(d.prefijo)}-${txt(d.id)}`;
    db.prepare('UPDATE orders SET effi_devolucion = ? WHERE id = ?').run(id, orderId);
    trazar(storeId, orderId, { etapa: 'devolucion', nivel: 'ok', titulo: `Devolución ${id} registrada en Effi${origen === 'auto' ? ' (automática)' : ''}`, datos: d });
    registrarLog(storeId, 'info', 'despacho', `DF-${txt(o.numero)}: devolución ${id} registrada en Effi; la mercancía vuelve a la bodega.`);
    return { ok: true as const, devolucion: id };
  });
}

/** Cuando un pedido de Effi queda Devuelto: si está activado, registra la devolución sola. */
export function alQuedarDevuelto(storeId: string, orderId: string): void {
  const c = cfgEffi(storeId);
  if (!c?.devolucionAuto) return;
  void registrarDevolucion(storeId, orderId, 'auto').catch(() => {});
}

// ── 5. Guías creadas directamente en Effi (pedidos de antes de la integración) ──

const celulares = (...textos: unknown[]) => {
  const out = new Set<string>();
  for (const t of textos) for (const m of String(t || '').replace(/[^\d]+/g, ' ').split(' ')) {
    const d = m.length > 10 && m.startsWith('57') ? m.slice(2) : m;
    if (d.length === 10 && d.startsWith('3')) out.add(d);
  }
  return [...out];
};
const ultimaUnion = new Map<string, number>();

/**
 * Une las guías que se hicieron a mano en Effi con su pedido de DealFlow (los
 * pedidos de antes de la integración no tienen número de guía). Se empareja por
 * el celular del cliente (en Effi va como teléfono o como cédula) y, si no hay,
 * por el nombre exacto; siempre con un pedido sin guía, creado hasta 30 días
 * antes de la guía. Solo une si hay UN candidato claro.
 */
export async function unirGuiasDeEffi(storeId: string, forzar = false): Promise<{ unidas: number; revisadas: number } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  if (!forzar && Date.now() - (ultimaUnion.get(storeId) || 0) < 30 * 60_000) return { unidas: 0, revisadas: 0 };
  ultimaUnion.set(storeId, Date.now());
  const guias: Fila[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { desde: fechaCO(-45), hasta: fechaCO(1), existe_guia: 1, pagina, por_pagina: 100 } });
    if (!r.ok) { if (pagina === 1) return { error: mensajeError(r) }; break; }
    guias.push(...(r.body.data || []));
    const pg = r.body.paginacion;
    if (!pg || pagina >= pg.total_paginas) break;
  }
  const sinCero = (g: string) => g.replace(/\s/g, '').replace(/^0+/, '');
  const yaUnidas = new Set((db.prepare("SELECT guia FROM orders WHERE store_id = ? AND COALESCE(guia,'') != ''").all(storeId) as { guia: string }[]).map((o) => sinCero(o.guia)));
  const libres = db.prepare("SELECT id, numero, cliente, tel, ciudad, estado, created_at FROM orders WHERE store_id = ? AND COALESCE(guia,'') = '' AND created_at > datetime('now','-80 days')").all(storeId) as Fila[];
  const usados = new Set<string>();
  let unidas = 0;
  for (const g of guias) {
    const num = txt(g.guia);
    if (!num || yaUnidas.has(sinCero(num))) continue;
    const fechaGuia = new Date(txt(g.fecha_trans).replace(' ', 'T') + 'Z').getTime() || Date.now();
    const enVentana = (o: Fila) => { const t = new Date(txt(o.created_at).replace(' ', 'T') + 'Z').getTime(); return t <= fechaGuia + 86400_000 && t >= fechaGuia - 30 * 86400_000; };
    const cel = celulares(g.telefonos_destinatario, g.id_destinatario);
    let cands = libres.filter((o) => !usados.has(txt(o.id)) && enVentana(o) && cel.includes(String(o.tel || '').replace(/\D/g, '').slice(-10)));
    if (!cands.length && txt(g.nombre_destinatario)) {
      const nom = norm(txt(g.nombre_destinatario));
      cands = libres.filter((o) => !usados.has(txt(o.id)) && enVentana(o) && norm(txt(o.cliente)) === nom);
    }
    // Varios pedidos del mismo cliente: el más cercano antes de la guía.
    cands.sort((a, b) => txt(b.created_at).localeCompare(txt(a.created_at)));
    const o = cands[0];
    if (!o || (cands.length > 1 && txt(cands[1].created_at).slice(0, 10) === txt(o.created_at).slice(0, 10))) continue;
    usados.add(txt(o.id));
    const transp = nombreTransportadora(txt(g.nombre_transportadora_efficommerce) || txt(g.nombre_transportadora)) || txt(g.nombre_transportadora_efficommerce);
    const estadoTxt = txt(g.estado_efficommerce) || txt(g.estado);
    const { estadoLogistico, siguienteEstado } = await import('./estadosPedido.js');
    const nuevo = siguienteEstado(txt(o.estado), estadoLogistico(estadoTxt, true));
    db.prepare(`UPDATE orders SET guia = ?, transportadora = CASE WHEN ? != '' THEN ? ELSE transportadora END,
        despacho_proveedor = CASE WHEN COALESCE(despacho_proveedor,'') = '' THEN 'effi' ELSE despacho_proveedor END,
        effi_guia = ?, estado_woo = CASE WHEN ? != '' THEN ? ELSE estado_woo END, estado = COALESCE(?, estado), guia_avisada = 1 WHERE id = ?`)
      .run(num, transp, transp, JSON.stringify({ sucursal: txt(g.sucursal), id: txt(g.id), id_transaccion: txt(g.id_transaccion), manual: true }), estadoTxt.slice(0, 60), estadoTxt.slice(0, 60), nuevo, txt(o.id));
    trazar(storeId, txt(o.id), { etapa: 'vinculo', nivel: 'info', titulo: `Guía ${num} (${transp || 'Effi'}) unida a este pedido`, detalle: `Creada en Effi para ${txt(g.nombre_destinatario)}; se unió por ${cel.includes(String(o.tel || '').replace(/\D/g, '').slice(-10)) ? 'el celular' : 'el nombre'} del cliente.` });
    unidas++;
  }
  if (unidas) registrarLog(storeId, 'info', 'despacho', `${unidas} guía(s) creadas en Effi se unieron a su pedido en DealFlow (por el celular o el nombre del cliente).`);
  return { unidas, revisadas: guias.length };
}

/** Estado de las guías que se unieron así (no tienen remisión de DealFlow): por número de guía. */
export async function consultarGuiasSueltas(): Promise<void> {
  const filas = db.prepare(`SELECT id, store_id, guia FROM orders WHERE despacho_proveedor = 'effi' AND COALESCE(effi_doc,'') = '' AND COALESCE(guia,'') != ''
      AND estado NOT IN ('Entregado','Devuelto','Cancelado') AND created_at > datetime('now','-45 days') ORDER BY created_at DESC LIMIT 120`).all() as Fila[];
  const { procesarWebhookEffi } = await import('./effiApi.js');
  for (const f of filas) {
    const c = cfgEffi(txt(f.store_id));
    if (!c?.apiKey) continue;
    try {
      const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { guia: txt(f.guia), por_pagina: 5 } });
      const g = r.ok ? (r.body.data || [])[0] : undefined;
      if (g) await procesarWebhookEffi(txt(f.store_id), 'Consulta de guía', '', { data: g });
    } catch { /* sigue con la próxima */ }
  }
}
