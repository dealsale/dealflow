import type { DealFlowState } from '../../hooks/useDealFlowState';

export function MobileOrderSheet({ df }: { df: DealFlowState }) {
  if (!df.hasSelectedOrder || !df.sel) return null;
  const sel = df.sel;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={df.closeOrder} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)' }} />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: '18px 18px 0 0',
          maxHeight: '86%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -12px 40px rgba(15,23,42,.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: '#E2E8F0' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 18px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600 }}>{sel.id}</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <span onClick={df.closeOrder} style={{ color: '#64748B', cursor: 'pointer', fontSize: 18, padding: 6 }}>
            ✕
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 13, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{sel.cliente}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#64748B', margin: '2px 0 6px' }}>{sel.tel}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{sel.direccion}</div>
            <div style={{ color: '#64748B', fontSize: 13 }}>{sel.ciudad}</div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
            {sel.itemsDecorated.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ background: '#F1F5F9', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 7px', color: '#475569' }}>{it.qty}×</span>
                <span style={{ fontSize: 13, flex: 1 }}>{it.nombre}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{it.precioFmt}</span>
              </div>
            ))}
            <div style={{ display: 'flex', padding: '11px 13px', fontWeight: 800, fontSize: 15, background: '#F8FAFC' }}>
              <span>Total</span>
              <div style={{ flex: 1 }} />
              <span>{sel.totalFmt}</span>
            </div>
          </div>

          <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FEF3C7', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11.5, flexShrink: 0 }}>
              Dr
            </div>
            {sel.hasGuia ? (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Dropi · guía generada</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#64748B' }}>Guía {sel.guia}</div>
                </div>
                <button
                  onClick={() => df.copyGuia(sel.guia!)}
                  style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}
                >
                  {df.guiaBtnLabel}
                </button>
              </>
            ) : (
              <>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Dropi · sin guía</div>
                <button
                  onClick={sel.sendToDropi}
                  style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}
                >
                  Enviar a Dropi
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ padding: '14px 18px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)', borderTop: '1px solid #F1F5F9' }}>
          {df.selHasNext && (
            <button
              onClick={df.selAdvance}
              className="df-btn-amber"
              style={{ width: '100%', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 12, padding: 16, fontFamily: 'inherit', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}
            >
              {df.selAdvanceLabel}
            </button>
          )}
          {df.selIsDone && <div style={{ textAlign: 'center', color: '#059669', fontWeight: 700, fontSize: 14 }}>✓ Pedido entregado. Nada pendiente.</div>}
        </div>
      </div>
    </div>
  );
}
