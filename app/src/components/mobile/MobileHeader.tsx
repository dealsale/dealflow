import type { DealFlowState } from '../../hooks/useDealFlowState';
import logo from '../../assets/logo.png';
import { NotificationsMenu } from '../NotificationsMenu';
import { ProfileMenu } from '../ProfileMenu';

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
      <img src={logo} alt="DealFlow" style={{ width: 28, height: 25, objectFit: 'contain', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{df.headerTitle}</div>
      </div>
      <NotificationsMenu df={df} />
      <ProfileMenu df={df} onDarkBar />
    </header>
  );
}
