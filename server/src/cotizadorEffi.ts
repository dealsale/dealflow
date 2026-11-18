/**
 * Cotizador de transportadoras de Effi para un pedido.
 *
 * Effi no tiene un endpoint para cotizar, así que se combinan dos cosas que sí son reales:
 *  1. La COBERTURA de Effi para la ciudad del pedido (effiExtras.coberturaCiudad): qué
 *     transportadoras llegan, si cobran contra entrega y los días prometidos.
 *  2. Los FLETES de las guías anteriores de la tienda (tabla effi_guias): envío + comisión del
 *     recaudo. Primero las guías a esa misma ciudad; si hay pocas, al departamento; si no, todas.
 *
 * El resultado es un ESTIMADO («≈»): el valor exacto lo pone la transportadora al crear la guía.
 */
import { db } from './db.js';
import { norm } from './emparejar.js';
import { fleteDe } from './logistica.js';
import { nombreTransportadora } from './transportadoras.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const clave = (nombre: string) => norm(nombreTransportadora(nombre) || nombre).replace(/\s+/g, '');
const mediana = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface OpcionCotizada {
  /** id de la transportadora en Effi (para la guía); vacío si la cuenta no la tiene. */
  id: string;
  nombre: string;
  /** null = no se sabe (Effi no respondió la cobertura). */
  llega: boolean | null;
  recaudo: boolean | null;
  dias: number | null;
  /** Flete estimado con recaudo (contra entrega) y sin recaudo. 0 = sin guías para estimar. */
  flete: number;
  fleteSin: number;
  base: number;
  /** Comisión del recaudo en % (p. ej. 4.5). */
  pct: number;
  muestras: number;
  /** De dónde salió el estimado: guías a la misma ciudad, al departamento o a todo el país. */
  alcance: 'ciudad' | 'departamento' | 'nacional' | '';
  /** igual = una guía con el mismo destino y recaudo (exacto) · desglose = fija + comisión % · parecidas = guías con recaudo parecido. */
  metodo: 'igual' | 'desglose' | 'parecidas' | '';
}
export interface Cotizacion { ciudad: string; departamento: string; recaudo: number; cobertura: boolean; opciones: OpcionCotizada[]; /** La transportadora configurada para las guías (si sirve, se deja elegida). */ predeterminada: string }

interface Guia { t: string; ciudad: string; depto: string; flete: number; fijo: number; otros: number; desglose: boolean; recaudo: number }

function guiasDeTienda(storeId: string): Guia[] {
  // Más recientes primero: si la transportadora cambió la tarifa, manda lo último.
  const filas = db.prepare(`SELECT transportadora, ciudad, flete, recaudo, raw FROM effi_guias WHERE store_id = ? AND vigente = 1 AND flete > 0
    AND COALESCE(fecha, '') >= date('now', '-240 days') ORDER BY fecha DESC LIMIT 4000`).all(storeId) as { transportadora: string; ciudad: string; flete: number; recaudo: number; raw: string }[];
  return filas.map((f) => {
    let raw: Fila = {};
    try { raw = JSON.parse(f.raw || '{}') as Fila; } catch { /* guía sin detalle */ }
    const depto = Object.entries(raw).find(([k, v]) => /departamento|provincia/i.test(k) && /destin/i.test(k) && typeof v === 'string')?.[1] as string | undefined;
    const fl = fleteDe(raw);
    // Desglose de Effi: valor_flete = (envío + manejo − descuento) + otros, y en «otros» va la comisión
    // del recaudo. La parte fija es todo lo que no es esa comisión, así la suma da EXACTO el flete.
    const desglose = fl.base + fl.manejo + fl.otros > 0;
    const otros = desglose ? Math.max(0, fl.otros) : 0;
    return { t: clave(f.transportadora), ciudad: norm(f.ciudad), depto: norm(depto || ''), flete: f.flete, fijo: desglose ? f.flete - otros : f.recaudo <= 0 ? f.flete : 0, otros, desglose, recaudo: f.recaudo };
  }).filter((g) => g.t);
}

type Estimado = Pick<OpcionCotizada, 'flete' | 'fleteSin' | 'base' | 'pct' | 'muestras' | 'alcance' | 'metodo'>;
const RECIENTES = 15;

/**
 * Estimado de una transportadora con las guías más parecidas (ciudad → departamento → país), en
 * este orden de exactitud:
 *  1. una guía reciente al mismo destino con el MISMO valor a recaudar: su flete tal cual;
 *  2. el desglose de Effi: parte fija (envío + manejo − descuento) + comisión % × recaudo;
 *  3. sin desglose: el flete de guías con un recaudo parecido.
 */
function estimar(guias: Guia[], ciudad: string, depto: string, recaudo: number): Estimado {
  const vacio: Estimado = { flete: 0, fleteSin: 0, base: 0, pct: 0, muestras: 0, alcance: '', metodo: '' };
  if (!guias.length) return vacio;
  const enCiudad = ciudad ? guias.filter((g) => g.ciudad === ciudad) : [];
  const enDepto = depto ? guias.filter((g) => g.depto === depto) : [];
  const [todas, alcance] = enCiudad.length >= 1 ? [enCiudad, 'ciudad' as const] : enDepto.length >= 2 ? [enDepto, 'departamento' as const] : guias.length >= 3 ? [guias, 'nacional' as const] : [[], ''] as const;
  if (!todas.length) return vacio;
  const muestra = todas.slice(0, RECIENTES);
  // La comisión % casi no cambia por destino: si esta muestra no la tiene, la de todas sus guías.
  const pctDe = (l: Guia[]) => l.filter((g) => g.desglose && g.recaudo > 0).map((g) => g.otros / g.recaudo);
  const pcts = pctDe(muestra).length ? pctDe(muestra) : pctDe(guias.slice(0, RECIENTES * 2));
  const pct = mediana(pcts);
  const fijos = muestra.map((g) => g.fijo).filter((x) => x > 0);
  const fijo = mediana(fijos);
  const fleteSin = Math.round(fijo);
  // 1. Mismo destino y mismo recaudo (±1 %): el flete de esa guía, exacto.
  if (alcance === 'ciudad' && recaudo > 0) {
    const igual = muestra.find((g) => g.recaudo > 0 && Math.abs(g.recaudo - recaudo) <= recaudo * 0.01);
    if (igual) return { flete: Math.round(igual.flete), fleteSin, base: Math.round(igual.fijo || fijo), pct: Math.round((igual.recaudo ? igual.otros / igual.recaudo : pct) * 10000) / 100, muestras: todas.length, alcance, metodo: 'igual' };
  }
  // 2. Desglose: parte fija + comisión × lo que se va a recaudar.
  if (fijo > 0 && (pcts.length || recaudo <= 0)) {
    return { flete: Math.round(fijo + (recaudo > 0 ? pct * recaudo : 0)), fleteSin, base: Math.round(fijo), pct: Math.round(pct * 10000) / 100, muestras: todas.length, alcance, metodo: 'desglose' };
  }
  // 3. Sin desglose: guías con recaudo parecido (±40 %).
  const conRec = muestra.filter((g) => g.recaudo > 0);
  const parecidas = conRec.filter((g) => !recaudo || Math.abs(g.recaudo - recaudo) <= recaudo * 0.4).map((g) => g.flete);
  const flete = mediana(parecidas.length ? parecidas : conRec.map((g) => g.flete));
  return flete > 0 ? { flete: Math.round(flete), fleteSin, base: 0, pct: 0, muestras: todas.length, alcance, metodo: 'parecidas' } : vacio;
}

export async function cotizarEffi(storeId: string, orderId: string): Promise<Cotizacion | { error: string }> {
  const o = db.prepare('SELECT ciudad, departamento, total FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as { ciudad: string; departamento: string; total: number } | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const ef = await import('./effiApi.js');
  const c = ef.cfgEffi(storeId);
  if (!c?.apiKey) return { error: 'Conecta Effi primero.' };
  const recaudo = Math.max(0, Math.round(Number(o.total) || 0));
  const [ops, cob] = await Promise.all([
    ef.opcionesGuiaEffi(c.apiKey).catch(() => ({ error: 'Effi no respondió.' })),
    import('./effiExtras.js').then((m) => m.coberturaCiudad(storeId, o.departamento || '', o.ciudad || '')).catch(() => null),
  ]);
  const transportadoras = 'error' in ops ? [] : (ops.transportadoras as { id: string; nombre: string; effi: string }[]);
  // Una lista vacía casi siempre es que Effi no reconoció el trayecto, no que nadie llegue: se toma como «no se sabe».
  const conCobertura = !!cob && !cob.error && cob.transportadoras.length > 0;
  const porCob = new Map((conCobertura ? cob!.transportadoras : []).map((t) => [clave(t.nombre), t]));
  const guias = guiasDeTienda(storeId);
  const ciudad = norm(o.ciudad || ''), depto = norm(o.departamento || '');

  // Todas las transportadoras de la cuenta, más las que da la cobertura aunque la cuenta no las tenga.
  const nombres = new Map<string, { id: string; nombre: string }>();
  for (const t of transportadoras) {
    const k = clave(t.effi || t.nombre);
    if (!nombres.has(k)) nombres.set(k, { id: t.id, nombre: nombreTransportadora(t.effi || t.nombre) || t.nombre });
  }
  for (const [k, t] of porCob) if (!nombres.has(k)) nombres.set(k, { id: '', nombre: t.nombre });

  const opciones: OpcionCotizada[] = [...nombres.entries()].map(([k, t]) => {
    const cb = porCob.get(k);
    return {
      id: t.id, nombre: t.nombre,
      llega: conCobertura ? !!cb : null,
      recaudo: conCobertura ? !!cb?.recaudo : null,
      dias: cb?.dias || null,
      ...estimar(guias.filter((g) => g.t === k), ciudad, depto, recaudo),
    };
  });
  // Primero las que sirven (llegan y cobran contra entrega), de la más barata a la más cara.
  const sirve = (x: OpcionCotizada) => x.llega !== false && x.recaudo !== false && !!x.id;
  opciones.sort((a, b) => Number(sirve(b)) - Number(sirve(a)) || (a.flete || 9e9) - (b.flete || 9e9) || (a.dias || 99) - (b.dias || 99) || a.nombre.localeCompare(b.nombre));
  return { ciudad: o.ciudad || '', departamento: o.departamento || '', recaudo, cobertura: conCobertura, opciones, predeterminada: txt(c.guia?.transportadora) };
}
