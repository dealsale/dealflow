import type { DealFlowState } from '../hooks/useDealFlowState';
import { WA_NUMBER } from '../data';

const label: React.CSSProperties = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };

function MethodTab({ active, onClick, titulo, sub }: { active: boolean; onClick: () => void; titulo: string; sub: string }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        cursor: 'pointer',
        border: '1px solid ' + (active ? '#059669' : '#E2E8F0'),
        background: active ? '#ECFDF5' : '#fff',
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: active ? '#047857' : '#1E293B' }}>{titulo}</div>
      <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function WhatsAppSection({ df }: { df: DealFlowState }) {
  const numero = df.waCfg?.numero || WA_NUMBER;

  return (
    <section data-screen-label="WhatsApp" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>WhatsApp</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Conecta el WhatsApp de tu negocio para atender y vender desde aquí.</p>

      <div style={df.waCardStyleResolved}>
        <span style={df.waBigDot} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{df.waStatusTitle}</div>
          <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>
            {df.waConnected ? (
              <>
                {df.waModo === 'qr' ? 'Vinculado por QR' : 'API oficial de Meta'} · Número:{' '}
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }}>{numero}</span>
              </>
            ) : (
              'Elige cómo conectar tu número.'
            )}
          </div>
        </div>
        {df.waConnected && (
          <button onClick={df.desvincularWa} style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Desvincular
          </button>
        )}
      </div>

      {!df.waConnected && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <MethodTab active={df.waMethod === 'qr'} onClick={() => df.setWaMethod('qr')} titulo="Por código QR" sub="Rápido, escaneas como WhatsApp Web" />
            <MethodTab active={df.waMethod === 'cloud'} onClick={() => df.setWaMethod('cloud')} titulo="Por API oficial" sub="WABA ID + Access Token de Meta" />
          </div>

          {df.waMethod === 'qr' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Vincular por QR</div>
              <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
                En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escanea el código.
              </div>

              {df.qrEstado === 'inactivo' && (
                <button
                  onClick={df.iniciarQr}
                  className="df-btn-primary"
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  Generar código QR
                </button>
              )}

              {df.qrEstado === 'iniciando' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748B', fontSize: 14 }}>
                  <span style={{ width: 16, height: 16, border: '2px solid #E2E8F0', borderTopColor: '#059669', borderRadius: '50%', display: 'inline-block', animation: 'dfspin .8s linear infinite' }} />
                  Preparando la conexión… en segundos aparece el código.
                </div>
              )}

              {df.qrEstado === 'error' && (
                <div>
                  <div style={{ color: '#DC2626', fontSize: 13.5, marginBottom: 12 }}>{df.qrError || 'No pudimos generar el código. Intenta de nuevo.'}</div>
                  <button
                    onClick={df.iniciarQr}
                    className="df-btn-primary"
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {df.qrEstado === 'qr' && (
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ width: 220, height: 220, border: '1px solid #E2E8F0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                    {df.qrImg === 'demo' ? (
                      <span style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 16 }}>
                        (Demo) Aquí aparece tu código QR real cuando el panel corre en el servidor.
                      </span>
                    ) : (
                      <img src={df.qrImg} alt="Código QR de WhatsApp" style={{ width: 200, height: 200 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Escanéalo desde tu teléfono</div>
                    <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
                      El código se actualiza solo. En cuanto lo escanees, esta pantalla pasa a «Conectado» y empiezan a entrar los chats en el CRM.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {df.waMethod === 'cloud' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Vincular por API oficial</div>
              <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
                Los tres datos salen de tu app en developers.facebook.com → WhatsApp. Los validamos con Meta antes de guardar.
              </div>
              <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={label}>WABA ID</div>
                  <input className="df-input" value={df.waForm.wabaId} onChange={(e) => df.setWaForm({ wabaId: e.target.value })} placeholder="Ej: 102290129340398" style={input} />
                </div>
                <div>
                  <div style={label}>Phone Number ID</div>
                  <input className="df-input" value={df.waForm.phoneNumberId} onChange={(e) => df.setWaForm({ phoneNumberId: e.target.value })} placeholder="Ej: 106540352242922" style={input} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={label}>Access Token (permanente)</div>
                <input className="df-input" type="password" value={df.waForm.accessToken} onChange={(e) => df.setWaForm({ accessToken: e.target.value })} placeholder="EAAG…" style={input} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={df.vincularWa}
                  disabled={df.waLinking}
                  className="df-btn-primary"
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: df.waLinking ? 0.7 : 1 }}
                >
                  {df.waLinking ? 'Validando con Meta…' : 'Vincular número'}
                </button>
                {df.waError && <span style={{ color: '#DC2626', fontSize: 13 }}>{df.waError}</span>}
              </div>
            </div>
          )}
        </>
      )}

      {df.waConnected && df.waModo === 'cloud' && (
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Webhook en Meta · se configura una sola vez</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>En tu app de Meta → WhatsApp → Configuration, pega estos dos datos y suscríbete al campo «messages».</div>
          <div style={label}>URL del webhook</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ ...input, width: 'auto', flex: 1, background: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{df.webhookUrl}</div>
            <button onClick={df.copyWebhook} className="df-copy-btn" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {df.webhookBtnLabel}
            </button>
          </div>
          <div style={label}>Token de verificación</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ ...input, width: 'auto', flex: 1, background: '#F8FAFC', letterSpacing: '0.1em' }}>{df.waCode}</div>
            <button onClick={df.copyCode} className="df-copy-btn" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {df.codeBtnLabel}
            </button>
          </div>
        </div>
      )}

      {df.waConnected && df.waModo === 'qr' && (
        <div style={{ ...card, marginBottom: 0, background: '#ECFDF5', borderColor: '#A7F3D0' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#047857' }}>Listo para probar</div>
          <div style={{ color: '#047857', fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
            Escríbele un mensaje a tu número desde otro teléfono y aparecerá en <b>CRM · Chats en vivo</b>. Desde ahí puedes responder tú mismo.
          </div>
        </div>
      )}
    </section>
  );
}
