import { useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { Dropdown } from '../Dropdown';
import { DropiDespacho } from '../OrderDetailPanel';

export function MobileOrderSheet({ df }: { df: DealFlowState }) {
  const [transp, setTransp] = useState('');
  const [redespachar, setRedespachar] = useState(false);
  if (!df.hasSelectedOrder || !df.sel) return null;
  const sel = df.sel;
  const transpOpts = [{ value: '', label: 'Transportadora (opcional)' }, ...df.wooTransportadoras.map((t) => ({ value: t, label: t }))];
  const carrierElegido = transp || df.wooTransportadora || '';
  const dropiCreado = sel.despachoProveedor === 'dropi';

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

          {/* Despacho: Dropi por API, Effi por WooCommerce. */}
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>Despacho</div>
            {sel.despachado && !redespachar ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: dropiCreado ? 'var(--df-warning-subtle)' : 'var(--df-purple-subtle)', color: dropiCreado ? 'var(--df-warning)' : 'var(--df-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11.5, flexShrink: 0 }}>{dropiCreado ? 'Dr' : 'Ef'}</div>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>Enviado por {dropiCreado ? 'Dropi' : 'Effi'}{sel.transportadora ? ` · 🚚 ${sel.transportadora}` : ''}</div>
                  <button onClick={sel.sincronizarEffi} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-purple)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}>Actualizar</button>
                </div>
                <div style={{ marginTop: 7, fontSize: 12, color: 'var(--df-text-muted)' }}>
                  Estado en {dropiCreado ? 'Dropi' : 'Effi'}: <b style={{ color: 'var(--df-text-strong)' }}>{sel.estadoWoo || 'esperando…'}</b>
                  <span style={{ display: 'block', color: 'var(--df-text-faint)', fontSize: 11, marginTop: 2 }}>Se actualiza solo. Al salir la guía, le avisamos al cliente por WhatsApp.</span>
                </div>
                {sel.hasGuia && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 9, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 120, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-strong)' }}>Guía {sel.guia}</div>
                    <button onClick={() => df.copyGuia(sel.guia!)} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-text-strong)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}>{df.guiaBtnLabel}</button>
                    {sel.guiaUrl && <a href={sel.guiaUrl} target="_blank" rel="noreferrer" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-purple)', textDecoration: 'none', minHeight: 40, display: 'inline-flex', alignItems: 'center' }}>PDF</a>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!dropiCreado && (
                    <button onClick={() => sel.reenviarDespacho('effi', sel.transportadora || carrierElegido)} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-warning)', cursor: 'pointer' }}>↻ Volver a enviar</button>
                  )}
                  <button onClick={() => setRedespachar(true)} style={{ background: 'transparent', border: 'none', color: 'var(--df-purple)', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>Cambiar despacho</button>
                </div>
              </>
            ) : !df.dropiConectado && !df.wooProveedores.includes('effi') ? (
              <div style={{ color: 'var(--df-text-faint)', fontSize: 13 }}>Conecta <b>Dropi (API)</b> o el <b>WooCommerce de Effi</b> en Integraciones para despachar.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {redespachar && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', flex: 1 }}>Volver a despachar:</span>
                    <button onClick={() => setRedespachar(false)} style={{ background: 'transparent', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-text-muted)', cursor: 'pointer' }}>Cancelar</button>
                  </div>
                )}
                {df.dropiConectado && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Despachar por Dropi</div>
                    <DropiDespacho df={df} sel={sel} onHecho={() => setRedespachar(false)} />
                  </div>
                )}
                {df.wooProveedores.includes('effi') && (
                  <div style={{ borderTop: df.dropiConectado ? '1px solid var(--df-border)' : 'none', paddingTop: df.dropiConectado ? 10 : 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Despachar por Effi</div>
                    <div style={{ marginBottom: 9 }}>
                      <Dropdown ariaLabel="Transportadora Effi" value={carrierElegido} onChange={setTransp} options={transpOpts} placeholder="Transportadora (opcional)" />
                    </div>
                    <button onClick={() => { sel.despachar('effi', carrierElegido); setRedespachar(false); }} style={{ background: 'var(--df-purple)', border: 'none', borderRadius: 8, padding: '11px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer', minHeight: 44 }}>Enviar por Effi</button>
                    {df.effiMsg && <div style={{ marginTop: 9, fontSize: 12, color: df.effiMsg.startsWith('✓') || df.effiMsg.startsWith('Estado') ? 'var(--df-purple)' : df.effiMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.effiMsg}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* El estado lo maneja la integración (Dropi/Effi) y se le avisa al cliente;
            ya no se cambia a mano desde aquí. */}
        <div style={{ padding: '14px 18px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)', borderTop: '1px solid var(--df-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--df-text-muted)' }}>
          <span>Estado actual:</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: 'var(--df-text-faint)', fontSize: 11, textAlign: 'right' }}>Automático desde {sel.despachoProveedor === 'effi' ? 'Effi' : 'Dropi'}</span>
        </div>
      </div>
    </div>
  );
}
