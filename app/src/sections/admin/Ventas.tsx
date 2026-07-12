import type { DealFlowState } from '../../hooks/useDealFlowState';
import { fmt } from '../../lib/format';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

export function Ventas({ df }: { df: DealFlowState }) {
  const activas = df.accounts.filter((a) => a.activa).length;
  const inactivas = df.accounts.length - activas;
  const ventasTiendas = df.accounts.reduce((s, a) => s + (a.ventas || 0), 0);
  const precioPorPlan: Record<string, number> = Object.fromEntries(df.plans.map((p) => [p.nombre, p.precio]));
  const mrr = df.accounts.filter((a) => a.activa).reduce((s, a) => s + (precioPorPlan[a.plan] || 0), 0);

  return (
    <section data-screen-label="Admin Ventas">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Ventas</h1>
      <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 18px' }}>Cómo va DealFlow este mes, en todas las cuentas.</p>

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <div style={card}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ingreso mensual (MRR)</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{fmt(mrr)}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>según los planes activos</div>
        </div>
        <div style={card}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cuentas activas</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{activas}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>{inactivas} inactiva{inactivas === 1 ? '' : 's'}</div>
        </div>
        <div style={card}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ventas de las tiendas</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{fmt(ventasTiendas)}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>este mes, sumando todas</div>
        </div>
        <div style={card}>
          <div style={{ color: '#64748B', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Total de cuentas</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{df.accounts.length}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>tiendas en DealFlow</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 110px', gap: 14, padding: '11px 18px', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          <span>Tienda</span>
          <span>Plan</span>
          <span>Ventas del mes</span>
          <span>Estado</span>
        </div>
        {df.accounts.map((a) => (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 110px', gap: 14, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.tienda}</div>
              <div style={{ color: '#94A3B8', fontSize: 12 }}>{a.correo}</div>
            </div>
            <span style={{ fontSize: 13, color: '#64748B' }}>{a.plan}</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{a.ventasFmt}</span>
            <span style={a.estadoStyle}>{a.estadoLabel}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
