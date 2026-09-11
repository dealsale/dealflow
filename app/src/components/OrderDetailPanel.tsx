import type { DealFlowState } from '../hooks/useDealFlowState';

export function OrderDetailPanel({ df }: { df: DealFlowState }) {
  if (!df.hasSelectedOrder || !df.sel) return null;
  const sel = df.sel;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={df.closeOrder} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)' }} />
      <div style={{ position: 'relative', width: 430, maxWidth: '92%', background: '#fff', height: '100%', boxShadow: '-12px 0 40px rgba(15,23,42,.18)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600 }}>{sel.id}</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <span onClick={df.closeOrder} className="df-close-hover" style={{ color: '#64748B', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>
            ✕
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B', fontSize: 12.5, marginBottom: 14 }}>
            <span>📅</span>
            <span>
              Pedido el <b style={{ color: '#1E293B' }}>{sel.fecha || 'hoy'}</b> a las <b style={{ color: '#1E293B' }}>{sel.hora}</b>
            </span>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Datos de envío</div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { icono: '👤', k: 'Nombre', v: sel.cliente },
              { icono: '📞', k: 'Contacto', v: sel.tel, mono: true },
              { icono: '🏔️', k: 'Departamento', v: sel.departamento || '' },
              { icono: '🏙️', k: 'Ciudad', v: sel.ciudad },
              { icono: '🏡', k: 'Dirección', v: sel.direccion },
              { icono: '💳', k: 'Método de pago', v: 'Contraentrega' },
            ].filter((f) => f.v).map((f) => (
              <div key={f.k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5 }}>
                <span style={{ flexShrink: 0 }}>{f.icono}</span>
                <span style={{ color: '#64748B', fontWeight: 600, minWidth: 118, flexShrink: 0 }}>{f.k}:</span>
                <span style={{ fontWeight: f.k === 'Nombre' ? 700 : 500, fontFamily: f.mono ? "'JetBrains Mono',monospace" : undefined, fontSize: f.mono ? 12.5 : undefined }}>{f.v}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Qué pidió</div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
            {sel.itemsDecorated.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ background: '#F1F5F9', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 8px', color: '#475569' }}>{it.qty}×</span>
                <span style={{ fontSize: 13.5, flex: 1 }}>{it.nombre}</span>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{it.precioFmt}</span>
              </div>
            ))}
            <div style={{ display: 'flex', padding: '11px 14px', background: '#F8FAFC', fontSize: 13, color: '#64748B' }}>
              <span>Envío ({sel.transportadora})</span>
              <div style={{ flex: 1 }} />
              <span>{sel.envioFmt}</span>
            </div>
            <div style={{ display: 'flex', padding: '12px 14px', borderTop: '1px solid #E2E8F0', fontWeight: 800, fontSize: 15 }}>
              <span>Total</span>
              <div style={{ flex: 1 }} />
              <span>{sel.totalFmt}</span>
            </div>
          </div>

          {sel.hasNota && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400E', marginBottom: 18 }}>
              📝 {sel.nota}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Despacho por WooCommerce</div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
            {sel.despachado ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: sel.despachoProveedor === 'dropi' ? '#FEF3C7' : '#EDE9FE', color: sel.despachoProveedor === 'dropi' ? '#B45309' : '#6D28D9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{sel.despachoProveedor === 'dropi' ? 'Dr' : 'Ef'}</div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Enviado por {sel.despachoProveedor === 'dropi' ? 'Dropi' : 'Effi'}</span>
                  <span style={{ display: 'inline-block', background: '#D1FAE5', color: '#047857', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>En WooCommerce</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={sel.sincronizarEffi} style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#6D28D9', cursor: 'pointer', whiteSpace: 'nowrap' }}>Sincronizar estado</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{ color: '#94A3B8', fontSize: 12 }}>¿Algo salió mal en {sel.despachoProveedor === 'dropi' ? 'Dropi' : 'Effi'}?</span>
                  <button onClick={() => sel.reenviarDespacho((sel.despachoProveedor === 'dropi' ? 'dropi' : 'effi'))} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: '#B45309', cursor: 'pointer', whiteSpace: 'nowrap' }}>↻ Volver a enviar</button>
                </div>
                {sel.hasGuia && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                    <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: '#1E293B' }}>Guía {sel.guia}</div>
                    <button onClick={() => df.copyGuia(sel.guia!)} className="df-copy-btn" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap' }}>{df.guiaBtnLabel}</button>
                  </div>
                )}
              </>
            ) : df.wooProveedores.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>Conecta una tienda WooCommerce (Effi o Dropi) en <b>Integraciones</b> para despachar este pedido.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: '#64748B', fontSize: 13, marginRight: 4 }}>Enviar este pedido por:</span>
                {df.wooProveedores.includes('dropi') && (
                  <button onClick={() => sel.despachar('dropi')} style={{ background: '#B45309', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>Enviar por Dropi</button>
                )}
                {df.wooProveedores.includes('effi') && (
                  <button onClick={() => sel.despachar('effi')} style={{ background: '#6D28D9', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>Enviar por Effi</button>
                )}
              </div>
            )}
            {df.effiMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: df.effiMsg.startsWith('✓') || df.effiMsg.startsWith('Estado') ? '#6D28D9' : df.effiMsg.includes('…') ? '#64748B' : '#B91C1C' }}>{df.effiMsg}</div>}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>Avance</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sel.timeline.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0' }}>
                <span style={t.dotStyle} />
                <span style={t.labelStyle}>{t.estado}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #E2E8F0' }}>
          {df.selHasNext && (
            <button
              onClick={df.selAdvance}
              className="df-btn-amber"
              style={{ width: '100%', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 10, padding: 14, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
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
