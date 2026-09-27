import { useState } from 'react';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { Dropdown } from './Dropdown';
import { apiDropiCotizar, apiDropiCrear, type DropiTransportadora } from '../lib/api';

const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-CO');

/**
 * Despacho por la API directa de Dropi: cotiza las transportadoras para el
 * destino del pedido, el operador elige una (o deja que Dropi decida) y se crea
 * la orden en Dropi con la elegida.
 */
export function DropiDespacho({ df, sel, onHecho }: { df: DealFlowState; sel: DecoratedOrder; onHecho?: () => void }) {
  const [paso, setPaso] = useState<'idle' | 'cargando' | 'elegir' | 'creando'>('idle');
  const [ciudad, setCiudad] = useState('');
  const [disponibles, setDisponibles] = useState<DropiTransportadora[]>([]);
  const [noDisp, setNoDisp] = useState<{ nombre: string; motivo: string }[]>([]);
  const [elegida, setElegida] = useState<DropiTransportadora | null>(null);
  const [auto, setAuto] = useState(false);
  const [msg, setMsg] = useState('');

  const cotizar = () => {
    if (!sel.rowId) return;
    setPaso('cargando'); setMsg('Cotizando transportadoras en Dropi…');
    void apiDropiCotizar(sel.rowId).then((r) => {
      if (r.error || !r.data) { setPaso('idle'); setMsg(r.error || 'No pudimos cotizar.'); return; }
      setCiudad(r.data.ciudad); setDisponibles(r.data.disponibles); setNoDisp(r.data.noDisponibles);
      setElegida(r.data.disponibles[0] || null); setAuto(false);
      setPaso('elegir'); setMsg('');
    });
  };
  const crear = () => {
    if (!sel.rowId) return;
    setPaso('creando'); setMsg('Creando la orden en Dropi…');
    void apiDropiCrear(sel.rowId, auto ? undefined : (elegida || undefined)).then((r) => {
      if (r.error || !r.data) { setPaso('elegir'); setMsg(r.error || 'No pudimos crear la orden.'); return; }
      df.marcarDropiCreado(sel.id, r.data.dropiId, r.data.transportadora || (auto ? '' : elegida?.nombre || ''));
      setMsg(''); onHecho?.();
    });
  };

  const btnP: React.CSSProperties = { background: 'var(--df-warning)', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' };

  if (paso === 'idle' || paso === 'cargando') {
    return (
      <div>
        <button onClick={cotizar} disabled={paso === 'cargando'} style={{ ...btnP, opacity: paso === 'cargando' ? 0.7 : 1 }}>
          {paso === 'cargando' ? 'Cotizando…' : '📦 Generar en Dropi'}
        </button>
        {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 8 }}>Transportadoras para <b>{ciudad || 'el destino'}</b> — elige una:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {disponibles.map((t) => {
          const on = !auto && elegida?.id === t.id && elegida?.service === t.service;
          return (
            <button key={`${t.id}-${t.service}`} onClick={() => { setElegida(t); setAuto(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: on ? 'var(--df-warning-subtle)' : 'var(--df-surface)', border: `1px solid ${on ? 'var(--df-warning)' : 'var(--df-border)'}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer' }}>
              <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${on ? 'var(--df-warning)' : 'var(--df-border)'}`, background: on ? 'var(--df-warning)' : 'transparent', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t.nombre}{t.service && t.service !== 'normal' ? ` · ${t.service}` : ''}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{pesos(t.precio)}</span>
            </button>
          );
        })}
        <button onClick={() => setAuto(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: auto ? 'var(--df-warning-subtle)' : 'var(--df-surface)', border: `1px solid ${auto ? 'var(--df-warning)' : 'var(--df-border)'}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer' }}>
          <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${auto ? 'var(--df-warning)' : 'var(--df-border)'}`, background: auto ? 'var(--df-warning)' : 'transparent', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Que Dropi elija (automático)</span>
        </button>
      </div>
      {!!noDisp.length && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--df-text-faint)' }}>
          Sin cobertura: {noDisp.map((n) => n.nombre).join(', ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={crear} disabled={paso === 'creando' || (!auto && !elegida)} style={{ ...btnP, opacity: paso === 'creando' || (!auto && !elegida) ? 0.6 : 1 }}>
          {paso === 'creando' ? 'Creando…' : 'Crear en Dropi'}
        </button>
        <button onClick={() => { setPaso('idle'); setMsg(''); }} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-text-muted)', cursor: 'pointer' }}>Cancelar</button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
    </div>
  );
}

export function OrderDetailPanel({ df }: { df: DealFlowState }) {
  const [transp, setTransp] = useState('');
  const [redespachar, setRedespachar] = useState(false);
  if (!df.hasSelectedOrder || !df.sel) return null;
  const sel = df.sel;
  // Opciones de transportadora: vacío ("sin especificar") + la lista fija.
  const transpOpts = [{ value: '', label: 'Transportadora (opcional)' }, ...df.wooTransportadoras.map((t) => ({ value: t, label: t }))];
  const carrierElegido = transp || df.wooTransportadora || '';
  const dropiCreado = sel.despachoProveedor === 'dropi'; // Dropi se despacha por API directa

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={df.closeOrder} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)' }} />
      <div style={{ position: 'relative', width: 430, maxWidth: '92%', background: 'var(--df-surface)', height: '100%', boxShadow: '-12px 0 40px rgba(15,23,42,.18)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--df-border)' }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600 }}>{sel.id}</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <span onClick={df.closeOrder} className="df-close-hover" style={{ color: 'var(--df-text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>
            ✕
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--df-text-muted)', fontSize: 12.5, marginBottom: 14 }}>
            <span>📅</span>
            <span>
              Pedido el <b style={{ color: 'var(--df-text-strong)' }}>{sel.fecha || 'hoy'}</b> a las <b style={{ color: 'var(--df-text-strong)' }}>{sel.hora}</b>
            </span>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Datos de envío</div>
          <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 14, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
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
                <span style={{ color: 'var(--df-text-muted)', fontWeight: 600, minWidth: 118, flexShrink: 0 }}>{f.k}:</span>
                <span style={{ fontWeight: f.k === 'Nombre' ? 700 : 500, fontFamily: f.mono ? "'JetBrains Mono',monospace" : undefined, fontSize: f.mono ? 12.5 : undefined }}>{f.v}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Qué pidió</div>
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
            {sel.itemsDecorated.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--df-border)' }}>
                <span style={{ background: 'var(--df-surface-2)', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 8px', color: 'var(--df-text-secondary)' }}>{it.qty}×</span>
                <span style={{ fontSize: 13.5, flex: 1 }}>{it.nombre}</span>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{it.precioFmt}</span>
              </div>
            ))}
            <div style={{ display: 'flex', padding: '11px 14px', background: 'var(--df-bg)', fontSize: 13, color: 'var(--df-text-muted)' }}>
              <span>Envío{sel.transportadora ? ` (${sel.transportadora})` : ''}</span>
              <div style={{ flex: 1 }} />
              <span>{sel.envioFmt}</span>
            </div>
            <div style={{ display: 'flex', padding: '12px 14px', borderTop: '1px solid var(--df-border)', fontWeight: 800, fontSize: 15 }}>
              <span>Total</span>
              <div style={{ flex: 1 }} />
              <span>{sel.totalFmt}</span>
            </div>
          </div>

          {sel.hasNota && (
            <div style={{ background: 'var(--df-warning-subtle-2)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400E', marginBottom: 18 }}>
              📝 {sel.nota}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Despacho</div>
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
            {sel.despachado && !redespachar ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: dropiCreado ? 'var(--df-warning-subtle)' : 'var(--df-purple-subtle)', color: dropiCreado ? 'var(--df-warning)' : 'var(--df-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{dropiCreado ? 'Dr' : 'Ef'}</div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Enviado por {dropiCreado ? 'Dropi' : 'Effi'}</span>
                  {sel.transportadora && <span style={{ display: 'inline-block', background: 'var(--df-warning-subtle)', color: 'var(--df-warning)', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>🚚 {sel.transportadora}</span>}
                  <span style={{ display: 'inline-block', background: 'var(--df-brand-subtle)', color: 'var(--df-brand-dark)', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{dropiCreado ? 'En Dropi' : 'En WooCommerce'}</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={sel.sincronizarEffi} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-purple)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Actualizar ahora</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--df-text-muted)' }}>
                  Estado en {dropiCreado ? 'Dropi' : 'Effi'}: <b style={{ color: 'var(--df-text-strong)' }}>{sel.estadoWoo || 'esperando que lo procesen…'}</b>
                  <span style={{ display: 'block', color: 'var(--df-text-faint)', fontSize: 11.5, marginTop: 2 }}>Se actualiza solo cada pocos minutos. Cuando salga la guía, le avisamos al cliente por WhatsApp.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {!dropiCreado && <button onClick={() => sel.reenviarDespacho('effi', sel.transportadora || carrierElegido)} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-warning)', cursor: 'pointer', whiteSpace: 'nowrap' }}>↻ Volver a enviar</button>}
                  <button onClick={() => setRedespachar(true)} style={{ background: 'transparent', border: 'none', color: 'var(--df-purple)', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>Cambiar despacho / transportadora</button>
                </div>
                {sel.hasGuia && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, color: 'var(--df-text-strong)' }}>Guía {sel.guia}</div>
                    <button onClick={() => df.copyGuia(sel.guia!)} className="df-copy-btn" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-text-strong)', cursor: 'pointer', whiteSpace: 'nowrap' }}>{df.guiaBtnLabel}</button>
                    {sel.guiaUrl && <a href={sel.guiaUrl} target="_blank" rel="noreferrer" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-purple)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Ver PDF</a>}
                  </div>
                )}
              </>
            ) : !df.dropiConectado && !df.wooProveedores.includes('effi') ? (
              <div style={{ color: 'var(--df-text-faint)', fontSize: 13 }}>Conecta <b>Dropi (API)</b> o el <b>WooCommerce de Effi</b> en <b>Integraciones</b> para despachar este pedido.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {redespachar && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', flex: 1 }}>Volver a despachar este pedido:</span>
                    <button onClick={() => setRedespachar(false)} style={{ background: 'transparent', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-text-muted)', cursor: 'pointer' }}>Cancelar</button>
                  </div>
                )}
                {df.dropiConectado && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--df-warning-subtle)', color: 'var(--df-warning)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>Dr</span>
                      Despachar por Dropi
                    </div>
                    <DropiDespacho df={df} sel={sel} onHecho={() => setRedespachar(false)} />
                  </div>
                )}
                {df.wooProveedores.includes('effi') && (
                  <div style={{ borderTop: df.dropiConectado ? '1px solid var(--df-border)' : 'none', paddingTop: df.dropiConectado ? 12 : 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--df-purple-subtle)', color: 'var(--df-purple)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>Ef</span>
                      Despachar por Effi
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 180, flex: 1 }}>
                        <Dropdown ariaLabel="Transportadora Effi" value={carrierElegido} onChange={setTransp} options={transpOpts} placeholder="Transportadora (opcional)" />
                      </div>
                      <button onClick={() => { sel.despachar('effi', carrierElegido); setRedespachar(false); }} style={{ background: 'var(--df-purple)', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>Enviar por Effi</button>
                    </div>
                    {df.effiMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: df.effiMsg.startsWith('✓') || df.effiMsg.startsWith('Estado') ? 'var(--df-purple)' : df.effiMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.effiMsg}</div>}
                  </div>
                )}
              </div>
            )}
            {sel.despachado && df.effiMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: df.effiMsg.startsWith('✓') || df.effiMsg.startsWith('Estado') ? 'var(--df-purple)' : df.effiMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.effiMsg}</div>}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>Avance</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sel.timeline.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0' }}>
                <span style={t.dotStyle} />
                <span style={t.labelStyle}>{t.estado}</span>
              </div>
            ))}
          </div>
        </div>

        {/* El estado lo maneja la integración (Dropi/Effi) automáticamente y se le
            comunica al cliente; por eso ya no se cambia a mano desde aquí. */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--df-border)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--df-text-muted)', fontSize: 12.5 }}>
          <span>Estado actual:</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: 'var(--df-text-faint)', fontSize: 11.5, textAlign: 'right' }}>Se actualiza solo desde {sel.despachoProveedor === 'effi' ? 'Effi' : 'Dropi'}</span>
        </div>
      </div>
    </div>
  );
}
