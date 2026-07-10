import type { DealFlowState } from '../hooks/useDealFlowState';

export function Promos({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Promos">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Promos</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>El asistente las ofrece solo cuando aplican.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={df.toggleNewPromo}
          className="df-btn-primary"
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          + Nueva promo
        </button>
      </div>

      {df.newPromoOpen && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Nueva promo</div>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Tipo</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['Promoción', 'Combo'] as const).map((t) => {
              const active = df.promoTipo === t;
              return (
                <span
                  key={t}
                  onClick={() => df.setPromoTipo(t)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: active ? (t === 'Combo' ? '#FEF3C7' : '#D1FAE5') : '#fff',
                    color: active ? (t === 'Combo' ? '#B45309' : '#047857') : '#64748B',
                    border: '1px solid ' + (active ? (t === 'Combo' ? '#FDE68A' : '#A7F3D0') : '#E2E8F0'),
                  }}
                >
                  {t}
                </span>
              );
            })}
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Título</div>
              <input
                className="df-input"
                value={df.promoTitulo}
                onChange={(e) => df.setPromoTitulo(e.target.value)}
                placeholder="Ej: 2 gorras por $69.900"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
            <div>
              <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Vigencia (opcional)</div>
              <input
                className="df-input"
                value={df.promoVigencia}
                onChange={(e) => df.setPromoVigencia(e.target.value)}
                placeholder="Ej: Vence el 31 de agosto"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Descripción · explícale al asistente cuándo aplica</div>
            <input
              className="df-input"
              value={df.promoDesc}
              onChange={(e) => df.setPromoDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') df.crearPromo();
              }}
              placeholder="Ej: Aplica a la gorra bordada en cualquier color, cuando piden 2 o más."
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={df.crearPromo}
              className="df-btn-primary"
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Crear promo
            </button>
            <button
              onClick={df.toggleNewPromo}
              style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            {df.promoError && <span style={{ color: '#DC2626', fontSize: 13 }}>Falta el título o la descripción. Complétalos y vuelve a intentar.</span>}
          </div>
        </div>
      )}

      {df.promos.length === 0 && !df.newPromoOpen && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '40px 24px', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aún no tienes promos.</div>
          <div style={{ color: '#64748B', fontSize: 13.5 }}>Crea la primera y el asistente la ofrece cuando aplique.</div>
          <button
            onClick={df.toggleNewPromo}
            className="df-btn-primary"
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            + Crear mi primera promo
          </button>
        </div>
      )}

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {df.promos.map((pr) => (
          <div key={pr.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={pr.badgeStyle}>{pr.tipo}</span>
              <div style={{ flex: 1 }} />
              <span onClick={pr.toggle} style={pr.estadoStyle}>
                {pr.estadoLabel}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{pr.titulo}</div>
            <div style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>{pr.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#94A3B8', fontSize: 12 }}>{pr.vigencia}</span>
              <div style={{ flex: 1 }} />
              <span
                onClick={pr.requestDelete}
                style={
                  pr.deleteArmed
                    ? { background: '#DC2626', color: '#fff', border: '1px solid #DC2626', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
                    : { color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
                }
              >
                {pr.deleteArmed ? '¿Seguro? Sí, eliminar' : 'Eliminar'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
