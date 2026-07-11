import type { DealFlowState } from '../hooks/useDealFlowState';

const label = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };

export function Equipo({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Equipo">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Equipo</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>
          Solo responden el asistente y las personas que agregues aquí. Cada una entra con su correo y contraseña.
        </p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 16 }}>
        {df.team.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {m.nombre.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {m.nombre}
                {m.esDueno && <span style={{ fontSize: 11, fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: 6, padding: '2px 8px' }}>Dueño</span>}
                {m.esTu && !m.esDueno && <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: '#D1FAE5', borderRadius: 6, padding: '2px 8px' }}>Tú</span>}
              </div>
              <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 1 }}>{m.email}</div>
            </div>
            {m.esDueno || m.esTu ? (
              <span style={{ color: '#94A3B8', fontSize: 12.5 }}>Acceso total</span>
            ) : (
              <button
                onClick={m.remove}
                style={
                  m.armed
                    ? { background: '#DC2626', color: '#fff', border: '1px solid #DC2626', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                    : { background: '#fff', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                }
              >
                {m.armed ? '¿Seguro? Sí, quitar' : 'Quitar'}
              </button>
            )}
          </div>
        ))}
        {df.team.length === 0 && (
          <div style={{ padding: '28px 18px', color: '#64748B', fontSize: 13.5, textAlign: 'center' }}>Cargando tu equipo…</div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Agregar persona al equipo</div>
        <div style={{ color: '#94A3B8', fontSize: 12.5, marginBottom: 16 }}>Podrá entrar al panel, ver los chats y responder. Cuando responda, el chat queda a su nombre.</div>
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={label}>Nombre</div>
            <input className="df-input" value={df.teamForm.nombre} onChange={(e) => df.setTeamNombre(e.target.value)} placeholder="Ej: Andrés" style={input} />
          </div>
          <div>
            <div style={label}>Correo</div>
            <input className="df-input" value={df.teamForm.email} onChange={(e) => df.setTeamEmail(e.target.value)} placeholder="andres@correo.com" style={input} />
          </div>
          <div>
            <div style={label}>Contraseña</div>
            <input
              className="df-input"
              type="password"
              value={df.teamForm.password}
              onChange={(e) => df.setTeamPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') df.addTeamMember(); }}
              placeholder="Mínimo 6 caracteres"
              style={input}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={df.addTeamMember}
            disabled={df.teamSaving}
            className="df-btn-primary"
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.teamSaving ? 'default' : 'pointer', opacity: df.teamSaving ? 0.7 : 1 }}
          >
            {df.teamSaving ? 'Agregando…' : 'Agregar al equipo'}
          </button>
          {df.teamError && <span style={{ color: '#DC2626', fontSize: 13 }}>{df.teamError}</span>}
        </div>
      </div>
    </section>
  );
}
