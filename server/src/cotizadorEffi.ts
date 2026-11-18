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

export interface OpcionCotizada {
  /** id de la transportadora en Effi (para la guía); vacío si la cuenta no la tiene. */
  id: string;
  nombre: string;
  /** null = no se sabe (Effi no respondió la cobertura). */
  llega: boolean | null;
  recaudo: boolean | null;
  dias: number | null;
  /** Flete total estimado (envío + seguro + comisión del recaudo). 0 = sin guías para estimar. */
  flete: number;
  /** Partes del flete, como las cobra Effi. */
  base: number;
  seguro: number;
  comision: number;
  /** Comisión del recaudo en % (p. ej. 5). */
  pct: number;
  /** Valor declarado con que se calculó el seguro. */
  declarado: number;
  muestras: number;
  /** De dónde salió el envío: guías a la misma ciudad desde la misma bodega, desde otra bodega, o al departamento. */
  alcance: 'ciudad' | 'ciudad_otra_bodega' | 'departamento' | '';
  /** igual = una guía reciente idéntica (mismo destino, bodega y valores): su flete exacto. */
  metodo: 'igual' | 'tarifa' | '';
}
export interface Cotizacion {
  ciudad: string; departamento: string; recaudo: number; cobertura: boolean; opciones: OpcionCotizada[];
  /** La transportadora configurada para las guías (si sirve, se deja elegida). */
  predeterminada: string;
  /** Ciudad de la bodega de origen con que se cotizó. */
  origen: string;
}

/** Una guía anterior con el desglose que cobra Effi: total = envío + seguro + comisión del recaudo. */
export interface Guia { t: string; ori: string; dep: string; ciu: string; fl: number; man: number; rec: number; tot: number; decl: number; vrec: number; desc: number; f: number }
const DIA = 86400_000;

/** Una guía de effi_guias (con su JSON de Effi) → los números que importan para el flete. */
export function aGuia(f: { transportadora: string; ciudad: string; flete: number; recaudo: number; fecha: string; raw: string }): Guia {
  let raw: Fila = {};
  try { raw = JSON.parse(f.raw || '{}') as Fila; } catch { /* guía sin detalle */ }
  const fl = fleteDe(raw);
  const n = (k: string) => Number(String(raw[k] ?? '').replace(/[^0-9.-]/g, '')) || 0;
  const tot = fl.total || f.flete;
  const man = Math.max(0, fl.manejo), rec = Math.max(0, fl.otros);
  // Envío = lo que queda del total sin seguro ni comisión (ya con el descuento de Effi).
  const env = fl.base + fl.manejo + fl.otros > 0 ? tot - man - rec : f.recaudo <= 0 ? tot : 0;
  const d = n('descuento');
  return {
    t: clave(f.transportadora), ori: norm(txt(raw.nombre_ciudad_remitente)), dep: norm(txt(raw.nombre_provincia_destinatario || raw.nombre_departamento_destinatario)), ciu: norm(f.ciudad),
    fl: env, man, rec, tot, decl: n('valor_declarado'), vrec: f.recaudo, desc: d > 0 && d < 1 ? d : 0, f: Date.parse(String(f.fecha || '').replace(' ', 'T')) || 0,
  };
}

function guiasDeTienda(storeId: string): Guia[] {
  const filas = db.prepare(`SELECT transportadora, ciudad, flete, recaudo, fecha, raw FROM effi_guias WHERE store_id = ? AND vigente = 1 AND flete > 0
    AND COALESCE(fecha, '') >= date('now', '-400 days') ORDER BY fecha DESC LIMIT 6000`).all(storeId) as { transportadora: string; ciudad: string; flete: number; recaudo: number; fecha: string; raw: string }[];
  return filas.map(aGuia).filter((g) => g.t && g.f).sort((a, b) => a.f - b.f); // de la más vieja a la más nueva
}

const moda = (xs: number[]): number => { const c = new Map<number, number>(); let m = 0, k = 0; for (const x of xs) { const v = (c.get(x) || 0) + 1; c.set(x, v); if (v > k || (v === k && x === xs[xs.length - 1])) { k = v; m = x; } } return m; };
const r4 = (x: number) => Math.round(x * 10000) / 10000;

/** % y mínimo de un cargo (seguro sobre lo declarado, comisión sobre lo recaudado). */
function parametro(pt: Guia[], campo: 'man' | 'rec', sobre: 'decl' | 'vrec'): { pct: number; min: number } {
  const l = pt.slice(-300).filter((g) => g[sobre] > 0 && g[campo] > 0);
  if (!l.length) return { pct: 0, min: 0 };
  const pct = moda(l.map((g) => r4(g[campo] / g[sobre])));
  const mins = l.filter((g) => g[campo] > pct * g[sobre] + 1).map((g) => g[campo]);
  return { pct, min: mins.length ? moda(mins) : 0 };
}

/** Lo que la tienda declara con esa transportadora: si casi siempre es el mismo valor (p. ej. $10.000), ese; si no, lo que se cobra. */
function declaradoHabitual(pt: Guia[], valor: number): number {
  const l = pt.slice(-50);
  if (!l.length) return valor;
  const v = moda(l.map((g) => g.decl));
  const veces = l.filter((g) => g.decl === v).length;
  const distinto = l.filter((g) => g.decl !== g.vrec).length;
  return v > 0 && veces >= 0.7 * l.length && distinto >= 0.7 * l.length ? v : valor;
}

/** Seguro: el de una guía reciente con el mismo valor declarado; si no, la recta seguro = a + b·declarado de las últimas guías. */
function seguroDe(pt: Guia[], ori: string, decl: number): number {
  const po = pt.filter((g) => g.ori === ori).length ? pt.filter((g) => g.ori === ori) : pt;
  const igual = po.slice(-200).filter((g) => g.decl === decl);
  if (igual.length) return igual[igual.length - 1].man;
  const rec = po.slice(-100).reverse();
  const x = rec[0];
  if (x) for (const y of rec.slice(1)) {
    if (y.decl !== x.decl && y.decl > 0 && x.decl > 0) {
      const b = (x.man - y.man) / (x.decl - y.decl);
      if (b >= 0 && b <= 0.05) return Math.max(0, Math.round(x.man + b * (decl - x.decl)));
      break;
    }
  }
  const p = parametro(pt, 'man', 'decl');
  return Math.round(Math.max(p.min, p.pct * decl));
}

/**
 * Envío a ese destino HOY. Parte de la última guía a esa ciudad (misma bodega si hay) y la lleva a la
 * tarifa actual: si la transportadora cambió su tarifa (o Effi tu descuento), la ciudad que pagaba la
 * tarifa común paga la común de hoy y las demás se escalan en la misma proporción.
 */
function envioDe(pt: Guia[], ori: string, dep: string, ciu: string): { base: number; alcance: OpcionCotizada['alcance']; ult: Guia } | null {
  let cand = pt.filter((g) => g.fl > 0 && g.ciu === ciu && g.dep === dep && g.ori === ori);
  let alcance: OpcionCotizada['alcance'] = 'ciudad';
  if (!cand.length) {
    const enDep = pt.filter((g) => g.fl > 0 && g.dep === dep && g.ori === ori).slice(-30);
    if (enDep.length) { const m = moda(enDep.map((g) => g.fl)); cand = enDep.filter((g) => g.fl === m); alcance = 'departamento'; }
  }
  if (!cand.length) { cand = pt.filter((g) => g.fl > 0 && g.ciu === ciu && g.dep === dep); alcance = 'ciudad_otra_bodega'; }
  if (!cand.length) { cand = pt.filter((g) => g.fl > 0 && g.dep === dep); alcance = 'departamento'; }
  if (!cand.length) return null;
  const ult = cand[cand.length - 1];
  const po = pt.filter((g) => g.ori === ult.ori && g.fl > 0);
  const hoy = po[po.length - 1]?.f || ult.f;
  const lista = (g: Guia) => (g.desc > 0 && g.desc < 1 ? g.fl / (1 - g.desc) : g.fl);
  const ahora = po.filter((g) => hoy - g.f <= 21 * DIA).slice(-60);
  const entonces = po.filter((g) => Math.abs(g.f - ult.f) <= 21 * DIA);
  const mNow = moda(ahora.map((g) => Math.round(lista(g)))), mThen = moda(entonces.map((g) => Math.round(lista(g))));
  let l = lista(ult);
  if (mNow && mThen && mNow !== mThen && hoy - ult.f > 3 * DIA) l = Math.round(l) === mThen ? mNow : (l * mNow) / mThen;
  const descHoy = po[po.length - 1]?.desc || 0;
  const base = descHoy > 0 || ult.desc > 0 || l !== ult.fl ? Math.round((l * (1 - descHoy)) / 100) * 100 : ult.fl;
  return { base, alcance, ult };
}

type Estimado = Pick<OpcionCotizada, 'flete' | 'base' | 'seguro' | 'comision' | 'pct' | 'declarado' | 'muestras' | 'alcance' | 'metodo'>;
const VACIO: Estimado = { flete: 0, base: 0, seguro: 0, comision: 0, pct: 0, declarado: 0, muestras: 0, alcance: '', metodo: '' };

/** Flete estimado de una transportadora (sus guías, ya ordenadas por fecha). Probado con un año de guías reales: 81 % exactas al peso, 88 % cuando hay guías a esa ciudad desde la misma bodega. */
export function estimar(pt: Guia[], ori: string, dep: string, ciu: string, recaudo: number, declaradoPedido: number): Estimado {
  if (!pt.length) return VACIO;
  const env = envioDe(pt, ori, dep, ciu);
  if (!env) return VACIO;
  const declarado = declaradoPedido > 0 ? declaradoPedido : declaradoHabitual(pt, recaudo);
  const seguro = seguroDe(pt, env.ult.ori, declarado);
  const p = parametro(pt, 'rec', 'vrec');
  const comision = recaudo > 0 ? Math.round(Math.max(p.min, p.pct * recaudo)) : 0;
  const flete = env.base + seguro + comision;
  const muestras = pt.filter((g) => (env.alcance === 'departamento' ? g.dep === dep : g.ciu === ciu)).length;
  const igual = env.alcance === 'ciudad' && env.ult.decl === declarado && env.ult.vrec === recaudo && Math.abs(env.ult.tot - flete) <= 1;
  return { flete, base: env.base, seguro, comision, pct: Math.round(p.pct * 10000) / 100, declarado, muestras, alcance: env.alcance, metodo: igual ? 'igual' : 'tarifa' };
}

export async function cotizarEffi(storeId: string, orderId: string, opts: { remitente?: string; declarado?: number } = {}): Promise<Cotizacion | { error: string }> {
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
  // Bodega de origen: la elegida, la de las guías por defecto o, si no, de donde más se despacha.
  const remitentes = 'error' in ops ? [] : (ops.remitentes as { id: string; ciudad: string }[]);
  const codigo = opts.remitente || c.remitenteDefecto || c.guia?.remitente || '';
  let origen = remitentes.find((r) => r.id === codigo)?.ciudad || '';
  let ori = norm(origen);
  if (!ori) {
    const cuenta = new Map<string, number>();
    for (const g of guias.slice(-200)) if (g.ori) cuenta.set(g.ori, (cuenta.get(g.ori) || 0) + 1);
    ori = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    origen = ori;
  }

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
      ...estimar(guias.filter((g) => g.t === k), ori, depto, ciudad, recaudo, Math.max(0, Number(opts.declarado) || 0)),
    };
  });
  // Primero las que sirven (llegan y cobran contra entrega), de la más barata a la más cara.
  const sirve = (x: OpcionCotizada) => x.llega !== false && x.recaudo !== false && !!x.id;
  opciones.sort((a, b) => Number(sirve(b)) - Number(sirve(a)) || (a.flete || 9e9) - (b.flete || 9e9) || (a.dias || 99) - (b.dias || 99) || a.nombre.localeCompare(b.nombre));
  return { ciudad: o.ciudad || '', departamento: o.departamento || '', recaudo, cobertura: conCobertura, opciones, predeterminada: txt(c.guia?.transportadora), origen };
}
