import type { DealFlowState } from '../../hooks/useDealFlowState';
import logo from '../../assets/logo.png';

export function MobileHeader({ df }: { df: DealFlowState }) {
  return (
    <header
      style={{
        background: '#0F172A',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        flexShrink: 0,
      }}
    >
      <div
        onClick={df.openMenu}
        style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: -10 }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1="4" y1="7" x2="20" y2="7"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="17" x2="20" y2="17"></line>
        </svg>
      </div>
      <img src={logo} alt="DealFlow" style={{ width: 28, height: 25, objectFit: 'contain' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{df.headerTitle}</div>
      </div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: df.waConnected ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)',
          border: '1px solid ' + (df.waConnected ? 'rgba(16,185,129,.4)' : 'rgba(239,68,68,.4)'),
          color: df.waConnected ? '#6EE7B7' : '#FCA5A5',
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: df.waConnected ? '#10B981' : '#EF4444' }} />
        {df.waConnected ? 'Conectado' : 'Sin conexión'}
      </span>
    </header>
  );
}
