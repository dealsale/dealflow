/**
 * Logística Effi: tablero de TODAS las guías de la tienda (pedidos enviados por
 * Effi), agrupadas por etapa del envío, con flete, recaudo, último movimiento y
 * cuáles llegan hoy. Lee lo que ya guardan los webhooks/consultas de Effi y, al
 * pedir "actualizar", consulta en Effi las guías activas.
 */
import { db, pj } from './db.js';
import { estadoLogistico } from './estadosPedido.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };

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
    };
  });
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
    efectividad: (() => { const fin = guias.filter((g) => g.etapa === 'entregado' || g.etapa === 'devuelto').length; return fin ? Math.round((guias.filter((g) => g.etapa === 'entregado').length / fin) * 100) : null; })(),
  };
  return { guias, resumen, actualizado: new Date().toISOString() };
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
    for (const o of act) {
      try { await consultarEstadoEffi(storeId, o.id); } catch { /* sigue */ }
      try { if (o.guia) await rastrearGuia(storeId, o.id, 15); } catch { /* sigue */ }
    }
    return { revisadas: act.length };
  } finally { refrescando.delete(storeId); }
}
