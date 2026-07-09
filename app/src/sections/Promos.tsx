import type { DealFlowState } from '../hooks/useDealFlowState';

export function Promos({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Promos">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Promos</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>El asistente las ofrece solo cuando aplican.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="df-btn-primary" style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          + Nueva promo
        </button>
      </div>
      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {df.promos.map((pr) => (
          <div key={pr.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={pr.badgeStyle}>{pr.tipo}</span>
              <div style={{ flex: 1 }} />
              <span onClick={pr.toggle} style={pr.estadoStyle}>
                {pr.estadoLabel}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{pr.titulo}</div>
            <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>{pr.desc}</div>
            <div style={{ color: '#94A3B8', fontSize: 12 }}>{pr.vigencia}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
