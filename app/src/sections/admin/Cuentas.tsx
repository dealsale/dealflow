import type { DealFlowState } from '../../hooks/useDealFlowState';

export function Cuentas({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Admin Cuentas">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Cuentas</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Activa o desactiva cuentas con el interruptor. El cambio aplica al instante.</p>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        {df.accounts.map((a) => (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 110px 60px', gap: 14, alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.tienda}</div>
              <div style={{ color: '#94A3B8', fontSize: 12 }}>{a.correo}</div>
            </div>
            <span style={{ fontSize: 13, color: '#64748B' }}>Plan {a.plan}</span>
            <span style={a.estadoStyle}>{a.estadoLabel}</span>
            <div onClick={a.toggle} style={a.switchStyle}>
              <div style={a.knobStyle} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
