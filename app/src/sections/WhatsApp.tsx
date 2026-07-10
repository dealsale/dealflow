import type { DealFlowState } from '../hooks/useDealFlowState';
import { WA_NUMBER } from '../data';

const label: React.CSSProperties = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 };

export function WhatsAppSection({ df }: { df: DealFlowState }) {
  const numero = df.waCfg?.numero || WA_NUMBER;
  return (
    <section data-screen-label="WhatsApp" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>WhatsApp</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Vincula el número de tu negocio con la API oficial de Meta.</p>

      <div style={df.waCardStyleResolved}>
        <span style={df.waBigDot} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{df.waStatusTitle}</div>
          <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>
            {df.waConnected ? (
              <>Número del negocio: <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }}>{numero}</span></>
            ) : (
              'Vincula tu número con los datos de tu app de Meta.'
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
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Vincula tu número</div>
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

      {df.waConnected && df.waCfg && (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Credenciales vinculadas</div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={label}>WABA ID</div>
              <div style={{ ...input, background: '#F8FAFC' }}>{df.waCfg.wabaId}</div>
            </div>
            <div>
              <div style={label}>Phone Number ID</div>
              <div style={{ ...input, background: '#F8FAFC' }}>{df.waCfg.phoneNumberId}</div>
            </div>
          </div>
          <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 10 }}>El Access Token queda guardado de forma segura en el servidor; no se vuelve a mostrar.</div>
        </div>
      )}

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
    </section>
  );
}
