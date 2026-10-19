import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DecoratedOrder } from '../hooks/useDealFlowState';
import { ESTADOS_TODOS } from '../lib/style';
import { OrigenBadge } from './OrigenPedido';

/**
 * Filtros avanzados de Pedidos (los usan la tabla de escritorio y la lista móvil):
 * búsqueda, estados (varios a la vez), fecha (atajos o rango), canal, despacho,
 * guía, ciudad, producto y rango de valor, más el orden. Se recuerdan en este
 * navegador entre visitas.
 */

export type Orden = 'recientes' | 'antiguos' | 'mayor' | 'menor' | 'cliente';
type FechaRapida = 'todas' | 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'rango';
type Despacho = 'todos' | 'sin' | 'effi' | 'dropi';
type Guia = 'todas' | 'con' | 'sin';

export interface Filtros {
  estados: string[];
  fecha: FechaRapida;
  desde: string;
  hasta: string;
  canales: string[];
  despacho: Despacho;
  guia: Guia;
  ciudad: string;
  producto: string;
  min: string;
  max: string;
  orden: Orden;
}

const VACIOS: Filtros = { estados: [], fecha: 'todas', desde: '', hasta: '', canales: [], despacho: 'todos', guia: 'todas', ciudad: '', producto: '', min: '', max: '', orden: 'recientes' };
const CLAVE = 'df-pedidos-filtros-v1';

export const CANALES: { id: string; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' }, { id: 'instagram', label: 'Instagram' }, { id: 'messenger', label: 'Messenger' },
  { id: 'web', label: 'Chat web' }, { id: 'shopify', label: 'Shopify' }, { id: 'manual', label: 'Manual' },
];
const FECHAS: { id: FechaRapida; label: string }[] = [
  { id: 'todas', label: 'Todas' }, { id: 'hoy', label: 'Hoy' }, { id: 'ayer', label: 'Ayer' }, { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' }, { id: 'mes', label: 'Este mes' }, { id: 'rango', label: 'Rango…' },
];
export const ORDENES: { id: Orden; label: string }[] = [
  { id: 'recientes', label: 'Más recientes' }, { id: 'antiguos', label: 'Más antiguos' }, { id: 'mayor', label: 'Mayor valor' },
  { id: 'menor', label: 'Menor valor' }, { id: 'cliente', label: 'Cliente A-Z' },
];

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const diaBogota = (offset = 0) => new Date(Date.now() - offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
/** Valor del pedido (el acordado o la suma de ítems + envío). */
export const valorPedido = (o: DecoratedOrder) => (o.total && o.total > 0 ? o.total : o.items.reduce((a, it) => a + it.qty * it.precio, 0) + (o.envio || 0));
/** Nombre base del producto de un ítem ("Vestido Helem (M · Azul)" → "Vestido Helem"). */
const productoBase = (nombre: string) => nombre.split('(')[0].split('—')[0].trim();
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "2026-10-16" → "16 oct 2026" (corto, para que quepa en su columna). */
export const fechaCorta = (f?: string) => {
  if (!f) return '';
  const [a, m, d] = f.split('-').map(Number);
  if (!a || !m || !d) return f;
  const hoy = diaBogota(); const ayer = diaBogota(1);
  if (f === hoy) return 'Hoy';
  if (f === ayer) return 'Ayer';
  return `${d} ${MESES[m - 1]}${String(a) === hoy.slice(0, 4) ? '' : ' ' + a}`;
};

export function useFiltrosPedidos(orders: DecoratedOrder[], query: string) {
  const [f, setF] = useState<Filtros>(() => {
    try { const g = JSON.parse(localStorage.getItem(CLAVE) || 'null'); return g ? { ...VACIOS, ...g } : VACIOS; } catch { return VACIOS; }
  });
  useEffect(() => { try { localStorage.setItem(CLAVE, JSON.stringify(f)); } catch { /* sin almacenamiento */ } }, [f]);
  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }));
  const alternar = (k: 'estados' | 'canales', v: string) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const limpiar = () => setF((x) => ({ ...VACIOS, orden: x.orden }));

  // Opciones que salen de los propios pedidos.
  const ciudades = useMemo(() => [...new Set(orders.map((o) => (o.ciudad || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [orders]);
  const productos = useMemo(() => [...new Set(orders.flatMap((o) => o.items.map((it) => productoBase(it.nombre))).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [orders]);

  // Todo menos el estado, para contar cuántos hay de cada estado con los demás filtros puestos.
  const base = useMemo(() => {
    const q = norm(query);
    const hoy = diaBogota();
    const desde = f.fecha === 'hoy' ? hoy : f.fecha === 'ayer' ? diaBogota(1) : f.fecha === '7d' ? diaBogota(6) : f.fecha === '30d' ? diaBogota(29) : f.fecha === 'mes' ? hoy.slice(0, 8) + '01' : f.fecha === 'rango' ? f.desde : '';
    const hasta = f.fecha === 'ayer' ? diaBogota(1) : f.fecha === 'rango' ? f.hasta : '';
    const min = Number(f.min.replace(/\D/g, '')) || 0;
    const max = Number(f.max.replace(/\D/g, '')) || 0;
    const ciudad = norm(f.ciudad); const prod = norm(f.producto);
    return orders.filter((o) => {
      const fecha = o.fecha || hoy;
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (f.canales.length && !f.canales.includes(o.origen || '')) return false;
      if (f.despacho === 'sin' && o.despachado) return false;
      if (f.despacho === 'effi' && o.despachoProveedor !== 'effi') return false;
      if (f.despacho === 'dropi' && o.despachoProveedor !== 'dropi') return false;
      if (f.guia === 'con' && !o.hasGuia) return false;
      if (f.guia === 'sin' && o.hasGuia) return false;
      if (ciudad && norm(o.ciudad) !== ciudad) return false;
      if (prod && !o.items.some((it) => norm(productoBase(it.nombre)) === prod)) return false;
      const v = valorPedido(o);
      if (min && v < min) return false;
      if (max && v > max) return false;
      if (q) {
        const tel = (o.tel || '').replace(/\D/g, '');
        const enTexto = [o.cliente, o.id, o.ciudad, o.departamento || '', o.guia || '', ...o.items.map((it) => it.nombre)].some((t) => norm(t).includes(q));
        if (!enTexto && !(q.replace(/\D/g, '').length >= 4 && tel.includes(q.replace(/\D/g, '')))) return false;
      }
      return true;
    });
  }, [orders, query, f]);

  const conteoEstados = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of base) m[o.estado] = (m[o.estado] || 0) + 1;
    return m;
  }, [base]);

  const filtrados = useMemo(() => {
    const lista = f.estados.length ? base.filter((o) => f.estados.includes(o.estado)) : [...base];
    const clave = (o: DecoratedOrder) => `${o.fecha || ''} ${o.hora || ''} ${o.id.replace(/\D/g, '').padStart(8, '0')}`;
    lista.sort((a, b) =>
      f.orden === 'antiguos' ? clave(a).localeCompare(clave(b))
      : f.orden === 'mayor' ? valorPedido(b) - valorPedido(a)
      : f.orden === 'menor' ? valorPedido(a) - valorPedido(b)
      : f.orden === 'cliente' ? a.cliente.localeCompare(b.cliente, 'es')
      : clave(b).localeCompare(clave(a)));
    return lista;
  }, [base, f.estados, f.orden]);

  // Chips de lo que está filtrando (cada uno se quita con su ✕).
  const activos: { label: string; quitar: () => void }[] = [];
  for (const e of f.estados) activos.push({ label: e, quitar: () => alternar('estados', e) });
  if (f.fecha !== 'todas') activos.push({ label: f.fecha === 'rango' ? `Del ${f.desde || '…'} al ${f.hasta || '…'}` : FECHAS.find((x) => x.id === f.fecha)!.label, quitar: () => set({ fecha: 'todas', desde: '', hasta: '' }) });
  for (const c of f.canales) activos.push({ label: CANALES.find((x) => x.id === c)?.label || c, quitar: () => alternar('canales', c) });
  if (f.despacho !== 'todos') activos.push({ label: f.despacho === 'sin' ? 'Sin despachar' : f.despacho === 'effi' ? 'Por Effi' : 'Por Dropi', quitar: () => set({ despacho: 'todos' }) });
  if (f.guia !== 'todas') activos.push({ label: f.guia === 'con' ? 'Con guía' : 'Sin guía', quitar: () => set({ guia: 'todas' }) });
  if (f.ciudad) activos.push({ label: f.ciudad, quitar: () => set({ ciudad: '' }) });
  if (f.producto) activos.push({ label: f.producto, quitar: () => set({ producto: '' }) });
  if (f.min || f.max) activos.push({ label: `Valor ${f.min ? 'desde $' + Number(f.min).toLocaleString('es-CO') : ''}${f.min && f.max ? ' ' : ''}${f.max ? 'hasta $' + Number(f.max).toLocaleString('es-CO') : ''}`, quitar: () => set({ min: '', max: '' }) });

  const totalValor = filtrados.reduce((a, o) => a + valorPedido(o), 0);
  return { f, set, alternar, limpiar, filtrados, activos, conteoEstados, ciudades, productos, totalValor, totalBase: orders.length };
}

export type FiltrosPedidos = ReturnType<typeof useFiltrosPedidos>;

const chip = (on: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px', borderRadius: 999, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
  border: '1px solid ' + (on ? 'var(--df-text-strong)' : 'var(--df-border)'),
  background: on ? 'var(--df-text-strong)' : 'var(--df-surface)', color: on ? 'var(--df-surface)' : 'var(--df-text-body)',
});
const etiqueta: CSSProperties = { fontSize: 11.5, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 7 };
const campo: CSSProperties = { height: 38, boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)', width: '100%' };

/** Panel de filtros (se abre con el botón "Filtros"). */
export function PanelFiltros({ fp }: { fp: FiltrosPedidos }) {
  const { f, set, alternar } = fp;
  return (
    <div className="df-expand" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 16, marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={etiqueta}>Estado</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ESTADOS_TODOS.map((e) => (
            <button key={e} onClick={() => alternar('estados', e)} style={chip(f.estados.includes(e))}>
              {e} <span style={{ opacity: 0.7 }}>{fp.conteoEstados[e] || 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={etiqueta}>Fecha del pedido</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {FECHAS.map((x) => <button key={x.id} onClick={() => set({ fecha: x.id })} style={chip(f.fecha === x.id)}>{x.label}</button>)}
          {f.fecha === 'rango' && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--df-text-muted)' }}>
              <input type="date" aria-label="Desde" value={f.desde} onChange={(e) => set({ desde: e.target.value })} style={{ ...campo, width: 150 }} />
              a
              <input type="date" aria-label="Hasta" value={f.hasta} onChange={(e) => set({ hasta: e.target.value })} style={{ ...campo, width: 150 }} />
            </span>
          )}
        </div>
      </div>
      <div>
        <div style={etiqueta}>Canal</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CANALES.map((c) => (
            <button key={c.id} onClick={() => alternar('canales', c.id)} style={chip(f.canales.includes(c.id))}>
              <OrigenBadge origen={c.id} size={16} /> {c.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={etiqueta}>Despacho</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {([['todos', 'Todos'], ['sin', 'Sin despachar'], ['effi', 'Effi'], ['dropi', 'Dropi']] as const).map(([id, l]) => <button key={id} onClick={() => set({ despacho: id })} style={chip(f.despacho === id)}>{l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['todas', 'Con o sin guía'], ['con', 'Con guía'], ['sin', 'Sin guía']] as const).map(([id, l]) => <button key={id} onClick={() => set({ guia: id })} style={chip(f.guia === id)}>{l}</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label>
          <div style={etiqueta}>Ciudad</div>
          <select value={f.ciudad} onChange={(e) => set({ ciudad: e.target.value })} style={campo}>
            <option value="">Todas las ciudades</option>
            {fp.ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <div style={etiqueta}>Producto</div>
          <select value={f.producto} onChange={(e) => set({ producto: e.target.value })} style={campo}>
            <option value="">Todos los productos</option>
            {fp.productos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <div>
        <div style={etiqueta}>Valor del pedido</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input inputMode="numeric" aria-label="Valor mínimo" placeholder="Desde $" value={f.min} onChange={(e) => set({ min: e.target.value.replace(/\D/g, '') })} style={campo} />
          <input inputMode="numeric" aria-label="Valor máximo" placeholder="Hasta $" value={f.max} onChange={(e) => set({ max: e.target.value.replace(/\D/g, '') })} style={campo} />
        </div>
      </div>
    </div>
  );
}

/** Fila de chips con lo que se está filtrando + resumen. */
export function ResumenFiltros({ fp }: { fp: FiltrosPedidos }) {
  const pesos = '$' + fp.totalValor.toLocaleString('es-CO');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--df-text-muted)' }}>
        <b style={{ color: 'var(--df-text-strong)' }}>{fp.filtrados.length}</b> de {fp.totalBase} pedidos · <b style={{ color: 'var(--df-text-strong)' }}>{pesos}</b>
      </span>
      {fp.activos.map((a) => (
        <button key={a.label} onClick={a.quitar} title="Quitar este filtro" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 6px 0 10px', borderRadius: 999, border: '1px solid var(--df-brand-border)', background: 'var(--df-brand-subtle)', color: 'var(--df-brand-dark)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {a.label} <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.08)', fontSize: 10 }}>✕</span>
        </button>
      ))}
      {fp.activos.length > 0 && (
        <button onClick={fp.limpiar} style={{ background: 'transparent', border: 'none', color: 'var(--df-text-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Limpiar filtros</button>
      )}
    </div>
  );
}
