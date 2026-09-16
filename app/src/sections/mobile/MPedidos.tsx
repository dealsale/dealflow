import type { DealFlowState } from '../../hooks/useDealFlowState';
import { Dropdown } from '../../components/Dropdown';

export function MPedidos({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Móvil Pedidos">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, flex: 1 }}>Pedidos</h1>
        <button
          onClick={() => df.abrirCrearPedido()}
          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 40, whiteSpace: 'nowrap' }}
        >
          ＋ Crear
        </button>
      </div>
      <input
        className="df-input"
        value={df.orderQuery}
        onChange={(e) => df.setOrderQuery(e.target.value)}
        placeholder="Buscar por cliente o número…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 999, padding: '11px 16px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', minHeight: 44, marginBottom: 10 }}
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
                background: active ? '#0F172A' : 'var(--df-surface)',
                color: active ? '#fff' : 'var(--df-text-muted)',
                border: '1px solid ' + (active ? '#0F172A' : 'var(--df-border)'),
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
            style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-muted)' }}>{o.id}</span>
              <span style={o.pillStyle}>{o.estado}</span>
              <div style={{ flex: 1 }} />
              <span style={{ color: 'var(--df-text-faint)', fontSize: 11.5 }}>{o.hora}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {o.cliente} <span style={{ color: 'var(--df-text-faint)', fontWeight: 400, fontSize: 12.5 }}>· {o.ciudad}</span>
            </div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13, margin: '3px 0 10px' }}>{o.itemsResumen}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{o.totalFmt}</span>
              <div style={{ flex: 1 }} />
              {/* Estado seleccionable (incluye Cancelado), sin flujo forzado. */}
              <div onClick={(e) => e.stopPropagation()}>
                <Dropdown
                  ariaLabel="Cambiar estado del pedido"
                  value={o.estado}
                  onChange={(v) => o.setEstado(v as typeof o.estado)}
                  options={o.estadosDisponibles.map((e) => ({ value: e, label: e }))}
                  width={155}
                />
              </div>
            </div>
          </div>
        ))}
        {df.noOrders && (
          <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 28, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
            {df.orderQuery.trim()
              ? `No encontramos pedidos para «${df.orderQuery.trim()}». Revisa el nombre o el número.`
              : 'No hay pedidos en este estado.'}
          </div>
        )}
      </div>
    </section>
  );
}
