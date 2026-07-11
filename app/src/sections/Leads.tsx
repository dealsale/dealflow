import type { DealFlowState } from '../hooks/useDealFlowState';

export function Leads({ df }: { df: DealFlowState }) {
  const lead = df.lead;
  return (
    <section data-screen-label="Leads">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Leads</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Conversaciones abiertas. Asígnalas o envíalas a un flujo.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'auto', maxHeight: 'min(70vh, 620px)', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          {df.leads.map((l) => (
            <div key={l.id} onClick={l.select} style={l.rowStyle}>
              <div style={l.avatarStyle}>{l.iniciales}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{l.nombre}</span>
                  <span style={{ color: '#94A3B8', fontSize: 11.5, marginLeft: 'auto' }}>{l.hora}</span>
                </div>
                <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.ultimo}</div>
                <span style={l.etapaStyle}>{l.etapa}</span>
              </div>
            </div>
          ))}
        </div>

        {lead && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', height: 'min(70vh, 620px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={lead.avatarStyle}>{lead.iniciales}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{lead.nombre}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#64748B' }}>{lead.tel}</div>
              </div>
              <span style={lead.etapaStyle}>{lead.etapa}</span>
              <div style={{ flex: 1 }} />
              <a href="#" style={{ fontSize: 13, fontWeight: 600 }}>
                Abrir en WhatsApp
              </a>
            </div>

            <div style={{ flex: 1, background: '#F8FAFC', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {lead.mensajesDecorated.map((m, i) => (
                <div key={i} style={m.rowStyle}>
                  <div style={m.bubbleStyle}>
                    {m.texto}
                    <span style={{ display: 'block', fontSize: 10.5, color: '#94A3B8', marginTop: 3, textAlign: 'right' }}>{m.hora}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '14px 18px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Asignar a</div>
                <select
                  value={df.leadAsignado}
                  onChange={(e) => df.assignLead(e.target.value)}
                  style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 10px', fontFamily: 'inherit', fontSize: 13, color: '#1E293B', background: '#fff', cursor: 'pointer' }}
                >
                  <option value="Asistente (bot)">Asistente (bot)</option>
                  <option value="Karla">Karla</option>
                  <option value="Andrés">Andrés</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Enviar a un flujo</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={df.flowSel}
                    onChange={(e) => df.setFlowSel(e.target.value)}
                    style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 10px', fontFamily: 'inherit', fontSize: 13, color: '#1E293B', background: '#fff', cursor: 'pointer' }}
                  >
                    <option value="Recuperar carrito">Recuperar carrito</option>
                    <option value="Confirmar pago">Confirmar pago</option>
                    <option value="Seguimiento de envío">Seguimiento de envío</option>
                    <option value="Postventa">Postventa</option>
                  </select>
                  <button
                    onClick={df.sendFlow}
                    className="df-btn-primary"
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Enviar
                  </button>
                </div>
              </div>
              {df.hasFlowMsg && <div style={{ width: '100%', color: '#059669', fontSize: 13, fontWeight: 600 }}>{df.flowMsg}</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
