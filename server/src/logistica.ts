/**
 * Logística Effi: tablero de TODAS las guías de la tienda (pedidos enviados por
 * Effi), agrupadas por etapa del envío, con flete, recaudo, último movimiento y
 * cuáles llegan hoy. Lee lo que ya guardan los webhooks/consultas de Effi y, al
 * pedir "actualizar", consulta en Effi las guías activas.
 */
import { db, pj } from './db.js';
import { cfgEffi, effi, urlDocumentoGuia, numeroGuiaEffi } from './effiApi.js';
import { estadoLogistico } from './estadosPedido.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };

// Registro general: TODAS las guías de transporte de la cuenta de Effi (también las
// que se hicieron por fuera de DealFlow). Se renueva cada 20 min y al "Actualizar".
db.exec(`CREATE TABLE IF NOT EXISTS effi_guias (
  store_id TEXT NOT NULL, id TEXT NOT NULL, guia TEXT NOT NULL DEFAULT '', transportadora TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT '', destinatario TEXT NOT NULL DEFAULT '', ciudad TEXT NOT NULL DEFAULT '', telefono TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL DEFAULT '', flete REAL NOT NULL DEFAULT 0, recaudo REAL NOT NULL DEFAULT 0, id_ref TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '', raw TEXT NOT NULL DEFAULT '', actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, id)
)`);
// vigente = 0: guía anulada en Effi (no cuenta en el tablero ni en los fletes).
try { db.exec('ALTER TABLE effi_guias ADD COLUMN vigente INTEGER NOT NULL DEFAULT 1'); } catch { /* ya existe */ }
const ultimaSync = new Map<string, number>();

export type Etapa = 'sin_guia' | 'por_recoger' | 'transito' | 'reparto' | 'oficina' | 'novedad' | 'entregado' | 'devuelto';

/** Etapa del tablero: el estado del pedido (que ya sigue a la guía) y, si aún no es logístico, el texto de Effi. */
function etapaDe(o: Fila): Etapa {
  if (Number(o.novedad_activa) > 0) return 'novedad';
  let e = txt(o.estado);
  if (!['Guía generada', 'En tránsito', 'En reparto', 'En oficina', 'Novedad', 'Entregado', 'Devuelto'].includes(e)) e = estadoLogistico(txt(o.estado_woo), !!txt(o.guia)) || e;
  switch (e) {
    case 'Devuelto': return 'devuelto';
    case 'Entregado': return 'entregado';
    case 'Novedad': return 'novedad';
    case 'En reparto': return 'reparto';
    case 'En oficina': return 'oficina';
    case 'En tránsito': return 'transito';
    default: return txt(o.guia) ? 'por_recoger' : 'sin_guia';
  }
}

/** Etapa de una guía suelta de Effi (sin pedido en DealFlow), por su texto de estado. */
function etapaTexto(estado: string, guia: string): Etapa {
  switch (estadoLogistico(estado, !!guia)) {
    case 'Devuelto': return 'devuelto';
    case 'Entregado': return 'entregado';
    case 'Novedad': return 'novedad';
    case 'En reparto': return 'reparto';
    case 'En oficina': return 'oficina';
    case 'En tránsito': return 'transito';
    default: return guia ? 'por_recoger' : 'sin_guia';
  }
}

/**
 * Flete de una guía según la documentación de la API de Effi (GET /api/guia_transporte):
 *  - valor_flete = VALOR TOTAL del flete (lo que muestra Effi como «Flete»);
 *  - su desglose: costo_flete_api_calculado (envío) + costo_manejo_api_calculado + costo_otros_api_calculado
 *    (ahí va p. ej. la comisión del recaudo contra entrega); descuento = descuento aplicado al flete.
 * Ojo: antes se tomaba «el primer campo que diga flete» y costo_flete_api_calculado viene antes que
 * valor_flete en la respuesta: salía solo el envío. Si una guía vieja no trae estos campos, se usa
 * una búsqueda por nombres parecidos.
 */
export interface FleteGuia { total: number; base: number; manejo: number; otros: number; descuento: number; cargos: number; campos: string[] }
export function fleteDe(info: Fila): FleteGuia {
  // Campos exactos: en la raíz o un nivel adentro (algunas respuestas vienen envueltas).
  const plano: Fila = { ...info };
  for (const v of Object.values(info || {})) if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v as Fila)) if (!(k in plano)) plano[k] = x;
  const v = (k: string) => num(plano[k]);
  const base = v('costo_flete_api_calculado'), manejo = v('costo_manejo_api_calculado'), otros = v('costo_otros_api_calculado'), descuento = v('descuento');
  const total = v('valor_flete');
  if (total > 0) return { total: Math.round(total), base: Math.round(base), manejo: Math.round(manejo), otros: Math.round(otros), descuento: Math.round(descuento), cargos: Math.round(manejo + otros), campos: ['valor_flete'] };
  if (base + manejo + otros > 0) {
    const campos = ['costo_flete_api_calculado', 'costo_manejo_api_calculado', 'costo_otros_api_calculado'].filter((k) => v(k) > 0);
    return { total: Math.round(base + manejo + otros), base: Math.round(base), manejo: Math.round(manejo), otros: Math.round(otros), descuento: Math.round(descuento), cargos: Math.round(manejo + otros), campos };
  }
  // Respaldo (formato desconocido): el primer campo parecido a un flete que no sea lo que se recauda.
  for (const [k, x] of Object.entries(plano)) {
    if (x == null || typeof x === 'object') continue;
    const n = num(x);
    if (n > 0 && /flete|valor_envio|costo_envio|valor_servicio/i.test(k) && !/recaudo|declarado/i.test(k)) return { total: Math.round(n), base: 0, manejo: 0, otros: 0, descuento: 0, cargos: 0, campos: [k.toLowerCase()] };
  }
  return { total: 0, base: 0, manejo: 0, otros: 0, descuento: 0, cargos: 0, campos: [] };
}

/** Valor a recaudar contra entrega. En Effi «recaudo» es 1/0 (si tiene recaudo); el valor es «valor_recaudo». */
export function recaudoDe(info: Fila): number {
  if (info && 'valor_recaudo' in info) return txt(info.recaudo) === '0' ? 0 : num(info.valor_recaudo);
  for (const [k, x] of Object.entries(info || {})) if (x != null && typeof x !== 'object' && /valor_(a_)?(recaudar|cobrar)|^valor_recaudo$/i.test(k) && num(x) > 0) return num(x);
  return 0;
}

/** Todos los valores (números y textos cortos) que manda Effi de una guía, para revisar campo por campo. */
export function camposGuia(info: Fila): { campo: string; valor: string }[] {
  const out: { campo: string; valor: string }[] = [];
  const recorrer = (o: Fila, pref: string, prof: number) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && prof < 1) { recorrer(v as Fila, `${pref}${k}.`, prof + 1); continue; }
      if (v == null || typeof v === 'object' || String(v).length > 120) continue;
      out.push({ campo: `${pref}${k}`, valor: String(v) });
    }
  };
  recorrer(info, '', 0);
  return out;
}

/** Busca un valor por nombres parecidos en el JSON de la guía de Effi. */
function buscarEn(info: Fila, patron: RegExp, esNumero: boolean): string | number {
  for (const [k, v] of Object.entries(info)) {
    if (v == null || typeof v === 'object' || !patron.test(k)) continue;
    if (esNumero) { const n = num(v); if (n > 0) return n; } else if (txt(v)) return txt(v);
  }
  return esNumero ? 0 : '';
}

export function tableroLogistica(storeId: string, dias = 45) {
  const filas = db.prepare(
    `SELECT o.*, (SELECT COUNT(*) FROM novedades n WHERE n.order_id = o.id AND n.abierta = 1) AS novedad_activa
       FROM orders o
      WHERE o.store_id = ? AND (o.despacho_proveedor = 'effi' OR COALESCE(o.effi_remision,'') != '')
        AND o.created_at > datetime('now', ?)
      ORDER BY o.created_at DESC`,
  ).all(storeId, `-${Math.max(1, Math.min(180, dias))} days`) as Fila[];
  const ult = db.prepare('SELECT fecha, estado, observacion FROM guia_historial WHERE order_id = ? ORDER BY fecha DESC LIMIT 1');
  const rawDeGuia = db.prepare('SELECT raw FROM effi_guias WHERE store_id = ? AND guia = ? ORDER BY vigente DESC, actualizado DESC LIMIT 1');
  const hoyCO = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const guias = filas.map((o) => {
    const info = pj<Fila>(txt(o.effi_guia_info), {});
    const mov = ult.get(txt(o.id)) as Fila | undefined;
    const etapa = etapaDe(o);
    // El flete total: del registro general de guías de Effi (listado) o de la consulta del pedido; el mayor (incluye la comisión).
    const raw = txt(o.guia) ? (rawDeGuia.get(storeId, txt(o.guia)) as { raw: string } | undefined)?.raw : '';
    // valor_flete del registro general de guías (el más reciente); si no, el de la consulta del pedido.
    const flete = (raw ? fleteDe(pj<Fila>(raw, {})).total : 0) || fleteDe(info).total;
    const estimada = String(buscarEn(info, /fecha.*(entrega|estimad)|(entrega|estimad).*fecha/i, false) || '').slice(0, 10);
    const rawInfo = raw ? pj<Fila>(raw, {}) : {};
    const recaudoEffi = recaudoDe(rawInfo) || recaudoDe(info);
    const recaudo = recaudoEffi || (/contra ?entrega/i.test(txt(o.nota)) || !/pagado/i.test(txt(o.nota)) ? Number(o.total) || 0 : 0);
    return {
      id: 'DF-' + txt(o.numero), rowId: txt(o.id), numero: Number(o.numero), cliente: txt(o.cliente), tel: txt(o.tel), leadId: txt(o.lead_id),
      ciudad: txt(o.ciudad), departamento: txt(o.departamento), total: Number(o.total) || 0, envioCobrado: Number(o.envio) || 0,
      recaudo, flete, guia: txt(o.guia), guiaUrl: txt(o.guia_url), transportadora: txt(o.transportadora), remision: txt(o.effi_remision),
      estado: txt(o.estado), estadoEffi: txt(o.estado_woo), etapa, creado: txt(o.created_at),
      ultimoMovimiento: mov ? { fecha: txt(mov.fecha), estado: txt(mov.estado), observacion: txt(mov.observacion) } : null,
      entregaEstimada: estimada,
      llegaHoy: etapa === 'reparto' || (estimada === hoyCO && etapa !== 'entregado' && etapa !== 'devuelto'),
      entregadoHoy: etapa === 'entregado' && !!mov && txt(mov.fecha).slice(0, 10) === hoyCO,
      externa: false,
    };
  });
  // Guías que están en Effi pero no son de ningún pedido de DealFlow.
  const conocidas = new Set(guias.map((g) => g.guia).filter(Boolean));
  const desdeTxt = new Date(Date.now() - Math.max(1, Math.min(180, dias)) * 86400e3).toISOString().slice(0, 10);
  const externas = (db.prepare("SELECT * FROM effi_guias WHERE store_id = ? AND vigente = 1 AND (fecha = '' OR substr(fecha,1,10) >= ?) ORDER BY fecha DESC LIMIT 1500").all(storeId, desdeTxt) as Fila[])
    .filter((e) => !txt(e.guia) || !conocidas.has(txt(e.guia)))
    .map((e) => {
      const etapa = etapaTexto(txt(e.estado), txt(e.guia));
      return {
        id: txt(e.guia) ? `Guía ${txt(e.guia)}` : `Effi #${txt(e.id)}`, rowId: '', numero: 0, cliente: txt(e.destinatario) || 'Destinatario', tel: txt(e.telefono), leadId: '',
        ciudad: txt(e.ciudad), departamento: '', total: 0, envioCobrado: 0, recaudo: Number(e.recaudo) || 0, flete: Number(e.flete) || 0,
        guia: txt(e.guia), guiaUrl: txt(e.url), transportadora: txt(e.transportadora), remision: txt(e.id_ref) ? `Doc. ${txt(e.id_ref)}` : '',
        estado: '', estadoEffi: txt(e.estado), etapa, creado: txt(e.fecha), ultimoMovimiento: null, entregaEstimada: '',
        llegaHoy: etapa === 'reparto', entregadoHoy: false, externa: true,
      };
    });
  guias.push(...externas);
  const activas = guias.filter((g) => !['entregado', 'devuelto'].includes(g.etapa));
  const resumen = {
    total: guias.length,
    activas: activas.length,
    llegaHoy: guias.filter((g) => g.llegaHoy).length,
    novedades: guias.filter((g) => g.etapa === 'novedad').length,
    entregadas: guias.filter((g) => g.etapa === 'entregado').length,
    devueltas: guias.filter((g) => g.etapa === 'devuelto').length,
    porRecaudar: activas.reduce((a, g) => a + g.recaudo, 0),
    fleteTotal: guias.reduce((a, g) => a + g.flete, 0),
    envioCobrado: guias.reduce((a, g) => a + g.envioCobrado, 0),
    soloEffi: externas.length,
    efectividad: (() => { const fin = guias.filter((g) => g.etapa === 'entregado' || g.etapa === 'devuelto').length; return fin ? Math.round((guias.filter((g) => g.etapa === 'entregado').length / fin) * 100) : null; })(),
  };
  return { guias, resumen, actualizado: new Date().toISOString(), guiasEffiAt: ultimaSync.get(storeId) ? new Date(ultimaSync.get(storeId)!).toISOString() : '' };
}

const refrescando = new Set<string>();
/** Consulta en Effi el estado (y el rastreo) de las guías activas de la tienda. */
export async function refrescarLogistica(storeId: string): Promise<{ revisadas: number }> {
  if (refrescando.has(storeId)) return { revisadas: 0 };
  refrescando.add(storeId);
  try {
    const { consultarEstadoEffi } = await import('./effiApi.js');
    const { rastrearGuia } = await import('./effiExtras.js');
    const act = db.prepare(
      `SELECT id, guia FROM orders WHERE store_id = ? AND COALESCE(effi_doc,'') != '' AND estado NOT IN ('Entregado','Devuelto','Cancelado')
         AND created_at > datetime('now','-45 days') ORDER BY created_at DESC LIMIT 80`,
    ).all(storeId) as { id: string; guia: string }[];
    try { await sincronizarGuiasEffi(storeId); } catch { /* sigue */ }
    for (const o of act) {
      try { await consultarEstadoEffi(storeId, o.id); } catch { /* sigue */ }
      try { if (o.guia) await rastrearGuia(storeId, o.id, 15); } catch { /* sigue */ }
    }
    return { revisadas: act.length };
  } finally { refrescando.delete(storeId); }
}

/** Primer valor no vacío de las llaves que casen con el patrón. */
function campo(f: Fila, patron: RegExp): string {
  for (const [k, v] of Object.entries(f)) if (v != null && typeof v !== 'object' && patron.test(k) && txt(v)) return txt(v);
  return '';
}

/** Trae de Effi TODAS las guías de transporte de los últimos `dias` días y las guarda. */
/** JSON de la guía para guardar: completo si cabe; si no, sin los textos largos (nunca cortado a la mitad: tiene que seguir siendo JSON). */
function rawGuia(f: Fila): string {
  const todo = JSON.stringify(f);
  if (todo.length <= 20000) return todo;
  return JSON.stringify(Object.fromEntries(Object.entries(f).filter(([, v]) => v == null || typeof v !== 'string' || v.length <= 300)));
}

export async function sincronizarGuiasEffi(storeId: string, dias = 60, rango?: { desde: string; hasta: string }): Promise<{ guias: number } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  const hoy = new Date(Date.now() - 5 * 3600e3);
  const desde = rango?.desde || new Date(hoy.getTime() - dias * 86400e3).toISOString().slice(0, 10);
  const hasta = rango?.hasta || hoy.toISOString().slice(0, 10);
  const ins = db.prepare(`INSERT INTO effi_guias (store_id, id, guia, transportadora, estado, destinatario, ciudad, telefono, fecha, flete, recaudo, id_ref, url, raw, vigente, actualizado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(store_id, id) DO UPDATE SET guia = excluded.guia, transportadora = excluded.transportadora, estado = excluded.estado, destinatario = excluded.destinatario,
      ciudad = excluded.ciudad, telefono = excluded.telefono, fecha = excluded.fecha, flete = excluded.flete, recaudo = excluded.recaudo, id_ref = excluded.id_ref,
      url = excluded.url, raw = excluded.raw, vigente = excluded.vigente, actualizado = excluded.actualizado`);
  let n = 0;
  for (let pagina = 1; pagina <= 30; pagina++) {
    const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { desde, hasta, pagina, por_pagina: 100 } });
    if (!r.ok) { if (pagina === 1) return { error: String(r.body.mensaje || `Effi respondió ${r.http}`) }; break; }
    const filas = r.body.data || [];
    db.transaction(() => {
      for (const f of filas) {
        const id = `${txt(f.sucursal)}:${txt(f.id)}`;
        if (!txt(f.id)) continue;
        ins.run(storeId, id, numeroGuiaEffi(f), txt(f.nombre_transportadora_efficommerce) || txt(f.nombre_transportadora),
          campo(f, /^estado_efficommerce$|^estado_guia_efficommerce$|^nombre_est_guia$|^estado$/i),
          campo(f, /nombre_destinatario|^destinatario$|nombre_cliente|razon_social_destinatario/i),
          campo(f, /nombre_ciudad_destin|ciudad_destin/i),
          campo(f, /telefonos?_destin|celular_destin|movil_destin/i),
          campo(f, /^fecha_trans$|^fecha_creacion$|^fecha$|fecha_guia|fecha_registro/i),
          fleteDe(f).total, recaudoDe(f),
          txt(f.id_ref), urlDocumentoGuia(f), rawGuia(f), txt(f.vigente) === '0' ? 0 : 1);
        n++;
      }
    })();
    const tp = Number(r.body.paginacion?.total_paginas || 1);
    if (pagina >= tp || !filas.length) break;
  }
  if (!rango) ultimaSync.set(storeId, Date.now());
  return { guias: n };
}

// Historial de un año (una sola vez por tienda): el cotizador de fletes aprende de todas las guías,
// no solo de los últimos 60 días. Se pide mes por mes para no pasar el límite de páginas de Effi.
db.exec('CREATE TABLE IF NOT EXISTS effi_guias_historial (store_id TEXT PRIMARY KEY, hecho_at TEXT NOT NULL DEFAULT (datetime(\'now\')), guias INTEGER NOT NULL DEFAULT 0)');
export async function traerHistorialGuiasEffi(storeId: string, meses = 12): Promise<number> {
  if (db.prepare('SELECT 1 FROM effi_guias_historial WHERE store_id = ?').get(storeId)) return 0;
  const hoy = new Date(Date.now() - 5 * 3600e3);
  let total = 0;
  for (let m = 2; m <= meses; m++) {
    const fin = new Date(hoy.getTime() - (m - 1) * 30 * 86400e3), ini = new Date(hoy.getTime() - m * 30 * 86400e3);
    const r = await sincronizarGuiasEffi(storeId, 0, { desde: ini.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) });
    if ('error' in r) { if (m === 2) return 0; break; } // Effi no respondió: se reintenta en la próxima vuelta
    total += r.guias;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  db.prepare('INSERT OR REPLACE INTO effi_guias_historial (store_id, guias) VALUES (?, ?)').run(storeId, total);
  return total;
}

/** Cada 20 min: registro general de guías de las tiendas con Effi. */
export function iniciarGuiasEffi(): void {
  const vuelta = async () => {
    const tiendas = db.prepare("SELECT store_id FROM store_integrations WHERE tipo = 'effi_api'").all() as { store_id: string }[];
    for (const t of tiendas) { try { await sincronizarGuiasEffi(t.store_id); } catch (e) { console.warn('[logistica] guías', e); } }
    for (const t of tiendas) { try { await traerHistorialGuiasEffi(t.store_id); } catch (e) { console.warn('[logistica] historial de guías', e); } }
  };
  setTimeout(() => void vuelta(), 3 * 60_000);
  setInterval(() => void vuelta(), 20 * 60_000);
}
