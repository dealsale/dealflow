import type { DealFlowState } from '../hooks/useDealFlowState';

/** Notificación de pedido entrante: se muestra unos segundos y permite abrirlo directo. */
export function OrderToast({ df, mobile = false }: { df: DealFlowState; mobile?: boolean }) {
  const o = df.incoming;
  if (!o) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 64px)' : 70,
        right: mobile ? 12 : 22,
        left: mobile ? 12 : 'auto',
        width: mobile ? 'auto' : 340,
        zIndex: 80,
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderLeft: '4px solid #F59E0B',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(15,23,42,.18)',
        padding: '12px 14px',
        animation: 'dfslidein .25s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15 }}>🛍️</span>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>Pedido nuevo</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#64748B' }}>{o.id}</span>
        <div style={{ flex: 1 }} />
        <span onClick={df.dismissToast} className="df-close-hover" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 4 }}>
          ✕
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>
        {o.cliente} <span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12 }}>· {o.ciudad}</span>
      </div>
      <div style={{ color: '#64748B', fontSize: 12.5, margin: '2px 0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.itemsResumen}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 14.5 }}>{o.totalFmt}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            o.open();
            df.dismissToast();
          }}
          className="df-btn-amber"
          style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: mobile ? 40 : undefined }}
        >
          Ver pedido
        </button>
      </div>
    </div>
  );
}
