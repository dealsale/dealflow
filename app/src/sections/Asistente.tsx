import type { DealFlowState } from '../hooks/useDealFlowState';

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
    </section>
  );
}
