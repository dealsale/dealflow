import type { DealFlowState } from '../../hooks/useDealFlowState';
import { fmt } from '../../lib/format';

export function Superadmin({ df }: { df: DealFlowState }) {
  const visibles = df.superStores.filter((s) => !s.oculta).length;
  const ocultas = df.superStores.length - visibles;
  return (
    <section data-screen-label="Superadmin">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Todas las tiendas</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>
          Panel de superadmin. Ocultar una tienda la deja funcionando igual, pero deja de contar para el admin (ni en la lista, ni en ventas, ni en pagos).
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{df.superStores.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600 }}>Visibles para el admin</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#047857' }}>{visibles}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600 }}>Fantasma (ocultas)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#6D28D9' }}>{ocultas}</div>
        </div>
      </div>

      {df.superStores.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: '#64748B', fontSize: 14 }}>
          No hay tiendas todavía.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 130px 120px 160px', gap: 14, padding: '11px 18px', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <span>Tienda</span>
            <span>Plan</span>
            <span>Ventas del mes</span>
            <span>Estado</span>
            <span>Visibilidad</span>
          </div>
          {df.superStores.map((s) => (
            <div
              key={s.id}
              style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 130px 120px 160px', gap: 14, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #F1F5F9', background: s.oculta ? '#FAF5FF' : '#fff' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.tienda}</div>
                <div style={{ color: '#94A3B8', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.correo}</div>
              </div>
              <span style={{ fontSize: 13, color: '#64748B' }}>Plan {s.plan}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{s.ventas > 0 ? fmt(s.ventas) : '—'}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: s.activa ? '#047857' : '#B91C1C', background: s.activa ? '#D1FAE5' : '#FEE2E2', borderRadius: 6, padding: '3px 9px', justifySelf: 'start' }}>
                {s.activa ? 'Activa' : 'Inactiva'}
              </span>
              <button
                onClick={() => df.toggleHideStore(s.id, s.oculta)}
                style={{
                  border: '1px solid ' + (s.oculta ? '#6D28D9' : '#E2E8F0'),
                  background: s.oculta ? '#6D28D9' : '#fff',
                  color: s.oculta ? '#fff' : '#334155',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.oculta ? '👻 Oculta · Mostrar' : 'Ocultar del admin'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
