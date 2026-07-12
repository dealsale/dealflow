import type { DealFlowState } from '../../hooks/useDealFlowState';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14 };

export function MResumen({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Móvil Resumen">
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 14px' }}>Hola, {df.saludoNombre} 👋</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div onClick={() => df.go('pedidos')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600 }}>Pedidos nuevos</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#F59E0B' }}>{df.newOrdersCount}</div>
        </div>
        <div style={card}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600 }}>Ventas de hoy</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{df.ventasHoy}</div>
        </div>
        <div onClick={() => df.go('crm')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600 }}>Chats en vivo</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{df.liveCount}</div>
        </div>
        <div onClick={() => df.go('productos')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600 }}>Productos</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{df.productCount}</div>
        </div>
      </div>
      <button
        onClick={() => df.go('pedidos')}
        className="df-btn-amber"
        style={{ width: '100%', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
      >
        Ver pedidos por despachar →
      </button>
    </section>
  );
}
