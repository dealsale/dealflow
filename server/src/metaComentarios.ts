/**
 * Comentarios de Facebook e Instagram (publicaciones y anuncios) dentro de DealFlow.
 *
 * - Llegan por el mismo webhook de Meta: página → campo `feed` (item = comment); Instagram →
 *   campo `comments`. También se pueden traer a mano («Traer comentarios») si el webhook no llega.
 * - Se responden en público y/o por PRIVADO (private reply: un mensaje directo al que comentó;
 *   cuando contesta, el chat sigue en el Inbox con el asistente, como cualquier Messenger/IG).
 * - Automático (opcional): responde en público con una plantilla o con la IA de la tienda y le
 *   escribe al privado; una sola vez por persona y publicación.
 * - Oculta solo los comentarios con groserías o con palabras que la tienda elija (competencia…).
 *
 * Permisos de la app de Meta: pages_read_user_content, pages_manage_engagement (Facebook) e
 * instagram_manage_comments (Instagram); para el privado, pages_messaging / instagram_manage_messages.
 */
import { db, pj, registrarLog } from './db.js';
import { paginasDeTienda, resolverPagina, type PaginaConectada } from './meta.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

db.exec(`CREATE TABLE IF NOT EXISTS comentarios (
  id TEXT NOT NULL, store_id TEXT NOT NULL, canal TEXT NOT NULL, cuenta_id TEXT NOT NULL DEFAULT '', page_id TEXT NOT NULL DEFAULT '',
  post_id TEXT NOT NULL DEFAULT '', post_texto TEXT NOT NULL DEFAULT '', post_url TEXT NOT NULL DEFAULT '', ad_id TEXT NOT NULL DEFAULT '',
  parent_id TEXT NOT NULL DEFAULT '', autor_id TEXT NOT NULL DEFAULT '', autor TEXT NOT NULL DEFAULT '', texto TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'nuevo', respuesta TEXT NOT NULL DEFAULT '', privado TEXT NOT NULL DEFAULT '', oculto INTEGER NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', auto INTEGER NOT NULL DEFAULT 0, usuario TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT (datetime('now')), actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, id)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_comentarios_store ON comentarios (store_id, creado)');

export interface CfgComentarios {
  auto: boolean; modo: 'plantilla' | 'ia'; publicas: string[]; privado: string; enviarPrivado: boolean;
  ocultarGroserias: boolean; palabras: string[]; avisar: boolean;
}
const DEF: CfgComentarios = {
  auto: false, modo: 'plantilla',
  publicas: ['¡Hola {nombre}! 😊 Te escribimos al privado con toda la información.', '¡Hola {nombre}! Ya te enviamos un mensaje privado 💬', '¡Gracias por escribirnos, {nombre}! Revisa tu bandeja de mensajes 📩'],
  privado: '¡Hola {nombre}! 👋 Vi tu comentario en nuestra publicación. ¿Te cuento precios, tallas y cómo hacer tu pedido?',
  enviarPrivado: true, ocultarGroserias: true, palabras: [], avisar: true,
};
export function cfgComentarios(storeId: string): CfgComentarios {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'meta_comentarios'").get(storeId) as { config: string } | undefined;
  const c = { ...DEF, ...pj<Partial<CfgComentarios>>(r?.config || '{}', {}) };
  return { ...c, publicas: (c.publicas || []).filter((x) => String(x).trim()).slice(0, 10), palabras: (c.palabras || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 100) };
}
export function guardarCfgComentarios(storeId: string, p: Partial<CfgComentarios>): CfgComentarios {
  const a = cfgComentarios(storeId);
  const n: CfgComentarios = {
    auto: p.auto !== undefined ? !!p.auto : a.auto,
    modo: p.modo === 'ia' ? 'ia' : p.modo === 'plantilla' ? 'plantilla' : a.modo,
    publicas: Array.isArray(p.publicas) ? p.publicas.map((x) => String(x).slice(0, 300)).filter((x) => x.trim()).slice(0, 10) : a.publicas,
    privado: p.privado !== undefined ? String(p.privado).slice(0, 640) : a.privado,
    enviarPrivado: p.enviarPrivado !== undefined ? !!p.enviarPrivado : a.enviarPrivado,
    ocultarGroserias: p.ocultarGroserias !== undefined ? !!p.ocultarGroserias : a.ocultarGroserias,
    palabras: Array.isArray(p.palabras) ? p.palabras.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 100) : a.palabras,
    avisar: p.avisar !== undefined ? !!p.avisar : a.avisar,
  };
  if (!n.publicas.length) n.publicas = DEF.publicas;
  db.prepare(`INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'meta_comentarios', ?, datetime('now'))
    ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`).run(storeId, JSON.stringify(n));
  return n;
}

// ── Filtro de groserías (español de Colombia) ─────────────────────────────────────────────────
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const GROSERIAS = ['hijueputa', 'hijo de puta', 'hp', 'gonorrea', 'malparido', 'malparida', 'puta', 'puto', 'marica', 'pirobo', 'piroba', 'careverga', 'carechimba', 'chimba de', 'verga', 'mierda', 'culo', 'perra', 'zorra', 'imbecil', 'estupido', 'estupida', 'idiota'];
export function motivoOcultar(texto: string, cfg: CfgComentarios): string {
  const t = ` ${norm(texto).replace(/[^a-z0-9ñ@#]+/g, ' ')} `;
  for (const p of cfg.palabras) {
    const w = norm(p).replace(/[^a-z0-9ñ@#]+/g, ' ').trim();
    if (w && (t.includes(` ${w} `) || (w.length > 4 && t.includes(w)))) return `contiene «${p}»`;
  }
  // Palabras cortas: exactas; las demás también con plural o variantes (malparidos, gonorreas…).
  if (cfg.ocultarGroserias) for (const g of GROSERIAS) if (t.includes(g.length <= 3 ? ` ${g} ` : ` ${g}`)) return 'lenguaje ofensivo';
  return '';
}

// ── Llamadas a Meta ───────────────────────────────────────────────────────────────────────────
async function graph<T>(token: string, ruta: string, metodo: 'GET' | 'POST', datos?: Record<string, unknown>): Promise<{ ok: true; body: T } | { ok: false; error: string; codigo?: number }> {
  try {
    const url = metodo === 'GET' ? `${GRAPH}/${ruta}${ruta.includes('?') ? '&' : '?'}${new URLSearchParams({ ...(datos as Record<string, string> || {}), access_token: token })}` : `${GRAPH}/${ruta}?access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { method: metodo, headers: metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}, body: metodo === 'POST' ? JSON.stringify(datos || {}) : undefined, signal: AbortSignal.timeout(20_000) });
    const b = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string; code?: number } };
    if (!r.ok || b.error) return { ok: false, error: traducir(b.error), codigo: b.error?.code };
    return { ok: true, body: b };
  } catch { return { ok: false, error: 'No pudimos hablar con Meta.' }; }
}
function traducir(e?: { message?: string; error_user_msg?: string; code?: number }): string {
  const m = e?.error_user_msg || e?.message || 'Meta no aceptó la acción.';
  if (e?.code === 190) return 'El acceso de la página venció: reconecta Messenger e Instagram en Integraciones.';
  if (e?.code === 10 || e?.code === 200 || /permission|permiso/i.test(m)) return `Falta un permiso en la app de Meta (${m}). Revisa pages_manage_engagement, pages_read_user_content e instagram_manage_comments y vuelve a conectar.`;
  if (/already.*(replied|reply)|private repl/i.test(m)) return 'Meta solo permite un mensaje privado por comentario (y dentro de los 7 días).';
  return m.slice(0, 300);
}

function paginaDe(storeId: string, cuentaId: string): PaginaConectada | undefined {
  return paginasDeTienda(storeId).find((p) => p.pageId === cuentaId || p.igId === cuentaId);
}

export interface Comentario {
  id: string; canal: 'facebook' | 'instagram'; postId: string; postTexto: string; postUrl: string; adId: string; parentId: string;
  autorId: string; autor: string; texto: string; estado: 'nuevo' | 'respondido' | 'oculto' | 'ignorado'; respuesta: string; privado: string;
  oculto: boolean; motivo: string; error: string; auto: boolean; usuario: string; creado: string;
}
const deFila = (r: Fila): Comentario => ({
  id: txt(r.id), canal: txt(r.canal) === 'instagram' ? 'instagram' : 'facebook', postId: txt(r.post_id), postTexto: txt(r.post_texto), postUrl: txt(r.post_url),
  adId: txt(r.ad_id), parentId: txt(r.parent_id), autorId: txt(r.autor_id), autor: txt(r.autor), texto: txt(r.texto), estado: txt(r.estado) as Comentario['estado'],
  respuesta: txt(r.respuesta), privado: txt(r.privado), oculto: !!r.oculto, motivo: txt(r.motivo), error: txt(r.error), auto: !!r.auto, usuario: txt(r.usuario), creado: txt(r.creado),
});
function leer(storeId: string, id: string): Comentario | null {
  const r = db.prepare('SELECT * FROM comentarios WHERE store_id = ? AND id = ?').get(storeId, id) as Fila | undefined;
  return r ? deFila(r) : null;
}
/** Primer nombre para saludar: «Laura Gómez» → Laura; «@maria.p_92» → Maria. */
const nombreCorto = (n: string) => {
  const usuario = n.trim().startsWith('@');
  let x = (n.replace(/^@/, '').trim().split(/\s+/)[0] || '');
  if (usuario) x = x.split(/[._\d]/)[0] || '';
  if (x.length < 2) return '';
  return (x.charAt(0).toUpperCase() + x.slice(1)).slice(0, 30);
};
const llenar = (t: string, c: { autor: string }) => t.replace(/\{nombre\}/g, nombreCorto(c.autor)).replace(/\s+([!?.,])/g, '$1').replace(/¡Hola\s*!/g, '¡Hola!').trim();

/** Responde en público el comentario. */
export async function responderPublico(storeId: string, id: string, texto: string, usuario = '', auto = false): Promise<{ ok: true } | { error: string }> {
  const c = leer(storeId, id);
  if (!c) return { error: 'Ese comentario no existe.' };
  const t = texto.trim().slice(0, 2000);
  if (!t) return { error: 'Escribe la respuesta.' };
  const pg = paginaDe(storeId, txt((db.prepare('SELECT cuenta_id FROM comentarios WHERE store_id = ? AND id = ?').get(storeId, id) as Fila).cuenta_id));
  if (!pg) return { error: 'La página de este comentario ya no está conectada.' };
  const r = await graph<{ id?: string }>(pg.token, c.canal === 'instagram' ? `${id}/replies` : `${id}/comments`, 'POST', { message: t });
  db.prepare("UPDATE comentarios SET respuesta = CASE WHEN ? THEN ? ELSE respuesta END, estado = CASE WHEN ? AND estado != 'oculto' THEN 'respondido' ELSE estado END, error = ?, auto = MAX(auto, ?), usuario = CASE WHEN ? != '' THEN ? ELSE usuario END, actualizado = datetime('now') WHERE store_id = ? AND id = ?")
    .run(r.ok ? 1 : 0, t, r.ok ? 1 : 0, r.ok ? '' : r.error, auto ? 1 : 0, usuario, usuario, storeId, id);
  if (!r.ok) { registrarLog(storeId, 'warn', 'comentarios', `No se pudo responder el comentario de ${c.autor}: ${r.error}`); return { error: r.error }; }
  return { ok: true };
}

/** Mensaje privado al que comentó (abre el chat en Messenger/Instagram). Uno por comentario. */
export async function responderPrivado(storeId: string, id: string, texto: string, usuario = '', auto = false): Promise<{ ok: true } | { error: string }> {
  const c = leer(storeId, id);
  if (!c) return { error: 'Ese comentario no existe.' };
  if (c.privado) return { error: 'A este comentario ya se le envió un mensaje privado (Meta permite solo uno).' };
  const t = texto.trim().slice(0, 640);
  if (!t) return { error: 'Escribe el mensaje privado.' };
  const pg = paginaDe(storeId, txt((db.prepare('SELECT cuenta_id FROM comentarios WHERE store_id = ? AND id = ?').get(storeId, id) as Fila).cuenta_id));
  if (!pg) return { error: 'La página de este comentario ya no está conectada.' };
  const r = await graph<{ message_id?: string }>(pg.token, `${pg.pageId}/messages`, 'POST', { recipient: { comment_id: id }, message: { text: t } });
  db.prepare("UPDATE comentarios SET privado = CASE WHEN ? THEN ? ELSE privado END, estado = CASE WHEN ? AND estado = 'nuevo' THEN 'respondido' ELSE estado END, error = ?, auto = MAX(auto, ?), usuario = CASE WHEN ? != '' THEN ? ELSE usuario END, actualizado = datetime('now') WHERE store_id = ? AND id = ?")
    .run(r.ok ? 1 : 0, t, r.ok ? 1 : 0, r.ok ? '' : r.error, auto ? 1 : 0, usuario, usuario, storeId, id);
  if (!r.ok) { registrarLog(storeId, 'warn', 'comentarios', `No se pudo enviar el privado a ${c.autor}: ${r.error}`); return { error: r.error }; }
  return { ok: true };
}

/** Oculta (o vuelve a mostrar) el comentario en Facebook/Instagram. */
export async function ocultar(storeId: string, id: string, ocultarlo: boolean, motivo = ''): Promise<{ ok: true } | { error: string }> {
  const c = leer(storeId, id);
  if (!c) return { error: 'Ese comentario no existe.' };
  const pg = paginaDe(storeId, txt((db.prepare('SELECT cuenta_id FROM comentarios WHERE store_id = ? AND id = ?').get(storeId, id) as Fila).cuenta_id));
  if (!pg) return { error: 'La página de este comentario ya no está conectada.' };
  const r = await graph<{ success?: boolean }>(pg.token, id, 'POST', c.canal === 'instagram' ? { hide: ocultarlo } : { is_hidden: ocultarlo });
  if (!r.ok) return { error: r.error };
  db.prepare("UPDATE comentarios SET oculto = ?, estado = CASE WHEN ? THEN 'oculto' WHEN respuesta != '' OR privado != '' THEN 'respondido' ELSE 'nuevo' END, motivo = ?, actualizado = datetime('now') WHERE store_id = ? AND id = ?")
    .run(ocultarlo ? 1 : 0, ocultarlo ? 1 : 0, ocultarlo ? motivo : '', storeId, id);
  return { ok: true };
}

export function ignorar(storeId: string, id: string, si: boolean): boolean {
  return db.prepare("UPDATE comentarios SET estado = CASE WHEN ? THEN 'ignorado' WHEN respuesta != '' OR privado != '' THEN 'respondido' ELSE 'nuevo' END, actualizado = datetime('now') WHERE store_id = ? AND id = ? AND oculto = 0")
    .run(si ? 1 : 0, storeId, id).changes > 0;
}

/** Respuesta pública sugerida por la IA de la tienda (corta, amable y que invite al privado). */
export async function sugerirRespuesta(storeId: string, id: string): Promise<{ texto: string } | { error: string }> {
  const c = leer(storeId, id);
  if (!c) return { error: 'Ese comentario no existe.' };
  const ai = await import('./ai.js');
  const ia = ai.resolverTexto(storeId);
  if (!ia) return { error: 'Conecta una IA en Integraciones (por ejemplo Claude) para sugerir respuestas.' };
  const asst = db.prepare('SELECT nombre, instrucciones FROM assistants WHERE store_id = ?').get(storeId) as { nombre: string; instrucciones: string } | undefined;
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || 'la tienda';
  const system = `Eres el community manager de ${tienda} (tienda colombiana que vende por WhatsApp y redes, con pago contra entrega). Respondes comentarios PÚBLICOS en ${c.canal === 'instagram' ? 'Instagram' : 'Facebook'}.
Reglas: 1 o 2 frases cortas, cálidas, en español de Colombia, con máximo 1 emoji. Llama a la persona por su primer nombre si lo tienes. NO pongas precios, datos personales ni enlaces en público: invita a seguir por mensaje privado ("te escribimos al privado"). Si es una queja, discúlpate y pide que te escriba al privado para ayudarle. Responde SOLO con el texto del comentario.
Contexto del negocio (instrucciones del asistente, resumen): ${String(asst?.instrucciones || '').slice(0, 1500)}`;
  const user = `Publicación: "${c.postTexto.slice(0, 400) || '(sin texto)'}"\nComentario de ${c.autor || 'un cliente'}: "${c.texto.slice(0, 500)}"`;
  const out = await ai.completarTexto(storeId, ia, { system, mensajes: [{ role: 'user', content: user }], maxTokens: 160, temperature: 0.6, tipo: 'comentarios', timeoutMs: 30_000 });
  const t = String(out || '').trim().replace(/^["“]|["”]$/g, '');
  return t ? { texto: t.slice(0, 600) } : { error: 'La IA no respondió. Intenta de nuevo.' };
}

// ── Entrada: webhook o sincronización ─────────────────────────────────────────────────────────
interface Nuevo { id: string; canal: 'facebook' | 'instagram'; cuentaId: string; postId: string; parentId: string; autorId: string; autor: string; texto: string; adId?: string; postTexto?: string; postUrl?: string; creado?: string }

/** Guarda un comentario nuevo y, si toca, lo oculta o lo responde solo. Devuelve true si era nuevo. */
export async function recibirComentario(storeId: string, n: Nuevo, opciones: { automatico?: boolean } = {}): Promise<boolean> {
  const pg = paginaDe(storeId, n.cuentaId);
  if (!pg || !n.id) return false;
  // Los comentarios de la propia página / cuenta (nuestras respuestas) no se guardan.
  if (n.autorId && (n.autorId === pg.pageId || n.autorId === pg.igId)) return false;
  const ins = db.prepare(`INSERT OR IGNORE INTO comentarios (id, store_id, canal, cuenta_id, page_id, post_id, post_texto, post_url, ad_id, parent_id, autor_id, autor, texto, creado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, COALESCE(?, datetime('now')))`)
    .run(n.id, storeId, n.canal, n.cuentaId, pg.pageId, n.postId, (n.postTexto || '').slice(0, 1000), n.postUrl || '', n.adId || '', n.parentId, n.autorId, n.autor.slice(0, 120), n.texto.slice(0, 4000), n.creado || null);
  if (!ins.changes) return false;
  if (!n.postUrl) void completarPublicacion(storeId, pg, n).catch(() => {});
  const cfg = cfgComentarios(storeId);
  const motivo = motivoOcultar(n.texto, cfg);
  if (motivo) {
    const r = await ocultar(storeId, n.id, true, motivo);
    registrarLog(storeId, 'info', 'comentarios', 'ok' in r ? `Ocultamos un comentario de ${n.autor} (${motivo}).` : `No se pudo ocultar un comentario de ${n.autor}: ${r.error}`);
    return true;
  }
  // Las respuestas dentro de un hilo (a otra respuesta) no se contestan solas.
  const esPrincipal = !n.parentId || n.parentId === n.postId;
  const clave = `${storeId}:${n.postId}:${n.autorId}`;
  if (cfg.auto && opciones.automatico !== false && esPrincipal && !enCurso.has(clave)) {
    const yaRespondido = db.prepare("SELECT 1 FROM comentarios WHERE store_id = ? AND post_id = ? AND autor_id = ? AND id != ? AND (respuesta != '' OR privado != '') LIMIT 1").get(storeId, n.postId, n.autorId, n.id);
    if (!yaRespondido) {
      // Reservado YA (antes de cualquier espera): si la misma persona comenta dos veces seguidas, se responde una.
      enCurso.add(clave);
      setTimeout(() => enCurso.delete(clave), 10 * 60_000).unref?.();
      const espera = Number(process.env.COMENTARIOS_ESPERA_MS ?? 25_000);
      const tarea = () => void responderSolo(storeId, n.id).catch((e) => console.error('[comentarios] auto', e));
      if (espera > 0) setTimeout(tarea, espera + Math.floor(Math.random() * espera)).unref?.(); else await responderSolo(storeId, n.id);
      return true;
    }
  }
  if (cfg.avisar) void import('./push.js').then((m) => m.enviarPush(storeId, 'contactos', `💬 Comentario en ${n.canal === 'instagram' ? 'Instagram' : 'Facebook'}`, `${nombreCorto(n.autor) || 'Alguien'}: ${n.texto.slice(0, 120)}`, { url: '/comentarios' })).catch(() => {});
  return true;
}

const enCurso = new Set<string>();

/** Respuesta automática: pública (plantilla o IA) + privado. */
async function responderSolo(storeId: string, id: string): Promise<void> {
  const c = leer(storeId, id);
  if (!c || c.estado !== 'nuevo') return;
  const cfg = cfgComentarios(storeId);
  let publica = '';
  if (cfg.modo === 'ia') { const s = await sugerirRespuesta(storeId, id); if ('texto' in s) publica = s.texto; }
  if (!publica) {
    const n = (db.prepare("SELECT COUNT(*) n FROM comentarios WHERE store_id = ? AND auto = 1").get(storeId) as { n: number }).n;
    publica = llenar(cfg.publicas[n % cfg.publicas.length] || DEF.publicas[0], c);
  }
  await responderPublico(storeId, id, publica, '', true);
  if (cfg.enviarPrivado && cfg.privado.trim()) await responderPrivado(storeId, id, llenar(cfg.privado, c), '', true);
}

/** Texto y enlace de la publicación (para mostrar a qué le comentaron). */
async function completarPublicacion(storeId: string, pg: PaginaConectada, n: Nuevo): Promise<void> {
  if (!n.postId) return;
  const r = n.canal === 'instagram'
    ? await graph<{ caption?: string; permalink?: string }>(pg.token, n.postId, 'GET', { fields: 'caption,permalink' })
    : await graph<{ message?: string; permalink_url?: string }>(pg.token, n.postId, 'GET', { fields: 'message,permalink_url' });
  if (!r.ok) return;
  const b = r.body as { caption?: string; permalink?: string; message?: string; permalink_url?: string };
  db.prepare("UPDATE comentarios SET post_texto = CASE WHEN post_texto = '' THEN ? ELSE post_texto END, post_url = ? WHERE store_id = ? AND post_id = ?")
    .run(String(b.caption || b.message || '').slice(0, 1000), String(b.permalink || b.permalink_url || ''), storeId, n.postId);
}

/** Cambios del webhook de Meta (entry.changes). object = 'page' (Facebook) o 'instagram'. */
export function procesarCambios(object: 'page' | 'instagram', routeId: string, cambios: { field?: string; value?: Record<string, unknown> }[]): void {
  const destino = resolverPagina(routeId);
  if (!destino) return;
  for (const ch of cambios) {
    const v = (ch.value || {}) as Record<string, unknown>;
    let n: Nuevo | null = null;
    if (object === 'page' && ch.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
      const from = (v.from || {}) as { id?: string; name?: string };
      n = { id: txt(v.comment_id), canal: 'facebook', cuentaId: routeId, postId: txt(v.post_id), parentId: txt(v.parent_id), autorId: txt(from.id), autor: txt(from.name), texto: txt(v.message) };
    } else if (object === 'instagram' && (ch.field === 'comments' || ch.field === 'live_comments')) {
      const from = (v.from || {}) as { id?: string; username?: string };
      const media = (v.media || {}) as { id?: string; ad_id?: string };
      n = { id: txt(v.id), canal: 'instagram', cuentaId: routeId, postId: txt(media.id), parentId: txt(v.parent_id), autorId: txt(from.id), autor: from.username ? '@' + from.username : '', texto: txt(v.text), adId: txt(media.ad_id) };
    }
    if (n && n.id) void recibirComentario(destino.storeId, n).catch((e) => console.error('[comentarios] webhook', e));
  }
}

/** Trae los comentarios recientes de las últimas publicaciones (por si el webhook no llega). */
export async function sincronizar(storeId: string): Promise<{ nuevos: number; errores: string[] }> {
  let nuevos = 0;
  const errores: string[] = [];
  for (const pg of paginasDeTienda(storeId)) {
    const fb = await graph<{ data?: { id: string; message?: string; permalink_url?: string; comments?: { data?: { id: string; message?: string; created_time?: string; from?: { id?: string; name?: string }; parent?: { id?: string } }[] } }[] }>(
      pg.token, `${pg.pageId}/published_posts`, 'GET', { fields: 'id,message,permalink_url,comments.limit(50).order(reverse_chronological){id,message,created_time,from,parent}', limit: '10' });
    if (!fb.ok) errores.push(`Facebook (${pg.nombre}): ${fb.error}`);
    else for (const p of fb.body.data || []) for (const c of p.comments?.data || []) {
      if (await recibirComentario(storeId, { id: c.id, canal: 'facebook', cuentaId: pg.pageId, postId: p.id, parentId: c.parent?.id || p.id, autorId: txt(c.from?.id), autor: txt(c.from?.name), texto: txt(c.message), postTexto: txt(p.message), postUrl: txt(p.permalink_url), creado: c.created_time ? c.created_time.replace('T', ' ').slice(0, 19) : undefined }, { automatico: false })) nuevos++;
    }
    if (!pg.igId) continue;
    const ig = await graph<{ data?: { id: string; caption?: string; permalink?: string; comments?: { data?: { id: string; text?: string; timestamp?: string; username?: string; from?: { id?: string; username?: string } }[] } }[] }>(
      pg.token, `${pg.igId}/media`, 'GET', { fields: 'id,caption,permalink,comments.limit(50){id,text,timestamp,username,from}', limit: '10' });
    if (!ig.ok) errores.push(`Instagram (${pg.nombre}): ${ig.error}`);
    else for (const m of ig.body.data || []) for (const c of m.comments?.data || []) {
      const user = c.from?.username || c.username || '';
      if (await recibirComentario(storeId, { id: c.id, canal: 'instagram', cuentaId: pg.igId, postId: m.id, parentId: '', autorId: txt(c.from?.id), autor: user ? '@' + user : '', texto: txt(c.text), postTexto: txt(m.caption), postUrl: txt(m.permalink), creado: c.timestamp ? c.timestamp.replace('T', ' ').slice(0, 19) : undefined }, { automatico: false })) nuevos++;
    }
  }
  return { nuevos, errores };
}

export function listar(storeId: string, filtro: { estado?: string; canal?: string; q?: string }) {
  const where: string[] = ['store_id = ?'];
  const args: unknown[] = [storeId];
  if (filtro.estado && ['nuevo', 'respondido', 'oculto', 'ignorado'].includes(filtro.estado)) { where.push('estado = ?'); args.push(filtro.estado); }
  if (filtro.canal === 'facebook' || filtro.canal === 'instagram') { where.push('canal = ?'); args.push(filtro.canal); }
  if (filtro.q) { where.push('(texto LIKE ? OR autor LIKE ? OR post_texto LIKE ?)'); const q = `%${filtro.q.slice(0, 60)}%`; args.push(q, q, q); }
  const filas = (db.prepare(`SELECT * FROM comentarios WHERE ${where.join(' AND ')} ORDER BY creado DESC LIMIT 200`).all(...args) as Fila[]).map(deFila);
  const cuenta = db.prepare("SELECT SUM(estado = 'nuevo') nuevos, SUM(estado = 'respondido') respondidos, SUM(estado = 'oculto') ocultos, SUM(estado = 'ignorado') ignorados, COUNT(*) total, MAX(creado) ultimo FROM comentarios WHERE store_id = ?").get(storeId) as Record<string, number | string | null>;
  const paginas = paginasDeTienda(storeId).map((p) => ({ nombre: p.nombre, instagram: !!p.igId }));
  return { comentarios: filas, resumen: { nuevos: Number(cuenta.nuevos) || 0, respondidos: Number(cuenta.respondidos) || 0, ocultos: Number(cuenta.ocultos) || 0, ignorados: Number(cuenta.ignorados) || 0, total: Number(cuenta.total) || 0, ultimo: txt(cuenta.ultimo) }, paginas, config: cfgComentarios(storeId) };
}
