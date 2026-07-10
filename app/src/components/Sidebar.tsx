import type { DealFlowState } from '../hooks/useDealFlowState';
import logo from '../assets/logo.png';
import {
  IconAsistente,
  IconCRM,
  IconCuentas,
  IconIntegraciones,
  IconLeads,
  IconPedidos,
  IconPlanes,
  IconProductos,
  IconPromos,
  IconResumen,
  IconToggleMode,
  IconVentas,
  IconWhatsApp,
} from './icons';
import type { AdminSection, VendedorSection } from '../types';

export function Sidebar({ df }: { df: DealFlowState }) {
  const vSection = df.isVendedor ? df.section : null;
  const aSection = df.isAdmin ? df.adminSection : null;

  const item = (
    id: VendedorSection,
    icon: React.ReactNode,
    label: string,
    extra?: React.ReactNode,
  ) => (
    <div key={id} onClick={() => df.go(id)} style={df.navStyle(vSection === id)}>
      {icon}
      <span>{label}</span>
      {extra}
    </div>
  );

  const adminItem = (id: AdminSection, icon: React.ReactNode, label: string) => (
    <div key={id} onClick={() => df.goAdmin(id)} style={df.navStyle(aSection === id)}>
      {icon}
      <span>{label}</span>
    </div>
  );

  return (
    <aside style={{ width: 224, flexShrink: 0, background: '#0F172A', display: 'flex', flexDirection: 'column', padding: '18px 12px 14px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px' }}>
        <img src={logo} alt="DealFlow" style={{ width: 34, height: 30, objectFit: 'contain' }} />
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>DealFlow</span>
      </div>

      {df.isVendedor && (
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {item('resumen', <IconResumen />, 'Resumen')}
          {item('productos', <IconProductos />, 'Productos')}
          {item('promos', <IconPromos />, 'Promos')}
          {item('asistente', <IconAsistente />, 'Asistente')}
          {item(
            'whatsapp',
            <IconWhatsApp />,
            'WhatsApp',
            df.waConnected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', marginLeft: 'auto' }} />,
          )}
          {item(
            'pedidos',
            <IconPedidos />,
            'Pedidos',
            df.hasNewOrders && (
              <span style={{ marginLeft: 'auto', background: '#F59E0B', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px' }}>
                {df.newOrdersCount}
              </span>
            ),
          )}
          {item('leads', <IconLeads />, 'Leads')}
          {item(
            'crm',
            <IconCRM />,
            'CRM',
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', marginLeft: 'auto', animation: 'dfpulse 1.8s infinite' }} />,
          )}
          {item('integraciones', <IconIntegraciones />, 'Integraciones')}
        </nav>
      )}

      {df.isAdmin && (
        <>
          <div style={{ color: '#64748B', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 10px 8px' }}>
            Administración
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {adminItem('ventas', <IconVentas />, 'Ventas')}
            {adminItem('planes', <IconPlanes />, 'Planes')}
            {adminItem('cuentas', <IconCuentas />, 'Cuentas')}
          </nav>
        </>
      )}

      <div style={{ flex: 1 }} />
      {df.canAdmin && (
        <div
          onClick={df.toggleMode}
          className="df-toggle-mode"
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', color: '#94A3B8', fontSize: 13, fontWeight: 600, border: '1px solid #1E293B' }}
        >
          <IconToggleMode />
          <span>{df.modeBtnLabel}</span>
        </div>
      )}
      <div
        onClick={df.logout}
        className="df-toggle-mode"
        style={{ textAlign: 'center', padding: '9px 12px', marginTop: 6, borderRadius: 8, cursor: 'pointer', color: '#94A3B8', fontSize: 12.5, fontWeight: 600 }}
      >
        Cerrar sesión
      </div>
      <div
        onClick={df.resetDemo}
        className="df-toggle-mode"
        style={{ textAlign: 'center', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', color: '#64748B', fontSize: 12, fontWeight: 600 }}
        title="Vuelve a los datos de muestra originales"
      >
        ↺ Restablecer demo
      </div>
    </aside>
  );
}
