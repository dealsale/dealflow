/**
 * Fase C: le reportamos a Meta las ventas (y los chats calificados) que salieron de sus
 * anuncios, con la API de Conversiones para mensajería (action_source=business_messaging).
 * Así Meta optimiza las campañas hacia gente que COMPRA, no solo hacia gente que escribe.
 *
 * - WhatsApp: se identifica al cliente con el ctwa_clid del clic en el anuncio + la WABA.
 * - Messenger: con el page_id y el PSID del cliente.
 * Solo se reportan chats que entraron por un anuncio (los orgánicos no le sirven a Meta).
 *
 * Se revisa cada minuto y, además, ~2 minutos después de cada pedido nuevo.
 *
 * Eventos:
 *   - Purchase: al crearse el pedido (por defecto) o cuando se entrega (si la tienda lo
 *     prefiere: contra entrega, solo cuenta lo que se cobró). Con valor y moneda COP.
 *   - LeadSubmitted: el cliente del anuncio respondió (2+ mensajes). Ayuda a Meta mientras
 *     todavía hay pocas compras.
 * Cada evento lleva event_id fijo: si se envía dos veces, Meta lo cuenta una sola.
 */
import { db, pj, registrarLog } from './db.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

db.exec(`CREATE TABLE IF NOT EXISTS capi_eventos (
  store_id TEXT NOT NULL,
  clave TEXT NOT NULL,
  evento TEXT NOT NULL,
  ref_id TEXT NOT NULL DEFAULT '',
  valor INTEGER NOT NULL DEFAULT 0,
  canal TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'enviado',
  error TEXT NOT NULL DEFAULT '',
  intentos INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, clave)
)`);

export interface CfgCapi { activo: boolean; datasetId: string; compra: 'pedido' | 'entregado'; leads: boolean; testCode: string }
const DEF: CfgCapi = { activo: false, datasetId: '', compra: 'pedido', leads: true, testCode: '' };

export function cfgCapi(storeId: string): CfgCapi {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'meta_capi'").get(storeId) as { config: string } | undefined;
  return { ...DEF, ...pj<Partial<CfgCapi>>(r?.config || '{}', {}) };
}
export function guardarCfgCapi(storeId: string, c: Partial<CfgCapi>): CfgCapi {
  const act = cfgCapi(storeId);
  const n: CfgCapi = {
    activo: c.activo !== undefined ? !!c.activo : act.activo,
    datasetId: c.datasetId !== undefined ? String(c.datasetId).replace(/\D/g, '') : act.datasetId,
    compra: c.compra === 'entregado' ? 'entregado' : c.compra === 'pedido' ? 'pedido' : act.compra,
    leads: c.leads !== undefined ? !!c.leads : act.leads,
    testCode: c.testCode !== undefined ? String(c.testCode).trim().slice(0, 40) : act.testCode,
  };
  db.prepare(`INSERT INTO store_integrations (store_id, tipo, config, updated_at) VALUES (?, 'meta_capi', ?, datetime('now'))
    ON CONFLICT(store_id, tipo) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`).run(storeId, JSON.stringify(n));
  return n;
}

function waDe(storeId: string): { waba: string; token: string } {
  const w = db.prepare('SELECT waba_id, access_token FROM whatsapp WHERE store_id = ? AND conectado = 1').get(storeId) as { waba_id: string; access_token: string } | undefined;
  return { waba: w?.waba_id || '', token: w?.access_token || '' };
}
function tokenAds(storeId: string): string {
  return (db.prepare('SELECT access_token FROM ads_cuentas WHERE store_id = ? AND conectada = 1').get(storeId) as { access_token: string } | undefined)?.access_token || '';
}
function tokenPagina(storeId: string, pageId: string): string {
  const r = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'meta_paginas'").get(storeId) as { config: string } | undefined;
  return (pj<{ paginas: { pageId: string; token: string }[] }>(r?.config || '{}', { paginas: [] }).paginas || []).find((p) => p.pageId === pageId)?.token || '';
}

/** Busca (o crea) el dataset de la cuenta de WhatsApp Business. */
export async function detectarDataset(storeId: string): Promise<{ datasetId: string } | { error: string }> {
  const { waba, token } = waDe(storeId);
  if (!waba || !token) return { error: 'Conecta primero tu WhatsApp (API oficial) para encontrar el dataset.' };
  try {
    const g = await fetch(`${GRAPH}/${waba}/dataset`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const gb = (await g.json().catch(() => ({}))) as { data?: { dataset_id?: string; id?: string }[]; id?: string; error?: { message?: string } };
    let id = gb.data?.[0]?.dataset_id || gb.data?.[0]?.id || gb.id || '';
    if (!id) {
      const p = await fetch(`${GRAPH}/${waba}/dataset`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
      const pb = (await p.json().catch(() => ({}))) as { id?: string; dataset_id?: string; error?: { message?: string } };
      id = pb.id || pb.dataset_id || '';
      if (!id) return { error: pb.error?.message || gb.error?.message || 'Meta no devolvió el dataset. Créalo en el Administrador de eventos y pega su ID.' };
    }
    guardarCfgCapi(storeId, { datasetId: id });
    return { datasetId: id };
  } catch {
    return { error: 'No pudimos hablar con Meta.' };
  }
}

interface Evento { clave: string; evento: 'Purchase' | 'LeadSubmitted'; refId: string; valor: number; time: number; canal: 'whatsapp' | 'messenger'; user: Record<string, string>; pageId?: string }

/** Datos del cliente para Meta según de dónde vino el chat. Null si no vino de un anuncio. */
function usuarioDe(storeId: string, lead: { wa_id: string; canal: string; ad_ref: string }): { canal: 'whatsapp' | 'messenger'; user: Record<string, string>; pageId?: string } | null {
  const ad = pj<{ clid?: string }>(lead.ad_ref || '{}', {});
  if ((lead.canal || 'whatsapp') === 'whatsapp') {
    const { waba } = waDe(storeId);
    if (!ad.clid || !waba) return null;
    return { canal: 'whatsapp', user: { whatsapp_business_account_id: waba, ctwa_clid: ad.clid } };
  }
  const m = String(lead.wa_id || '').match(/^fb:([^:]+):(.+)$/);
  if (lead.canal === 'messenger' && m) return { canal: 'messenger', user: { page_id: m[1], page_scoped_user_id: m[2] }, pageId: m[1] };
  return null;
}

async function enviar(storeId: string, cfg: CfgCapi, evs: Evento[]): Promise<void> {
  if (!evs.length) return;
  // WhatsApp con el token de WhatsApp; Messenger con el de la página; si no, el de anuncios.
  const grupos = new Map<string, Evento[]>();
  for (const e of evs) {
    const tok = (e.canal === 'whatsapp' ? waDe(storeId).token : tokenPagina(storeId, e.pageId || '')) || tokenAds(storeId);
    if (!tok) { anotar(storeId, e, 'error', 'No hay un acceso de Meta para enviar el evento.'); continue; }
    grupos.set(tok, [...(grupos.get(tok) || []), e]);
  }
  for (const [tok, lista] of grupos) {
    for (let i = 0; i < lista.length; i += 50) {
      const parte = lista.slice(i, i + 50);
      const body = {
        data: parte.map((e) => ({
          event_name: e.evento,
          event_time: e.time,
          event_id: e.clave,
          action_source: 'business_messaging',
          messaging_channel: e.canal,
          user_data: e.user,
          ...(e.evento === 'Purchase' ? { custom_data: { currency: 'COP', value: e.valor } } : {}),
        })),
        ...(cfg.testCode ? { test_event_code: cfg.testCode } : {}),
        partner_agent: 'dealflow',
      };
      try {
        const r = await fetch(`${GRAPH}/${cfg.datasetId}/events`, {
          method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
        });
        const b = (await r.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string; error_user_msg?: string } };
        const err = r.ok ? '' : b.error?.error_user_msg || b.error?.message || `Meta respondió ${r.status}.`;
        for (const e of parte) anotar(storeId, e, err ? 'error' : 'enviado', err);
        if (err) registrarLog(storeId, 'warn', 'meta', `Meta no recibió ${parte.length} evento(s) de conversión: ${err}`);
      } catch {
        for (const e of parte) anotar(storeId, e, 'error', 'No pudimos hablar con Meta.');
      }
    }
  }
}

function anotar(storeId: string, e: Evento, estado: string, error: string): void {
  db.prepare(`INSERT INTO capi_eventos (store_id, clave, evento, ref_id, valor, canal, estado, error) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(store_id, clave) DO UPDATE SET estado = excluded.estado, error = excluded.error, intentos = capi_eventos.intentos + 1, created_at = datetime('now')`)
    .run(storeId, e.clave, e.evento, e.refId, e.valor, e.canal, estado, error.slice(0, 300));
}

const segundos = (dt: string) => Math.floor(new Date(String(dt).replace(' ', 'T') + 'Z').getTime() / 1000);

/** Busca lo pendiente de una tienda y lo envía. */
export async function procesarCapi(storeId: string): Promise<number> {
  const cfg = cfgCapi(storeId);
  if (!cfg.activo || !cfg.datasetId) return 0;
  const hecho = (clave: string) => {
    const r = db.prepare('SELECT estado, intentos FROM capi_eventos WHERE store_id = ? AND clave = ?').get(storeId, clave) as { estado: string; intentos: number } | undefined;
    return !!r && (r.estado === 'enviado' || r.intentos >= 5);
  };
  const evs: Evento[] = [];
  const ahora = Math.floor(Date.now() / 1000);
  // Compras. Meta acepta eventos de hasta 7 días: más viejos no se envían.
  const filtro = cfg.compra === 'entregado'
    ? "o.estado = 'Entregado'"
    : "o.estado != 'Cancelado' AND (o.estado != 'Nuevo' OR o.created_at < datetime('now', '-2 minutes'))"; // 2 min: por si el cliente cambia algo enseguida (talla, cantidad)
  const pedidos = db.prepare(`SELECT o.id, o.total, o.created_at, o.estado, l.wa_id, l.canal, l.ad_ref
    FROM orders o JOIN leads l ON l.id = o.lead_id
    WHERE o.store_id = ? AND ${filtro} AND o.created_at > datetime('now', '-7 days') AND COALESCE(l.ad_ref, '') != ''`).all(storeId) as { id: string; total: number; created_at: string; estado: string; wa_id: string; canal: string; ad_ref: string }[];
  for (const o of pedidos) {
    const clave = `df-${o.id}-purchase`;
    if (hecho(clave)) continue;
    const u = usuarioDe(storeId, o);
    if (!u || !(Number(o.total) > 0)) continue;
    evs.push({ clave, evento: 'Purchase', refId: o.id, valor: Math.round(Number(o.total)), time: cfg.compra === 'entregado' ? ahora : Math.min(ahora, segundos(o.created_at)), ...u });
  }
  // Chats calificados (respondieron) que vinieron de un anuncio.
  if (cfg.leads) {
    const leads = db.prepare(`SELECT l.id, l.wa_id, l.canal, l.ad_ref, l.created_at FROM leads l
      WHERE l.store_id = ? AND COALESCE(l.ad_ref, '') != '' AND l.created_at > datetime('now', '-7 days')
        AND (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id AND m.de = 'cliente') >= 2`).all(storeId) as { id: string; wa_id: string; canal: string; ad_ref: string; created_at: string }[];
    for (const l of leads) {
      const clave = `df-${l.id}-lead`;
      if (hecho(clave)) continue;
      const u = usuarioDe(storeId, l);
      if (!u) continue;
      evs.push({ clave, evento: 'LeadSubmitted', refId: l.id, valor: 0, time: Math.min(ahora, segundos(l.created_at)), ...u });
    }
  }
  await enviar(storeId, cfg, evs);
  return evs.length;
}

export function estadoCapi(storeId: string) {
  const c = cfgCapi(storeId);
  const tot = db.prepare(`SELECT
      SUM(estado = 'enviado' AND evento = 'Purchase') compras, COALESCE(SUM(CASE WHEN estado = 'enviado' AND evento = 'Purchase' THEN valor END), 0) valor,
      SUM(estado = 'enviado' AND evento = 'LeadSubmitted') leads, SUM(estado = 'error') errores
    FROM capi_eventos WHERE store_id = ? AND created_at > datetime('now', '-30 days')`).get(storeId) as { compras: number | null; valor: number | null; leads: number | null; errores: number | null };
  const ultimos = db.prepare('SELECT evento, valor, canal, estado, error, created_at FROM capi_eventos WHERE store_id = ? ORDER BY created_at DESC LIMIT 12').all(storeId);
  const { waba } = waDe(storeId);
  return { ...c, whatsapp: !!waba, compras30: tot.compras || 0, valor30: tot.valor || 0, leads30: tot.leads || 0, errores30: tot.errores || 0, ultimos };
}

let iniciado = false;
export function iniciarCapi(): void {
  if (iniciado) return;
  iniciado = true;
  const ronda = async () => {
    const tiendas = db.prepare("SELECT store_id, config FROM store_integrations WHERE tipo = 'meta_capi'").all() as { store_id: string; config: string }[];
    for (const t of tiendas) {
      const c = pj<Partial<CfgCapi>>(t.config, {});
      if (!c.activo || !c.datasetId) continue;
      await procesarCapi(t.store_id).catch((e) => console.warn('[capi]', e));
    }
  };
  setTimeout(() => void ronda(), 60_000);
  setInterval(() => void ronda(), 60_000); // cada minuto
}

/**
 * Llamar cuando entra o se confirma un pedido: lo reporta en ~2 minutos (no espera la
 * ronda). Si llegan varios seguidos, se agrupan en un solo envío.
 */
const pendientes = new Map<string, ReturnType<typeof setTimeout>>();
export function avisarCapi(storeId: string, demoraMs = 125_000): void {
  if (pendientes.has(storeId)) return;
  pendientes.set(storeId, setTimeout(() => {
    pendientes.delete(storeId);
    void procesarCapi(storeId).catch((e) => console.warn('[capi]', e));
  }, demoraMs));
}
