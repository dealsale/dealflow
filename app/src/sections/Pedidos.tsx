import type { DealFlowState } from '../hooks/useDealFlowState';

export function Pedidos({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Pedidos">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Pedidos</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>Toca un pedido para ver el detalle, o avánzalo directo con el botón.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {df.orderFilters.map((f) => (
          <span key={f.key} onClick={f.set} style={f.style}>
            {f.label}
          </span>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        {df.filteredOrders.map((o) => (
          <div
            key={o.id}
            onClick={o.open}
            className="df-row-hover"
            style={{ display: 'grid', gridTemplateColumns: '82px 1fr 110px 116px 170px', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
          >
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: '#64748B' }}>{o.id}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {o.cliente} <span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12 }}>· {o.ciudad}</span>
              </div>
              <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.itemsResumen}</div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{o.totalFmt}</span>
            <span style={o.pillStyle}>{o.estado}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {o.hasNext && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    o.advance();
                  }}
                  className="df-btn-amber"
                  style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', minWidth: 150 }}
                >
                  {o.advanceLabel}
                </button>
              )}
              {o.isDone && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Completado</span>}
            </div>
          </div>
        ))}
        {df.noOrders && <div style={{ padding: 36, textAlign: 'center', color: '#64748B', fontSize: 14 }}>No hay pedidos en este estado.</div>}
      </div>
    </section>
  );
}
