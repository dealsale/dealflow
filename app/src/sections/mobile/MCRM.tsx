import { useLazyList } from '../../hooks/useLazyList';
import type { DealFlowState } from '../../hooks/useDealFlowState';

export function MCRM({ df }: { df: DealFlowState }) {
  // Carga por tandas: solo los primeros ~15 chats montados, más al bajar.
  const { count: visibles, rootRef } = useLazyList(df.crmChats.length, 'movil-crm');
  const chatsVisibles = df.crmChats.slice(0, visibles);
  return (
    <section data-screen-label="Móvil CRM">
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Inbox · Chats en vivo</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 13, margin: '0 0 12px' }}>Toca un chat para verlo y tomar el control si quieres.</p>
      <div ref={rootRef} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, overflow: 'hidden' }}>
        {chatsVisibles.map((c) => (
          <div key={c.id} onClick={() => df.openMobileChat(c.id)} style={{ display: 'flex', gap: 11, padding: '13px 14px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer' }}>
            <div style={c.avatarStyle}>{c.iniciales}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</span>
                <span style={{ color: c.sinResponder ? 'var(--df-brand)' : 'var(--df-text-faint)', fontWeight: c.sinResponder ? 700 : 400, fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{c.fechaHoraLabel}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ color: c.sinResponder ? 'var(--df-text)' : 'var(--df-text-muted)', fontWeight: c.sinResponder ? 600 : 400, fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.ultimo}</div>
                {c.sinResponder > 0 && (
                  <span title={`${c.sinResponder} sin responder`} style={{ flexShrink: 0, minWidth: 18, height: 18, borderRadius: 999, background: 'var(--df-brand-mid)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.sinResponder}</span>
                )}
              </div>
              <div style={c.liveStyle}>
                <span style={c.liveDot} />
                <span>{c.liveLabel}</span>
                <span style={{ color: 'var(--df-text-faint)', fontWeight: 500 }}>· atiende {c.asignado}</span>
              </div>
            </div>
          </div>
        ))}
        {df.crmChats.length > visibles && (
          <div style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--df-text-faint)', fontSize: 12 }}>
            Baja para ver {df.crmChats.length - visibles} chat{df.crmChats.length - visibles === 1 ? '' : 's'} más…
          </div>
        )}
      </div>
    </section>
  );
}
