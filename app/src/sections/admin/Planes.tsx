import type { DealFlowState } from '../../hooks/useDealFlowState';

export function Planes({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Admin Planes">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Planes</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Lo que pagan las tiendas por usar DealFlow.</p>

      {df.planMsg && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{df.planMsg}</div>}

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {df.plans.map((pl) => {
          const editing = df.editPlanId === String(pl.id);
          const armed = df.armedDeletePlanId === String(pl.id);
          const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, marginBottom: 8 };
          return (
            <div key={pl.id} style={{ background: '#fff', border: '1px solid ' + (editing ? '#C7D2FE' : '#E2E8F0'), borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
              {editing ? (
                <>
                  <input className="df-input" value={df.editPlanForm.nombre} onChange={(e) => df.setEditPlanForm({ nombre: e.target.value })} placeholder="Nombre" style={inp} />
                  <input className="df-input" value={df.editPlanForm.precio} onChange={(e) => df.setEditPlanForm({ precio: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Precio (COP)" style={{ ...inp, fontFamily: "'JetBrains Mono',monospace" }} />
                  <textarea className="df-input" value={df.editPlanForm.features} onChange={(e) => df.setEditPlanForm({ features: e.target.value })} placeholder="Beneficios separados por comas" rows={3} style={{ ...inp, resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={df.guardarEditarPlan} className="df-btn-primary" style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Guardar</button>
                    <button onClick={() => df.abrirEditarPlan('')} style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{pl.nombre}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 2 }}>
                    {pl.precioFmt}
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}> /mes</span>
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 12 }}>{pl.cuentasLabel}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {pl.features.map((ft, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#1E293B' }}>
                        <span style={{ color: '#059669' }}>✓</span>
                        <span>{ft}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                    <button onClick={() => df.abrirEditarPlan(String(pl.id))} style={{ background: 'transparent', border: 'none', color: '#334155', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Editar</button>
                    <button onClick={() => df.eliminarPlan(String(pl.id))} style={{ background: 'transparent', border: 'none', color: '#B91C1C', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>{armed ? '¿Seguro?' : 'Eliminar'}</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', maxWidth: 720 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Crear plan</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Nombre del plan</div>
            <input
              className="df-input"
              value={df.planNombre}
              onChange={(e) => df.setPlanNombre(e.target.value)}
              placeholder="Ej: Empresarial"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio mensual (COP)</div>
            <input
              className="df-input"
              value={df.planPrecio}
              onChange={(e) => df.setPlanPrecio(e.target.value)}
              placeholder="Ej: 299900"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Qué incluye (separado por comas)</div>
          <input
            className="df-input"
            value={df.planDesc}
            onChange={(e) => df.setPlanDesc(e.target.value)}
            placeholder="Ej: 5 números de WhatsApp, API, soporte dedicado"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={df.crearPlan}
            className="df-btn-primary"
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            Crear plan
          </button>
          {df.planError && <span style={{ color: '#DC2626', fontSize: 13 }}>Falta el nombre o el precio. Complétalos y vuelve a intentar.</span>}
        </div>
      </div>
    </section>
  );
}
