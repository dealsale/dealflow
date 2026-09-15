import type { DealFlowState } from '../../hooks/useDealFlowState';
import { Dropdown } from '../Dropdown';

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

          {/* Despacho por WooCommerce (Dropi / Effi), igual que en la vista web. */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>Despacho por WooCommerce</div>
            {sel.despachado ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: sel.despachoProveedor === 'dropi' ? '#FEF3C7' : '#EDE9FE', color: sel.despachoProveedor === 'dropi' ? '#B45309' : '#6D28D9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11.5, flexShrink: 0 }}>{sel.despachoProveedor === 'dropi' ? 'Dr' : 'Ef'}</div>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Enviado por {sel.despachoProveedor === 'dropi' ? 'Dropi' : 'Effi'}</div>
                  <button onClick={sel.sincronizarEffi} style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: '#6D28D9', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}>Sincronizar</button>
                </div>
                {sel.hasGuia && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 9 }}>
                    <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 11px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#1E293B' }}>Guía {sel.guia}</div>
                    <button onClick={() => df.copyGuia(sel.guia!)} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}>{df.guiaBtnLabel}</button>
                  </div>
                )}
                <button onClick={() => sel.reenviarDespacho((sel.despachoProveedor === 'dropi' ? 'dropi' : 'effi'))} style={{ marginTop: 9, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: '#B45309', cursor: 'pointer' }}>↻ Volver a enviar</button>
              </>
            ) : df.wooProveedores.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>Conecta una tienda WooCommerce (Effi o Dropi) en Integraciones para despachar.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {df.wooProveedores.includes('dropi') && (
                  <button onClick={() => sel.despachar('dropi')} style={{ background: '#B45309', border: 'none', borderRadius: 8, padding: '11px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer', minHeight: 44 }}>Enviar por Dropi</button>
                )}
                {df.wooProveedores.includes('effi') && (
                  <button onClick={() => sel.despachar('effi')} style={{ background: '#6D28D9', border: 'none', borderRadius: 8, padding: '11px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer', minHeight: 44 }}>Enviar por Effi</button>
                )}
              </div>
            )}
            {df.effiMsg && <div style={{ marginTop: 9, fontSize: 12, color: df.effiMsg.startsWith('✓') || df.effiMsg.startsWith('Estado') ? '#6D28D9' : df.effiMsg.includes('…') ? '#64748B' : '#B91C1C' }}>{df.effiMsg}</div>}
          </div>
        </div>

        <div style={{ padding: '14px 18px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)', borderTop: '1px solid #F1F5F9' }}>
          {/* Estado seleccionable (incluye Cancelado), sin flujo forzado. */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 7 }}>Estado del pedido</div>
          <Dropdown
            ariaLabel="Cambiar estado del pedido"
            value={sel.estado}
            onChange={(v) => sel.setEstado(v as typeof sel.estado)}
            options={sel.estadosDisponibles.map((e) => ({ value: e, label: e }))}
          />
        </div>
      </div>
    </div>
  );
}
