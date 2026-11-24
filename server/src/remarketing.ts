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
import { trabajo } from './rendimiento.js';

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
// Contacto importado que todavía no es un chat: el chat se crea al enviarle (contactos.ts).
try { db.exec("ALTER TABLE remarketing_envios ADD COLUMN contacto_id TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

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
/** Un chat de WhatsApp con todo lo que sirve para filtrar una campaña (segmento '' si no cae en ninguno). */
interface LeadBase extends Omit<LeadSegmento, 'segmento'> {
  segmento: Segmento | ''; adId: string; etiquetaCrm: string; estadoPedido: string; creado: string;
  /** Fecha del último pedido que SÍ fue una venta (ni cancelado ni devuelto); '' si nunca le ha comprado. */
  compraAt: string;
  /** Igual que `excluido` pero sin el "No compró" (ese solo cuenta al elegir por estado del lead). */
  excluidoBase: string;
}
/** Último pedido que fue venta (ni cancelado ni devuelto). */
const ultimaCompra = (ps: { at: string; estado: string }[]) => ps.filter((p) => p.estado !== 'Cancelado' && p.estado !== 'Devuelto').map((p) => p.at).sort().pop() || '';
const hace = (iso: string) => (Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()) / 3600e3;

/** Pedidos de la tienda por chat (id del lead) y por celular ('t' + 10 dígitos). */
function pedidosTienda(storeId: string) {
  const pedidos = new Map<string, { at: string; estado: string }[]>();
  const add = (k: string, v: { at: string; estado: string }) => { if (!k) return; const l = pedidos.get(k) || []; l.push(v); pedidos.set(k, l); };
  for (const o of db.prepare('SELECT lead_id, tel, estado, created_at FROM orders WHERE store_id = ?').all(storeId) as Fila[]) {
    const v = { at: txt(o.created_at), estado: txt(o.estado) };
    add(txt(o.lead_id), v);
    if (diez(o.tel).length === 10) add('t' + diez(o.tel), v);
  }
  return pedidos;
}

/** Todos los chats de WhatsApp de la tienda, del más reciente al más viejo, con su segmento (si tiene). */
function leadsTodos(storeId: string, dias = 60, pedidos = pedidosTienda(storeId)): LeadBase[] {
  // Último mensaje y señales del embudo: guardados en el lead (versiones.ts), sin recorrer mensajes.
  const rows = db.prepare(`SELECT l.id, l.nombre, l.tel, l.wa_id, l.canal, l.no_contactar, l.estado_manual, l.ad_id, l.etiqueta, l.created_at,
      l.ult_cliente_at AS ult_cliente, l.ult_at, l.ult_texto, l.f_resumen_at AS resumen_at,
      l.f_pidio_resp AS pidio_datos, l.f_dio AS dio_datos, l.f_intencion AS intencion,
      (SELECT MAX(enviado_at) FROM remarketing_envios r WHERE r.lead_id = l.id AND r.estado = 'enviado') AS ult_rmk
    FROM leads l WHERE l.store_id = ? AND COALESCE(l.canal,'whatsapp') = 'whatsapp'`).all(storeId) as Fila[];
  const limite = new Date(Date.now() - dias * 86400e3).toISOString().replace('T', ' ').slice(0, 19);
  const out: LeadBase[] = [];
  for (const l of rows) {
    const destino = txt(l.wa_id) || txt(l.tel);
    if (!destino || destino.startsWith('web:')) continue;
    const ps = [...(pedidos.get(txt(l.id)) || []), ...(diez(l.tel).length === 10 ? pedidos.get('t' + diez(l.tel)) || [] : [])].sort((a, b) => b.at.localeCompare(a.at));
    const vivos = ps.filter((p) => p.estado !== 'Cancelado');
    let seg: Segmento | '' = '';
    if (!l.ult_cliente) seg = '';
    else if (vivos.length) {
      const ult = vivos[0];
      if (vivos.some((p) => p.estado === 'Entregado') && hace(ult.at) >= 15 * 24 && !['Nuevo', 'Confirmado', 'Guía generada', 'En tránsito', 'En reparto', 'En oficina', 'Novedad'].includes(ult.estado)) seg = 'compradores';
    } else if (ps.length) seg = 'cancelados';
    else if (l.resumen_at) seg = 'datos_completos';
    else if (Number(l.pidio_datos) || Number(l.dio_datos)) seg = 'faltan_datos';
    else if (Number(l.intencion)) seg = 'interesados';
    // Fuera de la ventana de días elegida: el chat sigue ahí (para anuncio, etiqueta o búsqueda), pero sin segmento.
    if (seg && seg !== 'compradores' && txt(l.ult_cliente) < limite) seg = '';
    let excluidoBase = '';
    if (Number(l.no_contactar)) excluidoBase = 'Pidió que no le escribamos';
    else if (l.ult_rmk && hace(txt(l.ult_rmk)) < 7 * 24) excluidoBase = 'Ya recibió un mensaje de remarketing esta semana';
    else if (l.ult_cliente && hace(txt(l.ult_cliente)) < 2) excluidoBase = 'Está conversando ahora mismo';
    const excluido = !Number(l.no_contactar) && txt(l.estado_manual) === 'perdido' ? 'Lo marcaste como "No compró"' : excluidoBase;
    out.push({ id: txt(l.id), nombre: txt(l.nombre), tel: txt(l.tel), destino, segmento: seg, ultCliente: txt(l.ult_cliente), ultimo: txt(l.ult_texto).replace(/\s+/g, ' ').slice(0, 90),
      excluido, excluidoBase, ventanaAbierta: !!l.ult_cliente && hace(txt(l.ult_cliente)) < 23.5,
      adId: txt(l.ad_id), etiquetaCrm: txt(l.etiqueta), estadoPedido: ps[0]?.estado || '', creado: txt(l.created_at), compraAt: ultimaCompra(ps) });
  }
  return out.sort((a, b) => b.ultCliente.localeCompare(a.ultCliente));
}

/** Leads de la tienda con su segmento (y por qué se excluyen, si aplica). */
export function leadsPorSegmento(storeId: string, dias = 60): LeadSegmento[] {
  return leadsTodos(storeId, dias).filter((l): l is LeadBase & { segmento: Segmento } => !!l.segmento)
    .map(({ adId: _a, etiquetaCrm: _e, estadoPedido: _p, excluidoBase: _b, creado: _c, compraAt: _v, ...l }) => l);
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

// ── Audiencia: anuncio de origen, estado del lead, estado del pedido, etiqueta o clientes elegidos ──
/** Anuncio de origen "sin anuncio" (el chat llegó solo). */
export const ORGANICO = 'organico';
/** Estado del pedido "nunca ha pedido". */
export const SIN_PEDIDO = 'sin_pedido';
export interface FiltroAudiencia {
  segmentos: Segmento[]; etiquetas: string[]; dias: number;
  /** Id del anuncio por el que llegó el chat (ORGANICO = sin anuncio). */
  anuncios?: string[];
  /** Estado del último pedido (SIN_PEDIDO = nunca pidió). */
  estadosPedido?: string[];
  /** 'todos': tiene que cumplir cada criterio elegido · 'alguno': basta con uno (se suman sin repetir). */
  combinar?: 'todos' | 'alguno';
  /** Clientes elegidos uno por uno (su `clave`): si viene, la audiencia son solo ellos. */
  claves?: string[];
  /** Fecha (hora Colombia): siempre se suma como "y además", sea cual sea `combinar`. */
  fecha?: FiltroFecha;
  /** A quién NO enviarle, aunque cumpla los filtros (también con los clientes elegidos a mano). */
  excluir?: ExcluirAudiencia;
}
export interface ExcluirAudiencia {
  /** Quienes ya le compraron a la tienda (pedido que no se canceló ni se devolvió). */
  compraron?: boolean;
  /** Solo si la compra fue en los últimos N días (0 o vacío = cualquier compra). */
  compraronDias?: number;
  /** Quienes tienen alguna de estas etiquetas. */
  etiquetas?: string[];
  /** Clientes puntuales (su `clave`). */
  claves?: string[];
}
/**
 * campo: 'llegada' = cuándo escribió por primera vez (o se importó) · 'ultimo' = su último mensaje.
 * modo: últimas `horas` · hoy · ayer · rango de días `desde`–`hasta` (AAAA-MM-DD, ambos incluidos).
 */
export interface FiltroFecha { campo: 'llegada' | 'ultimo'; modo: 'horas' | 'hoy' | 'ayer' | 'rango'; horas?: number; desde?: string; hasta?: string }

/** Límites en UTC ('AAAA-MM-DD HH:MM:SS', como se guardan las fechas) de un filtro de fecha en hora Colombia. */
export function rangoFecha(f?: FiltroFecha): { desde: string; hasta: string; texto: string } | null {
  if (!f) return null;
  const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  const diaCO = (d: string) => Date.parse(d + 'T05:00:00Z'); // 00:00 en Colombia = 05:00 UTC
  const valida = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(diaCO(d));
  const corto = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
  if (f.modo === 'horas') {
    const h = Math.min(24 * 90, Math.max(1, Math.round(Number(f.horas) || 0)));
    if (!Number(f.horas)) return null;
    return { desde: iso(Date.now() - h * 3600e3), hasta: iso(Date.now() + 60e3), texto: `últimas ${h} h` };
  }
  const hoy = hoyCO();
  if (f.modo === 'hoy') return { desde: iso(diaCO(hoy)), hasta: iso(diaCO(hoy) + 86400e3), texto: 'hoy' };
  if (f.modo === 'ayer') return { desde: iso(diaCO(hoy) - 86400e3), hasta: iso(diaCO(hoy)), texto: 'ayer' };
  if (f.modo === 'rango' && (valida(f.desde) || valida(f.hasta))) {
    const d = valida(f.desde) ? f.desde! : f.hasta!;
    const h = valida(f.hasta) ? f.hasta! : f.desde!;
    const [a, b] = d <= h ? [d, h] : [h, d];
    return { desde: iso(diaCO(a)), hasta: iso(diaCO(b) + 86400e3), texto: a === b ? `el ${corto(a)}` : `del ${corto(a)} al ${corto(b)}` };
  }
  return null;
}
export interface Destinatario {
  clave: string; leadId: string; contactoId: string; nombre: string; tel: string; origen: 'chat' | 'importado'; motivo: string; excluido: string;
  /** Para mostrarlo en la lista: estado, pedido, anuncio y etiquetas. */
  detalle: string;
}
interface Candidato extends Destinatario { segmento: Segmento | ''; adId: string; etiquetas: string[]; estadoPedido: string; perdido: boolean; llegada: string; ultimoMsg: string; compraAt: string }

/** Nombre de cada anuncio por el que llegaron chats (de las estadísticas de Meta o del propio anuncio). */
function nombresAnuncios(storeId: string): Map<string, { nombre: string; campana: string }> {
  const out = new Map<string, { nombre: string; campana: string }>();
  for (const r of db.prepare("SELECT ad_id, MAX(ad_ref) ref FROM leads WHERE store_id = ? AND ad_id != '' GROUP BY ad_id").all(storeId) as { ad_id: string; ref: string }[]) {
    const a = pj<{ titular?: string }>(r.ref || '', {});
    out.set(r.ad_id, { nombre: String(a.titular || '').trim(), campana: '' });
  }
  try {
    for (const r of db.prepare("SELECT ad_id, MAX(ad_name) n, MAX(campaign_name) c FROM ads_insights WHERE store_id = ? GROUP BY ad_id").all(storeId) as { ad_id: string; n: string; c: string }[]) {
      const x = out.get(r.ad_id);
      if (x) out.set(r.ad_id, { nombre: r.n || x.nombre, campana: r.c || '' });
    }
  } catch { /* sin estadísticas de Meta */ }
  for (const [id, x] of out) if (!x.nombre) x.nombre = `Anuncio …${id.slice(-5)}`;
  return out;
}

/** Todos a los que se les podría escribir: chats de WhatsApp + contactos importados que aún no son chat. */
function candidatos(storeId: string, dias: number): { lista: Candidato[]; anuncios: Map<string, { nombre: string; campana: string }> } {
  const pedidos = pedidosTienda(storeId);
  const etsPorTel = new Map<string, string[]>();
  for (const r of db.prepare('SELECT tel10, etiqueta FROM contacto_etiquetas WHERE store_id = ? ORDER BY etiqueta').all(storeId) as { tel10: string; etiqueta: string }[]) {
    const l = etsPorTel.get(r.tel10) || []; l.push(r.etiqueta); etsPorTel.set(r.tel10, l);
  }
  const anuncios = nombresAnuncios(storeId);
  const tit = new Map(SEGMENTOS.map((x) => [x.id, x.titulo]));
  const out = new Map<string, Candidato>();
  for (const l of leadsTodos(storeId, dias, pedidos)) {
    const clave = diez(l.tel).length === 10 ? diez(l.tel) : diez(l.destino.split('@')[0]).length === 10 ? diez(l.destino.split('@')[0]) : 'l:' + l.id;
    if (out.has(clave)) continue; // el chat más reciente de ese celular
    const etiquetas = [...new Set([l.etiquetaCrm, ...(etsPorTel.get(clave) || [])].filter(Boolean))];
    const detalle = [
      l.segmento ? tit.get(l.segmento) : '',
      l.estadoPedido ? `Pedido: ${l.estadoPedido}` : '',
      l.adId ? `📣 ${anuncios.get(l.adId)?.nombre || 'Anuncio'}` : '',
      etiquetas.length ? `🏷️ ${etiquetas.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    out.set(clave, { clave, leadId: l.id, contactoId: '', nombre: l.nombre, tel: l.tel, origen: 'chat', motivo: '', excluido: l.excluidoBase, detalle,
      segmento: l.segmento, adId: l.adId, etiquetas, estadoPedido: l.estadoPedido, perdido: l.excluido !== l.excluidoBase, llegada: l.creado, ultimoMsg: l.ultCliente, compraAt: l.compraAt });
  }
  for (const c of db.prepare(`SELECT c.id, c.tel10, c.nombre, c.creado,
      (SELECT MAX(enviado_at) FROM remarketing_envios r WHERE r.contacto_id = c.id AND r.estado = 'enviado') ult_rmk
    FROM contactos_importados c WHERE c.store_id = ? AND c.lead_id = ''`).all(storeId) as Fila[]) {
    const k = txt(c.tel10);
    if (!k || out.has(k)) continue;
    const etiquetas = etsPorTel.get(k) || [];
    const psC = (pedidos.get('t' + k) || []).sort((a, b) => b.at.localeCompare(a.at));
    const estadoPedido = psC[0]?.estado || '';
    out.set(k, { clave: k, leadId: '', contactoId: txt(c.id), nombre: txt(c.nombre), tel: '+57' + k, origen: 'importado', motivo: '',
      excluido: c.ult_rmk && hace(txt(c.ult_rmk)) < 7 * 24 ? 'Ya recibió un mensaje de remarketing esta semana' : '',
      detalle: ['📇 Importado', estadoPedido ? `Pedido: ${estadoPedido}` : '', etiquetas.length ? `🏷️ ${etiquetas.join(', ')}` : ''].filter(Boolean).join(' · '),
      segmento: '', adId: '', etiquetas, estadoPedido, perdido: false, llegada: txt(c.creado), ultimoMsg: '', compraAt: ultimaCompra(psC) });
  }
  return { lista: [...out.values()], anuncios };
}

const limpiarCand = ({ segmento: _s, adId: _a, etiquetas: _e, estadoPedido: _p, perdido: _x, llegada: _l, ultimoMsg: _u, compraAt: _v, ...d }: Candidato): Destinatario => d;

/** Por qué este cliente queda fuera según las exclusiones elegidas ('' = no se excluye). */
function motivoExcluir(c: Candidato, ex?: ExcluirAudiencia): string {
  if (!ex) return '';
  if ((ex.claves || []).includes(c.clave)) return 'Lo excluiste a mano';
  if (ex.compraron && c.compraAt) {
    const dias = Math.round(Number(ex.compraronDias) || 0);
    const limite = dias > 0 ? new Date(Date.now() - dias * 86400e3).toISOString().replace('T', ' ').slice(0, 19) : '';
    if (!limite || c.compraAt >= limite) return `Ya te compró (pedido del ${c.compraAt.slice(8, 10)}/${c.compraAt.slice(5, 7)}/${c.compraAt.slice(2, 4)})`;
  }
  const ets = new Set((ex.etiquetas || []).filter(Boolean));
  const hit = c.etiquetas.find((e) => ets.has(e));
  if (hit) return `Excluido por la etiqueta «${hit}»`;
  return '';
}

/**
 * Quién recibe. Cada criterio elegido es un grupo (dentro del grupo basta con una opción):
 * con `combinar: 'todos'` tiene que cumplir todos los grupos; con 'alguno', cualquiera.
 * Si vienen `claves`, son solo esos clientes (elegidos a mano).
 */
export function audiencia(storeId: string, f: FiltroAudiencia): Destinatario[] {
  const { lista, anuncios } = candidatos(storeId, f.dias || 60);
  const claves = (f.claves || []).filter(Boolean);
  if (claves.length) {
    const porClave = new Map(lista.map((c) => [c.clave, c]));
    return claves.map((k) => porClave.get(k)).filter((c): c is Candidato => !!c)
      .map((c) => limpiarCand({ ...c, motivo: 'Elegido por ti', excluido: c.excluido || motivoExcluir(c, f.excluir) }));
  }
  const tit = new Map(SEGMENTOS.map((x) => [x.id, x.titulo]));
  const segs = new Set(f.segmentos || []);
  const ets = new Set((f.etiquetas || []).map((e) => String(e).trim()).filter(Boolean));
  const ads = new Set((f.anuncios || []).filter(Boolean));
  const eps = new Set((f.estadosPedido || []).filter(Boolean));
  const grupos: ((c: Candidato) => string)[] = [];
  if (segs.size) grupos.push((c) => (c.segmento && segs.has(c.segmento) ? tit.get(c.segmento) || c.segmento : ''));
  if (ads.size) grupos.push((c) => (c.origen !== 'chat' ? '' : c.adId ? (ads.has(c.adId) ? `📣 ${anuncios.get(c.adId)?.nombre || 'Anuncio'}` : '') : ads.has(ORGANICO) ? 'Sin anuncio' : ''));
  if (eps.size) grupos.push((c) => (c.estadoPedido ? (eps.has(c.estadoPedido) ? `Pedido: ${c.estadoPedido}` : '') : eps.has(SIN_PEDIDO) ? 'Sin pedidos' : ''));
  if (ets.size) grupos.push((c) => { const hit = c.etiquetas.filter((e) => ets.has(e)); return hit.length ? `🏷️ ${hit.join(', ')}` : ''; });
  const rango = rangoFecha(f.fecha);
  if (!grupos.length && !rango) return [];
  const campoFecha = f.fecha?.campo === 'ultimo' ? 'ultimoMsg' : 'llegada';
  const textoFecha = rango ? `${campoFecha === 'ultimoMsg' ? 'Escribió' : 'Llegó'} ${rango.texto}` : '';
  const todos = f.combinar === 'todos';
  const out: Destinatario[] = [];
  for (const c of lista) {
    // La fecha siempre restringe (es un "y además"): sin fecha (importado sin mensajes) no entra.
    if (rango) { const v = c[campoFecha]; if (!v || v < rango.desde || v >= rango.hasta) continue; }
    const hits = grupos.length ? grupos.map((g) => g(c)) : [textoFecha];
    if (todos ? hits.some((h) => !h) : hits.every((h) => !h)) continue;
    if (grupos.length && rango) hits.push(textoFecha);
    // "No compró" (marcado a mano) solo saca a alguien cuando se elige por estado del lead, como antes.
    const excluido = c.excluido || motivoExcluir(c, f.excluir) || (segs.size && c.perdido ? 'Lo marcaste como "No compró"' : '');
    out.push(limpiarCand({ ...c, motivo: hits.filter(Boolean).join(' · '), excluido }));
  }
  return out;
}

/** Buscador de clientes para elegirlos uno por uno (nombre o celular). */
export function buscarClientes(storeId: string, q: string, limite = 40): Destinatario[] {
  const t = norm(q);
  const d = String(q || '').replace(/\D/g, '');
  if (t.length < 2 && d.length < 3) return [];
  return candidatos(storeId, 60).lista
    .filter((c) => (t.length >= 2 && norm(c.nombre).includes(t)) || (d.length >= 3 && String(c.tel).replace(/\D/g, '').includes(d)))
    .slice(0, limite).map(limpiarCand);
}

/** Anuncios por los que llegaron chats (para elegirlos en la campaña) y cuántos de cada uno. */
export function anunciosDeOrigen(storeId: string): { id: string; nombre: string; campana: string; chats: number; ultimo: string }[] {
  const nombres = nombresAnuncios(storeId);
  const filas = db.prepare(`SELECT COALESCE(NULLIF(ad_id,''), '${ORGANICO}') id, COUNT(*) n, MAX(created_at) ult FROM leads
    WHERE store_id = ? AND COALESCE(canal,'whatsapp') = 'whatsapp' AND COALESCE(wa_id, tel, '') NOT LIKE 'web:%' GROUP BY 1 ORDER BY ult DESC`).all(storeId) as { id: string; n: number; ult: string }[];
  return filas.map((r) => ({ id: r.id, nombre: r.id === ORGANICO ? 'Sin anuncio (llegaron solos)' : nombres.get(r.id)?.nombre || `Anuncio …${r.id.slice(-5)}`, campana: nombres.get(r.id)?.campana || '', chats: r.n, ultimo: r.ult }));
}

/** Texto corto del filtro (para el nombre de la campaña). */
function descFiltro(storeId: string, f: FiltroAudiencia): string {
  if (f.claves?.length) return `${f.claves.length} cliente(s) elegidos`;
  const nombres = f.anuncios?.length ? nombresAnuncios(storeId) : new Map<string, { nombre: string }>();
  const partes = [
    ...(f.anuncios || []).map((a) => `📣 ${a === ORGANICO ? 'Sin anuncio' : nombres.get(a)?.nombre || 'Anuncio'}`),
    ...(f.segmentos || []).map((x) => SEGMENTOS.find((y) => y.id === x)?.titulo || x),
    ...(f.estadosPedido || []).map((e) => (e === SIN_PEDIDO ? 'Sin pedidos' : `Pedido ${e}`)),
    ...(f.etiquetas || []).map((e) => `🏷️ ${e}`),
  ];
  const r = rangoFecha(f.fecha);
  const fecha = r ? `${f.fecha?.campo === 'ultimo' ? 'escribieron' : 'llegaron'} ${r.texto}` : '';
  return [partes.join(f.combinar === 'todos' ? ' y ' : ' + '), fecha].filter(Boolean).join(' · ');
}
const filtroVacio = (f: FiltroAudiencia) => !f.claves?.length && !f.segmentos?.length && !f.etiquetas?.length && !f.anuncios?.length && !f.estadosPedido?.length && !rangoFecha(f.fecha);

/** Variable de la plantilla: el nombre del cliente, el de la tienda o un texto fijo que escribe la tienda. */
export interface VariableCampana { tipo: 'nombre' | 'tienda' | 'texto'; valor?: string }
export interface ExtraCampana { encabezado?: string; media?: string; mediaId?: string; mediaNombre?: string; boton?: string }

const valorVariable = (v: VariableCampana, storeId: string, nombre: string) =>
  v.tipo === 'nombre' ? (primer(nombre) !== 'hola' ? primer(nombre) : 'cliente') : v.tipo === 'tienda' ? limpio(tiendaDe(storeId)) : limpio(String(v.valor || ''), 200);

/**
 * Campaña con una plantilla PROPIA de la tienda aprobada por Meta (la única forma de escribirle
 * a quien no ha escrito en 24 h). Siempre sale con la plantilla, nunca como texto suelto.
 */
export async function crearCampanaPlantilla(storeId: string, d: {
  plantillaId: string; variables: VariableCampana[]; extra: ExtraCampana; filtro: FiltroAudiencia; limite: number; nombre?: string;
}): Promise<{ id: string; encolados: number; excluidos: number } | { error: string }> {
  const modo = db.prepare('SELECT modo, conectado FROM whatsapp WHERE store_id = ?').get(storeId) as { modo: string; conectado: number } | undefined;
  if (!modo?.conectado) return { error: 'Conecta WhatsApp primero.' };
  if (modo.modo === 'qr') return { error: 'Las campañas con plantilla necesitan la conexión oficial de WhatsApp (por QR Meta no permite plantillas).' };
  const { plantillaPropia, componentesEnvio } = await import('./plantillasMeta.js');
  const p = plantillaPropia(storeId, d.plantillaId);
  if (!p) return { error: 'Esa plantilla no está aprobada por Meta en tu cuenta. Solo se pueden enviar plantillas aprobadas.' };
  const vars = (d.variables || []).slice(0, p.variables);
  if (vars.length < p.variables) return { error: `La plantilla "${p.nombre}" tiene ${p.variables} dato(s) para llenar: elige qué va en cada uno.` };
  const sinTexto = vars.findIndex((v) => v.tipo === 'texto' && !String(v.valor || '').trim());
  if (sinTexto >= 0) return { error: `Escribe el texto de {{${sinTexto + 1}}}.` };
  const prueba = componentesEnvio(p, vars.map((v) => valorVariable(v, storeId, 'Camila')), d.extra || {});
  if ('error' in prueba) return prueba;
  if (!d.filtro || filtroVacio(d.filtro)) return { error: 'Elige a quién enviarlo: un anuncio, un estado, una etiqueta o los clientes uno por uno.' };
  const todos = audiencia(storeId, d.filtro);
  const aptos = todos.filter((x) => !x.excluido).slice(0, Math.max(1, Math.min(5000, d.limite || 200)));
  if (!aptos.length) return { error: 'No hay contactos para enviar con ese filtro (o todos están excluidos).' };
  const id = uid();
  const desc = descFiltro(storeId, d.filtro);
  db.prepare('INSERT INTO remarketing_campanas (id, store_id, nombre, segmento, mensaje, campos, total) VALUES (?,?,?,?,?,?,?)')
    .run(id, storeId, (d.nombre || `${p.nombre} · ${desc}`).slice(0, 80), JSON.stringify(d.filtro), `tpl:${p.metaId}`, JSON.stringify({ variables: vars, extra: d.extra || {} }), aptos.length);
  const ins = db.prepare('INSERT INTO remarketing_envios (id, store_id, lead_id, contacto_id, campana_id, tipo, mensaje, params) VALUES (?,?,?,?,?,?,?,?)');
  db.transaction(() => { for (const a of aptos) ins.run(uid(), storeId, a.leadId, a.contactoId, id, 'campana', `tpl:${p.metaId}`, JSON.stringify(vars.map((v) => valorVariable(v, storeId, a.nombre)))); })();
  registrarLog(storeId, 'info', 'remarketing', `Campaña "${p.nombre}" en cola: ${aptos.length} contacto(s) (${desc}).`);
  return { id, encolados: aptos.length, excluidos: todos.length - aptos.length };
}

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
  // Contacto importado: su chat se crea ahora, al escribirle por primera vez.
  if (!txt(e.lead_id) && txt(e.contacto_id)) {
    const { chatDeContacto } = await import('./contactos.js');
    const nuevo = await chatDeContacto(storeId, txt(e.contacto_id));
    if (!nuevo) return void fin('omitido', 'El contacto importado ya no existe.');
    db.prepare('UPDATE remarketing_envios SET lead_id = ? WHERE id = ?').run(nuevo, txt(e.id));
    e.lead_id = nuevo;
  }
  const l = db.prepare('SELECT id, nombre, tel, wa_id, no_contactar FROM leads WHERE id = ? AND store_id = ?').get(txt(e.lead_id), storeId) as Fila | undefined;
  if (!l) return void fin('omitido', 'El chat ya no existe.');
  const ok = puedeEscribirle(storeId, txt(l.tel), txt(l.id));
  if (!ok.ok) return void fin('omitido', `No se le escribe: ${ok.motivo}.`);
  // ¿Compró o escribió desde que se puso en cola? Ya no hace falta.
  const compro = db.prepare("SELECT 1 FROM orders WHERE store_id = ? AND (lead_id = ? OR (? != '' AND substr(replace(replace(replace(tel,' ',''),'+',''),'-',''), -10) = ?)) AND created_at > ? AND estado != 'Cancelado' LIMIT 1").get(storeId, txt(l.id), diez(l.tel), diez(l.tel), txt(e.creado));
  if (compro) return void fin('omitido', 'Ya compró.');
  const params = pj<string[]>(txt(e.params), []);
  // Campaña con plantilla propia aprobada por Meta: siempre sale con la plantilla.
  if (txt(e.mensaje).startsWith('tpl:')) {
    const { plantillaPropia, componentesEnvio } = await import('./plantillasMeta.js');
    const p = plantillaPropia(storeId, txt(e.mensaje).slice(4));
    if (!p) return void fin('fallido', 'La plantilla ya no está aprobada por Meta (revisa su estado en WhatsApp → Plantillas).');
    const camp = db.prepare('SELECT campos FROM remarketing_campanas WHERE id = ?').get(txt(e.campana_id)) as { campos: string } | undefined;
    const extra = pj<{ extra?: Record<string, string> }>(camp?.campos || '{}', {}).extra || {};
    const comp = componentesEnvio(p, params, extra);
    if ('error' in comp) return void fin('fallido', comp.error);
    const ultCli0 = (db.prepare("SELECT created_at FROM messages WHERE lead_id = ? AND de = 'cliente' ORDER BY created_at DESC LIMIT 1").get(txt(l.id)) as { created_at: string } | undefined)?.created_at || '';
    if (ultCli0 && ultCli0 > txt(e.creado)) return void fin('omitido', 'El cliente volvió a escribir.');
    const r = await sendWhatsappTemplate(storeId, txt(l.wa_id) || txt(l.tel), { nombre: p.nombre, idioma: p.idioma, encabezado: p.encabezado, cuerpo: p.cuerpo, componentes: comp.components }, params, txt(l.tel));
    if (!r.ok) {
      fin('fallido', r.error || 'error', { via: 'plantilla' });
      if (MOTIVOS_PAUSA.test(r.error || '') && txt(e.campana_id)) {
        db.prepare("UPDATE remarketing_campanas SET estado = 'pausada', motivo = ? WHERE id = ?").run(`Pausada sola: Meta avisó un límite (${(r.error || '').slice(0, 120)}). Espera unas horas antes de reanudar.`, txt(e.campana_id));
        registrarLog(storeId, 'warn', 'remarketing', `Campaña pausada: Meta avisó un límite o spam (${r.error}).`);
      }
      return;
    }
    contarProactivo(storeId, txt(l.tel), 'remarketing');
    const texto = r.textoRender || p.cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_x, n) => params[Number(n) - 1] || '');
    db.prepare("INSERT INTO messages (id, lead_id, de, texto, estado, wa_msg_id) VALUES (?,?,'bot',?,'enviado',?)").run(uid(), txt(l.id), texto, r.wamid || null);
    db.prepare("UPDATE leads SET seguimiento_nivel = 3 WHERE id = ?").run(txt(l.id));
    return void fin('enviado', '', { via: 'plantilla', wamid: r.wamid || '' });
  }
  const m = mensajeRmk(txt(e.mensaje));
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
export async function programarAutomaticos(): Promise<number> {
  let n = 0;
  const tiendas = db.prepare("SELECT w.store_id, w.modo FROM whatsapp w WHERE w.conectado = 1").all() as { store_id: string; modo: string }[];
  const qEnvios = db.prepare('SELECT tipo, estado, creado, enviado_at FROM remarketing_envios WHERE lead_id = ? AND creado > ?');
  const qUltDe = db.prepare('SELECT ult_de FROM leads WHERE id = ?');
  for (const t of tiendas) {
    const cfg = cfgRemarketing(t.store_id);
    if (!cfg.rescate24h && !cfg.recuperar) continue;
    if (frenoActivo(t.store_id)) continue; // calidad en media o baja: no se programan mensajes de venta
    // Entre tienda y tienda se suelta el hilo: así el panel no se congela mientras corre.
    await new Promise((r) => setImmediate(r));
    // Solo el rescate (20–23 h) necesita 1 día de chats; la recuperación, 8.
    const leads = leadsPorSegmento(t.store_id, cfg.recuperar ? 8 : 1).filter((l) => (l.segmento === 'datos_completos' || l.segmento === 'faltan_datos') && !/^(Pidió|Lo marcaste)/.test(l.excluido));
    for (const l of leads) {
      const horas = (Date.now() - new Date(l.ultCliente.replace(' ', 'T') + 'Z').getTime()) / 3600e3;
      if (horas < 20 || (!cfg.recuperar && horas >= 23)) continue;
      const envios = qEnvios.all(l.id, l.ultCliente) as Fila[];
      const ya = (tipo: string) => envios.find((x) => txt(x.tipo) === tipo);
      // El último mensaje tiene que ser nuestro (esperamos al cliente).
      const ultDe = (qUltDe.get(l.id) as { ult_de: string } | undefined)?.ult_de;
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
export async function panelRemarketing(storeId: string, dias = 60) {
  const { plantillasPropias, sincronizarSiHaceFalta } = await import('./plantillasMeta.js');
  const { etiquetasTienda } = await import('./contactos.js');
  const { permisosPlantillas } = await import('./plantillasWA.js');
  sincronizarSiHaceFalta(storeId);
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
    // Para las campañas con plantilla propia: etiquetas de la tienda y sus plantillas APROBADAS por Meta.
    // Etiquetas propias (por celular) + la etiqueta del Inbox de cada chat, con cuántos tienen cada una.
    etiquetas: (() => {
      const m = new Map(etiquetasTienda(storeId).map((e) => [e.etiqueta, e.n]));
      for (const r of db.prepare("SELECT etiqueta, COUNT(*) n FROM leads WHERE store_id = ? AND COALESCE(etiqueta,'') != '' AND COALESCE(canal,'whatsapp') = 'whatsapp' GROUP BY etiqueta").all(storeId) as { etiqueta: string; n: number }[]) m.set(r.etiqueta, (m.get(r.etiqueta) || 0) + r.n);
      return [...m].map(([etiqueta, n]) => ({ etiqueta, n })).sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta));
    })(),
    anuncios: anunciosDeOrigen(storeId),
    importados: (db.prepare("SELECT COUNT(*) n FROM contactos_importados WHERE store_id = ? AND lead_id = ''").get(storeId) as { n: number }).n,
    plantillas: plantillasPropias(storeId).map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, cuerpo: p.cuerpo, variables: p.variables, ejemplos: p.ejemplos,
      encabezado: p.encabezado, encabezadoTipo: p.encabezadoTipo, varsEncabezado: p.varsEncabezado, pie: p.pie,
      botones: p.botones.map((b) => ({ tipo: b.tipo, texto: b.texto, variable: b.variable })) })),
    puedeCrearPlantillas: permisosPlantillas(storeId).crear,
    // Fotos y videos del encabezado siempre se pueden subir; los PDF, si la tienda lo tiene habilitado.
    puedeAdjuntarDocumentos: permisosPlantillas(storeId).documentos,
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
  const cola = () => void trabajo('remarketing.cola', procesarCola);
  setTimeout(cola, 60_000).unref?.();
  setInterval(cola, 60_000).unref?.();
  const auto = () => void trabajo('remarketing.automaticos', async () => { const n = await programarAutomaticos(); if (n) console.log(`[remarketing] mensajes automáticos en cola: ${n}`); });
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
