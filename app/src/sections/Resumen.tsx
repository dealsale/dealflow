import type { DealFlowState } from '../hooks/useDealFlowState';

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,.04)',
};

const stepCircle = (bg: string, color: string): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: bg,
  color,
  fontWeight: 700,
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export function Resumen({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Resumen">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Hola, {df.saludoNombre} 👋</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 22px' }}>Así va tu tienda hoy, {df.resumenFecha}.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <div onClick={() => df.go('pedidos')} className="df-card-hover-amber" style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Pedidos nuevos</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#F59E0B' }}>{df.newOrdersCount}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>por confirmar</div>
        </div>
        <div style={card}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ventas de hoy</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{df.ventasHoy}</div>
          <div style={{ color: df.ventasComparacionColor, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{df.ventasComparacion}</div>
        </div>
        <div onClick={() => df.go('leads')} className="df-card-hover-green" style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Leads activos</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{df.leadsCount}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>conversaciones abiertas</div>
        </div>
        <div onClick={() => df.go('productos')} className="df-card-hover-green" style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Productos</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{df.productCount}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>en tu catálogo, listos para la IA</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Así trabaja tu asistente</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={stepCircle('#ECFDF5', '#059669')}>1</div>
                <div style={{ width: 2, flex: 1, background: '#E2E8F0', margin: '4px 0' }} />
              </div>
              <div style={{ paddingBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>El cliente escribe a tu WhatsApp</div>
                <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>Pregunta por un producto, un precio o un envío.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={stepCircle('#ECFDF5', '#059669')}>2</div>
                <div style={{ width: 2, flex: 1, background: '#E2E8F0', margin: '4px 0' }} />
              </div>
              <div style={{ paddingBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>El asistente responde y vende</div>
                <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>Usa tu catálogo, tus combos y tus reglas para cerrar la venta.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={stepCircle('#FFFBEB', '#F59E0B')}>3</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>El pedido entra aquí, listo para despachar</div>
                <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>Tú solo lo confirmas y lo avanzas con un toque.</div>
              </div>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Pedidos recientes</span>
            <div style={{ flex: 1 }} />
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                df.go('pedidos');
              }}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              Ver todos
            </a>
          </div>
          {df.recentOrders.map((o) => (
            <div
              key={o.id}
              onClick={o.open}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#64748B' }}>{o.id}</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.cliente}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{o.totalFmt}</span>
              <span style={o.pillStyle}>{o.estado}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
