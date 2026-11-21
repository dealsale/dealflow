import { db, uid, pj, registrarLog } from './db.js';
import { trazar } from './trazabilidad.js';
import { saveOutgoingMedia } from './media.js';

/**
 * Bodegas de los proveedores (dropshipping con Skydropx).
 *
 * El dropshipper no tiene el producto: lo tiene su proveedor. Cada producto dice desde qué
 * bodega sale; la guía de Skydropx se genera con la dirección de recogida de ESA bodega y,
 * apenas está lista, le llega al proveedor por WhatsApp con el PDF para que la imprima,
 * la pegue al paquete y se lo entregue a la transportadora.
 *
 * WhatsApp solo deja escribir texto libre si el número escribió en las últimas 24 h. Si no,
 * va la plantilla `guia_para_proveedor` («tienes guías para despachar, responde y te las
 * mandamos») y las guías quedan pendientes hasta que el proveedor responda.
 */

db.exec(`CREATE TABLE IF NOT EXISTS bodegas_proveedor (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  empresa TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  referencia TEXT NOT NULL DEFAULT '',
  departamento TEXT NOT NULL DEFAULT '',
  ciudad TEXT NOT NULL DEFAULT '',
  nit TEXT NOT NULL DEFAULT '',
  avisar INTEGER NOT NULL DEFAULT 1,
  invitado_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_bodegas_proveedor_store ON bodegas_proveedor(store_id)');
// Columnas products.bodega_id, orders.bodega_id y orders.guia_proveedor: en db.ts.
// guia_proveedor = JSON { estado: enviada|pendiente|error|apagado, at, detalle }.

export const PLANTILLA_PROVEEDOR = 'guia_para_proveedor';
export const ASIGNADO_PROVEEDOR = 'Proveedor (sin bot)';

export interface Proveedor { id: string; nombre: string; empresa: string; telefono: string; email: string; direccion: string; referencia: string; departamento: string; ciudad: string; nit: string; avisar: boolean }
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
/** Celular colombiano en 10 dígitos (sin +57). */
export const diez = (s: string) => txt(s).replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '').slice(-10);

function deFila(r: Fila): Proveedor {
  return {
    id: txt(r.id), nombre: txt(r.nombre), empresa: txt(r.empresa), telefono: txt(r.telefono), email: txt(r.email), direccion: txt(r.direccion),
    referencia: txt(r.referencia), departamento: txt(r.departamento), ciudad: txt(r.ciudad), nit: txt(r.nit), avisar: !!Number(r.avisar),
  };
}

export function listarProveedores(storeId: string): Proveedor[] {
  return (db.prepare('SELECT * FROM bodegas_proveedor WHERE store_id = ? ORDER BY nombre COLLATE NOCASE').all(storeId) as Fila[]).map(deFila);
}

export function proveedorPorId(storeId: string, id: string): Proveedor | null {
  if (!id) return null;
  const r = db.prepare('SELECT * FROM bodegas_proveedor WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  return r ? deFila(r) : null;
}

export function guardarProveedor(storeId: string, b: Partial<Proveedor> & { id?: string }): { ok: true; id: string } | { error: string } {
  const c = (v: unknown, n = 100) => txt(v).replace(/\s+/g, ' ').trim().slice(0, n);
  const p = {
    nombre: c(b.nombre, 30), empresa: c(b.empresa, 60), telefono: c(b.telefono, 20), email: c(b.email, 100), direccion: c(b.direccion, 100),
    referencia: c(b.referencia, 30), departamento: c(b.departamento, 60), ciudad: c(b.ciudad, 60), nit: c(b.nit, 20), avisar: b.avisar === false ? 0 : 1,
  };
  const faltan = [!p.nombre && 'nombre', !p.telefono && 'celular', !p.direccion && 'dirección', !p.ciudad && 'ciudad'].filter(Boolean);
  if (faltan.length) return { error: `Falta: ${faltan.join(', ')}.` };
  if (diez(p.telefono).length !== 10) return { error: 'El celular del proveedor debe tener 10 dígitos (ej. 3001234567).' };
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return { error: 'El correo del proveedor no es válido.' };
  let id = txt(b.id);
  if (id && proveedorPorId(storeId, id)) {
    db.prepare(`UPDATE bodegas_proveedor SET nombre=?, empresa=?, telefono=?, email=?, direccion=?, referencia=?, departamento=?, ciudad=?, nit=?, avisar=? WHERE id=? AND store_id=?`)
      .run(p.nombre, p.empresa, p.telefono, p.email, p.direccion, p.referencia, p.departamento, p.ciudad, p.nit, p.avisar, id, storeId);
  } else {
    id = uid();
    db.prepare(`INSERT INTO bodegas_proveedor (id, store_id, nombre, empresa, telefono, email, direccion, referencia, departamento, ciudad, nit, avisar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, storeId, p.nombre, p.empresa, p.telefono, p.email, p.direccion, p.referencia, p.departamento, p.ciudad, p.nit, p.avisar);
  }
  // Si ese número ya tiene chat, el bot deja de contestarle.
  const lead = leadDeNumero(storeId, p.telefono);
  if (lead) marcarChatProveedor(lead);
  return { ok: true, id };
}

export function borrarProveedor(storeId: string, id: string): void {
  db.prepare('DELETE FROM bodegas_proveedor WHERE id = ? AND store_id = ?').run(id, storeId);
  db.prepare("UPDATE products SET bodega_id = '' WHERE store_id = ? AND bodega_id = ?").run(storeId, id);
}

/** Bodega sugerida para el pedido según sus productos (`mixto`: hay productos de bodegas distintas). */
export function bodegaDelPedido(storeId: string, orderId: string): { sugerido: string; mixto: boolean } {
  const filas = db.prepare(`SELECT COALESCE(p.bodega_id,'') pid FROM order_items i JOIN products p ON p.id = i.product_id AND p.store_id = ?
      WHERE i.order_id = ?`).all(storeId, orderId) as { pid: string }[];
  const validos = new Set(listarProveedores(storeId).map((p) => p.id));
  const ids = [...new Set(filas.map((f) => (validos.has(f.pid) ? f.pid : '')))];
  if (!ids.length) return { sugerido: '', mixto: false };
  return { sugerido: ids.find(Boolean) || '', mixto: ids.length > 1 };
}

// ── Chat del proveedor ────────────────────────────────────────────────
function leadDeNumero(storeId: string, tel: string): string | null {
  const n = diez(tel);
  if (n.length !== 10) return null;
  const r = db.prepare(`SELECT id FROM leads WHERE store_id = ? AND (replace(replace(replace(tel,' ',''),'+',''),'-','') LIKE ? OR wa_id LIKE ?)
      ORDER BY created_at DESC LIMIT 1`).get(storeId, '%' + n, '%' + n + '@%') as { id: string } | undefined;
  return r?.id || null;
}
function marcarChatProveedor(leadId: string): void {
  db.prepare("UPDATE leads SET asignado = ?, etiqueta = 'Proveedor' WHERE id = ?").run(ASIGNADO_PROVEEDOR, leadId);
}
function proveedorDeLead(storeId: string, leadId: string): Proveedor | null {
  const l = db.prepare('SELECT tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(leadId, storeId) as { tel: string; wa_id: string } | undefined;
  if (!l) return null;
  const nums = [diez(l.tel), diez(txt(l.wa_id).split('@')[0])].filter((x) => x.length === 10);
  if (!nums.length) return null;
  return listarProveedores(storeId).find((p) => nums.includes(diez(p.telefono))) || null;
}

/**
 * Llega un mensaje: si es de un proveedor, el bot no le contesta y se le mandan las guías
 * que tenía pendientes (ya respondió, así que la ventana de 24 h está abierta).
 * Devuelve true si el número es de un proveedor.
 */
export async function alEscribirProveedor(storeId: string, leadId: string): Promise<boolean> {
  const p = proveedorDeLead(storeId, leadId);
  if (!p) return false;
  marcarChatProveedor(leadId);
  const pendientes = db.prepare(`SELECT id FROM orders WHERE store_id = ? AND bodega_id = ? AND json_extract(guia_proveedor,'$.estado') = 'pendiente'
      AND created_at > datetime('now','-15 days') ORDER BY created_at`).all(storeId, p.id) as { id: string }[];
  for (const o of pendientes) await enviarGuiaAProveedor(storeId, o.id, { forzar: true }).catch(() => null);
  return true;
}

// ── Mandar la guía ────────────────────────────────────────────────────
function guardarEstado(orderId: string, estado: 'enviada' | 'pendiente' | 'error' | 'apagado', detalle: string): void {
  db.prepare('UPDATE orders SET guia_proveedor = ? WHERE id = ?').run(JSON.stringify({ estado, at: new Date().toISOString(), detalle: detalle.slice(0, 300) }), orderId);
}
export function estadoGuiaProveedor(o: { guia_proveedor?: unknown }): { estado: string; at: string; detalle: string } | null {
  const e = pj<{ estado?: string; at?: string; detalle?: string }>(txt(o.guia_proveedor), {});
  return e.estado ? { estado: e.estado, at: txt(e.at), detalle: txt(e.detalle) } : null;
}

/** Baja el PDF de la guía (Skydropx lo deja en un enlace). */
async function bajarPdf(url: string): Promise<Buffer | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 100 && b.length < 15_000_000 ? b : null;
  } catch { return null; }
}

/**
 * Le manda al proveedor la guía del pedido (número + PDF + qué lleva el paquete).
 * Sin `forzar` no repite si ya se envió o está esperando respuesta.
 */
const enCurso = new Set<string>();
export async function enviarGuiaAProveedor(storeId: string, orderId: string, opts: { forzar?: boolean } = {}): Promise<{ estado: string; detalle: string }> {
  // El webhook y el ciclo de despachos pueden llegar a la vez: un solo envío por pedido.
  if (enCurso.has(orderId)) return { estado: 'pendiente', detalle: 'Se está enviando.' };
  enCurso.add(orderId);
  try { return await enviarGuiaInterno(storeId, orderId, opts); } finally { enCurso.delete(orderId); }
}

async function enviarGuiaInterno(storeId: string, orderId: string, opts: { forzar?: boolean }): Promise<{ estado: string; detalle: string }> {
  const o =db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { estado: 'error', detalle: 'Pedido no encontrado.' };
  const p = proveedorPorId(storeId, txt(o.bodega_id));
  if (!p) return { estado: 'error', detalle: 'El envío no salió desde la bodega de un proveedor.' };
  const previo = estadoGuiaProveedor(o);
  if (!opts.forzar && previo && previo.estado !== 'error') return previo;
  if (!p.avisar) { guardarEstado(orderId, 'apagado', 'Este proveedor tiene apagado el aviso por WhatsApp.'); return { estado: 'apagado', detalle: '' }; }
  const guia = txt(o.guia).trim();
  if (!guia) return { estado: 'error', detalle: 'El pedido todavía no tiene guía.' };

  const numDF = `DF-${txt(o.numero)}`;
  const tel = diez(p.telefono);
  const destino = '57' + tel;
  const items = (db.prepare('SELECT qty, nombre FROM order_items WHERE order_id = ?').all(orderId) as { qty: number; nombre: string }[])
    .map((i) => `${i.qty}× ${i.nombre}`).join(', ') || 'ver pedido';
  const { nombreDelPedido } = await import('./nombres.js');
  const cliente = nombreDelPedido(txt(o.lead_id), txt(o.cliente)) || txt(o.cliente) || 'cliente';
  const lugar = [txt(o.ciudad), txt(o.departamento)].filter(Boolean).join(', ');
  const texto = [
    '📦 *Pedido nuevo para despachar*',
    `Pedido: ${numDF}`,
    `Lleva: ${items}`,
    `Para: ${cliente}${lugar ? ` (${lugar})` : ''}`,
    `Transportadora: ${txt(o.transportadora) || 'por confirmar'}`,
    `Guía: ${guia}`,
    '',
    'Imprime la guía (va en el PDF), pégala en el paquete y entrégalo a la transportadora. ¡Gracias! 🙌',
  ].join('\n');

  const { sendWhatsappMedia, sendWhatsappText, sendWhatsappTemplate } = await import('./wa.js');
  const pdf = await bajarPdf(txt(o.guia_url));
  const envio = pdf
    ? await sendWhatsappMedia(storeId, destino, { buffer: pdf, mime: 'application/pdf', tipo: 'document' }, texto, `Guia-${numDF}.pdf`, destino)
    : await sendWhatsappText(storeId, destino, texto + (txt(o.guia_url) ? `\n\nGuía en PDF: ${txt(o.guia_url)}` : ''), destino);

  if (envio.ok) {
    guardarEstado(orderId, 'enviada', pdf ? 'Con el PDF de la guía.' : 'Sin PDF (solo el número de guía).');
    guardarEnChat(storeId, tel, texto, pdf, numDF);
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: `Guía enviada al proveedor ${p.nombre} por WhatsApp` });
    return { estado: 'enviada', detalle: '' };
  }
  if (!envio.bloqueadoVentana) {
    guardarEstado(orderId, 'error', envio.error || 'WhatsApp no aceptó el mensaje.');
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: `No se pudo enviar la guía al proveedor ${p.nombre}`, detalle: envio.error });
    return { estado: 'error', detalle: envio.error || '' };
  }

  // El proveedor no ha escrito en 24 h: plantilla para que responda (una cada 3 h como máximo).
  const { plantillaAprobadaDealflow } = await import('./avisoGuia.js');
  const tpl = plantillaAprobadaDealflow(storeId, PLANTILLA_PROVEEDOR);
  if (!tpl) {
    const d = `El proveedor no ha escrito en las últimas 24 h y la plantilla "${PLANTILLA_PROVEEDOR}" aún no está aprobada. Pídele que le escriba al WhatsApp de la tienda y la guía le llega sola.`;
    guardarEstado(orderId, 'pendiente', d);
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: `Guía para ${p.nombre} en espera`, detalle: d });
    return { estado: 'pendiente', detalle: d };
  }
  const fila = db.prepare('SELECT invitado_at FROM bodegas_proveedor WHERE id = ?').get(p.id) as { invitado_at: string } | undefined;
  const hace = Date.now() - (Date.parse(txt(fila?.invitado_at)) || 0);
  if (hace > 3 * 3600_000) {
    const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || 'la tienda';
    const r = await sendWhatsappTemplate(storeId, destino, tpl, [p.nombre.split(' ')[0] || p.nombre, tienda], destino);
    if (!r.ok) {
      guardarEstado(orderId, 'error', r.error || 'Meta rechazó la plantilla.');
      return { estado: 'error', detalle: r.error || '' };
    }
    db.prepare('UPDATE bodegas_proveedor SET invitado_at = ? WHERE id = ?').run(new Date().toISOString(), p.id);
  }
  const d = 'Le escribimos al proveedor para que responda; apenas lo haga le llega la guía.';
  guardarEstado(orderId, 'pendiente', d);
  trazar(storeId, orderId, { etapa: 'despacho', nivel: 'info', titulo: `Guía para ${p.nombre}: esperando que responda en WhatsApp` });
  registrarLog(storeId, 'info', 'despacho', `${numDF}: la guía queda pendiente hasta que el proveedor ${p.nombre} responda en WhatsApp.`);
  return { estado: 'pendiente', detalle: d };
}

/** Deja el mensaje en el chat del proveedor (si existe) para verlo en el Inbox. */
function guardarEnChat(storeId: string, tel: string, texto: string, pdf: Buffer | null, numDF: string): void {
  try {
    const lead = leadDeNumero(storeId, tel);
    if (!lead) return;
    let url: string | null = null;
    if (pdf) {
      url = saveOutgoingMedia(storeId, `data:application/pdf;base64,${pdf.toString('base64')}`, `Guia-${numDF}.pdf`)?.url || null;
    }
    db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre, estado) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(uid(), lead, 'bot', texto, url ? 'document' : 'texto', url, url ? 'application/pdf' : null, url ? `Guia-${numDF}` : null, 'enviado');
  } catch { /* opcional */ }
}
