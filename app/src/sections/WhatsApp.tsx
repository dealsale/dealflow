import type { DealFlowState } from '../hooks/useDealFlowState';
import { WA_NUMBER } from '../data';

const stepCircle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: '#ECFDF5',
  color: '#059669',
  fontWeight: 700,
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

export function WhatsAppSection({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="WhatsApp" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>WhatsApp</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Conecta el número de tu negocio en tres pasos.</p>

      <div style={df.waCardStyleResolved}>
        <span style={df.waBigDot} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{df.waStatusTitle}</div>
          <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>
            Número del negocio: <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }}>{WA_NUMBER}</span>
          </div>
        </div>
        <button onClick={df.toggleWa} style={df.waToggleBtn}>
          {df.waToggleLabel}
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 22, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          <div style={stepCircle}>1</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Abre WhatsApp Business en tu celular</div>
            <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>Ve a Ajustes → Herramientas para el negocio → API.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          <div style={stepCircle}>2</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Pega estos dos datos donde te los pida</div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Dirección de conexión</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {df.webhookUrl}
              </div>
              <button
                onClick={df.copyWebhook}
                className="df-copy-btn"
                style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {df.webhookBtnLabel}
              </button>
            </div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Código de verificación</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#1E293B', letterSpacing: '0.1em' }}>
                {df.waCode}
              </div>
              <button
                onClick={df.copyCode}
                className="df-copy-btn"
                style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {df.codeBtnLabel}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          <div style={stepCircle}>3</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Listo. Escríbele "hola" a tu número para probar</div>
            <div style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>El asistente debe responderte en segundos. Si no, revisa el paso 2.</div>
          </div>
        </div>
      </div>
    </section>
  );
}
