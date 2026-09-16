import type { DealFlowState } from '../hooks/useDealFlowState';

const label = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };

export function Equipo({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Equipo">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Equipo</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Solo responden el asistente y las personas que agregues aquí. Cada una entra con su correo y contraseña.
        </p>
      </div>

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 16 }}>
        {df.team.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--df-border)' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--df-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {m.nombre.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {m.nombre}
                {m.esDueno && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-warning)', background: 'var(--df-warning-subtle)', borderRadius: 6, padding: '2px 8px' }}>Dueño</span>}
                {m.esTu && !m.esDueno && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 8px' }}>Tú</span>}
                {!m.esDueno && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-indigo)', background: 'var(--df-indigo-subtle)', borderRadius: 6, padding: '2px 8px' }}>Agente</span>}
              </div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, marginTop: 1 }}>{m.email}</div>
            </div>
            {m.esDueno ? (
              <span style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>Acceso total</span>
            ) : m.esTu ? (
              <span style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>Este eres tú</span>
            ) : (
              <button
                onClick={m.remove}
                style={
                  m.armed
                    ? { background: 'var(--df-danger)', color: '#fff', border: '1px solid var(--df-danger)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                    : { background: 'var(--df-surface)', color: 'var(--df-danger)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }
                }
              >
                {m.armed ? '¿Seguro? Sí, quitar' : 'Quitar'}
              </button>
            )}
          </div>
        ))}
        {df.team.length === 0 && (
          <div style={{ padding: '28px 18px', color: 'var(--df-text-muted)', fontSize: 13.5, textAlign: 'center' }}>Cargando tu equipo…</div>
        )}
      </div>

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Agregar agente al equipo</div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5, marginBottom: 16 }}>
          Entra con su propio correo y contraseña. Un <b style={{ color: 'var(--df-indigo)' }}>agente</b> ve solo Productos, CRM, Leads, Pedidos y Marketing.
          No accede a la conexión de WhatsApp, al Asistente ni al Equipo. Cuando responde un chat, queda a su nombre.
        </div>
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
            style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.teamSaving ? 'default' : 'pointer', opacity: df.teamSaving ? 0.7 : 1 }}
          >
            {df.teamSaving ? 'Agregando…' : 'Agregar al equipo'}
          </button>
          {df.teamError && <span style={{ color: 'var(--df-danger)', fontSize: 13 }}>{df.teamError}</span>}
        </div>
      </div>
    </section>
  );
}
