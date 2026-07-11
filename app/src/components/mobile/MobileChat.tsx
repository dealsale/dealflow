import { AttachButton, MediaContent } from '../MediaBubble';
import type { DealFlowState } from '../../hooks/useDealFlowState';

export function MobileChat({ df }: { df: DealFlowState }) {
  const chat = df.crmChat;
  if (!df.mobileChatOpen || !chat) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 55, background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          background: '#0F172A',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '10px 14px',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          flexShrink: 0,
        }}
      >
        <div
          onClick={df.closeMobileChat}
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: -10 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 5l-7 7 7 7"></path>
          </svg>
        </div>
        <div style={chat.avatarStyle}>{chat.iniciales}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{chat.nombre}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#94A3B8' }}>
            <span style={chat.liveDot} />
            {chat.liveLabel} · atiende {chat.asignado}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chat.mensajesDecorated.map((m, i) => (
          <div key={i} style={m.rowStyle}>
            <div style={{ ...m.bubbleStyle, maxWidth: '80%' }}>
              <MediaContent m={m} />
              <span style={m.horaStyle}>{m.hora}</span>
            </div>
          </div>
        ))}
        {df.crmTyping && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: '12px 12px 4px 12px', padding: '9px 14px', fontSize: 13, color: '#047857' }}>
              El asistente está escribiendo…
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', borderTop: '1px solid #E2E8F0', background: '#fff' }}>
        {df.crmNotIntervening && (
          <button
            onClick={df.intervene}
            style={{ width: '100%', background: '#0F172A', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            Intervenir yo en este chat
          </button>
        )}
        {df.crmIntervening && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <AttachButton onFile={df.sendCrmMedia} size={44} />
              <input
                className="df-input"
                value={df.crmDraft}
                onChange={(e) => df.setCrmDraft(e.target.value)}
                placeholder="Escribe tu mensaje…"
                style={{ flex: 1, minWidth: 0, border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 14, minHeight: 44, boxSizing: 'border-box' }}
              />
              <button
                onClick={df.sendCrm}
                className="df-btn-primary"
                style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44 }}
              >
                Enviar
              </button>
            </div>
            <div onClick={df.backToBot} style={{ textAlign: 'center', color: '#64748B', fontSize: 13, fontWeight: 600, marginTop: 10, cursor: 'pointer' }}>
              Devolver al asistente
            </div>
          </>
        )}
      </div>
    </div>
  );
}
