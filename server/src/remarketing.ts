/**
 * Remarketing SALIENTE por WhatsApp (sin pauta): mensajes a los leads que ya escribieron.
 *
 *  1. Rescate antes de que cierre la ventana de 24 h (gratis, texto normal): a quien ya dio
 *     sus datos y dejó de responder, ~21 h después de su último mensaje.
 *  2. Recuperación automática (plantilla): a quien tiene el "Resumen de tu pedido" y no
 *     confirmó, 1 día después (y opcionalmente otro a los 3 días) con la plantilla
 *     `recuperar_pedido`. Si responde "Sí", el asistente cierra el pedido con el resumen.
 *  3. Envíos por segmento (los lanza el dueño): datos completos, faltan datos, con intención,
 *     compradores, cancelados → con una plantilla de marketing aprobada.
 *
 * Protecciones (cuidar el número de bloqueos):
 *  - Nunca a quien pidió la baja; tope de 2 mensajes por iniciativa nuestra al día (calidad.ts).
 *  - Máximo 1 mensaje de remarketing por cliente cada 7 días (salvo la secuencia automática).
 *  - Solo de 8 a. m. a 8 p. m. (hora Colombia) y un tope diario por tienda.
 *  - Envío pausado (unos por minuto) y se PAUSA solo si Meta avisa spam o límite.
 *  - Si la ventana de 24 h está abierta va como texto normal (no gasta plantilla).
 */
import { db, uid, pj, registrarLog } from './db.js';
import { sendWhatsappTemplate, sendWhatsappText } from './wa.js';
import { plantillaAprobada } from './avisoGuia.js';
import { puedeEscribirle, contarProactivo, frenoActivo } from './calidad.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const diez = (t: unknown) => String(t ?? '').replace(/\D/g, '').slice(-10);
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
/** Meta no acepta saltos de línea ni muchos espacios en las variables. */
const limpio = (s: string, max = 120) => String(s || '').replace(/[\r\n\t]+/g, ' · ').replace(/ {2,}/g, ' ').trim().slice(0, max) || '-';
const horaCO = () => new Date(Date.now() - 5 * 3600e3).getUTCHours();
const hoyCO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

db.exec(`CREATE TABLE IF NOT EXISTS remarketing_campanas (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, nombre TEXT NOT NULL, segmento TEXT NOT NULL, mensaje TEXT NOT NULL,
  campos TEXT NOT NULL DEFAULT '{}', total INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'enviando',
  motivo TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS remarketing_envios (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, lead_id TEXT NOT NULL, campana_id TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL, mensaje TEXT NOT NULL, params TEXT NOT NULL DEFAULT '[]', estado TEXT NOT NULL DEFAULT 'pendiente',
  motivo TEXT NOT NULL DEFAULT '', via TEXT NOT NULL DEFAULT '', wamid TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT (datetime('now')), enviado_at TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_rmk_envios_store ON remarketing_envios(store_id, estado)');
db.exec('CREATE INDEX IF NOT EXISTS idx_rmk_envios_lead ON remarketing_envios(lead_id)');

// ── Configuración por tienda ────────────────────────────────────────────────
export interface CfgRemarketing { rescate24h: boolean; recuperar: boolean; toques: 1 | 2; topeDiario: number }
export function cfgRemarketing(storeId: string): CfgRemarketing {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'remarketing'").get(storeId) as { config: string } | undefined;
  const c = pj<Record<string, unknown>>(r?.config || '', {});
  return {
    rescate24h: c.rescate24h !== false, // gratis y dentro de la ventana: encendido por defecto
    recuperar: c.recuperar === true, // plantilla (cuesta y necesita aprobación): lo enciende el dueño
    toques: c.toques === 2 ? 2 : 1,
    topeDiario: Math.min(1000, Math.max(10, Number(c.topeDiario) || 150)),
  };
}
export function guardarCfgRemarketing(storeId: string, p: Partial<CfgRemarketing>): CfgRemarketing {
  const nuevo = { ...cfgRemarketing(storeId), ...p };
  db.prepare("INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'remarketing', ?, datetime('now')) ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at").run(storeId, JSON.stringify(nuevo));
  return cfgRemarketing(storeId);
}

// ── Segmentos ───────────────────────────────────────────────────────────────
export type Segmento = 'datos_completos' | 'faltan_datos' | 'interesados' | 'compradores' | 'cancelados';
export const SEGMENTOS: { id: Segmento; titulo: string; ayuda: string }[] = [
  { id: 'datos_completos', titulo: 'Dieron sus datos y no confirmaron', ayuda: 'El asistente les mostró el resumen del pedido y no dijeron que sí.' },
  { id: 'faltan_datos', titulo: 'Empezaron a dar datos', ayuda: 'Dieron parte de los datos de envío y se quedaron a mitad.' },
  { id: 'interesados', titulo: 'Con intención de compra', ayuda: 'Preguntaron precio, talla o envío, pero no siguieron.' },
  { id: 'compradores', titulo: 'Ya compraron', ayuda: 'Recibieron un pedido hace más de 15 días: para que vuelvan a comprar.' },
  { id: 'cancelados', titulo: 'Pedido cancelado', ayuda: 'Tuvieron un pedido cancelado y no volvieron a comprar.' },
];


export interface LeadSegmento {
  id: string; nombre: string; tel: string; destino: string; segmento: Segmento; ultCliente: string; ultimo: string;
  excluido: string; ventanaAbierta: boolean;
}

/** Leads de la tienda con su segmento (y por qué se excluyen, si aplica). */
export function leadsPorSegmento(storeId: string, dias = 60): LeadSegmento[] {
  // Último mensaje y señales del embudo: guardados en el lead (versiones.ts), sin recorrer mensajes.
  const rows = db.prepare(`SELECT l.id, l.nombre, l.tel, l.wa_id, l.canal, l.no_contactar, l.estado_manual,
      l.ult_cliente_at AS ult_cliente, l.ult_at, l.ult_texto, l.f_resumen_at AS resumen_at,
      l.f_pidio AS pidio_datos, l.f_dio AS dio_datos, l.f_intencion AS intencion,
      (SELECT MAX(enviado_at) FROM remarketing_envios r WHERE r.lead_id = l.id AND r.estado = 'enviado') AS ult_rmk
    FROM leads l WHERE l.store_id = ? AND COALESCE(l.canal,'whatsapp') = 'whatsapp'`).all(storeId) as Fila[];
  // Pedidos por chat y por celular.
  const pedidos = new Map<string, { at: string; estado: string }[]>();
  const add = (k: string, v: { at: string; estado: string }) => { if (!k) return; const l = pedidos.get(k) || []; l.push(v); pedidos.set(k, l); };
  for (const o of db.prepare('SELECT lead_id, tel, estado, created_at FROM orders WHERE store_id = ?').all(storeId) as Fila[]) {
    const v = { at: txt(o.created_at), estado: txt(o.estado) };
    add(txt(o.lead_id), v);
    if (diez(o.tel).length === 10) add('t' + diez(o.tel), v);
  }
  const limite = new Date(Date.now() - dias * 86400e3).toISOString().replace('T', ' ').slice(0, 19);
  const hace = (iso: string) => (Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()) / 3600e3;
  const out: LeadSegmento[] = [];
  for (const l of rows) {
    const destino = txt(l.wa_id) || txt(l.tel);
    if (!destino || destino.startsWith('web:') || !l.ult_cliente) continue;
    const ps = [...(pedidos.get(txt(l.id)) || []), ...(diez(l.tel).length === 10 ? pedidos.get('t' + diez(l.tel)) || [] : [])];
    const vivos = ps.filter((p) => p.estado !== 'Cancelado');
    let seg: Segmento | '' = '';
    if (vivos.length) {
      const ult = vivos.sort((a, b) => b.at.localeCompare(a.at))[0];
      if (vivos.some((p) => p.estado === 'Entregado') && hace(ult.at) >= 15 * 24 && !['Nuevo', 'Confirmado', 'Guía generada', 'En tránsito', 'En reparto', 'Novedad'].includes(ult.estado)) seg = 'compradores';
    } else if (ps.length) seg = 'cancelados';
    else if (l.resumen_at) seg = 'datos_completos';
    else if (Number(l.pidio_datos) || Number(l.dio_datos)) seg = 'faltan_datos';
    else if (Number(l.intencion)) seg = 'interesados';
    if (!seg) continue;
    const refFecha = seg === 'compradores' ? (vivos[0]?.at || txt(l.ult_cliente)) : txt(l.ult_cliente);
    if (seg !== 'compradores' && refFecha < limite) continue;
    let excluido = '';
    if (Number(l.no_contactar)) excluido = 'Pidió que no le escribamos';
    else if (txt(l.estado_manual) === 'perdido') excluido = 'Lo marcaste como "No compró"';
    else if (l.ult_rmk && hace(txt(l.ult_rmk)) < 7 * 24) excluido = 'Ya recibió un mensaje de remarketing esta semana';
    else if (hace(txt(l.ult_cliente)) < 2) excluido = 'Está conversando ahora mismo';
    out.push({ id: txt(l.id), nombre: txt(l.nombre), tel: txt(l.tel), destino, segmento: seg, ultCliente: txt(l.ult_cliente), ultimo: txt(l.ult_texto).replace(/\s+/g, ' ').slice(0, 90), excluido, ventanaAbierta: hace(txt(l.ult_cliente)) < 23.5 });
  }
  return out.sort((a, b) => b.ultCliente.localeCompare(a.ultCliente));
}

// ── Datos para personalizar ─────────────────────────────────────────────────
function campoResumen(t: string, etiqueta: string): string {
  const m = t.match(new RegExp('\\*?\\s*' + etiqueta + '[^:*]*:\\*?\\s*([^*\\n]+)', 'i'));
  return m ? m[1].replace(/[*_`]/g, '').replace(/^[^\p{L}\p{N}$#]+/u, '').trim().replace(/[,;]+$/, '') : '';
}
/** Productos y total del último "Resumen de tu pedido" que vio el cliente. */
export function resumenDelLead(leadId: string): { productos: string; total: string } {
  const r = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND de != 'cliente' AND (lower(texto) LIKE '%resumen de tu pedido%' OR lower(texto) LIKE '%order summary%') ORDER BY created_at DESC LIMIT 1").get(leadId) as { texto: string } | undefined;
  if (!r) return { productos: '', total: '' };
  const productos = campoResumen(r.texto, '(?:Producto|Product)');
  const t = (campoResumen(r.texto, 'Total').match(/\d/g) || []).join('');
  return { productos, total: t ? pesos(Number(t)) : '' };
}
/** El producto del que más recientemente se habló en el chat (por nombre del catálogo). */
export function productoDeInteres(storeId: string, leadId: string): string {
  const prods = (db.prepare('SELECT nombre FROM products WHERE store_id = ?').all(storeId) as { nombre: string }[]).map((p) => ({ n: p.nombre, k: norm(p.nombre) })).filter((p) => p.k.length >= 3);
  if (!prods.length) return '';
  const msgs = db.prepare("SELECT texto FROM messages WHERE lead_id = ? AND texto != '' ORDER BY created_at DESC LIMIT 40").all(leadId) as { texto: string }[];
  for (const m of msgs) {
    const t = norm(m.texto);
    const hit = prods.filter((p) => t.includes(p.k)).sort((a, b) => b.k.length - a.k.length)[0];
    if (hit) return hit.n;
  }
  return '';
}

// ── Mensajes (plantilla + texto igual para cuando la ventana está abierta) ───
export interface CampoDueno { id: string; titulo: string; ejemplo: string }
export interface MensajeRmk {
  id: string; plantilla: string; titulo: string; segmentos: Segmento[]; campos: CampoDueno[];
  /** Variables de la plantilla, en orden. */
  params: (storeId: string, l: { id: string; nombre: string }, campos: Record<string, string>) => string[];
  /** Texto normal (ventana abierta): el mismo contenido. */
  texto: (p: string[]) => string;
}
const tiendaDe = (storeId: string) => (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || 'nuestra tienda';
const primer = (n: string) => (String(n || '').trim().split(/\s+/)[0] || '').replace(/[^\p{L}]/gu, '') || 'hola';
export const MENSAJES: MensajeRmk[] = [
  {
    id: 'recuperar_pedido', plantilla: 'recuperar_pedido', titulo: 'Tu pedido quedó a un paso', segmentos: ['datos_completos'], campos: [],
    params: (s, l) => { const r = resumenDelLead(l.id); return [primer(l.nombre), tiendaDe(s), limpio(r.productos || productoDeInteres(s, l.id) || 'tu pedido'), limpio(r.total || 'el valor que te indicamos')]; },
    texto: (p) => `Hola ${p[0]} 👋 Te escribimos de ${p[1]}.\nTu pedido quedó a un paso: ${p[2]} por ${p[3]}.\n\n¿Te lo enviamos? Responde *Sí* y lo despachamos hoy mismo 🚚`,
  },
  {
    id: 'seguimos_disponible', plantilla: 'seguimos_disponible', titulo: 'Todavía lo tenemos disponible', segmentos: ['faltan_datos', 'interesados', 'datos_completos', 'cancelados'], campos: [],
    params: (s, l) => [primer(l.nombre), tiendaDe(s), limpio(productoDeInteres(s, l.id) || 'el producto que te gustó')],
    texto: (p) => `Hola ${p[0]} 👋 Te escribimos de ${p[1]}.\nHace unos días nos preguntaste por ${p[2]} y todavía lo tenemos disponible.\n\n¿Quieres que te lo apartemos? Responde por aquí y te ayudamos a terminar tu pedido 🛍️`,
  },
  {
    id: 'volver_a_comprar', plantilla: 'volver_a_comprar', titulo: 'Gracias por tu compra + novedad', segmentos: ['compradores'],
    campos: [{ id: 'novedad', titulo: 'Qué les quieres contar', ejemplo: 'Llegó la colección nueva y tienes 10% de descuento esta semana' }],
    params: (s, l, c) => [primer(l.nombre), tiendaDe(s), limpio(c.novedad || '', 200)],
    texto: (p) => `Hola ${p[0]} 👋 Te escribimos de ${p[1]}.\nGracias por tu compra anterior 💜 ${p[2]}.\n\n¿Quieres que te mostremos? Responde por aquí.`,
  },
  {
    id: 'promo_tiempo_limitado', plantilla: 'promo_tiempo_limitado', titulo: 'Promoción por tiempo limitado', segmentos: ['datos_completos', 'faltan_datos', 'interesados', 'compradores', 'cancelados'],
    campos: [{ id: 'promo', titulo: 'La promoción', ejemplo: '20% en toda la tienda' }, { id: 'hasta', titulo: 'Hasta cuándo', ejemplo: 'hoy a medianoche' }],
    params: (_s, l, c) => [primer(l.nombre), limpio(c.promo || ''), limpio(c.hasta || '')],
    texto: (p) => `¡Hola ${p[0]}! Solo por hoy: ${p[1]} 🛍️\nAprovecha antes de que termine ${p[2]}.\nResponde por aquí y te ayudamos a elegir tu talla y color.`,
  },
];
export const mensajeRmk = (id: string) => MENSAJES.find((m) => m.id === id);

// ── Cola y envío ────────────────────────────────────────────────────────────
const MOTIVOS_PAUSA = /131048|131049|130429|131056|spam|limit|restringid|bloquead/i;

function encolar(storeId: string, leadId: string, tipo: string, mensaje: string, params: string[], campanaId = '') {
  db.prepare('INSERT INTO remarketing_envios (id, store_id, lead_id, campana_id, tipo, mensaje, params) VALUES (?,?,?,?,?,?,?)').run(uid(), storeId, leadId, campanaId, tipo, mensaje, JSON.stringify(params));
}

/** Lanza un envío a un segmento. Devuelve cuántos quedaron en cola y cuántos se excluyeron. */
export function crearCampana(storeId: string, d: { segmento: Segmento; mensaje: string; campos: Record<string, string>; dias: number; limite: number; nombre?: string }): { id: string; encolados: number; excluidos: number } | { error: string } {
  const m = mensajeRmk(d.mensaje);
  if (!m) return { error: 'Mensaje no válido.' };
  if (!m.segmentos.includes(d.segmento)) return { error: 'Ese mensaje no aplica a ese grupo de clientes.' };
  for (const c of m.campos) if (!String(d.campos[c.id] || '').trim()) return { error: `Escribe: ${c.titulo.toLowerCase()}.` };
  const modo = (db.prepare('SELECT modo, conectado FROM whatsapp WHERE store_id = ?').get(storeId) as { modo: string; conectado: number } | undefined);
  if (!modo?.conectado) return { error: 'Conecta WhatsApp primero.' };
  if (modo.modo === 'qr') return { error: 'Los envíos salientes necesitan la conexión oficial de WhatsApp (por QR no se pueden usar plantillas y el riesgo de bloqueo es muy alto).' };
  const leads = leadsPorSegmento(storeId, d.dias).filter((l) => l.segmento === d.segmento);
  const aptos = leads.filter((l) => !l.excluido).slice(0, Math.max(1, Math.min(1000, d.limite || 200)));
  if (!aptos.length) return { error: 'No hay clientes para enviar en ese grupo (o todos están excluidos).' };
  const id = uid();
  const s = SEGMENTOS.find((x) => x.id === d.segmento)!;
  db.prepare('INSERT INTO remarketing_campanas (id, store_id, nombre, segmento, mensaje, campos, total) VALUES (?,?,?,?,?,?,?)')
    .run(id, storeId, (d.nombre || `${s.titulo} · ${m.titulo}`).slice(0, 80), d.segmento, d.mensaje, JSON.stringify(d.campos || {}), aptos.length);
  db.transaction(() => { for (const l of aptos) encolar(storeId, l.id, 'campana', d.mensaje, m.params(storeId, l, d.campos || {}), id); })();
  registrarLog(storeId, 'info', 'remarketing', `Envío "${s.titulo}" en cola: ${aptos.length} cliente(s).`);
  return { id, encolados: aptos.length, excluidos: leads.length - aptos.length };
}

export function cambiarCampana(storeId: string, id: string, accion: 'pausar' | 'reanudar' | 'cancelar'): boolean {
  const c = db.prepare('SELECT estado FROM remarketing_campanas WHERE id = ? AND store_id = ?').get(id, storeId) as { estado: string } | undefined;
  if (!c) return false;
  if (accion === 'cancelar') {
    db.prepare("UPDATE remarketing_envios SET estado = 'omitido', motivo = 'Envío cancelado' WHERE campana_id = ? AND estado = 'pendiente'").run(id);
    db.prepare("UPDATE remarketing_campanas SET estado = 'cancelada' WHERE id = ?").run(id);
  } else db.prepare('UPDATE remarketing_campanas SET estado = ?, motivo = ? WHERE id = ?').run(accion === 'pausar' ? 'pausada' : 'enviando', accion === 'pausar' ? 'Pausada por ti.' : '', id);
  return true;
}

/** Envía UN mensaje de la cola. */
async function enviarUno(e: Fila): Promise<void> {
  const storeId = txt(e.store_id);
  const fin = (estado: string, motivo = '', extra: { via?: string; wamid?: string } = {}) =>
    db.prepare("UPDATE remarketing_envios SET estado = ?, motivo = ?, via = ?, wamid = ?, enviado_at = CASE WHEN ? = 'enviado' THEN datetime('now') ELSE enviado_at END WHERE id = ?")
      .run(estado, motivo.slice(0, 300), extra.via || '', extra.wamid || '', estado, txt(e.id));
  const l = db.prepare('SELECT id, nombre, tel, wa_id, no_contactar FROM leads WHERE id = ? AND store_id = ?').get(txt(e.lead_id), storeId) as Fila | undefined;
  if (!l) return void fin('omitido', 'El chat ya no existe.');
  const ok = puedeEscribirle(storeId, txt(l.tel), txt(l.id));
  if (!ok.ok) return void fin('omitido', `No se le escribe: ${ok.motivo}.`);
  // ¿Compró o escribió desde que se puso en cola? Ya no hace falta.
  const compro = db.prepare("SELECT 1 FROM orders WHERE store_id = ? AND (lead_id = ? OR (? != '' AND substr(replace(replace(replace(tel,' ',''),'+',''),'-',''), -10) = ?)) AND created_at > ? AND estado != 'Cancelado' LIMIT 1").get(storeId, txt(l.id), diez(l.tel), diez(l.tel), txt(e.creado));
  if (compro) return void fin('omitido', 'Ya compró.');
  const m = mensajeRmk(txt(e.mensaje));
  const params = pj<string[]>(txt(e.params), []);
  const destino = txt(l.wa_id) || txt(l.tel);
  const ultCli = (db.prepare("SELECT created_at FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 1").get(txt(l.id)) as { created_at: string } | undefined)?.created_at || '';
  if (ultCli && ultCli > txt(e.creado) && txt(e.tipo) !== 'rescate') return void fin('omitido', 'El cliente volvió a escribir.');
  const abierta = !!ultCli && Date.now() - new Date(ultCli.replace(' ', 'T') + 'Z').getTime() < 23.5 * 3600e3;
  if (txt(e.tipo) === 'rescate' && !abierta) return void fin('omitido', 'La ventana de 24 h ya se cerró.');
  let texto = txt(e.tipo) === 'rescate' ? (params[0] || '') : m ? m.texto(params) : '';
  let r: { ok: boolean; error?: string; wamid?: string; bloqueadoVentana?: boolean; textoRender?: string } = { ok: false, error: 'sin mensaje' };
  let via = '';
  if (abierta && texto) { r = await sendWhatsappText(storeId, destino, texto, txt(l.tel)); via = 'texto'; }
  if (!r.ok && txt(e.tipo) !== 'rescate' && m && (!abierta || r.bloqueadoVentana)) {
    const tpl = plantillaAprobada(storeId, m.plantilla);
    if (!tpl) return void fin('pendiente_plantilla', `La plantilla "${m.plantilla}" aún no está aprobada por Meta.`);
    r = await sendWhatsappTemplate(storeId, destino, tpl, params, txt(l.tel)); via = 'plantilla';
    if (r.ok && r.textoRender) texto = r.textoRender;
  }
  if (!r.ok) {
    fin('fallido', r.error || 'error', { via });
    if (MOTIVOS_PAUSA.test(r.error || '') && txt(e.campana_id)) {
      db.prepare("UPDATE remarketing_campanas SET estado = 'pausada', motivo = ? WHERE id = ?").run(`Pausada sola: Meta avisó un límite (${(r.error || '').slice(0, 120)}). Espera unas horas antes de reanudar.`, txt(e.campana_id));
      registrarLog(storeId, 'warn', 'remarketing', `Envío pausado: Meta avisó un límite o spam (${r.error}).`);
    }
    return;
  }
  contarProactivo(storeId, txt(l.tel), 'remarketing');
  db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado, wa_msg_id) VALUES (?,?,'bot',?,'enviado',?)").run(uid(), txt(l.id), texto, r.wamid || null);
  // Que el "¿sigues ahí?" no lo persiga, y que su respuesta la atienda el asistente (y cierre el pedido).
  db.prepare("UPDATE leads SET seguimiento_nivel = 3, asignado = CASE WHEN asignado LIKE 'Equipo (%' OR asignado = 'Vendedor' OR asignado LIKE '%asistente%' OR asignado LIKE '%bot%' THEN 'Asistente (bot)' ELSE asignado END WHERE id = ?").run(txt(l.id));
  fin('enviado', '', { via, wamid: r.wamid || '' });
}

const enviadosHoy = (storeId: string) => (db.prepare("SELECT COUNT(*) n FROM remarketing_envios WHERE store_id = ? AND estado = 'enviado' AND date(enviado_at, '-5 hours') = ?").get(storeId, hoyCO()) as { n: number }).n;

let corriendo = false;
/** Cada minuto: unos pocos envíos por tienda (horario, tope diario y campañas activas). */
export async function procesarCola(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    const h = horaCO();
    if (h < 8 || h >= 20) return;
    // Las que esperaban la aprobación de la plantilla vuelven a la cola si ya está aprobada.
    db.prepare("UPDATE remarketing_envios SET estado = 'pendiente' WHERE estado = 'pendiente_plantilla' AND creado > datetime('now','-5 days')").run();
    db.prepare("UPDATE remarketing_envios SET estado = 'omitido', motivo = 'Venció en la cola (más de 5 días).' WHERE estado IN ('pendiente','pendiente_plantilla') AND creado < datetime('now','-5 days')").run();
    const tiendas = db.prepare(`SELECT DISTINCT e.store_id FROM remarketing_envios e LEFT JOIN remarketing_campanas c ON c.id = e.campana_id
      WHERE e.estado = 'pendiente' AND (e.campana_id = '' OR c.estado = 'enviando')`).all() as { store_id: string }[];
    for (const t of tiendas) {
      // Con la calidad en media o baja se espera: la cola queda quieta hasta que vuelva a alta
      // (lo que venza en ese tiempo se marca como vencido, como siempre).
      if (frenoActivo(t.store_id)) continue;
      const cfg = cfgRemarketing(t.store_id);
      const libres = cfg.topeDiario - enviadosHoy(t.store_id);
      if (libres <= 0) continue;
      const lote = db.prepare(`SELECT e.* FROM remarketing_envios e LEFT JOIN remarketing_campanas c ON c.id = e.campana_id
        WHERE e.store_id = ? AND e.estado = 'pendiente' AND (e.campana_id = '' OR c.estado = 'enviando')
        ORDER BY CASE e.tipo WHEN 'rescate' THEN 0 WHEN 'auto1' THEN 1 WHEN 'auto2' THEN 2 ELSE 3 END, e.creado LIMIT ?`).all(t.store_id, Math.min(5, libres)) as Fila[];
      for (const e of lote) {
        db.prepare("UPDATE remarketing_envios SET estado = 'enviando' WHERE id = ? AND estado = 'pendiente'").run(txt(e.id));
        try { await enviarUno(e); } catch (err) { db.prepare("UPDATE remarketing_envios SET estado = 'fallido', motivo = ? WHERE id = ?").run(String(err).slice(0, 200), txt(e.id)); }
      }
    }
    db.prepare("UPDATE remarketing_campanas SET estado = 'terminada' WHERE estado = 'enviando' AND NOT EXISTS (SELECT 1 FROM remarketing_envios e WHERE e.campana_id = remarketing_campanas.id AND e.estado IN ('pendiente','enviando','pendiente_plantilla'))").run();
  } finally { corriendo = false; }
}

/**
 * Cada 10 min: arma los mensajes automáticos.
 *  - Rescate (texto, gratis): datos completos o a mitad, sin respuesta hace 20–23 h, ventana aún abierta.
 *  - Recuperación (plantilla): datos completos sin confirmar, 26 h a 7 días después de su último
 *    mensaje; el 2.º toque, 3 días después del primero y sin respuesta.
 */
export function programarAutomaticos(): number {
  let n = 0;
  const tiendas = db.prepare("SELECT w.store_id, w.modo FROM whatsapp w WHERE w.conectado = 1").all() as { store_id: string; modo: string }[];
  for (const t of tiendas) {
    const cfg = cfgRemarketing(t.store_id);
    if (!cfg.rescate24h && !cfg.recuperar) continue;
    if (frenoActivo(t.store_id)) continue; // calidad en media o baja: no se programan mensajes de venta
    const leads = leadsPorSegmento(t.store_id, 8).filter((l) => (l.segmento === 'datos_completos' || l.segmento === 'faltan_datos') && !/^(Pidió|Lo marcaste)/.test(l.excluido));
    for (const l of leads) {
      const horas = (Date.now() - new Date(l.ultCliente.replace(' ', 'T') + 'Z').getTime()) / 3600e3;
      const envios = db.prepare("SELECT tipo, estado, creado, enviado_at FROM remarketing_envios WHERE lead_id = ? AND creado > ? ").all(l.id, l.ultCliente) as Fila[];
      const ya = (tipo: string) => envios.find((x) => txt(x.tipo) === tipo);
      // El último mensaje tiene que ser nuestro (esperamos al cliente).
      const ultDe = (db.prepare('SELECT ult_de FROM leads WHERE id = ?').get(l.id) as { ult_de: string } | undefined)?.ult_de;
      if (ultDe === 'cliente') continue;
      if (cfg.rescate24h && horas >= 20 && horas < 23 && !ya('rescate')) {
        const nombre = primer(l.nombre);
        const r = resumenDelLead(l.id);
        const prod = r.productos || productoDeInteres(t.store_id, l.id);
        const texto = l.segmento === 'datos_completos'
          ? `Hola ${nombre} 👋 Tu pedido quedó pendiente${prod ? `: ${prod}` : ''}${r.total ? ` por ${r.total}` : ''}.\n\n¿Te lo enviamos? Respóndeme *Sí* y lo despacho hoy mismo 🚚`
          : `Hola ${nombre} 👋 Ya casi tenemos listo tu pedido${prod ? ` de ${prod}` : ''}. ¿Seguimos? Solo me faltan unos datos para enviártelo 🚚`;
        encolar(t.store_id, l.id, 'rescate', '', [texto]); n++;
        continue;
      }
      if (!cfg.recuperar || t.modo === 'qr' || l.segmento !== 'datos_completos' || horas > 7 * 24) continue;
      const a1 = ya('auto1');
      if (!a1 && horas >= 26) { encolar(t.store_id, l.id, 'auto1', 'recuperar_pedido', MENSAJES[0].params(t.store_id, l, {})); n++; continue; }
      if (cfg.toques === 2 && a1 && txt(a1.estado) === 'enviado' && !ya('auto2') && a1.enviado_at && Date.now() - new Date(txt(a1.enviado_at).replace(' ', 'T') + 'Z').getTime() > 72 * 3600e3) {
        encolar(t.store_id, l.id, 'auto2', 'seguimos_disponible', MENSAJES[1].params(t.store_id, l, {})); n++;
      }
    }
  }
  return n;
}

// ── Resultados ──────────────────────────────────────────────────────────────
interface Resultado { total: number; enviados: number; pendientes: number; esperandoPlantilla: number; omitidos: number; fallidos: number; respondieron: number; compraron: number; ventas: number }
function resultados(where: string, args: unknown[]): Resultado {
  const r = db.prepare(`SELECT COUNT(*) total,
      SUM(e.estado = 'enviado') enviados, SUM(e.estado IN ('pendiente','enviando')) pendientes, SUM(e.estado = 'pendiente_plantilla') esperando,
      SUM(e.estado = 'omitido') omitidos, SUM(e.estado = 'fallido') fallidos,
      SUM(e.estado = 'enviado' AND EXISTS (SELECT 1 FROM messages m WHERE m.lead_id = e.lead_id AND m.de = 'cliente' AND m.created_at > e.enviado_at AND m.created_at < datetime(e.enviado_at, '+3 days'))) respondieron,
      SUM(e.estado = 'enviado' AND EXISTS (SELECT 1 FROM orders o WHERE o.lead_id = e.lead_id AND o.estado != 'Cancelado' AND o.created_at > e.enviado_at AND o.created_at < datetime(e.enviado_at, '+7 days'))) compraron,
      COALESCE(SUM(CASE WHEN e.estado = 'enviado' THEN (SELECT SUM(o.total) FROM orders o WHERE o.lead_id = e.lead_id AND o.estado != 'Cancelado' AND o.created_at > e.enviado_at AND o.created_at < datetime(e.enviado_at, '+7 days')) END), 0) ventas
    FROM remarketing_envios e WHERE ${where}`).get(...args) as Fila;
  const N = (k: string) => Number(r[k]) || 0;
  return { total: N('total'), enviados: N('enviados'), pendientes: N('pendientes'), esperandoPlantilla: N('esperando'), omitidos: N('omitidos'), fallidos: N('fallidos'), respondieron: N('respondieron'), compraron: N('compraron'), ventas: N('ventas') };
}

/** Todo lo que necesita la pantalla de Remarketing. */
export function panelRemarketing(storeId: string, dias = 60) {
  const leads = leadsPorSegmento(storeId, dias);
  const w = db.prepare('SELECT modo, conectado FROM whatsapp WHERE store_id = ?').get(storeId) as { modo: string; conectado: number } | undefined;
  const estadoPlantilla = (nombre: string) => {
    const t = db.prepare(`SELECT p.estado, p.motivo FROM meta_template_pub p JOIN meta_templates t ON t.id = p.template_id WHERE p.store_id = ? AND t.nombre = ?`).get(storeId, nombre) as { estado: string; motivo: string } | undefined;
    return t ? { estado: t.estado, motivo: t.motivo } : { estado: 'sin_publicar', motivo: '' };
  };
  return {
    cfg: cfgRemarketing(storeId),
    whatsapp: w?.conectado ? (w.modo === 'qr' ? 'qr' : 'oficial') : 'desconectado',
    enviadosHoy: enviadosHoy(storeId),
    segmentos: SEGMENTOS.map((s) => {
      const ls = leads.filter((l) => l.segmento === s.id);
      return { ...s, total: ls.length, aptos: ls.filter((l) => !l.excluido).length, ventanaAbierta: ls.filter((l) => !l.excluido && l.ventanaAbierta).length };
    }),
    mensajes: MENSAJES.map((m) => ({ id: m.id, titulo: m.titulo, plantilla: m.plantilla, segmentos: m.segmentos, campos: m.campos, ejemplo: m.texto(['Camila', tiendaDe(storeId), ...(m.id === 'recuperar_pedido' ? ['1× Jean mom fit (Talla 8)', '$129.900'] : m.id === 'seguimos_disponible' ? ['el Jean mom fit'] : m.campos.map((c) => c.ejemplo))]), aprobacion: estadoPlantilla(m.plantilla) })),
    automaticos: {
      rescate: resultados("e.store_id = ? AND e.tipo = 'rescate' AND e.creado > datetime('now','-30 days')", [storeId]),
      recuperacion: resultados("e.store_id = ? AND e.tipo IN ('auto1','auto2') AND e.creado > datetime('now','-30 days')", [storeId]),
    },
    campanas: (db.prepare('SELECT * FROM remarketing_campanas WHERE store_id = ? ORDER BY creado DESC LIMIT 20').all(storeId) as Fila[]).map((c) => ({
      id: txt(c.id), nombre: txt(c.nombre), segmento: txt(c.segmento), mensaje: txt(c.mensaje), estado: txt(c.estado), motivo: txt(c.motivo), creado: txt(c.creado),
      ...resultados('e.campana_id = ?', [txt(c.id)]),
    })),
  };
}

/** Vista previa de un segmento (primeros 100). */
export function vistaSegmento(storeId: string, segmento: Segmento, dias = 60) {
  return leadsPorSegmento(storeId, dias).filter((l) => l.segmento === segmento).slice(0, 100)
    .map((l) => ({ id: l.id, nombre: l.nombre || l.tel, tel: l.tel, ultimo: l.ultimo, ultCliente: l.ultCliente, excluido: l.excluido, ventanaAbierta: l.ventanaAbierta }));
}

export function iniciarRemarketing(): void {
  setTimeout(() => void procesarCola().catch((e) => console.warn('[remarketing] cola', e)), 60_000).unref?.();
  setInterval(() => void procesarCola().catch((e) => console.warn('[remarketing] cola', e)), 60_000).unref?.();
  const auto = () => { try { const n = programarAutomaticos(); if (n) console.log(`[remarketing] mensajes automáticos en cola: ${n}`); } catch (e) { console.warn('[remarketing] automáticos', e); } };
  setTimeout(auto, 90_000).unref?.();
  setInterval(auto, 10 * 60_000).unref?.();
  // Plantillas de remarketing: se mandan a Meta una vez en las tiendas con WhatsApp oficial.
  if (process.env.NODE_ENV === 'production') {
    setTimeout(async () => {
      for (const nombre of ['recuperar_pedido', 'seguimos_disponible', 'volver_a_comprar']) {
        const t = db.prepare('SELECT id FROM meta_templates WHERE nombre = ?').get(nombre) as { id: string } | undefined;
        if (!t) continue;
        if ((db.prepare("SELECT COUNT(*) n FROM meta_template_pub WHERE template_id = ? AND estado != 'error'").get(t.id) as { n: number }).n) continue;
        try { const m = await import('./metaTemplates.js'); const r = await m.publicarEnTodas(t.id); console.log(`[remarketing] plantilla ${nombre} enviada a Meta: ${r.exitosas}/${r.total}`); } catch (e) { console.warn(`[remarketing] plantilla ${nombre}`, e); }
      }
    }, 4 * 60_000).unref?.();
  }
  console.log('[remarketing] rescate 24 h, recuperación automática y envíos por segmento: activos');
}
