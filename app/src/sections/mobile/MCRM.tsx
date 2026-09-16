import type { DealFlowState } from '../../hooks/useDealFlowState';

export function MCRM({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Móvil CRM">
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Inbox · Chats en vivo</h1>
      <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 12px' }}>Toca un chat para verlo y tomar el control si quieres.</p>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {df.crmChats.map((c) => (
          <div key={c.id} onClick={() => df.openMobileChat(c.id)} style={{ display: 'flex', gap: 11, padding: '13px 14px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}>
            <div style={c.avatarStyle}>{c.iniciales}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</span>
                <span style={{ color: c.sinResponder ? '#059669' : '#94A3B8', fontWeight: c.sinResponder ? 700 : 400, fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{c.fechaHoraLabel}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ color: c.sinResponder ? '#0F172A' : '#64748B', fontWeight: c.sinResponder ? 600 : 400, fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.ultimo}</div>
                {c.sinResponder > 0 && (
                  <span title={`${c.sinResponder} sin responder`} style={{ flexShrink: 0, minWidth: 18, height: 18, borderRadius: 999, background: '#10B981', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.sinResponder}</span>
                )}
              </div>
              <div style={c.liveStyle}>
                <span style={c.liveDot} />
                <span>{c.liveLabel}</span>
                <span style={{ color: '#94A3B8', fontWeight: 500 }}>· atiende {c.asignado}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
