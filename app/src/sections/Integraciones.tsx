import type { DealFlowState } from '../hooks/useDealFlowState';

export function Integraciones({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Integraciones">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Integraciones</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Conecta DealFlow con las herramientas que ya usas.</p>
      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {df.integrations.map((i) => (
          <div key={i.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={i.logoStyle}>{i.logoText}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{i.nombre}</div>
              <div style={{ flex: 1 }} />
              <span style={i.badgeStyle}>{i.badgeLabel}</span>
            </div>
            <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{i.desc}</div>
            <button onClick={i.action} style={i.btnStyle}>
              {i.btnLabel}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
