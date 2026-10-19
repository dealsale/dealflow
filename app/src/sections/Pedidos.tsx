import { useState } from 'react';
import type { CSSProperties } from 'react';
import { OrigenBadge } from '../components/OrigenPedido';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { SearchInput } from '../components/Filters';
import { Dropdown } from '../components/Dropdown';
import { confirmar } from '../components/dialogs';
import { useFiltrosPedidos, PanelFiltros, ResumenFiltros, ORDENES, fechaCorta, valorPedido, type Orden } from '../components/PedidosFiltros';

// Columnas fijas tipo Excel: cada dato en su celda, nada se monta sobre otra columna.
const COLS = '118px 54px minmax(160px, 1.1fr) minmax(110px, .7fr) minmax(190px, 1.5fr) 104px 138px 146px 32px';
const celda: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export function Pedidos({ df }: { df: DealFlowState }) {
  const fp = useFiltrosPedidos(df.allOrders, df.orderQuery);
  const [abierto, setAbierto] = useState(false);
  const n = fp.activos.length;

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
        <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Ordenar</span>
        <Dropdown ariaLabel="Ordenar pedidos" value={fp.f.orden} onChange={(v) => fp.set({ orden: v as Orden })} options={ORDENES.map((o) => ({ value: o.id, label: o.label }))} width={170} />
      </div>

      {abierto && <PanelFiltros fp={fp} />}
      <ResumenFiltros fp={fp} />

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', overflowX: 'auto' }}>
        <div style={{ minWidth: 1090 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid var(--df-border)', background: 'var(--df-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
            {th('Pedido', ['antiguos', 'recientes'])}
            <span style={{ ...thStyle, textAlign: 'center' }}>Canal</span>
            {th('Cliente', ['cliente', 'cliente'])}
            {th('Ciudad')}
            {th('Productos')}
            {th('Total', ['menor', 'mayor'], 'right')}
            {th('Despacho')}
            {th('Estado')}
            <span />
          </div>
          {fp.filtrados.map((o) => <Fila key={o.id} o={o} />)}
          {fp.filtrados.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
              {df.orderQuery.trim() || n ? 'Ningún pedido coincide con la búsqueda o los filtros.' : 'Todavía no hay pedidos.'}
              {n > 0 && <div style={{ marginTop: 10 }}><button onClick={fp.limpiar} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--df-text-body)' }}>Limpiar filtros</button></div>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const thStyle: CSSProperties = { fontSize: 11.5, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'block' };

function Fila({ o }: { o: DecoratedOrder }) {
  const prov = o.despachoProveedor === 'effi' ? 'Effi' : o.despachoProveedor === 'dropi' ? 'Dropi' : '';
  return (
    <div
      onClick={o.open}
      className="df-row-hover"
      style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer' }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ ...celda, fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: 'var(--df-text-strong)', fontWeight: 600 }}>{o.id}</div>
        <div style={{ ...celda, fontSize: 11.5, color: 'var(--df-text-muted)', marginTop: 2 }}>{fechaCorta(o.fecha)}{o.hora ? ` · ${o.hora}` : ''}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}><OrigenBadge origen={o.origen} size={22} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...celda, fontWeight: 700, fontSize: 14 }} title={o.cliente}>{o.cliente}</div>
        <div style={{ ...celda, fontSize: 12, color: 'var(--df-text-muted)', fontFamily: "'JetBrains Mono',monospace" }}>{o.tel}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...celda, fontSize: 13, fontWeight: 600 }} title={o.ciudad}>{o.ciudad || '—'}</div>
        {o.departamento && <div style={{ ...celda, fontSize: 11.5, color: 'var(--df-text-muted)' }}>{o.departamento}</div>}
      </div>
      <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.35, color: 'var(--df-text-body)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={o.itemsResumen}>{o.itemsResumen}</div>
      <div style={{ ...celda, fontWeight: 800, fontSize: 14, textAlign: 'right' }}>${valorPedido(o).toLocaleString('es-CO')}</div>
      <div style={{ minWidth: 0 }}>
        {prov ? (
          <>
            <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 800, borderRadius: 6, padding: '2px 7px', background: prov === 'Effi' ? 'var(--df-purple-subtle)' : 'var(--df-warning-subtle)', color: prov === 'Effi' ? 'var(--df-purple)' : 'var(--df-warning)' }}>{prov}</span>
            <div style={{ ...celda, fontSize: 11.5, color: o.hasGuia ? 'var(--df-text-body)' : 'var(--df-text-muted)', marginTop: 3, fontFamily: o.hasGuia ? "'JetBrains Mono',monospace" : 'inherit' }} title={o.guia || ''}>{o.hasGuia ? o.guia : 'esperando guía'}</div>
          </>
        ) : <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Sin despachar</span>}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
        <Dropdown
          ariaLabel="Estado del pedido"
          value={o.estado}
          onChange={(v) => o.setEstado(v as typeof o.estado)}
          options={o.estadosDisponibles.map((e) => ({ value: e, label: e }))}
          width={140}
        />
      </div>
      <button
        onClick={async (e) => { e.stopPropagation(); if (await confirmar({ titulo: `Eliminar ${o.id}`, mensaje: 'Esto solo lo quita del panel; no cancela nada en Dropi/Effi.', aceptar: 'Eliminar', peligro: true })) o.eliminar(); }}
        title="Eliminar pedido"
        aria-label={`Eliminar ${o.id}`}
        className="df-danger-hover"
        style={{ background: 'transparent', border: 'none', color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 15, padding: 4 }}
      >🗑</button>
    </div>
  );
}
