import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import logo from '../assets/logo.png';
import {
  IconAsistente,
  IconCRM,
  IconCuentas,
  IconEquipo,
  IconMarketing,
  IconDealShop,
  IconBiblioteca,
  IconIntegraciones,
  IconLeads,
  IconPedidos,
  IconPlanes,
  IconProductos,
  IconResumen,
  IconVentas,
  IconWhatsApp,
} from './icons';
import type { AdminSection, VendedorSection } from '../types';

/**
 * Botón flotante de menú (opcional, se activa/desactiva desde el header).
 * En reposo es solo el logo redondo de DealFlow, semitransparente (~33%); al
 * tocarlo despliega las mismas opciones del menú, flotando sobre el contenido.
 */
export function FloatingNav({ df }: { df: DealFlowState }) {
  const [open, setOpen] = useState(false);
  const vSection = df.isVendedor ? df.section : null;
  const aSection = df.isAdmin ? df.adminSection : null;

  const fila = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string, extra?: React.ReactNode) => (
    <div
      key={label}
      onClick={onClick}
      className="df-floatnav-item"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
        fontSize: 13.5, fontWeight: active ? 600 : 500,
        color: active ? '#fff' : 'var(--df-text-faint)', background: active ? 'rgba(5,150,105,.32)' : 'transparent',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {extra}
    </div>
  );

  const goV = (id: VendedorSection) => { df.go(id); setOpen(false); };
  const goA = (id: AdminSection) => { df.goAdmin(id); setOpen(false); };
  const item = (id: VendedorSection, icon: React.ReactNode, label: string, extra?: React.ReactNode) =>
    df.puedeVerSeccion(id) ? fila(vSection === id, () => goV(id), icon, label, extra) : null;

  return (
    <div style={{ position: 'absolute', left: 20, bottom: 20, zIndex: 45 }}>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 44 }} />
          <div
            style={{
              position: 'absolute', left: 0, bottom: 66, zIndex: 45, width: 224, maxHeight: '72vh', overflowY: 'auto',
              background: '#0F172A', border: '1px solid var(--df-text-strong)', borderRadius: 14, padding: 8,
              boxShadow: '0 26px 60px -18px rgba(0,0,0,.65)', display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            {df.isVendedor && (
              <>
                {item('resumen', <IconResumen />, 'Resumen')}
                {item('productos', <IconProductos />, 'Productos')}
                {item('asistente', <IconAsistente />, 'Asistente')}
                {item('whatsapp', <IconWhatsApp />, 'WhatsApp', df.waConnected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--df-brand-mid)' }} />)}
                {item('pedidos', <IconPedidos />, 'Pedidos', df.hasNewOrders && (
                  <span style={{ background: 'var(--df-warning-mid)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px' }}>{df.newOrdersCount}</span>
                ))}
                {item('leads', <IconLeads />, 'Leads')}
                {item('crm', <IconCRM />, 'Inbox', <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--df-brand-mid)', animation: 'dfpulse 1.8s infinite' }} />)}
                {item('marketing', <IconMarketing />, 'Marketing IA')}
                {item('biblioteca', <IconBiblioteca />, 'Biblioteca')}
                {item('dealshop', <IconDealShop />, 'DealShop')}
                {item('equipo', <IconEquipo />, 'Equipo')}
                {item('integraciones', <IconIntegraciones />, 'Integraciones')}
              </>
            )}
            {df.isAdmin && (
              <>
                <div style={{ color: 'var(--df-text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 10px 6px' }}>
                  {df.isSuperadmin ? 'Superadmin' : 'Administración'}
                </div>
                {df.isSuperadmin ? (
                  fila(aSection === 'superadmin', () => goA('superadmin'), <IconCuentas />, 'Todas las tiendas')
                ) : (
                  <>
                    {fila(aSection === 'ventas', () => goA('ventas'), <IconVentas />, 'Ventas')}
                    {fila(aSection === 'planes', () => goA('planes'), <IconPlanes />, 'Planes')}
                    {fila(aSection === 'cuentas', () => goA('cuentas'), <IconCuentas />, 'Cuentas')}
                    {fila(aSection === 'cupones', () => goA('cupones'), <span style={{ fontSize: 16 }}>🎁</span>, 'Cupones')}
                    {fila(aSection === 'biblioteca', () => goA('biblioteca'), <IconBiblioteca />, 'Biblioteca')}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Menú"
        className={`df-floatnav${open ? ' df-floatnav-open' : ''}`}
        style={{
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#0F172A',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px -8px rgba(0,0,0,.55)', padding: 0,
        }}
      >
        <img src={logo} alt="Menú" style={{ width: 34, height: 30, objectFit: 'contain' }} />
      </button>
    </div>
  );
}
