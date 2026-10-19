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
      if (/already exists|existe/i.test(msg)) {
        const real = await estadoEnMeta(wabaId, token, t.nombre, t.idioma);
        return real || { estado: 'pendiente', metaId: '', motivo: 'Ya existía en esta cuenta.' };
      }
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

/** Estado real de una plantilla (por nombre e idioma) en una WABA, o null si Meta no la encuentra. */
async function estadoEnMeta(wabaId: string, token: string, nombre: string, idioma?: string): Promise<{ estado: string; metaId: string; motivo: string } | null> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(nombre)}&fields=name,status,id,language,rejected_reason`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const b = (await res.json().catch(() => ({}))) as { data?: { name?: string; status?: string; id?: string; language?: string; rejected_reason?: string }[] };
    const lista = (b.data || []).filter((x) => x.name === nombre);
    const t0 = lista.find((x) => !idioma || x.language === idioma || x.language?.startsWith(idioma)) || lista[0];
    if (!t0?.status) return null;
    const st = t0.status.toUpperCase();
    const motivo = st === 'REJECTED' ? motivoRechazo(t0.rejected_reason || '') : st === 'PAUSED' ? 'Meta la pausó por baja calidad.' : st === 'DISABLED' ? 'Meta la desactivó.' : '';
    return { estado: st === 'APPROVED' ? 'aprobada' : st === 'REJECTED' || st === 'DISABLED' ? 'rechazada' : 'pendiente', metaId: t0.id || '', motivo };
  } catch { return null; }
}

/** Motivo de rechazo de Meta en palabras simples. */
function motivoRechazo(r: string): string {
  const m: Record<string, string> = {
    INVALID_FORMAT: 'Formato inválido (revisa variables y ejemplos).',
    TAG_CONTENT_MISMATCH: 'La categoría no coincide con el contenido (p. ej. marketing marcada como utilidad).',
    PROMOTIONAL: 'Meta la considera promocional: debe ir como Marketing.',
    ABUSIVE_CONTENT: 'Contenido no permitido por Meta.',
    SCAM: 'Meta la marcó como posible estafa.',
    NONE: '',
  };
  return m[r] ?? (r ? `Rechazada por Meta (${r}).` : 'Rechazada por Meta.');
}

/** Tiendas con WhatsApp por Cloud API (a las que se les puede publicar). */
function tiendasCloud(): { store_id: string; waba_id: string; access_token: string }[] {
  return db.prepare(
    "SELECT store_id, waba_id, access_token FROM whatsapp WHERE conectado = 1 AND modo = 'cloud' AND COALESCE(waba_id,'') != '' AND COALESCE(access_token,'') != ''",
  ).all() as { store_id: string; waba_id: string; access_token: string }[];
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Publica una plantilla en TODAS las tiendas Cloud API. Devuelve el resumen.
 *  NO reenvía a las tiendas que ya la tienen APROBADA (evita "revivirlas" a
 *  pendiente y volver a mandarlas a revisión sin necesidad). Publica solo donde
 *  falta o donde no quedó aprobada. */
export async function publicarEnTodas(templateId: string): Promise<{ total: number; exitosas: number; errores: number; saltadas: number }> {
  const row = db.prepare('SELECT * FROM meta_templates WHERE id = ?').get(templateId) as Record<string, unknown> | undefined;
  if (!row) return { total: 0, exitosas: 0, errores: 0, saltadas: 0 };
  const t = leerPlantilla(row);
  const tiendas = tiendasCloud();
  // Estado actual por tienda (para no tocar las que ya están aprobadas).
  const yaAprobadas = new Set(
    (db.prepare("SELECT store_id FROM meta_template_pub WHERE template_id = ? AND estado = 'aprobada'").all(templateId) as { store_id: string }[])
      .map((r) => r.store_id),
  );
  let exitosas = 0, errores = 0, saltadas = 0;
  const upsert = db.prepare(
    `INSERT INTO meta_template_pub (template_id, store_id, estado, meta_id, motivo, updated_at)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(template_id, store_id) DO UPDATE SET estado = excluded.estado, meta_id = excluded.meta_id, motivo = excluded.motivo, updated_at = datetime('now')`,
  );
  for (const tienda of tiendas) {
    if (yaAprobadas.has(tienda.store_id)) { saltadas++; continue; } // ya la tiene aprobada: no la tocamos
    const r = await publicarEnTienda(tienda.waba_id, tienda.access_token, t);
    upsert.run(templateId, tienda.store_id, r.estado, r.metaId, r.motivo);
    if (r.estado === 'error' || r.estado === 'rechazada') errores++; else exitosas++;
    await dormir(250); // no atropellar la Graph API
  }
  return { total: tiendas.length, exitosas, errores, saltadas };
}

/** Publica TODAS las plantillas maestras en la WABA de UNA tienda recién conectada.
 *  Se llama al conectar WhatsApp para que las tiendas nuevas reciban las plantillas
 *  sin que el superadmin tenga que republicar a mano. Idempotente: si ya existen en
 *  esa WABA, Meta responde "already exists" y no se duplican. */
export async function publicarTodasEnTienda(storeId: string): Promise<{ total: number; exitosas: number; errores: number }> {
  const w = db.prepare(
    "SELECT waba_id, access_token FROM whatsapp WHERE store_id = ? AND conectado = 1 AND modo = 'cloud' AND COALESCE(waba_id,'') != '' AND COALESCE(access_token,'') != ''",
  ).get(storeId) as { waba_id: string; access_token: string } | undefined;
  if (!w) return { total: 0, exitosas: 0, errores: 0 };
  const plantillas = db.prepare('SELECT * FROM meta_templates').all() as Record<string, unknown>[];
  const upsert = db.prepare(
    `INSERT INTO meta_template_pub (template_id, store_id, estado, meta_id, motivo, updated_at)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(template_id, store_id) DO UPDATE SET estado = excluded.estado, meta_id = excluded.meta_id, motivo = excluded.motivo, updated_at = datetime('now')`,
  );
  let exitosas = 0, errores = 0;
  for (const row of plantillas) {
    // Si ya está aprobada para esta tienda, no la tocamos.
    const pub = db.prepare("SELECT estado FROM meta_template_pub WHERE template_id = ? AND store_id = ?").get(row.id, storeId) as { estado: string } | undefined;
    if (pub?.estado === 'aprobada') { exitosas++; continue; }
    const r = await publicarEnTienda(w.waba_id, w.access_token, leerPlantilla(row));
    upsert.run(String(row.id), storeId, r.estado, r.metaId, r.motivo);
    if (r.estado === 'error' || r.estado === 'rechazada') errores++; else exitosas++;
    await dormir(250);
  }
  return { total: plantillas.length, exitosas, errores };
}

/** Consulta a Meta el estado real de una plantilla en cada tienda (refrescar). */
export async function sincronizarEstado(templateId: string, soloNoAprobadas = false): Promise<{ actualizadas: number }> {
  const row = db.prepare('SELECT nombre, idioma FROM meta_templates WHERE id = ?').get(templateId) as { nombre: string; idioma: string } | undefined;
  if (!row) return { actualizadas: 0 };
  const pubs = db.prepare(
    `SELECT p.store_id, p.estado, w.waba_id, w.access_token FROM meta_template_pub p
     JOIN whatsapp w ON w.store_id = p.store_id
     WHERE p.template_id = ? AND COALESCE(w.waba_id,'') != '' AND COALESCE(w.access_token,'') != ''`,
  ).all(templateId) as { store_id: string; estado: string; waba_id: string; access_token: string }[];
  const upd = db.prepare("UPDATE meta_template_pub SET estado = ?, meta_id = ?, motivo = ?, updated_at = datetime('now') WHERE template_id = ? AND store_id = ?");
  let n = 0;
  for (const p of pubs) {
    if (soloNoAprobadas && p.estado === 'aprobada') continue;
    const r = await estadoEnMeta(p.waba_id, p.access_token, row.nombre, row.idioma);
    if (r) { upd.run(r.estado, r.metaId, r.motivo, templateId, p.store_id); n++; }
    await dormir(150);
  }
  return { actualizadas: n };
}

/** Refresca TODAS las plantillas (todas las tiendas). */
export async function sincronizarTodas(soloNoAprobadas = false): Promise<{ plantillas: number; actualizadas: number }> {
  const ids = (db.prepare('SELECT id FROM meta_templates').all() as { id: string }[]).map((r) => r.id);
  let actualizadas = 0;
  for (const id of ids) actualizadas += (await sincronizarEstado(id, soloNoAprobadas)).actualizadas;
  return { plantillas: ids.length, actualizadas };
}

// ── Envío masivo en segundo plano (no depende de que la petición HTTP aguante) ──
export interface ProgresoEnvio { corriendo: boolean; plantillas: number; hechas: number; exitosas: number; errores: number; saltadas: number; inicio: string; fin: string }
export const progresoEnvio: ProgresoEnvio = { corriendo: false, plantillas: 0, hechas: 0, exitosas: 0, errores: 0, saltadas: 0, inicio: '', fin: '' };

/** Envía TODAS las plantillas a verificación en todas las tiendas donde no estén aprobadas, y luego consulta su estado real. */
export function enviarTodasEnSegundoPlano(): ProgresoEnvio {
  if (progresoEnvio.corriendo) return progresoEnvio;
  const ids = (db.prepare('SELECT id FROM meta_templates ORDER BY created_at').all() as { id: string }[]).map((r) => r.id);
  Object.assign(progresoEnvio, { corriendo: true, plantillas: ids.length, hechas: 0, exitosas: 0, errores: 0, saltadas: 0, inicio: new Date().toISOString(), fin: '' });
  void (async () => {
    try {
      for (const id of ids) {
        const r = await publicarEnTodas(id);
        progresoEnvio.exitosas += r.exitosas; progresoEnvio.errores += r.errores; progresoEnvio.saltadas += r.saltadas; progresoEnvio.hechas++;
      }
      // Meta suele aprobar las de utilidad en segundos o minutos: consultamos de una.
      await dormir(20_000);
      await sincronizarTodas(true);
    } catch (e) { console.warn('[plantillas] envío masivo falló', e); }
    finally { progresoEnvio.corriendo = false; progresoEnvio.fin = new Date().toISOString(); }
  })();
  return progresoEnvio;
}

/** Revisa solo el estado de las que no están aprobadas cada 30 min (las aprobaciones de Meta llegan solas). */
export function iniciarRevisionPlantillas(): void {
  setInterval(() => { if (!progresoEnvio.corriendo) void sincronizarTodas(true).catch(() => {}); }, 30 * 60_000);
  setTimeout(() => { void sincronizarTodas(true).catch(() => {}); }, 90_000);
}
