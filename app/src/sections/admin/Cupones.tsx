import { useEffect, useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';

export function Cupones({ df }: { df: DealFlowState }) {
  const [codigo, setCodigo] = useState('');
  const [descuento, setDescuento] = useState('');
  const [vence, setVence] = useState('');
  const [maxUsos, setMaxUsos] = useState('');
  const [nota, setNota] = useState('');
  const [armed, setArmed] = useState('');

  useEffect(() => { void df.reloadCupones(); }, []);

  const crear = () => {
    df.crearCupon(codigo, Number(descuento), vence || null, maxUsos ? Number(maxUsos) : null, nota);
    setCodigo(''); setDescuento(''); setVence(''); setMaxUsos(''); setNota('');
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };

  return (
    <section data-screen-label="Admin Cupones">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Cupones 🎁</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Descuentos que das a las tiendas. Aplican a la instalación y a la renta. Un cupón del 100% activa la cuenta gratis.</p>

      {/* Crear cupón */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', maxWidth: 820, marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Crear cupón</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Código</div>
            <input value={codigo} onChange={(e) => { setCodigo(e.target.value.toUpperCase()); df.clearCuponMsg(); }} placeholder="Ej: BIENVENIDA" style={{ ...inp, textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Descuento (%)</div>
            <input value={descuento} onChange={(e) => { setDescuento(e.target.value.replace(/[^0-9]/g, '').slice(0, 3)); df.clearCuponMsg(); }} placeholder="Ej: 50 · 100 = gratis" style={{ ...inp, fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Vence (opcional)</div>
            <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} style={inp} />
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Máximo de usos (opcional)</div>
            <input value={maxUsos} onChange={(e) => setMaxUsos(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Vacío = ilimitado" style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Nota interna (opcional)</div>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: Campaña de lanzamiento agosto" style={inp} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={crear} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Crear cupón</button>
          {df.cuponMsg && <span style={{ color: '#DC2626', fontSize: 13 }}>{df.cuponMsg}</span>}
        </div>
      </div>

      {/* Lista de cupones */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 2px rgba(15,23,42,.04)', maxWidth: 820, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 80px 1fr 90px auto', gap: 12, padding: '11px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 12, fontWeight: 700, color: '#64748B' }}>
          <span>Código</span><span>Desc.</span><span>Vence / usos</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>
        {df.cupones.length === 0 && <div style={{ padding: 20, color: '#94A3B8', fontSize: 13.5, textAlign: 'center' }}>Aún no has creado cupones.</div>}
        {df.cupones.map((c) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 80px 1fr 90px auto', gap: 12, alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13.5 }}>{c.codigo}{c.nota ? <span style={{ display: 'block', fontFamily: 'inherit', fontWeight: 400, fontSize: 11.5, color: '#94A3B8' }}>{c.nota}</span> : null}</span>
            <span style={{ fontWeight: 800, color: c.descuento === 100 ? '#7C3AED' : '#047857' }}>{c.descuento}%</span>
            <span style={{ fontSize: 12.5, color: '#64748B' }}>
              {c.vence ? `Vence ${c.vence}` : 'Sin vencimiento'}<br />
              Usos: {c.usos}{c.maxUsos != null ? ` / ${c.maxUsos}` : ' (ilimitado)'}
            </span>
            <span>
              <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', color: c.activo ? '#047857' : '#B91C1C', background: c.activo ? '#D1FAE5' : '#FEE2E2' }}>{c.activo ? 'Activo' : 'Inactivo'}</span>
            </span>
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => df.toggleCupon(c.id, !c.activo)} style={{ background: 'transparent', border: 'none', color: '#334155', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>{c.activo ? 'Desactivar' : 'Activar'}</button>
              <button
                onClick={() => { if (armed === c.id) { df.eliminarCupon(c.id); setArmed(''); } else setArmed(c.id); }}
                style={{ background: 'transparent', border: 'none', color: '#B91C1C', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}
              >{armed === c.id ? '¿Seguro?' : 'Eliminar'}</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
