/**
 * Auditoría de remitentes de Effi: desde qué remitente (bodega de origen) salieron las guías
 * de cada tienda. Sirve para detectar guías creadas con un remitente equivocado (varias
 * cuentas tienen muchos remitentes con el mismo nombre de la tienda en bodegas distintas).
 *   - Effi: total de guías por remitente (filtro remitente + resumen agregado, sin paginar).
 *   - DealFlow: guías creadas por DealFlow con cada remitente (petición guardada en la
 *     trazabilidad del pedido, últimos 120 días), con las que aún están por recoger.
 */
import { db } from './db.js';
import { cfgEffi, effi } from './effiApi.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => Number(v) || 0;

export interface PedidoAuditado { numero: string; guia: string; estado: string; fecha: string; transportadora: string }
export interface RemitenteAuditado {
  codigo: string; nombre: string; ciudad: string; direccion: string; vigente: boolean; configurado: boolean;
  effi: { guias: number; entregadas: number; devoluciones: number; conNovedad: number } | null;
  dealflow: number; porRecoger: PedidoAuditado[];
}
export interface AuditoriaTienda { storeId: string; tienda: string; configurado: string; guiaAutomatica: boolean; remitentes: RemitenteAuditado[]; error?: string }

/** Guías que DealFlow creó en Effi para la tienda, agrupadas por el remitente que se envió. */
function guiasDeDealflow(storeId: string): Map<string, PedidoAuditado[]> {
  const filas = db.prepare(`SELECT e.datos, o.numero, o.guia, o.estado, o.transportadora, e.created_at FROM order_eventos e JOIN orders o ON o.id = e.order_id
    WHERE e.store_id = ? AND e.etapa = 'api' AND e.nivel = 'info' AND e.titulo LIKE 'Effi POST /api/guia_transporte%'`).all(storeId) as Fila[];
  const out = new Map<string, PedidoAuditado[]>();
  for (const f of filas) {
    let rem = '';
    try { const d = JSON.parse(txt(f.datos)); const r = d?.peticion?.remitente; rem = txt(Array.isArray(r) ? r[0] : r); } catch { rem = ''; }
    if (!rem) continue;
    const l = out.get(rem) || [];
    l.push({ numero: `DF-${txt(f.numero)}`, guia: txt(f.guia), estado: txt(f.estado), fecha: txt(f.created_at), transportadora: txt(f.transportadora) });
    out.set(rem, l);
  }
  return out;
}

export async function auditarRemitentesTienda(storeId: string): Promise<AuditoriaTienda> {
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || storeId;
  const c = cfgEffi(storeId);
  const base: AuditoriaTienda = { storeId, tienda, configurado: c?.guia?.remitente || '', guiaAutomatica: !!c?.guia?.activa, remitentes: [] };
  if (!c?.apiKey) return { ...base, error: 'Effi no está conectado.' };
  const rems: Fila[] = [];
  for (const vigente of [1, 0]) {
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/remitente', { query: { pagina, por_pagina: 100, ...(vigente ? {} : { vigente: 0 }) } });
      if (!r.ok) { if (vigente && pagina === 1) return { ...base, error: `Effi no devolvió los remitentes (${r.http}).` }; break; }
      rems.push(...(r.body.data || []).map((f) => ({ ...f, _vigente: vigente })));
      if (pagina >= n(r.body.paginacion?.total_paginas || 1)) break;
    }
  }
  const df = guiasDeDealflow(storeId);
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const lista: RemitenteAuditado[] = [];
  for (const f of rems) {
    const codigo = txt(f.codigo);
    const r = await effi<Fila[]>(c.apiKey, 'GET', '/api/guia_transporte', { query: { remitente: codigo, agrupar_por: 'est_guia_efficommerce', desde: '2015-01-01', hasta: hoy } });
    let resumen: RemitenteAuditado['effi'] = null;
    if (r.ok) {
      const tot = (r.body as unknown as { resumen?: { totales?: Fila } }).resumen?.totales;
      const filas = r.body.data || [];
      const suma = (k: string) => (tot && k in tot ? n(tot[k]) : filas.reduce((a, x) => a + n(x[k]), 0));
      resumen = { guias: suma('cantidad'), entregadas: suma('entregadas'), devoluciones: suma('devoluciones'), conNovedad: suma('con_novedad') };
    }
    const deDf = df.get(codigo) || [];
    lista.push({
      codigo, nombre: txt(f.nombre), ciudad: txt(f.nombre_ciudad), direccion: txt(f.direccion), vigente: f._vigente === 1,
      configurado: codigo === base.configurado, effi: resumen, dealflow: deDf.length,
      porRecoger: deDf.filter((p) => p.estado === 'Guía generada' || p.estado === 'Confirmado'),
    });
  }
  // Remitentes que DealFlow usó y ya no aparecen en Effi.
  for (const [codigo, deDf] of df) if (!lista.some((x) => x.codigo === codigo)) {
    lista.push({ codigo, nombre: '(no aparece en Effi)', ciudad: '', direccion: '', vigente: false, configurado: codigo === base.configurado, effi: null, dealflow: deDf.length, porRecoger: deDf.filter((p) => p.estado === 'Guía generada') });
  }
  lista.sort((a, b) => (b.effi?.guias || 0) + b.dealflow - ((a.effi?.guias || 0) + a.dealflow));
  return { ...base, remitentes: lista };
}

/** Todas las tiendas con Effi conectado (una a la vez para no saturar a Effi). */
export async function auditarRemitentes(): Promise<AuditoriaTienda[]> {
  const tiendas = db.prepare("SELECT store_id FROM store_integrations WHERE tipo = 'effi_api'").all() as { store_id: string }[];
  const out: AuditoriaTienda[] = [];
  for (const t of tiendas) {
    try { out.push(await auditarRemitentesTienda(t.store_id)); } catch (e) { out.push({ storeId: t.store_id, tienda: t.store_id, configurado: '', guiaAutomatica: false, remitentes: [], error: (e as Error).message }); }
  }
  return out;
}
