import { useEffect, useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';

export function Cupones({ df }: { df: DealFlowState }) {
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState<'porcentaje' | 'monto'>('porcentaje');
  const [descuento, setDescuento] = useState('');
  const [montoFijo, setMontoFijo] = useState('');
  const [vence, setVence] = useState('');
  const [maxUsos, setMaxUsos] = useState('');
  const [nota, setNota] = useState('');
  const [armed, setArmed] = useState('');

  useEffect(() => { void df.reloadCupones(); }, []);

  const crear = () => {
    df.crearCupon({
      codigo,
      tipo,
      descuento: tipo === 'porcentaje' ? Number(descuento) : undefined,
      montoFijo: tipo === 'monto' ? Number(montoFijo || 0) : undefined,
      vence: vence || null,
      maxUsos: maxUsos ? Number(maxUsos) : null,
      nota,
    });
    setCodigo(''); setDescuento(''); setMontoFijo(''); setVence(''); setMaxUsos(''); setNota('');
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };

  return (
    <section data-screen-label="Admin Cupones">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Cupones 🎁</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px' }}>Descuentos que das a las tiendas. Aplican a la instalación y a la renta. Un cupón del 100% activa la cuenta gratis.</p>

      {/* Crear cupón */}
      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', maxWidth: 820, marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Crear cupón</div>
        {/* Tipo de cupón */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Tipo de cupón</div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }}>
            {(['porcentaje', 'monto'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTipo(t); df.clearCuponMsg(); }}
                style={{ background: tipo === t ? 'var(--df-brand)' : 'var(--df-surface)', color: tipo === t ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '8px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t === 'porcentaje' ? 'Por porcentaje (%)' : 'Precio fijo ($)'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Código</div>
            <input value={codigo} onChange={(e) => { setCodigo(e.target.value.toUpperCase()); df.clearCuponMsg(); }} placeholder="Ej: BIENVENIDA" style={{ ...inp, textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          {tipo === 'porcentaje' ? (
            <div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Descuento (%)</div>
              <input value={descuento} onChange={(e) => { setDescuento(e.target.value.replace(/[^0-9]/g, '').slice(0, 3)); df.clearCuponMsg(); }} placeholder="Ej: 50 · 100 = gratis" style={{ ...inp, fontFamily: "'JetBrains Mono',monospace" }} />
            </div>
          ) : (
            <div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio a pagar (COP)</div>
              <input value={montoFijo} onChange={(e) => { setMontoFijo(e.target.value.replace(/[^0-9]/g, '')); df.clearCuponMsg(); }} placeholder="Ej: 1000 · 0 = gratis" style={{ ...inp, fontFamily: "'JetBrains Mono',monospace" }} />
            </div>
          )}
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Vence (opcional)</div>
            <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} style={inp} />
          </div>
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Máximo de usos (opcional)</div>
            <input value={maxUsos} onChange={(e) => setMaxUsos(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Vacío = ilimitado" style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Nota interna (opcional)</div>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: Campaña de lanzamiento agosto" style={inp} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={crear} style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Crear cupón</button>
          {df.cuponMsg && <span style={{ color: 'var(--df-danger)', fontSize: 13 }}>{df.cuponMsg}</span>}
        </div>
      </div>

      {/* Lista de cupones */}
      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', maxWidth: 820, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 80px 1fr 90px auto', gap: 12, padding: '11px 18px', background: 'var(--df-bg)', borderBottom: '1px solid var(--df-border)', fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>
          <span>Código</span><span>Desc.</span><span>Vence / usos</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>
        {df.cupones.length === 0 && <div style={{ padding: 20, color: 'var(--df-text-faint)', fontSize: 13.5, textAlign: 'center' }}>Aún no has creado cupones.</div>}
        {df.cupones.map((c) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 80px 1fr 90px auto', gap: 12, alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--df-border)' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13.5 }}>{c.codigo}{c.nota ? <span style={{ display: 'block', fontFamily: 'inherit', fontWeight: 400, fontSize: 11.5, color: 'var(--df-text-faint)' }}>{c.nota}</span> : null}</span>
            <span style={{ fontWeight: 800, color: 'var(--df-brand-dark)', fontSize: c.montoFijo != null ? 12.5 : 14 }}>
              {c.montoFijo != null ? (c.montoFijo <= 0 ? 'GRATIS' : '$' + c.montoFijo.toLocaleString('es-CO')) : c.descuento + '%'}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
              {c.vence ? `Vence ${c.vence}` : 'Sin vencimiento'}<br />
              Usos: {c.usos}{c.maxUsos != null ? ` / ${c.maxUsos}` : ' (ilimitado)'}
            </span>
            <span>
              <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', color: c.activo ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', background: c.activo ? 'var(--df-brand-subtle)' : 'var(--df-danger-subtle-2)' }}>{c.activo ? 'Activo' : 'Inactivo'}</span>
            </span>
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => df.toggleCupon(c.id, !c.activo)} style={{ background: 'transparent', border: 'none', color: 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>{c.activo ? 'Desactivar' : 'Activar'}</button>
              <button
                onClick={() => { if (armed === c.id) { df.eliminarCupon(c.id); setArmed(''); } else setArmed(c.id); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--df-danger-dark)', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}
              >{armed === c.id ? '¿Seguro?' : 'Eliminar'}</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
