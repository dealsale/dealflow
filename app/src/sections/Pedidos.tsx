import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { OrigenBadge } from '../components/OrigenPedido';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { SearchInput } from '../components/Filters';
import { Dropdown } from '../components/Dropdown';
import { confirmar } from '../components/dialogs';
import { NovedadesBandeja } from '../components/Novedades';
import { useFiltrosPedidos, PanelFiltros, ResumenFiltros, ORDENES, fechaCorta, valorPedido, type Orden } from '../components/PedidosFiltros';

// Columnas tipo Excel: cada dato en su celda. Una sola tabla que se acomoda al
// ancho disponible (portátil incluido); en pantallas angostas, tarjetas.
type Modo = 'tabla' | 'tarjetas';
const COLS = 'minmax(124px, .75fr) minmax(150px, 1.2fr) minmax(150px, 1.4fr) 100px minmax(160px, 1.1fr) minmax(128px, .85fr) 28px';
const modoPara = (ancho: number): Modo => (ancho >= 920 ? 'tabla' : 'tarjetas');
const celda: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export function Pedidos({ df }: { df: DealFlowState }) {
  const fp = useFiltrosPedidos(df.allOrders, df.orderQuery);
  const [abierto, setAbierto] = useState(false);
  const n = fp.activos.length;
  // Ancho real del área de la tabla (no de la ventana): cambia con el menú lateral abierto o cerrado.
  const cajaRef = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<Modo>('tabla');
  useEffect(() => {
    const el = cajaRef.current; if (!el) return;
    const medir = () => setModo(modoPara(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Encabezado ordenable: un toque ordena por esa columna; otro invierte.
  const ordenarPor = (asc: Orden, desc: Orden) => fp.set({ orden: fp.f.orden === desc ? asc : desc });
  const flecha = (asc: Orden, desc: Orden) => (fp.f.orden === desc ? ' ↓' : fp.f.orden === asc ? ' ↑' : '');
  const th = (label: string, sort?: [Orden, Orden], align: 'left' | 'right' = 'left') => (
    sort
      ? <button onClick={() => ordenarPor(sort[0], sort[1])} style={{ ...thStyle, textAlign: align, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, fontFamily: 'inherit' }}>{label}{flecha(sort[0], sort[1])}</button>
      : <span style={{ ...thStyle, textAlign: align }}>{label}</span>
  );

  return (
    <section data-screen-label="Pedidos">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Pedidos</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>Filtra, ordena y toca un pedido para ver el detalle.</p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'nowrap' }}>
        <button onClick={() => df.abrirCrearPedido()} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ＋ Crear pedido
        </button>
        <button
          onClick={() => df.exportarPedidos(fp.filtrados.map((o) => o.id))}
          title="Descarga en Excel (CSV) los pedidos que estás viendo con los filtros actuales"
          style={{ background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          ⬇ Exportar {fp.filtrados.length} a Excel
        </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <SearchInput value={df.orderQuery} onChange={df.setOrderQuery} placeholder="Cliente, teléfono, número, producto o guía…" width={320} />
        <button
          onClick={() => setAbierto((x) => !x)}
          aria-expanded={abierto}
          style={{ height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid ' + (n ? 'var(--df-brand)' : 'var(--df-border)'), background: n ? 'var(--df-brand-subtle)' : 'var(--df-surface)', color: n ? 'var(--df-brand-dark)' : 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Filtros{n ? ` (${n})` : ''} {abierto ? '▴' : '▾'}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Ordenar</span>
          <Dropdown ariaLabel="Ordenar pedidos" value={fp.f.orden} onChange={(v) => fp.set({ orden: v as Orden })} options={ORDENES.map((o) => ({ value: o.id, label: o.label }))} width={170} />
        </span>
      </div>

      <NovedadesBandeja df={df} />
      {abierto && <PanelFiltros fp={fp} />}
      <ResumenFiltros fp={fp} />

      <div ref={cajaRef} style={modo === 'tarjetas' ? undefined : { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', overflow: 'hidden' }}>
        {modo !== 'tarjetas' && (
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--df-border)', background: 'var(--df-surface-2)' }}>
            {th('Pedido', ['antiguos', 'recientes'])}
            {th('Cliente', ['cliente', 'cliente'])}
            {th('Productos')}
            {th('Total', ['menor', 'mayor'], 'right')}
            {th('Despacho')}
            {th('Estado guía')}
            <span />
          </div>
        )}
        <div style={modo === 'tarjetas' ? { display: 'flex', flexDirection: 'column', gap: 10 } : undefined}>
          {fp.filtrados.map((o) => <Fila key={o.id} o={o} modo={modo} />)}
        </div>
        {fp.filtrados.length === 0 && (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14, ...(modo === 'tarjetas' ? { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12 } : {}) }}>
            {df.orderQuery.trim() || n ? 'Ningún pedido coincide con la búsqueda o los filtros.' : 'Todavía no hay pedidos.'}
            {n > 0 && <div style={{ marginTop: 10 }}><button onClick={fp.limpiar} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--df-text-body)' }}>Limpiar filtros</button></div>}
          </div>
        )}
      </div>
    </section>
  );
}

const thStyle: CSSProperties = { fontSize: 11.5, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'block' };

// Texto literal de la transportadora, solo si dice algo más que el estado.
// ("Generada" con estado "Guía generada", o "EN TRANSITO" con "En tránsito", no se repiten).
const sinTildes = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const textoGuia = (o: DecoratedOrder) => {
  const w = sinTildes(o.estadoWoo || ''); const e = sinTildes(o.estado);
  return w && w !== e && !e.includes(w) && !w.includes(e) ? o.estadoWoo || '' : '';
};

function Fila({ o, modo }: { o: DecoratedOrder; modo: Modo }) {
  const prov = o.despachoProveedor === 'effi' ? 'Effi' : o.despachoProveedor === 'dropi' ? 'Dropi' : '';
  const fecha = `${fechaCorta(o.fecha)}${o.hora ? ` · ${o.hora}` : ''}`;
  const numero = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <OrigenBadge origen={o.origen} size={24} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...celda, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--df-text-strong)', fontWeight: 700 }}>{o.id}</div>
        <div style={{ ...celda, fontSize: 11.5, color: 'var(--df-text-muted)', marginTop: 2 }}>{fecha}</div>
      </div>
    </div>
  );
  const cliente = (
    <div style={{ minWidth: 0 }} title={`${o.cliente}${o.tel ? ` · ${o.tel}` : ''}`}>
      <div style={{ ...celda, fontWeight: 700, fontSize: 14, color: 'var(--df-text-strong)' }}>{o.cliente}</div>
      <div style={{ ...celda, fontSize: 12, color: 'var(--df-text-muted)', marginTop: 2 }}>{o.ciudad || '—'}{o.departamento ? ` · ${o.departamento}` : ''}</div>
    </div>
  );
  const productos = <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.4, color: 'var(--df-text-body)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={o.itemsResumen}>{o.itemsResumen}</div>;
  const total = <div style={{ ...celda, fontWeight: 800, fontSize: 14.5, textAlign: 'right', color: 'var(--df-text-strong)', fontVariantNumeric: 'tabular-nums' }}>${valorPedido(o).toLocaleString('es-CO')}</div>;
  // Despacho: proveedor, transportadora y número de guía.
  const despacho = (
    <div style={{ minWidth: 0, fontSize: 12 }}>
      {prov ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 5, padding: '1px 6px', flexShrink: 0, background: prov === 'Effi' ? 'var(--df-purple-subtle)' : 'var(--df-warning-subtle)', color: prov === 'Effi' ? 'var(--df-purple)' : 'var(--df-warning)' }}>{prov}</span>
            {o.transportadora && o.transportadora !== prov && <span style={{ ...celda, fontWeight: 700, color: 'var(--df-text-body)' }} title={o.transportadora}>{o.transportadora}</span>}
          </div>
          <div style={{ ...celda, marginTop: 4, color: o.hasGuia ? 'var(--df-text-secondary)' : 'var(--df-text-faint)', fontFamily: o.hasGuia ? "'JetBrains Mono',monospace" : 'inherit', fontSize: 11.5 }} title={o.guia || ''}>{o.hasGuia ? o.guia : 'esperando guía'}</div>
        </>
      ) : <span style={{ color: 'var(--df-text-faint)' }}>Sin despachar</span>}
    </div>
  );
  // Estado de la guía (solo lectura): lo sincroniza Effi/Dropi. A mano, dentro del pedido.
  const detalle = textoGuia(o);
  const estado = (
    <div style={{ minWidth: 0 }} title={o.estadoWoo ? `Transportadora: ${o.estadoWoo}` : undefined}>
      <span className="df-estado-pill" style={{ ...o.pillStyle, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', verticalAlign: 'middle' }}>{o.estado}</span>
      {detalle && <div style={{ ...celda, fontSize: 11.5, color: 'var(--df-text-muted)', marginTop: 4 }}>{detalle}</div>}
    </div>
  );
  const borrar = (
    <button
      onClick={async (e) => { e.stopPropagation(); if (await confirmar({ titulo: `Eliminar ${o.id}`, mensaje: 'Esto solo lo quita del panel; no cancela nada en Dropi/Effi.', aceptar: 'Eliminar', peligro: true })) o.eliminar(); }}
      title="Eliminar pedido"
      aria-label={`Eliminar ${o.id}`}
      className="df-danger-hover"
      style={{ background: 'transparent', border: 'none', color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 15, padding: 2 }}
    >🗑</button>
  );

  if (modo === 'tarjetas') {
    return (
      <div onClick={o.open} className="df-row-hover df-card" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{numero}</div>
          {total}
        </div>
        {cliente}
        {productos}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--df-border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>{despacho}</div>
          <div style={{ flexShrink: 0, maxWidth: '45%' }}>{estado}</div>
          {borrar}
        </div>
      </div>
    );
  }
  return (
    <div onClick={o.open} className="df-row-hover" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer' }}>
      {numero}
      {cliente}
      {productos}
      {total}
      {despacho}
      {estado}
      {borrar}
    </div>
  );
}
