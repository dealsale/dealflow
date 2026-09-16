import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

const card: React.CSSProperties = {
  background: 'var(--df-surface)',
  border: '1px solid var(--df-border)',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,.04)',
};

const stepCircle = (bg: string, color: string): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: bg,
  color,
  fontWeight: 700,
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export function Resumen({ df }: { df: DealFlowState }) {
  const [suscAbierta, setSuscAbierta] = useState(false);
  return (
    <section data-screen-label="Resumen">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Hola, {df.saludoNombre} 👋</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 18px' }}>Así va tu tienda hoy, {df.resumenFecha}.</p>

      {df.suscripcion && !df.esAgente && (
        <div style={{ ...card, padding: 0, marginBottom: 18, borderLeft: '4px solid var(--df-brand)', overflow: 'hidden' }}>
          <div
            onClick={() => setSuscAbierta((v) => !v)}
            className="df-row-hover"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 18, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Tu plan:</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{df.suscripcion.plan}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)' }}>Activa</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--df-text-faint)', transform: suscAbierta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
          </div>
          {suscAbierta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '0 18px 18px' }}>
              <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
                Renta ${df.suscripcion.mensual.toLocaleString('es-CO')}/mes
                {df.suscripcion.vence ? ` · próximo pago: ${df.suscripcion.vence}${df.suscripcion.diasRestantes !== null && df.suscripcion.diasRestantes >= 0 ? ` (en ${df.suscripcion.diasRestantes} días)` : ''}` : ''}
              </div>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => df.pagarSuscripcion()}
                className="df-btn-primary"
                style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Pagar renta · ${df.suscripcion.mensual.toLocaleString('es-CO')}
              </button>
            </div>
          )}
        </div>
      )}
      {df.suscMsg && (
        <div style={{ background: 'var(--df-brand-subtle-2)', border: '1px solid var(--df-brand-border)', color: 'var(--df-brand-dark)', borderRadius: 10, padding: '11px 14px', fontSize: 13, marginBottom: 18 }}>{df.suscMsg}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <div onClick={() => df.go('pedidos')} className="df-card-hover-amber" style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Pedidos nuevos</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--df-warning-mid)' }}>{df.newOrdersCount}</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, marginTop: 4 }}>por confirmar</div>
        </div>
        <div style={card}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ventas de hoy</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{df.ventasHoy}</div>
          <div style={{ color: df.ventasComparacionColor, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{df.ventasComparacion}</div>
        </div>
        <div onClick={() => df.go('leads')} className="df-card-hover-green" style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Leads activos</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{df.leadsCount}</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, marginTop: 4 }}>conversaciones abiertas</div>
        </div>
        <div onClick={() => df.go('productos')} className="df-card-hover-green" style={{ ...card, cursor: 'pointer' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Productos</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{df.productCount}</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, marginTop: 4 }}>en tu catálogo, listos para la IA</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Así trabaja tu asistente</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={stepCircle('var(--df-brand-subtle-2)', 'var(--df-brand)')}>1</div>
                <div style={{ width: 2, flex: 1, background: 'var(--df-border)', margin: '4px 0' }} />
              </div>
              <div style={{ paddingBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>El cliente escribe a tu WhatsApp</div>
                <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginTop: 2 }}>Pregunta por un producto, un precio o un envío.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={stepCircle('var(--df-brand-subtle-2)', 'var(--df-brand)')}>2</div>
                <div style={{ width: 2, flex: 1, background: 'var(--df-border)', margin: '4px 0' }} />
              </div>
              <div style={{ paddingBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>El asistente responde y vende</div>
                <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginTop: 2 }}>Usa tu catálogo, tus combos y tus reglas para cerrar la venta.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={stepCircle('var(--df-warning-subtle-2)', 'var(--df-warning-mid)')}>3</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>El pedido entra aquí, listo para despachar</div>
                <div style={{ color: 'var(--df-text-muted)', fontSize: 13, marginTop: 2 }}>Tú solo lo confirmas y lo avanzas con un toque.</div>
              </div>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Pedidos recientes</span>
            <div style={{ flex: 1 }} />
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                df.go('pedidos');
              }}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              Ver todos
            </a>
          </div>
          {df.recentOrders.map((o) => (
            <div
              key={o.id}
              onClick={o.open}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--df-border)', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-muted)' }}>{o.id}</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.cliente}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{o.totalFmt}</span>
              <span style={o.pillStyle}>{o.estado}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
