import { useState } from 'react';
import { SearchInput, Chip, ChipRow } from '../components/Filters';
import type { DealFlowState } from '../hooks/useDealFlowState';

export function Leads({ df }: { df: DealFlowState }) {
  const lead = df.lead;
  const [busca, setBusca] = useState('');
  const [etapa, setEtapa] = useState('');
  const etapas = Array.from(new Set(df.leads.map((l) => l.etapa).filter(Boolean)));
  const q = busca.trim().toLowerCase();
  const leadsFiltrados = df.leads.filter(
    (l) => (!etapa || l.etapa === etapa) && (!q || l.nombre.toLowerCase().includes(q) || (l.ultimo || '').toLowerCase().includes(q)),
  );
  return (
    <section data-screen-label="Leads">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Leads</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 14px' }}>Conversaciones abiertas. Asígnalas a un agente o al asistente.</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nombre o mensaje…" width={240} />
        {etapas.length > 0 && (
          <ChipRow>
            <Chip active={!etapa} onClick={() => setEtapa('')}>Todos</Chip>
            {etapas.map((e) => (
              <Chip key={e} active={etapa === e} onClick={() => setEtapa(etapa === e ? '' : e)} count={df.leads.filter((l) => l.etapa === e).length}>{e}</Chip>
            ))}
          </ChipRow>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'auto', maxHeight: 'min(70vh, 620px)', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          {leadsFiltrados.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Ningún lead coincide con el filtro.</div>
          )}
          {leadsFiltrados.map((l) => (
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
              {df.hasAvisoLead && <div style={{ width: '100%', color: '#059669', fontSize: 13, fontWeight: 600 }}>{df.avisoLead}</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
