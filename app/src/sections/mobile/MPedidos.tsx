import type { DealFlowState } from '../../hooks/useDealFlowState';

export function MPedidos({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Móvil Pedidos">
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Pedidos</h1>
      <input
        className="df-input"
        value={df.orderQuery}
        onChange={(e) => df.setOrderQuery(e.target.value)}
        placeholder="Buscar por cliente o número…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 999, padding: '11px 16px', fontFamily: 'inherit', fontSize: 13.5, background: '#fff', minHeight: 44, marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 6 }}>
        {df.orderFilters.map((f) => {
          const active = df.filter === f.key;
          return (
            <span
              key={f.key}
              onClick={f.set}
              style={{
                padding: '9px 15px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: active ? '#0F172A' : '#fff',
                color: active ? '#fff' : '#64748B',
                border: '1px solid ' + (active ? '#0F172A' : '#E2E8F0'),
              }}
            >
              {f.key}
            </span>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {df.filteredOrders.map((o) => (
          <div
            key={o.id}
            onClick={o.open}
            style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#64748B' }}>{o.id}</span>
              <span style={o.pillStyle}>{o.estado}</span>
              <div style={{ flex: 1 }} />
              <span style={{ color: '#94A3B8', fontSize: 11.5 }}>{o.hora}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {o.cliente} <span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12.5 }}>· {o.ciudad}</span>
            </div>
            <div style={{ color: '#64748B', fontSize: 13, margin: '3px 0 10px' }}>{o.itemsResumen}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{o.totalFmt}</span>
              <div style={{ flex: 1 }} />
              {o.hasNext && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    o.advance();
                  }}
                  className="df-btn-amber"
                  style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44 }}
                >
                  {o.advanceLabel}
                </button>
              )}
              {o.isDone && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Completado</span>}
            </div>
          </div>
        ))}
        {df.noOrders && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 28, textAlign: 'center', color: '#64748B', fontSize: 14 }}>
            {df.orderQuery.trim()
              ? `No encontramos pedidos para «${df.orderQuery.trim()}». Revisa el nombre o el número.`
              : 'No hay pedidos en este estado.'}
          </div>
        )}
      </div>
    </section>
  );
}
