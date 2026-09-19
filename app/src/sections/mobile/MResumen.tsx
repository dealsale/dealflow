import type { DealFlowState } from '../../hooks/useDealFlowState';

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 14 };

export function MResumen({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Móvil Resumen">
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 14px' }}>Hola, {df.saludoNombre} 👋</h1>

      {/* Motivante: ventas del mes. */}
      <div style={{ ...card, border: 'none', color: '#fff', marginBottom: 12, background: 'linear-gradient(135deg, var(--df-brand) 0%, var(--df-brand-dark) 100%)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', opacity: 0.9 }}>Ventas de {df.mesNombre}</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 2 }}>{df.ventasMes}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, opacity: 0.95 }}>{df.ventasMesComparacion}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,.16)', borderRadius: 9, padding: '8px 10px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.9 }}>🧾 Pedidos</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 1 }}>{df.pedidosMesCount}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,.16)', borderRadius: 9, padding: '8px 10px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.9 }}>🎯 Ticket prom.</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 1 }}>{df.ticketPromedio}</div>
          </div>
        </div>
        {df.productoTopMes && (
          <div style={{ fontSize: 12, marginTop: 10, opacity: 0.95 }}>⭐ Producto estrella: <strong>{df.productoTopMes}</strong> ({df.productoTopUnidades})</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div onClick={() => df.go('pedidos')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}>Pedidos nuevos</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--df-warning-mid)' }}>{df.newOrdersCount}</div>
        </div>
        <div style={card}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}>Ventas de hoy</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{df.ventasHoy}</div>
        </div>
        <div onClick={() => df.go('crm')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}>Chats en vivo</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{df.liveCount}</div>
        </div>
        <div onClick={() => df.go('productos')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}>Productos</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{df.productCount}</div>
        </div>
      </div>
      <button
        onClick={() => df.go('pedidos')}
        className="df-btn-amber"
        style={{ width: '100%', background: 'var(--df-warning-mid)', color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
      >
        Ver pedidos por despachar →
      </button>
    </section>
  );
}
