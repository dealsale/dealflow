import { db, pj } from './db.js';

/**
 * Plantillas de mensajes de Meta publicadas en TODAS las tiendas.
 *
 * El superadmin define una plantilla genérica UNA sola vez (sin nombre de
 * tienda, solo variables {{1}},{{2}}…). Al publicarla, DealFlow la crea y la
 * manda a verificación en la WABA de CADA tienda conectada por Cloud API,
 * usando el token de cada una. En WhatsApp las plantillas viven por WABA, así
 * que técnicamente es una copia por tienda, pero para el superadmin es un clic.
 */

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

export interface Boton { tipo: 'QUICK_REPLY' | 'URL'; texto: string; url?: string }
export interface PlantillaMaestra {
  id: string; nombre: string; categoria: string; idioma: string;
  encabezado: string; cuerpo: string; pie: string; botones: Boton[]; ejemplos: string[];
}

export function leerPlantilla(row: Record<string, unknown>): PlantillaMaestra {
  return {
    id: String(row.id), nombre: String(row.nombre), categoria: String(row.categoria || 'UTILITY'),
    idioma: String(row.idioma || 'es'), encabezado: String(row.encabezado || ''),
    cuerpo: String(row.cuerpo || ''), pie: String(row.pie || ''),
    botones: pj<Boton[]>(String(row.botones || '[]'), []),
    ejemplos: pj<string[]>(String(row.ejemplos || '[]'), []),
  };
}

/** Cuántas variables {{n}} tiene un texto (la mayor n encontrada). */
function numVariables(texto: string): number {
  let max = 0;
  for (const m of texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** Arma los componentes del formato que exige la Graph API de Meta. */
export function construirComponentes(t: PlantillaMaestra): Record<string, unknown>[] {
  const comps: Record<string, unknown>[] = [];

  if (t.encabezado.trim()) {
    const header: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: t.encabezado };
    const nh = numVariables(t.encabezado);
    if (nh > 0) header.example = { header_text: [t.ejemplos[0] || 'Ejemplo'] };
    comps.push(header);
  }

  const body: Record<string, unknown> = { type: 'BODY', text: t.cuerpo };
  const nb = numVariables(t.cuerpo);
  if (nb > 0) {
    const vals: string[] = [];
    for (let i = 0; i < nb; i++) vals.push(t.ejemplos[i] || 'Ejemplo');
    body.example = { body_text: [vals] };
  }
  comps.push(body);

  if (t.pie.trim()) comps.push({ type: 'FOOTER', text: t.pie });

  if (t.botones.length) {
    const buttons = t.botones.slice(0, 10).map((b) => b.tipo === 'URL'
      ? { type: 'URL', text: b.texto, url: b.url || 'https://dealflow.sbs' }
      : { type: 'QUICK_REPLY', text: b.texto });
    comps.push({ type: 'BUTTONS', buttons });
  }
  return comps;
}

interface GraphResp { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } }

/** Publica (o reintenta) una plantilla en la WABA de una tienda concreta. */
async function publicarEnTienda(wabaId: string, token: string, t: PlantillaMaestra): Promise<{ estado: string; metaId: string; motivo: string }> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: t.nombre,
        language: t.idioma,
        category: t.categoria,
        allow_category_change: true,
        components: construirComponentes(t),
      }),
    });
    const b = (await res.json().catch(() => ({}))) as GraphResp;
    if (!res.ok || !b.id) {
      const msg = b.error?.error_user_msg || b.error?.message || 'Meta rechazó la creación.';
      // Si ya existe con ese nombre, no es un fallo: la damos por enviada.
      if (/already exists|existe/i.test(msg)) return { estado: 'pendiente', metaId: '', motivo: 'Ya existía en esta cuenta.' };
      return { estado: 'error', metaId: '', motivo: msg };
    }
    const estado = String(b.status || 'PENDING').toUpperCase();
    return {
      estado: estado === 'APPROVED' ? 'aprobada' : estado === 'REJECTED' ? 'rechazada' : 'pendiente',
      metaId: b.id, motivo: '',
    };
  } catch {
    return { estado: 'error', metaId: '', motivo: 'No pudimos conectar con Meta.' };
  }
}

/** Tiendas con WhatsApp por Cloud API (a las que se les puede publicar). */
function tiendasCloud(): { store_id: string; waba_id: string; access_token: string }[] {
  return db.prepare(
    "SELECT store_id, waba_id, access_token FROM whatsapp WHERE conectado = 1 AND modo = 'cloud' AND COALESCE(waba_id,'') != '' AND COALESCE(access_token,'') != ''",
  ).all() as { store_id: string; waba_id: string; access_token: string }[];
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Publica una plantilla en TODAS las tiendas Cloud API. Devuelve el resumen. */
export async function publicarEnTodas(templateId: string): Promise<{ total: number; exitosas: number; errores: number }> {
  const row = db.prepare('SELECT * FROM meta_templates WHERE id = ?').get(templateId) as Record<string, unknown> | undefined;
  if (!row) return { total: 0, exitosas: 0, errores: 0 };
  const t = leerPlantilla(row);
  const tiendas = tiendasCloud();
  let exitosas = 0, errores = 0;
  const upsert = db.prepare(
    `INSERT INTO meta_template_pub (template_id, store_id, estado, meta_id, motivo, updated_at)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(template_id, store_id) DO UPDATE SET estado = excluded.estado, meta_id = excluded.meta_id, motivo = excluded.motivo, updated_at = datetime('now')`,
  );
  for (const tienda of tiendas) {
    const r = await publicarEnTienda(tienda.waba_id, tienda.access_token, t);
    upsert.run(templateId, tienda.store_id, r.estado, r.metaId, r.motivo);
    if (r.estado === 'error' || r.estado === 'rechazada') errores++; else exitosas++;
    await dormir(250); // no atropellar la Graph API
  }
  return { total: tiendas.length, exitosas, errores };
}

/** Consulta a Meta el estado real de una plantilla en cada tienda (refrescar). */
export async function sincronizarEstado(templateId: string): Promise<{ actualizadas: number }> {
  const row = db.prepare('SELECT nombre FROM meta_templates WHERE id = ?').get(templateId) as { nombre: string } | undefined;
  if (!row) return { actualizadas: 0 };
  const pubs = db.prepare(
    `SELECT p.store_id, w.waba_id, w.access_token FROM meta_template_pub p
     JOIN whatsapp w ON w.store_id = p.store_id
     WHERE p.template_id = ? AND COALESCE(w.waba_id,'') != ''`,
  ).all(templateId) as { store_id: string; waba_id: string; access_token: string }[];
  const upd = db.prepare("UPDATE meta_template_pub SET estado = ?, meta_id = ?, motivo = ?, updated_at = datetime('now') WHERE template_id = ? AND store_id = ?");
  let n = 0;
  for (const p of pubs) {
    try {
      const res = await fetch(`${GRAPH}/${encodeURIComponent(p.waba_id)}/message_templates?name=${encodeURIComponent(row.nombre)}&fields=name,status,id,rejected_reason`, {
        headers: { Authorization: `Bearer ${p.access_token}` },
      });
      const b = (await res.json().catch(() => ({}))) as { data?: { status?: string; id?: string; rejected_reason?: string }[] };
      const t0 = b.data?.[0];
      if (t0?.status) {
        const st = t0.status.toUpperCase();
        upd.run(st === 'APPROVED' ? 'aprobada' : st === 'REJECTED' ? 'rechazada' : 'pendiente', t0.id || '', t0.rejected_reason || '', templateId, p.store_id);
        n++;
      }
    } catch { /* seguimos con las demás */ }
    await dormir(150);
  }
  return { actualizadas: n };
}
