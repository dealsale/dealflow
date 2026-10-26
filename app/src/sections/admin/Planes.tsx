import { useEffect, useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { apiCambiarPrecioServicio, apiPreciosServicios, type PrecioServicio } from '../../lib/api';

export function Planes({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Admin Planes">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Planes</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px' }}>Lo que pagan las tiendas por usar DealFlow.</p>

      {df.planMsg && <div style={{ background: 'var(--df-danger-subtle)', border: '1px solid var(--df-danger-border)', color: 'var(--df-danger-dark)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{df.planMsg}</div>}

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {df.plans.map((pl) => {
          const editing = df.editPlanId === String(pl.id);
          const armed = df.armedDeletePlanId === String(pl.id);
          const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, marginBottom: 8 };
          return (
            <div key={pl.id} style={{ background: 'var(--df-surface)', border: '1px solid ' + (editing ? 'var(--df-purple-border)' : 'var(--df-border)'), borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
              {editing ? (
                <>
                  <input className="df-input" value={df.editPlanForm.nombre} onChange={(e) => df.setEditPlanForm({ nombre: e.target.value })} placeholder="Nombre" style={inp} />
                  <input className="df-input" value={df.editPlanForm.precio} onChange={(e) => df.setEditPlanForm({ precio: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Precio (COP)" style={{ ...inp, fontFamily: "'JetBrains Mono',monospace" }} />
                  <textarea className="df-input" value={df.editPlanForm.features} onChange={(e) => df.setEditPlanForm({ features: e.target.value })} placeholder="Beneficios separados por comas" rows={3} style={{ ...inp, resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={df.guardarEditarPlan} className="df-btn-primary" style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Guardar</button>
                    <button onClick={() => df.abrirEditarPlan('')} style={{ background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{pl.nombre}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 2 }}>
                    {pl.precioFmt}
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--df-text-muted)' }}> /mes</span>
                  </div>
                  <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 12 }}>{pl.cuentasLabel}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {pl.features.map((ft, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--df-text-strong)' }}>
                        <span style={{ color: 'var(--df-brand)' }}>✓</span>
                        <span>{ft}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--df-border)', paddingTop: 10 }}>
                    <button onClick={() => df.abrirEditarPlan(String(pl.id))} style={{ background: 'transparent', border: 'none', color: 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Editar</button>
                    <button onClick={() => df.eliminarPlan(String(pl.id))} style={{ background: 'transparent', border: 'none', color: 'var(--df-danger-dark)', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>{armed ? '¿Seguro?' : 'Eliminar'}</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', maxWidth: 720 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Crear plan</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Nombre del plan</div>
            <input
              className="df-input"
              value={df.planNombre}
              onChange={(e) => df.setPlanNombre(e.target.value)}
              placeholder="Ej: Empresarial"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio mensual (COP)</div>
            <input
              className="df-input"
              value={df.planPrecio}
              onChange={(e) => df.setPlanPrecio(e.target.value)}
              placeholder="Ej: 299900"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Qué incluye (separado por comas)</div>
          <input
            className="df-input"
            value={df.planDesc}
            onChange={(e) => df.setPlanDesc(e.target.value)}
            placeholder="Ej: 5 números de WhatsApp, API, soporte dedicado"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={df.crearPlan}
            className="df-btn-primary"
            style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            Crear plan
          </button>
          {df.planError && <span style={{ color: 'var(--df-danger)', fontSize: 13 }}>Falta el nombre o el precio. Complétalos y vuelve a intentar.</span>}
        </div>
      </div>
      <PreciosServicios />
    </section>
  );
}

/**
 * Precios de los servicios que se cobran aparte del plan (hoy la membresía de Tienda en
 * línea; luego, microtransacciones). Cada tienda los paga por Wompi con el precio de aquí.
 */
function PreciosServicios() {
  const [lista, setLista] = useState<PrecioServicio[] | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => { void apiPreciosServicios().then((r) => { if (r.data) setLista(r.data.precios); }); }, []);
  const guardar = async (p: PrecioServicio) => {
    const r = await apiCambiarPrecioServicio(p.clave, Number(borrador[p.clave] ?? p.precio) || 0);
    setMsg((m) => ({ ...m, [p.clave]: r.error || '✓ Guardado' }));
    if (r.data) { setLista((l) => l && l.map((x) => (x.clave === p.clave ? r.data!.precio : x))); setBorrador((b) => { const n = { ...b }; delete n[p.clave]; return n; }); }
  };
  const unidad = { mes: '/mes', unico: 'pago único', uso: 'por uso' } as const;
  return (
    <div style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Servicios adicionales</h2>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 13.5, margin: '0 0 14px' }}>Lo que las tiendas pagan aparte de su plan, por Wompi. Precio 0 = gratis.</p>
      {!lista ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {lista.map((p) => {
            const v = borrador[p.clave] ?? String(p.precio);
            const cambio = v !== String(p.precio);
            return (
              <div key={p.clave} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.nombre}</div>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '3px 0 12px' }}>{p.descripcion}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--df-text-faint)' }}>$</span>
                  <input className="df-input" inputMode="numeric" value={Number(v || 0).toLocaleString('es-CO')} onChange={(e) => setBorrador((b) => ({ ...b, [p.clave]: e.target.value.replace(/\D/g, '') }))}
                    style={{ flex: 1, border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 14 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', whiteSpace: 'nowrap' }}>{unidad[p.unidad] || ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <button onClick={() => void guardar(p)} disabled={!cambio} className="df-btn-primary" style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: cambio ? 'pointer' : 'default', opacity: cambio ? 1 : 0.5 }}>Guardar</button>
                  {msg[p.clave] && <span style={{ fontSize: 12.5, color: msg[p.clave].startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg[p.clave]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
