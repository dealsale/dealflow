import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { apiWebchatList, apiWebchatSend } from '../lib/api';
import type { ApiMensaje } from '../lib/api';

/** Chat de prueba: habla con TU asistente por el canal web, sin gastar WhatsApp. */
function PruebaAsistente({ storeId }: { storeId: string }) {
  const key = 'df:test-session:' + storeId;
  const [session, setSession] = useState(() => {
    let s = localStorage.getItem(key);
    if (!s) { s = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem(key, s); }
    return s;
  });
  const [mensajes, setMensajes] = useState<ApiMensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    const cargar = () => void apiWebchatList(storeId, session).then((r) => { if (vivo && r.data) setMensajes(r.data.mensajes); });
    cargar();
    const t = setInterval(cargar, 2500);
    return () => { vivo = false; clearInterval(t); };
  }, [storeId, session]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length]);

  function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setTexto('');
    setMensajes((st) => [...st, { de: 'cliente', texto: t, hora: '· ahora' }]);
    void apiWebchatSend(storeId, session, t, 'Prueba del dueño').then(() => {
      setEnviando(false);
      void apiWebchatList(storeId, session).then((r) => { if (r.data) setMensajes(r.data.mensajes); });
    });
  }

  function reiniciar() {
    const s = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(key, s);
    setSession(s);
    setMensajes([]);
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginTop: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🧪 Prueba tu asistente</div>
          <div style={{ color: '#64748B', fontSize: 13 }}>Chatea aquí mismo con tu IA, como si fueras un cliente. No usa WhatsApp: funciona aunque Meta esté caído.</div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={reiniciar}
          title="Empieza una conversación nueva desde cero"
          style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          ↻ Empezar de nuevo
        </button>
      </div>

      <div ref={scrollRef} style={{ height: 340, overflowY: 'auto', background: '#F8FAFC', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mensajes.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#94A3B8', fontSize: 13.5, lineHeight: 1.7 }}>
            Escríbele como lo haría un cliente:<br />
            <i>«hola», «tienes joggers?», «mándame fotos», «quiero 2»…</i>
          </div>
        )}
        {mensajes.map((m, i) => {
          const mio = m.de === 'cliente';
          return (
            <div key={i} style={{ display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '72%', background: mio ? '#DCFCE7' : '#fff', border: '1px solid ' + (mio ? '#BBF7D0' : '#E2E8F0'), borderRadius: 12, padding: '9px 12px', fontSize: 13.5, lineHeight: 1.5 }}>
                {m.tipo === 'image' && m.mediaUrl && <img src={m.mediaUrl} alt="" style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 0 }} />}
                {m.tipo === 'video' && m.mediaUrl && <video src={m.mediaUrl} controls style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: m.texto ? 6 : 0 }} />}
                {m.tipo === 'audio' && m.mediaUrl && <audio src={m.mediaUrl} controls style={{ maxWidth: 220, display: 'block' }} />}
                {m.texto && <span style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</span>}
                <span style={{ display: 'block', textAlign: 'right', color: '#94A3B8', fontSize: 10.5, marginTop: 3 }}>{m.hora}</span>
              </div>
            </div>
          );
        })}
        {enviando && <div style={{ color: '#94A3B8', fontSize: 12.5 }}>El asistente está escribiendo…</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #F1F5F9' }}>
        <input
          className="df-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
          placeholder="Escribe como si fueras el cliente…"
          style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 13.5, minHeight: 44, boxSizing: 'border-box' }}
        />
        <button
          onClick={enviar}
          className="df-btn-primary"
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

export function Asistente({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Asistente">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Asistente</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Dile en palabras normales cómo debe vender. Él se encarga del resto.</p>
      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Cómo debe vender</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 12 }}>Escríbelo como se lo dirías a un empleado nuevo.</div>
          <textarea
            className="df-input"
            value={df.assistantText}
            onChange={(e) => df.setAssistantText(e.target.value)}
            rows={9}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, color: '#1E293B', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button
              onClick={df.saveAssistant}
              className="df-btn-primary"
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Guardar instrucciones
            </button>
            {df.assistantSaved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Guardado. El asistente ya vende así.</span>}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Reglas</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 12 }}>Se cumplen siempre, pase lo que pase.</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{df.rules.length} regla{df.rules.length === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
            {df.rules.length === 0 && <div style={{ color: '#94A3B8', fontSize: 13, padding: '8px 2px' }}>Aún no hay reglas. Agrega la primera abajo.</div>}
            {df.rules.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                <span style={{ color: '#94A3B8', fontWeight: 700, flexShrink: 0, fontSize: 12, minWidth: 18 }}>{i + 1}</span>
                <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{r.texto}</span>
                <span onClick={r.remove} className="df-danger-hover" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>
                  ✕
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="df-input"
              value={df.ruleDraft}
              onChange={(e) => df.setRuleDraft(e.target.value)}
              placeholder="Escribe una regla nueva…"
              style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
            />
            <button
              onClick={df.addRule}
              className="df-btn-outline-green"
              style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Agregar regla
            </button>
          </div>
        </div>
      </div>

      {df.apiMode && df.storeId && <PruebaAsistente storeId={df.storeId} />}
    </section>
  );
}
