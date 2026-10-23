/**
 * Logística Effi: tablero de TODAS las guías de la tienda (pedidos enviados por
 * Effi), agrupadas por etapa del envío, con flete, recaudo, último movimiento y
 * cuáles llegan hoy. Lee lo que ya guardan los webhooks/consultas de Effi y, al
 * pedir "actualizar", consulta en Effi las guías activas.
 */
import { db, pj } from './db.js';
import { cfgEffi, effi, urlDocumentoGuia } from './effiApi.js';
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
const ultimaSync = new Map<string, number>();

export type Etapa = 'sin_guia' | 'por_recoger' | 'transito' | 'reparto' | 'novedad' | 'entregado' | 'devuelto';

/** Etapa del tablero: el estado del pedido (que ya sigue a la guía) y, si aún no es logístico, el texto de Effi. */
function etapaDe(o: Fila): Etapa {
  if (Number(o.novedad_activa) > 0) return 'novedad';
  let e = txt(o.estado);
  if (!['Guía generada', 'En tránsito', 'En reparto', 'Novedad', 'Entregado', 'Devuelto'].includes(e)) e = estadoLogistico(txt(o.estado_woo), !!txt(o.guia)) || e;
  switch (e) {
    case 'Devuelto': return 'devuelto';
    case 'Entregado': return 'entregado';
    case 'Novedad': return 'novedad';
    case 'En reparto': return 'reparto';
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
    case 'En tránsito': return 'transito';
    default: return guia ? 'por_recoger' : 'sin_guia';
  }
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
  const hoyCO = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const guias = filas.map((o) => {
    const info = pj<Fila>(txt(o.effi_guia_info), {});
    const mov = ult.get(txt(o.id)) as Fila | undefined;
    const etapa = etapaDe(o);
    const flete = Number(buscarEn(info, /flete|valor_envio|costo_envio|valor_servicio/i, true)) || 0;
    const estimada = String(buscarEn(info, /fecha.*(entrega|estimad)|(entrega|estimad).*fecha/i, false) || '').slice(0, 10);
    const recaudo = /contra ?entrega/i.test(txt(o.nota)) || !/pagado/i.test(txt(o.nota)) ? Number(o.total) || 0 : 0;
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
  const externas = (db.prepare("SELECT * FROM effi_guias WHERE store_id = ? AND (fecha = '' OR substr(fecha,1,10) >= ?) ORDER BY fecha DESC LIMIT 1500").all(storeId, desdeTxt) as Fila[])
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
export async function sincronizarGuiasEffi(storeId: string, dias = 60): Promise<{ guias: number } | { error: string }> {
  const c = cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Effi no está conectado.' };
  const hoy = new Date(Date.now() - 5 * 3600e3);
  const desde = new Date(hoy.getTime() - dias * 86400e3).toISOString().slice(0, 10);
  const hasta = hoy.toISOString().slice(0, 10);
  const ins = db.prepare(`INSERT INTO effi_guias (store_id, id, guia, transportadora, estado, destinatario, ciudad, telefono, fecha, flete, recaudo, id_ref, url, raw, actualizado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(store_id, id) DO UPDATE SET guia = excluded.guia, transportadora = excluded.transportadora, estado = excluded.estado, destinatario = excluded.destinatario,
      ciudad = excluded.ciudad, telefono = excluded.telefono, fecha = excluded.fecha, flete = excluded.flete, recaudo = excluded.recaudo, id_ref = excluded.id_ref,
      url = excluded.url, raw = excluded.raw, actualizado = excluded.actualizado`);
  let n = 0;
  for (let pagina = 1; pagina <= 30; pagina++) {
    const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { desde, hasta, pagina, por_pagina: 100 } });
    if (!r.ok) { if (pagina === 1) return { error: String(r.body.mensaje || `Effi respondió ${r.http}`) }; break; }
    const filas = r.body.data || [];
    db.transaction(() => {
      for (const f of filas) {
        const id = `${txt(f.sucursal)}:${txt(f.id)}`;
        if (!txt(f.id)) continue;
        ins.run(storeId, id, txt(f.guia), txt(f.nombre_transportadora_efficommerce) || txt(f.nombre_transportadora),
          campo(f, /^estado_efficommerce$|^estado_guia_efficommerce$|^nombre_est_guia$|^estado$/i),
          campo(f, /nombre_destinatario|^destinatario$|nombre_cliente|razon_social_destinatario/i),
          campo(f, /nombre_ciudad_destin|ciudad_destin/i),
          campo(f, /telefono_destin|celular_destin|movil_destin/i),
          campo(f, /^fecha_creacion$|^fecha$|fecha_guia|fecha_registro/i),
          num(campo(f, /flete|valor_envio|valor_servicio/i)), num(campo(f, /recaudo|valor_cobrar|contra_?entrega/i)),
          txt(f.id_ref), urlDocumentoGuia(f), JSON.stringify(f).slice(0, 6000));
        n++;
      }
    })();
    const tp = Number(r.body.paginacion?.total_paginas || 1);
    if (pagina >= tp || !filas.length) break;
  }
  ultimaSync.set(storeId, Date.now());
  return { guias: n };
}

/** Cada 20 min: registro general de guías de las tiendas con Effi. */
export function iniciarGuiasEffi(): void {
  const vuelta = async () => {
    const tiendas = db.prepare("SELECT store_id FROM store_integrations WHERE tipo = 'effi_api'").all() as { store_id: string }[];
    for (const t of tiendas) { try { await sincronizarGuiasEffi(t.store_id); } catch (e) { console.warn('[logistica] guías', e); } }
  };
  setTimeout(() => void vuelta(), 3 * 60_000);
  setInterval(() => void vuelta(), 20 * 60_000);
}
