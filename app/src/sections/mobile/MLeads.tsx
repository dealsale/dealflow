import type { DealFlowState } from '../../hooks/useDealFlowState';

export function MLeads({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Móvil Leads">
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Leads</h1>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {df.leads.map((l) => (
          <div key={l.id} style={{ display: 'flex', gap: 11, padding: '13px 14px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={l.avatarStyle}>{l.iniciales}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{l.nombre}</span>
                <span style={{ color: '#94A3B8', fontSize: 11, marginLeft: 'auto' }}>{l.hora}</span>
              </div>
              <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.ultimo}</div>
              <span style={l.etapaStyle}>{l.etapa}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
