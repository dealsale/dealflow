/**
 * Plantillas que la tienda tiene en SU cuenta de WhatsApp (WABA) en Meta.
 *
 * Además de las de DealFlow (las que publica el superadmin, ver metaTemplates.ts), muchas
 * tiendas crean y mandan a aprobar sus propias plantillas directo en el Administrador de
 * WhatsApp de Meta. Aquí se traen TODAS con su estado real (aprobada, en revisión,
 * rechazada…) para poder enviarlas desde el chat y desde "Iniciar conversación".
 */
import { db, pj } from './db.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

db.exec(`CREATE TABLE IF NOT EXISTS wa_plantillas_meta (
  store_id TEXT NOT NULL, meta_id TEXT NOT NULL, nombre TEXT NOT NULL, idioma TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT '', motivo TEXT NOT NULL DEFAULT '',
  componentes TEXT NOT NULL DEFAULT '[]', actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, meta_id)
)`);

interface BotonMeta { type: string; text?: string; url?: string; example?: string[] }
interface CompMeta {
  type: string; format?: string; text?: string; buttons?: BotonMeta[];
  example?: { header_handle?: string[]; header_text?: string[]; body_text?: string[][] };
}
interface PlantillaGraph { id: string; name: string; status: string; language: string; category: string; components?: CompMeta[]; rejected_reason?: string }

export type EstadoPlantilla = 'aprobada' | 'pendiente' | 'rechazada' | 'pausada';
export function estadoDeMeta(st: string): EstadoPlantilla {
  const s = String(st || '').toUpperCase();
  if (s === 'APPROVED') return 'aprobada';
  if (s === 'REJECTED' || s === 'DISABLED') return 'rechazada';
  if (s === 'PAUSED') return 'pausada';
  return 'pendiente';
}

const ultimaSync = new Map<string, number>();
const enCurso = new Map<string, Promise<ResultadoSync>>();
export type ResultadoSync = { ok: true; total: number; aprobadas: number; pendientes: number; rechazadas: number } | { error: string };

/** Trae de Meta todas las plantillas de la WABA de la tienda y actualiza su estado. */
export function sincronizarPlantillasTienda(storeId: string): Promise<ResultadoSync> {
  const ya = enCurso.get(storeId);
  if (ya) return ya;
  const p = sincronizar(storeId).finally(() => enCurso.delete(storeId));
  enCurso.set(storeId, p);
  return p;
}

async function sincronizar(storeId: string): Promise<ResultadoSync> {
  const w = db.prepare('SELECT waba_id, access_token, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { waba_id: string; access_token: string; conectado: number; modo: string } | undefined;
  if (!w?.conectado) return { error: 'WhatsApp no está conectado.' };
  if (w.modo === 'qr') return { error: 'Las plantillas de Meta solo existen en la conexión oficial de WhatsApp (no por QR).' };
  if (!w.waba_id || !w.access_token) return { error: 'Falta el ID de tu cuenta de WhatsApp Business (WABA). Vuelve a conectar WhatsApp.' };
  const todas: PlantillaGraph[] = [];
  let url = `${GRAPH}/${encodeURIComponent(w.waba_id)}/message_templates?fields=id,name,status,language,category,components,rejected_reason&limit=100`;
  try {
    for (let i = 0; i < 20 && url; i++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${w.access_token}` } });
      const b = (await res.json().catch(() => ({}))) as { data?: PlantillaGraph[]; paging?: { next?: string }; error?: { message?: string; error_user_msg?: string } };
      if (!res.ok) return { error: `Meta no dejó leer tus plantillas: ${b.error?.error_user_msg || b.error?.message || `error ${res.status}`}` };
      todas.push(...(b.data || []));
      url = b.paging?.next || '';
    }
  } catch {
    return { error: 'No pudimos conectar con Meta para leer tus plantillas.' };
  }
  const ins = db.prepare('INSERT INTO wa_plantillas_meta (store_id, meta_id, nombre, idioma, categoria, estado, motivo, componentes) VALUES (?,?,?,?,?,?,?,?)');
  // Las de DealFlow (maestras) que estén en esta WABA quedan con su estado real.
  const maestras = db.prepare('SELECT id, nombre, idioma FROM meta_templates').all() as { id: string; nombre: string; idioma: string }[];
  const pub = db.prepare(`INSERT INTO meta_template_pub (template_id, store_id, estado, meta_id, motivo, updated_at) VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(template_id, store_id) DO UPDATE SET estado = excluded.estado, meta_id = excluded.meta_id, motivo = excluded.motivo, updated_at = datetime('now')`);
  db.transaction(() => {
    db.prepare('DELETE FROM wa_plantillas_meta WHERE store_id = ?').run(storeId);
    for (const t of todas) {
      if (!t?.id || !t.name) continue;
      ins.run(storeId, String(t.id), t.name, t.language || '', t.category || '', estadoDeMeta(t.status), String(t.rejected_reason || '').replace(/^NONE$/i, ''), JSON.stringify(t.components || []));
    }
    for (const m of maestras) {
      const t = todas.find((x) => x.name === m.nombre && (x.language === m.idioma || x.language.split('_')[0] === m.idioma.split('_')[0]));
      if (t) pub.run(m.id, storeId, estadoDeMeta(t.status) === 'pausada' ? 'rechazada' : estadoDeMeta(t.status), String(t.id), String(t.rejected_reason || '').replace(/^NONE$/i, ''));
    }
  })();
  ultimaSync.set(storeId, Date.now());
  const n = (e: EstadoPlantilla) => todas.filter((t) => estadoDeMeta(t.status) === e).length;
  return { ok: true, total: todas.length, aprobadas: n('aprobada'), pendientes: n('pendiente'), rechazadas: n('rechazada') + n('pausada') };
}

/** Si hace rato no se consulta, se actualiza en segundo plano (la lista sale con lo que hay). */
export function sincronizarSiHaceFalta(storeId: string, maxMs = 10 * 60_000) {
  if (Date.now() - (ultimaSync.get(storeId) || 0) < maxMs) return;
  ultimaSync.set(storeId, Date.now());
  void sincronizarPlantillasTienda(storeId).catch(() => {});
}

export interface PlantillaPropia {
  id: string; metaId: string; nombre: string; idioma: string; categoria: string; estado: EstadoPlantilla; motivo: string;
  encabezado: string; encabezadoTipo: string; varsEncabezado: number; ejemploEncabezado: string; mediaEjemplo: string;
  cuerpo: string; pie: string; variables: number; ejemplos: string[];
  botones: { tipo: string; texto: string; url: string; variable: boolean; ejemplo: string }[];
}

const nVars = (t: string) => [...new Set([...String(t || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].length;

function leer(r: { meta_id: string; nombre: string; idioma: string; categoria: string; estado: string; motivo: string; componentes: string }): PlantillaPropia {
  const comps = pj<CompMeta[]>(r.componentes, []);
  const h = comps.find((c) => c.type === 'HEADER');
  const b = comps.find((c) => c.type === 'BODY');
  const f = comps.find((c) => c.type === 'FOOTER');
  const bts = comps.find((c) => c.type === 'BUTTONS')?.buttons || [];
  const fmt = String(h?.format || (h ? 'TEXT' : '')).toUpperCase();
  return {
    id: `meta:${r.meta_id}`, metaId: r.meta_id, nombre: r.nombre, idioma: r.idioma, categoria: r.categoria,
    estado: r.estado as EstadoPlantilla, motivo: r.motivo,
    encabezado: fmt === 'TEXT' ? String(h?.text || '') : '', encabezadoTipo: fmt,
    varsEncabezado: fmt === 'TEXT' ? nVars(String(h?.text || '')) : 0,
    ejemploEncabezado: h?.example?.header_text?.[0] || '', mediaEjemplo: h?.example?.header_handle?.[0] || '',
    cuerpo: String(b?.text || ''), pie: String(f?.text || ''), variables: nVars(String(b?.text || '')),
    ejemplos: (b?.example?.body_text?.[0] || []).map(String),
    botones: bts.map((x) => {
      const url = String(x.url || '');
      const variable = x.type === 'URL' && /\{\{\s*1\s*\}\}/.test(url);
      // El ejemplo de Meta es el enlace completo: la variable es lo que va después de la parte fija.
      const fijo = url.replace(/\{\{\s*1\s*\}\}.*$/, '');
      const ej = String(x.example?.[0] || '');
      return { tipo: x.type, texto: String(x.text || ''), url, variable, ejemplo: variable && ej.startsWith(fijo) ? ej.slice(fijo.length) : ej };
    }),
  };
}

/** Plantillas de la WABA de la tienda (por defecto, solo las aprobadas). */
export function plantillasPropias(storeId: string, soloAprobadas = true): PlantillaPropia[] {
  const filas = db.prepare(`SELECT meta_id, nombre, idioma, categoria, estado, motivo, componentes FROM wa_plantillas_meta WHERE store_id = ? ${soloAprobadas ? "AND estado = 'aprobada'" : ''} ORDER BY nombre`).all(storeId) as Parameters<typeof leer>[0][];
  return filas.map(leer);
}

export function plantillaPropia(storeId: string, id: string): PlantillaPropia | null {
  const metaId = id.replace(/^meta:/, '');
  const r = db.prepare("SELECT meta_id, nombre, idioma, categoria, estado, motivo, componentes FROM wa_plantillas_meta WHERE store_id = ? AND meta_id = ? AND estado = 'aprobada'").get(storeId, metaId) as Parameters<typeof leer>[0] | undefined;
  return r ? leer(r) : null;
}

export interface ExtraPlantilla { encabezado?: string; media?: string; boton?: string }

/**
 * Componentes para enviar una plantilla propia: variables del encabezado, foto/video/documento
 * del encabezado, variables del cuerpo y la parte variable de los botones con enlace.
 * Lo que no se mande sale con el ejemplo que la tienda registró en Meta.
 */
export function componentesEnvio(p: PlantillaPropia, params: string[], extra: ExtraPlantilla = {}): { components: Record<string, unknown>[] } | { error: string } {
  const components: Record<string, unknown>[] = [];
  // Los ejemplos de Meta son de prueba: nunca se le mandan al cliente. Lo que falte se pide.
  if (p.encabezadoTipo === 'TEXT' && p.varsEncabezado > 0) {
    if (!String(extra.encabezado || '').trim()) return { error: `Falta el dato del encabezado de "${p.nombre}".` };
    components.push({ type: 'header', parameters: [{ type: 'text', text: String(extra.encabezado) }] });
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(p.encabezadoTipo)) {
    const link = String(extra.media || p.mediaEjemplo || '').trim();
    if (!/^https?:\/\//i.test(link)) return { error: `La plantilla "${p.nombre}" lleva ${p.encabezadoTipo === 'IMAGE' ? 'una foto' : p.encabezadoTipo === 'VIDEO' ? 'un video' : 'un documento'} arriba: pega el enlace del archivo.` };
    const k = p.encabezadoTipo.toLowerCase();
    components.push({ type: 'header', parameters: [{ type: k, [k]: { link } }] });
  }
  const falta = Array.from({ length: p.variables }, (_, i) => i).filter((i) => !String(params[i] || '').trim());
  if (falta.length) return { error: `Falta llenar ${falta.map((i) => `{{${i + 1}}}`).join(', ')} de "${p.nombre}".` };
  if (p.variables > 0) components.push({ type: 'body', parameters: Array.from({ length: p.variables }, (_, i) => ({ type: 'text', text: String(params[i]) })) });
  for (const [i, b] of p.botones.entries()) {
    if (!b.variable) continue;
    if (!String(extra.boton || '').trim()) return { error: `Falta el final del enlace del botón "${b.texto}".` };
    components.push({ type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text: String(extra.boton) }] });
  }
  return { components };
}

/** Cada hora: el estado real de las plantillas de todas las tiendas con WhatsApp oficial. */
async function sincronizarTodasLasTiendas() {
  const tiendas = db.prepare("SELECT store_id FROM whatsapp WHERE conectado = 1 AND modo = 'cloud' AND COALESCE(waba_id,'') != '' AND COALESCE(access_token,'') != ''").all() as { store_id: string }[];
  for (const t of tiendas) {
    await sincronizarPlantillasTienda(t.store_id).catch(() => null);
    await new Promise((r) => setTimeout(r, 1500));
  }
}
if (process.env.NODE_ENV === 'production') {
  setTimeout(() => void sincronizarTodasLasTiendas(), 2 * 60_000).unref();
  setInterval(() => void sincronizarTodasLasTiendas(), 60 * 60_000).unref();
}
