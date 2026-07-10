import type { DealFlowState } from '../../hooks/useDealFlowState';

const labelStyle: React.CSSProperties = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };

export function Cuentas({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Admin Cuentas">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Cuentas</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>Crea tiendas y actívalas o desactívalas con el interruptor.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={df.toggleNewAccount}
          className="df-btn-primary"
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          + Nueva cuenta
        </button>
      </div>

      {df.newAccountOpen && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Nueva cuenta de tienda</div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={labelStyle}>Nombre de la tienda</div>
              <input className="df-input" value={df.accForm.nombre} onChange={(e) => df.setAccForm({ nombre: e.target.value })} placeholder="Ej: Moda Urbana MDE" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Correo (con este entra)</div>
              <input className="df-input" value={df.accForm.correo} onChange={(e) => df.setAccForm({ correo: e.target.value })} placeholder="hola@modaurbana.co" style={inputStyle} />
            </div>
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={labelStyle}>Contraseña</div>
              <input className="df-input" type="password" value={df.accForm.password} onChange={(e) => df.setAccForm({ password: e.target.value })} placeholder="Mínimo 6 caracteres" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Plan</div>
              <select
                value={df.accForm.plan}
                onChange={(e) => df.setAccForm({ plan: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer', background: '#fff' }}
              >
                {df.planNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={df.crearCuenta}
              disabled={df.accSaving}
              className="df-btn-primary"
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: df.accSaving ? 0.7 : 1 }}
            >
              {df.accSaving ? 'Creando…' : 'Crear cuenta'}
            </button>
            <button
              onClick={df.toggleNewAccount}
              style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            {df.accError && <span style={{ color: '#DC2626', fontSize: 13 }}>{df.accError}</span>}
          </div>
        </div>
      )}

      {df.accCreated && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          ✓ {df.accCreated}
        </div>
      )}

      {df.accounts.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#64748B', fontSize: 14, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          Aún no hay tiendas. Crea la primera con «+ Nueva cuenta».
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          {df.accounts.map((a) => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 110px 60px', gap: 14, alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.tienda}</div>
                <div style={{ color: '#94A3B8', fontSize: 12 }}>{a.correo}</div>
              </div>
              <span style={{ fontSize: 13, color: '#64748B' }}>Plan {a.plan}</span>
              <span style={a.estadoStyle}>{a.estadoLabel}</span>
              <div onClick={a.toggle} style={a.switchStyle}>
                <div style={a.knobStyle} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
