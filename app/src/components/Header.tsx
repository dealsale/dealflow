import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { NotificationsMenu } from './NotificationsMenu';
import { ProfileMenu } from './ProfileMenu';

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
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, color: 'var(--df-text)', cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }}
      >
        {df.headerTitle}
        <span style={{ fontSize: 10, color: 'var(--df-text-faint)' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 20px 50px -15px rgba(0,0,0,.3)', padding: 6, minWidth: 240, zIndex: 41 }}>
            {varias && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-text-faint)', padding: '6px 10px' }}>MIS TIENDAS</div>}
            {tiendas.map((t) => (
              <div
                key={t.id}
                onClick={() => { if (!t.activa) df.cambiarTienda(t.id); else setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, cursor: t.activa ? 'default' : 'pointer', background: t.activa ? 'var(--df-brand-subtle-3)' : 'transparent' }}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{t.nombre}</span>
                {t.bloqueada && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--df-danger-dark)', background: 'var(--df-danger-subtle-2)', borderRadius: 5, padding: '1px 6px' }}>pago pendiente</span>}
                {t.activa && <span style={{ fontSize: 12, color: 'var(--df-brand)' }}>✓</span>}
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--df-border)', margin: '4px 0' }} />
            <div onClick={() => { setOpen(false); nuevaTienda(); }} style={{ padding: '9px 10px', borderRadius: 8, cursor: 'pointer', color: 'var(--df-brand)', fontWeight: 700, fontSize: 13.5 }}>
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
    <header style={{ background: 'var(--df-surface)', borderBottom: '1px solid var(--df-border)', padding: '0 28px', height: 58, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <span
        onClick={df.toggleSidebar}
        className="df-hamburger"
        title={df.sidebarVisible ? 'Ocultar el menú lateral' : 'Mostrar el menú lateral'}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, marginLeft: -6, borderRadius: 8, cursor: 'pointer', color: 'var(--df-text-secondary)', flexShrink: 0 }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </span>
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
          onClick={df.toggleFloatingNav}
          className="df-close-hover"
          title={df.floatingNav ? 'Botón flotante de menú: activado. Toca para desactivarlo.' : 'Botón flotante de menú: desactivado. Toca para activarlo.'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: df.floatingNav ? 'var(--df-brand)' : 'var(--df-border-strong)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <NotificationsMenu df={df} />
        <ProfileMenu df={df} />
      </div>
    </header>
  );
}
