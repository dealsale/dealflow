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
  IconToggleMode,
  IconVentas,
  IconWhatsApp,
} from './icons';
import type { AdminSection, VendedorSection } from '../types';

export function Sidebar({ df }: { df: DealFlowState }) {
  const vSection = df.isVendedor ? df.section : null;
  const aSection = df.isAdmin ? df.adminSection : null;
  const premium = df.theme === 'premium';

  // En Premium, el ítem activo se resalta con un pill de vidrio + resplandor
  // azul/púrpura en vez del verde plano de los otros temas.
  const navStylePremium = (active: boolean): React.CSSProperties => {
    const base = df.navStyle(active);
    if (!premium || !active) return base;
    return {
      ...base,
      background: 'linear-gradient(135deg, rgba(37,99,235,.38), rgba(124,58,237,.38))',
      boxShadow: '0 0 0 1px rgba(148,163,253,.4), 0 0 18px rgba(99,102,241,.45)',
    };
  };

  const item = (
    id: VendedorSection,
    icon: React.ReactNode,
    label: string,
    extra?: React.ReactNode,
  ) =>
    df.puedeVerSeccion(id) ? (
      <div key={id} onClick={() => df.go(id)} style={navStylePremium(vSection === id)}>
        {icon}
        <span>{label}</span>
        {extra}
      </div>
    ) : null;

  const adminItem = (id: AdminSection, icon: React.ReactNode, label: string) => (
    <div key={id} onClick={() => df.goAdmin(id)} style={navStylePremium(aSection === id)}>
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
          {item('estadisticas', <span style={{ fontSize: 16 }}>📊</span>, 'Estadísticas')}
          {item('productos', <IconProductos />, 'Productos')}
          {item('asistente', <IconAsistente />, 'Asistente')}
          {item(
            'whatsapp',
            <IconWhatsApp />,
            'WhatsApp',
            df.waConnected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--df-brand-mid)', marginLeft: 'auto' }} />,
          )}
          {item(
            'pedidos',
            <IconPedidos />,
            'Pedidos',
            df.hasNewOrders && (
              <span style={{ marginLeft: 'auto', background: 'var(--df-warning-mid)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px' }}>
                {df.newOrdersCount}
              </span>
            ),
          )}
          {item('leads', <IconLeads />, 'Leads')}
          {item(
            'crm',
            <IconCRM />,
            'Inbox',
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--df-brand-mid)', marginLeft: 'auto', animation: 'dfpulse 1.8s infinite' }} />,
          )}
          {item('marketing', <IconMarketing />, 'Marketing IA')}
          {item('biblioteca', <IconBiblioteca />, 'Biblioteca')}
          {item('dealshop', <IconDealShop />, 'DealShop')}
          {item('equipo', <IconEquipo />, 'Equipo')}
          {item('integraciones', <IconIntegraciones />, 'Integraciones')}
        </nav>
      )}

      {df.isAdmin && (
        <>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 10px 8px' }}>
            {df.isSuperadmin ? 'Superadmin' : 'Administración'}
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* El superadmin ve TODO lo del admin y, además, "Todas las tiendas". */}
            {df.isSuperadmin && adminItem('superadmin', <span style={{ fontSize: 16 }}>🌐</span>, 'Todas las tiendas')}
            {adminItem('ventas', <IconVentas />, 'Ventas')}
            {adminItem('planes', <IconPlanes />, 'Planes')}
            {adminItem('cuentas', <IconCuentas />, 'Cuentas')}
            {adminItem('cupones', <span style={{ fontSize: 16 }}>🎁</span>, 'Cupones')}
            {adminItem('biblioteca', <IconBiblioteca />, 'Biblioteca')}
          </nav>
        </>
      )}

      <div style={{ flex: 1 }} />
      {premium && (
        <div
          style={{
            position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '16px 14px', marginBottom: 10,
            background: 'linear-gradient(145deg,#4338CA,#7C3AED 55%,#2563EB)', boxShadow: '0 10px 26px -8px rgba(99,102,241,.6)',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 25% 15%, rgba(255,255,255,.28), transparent 55%)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>DealFlow</div>
            <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 11.5, marginTop: 2, marginBottom: 12 }}>Automatiza · Vende · Crece</div>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,.24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>→</div>
          </div>
        </div>
      )}
      {df.canAdmin && !df.apiMode && (
        <div
          onClick={df.toggleMode}
          className="df-toggle-mode"
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', color: 'var(--df-text-faint)', fontSize: 13, fontWeight: 600, border: '1px solid var(--df-text-strong)' }}
        >
          <IconToggleMode />
          <span>{df.modeBtnLabel}</span>
        </div>
      )}
      {!df.apiMode && (
      <div
        onClick={df.resetDemo}
        className="df-toggle-mode"
        style={{ textAlign: 'center', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}
        title="Vuelve a los datos de muestra originales"
      >
        ↺ Restablecer demo
      </div>
      )}
    </aside>
  );
}
