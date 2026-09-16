import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

const ICONO: Record<string, string> = {
  'ecommerce-v10': '🛍️',
};

export function DealShop({ df }: { df: DealFlowState }) {
  const [desinst, setDesinst] = useState<{ id: string; nombre: string } | null>(null);
  return (
    <section data-screen-label="DealShop">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>DealShop</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Plantillas listas para tu tienda. Instálalas con un clic y tu asistente queda configurado para vender, sin escribir nada.
        </p>
      </div>

      {df.plantillaMsg && (
        <div style={{ background: 'var(--df-brand-subtle-2)', border: '1px solid var(--df-brand-border)', color: 'var(--df-brand-dark)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, marginBottom: 14 }}>
          {df.plantillaMsg}
        </div>
      )}

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {df.plantillas.map((p) => (
          <div key={p.id} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 22, boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: 'linear-gradient(140deg,var(--df-brand-light),var(--df-brand))', color: '#052018', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
                {ICONO[p.id] || '🛍️'}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>{p.nombre}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: p.precio === 0 ? 'var(--df-brand-dark)' : 'var(--df-warning)', background: p.precio === 0 ? 'var(--df-brand-subtle)' : 'var(--df-warning-subtle)', borderRadius: 6, padding: '2px 8px' }}>
                    {p.precio === 0 ? 'Gratis' : '$' + p.precio.toLocaleString('es-CO')}
                  </span>
                  {p.instalada && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-indigo)', background: 'var(--df-indigo-subtle)', borderRadius: 6, padding: '2px 8px' }}>Instalada</span>}
                </div>
              </div>
            </div>

            <p style={{ color: 'var(--df-text-muted)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 14px' }}>{p.descripcion}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              {p.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13 }}>
                  <span style={{ color: 'var(--df-brand)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'var(--df-text-body)', lineHeight: 1.45 }}>{f}</span>
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
                  background: 'var(--df-surface-2)',
                  color: 'var(--df-text-body)',
                  border: '1px solid var(--df-border)',
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
                style={{ width: '100%', background: 'transparent', color: 'var(--df-danger-dark)', border: 'none', borderRadius: 10, padding: '9px 16px', marginTop: 6, fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
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
                  background: 'var(--df-brand)',
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

      <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5, marginTop: 16 }}>
        Pronto habrá más plantillas (algunas premium) para distintos tipos de negocio.
      </div>

      {desinst && (
        <div onClick={() => setDesinst(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--df-surface)', borderRadius: 16, padding: 26, width: 440, maxWidth: '100%', boxShadow: '0 30px 80px -20px rgba(0,0,0,.5)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Desinstalar «{desinst.nombre}»</div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
              ¿Quieres borrar también los <b>productos/servicios</b> que trajo esta plantilla? En ambos casos se limpian el prompt, las reglas y las instrucciones del asistente.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { df.desinstalarPlantilla(desinst.id, true); setDesinst(null); }}
                style={{ background: 'var(--df-danger)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                🗑️ Sí, borrar todo (asistente + productos)
              </button>
              <button
                onClick={() => { df.desinstalarPlantilla(desinst.id, false); setDesinst(null); }}
                style={{ background: 'var(--df-surface)', color: 'var(--df-text)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                No, solo quitar el asistente (conserva mis productos)
              </button>
              <button onClick={() => setDesinst(null)} style={{ background: 'transparent', color: 'var(--df-text-muted)', border: 'none', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '4px' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
