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
          background: 'var(--df-surface)',
          borderRadius: '18px 18px 0 0',
          maxHeight: '86%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -12px 40px rgba(15,23,42,.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--df-border)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 18px 12px', borderBottom: '1px solid var(--df-border)' }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600 }}>{sel.id}</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <span onClick={df.closeOrder} style={{ color: 'var(--df-text-muted)', cursor: 'pointer', fontSize: 18, padding: 6 }}>
            ✕
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 13, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{sel.cliente}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 6px' }}>{sel.tel}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{sel.direccion}</div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>{sel.ciudad}</div>
          </div>
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
            {sel.itemsDecorated.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderBottom: '1px solid var(--df-border)' }}>
                <span style={{ background: 'var(--df-surface-2)', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 7px', color: 'var(--df-text-secondary)' }}>{it.qty}×</span>
                <span style={{ fontSize: 13, flex: 1 }}>{it.nombre}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{it.precioFmt}</span>
              </div>
            ))}
            <div style={{ display: 'flex', padding: '11px 13px', fontWeight: 800, fontSize: 15, background: 'var(--df-bg)' }}>
              <span>Total</span>
              <div style={{ flex: 1 }} />
              <span>{sel.totalFmt}</span>
            </div>
          </div>

          {/* Despacho por WooCommerce (Dropi / Effi), igual que en la vista web. */}
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>Despacho por WooCommerce</div>
            {sel.despachado ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: sel.despachoProveedor === 'dropi' ? 'var(--df-warning-subtle)' : 'var(--df-purple-subtle)', color: sel.despachoProveedor === 'dropi' ? 'var(--df-warning)' : 'var(--df-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11.5, flexShrink: 0 }}>{sel.despachoProveedor === 'dropi' ? 'Dr' : 'Ef'}</div>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Enviado por {sel.despachoProveedor === 'dropi' ? 'Dropi' : 'Effi'}</div>
                  <button onClick={sel.sincronizarEffi} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-purple)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}>Actualizar</button>
                </div>
                <div style={{ marginTop: 7, fontSize: 12, color: 'var(--df-text-muted)' }}>
                  Estado en {sel.despachoProveedor === 'dropi' ? 'Dropi' : 'Effi'}: <b style={{ color: 'var(--df-text-strong)' }}>{sel.estadoWoo || 'esperando…'}</b>
                  <span style={{ display: 'block', color: 'var(--df-text-faint)', fontSize: 11, marginTop: 2 }}>Se actualiza solo. Al salir la guía, le avisamos al cliente por WhatsApp.</span>
                </div>
                {sel.hasGuia && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 9 }}>
                    <div style={{ flex: 1, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-strong)' }}>Guía {sel.guia}</div>
                    <button onClick={() => df.copyGuia(sel.guia!)} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-text-strong)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}>{df.guiaBtnLabel}</button>
                  </div>
                )}
                <button onClick={() => sel.reenviarDespacho((sel.despachoProveedor === 'dropi' ? 'dropi' : 'effi'))} style={{ marginTop: 9, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-warning)', cursor: 'pointer' }}>↻ Volver a enviar</button>
              </>
            ) : df.wooProveedores.length === 0 ? (
              <div style={{ color: 'var(--df-text-faint)', fontSize: 13 }}>Conecta una tienda WooCommerce (Effi o Dropi) en Integraciones para despachar.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {df.wooProveedores.includes('dropi') && (
                  <button onClick={() => sel.despachar('dropi')} style={{ background: 'var(--df-warning)', border: 'none', borderRadius: 8, padding: '11px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer', minHeight: 44 }}>Enviar por Dropi</button>
                )}
                {df.wooProveedores.includes('effi') && (
                  <button onClick={() => sel.despachar('effi')} style={{ background: 'var(--df-purple)', border: 'none', borderRadius: 8, padding: '11px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer', minHeight: 44 }}>Enviar por Effi</button>
                )}
              </div>
            )}
            {df.effiMsg && <div style={{ marginTop: 9, fontSize: 12, color: df.effiMsg.startsWith('✓') || df.effiMsg.startsWith('Estado') ? 'var(--df-purple)' : df.effiMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.effiMsg}</div>}
          </div>
        </div>

        <div style={{ padding: '14px 18px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)', borderTop: '1px solid var(--df-border)' }}>
          {/* Estado seleccionable (incluye Cancelado), sin flujo forzado. */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 7 }}>Estado del pedido</div>
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
