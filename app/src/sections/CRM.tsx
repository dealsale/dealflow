import { useEffect, useRef, useState } from 'react';
import { AttachButton, MediaContent } from '../components/MediaBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import type { DealFlowState } from '../hooks/useDealFlowState';

export function CRM({ df }: { df: DealFlowState }) {
  const chat = df.crmChat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [busca, setBusca] = useState('');
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.tel, chat?.mensajesDecorated.length]);
  const q = busca.trim().toLowerCase();
  const chatsFiltrados = df.crmChats.filter(
    (c) => (!filtroEtiqueta || c.etiqueta === filtroEtiqueta) && (!q || c.nombre.toLowerCase().includes(q) || c.tel.toLowerCase().includes(q)),
  );
  const chipStyle = (activo: boolean): React.CSSProperties => ({
    border: '1px solid ' + (activo ? '#059669' : '#E2E8F0'),
    background: activo ? '#ECFDF5' : '#fff',
    color: activo ? '#047857' : '#64748B',
    borderRadius: 999,
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });
  return (
    <section data-screen-label="CRM">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>CRM · Chats en vivo</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 14px' }}>Lo que pasa ahora mismo en tu WhatsApp. Entra a un chat si quieres tomar el control.</p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          className="df-input"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar por nombre o teléfono…"
          style={{ border: '1px solid #E2E8F0', borderRadius: 999, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, width: 240 }}
        />
        <span onClick={() => setFiltroEtiqueta('')} style={chipStyle(!filtroEtiqueta)}>Todos</span>
        {df.etiquetasCrm.map((et) => (
          <span key={et} onClick={() => setFiltroEtiqueta(filtroEtiqueta === et ? '' : et)} style={chipStyle(filtroEtiqueta === et)}>
            {et}
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'auto', maxHeight: 'min(70vh, 620px)', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          {chatsFiltrados.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Ningún chat coincide con el filtro.
            </div>
          )}
          {chatsFiltrados.map((c) => (
            <div key={c.id} onClick={c.select} style={c.crmRowStyle}>
              <div style={c.avatarStyle}>{c.iniciales}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</span>
                  {c.canal === 'web' && <span title="Llegó por el chat web" style={{ fontSize: 11 }}>🌐</span>}
                  {c.etiquetaStyle && <span style={c.etiquetaStyle}>{c.etiqueta}</span>}
                  <span style={{ color: '#94A3B8', fontSize: 11.5, marginLeft: 'auto' }}>{c.hora}</span>
                </div>
                <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultimo}</div>
                <div style={c.liveStyle}>
                  <span style={c.liveDot} />
                  <span>{c.liveLabel}</span>
                  <span style={{ color: '#94A3B8', fontWeight: 500 }}>· atiende {c.asignado}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {chat && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', height: 'min(70vh, 620px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={chat.avatarStyle}>{chat.iniciales}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{chat.nombre}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#64748B' }}>{chat.tel}</div>
              </div>
              <div style={chat.liveStyle}>
                <span style={chat.liveDot} />
                <span>{chat.liveLabel}</span>
              </div>
              <div style={{ flex: 1 }} />
              <select
                value={chat.etiqueta || ''}
                onChange={(e) => df.setLeadEtiqueta(chat.id, e.target.value)}
                title="Etiqueta esta conversación"
                style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: chat.etiqueta ? '#1E293B' : '#94A3B8', background: '#fff', cursor: 'pointer' }}
              >
                <option value="">🏷️ Sin etiqueta</option>
                {df.etiquetasCrm.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
              <button
                onClick={df.resetChat}
                title="Borra el historial y devuelve el chat al asistente"
                style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
              >
                Reiniciar
              </button>
              <button
                onClick={df.requestDeleteChat}
                title="Elimina este chat por completo"
                style={
                  df.crmDeleteArmed
                    ? { background: '#DC2626', color: '#fff', border: '1px solid #DC2626', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                    : { background: '#fff', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                }
              >
                {df.crmDeleteArmed ? '¿Seguro? Sí, eliminar' : 'Eliminar'}
              </button>
            </div>

            <div ref={scrollRef} style={{ flex: 1, background: '#F8FAFC', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {chat.mensajesDecorated.map((m, i) => (
                <div key={i} style={m.rowStyle}>
                  <div style={m.bubbleStyle}>
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

            <div style={{ padding: '14px 18px', borderTop: '1px solid #F1F5F9' }}>
              {df.crmNotIntervening && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#64748B', fontSize: 13, flex: 1 }}>El asistente está atendiendo este chat.</span>
                  <button
                    onClick={df.intervene}
                    style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Intervenir yo
                  </button>
                </div>
              )}
              {df.crmIntervening && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AttachButton onFile={df.sendCrmMedia} size={40} />
                  <VoiceRecorder onRecorded={df.sendCrmMedia} size={40} />
                  <input
                    className="df-input"
                    value={df.crmDraft}
                    onChange={(e) => df.setCrmDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') df.sendCrm();
                    }}
                    placeholder="Escribe tu mensaje…"
                    style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <button
                    onClick={df.sendCrm}
                    className="df-btn-primary"
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Enviar
                  </button>
                  <button
                    onClick={df.backToBot}
                    style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '11px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Devolver al asistente
                  </button>
                </div>
              )}
              {df.crmSendWarn && (
                <div style={{ color: '#B45309', fontSize: 12.5, marginTop: 8 }}>
                  Guardado en el CRM, pero no salió por WhatsApp: {df.crmSendWarn}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
