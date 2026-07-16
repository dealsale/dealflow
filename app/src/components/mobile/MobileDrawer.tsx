import type { CSSProperties } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import type { AdminSection, VendedorSection } from '../../types';
import logo from '../../assets/logo.png';
import { IconToggleMode } from '../icons';

const VENDOR_ITEMS: { id: VendedorSection; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'productos', label: 'Productos' },
  { id: 'asistente', label: 'Asistente' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'crm', label: 'Inbox' },
  { id: 'leads', label: 'Leads' },
  { id: 'marketing', label: 'Marketing IA' },
  { id: 'dealshop', label: 'DealShop' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'integraciones', label: 'Integraciones' },
];

const ADMIN_ITEMS: { id: AdminSection; label: string }[] = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'planes', label: 'Planes' },
  { id: 'cuentas', label: 'Cuentas' },
];

function itemStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '13px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14.5,
    fontWeight: active ? 600 : 500,
    color: active ? '#fff' : '#94A3B8',
    background: active ? 'rgba(5,150,105,.32)' : 'transparent',
  };
}

export function MobileDrawer({ df }: { df: DealFlowState }) {
  if (!df.menuOpen) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex' }}>
      <div
        style={{
          width: 260,
          background: '#0F172A',
          height: '100%',
          padding: '18px 12px',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          boxShadow: '12px 0 40px rgba(15,23,42,.3)',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px' }}>
          <img src={logo} alt="DealFlow" style={{ width: 30, height: 27, objectFit: 'contain' }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>DealFlow</span>
        </div>

        {df.isVendedor &&
          VENDOR_ITEMS.filter((m) => df.puedeVerSeccion(m.id)).map((m) => (
            <div key={m.id} onClick={() => df.go(m.id)} style={itemStyle(df.section === m.id)}>
              <span>{m.label}</span>
              {m.id === 'pedidos' && df.hasNewOrders && (
                <span style={{ marginLeft: 'auto', background: '#F59E0B', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px' }}>
                  {df.newOrdersCount}
                </span>
              )}
              {m.id === 'crm' && df.liveCount > 0 && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'dfpulse 1.8s infinite' }} />
              )}
            </div>
          ))}

        {df.isAdmin && (
          <>
            <div style={{ color: '#64748B', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 10px 8px' }}>
              Administración
            </div>
            {ADMIN_ITEMS.map((m) => (
              <div key={m.id} onClick={() => df.goAdmin(m.id)} style={itemStyle(df.adminSection === m.id)}>
                <span>{m.label}</span>
              </div>
            ))}
          </>
        )}

        <div style={{ flex: 1 }} />
        {df.canAdmin && !df.apiMode && (
          <div
            onClick={df.toggleMode}
            className="df-toggle-mode"
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px', borderRadius: 8, cursor: 'pointer', color: '#94A3B8', fontSize: 13, fontWeight: 600, border: '1px solid #1E293B' }}
          >
            <IconToggleMode />
            <span>{df.modeBtnLabel}</span>
          </div>
        )}
        {df.pwaDisponible && (
          <div
            onClick={df.instalarPwa}
            className="df-toggle-mode"
            style={{ textAlign: 'center', padding: '12px', marginTop: 6, borderRadius: 8, cursor: 'pointer', color: '#34D399', fontSize: 13, fontWeight: 700, border: '1px solid rgba(52,211,153,.35)', background: 'rgba(16,185,129,.08)' }}
          >
            📲 Instalar la app
          </div>
        )}
        <div
          onClick={df.logout}
          className="df-toggle-mode"
          style={{ textAlign: 'center', padding: '11px 12px', marginTop: 6, borderRadius: 8, cursor: 'pointer', color: '#94A3B8', fontSize: 12.5, fontWeight: 600 }}
        >
          Cerrar sesión
        </div>
        {!df.apiMode && (
        <div
          onClick={df.resetDemo}
          className="df-toggle-mode"
          style={{ textAlign: 'center', padding: '11px 12px', borderRadius: 8, cursor: 'pointer', color: '#64748B', fontSize: 12.5, fontWeight: 600 }}
        >
          ↺ Restablecer demo
        </div>
        )}
      </div>
      <div onClick={df.closeMenu} style={{ flex: 1, background: 'rgba(15,23,42,.5)' }} />
    </div>
  );
}
