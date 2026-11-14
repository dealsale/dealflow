/**
 * Pruebas A/B de anuncios: se comparan dos anuncios (o dos conjuntos) que ya están corriendo, con
 * las ventas REALES de DealFlow (pedidos, entregas y devoluciones), no con los clics de Meta.
 *
 *  - Métrica: costo por venta (más bajo gana) o ROAS esperado (más alto gana; descuenta devoluciones).
 *  - Se decide cuando pasan los días mínimos y cada lado tiene las ventas mínimas, y uno es al menos
 *    15 % mejor. Si un lado no vende nada y ya gastó 3 veces lo que le cuesta una venta al otro, pierde.
 *  - A los 14 días sin diferencia clara se cierra como empate.
 *  - Al terminar: se pausa el perdedor (si así se configuró) y se avisa al celular.
 * "Duplicar conjunto" copia un conjunto con sus anuncios, en pausa, para cambiarle algo y probarlo.
 */
import { db, uid } from './db.js';
import { cuenta, graph, anotarCambio, panel, estructura, cambiarEstado, cambiarEstadoAnuncio } from './adsManager.js';
import { notificar } from './adsAlertas.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => Number(v) || 0;
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const diasEntre = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86400000);

export const MEJORA_MINIMA = 0.15;
export const DIAS_MAXIMOS = 14;

db.exec(`CREATE TABLE IF NOT EXISTS ads_pruebas (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '', nivel TEXT NOT NULL DEFAULT 'ad',
  a_id TEXT NOT NULL, a_nombre TEXT NOT NULL DEFAULT '', b_id TEXT NOT NULL, b_nombre TEXT NOT NULL DEFAULT '',
  metrica TEXT NOT NULL DEFAULT 'cpa', dias_min INTEGER NOT NULL DEFAULT 3, ventas_min INTEGER NOT NULL DEFAULT 5,
  accion TEXT NOT NULL DEFAULT 'pausar', estado TEXT NOT NULL DEFAULT 'corriendo', ganador TEXT NOT NULL DEFAULT '',
  resumen TEXT NOT NULL DEFAULT '', desde TEXT NOT NULL, creado TEXT NOT NULL DEFAULT (datetime('now')), terminada TEXT NOT NULL DEFAULT ''
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_ads_pruebas_store ON ads_pruebas (store_id, estado)');

export type MetricaPrueba = 'cpa' | 'roas';
export interface LadoPrueba { id: string; nombre: string; gasto: number; ventas: number; pedidos: number; cpa: number; roas: number; devueltos: number }
export interface Prueba {
  id: string; nombre: string; nivel: 'ad' | 'adset'; metrica: MetricaPrueba; diasMin: number; ventasMin: number; accion: 'pausar' | 'avisar';
  estado: 'corriendo' | 'terminada'; ganador: '' | 'a' | 'b' | 'empate'; resumen: string; desde: string; dias: number; terminada: string;
  a: LadoPrueba; b: LadoPrueba; ventaja: number; progreso: string;
}

function deFila(r: Fila): Omit<Prueba, 'a' | 'b' | 'ventaja' | 'progreso' | 'dias'> & { aId: string; aNombre: string; bId: string; bNombre: string } {
  return {
    id: txt(r.id), nombre: txt(r.nombre), nivel: txt(r.nivel) === 'adset' ? 'adset' : 'ad', metrica: txt(r.metrica) === 'roas' ? 'roas' : 'cpa',
    diasMin: num(r.dias_min), ventasMin: num(r.ventas_min), accion: txt(r.accion) === 'avisar' ? 'avisar' : 'pausar',
    estado: txt(r.estado) === 'terminada' ? 'terminada' : 'corriendo', ganador: txt(r.ganador) as Prueba['ganador'], resumen: txt(r.resumen),
    desde: txt(r.desde), terminada: txt(r.terminada), aId: txt(r.a_id), aNombre: txt(r.a_nombre), bId: txt(r.b_id), bNombre: txt(r.b_nombre),
  };
}

/** Métricas de los dos lados desde que empezó la prueba (hasta hoy o hasta que terminó). */
async function medir(storeId: string, p: ReturnType<typeof deFila>): Promise<{ a: LadoPrueba; b: LadoPrueba }> {
  const hasta = p.terminada ? p.terminada.slice(0, 10) : hoyCO();
  const d = await panel(storeId, p.desde, hasta);
  const lado = (id: string, nombre: string): LadoPrueba => {
    const m = p.nivel === 'ad' ? d.anuncios.find((x) => x.id === id) : d.campanas.flatMap((c) => c.conjuntos).find((x) => x.id === id);
    if (!m) return { id, nombre, gasto: 0, ventas: 0, pedidos: 0, cpa: 0, roas: 0, devueltos: 0 };
    return { id, nombre, gasto: m.gasto, ventas: m.ventasEsperadas, pedidos: m.pedidos - m.cancelados, cpa: m.cpa, roas: m.roasNeto, devueltos: m.devueltos };
  };
  return { a: lado(p.aId, p.aNombre), b: lado(p.bId, p.bNombre) };
}

/** Decide la prueba con sus números. Puro: se puede probar sin Meta. */
export function decidir(m: MetricaPrueba, a: LadoPrueba, b: LadoPrueba, dias: number, diasMin: number, ventasMin: number): { ganador: '' | 'a' | 'b' | 'empate'; ventaja: number; progreso: string } {
  // Ventaja del que va mejor, en %.
  const valor = (x: LadoPrueba) => (m === 'cpa' ? x.cpa : x.roas);
  let lider: 'a' | 'b' | '' = '';
  let ventaja = 0;
  if (a.pedidos && b.pedidos) {
    const [va, vb] = [valor(a), valor(b)];
    if (m === 'cpa') { lider = va <= vb ? 'a' : 'b'; ventaja = Math.max(va, vb) ? (Math.max(va, vb) - Math.min(va, vb)) / Math.max(va, vb) : 0; }
    else { lider = va >= vb ? 'a' : 'b'; ventaja = Math.min(va, vb) > 0 ? (Math.max(va, vb) - Math.min(va, vb)) / Math.min(va, vb) : Math.max(va, vb) > 0 ? 1 : 0; }
  } else if (a.pedidos || b.pedidos) { lider = a.pedidos ? 'a' : 'b'; ventaja = 1; }
  const pct = Math.round(ventaja * 100);

  if (dias < diasMin) return { ganador: '', ventaja: pct, progreso: `Día ${dias} de ${diasMin} mínimos.` };
  // Un lado sin ventas que ya gastó 3 veces lo que le cuesta una venta al otro: pierde.
  const sinVentas = !a.pedidos ? a : !b.pedidos ? b : null;
  const otro = sinVentas === a ? b : a;
  if (sinVentas && otro.pedidos >= ventasMin && otro.cpa > 0 && sinVentas.gasto >= otro.cpa * 3) return { ganador: otro === a ? 'a' : 'b', ventaja: 100, progreso: 'Un lado no vendió nada.' };
  if (a.pedidos >= ventasMin && b.pedidos >= ventasMin && lider && ventaja >= MEJORA_MINIMA) return { ganador: lider, ventaja: pct, progreso: `Ganó por ${pct} %.` };
  if (dias >= DIAS_MAXIMOS) return { ganador: 'empate', ventaja: pct, progreso: 'Sin diferencia clara.' };
  const faltan = Math.max(0, ventasMin - a.pedidos) + Math.max(0, ventasMin - b.pedidos);
  return { ganador: '', ventaja: pct, progreso: faltan ? `Faltan ${faltan} venta(s) para decidir.` : `La diferencia (${pct} %) aún no es clara (mínimo ${Math.round(MEJORA_MINIMA * 100)} %).` };
}

export async function listarPruebas(storeId: string): Promise<Prueba[]> {
  const filas = (db.prepare("SELECT * FROM ads_pruebas WHERE store_id = ? ORDER BY estado = 'terminada', creado DESC LIMIT 30").all(storeId) as Fila[]).map(deFila);
  const out: Prueba[] = [];
  for (const p of filas) {
    const { a, b } = await medir(storeId, p);
    const dias = diasEntre(p.desde, p.terminada ? p.terminada.slice(0, 10) : hoyCO());
    const d = decidir(p.metrica, a, b, dias, p.diasMin, p.ventasMin);
    out.push({ ...p, a, b, dias, ventaja: d.ventaja, progreso: p.estado === 'terminada' ? p.resumen : d.progreso });
  }
  return out;
}

/** Anuncios (con gasto en los últimos 30 días) y conjuntos vivos para elegir en el formulario. */
export async function opcionesPrueba(storeId: string) {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const anuncios = db.prepare(`SELECT ad_id id, MAX(ad_name) nombre, MAX(campaign_name) campana, MAX(adset_name) conjunto, SUM(gasto) gasto FROM ads_insights
    WHERE store_id = ? AND fecha >= ? GROUP BY ad_id HAVING gasto > 0 ORDER BY gasto DESC LIMIT 200`).all(storeId, desde) as { id: string; nombre: string; campana: string; conjunto: string; gasto: number }[];
  const e = await estructura(storeId);
  const conjuntos = 'error' in e ? [] : e.campanas.flatMap((c) => c.conjuntos.map((a) => ({ id: a.id, nombre: a.nombre, campana: c.nombre, activa: a.activa && c.activa })));
  return { anuncios, conjuntos };
}

export function crearPrueba(storeId: string, d: { nombre?: string; nivel?: string; aId?: string; aNombre?: string; bId?: string; bNombre?: string; metrica?: string; diasMin?: number; ventasMin?: number; accion?: string }): { ok: true; id: string } | { error: string } {
  const aId = txt(d.aId).trim(), bId = txt(d.bId).trim();
  if (!aId || !bId) return { error: 'Elige los dos lados de la prueba.' };
  if (aId === bId) return { error: 'Elige dos opciones distintas.' };
  if (!/^\d{3,30}$/.test(aId) || !/^\d{3,30}$/.test(bId)) return { error: 'Ese anuncio no es válido.' };
  const nivel = d.nivel === 'adset' ? 'adset' : 'ad';
  const ya = db.prepare("SELECT 1 FROM ads_pruebas WHERE store_id = ? AND estado = 'corriendo' AND (a_id IN (?,?) OR b_id IN (?,?))").get(storeId, aId, bId, aId, bId);
  if (ya) return { error: 'Uno de los dos ya está en otra prueba en curso.' };
  if ((db.prepare("SELECT COUNT(*) n FROM ads_pruebas WHERE store_id = ? AND estado = 'corriendo'").get(storeId) as { n: number }).n >= 10) return { error: 'Máximo 10 pruebas a la vez.' };
  const id = uid();
  const diasMin = Math.min(10, Math.max(2, Math.round(num(d.diasMin) || 3)));
  const ventasMin = Math.min(50, Math.max(2, Math.round(num(d.ventasMin) || 5)));
  const aNombre = txt(d.aNombre).slice(0, 120) || 'Opción A', bNombre = txt(d.bNombre).slice(0, 120) || 'Opción B';
  db.prepare('INSERT INTO ads_pruebas (id, store_id, nombre, nivel, a_id, a_nombre, b_id, b_nombre, metrica, dias_min, ventas_min, accion, desde) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, storeId, txt(d.nombre).slice(0, 80) || `${aNombre} vs ${bNombre}`, nivel, aId, aNombre, bId, bNombre, d.metrica === 'roas' ? 'roas' : 'cpa', diasMin, ventasMin, d.accion === 'avisar' ? 'avisar' : 'pausar', hoyCO());
  return { ok: true, id };
}

export function borrarPrueba(storeId: string, id: string): boolean {
  return db.prepare('DELETE FROM ads_pruebas WHERE id = ? AND store_id = ?').run(id, storeId).changes > 0;
}

/** Cierra la prueba: guarda el resultado, pausa al perdedor (si se pidió) y avisa al celular. */
async function cerrar(storeId: string, p: ReturnType<typeof deFila>, a: LadoPrueba, b: LadoPrueba, d: ReturnType<typeof decidir>, usuario = ''): Promise<void> {
  // Marca primero (evita cerrarla dos veces si dos rondas se cruzan).
  const marca = db.prepare("UPDATE ads_pruebas SET estado = 'terminada', ganador = ?, terminada = datetime('now') WHERE id = ? AND store_id = ? AND estado = 'corriendo'").run(d.ganador || 'empate', p.id, storeId);
  if (!marca.changes) return;
  const fmt = (x: LadoPrueba) => p.metrica === 'cpa' ? `${pesos(x.cpa)} por venta (${x.pedidos} ventas)` : `ROAS esperado ${x.roas} (${x.pedidos} ventas)`;
  let resumen: string;
  let pausa = '';
  if (d.ganador === 'a' || d.ganador === 'b') {
    const gana = d.ganador === 'a' ? a : b, pierde = d.ganador === 'a' ? b : a;
    resumen = `Ganó «${gana.nombre}»: ${fmt(gana)} contra ${fmt(pierde)}.`;
    if (p.accion === 'pausar') {
      const r = p.nivel === 'ad' ? await cambiarEstadoAnuncio(storeId, pierde.id, false, 'prueba A/B', usuario) : await cambiarEstado(storeId, pierde.id, false, 'prueba A/B', usuario);
      pausa = 'error' in r ? ` No pudimos pausar «${pierde.nombre}»: ${r.error}` : ` Pausamos «${pierde.nombre}».`;
    }
  } else {
    resumen = `Sin diferencia clara entre «${a.nombre}» (${fmt(a)}) y «${b.nombre}» (${fmt(b)}). Puedes dejar los dos o quedarte con el más barato.`;
  }
  db.prepare('UPDATE ads_pruebas SET resumen = ? WHERE id = ?').run((resumen + pausa).slice(0, 500), p.id);
  notificar(storeId, `Terminó la prueba A/B «${p.nombre}»`, resumen + pausa);
}

/** Ronda automática (cada 30 min): decide las pruebas que ya tienen resultado. */
export async function revisarPruebas(storeId: string): Promise<number> {
  const filas = (db.prepare("SELECT * FROM ads_pruebas WHERE store_id = ? AND estado = 'corriendo'").all(storeId) as Fila[]).map(deFila);
  let n = 0;
  for (const p of filas) {
    const { a, b } = await medir(storeId, p);
    const d = decidir(p.metrica, a, b, diasEntre(p.desde, hoyCO()), p.diasMin, p.ventasMin);
    if (d.ganador) { await cerrar(storeId, p, a, b, d); n++; }
  }
  return n;
}

/** Termina una prueba a mano, con el resultado que tenga hoy. */
export async function terminarPrueba(storeId: string, id: string, usuario = ''): Promise<{ ok: true } | { error: string }> {
  const r = db.prepare("SELECT * FROM ads_pruebas WHERE id = ? AND store_id = ? AND estado = 'corriendo'").get(id, storeId) as Fila | undefined;
  if (!r) return { error: 'Esa prueba ya terminó o no existe.' };
  const p = deFila(r);
  const { a, b } = await medir(storeId, p);
  const d = decidir(p.metrica, a, b, DIAS_MAXIMOS, 0, 1);
  // A mano solo se pausa al perdedor si la diferencia ya es clara; si no, queda como empate.
  await cerrar(storeId, { ...p, accion: d.ganador === 'empate' ? 'avisar' : p.accion }, a, b, d.ganador ? d : { ...d, ganador: 'empate' }, usuario);
  return { ok: true };
}

/** Copia un conjunto con sus anuncios (queda EN PAUSA) para cambiarle algo y probarlo. */
export async function duplicarConjunto(storeId: string, adsetId: string, usuario = ''): Promise<{ ok: true; id: string } | { error: string }> {
  const c = cuenta(storeId);
  if (!c) return { error: 'Conecta tu Administrador de anuncios.' };
  if (!/^\d{3,30}$/.test(adsetId)) return { error: 'Ese conjunto no es válido.' };
  const e = await estructura(storeId);
  const conj = 'error' in e ? undefined : e.campanas.flatMap((x) => x.conjuntos).find((x) => x.id === adsetId);
  if (!conj) return { error: 'Ese conjunto no es de tu cuenta publicitaria.' };
  const r = await graph<{ copied_adset_id?: string }>(c, `${adsetId}/copies`, 'POST', { deep_copy: 'true', status_option: 'PAUSED', rename_options: JSON.stringify({ rename_suffix: ' (copia A/B)' }) });
  const nuevo = r.ok ? txt(r.body.copied_adset_id) : '';
  anotarCambio(storeId, { objeto: adsetId, nivel: 'adset', nombre: conj.nombre, accion: 'duplicar', antes: '', despues: nuevo ? 'Copia en pausa' : '', origen: 'manual', usuario, ok: r.ok && !!nuevo, error: r.ok ? (nuevo ? '' : 'Meta no devolvió la copia.') : r.error });
  if (!r.ok) return { error: r.error };
  if (!nuevo) return { error: 'Meta no devolvió la copia.' };
  return { ok: true, id: nuevo };
}
