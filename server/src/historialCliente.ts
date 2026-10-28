/**
 * Historial de entregas de un cliente por su celular, para saber antes de despachar si suele
 * recibir o devolver los pedidos contra entrega:
 *   - Red DealFlow: pedidos de ese celular en TODAS las tiendas. Solo se comparten CONTEOS
 *     (pedidos, entregados, devueltos, cancelados): nunca la tienda, los productos ni los datos.
 *   - Effi de la tienda: guías de ese cliente en su propia cuenta de Effi (también las que se
 *     hicieron por fuera de DealFlow), con entregadas y devoluciones según el estado global Effi.
 */
import { db, registrarLog } from './db.js';
import { trazar } from './trazabilidad.js';

// Celular normalizado en SQL (sin espacios, +, guiones, paréntesis ni puntos; últimos 10 dígitos).
const TEL10 = "substr(replace(replace(replace(replace(replace(replace(tel,' ',''),'+',''),'-',''),'(',''),')',''),'.',''), -10)";
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_tel10 ON orders(${TEL10})`);

export const celular10 = (t: string) => String(t || '').replace(/\D/g, '').slice(-10);

export interface HistorialRed { pedidos: number; entregados: number; devueltos: number; cancelados: number; enCurso: number }
export interface HistorialEffi { guias: number; entregadas: number; devoluciones: number; conNovedad: number }
export interface Historial { celular: string; red: HistorialRed; effi: HistorialEffi | null; efectividad: number | null; riesgo: 'nuevo' | 'bajo' | 'medio' | 'alto'; resumen: string }

/** Conteos de la red DealFlow para ese celular (sin el pedido actual). */
export function historialRed(celular: string, excluirOrderId = ''): HistorialRed {
  const vacio = { pedidos: 0, entregados: 0, devueltos: 0, cancelados: 0, enCurso: 0 };
  if (celular.length !== 10) return vacio;
  const filas = db.prepare(`SELECT estado, COUNT(*) n FROM orders WHERE ${TEL10} = ? AND id != ? GROUP BY estado`).all(celular, excluirOrderId) as { estado: string; n: number }[];
  const r = { ...vacio };
  for (const f of filas) {
    r.pedidos += f.n;
    if (f.estado === 'Entregado') r.entregados += f.n;
    else if (f.estado === 'Devuelto') r.devueltos += f.n;
    else if (f.estado === 'Cancelado') r.cancelados += f.n;
    else r.enCurso += f.n;
  }
  return r;
}

// Effi se consulta como mucho una vez cada 6 horas por tienda y celular.
const cacheEffi = new Map<string, { t: number; v: HistorialEffi | null }>();

async function historialEffi(storeId: string, celular: string): Promise<HistorialEffi | null> {
  const clave = `${storeId}:${celular}`;
  const c = cacheEffi.get(clave);
  if (c && Date.now() - c.t < 6 * 3600e3) return c.v;
  const ef = await import('./effiApi.js');
  const cfg = ef.cfgEffi(storeId);
  if (!cfg?.apiKey || celular.length !== 10) return null;
  let v: HistorialEffi | null = null;
  try {
    const cli = await ef.effi<Record<string, unknown>[]>(cfg.apiKey, 'GET', '/api/cliente', { query: { t_dni: 2, numero: celular, por_pagina: 1 } });
    const tercero = cli.ok ? String(cli.body.data?.[0]?.tercero ?? '') : '';
    if (!tercero) v = { guias: 0, entregadas: 0, devoluciones: 0, conNovedad: 0 };
    else {
      // Resumen agrupado de Effi: entregadas = estado global 4, devoluciones = 5, novedad = 3.
      const r = await ef.effi<Record<string, unknown>[]>(cfg.apiKey, 'GET', '/api/guia_transporte', { query: { destinatario: tercero, agrupar_por: 'est_guia_efficommerce', desde: '2015-01-01' } });
      if (r.ok) {
        const n = (x: unknown) => Number(x) || 0;
        const tot = ((r.body as unknown as { resumen?: { totales?: Record<string, unknown> } }).resumen?.totales) || null;
        const filas = r.body.data || [];
        const suma = (k: string) => (tot && k in tot ? n(tot[k]) : filas.reduce((a, f) => a + n(f[k]), 0));
        v = { guias: suma('cantidad'), entregadas: suma('entregadas'), devoluciones: suma('devoluciones'), conNovedad: suma('con_novedad') };
      }
    }
  } catch { v = null; }
  cacheEffi.set(clave, { t: Date.now(), v });
  return v;
}

/** Nivel de riesgo con lo que se sabe (red DealFlow + Effi de la tienda, sin sumar duplicados). */
function evaluar(red: HistorialRed, effi: HistorialEffi | null): Pick<Historial, 'efectividad' | 'riesgo' | 'resumen'> {
  const entregados = Math.max(red.entregados, effi?.entregadas || 0);
  const devueltos = Math.max(red.devueltos, effi?.devoluciones || 0);
  const cerrados = entregados + devueltos;
  const efectividad = cerrados ? Math.round((entregados / cerrados) * 100) : null;
  let riesgo: Historial['riesgo'] = 'nuevo';
  if (cerrados || red.pedidos) riesgo = 'bajo';
  if (devueltos >= 1) riesgo = 'medio';
  if (devueltos >= 2 && (efectividad ?? 0) < 60) riesgo = 'alto';
  const resumen = riesgo === 'nuevo'
    ? 'Cliente nuevo: no tiene pedidos anteriores.'
    : `${entregados} entregado${entregados === 1 ? '' : 's'} · ${devueltos} ${devueltos === 1 ? 'devolución' : 'devoluciones'}${efectividad != null ? ` (${efectividad}% efectividad)` : ''}`;
  return { efectividad, riesgo, resumen };
}

export async function historialCliente(storeId: string, orderId: string): Promise<Historial | null> {
  const o = db.prepare('SELECT tel FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as { tel: string } | undefined;
  if (!o) return null;
  const celular = celular10(o.tel);
  const red = historialRed(celular, orderId);
  const effi = await historialEffi(storeId, celular);
  return { celular, red, effi, ...evaluar(red, effi) };
}

/** Al crear un pedido: si el cliente ya ha devuelto pedidos en la red, queda marcado para revisar. */
export function avisarSiRiesgo(storeId: string, orderId: string, tel: string, numero: number | string): void {
  try {
    const red = historialRed(celular10(tel), orderId);
    if (!red.devueltos) return;
    const ev = evaluar(red, null);
    const titulo = `⚠️ Cliente con ${red.devueltos} ${red.devueltos === 1 ? 'devolución' : 'devoluciones'} en la red DealFlow`;
    trazar(storeId, orderId, { etapa: 'pedido', nivel: 'warn', titulo, detalle: `${ev.resumen}. Revisa antes de despachar (confirma por llamada o pide un anticipo).` });
    registrarLog(storeId, 'warn', 'pedido', `DF-${numero}: ${titulo} (${ev.resumen}). Revísalo antes de despachar.`);
  } catch { /* opcional */ }
}
