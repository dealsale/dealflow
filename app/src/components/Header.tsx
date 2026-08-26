import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { IconBell } from './icons';

/** Selector de tienda: cambia entre las tiendas del dueño y permite crear otra. */
function StoreSwitcher({ df }: { df: DealFlowState }) {
  const [open, setOpen] = useState(false);
  const tiendas = df.misTiendas;
  const varias = tiendas.length > 1;
  const nuevaTienda = () => {
    const nombre = window.prompt('Nombre de la nueva tienda (paga $250.000/mes, con su propio número):');
    if (nombre && nombre.trim()) df.crearTienda(nombre.trim());
  };
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, color: '#0F172A', cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }}
      >
        {df.headerTitle}
        <span style={{ fontSize: 10, color: '#94A3B8' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 20px 50px -15px rgba(0,0,0,.3)', padding: 6, minWidth: 240, zIndex: 41 }}>
            {varias && <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', padding: '6px 10px' }}>MIS TIENDAS</div>}
            {tiendas.map((t) => (
              <div
                key={t.id}
                onClick={() => { if (!t.activa) df.cambiarTienda(t.id); else setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, cursor: t.activa ? 'default' : 'pointer', background: t.activa ? '#F0FDF4' : 'transparent' }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{t.nombre}</span>
                {t.bloqueada && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', borderRadius: 5, padding: '1px 6px' }}>pago pendiente</span>}
                {t.activa && <span style={{ fontSize: 12, color: '#059669' }}>✓</span>}
              </div>
            ))}
            <div style={{ borderTop: '1px solid #F1F5F9', margin: '4px 0' }} />
            <div onClick={() => { setOpen(false); nuevaTienda(); }} style={{ padding: '9px 10px', borderRadius: 8, cursor: 'pointer', color: '#059669', fontWeight: 700, fontSize: 13.5 }}>
              + Crear otra tienda
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Header({ df }: { df: DealFlowState }) {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 28px', height: 58, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      {df.isVendedor && !df.esAgente ? <StoreSwitcher df={df} /> : <span style={{ fontWeight: 700, fontSize: 15 }}>{df.headerTitle}</span>}
      {df.isVendedor && (
        <span style={df.waPill}>
          <span style={df.waDot} />
          {df.waLabel}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          onClick={df.toggleSound}
          className="df-close-hover"
          title={df.soundOn ? 'Sonido de pedidos: activado. Toca para silenciar.' : 'Sonido de pedidos: silenciado. Toca para activarlo.'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: df.soundOn ? '#64748B' : '#CBD5E1' }}
        >
          <IconBell muted={!df.soundOn} />
        </span>
        <span style={{ color: '#64748B', fontSize: 13 }}>{df.userLabel}</span>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
          {df.userInitials}
        </div>
      </div>
    </header>
  );
}
