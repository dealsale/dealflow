/**
 * Cotizador de flete para elegir la transportadora al despachar con Effi (como el selector de Dropi).
 *
 * Effi NO tiene un endpoint para cotizar: el flete lo define la transportadora al crear la guía.
 * Por eso se estima con las guías que ya hizo la tienda:
 *  - envío (costo_flete_api_calculado) de esa transportadora a la MISMA ciudad (si no hay, al
 *    departamento; si no, el general de la transportadora),
 *  - manejo (costo_manejo_api_calculado) típico,
 *  - comisión del recaudo contra entrega (costo_otros_api_calculado / valor_recaudo) típica.
 * Y con la cobertura de Effi (GET /api/cobertura_transportadora_efficommerce): si la transportadora
 * llega a esa ciudad, si admite recaudo contra entrega y los días de promesa de entrega.
 */
import { db, pj } from './db.js';
import { nombreTransportadora } from './transportadoras.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const mediana = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

export interface Cotizacion {
  transportadoraId: string; nombre: string; effi: boolean;
  /** Nombre completo en la cuenta de Effi (p. ej. «COORDINADORA EFFI | CON RECAUDO | FLETE CRÉDITO»). */
  opcion: string;
  /** Si la opción es «con recaudo» o «sin recaudo» (según su nombre en Effi); '' si no lo dice. */
  modalidad: 'con' | 'sin' | '';
  /** Flete estimado para ESTE pedido (con su recaudo si es contra entrega). */
  flete: number; base: number; manejo: number; comision: number; pctComision: number;
  /** null = no sabemos (sin cobertura consultada). */
  llega: boolean | null; admiteRecaudo: boolean | null; dias: number | null; diasFuente: 'effi' | 'historial' | '';
  muestras: number; nivel: 'ciudad' | 'departamento' | 'general' | 'sin_datos'; detalle: string;
}

interface GuiaHist { transp: string; ciudad: string; prov: string; base: number; manejo: number; otros: number; total: number; recaudo: number; dias: number | null }

/** Guías de la tienda (registro general de Effi), últimos 180 días, vigentes. */
function historial(storeId: string): GuiaHist[] {
  const desde = new Date(Date.now() - 180 * 86400e3).toISOString().slice(0, 10);
  const filas = db.prepare("SELECT transportadora, raw FROM effi_guias WHERE store_id = ? AND vigente = 1 AND (fecha = '' OR substr(fecha,1,10) >= ?) LIMIT 5000").all(storeId, desde) as { transportadora: string; raw: string }[];
  const out: GuiaHist[] = [];
  for (const f of filas) {
    const r = pj<Fila>(f.raw, {});
    const total = num(r.valor_flete);
    const manejo = num(r.costo_manejo_api_calculado), otros = num(r.costo_otros_api_calculado);
    const base = num(r.costo_flete_api_calculado) || Math.max(0, total - manejo - otros);
    if (!(base > 0) && !(total > 0)) continue;
    const ini = Date.parse(txt(r.fecha_trans).replace(' ', 'T') + 'Z'), fin = Date.parse(txt(r.fecha_estado_final).replace(' ', 'T') + (txt(r.fecha_estado_final).length > 10 ? 'Z' : 'T12:00:00Z'));
    const entregada = txt(r.est_guia_efficommerce) === '4' || /entregad/i.test(txt(r.estado_efficommerce));
    out.push({
      transp: norm(nombreTransportadora(txt(r.nombre_transportadora_efficommerce) || f.transportadora || txt(r.nombre_transportadora)) || f.transportadora),
      ciudad: norm(txt(r.nombre_ciudad_destinatario)), prov: norm(txt(r.nombre_provincia_destinatario)),
      base, manejo, otros, total, recaudo: txt(r.recaudo) === '0' ? 0 : num(r.valor_recaudo),
      dias: entregada && ini && fin && fin > ini ? Math.max(1, Math.round((fin - ini) / 86400e3)) : null,
    });
  }
  return out;
}

/** Cobertura de Effi de una transportadora hacia una ciudad (caché 24 h). */
const cacheCob = new Map<string, { at: number; filas: Fila[] }>();
async function cobertura(apiKey: string, transpEffi: string, ciudadDestino: string): Promise<Fila[] | null> {
  const k = `${transpEffi}:${ciudadDestino}`;
  const c = cacheCob.get(k);
  if (c && Date.now() - c.at < 24 * 3600e3) return c.filas;
  const ef = await import('./effiApi.js');
  const r = await ef.effi<Fila[]>(apiKey, 'GET', '/api/cobertura_transportadora_efficommerce', { query: { transportadora_efficommerce: transpEffi, ciudad_destino: ciudadDestino, por_pagina: 100 } });
  if (!r.ok) return null;
  const filas = (r.body.data || []).filter((f) => txt(f.vigente) !== '0');
  cacheCob.set(k, { at: Date.now(), filas });
  if (cacheCob.size > 3000) cacheCob.clear();
  return filas;
}

/** Transportadoras de Effi con su id global (para la cobertura), caché 1 h. */
const cacheTransp = new Map<string, { at: number; lista: { id: string; nombre: string }[] }>();
async function transportadorasEffi(apiKey: string): Promise<{ id: string; nombre: string }[]> {
  const c = cacheTransp.get(apiKey);
  if (c && Date.now() - c.at < 3600e3) return c.lista;
  const ef = await import('./effiApi.js');
  const r = await ef.effi<Fila[]>(apiKey, 'GET', '/api/transportadora_efficommerce', { query: { por_pagina: 100 } });
  const lista = r.ok ? (r.body.data || []).filter((f) => txt(f.vigente) !== '0').map((f) => ({ id: txt(f.id), nombre: txt(f.nombre) })) : [];
  cacheTransp.set(apiKey, { at: Date.now(), lista });
  return lista;
}

/**
 * Cotiza todas las transportadoras de la cuenta de Effi para un pedido.
 * `remitente`: código del remitente elegido (para tomar la cobertura desde su ciudad).
 */
export async function cotizarPedido(storeId: string, orderId: string, remitente = ''): Promise<{ cotizaciones: Cotizacion[]; recaudo: number; ciudad: string; departamento: string; aviso: string } | { error: string }> {
  const ef = await import('./effiApi.js');
  const c = ef.cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Conecta Effi primero.' };
  const o = db.prepare('SELECT ciudad, departamento, total, nota FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as { ciudad: string; departamento: string; total: number; nota: string } | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const recaudo = /pagado/i.test(o.nota || '') && !/contra ?entrega/i.test(o.nota || '') ? 0 : Math.round(Number(o.total) || 0);
  const ops = await ef.opcionesGuiaEffi(c.apiKey);
  if ('error' in ops) return { error: ops.error };
  const transps = ops.transportadoras as { id: string; nombre: string; effi: string; effiId?: string }[];
  const rems = ops.remitentes as { id: string; ciudad: string }[];
  const origen = norm(rems.find((r) => r.id === remitente)?.ciudad || '');
  const hist = historial(storeId);
  const nCiudad = norm(o.ciudad), nProv = norm(o.departamento);
  // Ciudad de destino en Effi (para la cobertura); si no se puede, se cotiza solo con el historial.
  let ciudadEffi = '';
  let aviso = '';
  try { const u = await ef.resolverUbicacion(c.apiKey, o.departamento, o.ciudad); if (!('error' in u)) ciudadEffi = u.ciudad; else aviso = u.error; } catch { /* sin cobertura */ }
  const globales = await transportadorasEffi(c.apiKey).catch(() => []);

  const cotizaciones: Cotizacion[] = [];
  for (const t of transps) {
    const clave = norm(nombreTransportadora(t.effi || t.nombre) || t.effi || t.nombre);
    const propias = hist.filter((h) => h.transp === clave || (clave && (h.transp.includes(clave) || clave.includes(h.transp))));
    const enCiudad = propias.filter((h) => h.ciudad && h.ciudad === nCiudad);
    const enProv = propias.filter((h) => h.prov && h.prov === nProv);
    const grupo = enCiudad.length ? enCiudad : enProv.length ? enProv : propias;
    const nivel: Cotizacion['nivel'] = !propias.length ? 'sin_datos' : enCiudad.length ? 'ciudad' : enProv.length ? 'departamento' : 'general';
    const base = Math.round(mediana(grupo.map((h) => h.base)));
    const manejo = Math.round(mediana(propias.map((h) => h.manejo)));
    const conRec = propias.filter((h) => h.recaudo > 0 && h.otros > 0);
    const pct = conRec.length ? Math.min(0.15, mediana(conRec.map((h) => h.otros / h.recaudo))) : 0;
    const otrosSinRec = Math.round(mediana(propias.filter((h) => !h.recaudo).map((h) => h.otros)));
    const modalidad: Cotizacion['modalidad'] = /sin\s*recaudo/i.test(t.nombre) ? 'sin' : /con\s*recaudo/i.test(t.nombre) ? 'con' : '';
    // Con recaudo: comisión sobre lo que se cobra. Sin recaudo (o pedido ya pagado): sin comisión.
    const comision = recaudo > 0 && modalidad !== 'sin' ? Math.round(pct * recaudo) : otrosSinRec;
    const flete = base > 0 ? base + manejo + comision : 0;
    const diasHist = mediana(grupo.map((h) => h.dias).filter((d): d is number => d != null));
    // Cobertura de Effi.
    let llega: boolean | null = null, admite: boolean | null = null, diasEffi: number | null = null;
    const idGlobal = t.effiId || globales.find((g) => norm(g.nombre) === norm(t.effi) || (clave && norm(nombreTransportadora(g.nombre)) === clave))?.id || '';
    if (t.effi && idGlobal && ciudadEffi) {
      const cob = await cobertura(c.apiKey, idGlobal, ciudadEffi).catch(() => null);
      if (cob) {
        const desdeOrigen = origen ? cob.filter((f) => norm(txt(f.nombre_ciudad_origen)) === origen) : [];
        const usar = desdeOrigen.length ? desdeOrigen : cob;
        llega = usar.length > 0;
        if (usar.length) {
          admite = usar.some((f) => txt(f.recaudo) === '1');
          const ds = usar.map((f) => num(f.cant_dias_promesa_entrega)).filter((d) => d > 0);
          diasEffi = ds.length ? Math.min(...ds) : null;
        }
      }
    }
    const lugar = nivel === 'ciudad' ? o.ciudad : nivel === 'departamento' ? o.departamento : 'todo el país';
    cotizaciones.push({
      transportadoraId: t.id, nombre: nombreTransportadora(t.effi || t.nombre) || t.effi || t.nombre, effi: !!t.effi, opcion: t.nombre, modalidad,
      flete, base, manejo, comision, pctComision: Math.round(pct * 1000) / 10,
      llega, admiteRecaudo: admite, dias: diasEffi ?? (diasHist ? Math.round(diasHist) : null), diasFuente: diasEffi != null ? 'effi' : diasHist ? 'historial' : '',
      muestras: grupo.length, nivel,
      detalle: !propias.length ? 'Sin guías anteriores con esta transportadora: el valor lo define al crear la guía.' : `Según ${grupo.length} guía${grupo.length === 1 ? '' : 's'} a ${lugar}${pct ? ` · comisión del recaudo ≈ ${Math.round(pct * 1000) / 10} %` : ''}`,
    });
  }
  // Primero las que llegan y admiten el pago del pedido; luego por precio.
  // Un pedido contra entrega no puede salir por una opción «sin recaudo» ni a donde no se admite recaudo.
  const puntaje = (x: Cotizacion) => (x.llega === false ? 3 : 0) + (recaudo > 0 && (x.admiteRecaudo === false || x.modalidad === 'sin') ? 2 : 0) + (x.flete ? 0 : 1);
  cotizaciones.sort((a, b) => puntaje(a) - puntaje(b) || (a.flete || 1e12) - (b.flete || 1e12));
  return { cotizaciones, recaudo, ciudad: o.ciudad, departamento: o.departamento, aviso };
}
