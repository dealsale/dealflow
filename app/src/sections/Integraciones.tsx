import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };

export function Integraciones({ df }: { df: DealFlowState }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [predeterminada, setPredeterminada] = useState(false);

  function abrir(id: string) {
    setAbierta(abierta === id ? null : id);
    setForm({});
    setPredeterminada(false);
  }

  return (
    <section data-screen-label="Integraciones">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Integraciones</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 8px' }}>
        Conecta DealFlow con las herramientas que ya usas. Cada tienda pone sus propias claves y paga solo lo que consume.
      </p>
      <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 18px' }}>
        🤖 Agente de IA actual: <b style={{ color: '#047857' }}>{df.iaPredeterminada === 'openai' ? 'OpenAI' : df.iaPredeterminada === 'grok' ? 'Grok (xAI)' : 'DeepSeek'}</b>
        {' '}— conéctale su API key y elige cuál responde tus chats.
      </p>
      {df.integracionMsg && (
        <div style={{ background: df.integracionMsg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', border: '1px solid ' + (df.integracionMsg.startsWith('✓') ? '#A7F3D0' : '#FECACA'), color: df.integracionMsg.startsWith('✓') ? '#047857' : '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {df.integracionMsg}
        </div>
      )}

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'start' }}>
        {df.integrations.map((i) => {
          const abiertaEsta = abierta === i.id;
          const configurada = !!df.integracionesCfg[i.id];
          const esAgente = i.esIA && df.iaPredeterminada === i.id;
          return (
            <div key={i.id} style={{ background: '#fff', border: '1px solid ' + (abiertaEsta ? '#A7F3D0' : '#E2E8F0'), borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={i.logoStyle}>{i.logoText}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{i.nombre}</div>
                <div style={{ flex: 1 }} />
                {esAgente && <span title="Este es el agente que responde tus chats" style={{ fontSize: 11, fontWeight: 800, color: '#047857', background: '#D1FAE5', borderRadius: 6, padding: '2px 7px' }}>🤖 Agente</span>}
                <span style={i.badgeStyle}>{i.badgeLabel}</span>
              </div>
              <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{i.desc}</div>

              {abiertaEsta && i.campos && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {configurada && (
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      Guardado: {Object.entries(df.integracionesCfg[i.id]).map(([k, v]) => `${k} ${v}`).join(' · ')}
                    </div>
                  )}
                  {i.campos.map((c) => (
                    <div key={c.key}>
                      <div style={{ color: '#64748B', fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                      <input
                        className="df-input"
                        type={c.secreto ? 'password' : 'text'}
                        value={form[c.key] || ''}
                        onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                        placeholder={c.placeholder || ''}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  {i.esIA && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                      <input type="checkbox" checked={predeterminada} onChange={(e) => setPredeterminada(e.target.checked)} />
                      Usar como agente predeterminado (responde los chats)
                    </label>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { df.guardarIntegracion(i.id, form, predeterminada); setAbierta(null); }}
                      className="df-btn-primary"
                      style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                    >
                      Guardar
                    </button>
                    {i.esIA && configurada && !esAgente && (
                      <button
                        onClick={() => df.elegirIaPredeterminada(i.id)}
                        style={{ background: '#fff', color: '#047857', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                      >
                        Hacer agente
                      </button>
                    )}
                    {configurada && (
                      <button
                        onClick={() => { df.eliminarIntegracion(i.id); setAbierta(null); }}
                        style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                      >
                        Desconectar
                      </button>
                    )}
                    <button onClick={() => setAbierta(null)} style={{ background: 'transparent', color: '#64748B', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <button onClick={() => (i.campos ? abrir(i.id) : i.action())} style={i.btnStyle}>
                {abiertaEsta ? 'Cerrar' : i.btnLabel}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
