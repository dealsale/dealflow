import { readFileSync, existsSync } from 'node:fs';
import { trazar } from './trazabilidad.js';
import { db, registrarLog, uid } from './db.js';
import { sendWhatsappMedia, sendWhatsappTemplate, sendWhatsappText } from './wa.js';
import { mediaPath } from './media.js';
import { nombreTransportadora } from './transportadoras.js';
import { idiomaDe, avisoGuia as avisoGuiaTexto } from './idioma.js';

/**
 * Aviso de la guía al cliente, por dos vías:
 *  1. Al CHAT donde compró (texto, o imagen de la guía si está subida). Si la
 *     ventana de 24 h de WhatsApp está cerrada, va con la plantilla aprobada.
 *  2. Si el cliente dejó un CELULAR DE CONTACTO distinto al del chat, a ese número
 *     le llega la plantilla aprobada `guia_envio_pedido` (es un número que nunca
 *     nos ha escrito: solo se le puede iniciar conversación con plantilla).
 */

export const PLANTILLA_GUIA = 'guia_envio_pedido';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const diez = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d; };

/** Plantilla aprobada para la tienda (o null). */
function plantillaAprobada(storeId: string, nombre: string): { nombre: string; idioma: string; encabezado: string; cuerpo: string } | null {
  const t = db.prepare(
    `SELECT t.nombre, t.idioma, t.encabezado, t.cuerpo FROM meta_template_pub p JOIN meta_templates t ON t.id = p.template_id
      WHERE p.store_id = ? AND t.nombre = ? AND p.estado = 'aprobada'`,
  ).get(storeId, nombre) as { nombre: string; idioma: string; encabezado: string; cuerpo: string } | undefined;
  return t || null;
}

/** El chat del que salió el pedido: por lead_id y, si no, por el teléfono del pedido. */
function chatDelPedido(storeId: string, o: Fila): { id: string; tel: string; wa_id: string } | undefined {
  if (txt(o.lead_id)) {
    const l = db.prepare('SELECT id, tel, wa_id FROM leads WHERE id = ? AND store_id = ?').get(txt(o.lead_id), storeId) as { id: string; tel: string; wa_id: string } | undefined;
    if (l) return l;
  }
  const t = diez(txt(o.tel));
  if (t.length < 7) return undefined;
  return db.prepare(`SELECT id, tel, wa_id FROM leads WHERE store_id = ? AND REPLACE(REPLACE(REPLACE(tel,' ',''),'+',''),'-','') LIKE ? ORDER BY created_at DESC LIMIT 1`)
    .get(storeId, `%${t}`) as { id: string; tel: string; wa_id: string } | undefined;
}

export interface ResultadoAviso { chat: 'enviado' | 'plantilla' | 'bloqueado' | 'error' | 'sin_chat'; contacto: 'plantilla' | 'mismo' | 'sin_plantilla' | 'error' | 'no_aplica'; con: 'image' | 'document' | 'texto'; detalle: string[] }

export async function avisarGuia(storeId: string, orderId: string, opts: { conArchivo?: boolean } = {}): Promise<ResultadoAviso> {
  const r = await avisarGuiaInterno(storeId, orderId, opts);
  const fallo = r.chat === 'error' || r.contacto === 'error' || (r.chat === 'sin_chat' && r.contacto !== 'plantilla');
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
  const tpl = plantillaAprobada(storeId, PLANTILLA_GUIA);

  // ── 1. Al chat ──
  const chat = chatDelPedido(storeId, o);
  if (chat) {
    const destino = chat.wa_id || chat.tel;
    let archivo = '';
    if (opts.conArchivo !== false) {
      const img = txt(o.guia_img); const url = txt(o.guia_url);
      archivo = img || (url.startsWith('/api/media/') ? url : '');
    }
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
      res.chat = 'enviado'; res.con = tipo;
      db.prepare('INSERT INTO messages (id, lead_id, de, texto, tipo, media_url, media_mime, media_nombre, estado) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(uid(), chat.id, 'bot', texto, tipo, tipo === 'texto' ? null : archivo, mime, tipo === 'texto' ? null : `Guia-${numDF}`, 'enviado');
    } else if (envio.bloqueadoVentana && tpl) {
      // Ventana cerrada: le llega la plantilla al chat.
      const r = await sendWhatsappTemplate(storeId, destino, tpl, params, chat.tel);
      if (r.ok) {
        res.chat = 'plantilla';
        db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado) VALUES (?,?,'bot',?,'enviado')").run(uid(), chat.id, r.textoRender || `[Plantilla: ${PLANTILLA_GUIA}]`);
      } else { res.chat = 'error'; res.detalle.push(`Chat: ${r.error || 'Meta rechazó la plantilla'}`); }
    } else {
      res.chat = envio.bloqueadoVentana ? 'bloqueado' : 'error';
      res.detalle.push(envio.bloqueadoVentana ? `El cliente no escribe hace más de 24 h y la plantilla "${PLANTILLA_GUIA}" no está aprobada.` : `Chat: ${envio.error || 'error'}`);
    }
  }

  // ── 2. Al celular de contacto, si es distinto al del chat ──
  const contacto = diez(txt(o.tel));
  const delChat = chat ? diez(chat.tel) : '';
  if (contacto.length === 10 && contacto !== delChat) {
    if (!tpl) {
      res.contacto = 'sin_plantilla';
      res.detalle.push(`El celular de contacto (${contacto}) es distinto al del chat, pero la plantilla "${PLANTILLA_GUIA}" aún no está aprobada para la tienda.`);
    } else {
      const r = await sendWhatsappTemplate(storeId, '57' + contacto, tpl, params, '57' + contacto);
      if (r.ok) res.contacto = 'plantilla';
      else { res.contacto = 'error'; res.detalle.push(`Contacto ${contacto}: ${r.error || 'Meta rechazó la plantilla'}`); }
    }
  } else if (chat) res.contacto = 'mismo';

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
