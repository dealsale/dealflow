import { readFileSync, existsSync } from 'node:fs';
import { trazar } from './trazabilidad.js';
import { db, registrarLog, uid } from './db.js';
import { sendWhatsappMedia, sendWhatsappTemplate, sendWhatsappText, subirMediaCloud } from './wa.js';
import { mediaPath } from './media.js';
import { nombreTransportadora } from './transportadoras.js';
import { idiomaDe, avisoGuia as avisoGuiaTexto } from './idioma.js';
import { plantillaDeAutomatizacion } from './plantillasWA.js';

/**
 * Aviso de la guía al cliente, por dos vías:
 *  1. Al CHAT donde compró (texto, o imagen de la guía si está subida). Si la
 *     ventana de 24 h de WhatsApp está cerrada, va con la plantilla aprobada.
 *  2. Si el cliente dejó un CELULAR DE CONTACTO distinto al del chat, a ese número
 *     le llega la plantilla aprobada `guia_envio_pedido` (es un número que nunca
 *     nos ha escrito: solo se le puede iniciar conversación con plantilla).
 */

export const PLANTILLA_GUIA = 'guia_envio_pedido';
/** La misma plantilla, con la FOTO de la guía en el encabezado (para clientes fuera de la ventana de 24 h). */
export const PLANTILLA_GUIA_IMG = 'guia_envio_imagen';
try { db.exec("ALTER TABLE orders ADD COLUMN guia_aviso TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const diez = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d; };

/** Plantilla aprobada para la tienda (o null). */
export function plantillaAprobada(storeId: string, nombre: string): { nombre: string; idioma: string; encabezado: string; cuerpo: string; auto?: { clave: string; maestra: string } } | null {
  // La tienda eligió su propia plantilla para esta automatización (y sigue aprobada como Utilidad).
  const propia = plantillaDeAutomatizacion(storeId, nombre);
  if (propia) return propia;
  const t = db.prepare(
    `SELECT t.nombre, t.idioma, t.encabezado, t.cuerpo FROM meta_template_pub p JOIN meta_templates t ON t.id = p.template_id
      WHERE p.store_id = ? AND t.nombre = ? AND p.estado = 'aprobada'`,
  ).get(storeId, nombre) as { nombre: string; idioma: string; encabezado: string; cuerpo: string } | undefined;
  return t || null;
}

/** Solo la plantilla de DealFlow (sin la propia de la tienda). */
export function plantillaAprobadaDealflow(storeId: string, nombre: string): { nombre: string; idioma: string; encabezado: string; cuerpo: string } | null {
  const t = db.prepare(
    `SELECT t.nombre, t.idioma, t.encabezado, t.cuerpo FROM meta_template_pub p JOIN meta_templates t ON t.id = p.template_id
      WHERE p.store_id = ? AND t.nombre = ? AND p.estado = 'aprobada'`,
  ).get(storeId, nombre) as { nombre: string; idioma: string; encabezado: string; cuerpo: string } | undefined;
  return t || null;
}

/** El chat del que salió el pedido: por lead_id y, si no, por el teléfono del pedido. */
export function chatDelPedido(storeId: string, o: Fila): { id: string; tel: string; wa_id: string } | undefined {
  if (txt(o.lead_id)) {
    const l = db.prepare('SELECT id, tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(txt(o.lead_id), storeId) as { id: string; tel: string; wa_id: string } | undefined;
    if (l) return l;
  }
  const t = diez(txt(o.tel));
  if (t.length < 7) return undefined;
  return db.prepare(`SELECT id, tel, wa_id FROM leads WHERE store_id = ? AND REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ? ORDER BY created_at DESC LIMIT 1`)
    .get(storeId, `%${t}`) as { id: string; tel: string; wa_id: string } | undefined;
}

/** Baja la guía (PDF o imagen) de un enlace externo, la guarda como imagen y la deja en el pedido. */
async function bajarGuiaRemota(storeId: string, o: Fila, url: string): Promise<string> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || '';
    const { guardarArchivo, pdfAPng, guiaAcostada } = await import('./media.js');
    // Interrapidísimo: su etiqueta viene acostada → se endereza (también en el aviso automático).
    const png = ct.includes('pdf') || /\.pdf(\?|$)/i.test(url) ? pdfAPng(buf, { enderezar: guiaAcostada({ ...o, guia_url: url }) }) : /image\//.test(ct) ? buf : null;
    if (!png) return '';
    const img = guardarArchivo(storeId, `guia-DF${txt(o.numero)}-${uid().slice(0, 6)}.png`, png);
    db.prepare('UPDATE orders SET guia_img = ? WHERE id = ?').run(img, txt(o.id));
    return img;
  } catch { return ''; }
}

/** Imagen de la guía (png/jpg) en disco; si solo hay el PDF remoto, se baja y se convierte. */
async function imagenGuia(storeId: string, o: Fila): Promise<{ archivo: string; ruta: string } | null> {
  let img = txt(o.guia_img); const url = txt(o.guia_url);
  if (!img && /^https?:\/\//.test(url)) img = await bajarGuiaRemota(storeId, o, url);
  const archivo = img || (url.startsWith('/api/media/') ? url : '');
  if (!archivo) return null;
  const ruta = mediaPath(storeId, archivo.split('/').pop()!);
  return existsSync(ruta) ? { archivo, ruta } : null;
}
const esImagenJpgPng = (archivo: string) => /\.(png|jpe?g)$/i.test(archivo);

/**
 * Plantilla de la guía. Si la tienda tiene aprobada la versión CON IMAGEN y hay foto de la
 * guía, va la foto en el encabezado; si no, la de solo texto.
 */
export async function enviarPlantillaGuia(storeId: string, destino: string, pn: string, params: string[], img: { archivo: string; ruta: string } | null, guiaUrl = ''):
  Promise<{ ok: boolean; error?: string; wamid?: string; textoRender?: string; conImagen: boolean }> {
  // Plantilla propia de la tienda para la guía: sus datos y su encabezado (PDF/foto de la guía) se arman al enviar.
  const propia = plantillaAprobada(storeId, PLANTILLA_GUIA);
  if (propia?.auto) {
    const r = await sendWhatsappTemplate(storeId, destino, { ...propia, adjuntoGuia: { ruta: img?.ruta, archivo: img?.archivo, url: guiaUrl } }, params, pn);
    if (r.ok || r.repetido) return { ...r, conImagen: false };
    registrarLog(storeId, 'warn', 'envio', `La plantilla propia de la guía falló (${r.error || 'error'}): se envía la de DealFlow.`);
  }
  const tplImg = plantillaAprobadaDealflow(storeId, PLANTILLA_GUIA_IMG);
  if (tplImg && img && esImagenJpgPng(img.archivo)) {
    const mime = /\.png$/i.test(img.archivo) ? 'image/png' : 'image/jpeg';
    const up = await subirMediaCloud(storeId, readFileSync(img.ruta), mime, `guia.${mime === 'image/png' ? 'png' : 'jpg'}`);
    if ('id' in up) {
      const r = await sendWhatsappTemplate(storeId, destino, { ...tplImg, componentes: [
        { type: 'header', parameters: [{ type: 'image', image: { id: up.id } }] },
        { type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) },
      ] }, params, pn);
      if (r.ok) return { ...r, conImagen: true };
      registrarLog(storeId, 'warn', 'envio', `La plantilla con la foto de la guía falló (${r.error || 'error'}): se envía la de texto.`);
    }
  }
  const tpl = plantillaAprobadaDealflow(storeId, PLANTILLA_GUIA);
  if (!tpl) return { ok: false, error: propia?.auto ? 'la plantilla propia de la guía falló y la de DealFlow no está aprobada' : `la plantilla "${PLANTILLA_GUIA}" no está aprobada`, conImagen: false };
  return { ...(await sendWhatsappTemplate(storeId, destino, tpl, params, pn)), conImagen: false };
}

export interface ResultadoAviso { chat: 'enviado' | 'plantilla' | 'bloqueado' | 'error' | 'sin_chat'; contacto: 'plantilla' | 'mismo' | 'sin_plantilla' | 'error' | 'no_aplica'; con: 'image' | 'document' | 'texto'; detalle: string[]; wamid?: string; wamidC?: string; modo?: string }

export async function avisarGuia(storeId: string, orderId: string, opts: { conArchivo?: boolean } = {}): Promise<ResultadoAviso> {
  const r = await avisarGuiaInterno(storeId, orderId, opts);
  const fallo = r.chat === 'error' || r.contacto === 'error' || (r.chat === 'sin_chat' && r.contacto !== 'plantilla');
  // Resultado visible en el pedido ("¿le llegó la guía al cliente?").
  try {
    const ok = r.chat === 'enviado' || r.chat === 'plantilla' || r.contacto === 'plantilla';
    // wamid: con él, WhatsApp nos dice después si de verdad se ENTREGÓ o si falló (ver estadoAvisoGuia).
    db.prepare('UPDATE orders SET guia_aviso = ? WHERE id = ?').run(JSON.stringify({ ok, chat: r.chat, contacto: r.contacto, con: r.con, detalle: r.detalle.join(' ').slice(0, 400), at: new Date().toISOString(),
      wamid: r.wamid || '', wamidC: r.wamidC || '', entrega: ok ? 'enviado' : '', entregaC: r.contacto === 'plantilla' ? 'enviado' : '', modo: r.modo || '' }), orderId);
  } catch { /* opcional */ }
  trazar(storeId, orderId, { etapa: 'aviso', nivel: fallo ? 'warn' : 'ok', titulo: `Aviso de guía al cliente: chat ${r.chat}${r.contacto !== 'no_aplica' ? ` · contacto ${r.contacto}` : ''}`, detalle: r.detalle.join(' ') });
  return r;
}

async function avisarGuiaInterno(storeId: string, orderId: string, opts: { conArchivo?: boolean } = {}): Promise<ResultadoAviso> {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  const res: ResultadoAviso = { chat: 'sin_chat', contacto: 'no_aplica', con: 'texto', detalle: [] };
  if (!o) { res.detalle.push('Pedido no encontrado.'); return res; }
  const guia = txt(o.guia).trim();
  if (!guia) { res.detalle.push('El pedido no tiene guía.'); return res; }
  const numDF = `DF-${txt(o.numero)}`;
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || 'nuestra tienda';
  const nombre = txt(o.cliente).trim().split(' ')[0] || 'cliente';
  // Solo el nombre real de la transportadora (nada de "envío", "flete" ni "Effi").
  const crudoT = txt(o.transportadora).trim() && !(txt(o.transportadora) === 'Dropi' && txt(o.despacho_proveedor) !== 'dropi') ? txt(o.transportadora) : '';
  const transp = nombreTransportadora(crudoT) || 'por confirmar';
  // Texto según lo que se manda: con la imagen/PDF de la guía, el mensaje lo presenta.
  const idi = idiomaDe(storeId, txt(o.lead_id) || undefined);
  const datos = { nombre, numDF, guia, transp: transp !== 'por confirmar' ? transp : '', tienda };
  let texto = avisoGuiaTexto(idi, { ...datos, con: 'texto' });
  const params = [nombre, tienda, numDF, transp, guia];
  const tpl = plantillaAprobada(storeId, PLANTILLA_GUIA) || plantillaAprobada(storeId, PLANTILLA_GUIA_IMG);
  // Foto de la guía (para el chat y para la plantilla con imagen).
  const img = opts.conArchivo !== false ? await imagenGuia(storeId, o) : null;

  // ── 1. Al chat ──
  const { calidadCfg, puedeEscribirle, contarProactivo } = await import('./calidad.js');
  const chat = chatDelPedido(storeId, o);
  // Si el cliente pidió que no le escribamos, no le mandamos la guía por WhatsApp.
  const bajaChat = chat ? !puedeEscribirle(storeId, chat.tel, chat.id).ok && !!(db.prepare('SELECT no_contactar FROM leads WHERE id = ?').get(chat.id) as { no_contactar: number } | undefined)?.no_contactar : false;
  if (bajaChat) res.detalle.push('El cliente pidió que no le escribamos: no se le envió la guía por WhatsApp.');
  if (chat && !bajaChat) {
    const destino = chat.wa_id || chat.tel;
    const archivo = img?.archivo || '';
    let envio: { ok: boolean; error?: string; bloqueadoVentana?: boolean; wamid?: string };
    let tipo: 'image' | 'document' | 'texto' = 'texto'; let mime: string | null = null;
    const ruta = archivo ? mediaPath(storeId, archivo.split('/').pop()!) : '';
    if (archivo && existsSync(ruta)) {
      const esImg = !/\.pdf$/i.test(archivo);
      mime = esImg ? (archivo.endsWith('.png') ? 'image/png' : archivo.endsWith('.webp') ? 'image/webp' : 'image/jpeg') : 'application/pdf';
      tipo = esImg ? 'image' : 'document';
      texto = avisoGuiaTexto(idi, { ...datos, con: esImg ? 'image' : 'document' });
      envio = await sendWhatsappMedia(storeId, destino, { buffer: readFileSync(ruta), mime, tipo }, texto, `Guia-${numDF}.${esImg ? (mime === 'image/png' ? 'png' : 'jpg') : 'pdf'}`, chat.tel);
    } else {
      envio = await sendWhatsappText(storeId, destino, texto, chat.tel);
    }
    if (envio.ok) {
      contarProactivo(storeId, chat.tel, 'guia');
      res.chat = 'enviado'; res.con = tipo; res.wamid = envio.wamid || '';
      db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre, estado, wa_msg_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(uid(), chat.id, 'bot', texto, tipo, tipo === 'texto' ? null : archivo, mime, tipo === 'texto' ? null : `Guia-${numDF}`, 'enviado', envio.wamid || null);
    } else if (envio.bloqueadoVentana && tpl) {
      // Ventana cerrada: le llega la plantilla al chat (con la foto de la guía si esa plantilla está aprobada).
      const r = await enviarPlantillaGuia(storeId, destino, chat.tel, params, img, txt(o.guia_url));
      if (r.ok) {
        res.chat = 'plantilla'; res.wamid = r.wamid || ''; if (r.conImagen) res.con = 'image';
        db.prepare("INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre, estado, wa_msg_id) VALUES (?,?,'bot',?,?,?,?,?,'enviado',?)")
          .run(uid(), chat.id, r.textoRender || `[Plantilla: ${PLANTILLA_GUIA}]`, r.conImagen ? 'image' : 'texto', r.conImagen ? img!.archivo : null, r.conImagen ? (/\.png$/i.test(img!.archivo) ? 'image/png' : 'image/jpeg') : null, r.conImagen ? `Guia-${numDF}` : null, r.wamid || null);
      } else { res.chat = 'error'; res.detalle.push(`Chat: ${r.error || 'Meta rechazó la plantilla'}`); }
    } else {
      res.chat = envio.bloqueadoVentana ? 'bloqueado' : 'error';
      res.detalle.push(envio.bloqueadoVentana ? `El cliente no escribe hace más de 24 h y la plantilla "${PLANTILLA_GUIA}" no está aprobada.` : `Chat: ${envio.error || 'error'}`);
    }
  }

  // ── 2. Al celular de contacto, si es distinto al del chat ──
  const contacto = diez(txt(o.tel));
  const delChat = chat ? diez(chat.tel) : '';
  // Sin chat (pedido de la landing, Shopify…) el celular del pedido ES el cliente: se le escribe con plantilla.
  // Con chat, un celular distinto es "otro número" y solo se le escribe si la tienda lo activó.
  if (contacto.length === 10 && chat && contacto !== delChat && !calidadCfg(storeId).avisarContacto) {
    // Mensaje en frío a un número que nunca escribió: es lo que más reportes de spam genera.
    res.contacto = 'no_aplica';
    res.detalle.push(`El celular de contacto (${contacto}) es otro número: no se le escribe para cuidar la calidad del WhatsApp (actívalo en WhatsApp → Calidad si lo necesitas).`);
  } else if (contacto.length === 10 && contacto !== delChat) {
    if (!tpl) {
      res.contacto = 'sin_plantilla';
      res.detalle.push(`El celular de contacto (${contacto}) es distinto al del chat, pero la plantilla "${PLANTILLA_GUIA}" aún no está aprobada para la tienda.`);
    } else {
      const r = await enviarPlantillaGuia(storeId, '57' + contacto, '57' + contacto, params, img, txt(o.guia_url));
      if (r.ok) { res.contacto = 'plantilla'; res.wamidC = r.wamid || ''; if (r.conImagen && res.chat === 'sin_chat') res.con = 'image'; }
      else { res.contacto = 'error'; res.detalle.push(`Contacto ${contacto}: ${r.error || 'Meta rechazó la plantilla'}`); }
    }
  } else if (chat) res.contacto = 'mismo';

  res.modo = (db.prepare('SELECT modo FROM whatsapp WHERE store_id = ?').get(storeId) as { modo: string } | undefined)?.modo || '';
  const ok = res.chat === 'enviado' || res.chat === 'plantilla' || res.contacto === 'plantilla';
  if (ok) db.prepare('UPDATE orders SET guia_avisada = 1 WHERE id = ?').run(orderId);
  const partes = [
    res.chat === 'enviado' ? `al chat${res.con !== 'texto' ? ` (con ${res.con === 'image' ? 'imagen' : 'PDF'})` : ''}` : res.chat === 'plantilla' ? 'al chat con plantilla' : '',
    res.contacto === 'plantilla' ? `al contacto ${contacto} con plantilla` : '',
  ].filter(Boolean);
  registrarLog(storeId, ok ? 'info' : 'warn', 'despacho', ok
    ? `Guía de ${numDF} (${guia}) avisada ${partes.join(' y ')}.${res.detalle.length ? ' ' + res.detalle.join(' ') : ''}`
    : `No se pudo avisar la guía de ${numDF}: ${res.detalle.join(' ') || 'sin chat ni contacto'}`);
  return res;
}

/**
 * WhatsApp avisa después si el mensaje de la guía se entregó, se leyó o FALLÓ (Meta acepta
 * el envío y luego puede no entregarlo: ventana de 24 h vencida, número sin WhatsApp, imagen
 * que no pudo bajar…). Se actualiza el pedido y, si falló, se reintenta UNA vez: con la
 * plantilla aprobada (o en texto, sin imagen, si la ventana sigue abierta).
 */
export async function estadoAvisoGuia(wamid: string, estado: 'entregado' | 'visto' | 'enviado' | 'fallido', motivo = ''): Promise<void> {
  if (!wamid || estado === 'enviado') return;
  const o = db.prepare(`SELECT id, store_id, numero, guia_aviso FROM orders WHERE guia_aviso LIKE ? AND created_at > datetime('now','-60 days') LIMIT 1`).get(`%${wamid}%`) as { id: string; store_id: string; numero: number; guia_aviso: string } | undefined;
  if (!o) return;
  let av: Record<string, unknown> = {};
  try { av = JSON.parse(o.guia_aviso || '{}'); } catch { return; }
  const campo = av.wamid === wamid ? 'entrega' : av.wamidC === wamid ? 'entregaC' : '';
  if (!campo) return;
  const rank: Record<string, number> = { '': 0, enviado: 1, entregado: 2, visto: 3 };
  if (estado !== 'fallido' && (av[campo] === 'fallido' || (rank[estado] || 0) <= (rank[String(av[campo] || '')] || 0))) return;
  av[campo] = estado;
  const guardar = () => db.prepare('UPDATE orders SET guia_aviso = ? WHERE id = ?').run(JSON.stringify(av), o.id);
  if (estado !== 'fallido') { guardar(); return; }

  const via = campo === 'entrega' ? 'al chat' : 'al celular de contacto';
  av[campo === 'entrega' ? 'falloChat' : 'falloContacto'] = motivo.slice(0, 300);
  const otraOk = campo === 'entrega' ? av.entregaC && av.entregaC !== 'fallido' : av.entrega && av.entrega !== 'fallido';
  av.ok = !!otraOk;
  guardar();
  trazar(o.store_id, o.id, { etapa: 'aviso', nivel: 'warn', titulo: `WhatsApp NO entregó la guía ${via}`, detalle: motivo || 'Meta no dio el motivo.' });
  registrarLog(o.store_id, 'warn', 'despacho', `DF-${o.numero}: WhatsApp no entregó la guía ${via}. ${motivo}`);
  if (av.reintento || campo !== 'entrega') { if (!av.ok) db.prepare('UPDATE orders SET guia_avisada = 0 WHERE id = ?').run(o.id); return; }

  // Un reintento al chat: si se mandó suelto (imagen/texto), ahora con la plantilla aprobada.
  av.reintento = true; guardar();
  const ord = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id) as Fila;
  const chat = chatDelPedido(o.store_id, ord);
  const tpl = plantillaAprobada(o.store_id, PLANTILLA_GUIA) || plantillaAprobada(o.store_id, PLANTILLA_GUIA_IMG);
  if (!chat || /número no tiene whatsapp|no tiene whatsapp|131026/i.test(motivo)) { if (!av.ok) db.prepare('UPDATE orders SET guia_avisada = 0 WHERE id = ?').run(o.id); return; }
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(o.store_id) as { nombre: string } | undefined)?.nombre || 'nuestra tienda';
  const nombre = txt(ord.cliente).trim().split(' ')[0] || 'cliente';
  const guia = txt(ord.guia).trim();
  const transp = nombreTransportadora(txt(ord.transportadora)) || 'por confirmar';
  let r: { ok: boolean; error?: string; wamid?: string; textoRender?: string } = { ok: false, error: `no hay otra forma de reenviarla (la plantilla "${PLANTILLA_GUIA}" no está aprobada)` };
  if (av.chat !== 'plantilla' && tpl) r = await enviarPlantillaGuia(o.store_id, chat.wa_id || chat.tel, chat.tel, [nombre, tienda, `DF-${o.numero}`, transp, guia], /131053/.test(motivo) ? null : await imagenGuia(o.store_id, ord), txt(ord.guia_url));
  else if (av.con !== 'texto') {
    const idi = idiomaDe(o.store_id, txt(ord.lead_id) || undefined);
    r = await sendWhatsappText(o.store_id, chat.wa_id || chat.tel, avisoGuiaTexto(idi, { nombre, numDF: `DF-${o.numero}`, guia, transp: transp !== 'por confirmar' ? transp : '', tienda, con: 'texto' }), chat.tel);
  }
  if (r.ok) {
    av.wamid = r.wamid || ''; av.entrega = 'enviado'; av.ok = true; av.chat = av.chat !== 'plantilla' && tpl ? 'plantilla' : 'enviado'; av.con = 'texto';
    av.detalle = `Reenviada ${av.chat === 'plantilla' ? 'con la plantilla aprobada' : 'en texto'} porque WhatsApp no entregó el primer mensaje (${motivo || 'sin motivo'}).`.slice(0, 400);
    db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado, wa_msg_id) VALUES (?,?,'bot',?,'enviado',?)").run(uid(), chat.id, r.textoRender || `Guía ${guia} (DF-${o.numero})`, r.wamid || null);
    db.prepare('UPDATE orders SET guia_avisada = 1 WHERE id = ?').run(o.id);
    trazar(o.store_id, o.id, { etapa: 'aviso', nivel: 'ok', titulo: 'Guía reenviada al cliente', detalle: String(av.detalle) });
  } else {
    av.detalle = `WhatsApp no entregó la guía (${motivo || 'sin motivo'}) y el reintento falló: ${r.error || 'error'}.`.slice(0, 400);
    if (!av.ok) db.prepare('UPDATE orders SET guia_avisada = 0 WHERE id = ?').run(o.id);
  }
  guardar();
}

/**
 * La guía se avisó en TEXTO porque todavía no había imagen (Dropi/Effi a veces dan el número
 * antes que el PDF). Cuando llega la imagen, se le manda al chat del cliente (solo si la
 * ventana de 24 h está abierta: no se le manda otra plantilla). Una sola vez.
 */
export async function enviarImagenGuiaLuego(storeId: string, orderId: string): Promise<boolean> {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return false;
  let av: Record<string, unknown> = {};
  try { av = JSON.parse(txt(o.guia_aviso) || '{}'); } catch { return false; }
  if (!av.ok || av.con !== 'texto' || av.imagenLuego || Date.now() - new Date(txt(av.at)).getTime() > 48 * 3600e3) return false;
  const img = await imagenGuia(storeId, o);
  if (!img) return false;
  av.imagenLuego = true;
  db.prepare('UPDATE orders SET guia_aviso = ? WHERE id = ?').run(JSON.stringify(av), orderId);
  const chat = chatDelPedido(storeId, o);
  if (!chat) return false;
  const esImg = !/\.pdf$/i.test(img.archivo);
  const mime = esImg ? (/\.png$/i.test(img.archivo) ? 'image/png' : 'image/jpeg') : 'application/pdf';
  const caption = `📄 Aquí está la imagen de tu guía ${txt(o.guia)} (pedido DF-${txt(o.numero)}).`;
  const r = await sendWhatsappMedia(storeId, chat.wa_id || chat.tel, { buffer: readFileSync(img.ruta), mime, tipo: esImg ? 'image' : 'document' }, caption, `Guia-DF-${txt(o.numero)}.${esImg ? (mime === 'image/png' ? 'png' : 'jpg') : 'pdf'}`, chat.tel);
  if (!r.ok) return false;
  db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre, estado, wa_msg_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(uid(), chat.id, 'bot', caption, esImg ? 'image' : 'document', img.archivo, mime, `Guia-DF-${txt(o.numero)}`, 'enviado', r.wamid || null);
  av.con = esImg ? 'image' : 'document';
  db.prepare('UPDATE orders SET guia_aviso = ? WHERE id = ?').run(JSON.stringify(av), orderId);
  trazar(storeId, orderId, { etapa: 'aviso', nivel: 'ok', titulo: 'Imagen de la guía enviada al cliente', detalle: 'Llegó después del número de guía.' });
  return true;
}
