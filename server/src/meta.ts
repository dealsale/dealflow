import { db, uid, pj, registrarLog } from './db.js';

/**
 * Canales de Meta Messaging: Facebook Messenger e Instagram DM.
 *
 * Reutiliza TODA la tubería del asistente (mismo Inbox, misma IA, mismo
 * seguimiento): un lead de estos canales se guarda con canal 'messenger' o
 * 'instagram' y con wa_id en el formato de ruteo `fb:<pageId>:<psid>` o
 * `ig:<igId>:<psid>`. El envío se hace en sendWhatsappText, que detecta ese
 * prefijo y llama aquí (así no hay que tocar el motor de IA).
 *
 * La conexión de la tienda (token de página + IG vinculado) se guarda como una
 * integración tipo 'meta_paginas'. Para el alta en un clic se usa META_APP_ID/
 * META_APP_SECRET y un Config ID de "Facebook Login for Business" con permisos
 * pages_messaging, instagram_manage_messages, pages_manage_metadata,
 * pages_read_engagement (META_MESSAGING_CONFIG_ID).
 */

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

interface PaginaConectada { pageId: string; nombre: string; token: string; igId?: string }

/** Páginas/IG conectados de una tienda. */
function paginasDeTienda(storeId: string): PaginaConectada[] {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'meta_paginas'").get(storeId) as { config: string } | undefined;
  if (!row) return [];
  return pj<{ paginas: PaginaConectada[] }>(row.config, { paginas: [] }).paginas || [];
}

/** Guarda/actualiza las páginas conectadas de una tienda. */
export function guardarPaginas(storeId: string, paginas: PaginaConectada[]): void {
  db.prepare(
    `INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'meta_paginas', ?, datetime('now'))
     ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = datetime('now')`,
  ).run(storeId, JSON.stringify({ paginas }));
}

/** Encuentra la tienda (y la página) dueña de un pageId o igId entrante. */
function resolverPagina(routeId: string): { storeId: string; pagina: PaginaConectada } | null {
  const rows = db.prepare("SELECT store_id, config FROM store_integrations WHERE tipo = 'meta_paginas'").all() as { store_id: string; config: string }[];
  for (const r of rows) {
    const paginas = pj<{ paginas: PaginaConectada[] }>(r.config, { paginas: [] }).paginas || [];
    const pagina = paginas.find((p) => p.pageId === routeId || p.igId === routeId);
    if (pagina) return { storeId: r.store_id, pagina };
  }
  return null;
}

/** Token de página de una tienda por pageId o igId. */
function tokenDe(storeId: string, routeId: string): string {
  const p = paginasDeTienda(storeId).find((x) => x.pageId === routeId || x.igId === routeId);
  return p?.token || '';
}

/** Crea o encuentra el lead de un canal Meta y devuelve su id. */
function asegurarLeadMeta(storeId: string, canal: 'messenger' | 'instagram', routeId: string, psid: string, nombre: string): string {
  const waId = `${canal === 'instagram' ? 'ig' : 'fb'}:${routeId}:${psid}`;
  const existente = db.prepare('SELECT id FROM leads WHERE store_id = ? AND wa_id = ?').get(storeId, waId) as { id: string } | undefined;
  if (existente) {
    if (nombre) db.prepare('UPDATE leads SET nombre = ? WHERE id = ? AND (nombre = ? OR nombre = ?)').run(nombre, existente.id, waId, psid);
    return existente.id;
  }
  const id = uid();
  db.prepare('INSERT INTO leads (id, store_id, nombre, tel, etapa, asignado, wa_id, canal) VALUES (?,?,?,?,?,?,?,?)').run(
    id, storeId, nombre || (canal === 'instagram' ? 'Instagram' : 'Messenger'), '', 'Explorando', 'Asistente (bot)', waId, canal,
  );
  return id;
}

/**
 * Procesa un webhook de Messenger (object='page') o Instagram (object='instagram').
 * Crea/actualiza el lead, guarda el mensaje entrante y dispara al asistente.
 */
export function handleMetaWebhook(object: 'page' | 'instagram', body: unknown): void {
  const canal = object === 'instagram' ? 'instagram' : 'messenger';
  const b = body as { entry?: { id?: string; messaging?: Record<string, unknown>[] }[] };
  for (const entry of b.entry || []) {
    const routeId = String(entry.id || '');
    for (const m of entry.messaging || []) {
      const msg = m as { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean; attachments?: { type?: string }[] }; read?: unknown; delivery?: unknown };
      if (!msg.message || msg.message.is_echo) continue; // ecos de lo que enviamos nosotros: ignorar
      const psid = String(msg.sender?.id || '');
      if (!psid || !routeId) continue;
      const destinatario = resolverPagina(routeId);
      if (!destinatario) { console.warn(`[meta] mensaje para una página no conectada (${routeId})`); continue; }
      const texto = String(msg.message.text || '').trim() || (msg.message.attachments?.length ? '[el cliente envió un archivo]' : '');
      if (!texto) continue;
      try {
        const leadId = asegurarLeadMeta(destinatario.storeId, canal, routeId, psid, '');
        db.prepare('UPDATE leads SET seguimiento_nivel = 0 WHERE id = ?').run(leadId);
        db.prepare("INSERT INTO messages (id, lead_id, de, texto) VALUES (?,?, 'cliente', ?)").run(uid(), leadId, texto);
        void (async () => {
          try { const a = await import('./ai.js'); await a.maybeAutoReply(destinatario.storeId, leadId); }
          catch (e) { console.error('[meta] error IA', e); }
        })();
      } catch (e) { console.error('[meta] error procesando mensaje', e); }
    }
  }
}

/**
 * Envía un texto por Messenger/Instagram. `to` viene como `fb:<pageId>:<psid>` o
 * `ig:<igId>:<psid>`. La llama sendWhatsappText al detectar el prefijo.
 */
export async function sendMetaText(storeId: string, to: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const m = to.match(/^(fb|ig):([^:]+):(.+)$/);
  if (!m) return { ok: false, error: 'Destino de Meta inválido.' };
  const routeId = m[2];
  const psid = m[3];
  const token = tokenDe(storeId, routeId);
  if (!token) { registrarLog(storeId, 'error', 'envio', `No se envió el mensaje: la página de ${m[1] === 'ig' ? 'Instagram' : 'Messenger'} no está conectada.`); return { ok: false, error: 'Página no conectada.' }; }
  try {
    const res = await fetch(`${GRAPH}/${routeId}/messages?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text: texto } }),
    });
    const rb = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      const err = rb.error?.message || 'Meta no aceptó el mensaje.';
      registrarLog(storeId, 'error', 'envio', `Meta rechazó el mensaje (${m[1]}): ${err}`);
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos hablar con Meta.' };
  }
}

/**
 * Alta en un clic: intercambia el `code` del popup de Facebook por un token de
 * usuario, lista sus páginas (con token y el IG vinculado), suscribe nuestra app
 * a los webhooks de cada página y las guarda en la tienda.
 */
export async function conectarPaginasMeta(storeId: string, code: string): Promise<{ ok: true; paginas: { nombre: string; conIg: boolean }[] } | { ok: false; error: string }> {
  const appId = process.env.META_APP_ID || '';
  const secret = process.env.META_APP_SECRET || '';
  if (!appId || !secret) return { ok: false, error: 'Falta configurar META_APP_ID / META_APP_SECRET en el servidor.' };
  try {
    // 1) code → token de usuario (flujo JS SDK: sin redirect_uri, igual que el de anuncios).
    const tokRes = await fetch(`${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`);
    const tok = (await tokRes.json()) as { access_token?: string; error?: { message?: string } };
    if (!tok.access_token) return { ok: false, error: tok.error?.message || 'No pudimos validar el acceso con Meta.' };
    // 2) páginas del usuario (con token de página e IG vinculado).
    const pagRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(tok.access_token)}`);
    const pag = (await pagRes.json()) as { data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[]; error?: { message?: string } };
    if (!pag.data?.length) return { ok: false, error: pag.error?.message || 'No encontramos páginas para conectar. Revisa los permisos.' };
    const paginas: PaginaConectada[] = [];
    for (const p of pag.data) {
      // 3) suscribir nuestra app a los webhooks de la página.
      try {
        await fetch(`${GRAPH}/${p.id}/subscribed_apps?access_token=${encodeURIComponent(p.access_token)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscribed_fields: 'messages,messaging_postbacks,message_reactions,feed' }),
        });
      } catch { /* seguimos: al menos guardamos la página */ }
      paginas.push({ pageId: p.id, nombre: p.name, token: p.access_token, igId: p.instagram_business_account?.id });
    }
    guardarPaginas(storeId, paginas);
    registrarLog(storeId, 'info', 'meta', `Conectadas ${paginas.length} página(s) de Meta (Messenger/Instagram).`);
    return { ok: true, paginas: paginas.map((p) => ({ nombre: p.nombre, conIg: !!p.igId })) };
  } catch {
    return { ok: false, error: 'No pudimos completar la conexión con Meta.' };
  }
}

/** ¿Qué canales de Meta tiene conectados la tienda? (para la UI). */
export function metaConectado(storeId: string): { messenger: boolean; instagram: boolean; paginas: string[] } {
  const paginas = paginasDeTienda(storeId);
  return { messenger: paginas.length > 0, instagram: paginas.some((p) => !!p.igId), paginas: paginas.map((p) => p.nombre) };
}
