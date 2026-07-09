import type { DealFlowState } from '../hooks/useDealFlowState';

export function Header({ df }: { df: DealFlowState }) {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 28px', height: 58, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <span style={{ fontWeight: 700, fontSize: 15 }}>{df.headerTitle}</span>
      {df.isVendedor && (
        <span style={df.waPill}>
          <span style={df.waDot} />
          {df.waLabel}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#64748B', fontSize: 13 }}>{df.userLabel}</span>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
          {df.userInitials}
        </div>
      </div>
    </header>
  );
}
