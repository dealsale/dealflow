import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

const ICONO: Record<string, string> = {
  'ecommerce-v10': '🛍️', 'soporte-tecnico': '🛠️', 'atencion-cliente': '💬', reservas: '📅', educacion: '🎓',
};

export function DealShop({ df }: { df: DealFlowState }) {
  const [desinst, setDesinst] = useState<{ id: string; nombre: string } | null>(null);
  return (
    <section data-screen-label="DealShop">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>DealShop</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>
          Plantillas listas para tu tienda. Instálalas con un clic y tu asistente queda configurado para vender, sin escribir nada.
        </p>
      </div>

      {df.plantillaMsg && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, marginBottom: 14 }}>
          {df.plantillaMsg}
        </div>
      )}

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {df.plantillas.map((p) => (
          <div key={p.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: 'linear-gradient(140deg,#34D399,#059669)', color: '#052018', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
                {ICONO[p.id] || '🛍️'}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>{p.nombre}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: p.precio === 0 ? '#047857' : '#B45309', background: p.precio === 0 ? '#D1FAE5' : '#FEF3C7', borderRadius: 6, padding: '2px 8px' }}>
                    {p.precio === 0 ? 'Gratis' : '$' + p.precio.toLocaleString('es-CO')}
                  </span>
                  {p.instalada && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#4338CA', background: '#E0E7FF', borderRadius: 6, padding: '2px 8px' }}>Instalada</span>}
                </div>
              </div>
            </div>

            <p style={{ color: '#64748B', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 14px' }}>{p.descripcion}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              {p.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13 }}>
                  <span style={{ color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ color: '#334155', lineHeight: 1.45 }}>{f}</span>
                </div>
              ))}
            </div>

            <div style={{ flex: 1 }} />
            {p.instalada ? (
              <button
                onClick={() => df.instalando !== 'reinstalar:' + p.id && df.instalarPlantilla(p.id, true)}
                disabled={df.instalando === 'reinstalar:' + p.id}
                title="Vuelve a dejar tu asistente y el producto de ejemplo tal cual la plantilla (úsalo si tu tienda quedó vacía)."
                style={{
                  width: '100%',
                  background: '#F1F5F9',
                  color: '#334155',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: df.instalando === 'reinstalar:' + p.id ? 'default' : 'pointer',
                }}
              >
                {df.instalando === 'reinstalar:' + p.id ? 'Reinstalando…' : '↻ Reinstalar plantilla'}
              </button>
            ) : null}
            {p.instalada && (
              <button
                onClick={() => setDesinst({ id: p.id, nombre: p.nombre })}
                style={{ width: '100%', background: 'transparent', color: '#B91C1C', border: 'none', borderRadius: 10, padding: '9px 16px', marginTop: 6, fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Desinstalar
              </button>
            )}
            {!p.instalada && (
              <button
                onClick={() => df.instalando !== p.id && df.instalarPlantilla(p.id)}
                disabled={df.instalando === p.id}
                className="df-btn-primary"
                style={{
                  width: '100%',
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: df.instalando === p.id ? 'default' : 'pointer',
                }}
              >
                {df.instalando === p.id ? 'Instalando…' : 'Instalar con un clic'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ color: '#94A3B8', fontSize: 12.5, marginTop: 16 }}>
        Pronto habrá más plantillas (algunas premium) para distintos tipos de negocio.
      </div>

      {desinst && (
        <div onClick={() => setDesinst(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 26, width: 440, maxWidth: '100%', boxShadow: '0 30px 80px -20px rgba(0,0,0,.5)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Desinstalar «{desinst.nombre}»</div>
            <div style={{ color: '#64748B', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
              ¿Quieres borrar también los <b>productos/servicios</b> que trajo esta plantilla? En ambos casos se limpian el prompt, las reglas y las instrucciones del asistente.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { df.desinstalarPlantilla(desinst.id, true); setDesinst(null); }}
                style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                🗑️ Sí, borrar todo (asistente + productos)
              </button>
              <button
                onClick={() => { df.desinstalarPlantilla(desinst.id, false); setDesinst(null); }}
                style={{ background: '#fff', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                No, solo quitar el asistente (conserva mis productos)
              </button>
              <button onClick={() => setDesinst(null)} style={{ background: 'transparent', color: '#64748B', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '4px' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
