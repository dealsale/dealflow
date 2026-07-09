import type { DealFlowState } from '../../hooks/useDealFlowState';

export function Planes({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Admin Planes">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Planes</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Lo que pagan las tiendas por usar DealFlow.</p>

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {df.plans.map((pl) => (
          <div key={pl.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{pl.nombre}</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 2 }}>
              {pl.precioFmt}
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}> /mes</span>
            </div>
            <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 12 }}>{pl.cuentasLabel}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pl.features.map((ft, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#1E293B' }}>
                  <span style={{ color: '#059669' }}>✓</span>
                  <span>{ft}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
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
