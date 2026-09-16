import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { SearchInput, FilterSelect } from '../components/Filters';
import { Dropdown } from '../components/Dropdown';
import { ManualOrderModal } from '../components/ManualOrderModal';

export function Pedidos({ df }: { df: DealFlowState }) {
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const fechaActiva = df.orderDateFilters.find((f) => f.active)?.key || 'Todas';
  const estadoActivo = df.orderFilters.find((f) => f.active)?.key || (df.orderFilters[0]?.key ?? '');
  return (
    <section data-screen-label="Pedidos">
      <ManualOrderModal df={df} open={nuevoOpen} onClose={() => { setNuevoOpen(false); df.setCrearPedidoMsg(''); }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Pedidos</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>Toca un pedido para ver el detalle o cambiarle el estado.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setNuevoOpen(true)}
          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          ＋ Crear pedido
        </button>
        <button
          onClick={df.exportarPedidos}
          title="Descarga todos los pedidos en un archivo de Excel (CSV)"
          style={{ background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          ⬇ Exportar a Excel
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <SearchInput value={df.orderQuery} onChange={df.setOrderQuery} placeholder="Cliente, número o producto…" width={240} />
        <FilterSelect
          label="Estado"
          value={estadoActivo}
          onChange={(k) => df.orderFilters.find((f) => f.key === k)?.set()}
          options={df.orderFilters.map((f) => ({ value: f.key, label: f.label, count: f.count }))}
        />
        <FilterSelect
          label="Fecha"
          value={fechaActiva}
          onChange={(k) => df.orderDateFilters.find((f) => f.key === k)?.set()}
          options={df.orderDateFilters.map((f) => ({ value: f.key, label: f.label === 'Todas' ? 'Todas' : f.label }))}
        />
      </div>

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        {df.filteredOrders.map((o) => (
          <div
            key={o.id}
            onClick={o.open}
            className="df-row-hover"
            style={{ display: 'grid', gridTemplateColumns: '82px 1fr 110px 116px 170px', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer' }}
          >
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: 'var(--df-text-muted)' }}>{o.id}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {o.cliente} <span style={{ color: 'var(--df-text-faint)', fontWeight: 400, fontSize: 12 }}>· {o.ciudad}</span>
              </div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.itemsResumen}</div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{o.totalFmt}</span>
            <span style={o.pillStyle}>{o.estado}</span>
            {/* Estado seleccionable: cambia a cualquiera (incluye Cancelado), sin flujo forzado. */}
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Dropdown
                ariaLabel="Cambiar estado del pedido"
                value={o.estado}
                onChange={(v) => o.setEstado(v as typeof o.estado)}
                options={o.estadosDisponibles.map((e) => ({ value: e, label: e }))}
                width={160}
              />
            </div>
          </div>
        ))}
        {df.noOrders && (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
            {df.orderQuery.trim()
              ? `No encontramos pedidos para «${df.orderQuery.trim()}». Revisa el nombre o el número.`
              : 'No hay pedidos en este estado.'}
          </div>
        )}
      </div>
    </section>
  );
}
