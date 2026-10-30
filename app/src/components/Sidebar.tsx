import type { DealFlowState } from '../hooks/useDealFlowState';
import logo from '../assets/logo.png';
import {
  IconAsistente,
  IconCRM,
  IconCuentas,
  IconEquipo,
  IconDealShop,
  IconEstadisticas,
  IconBiblioteca,
  IconLandings,
  IconIntegraciones,
  IconLeads,
  IconPedidos,
  IconLogistica,
  IconPlanes,
  IconProductos,
  IconResumen,
  IconToggleMode,
  IconVentas,
  IconWhatsApp,
} from './icons';
import type { AdminSection, VendedorSection } from '../types';
import { EnlaceApp } from './EnlaceApp';
import { urlDe } from '../lib/rutas';
import iconoApp from '../assets/icono-app.png';
import skyMascota from '../assets/sky-mascota.png';

export function Sidebar({ df }: { df: DealFlowState }) {
  const vSection = df.isVendedor ? df.section : null;
  const aSection = df.isAdmin ? df.adminSection : null;
  const premium = df.theme === 'premium';
  const noche = df.theme === 'noche';

  // En Premium, el ítem activo se resalta con un pill de vidrio + resplandor
  // azul/púrpura en vez del verde plano de los otros temas. En Noche (el diseño
  // nuevo), con el degradado de marca y una línea esmeralda al borde.
  const navStylePremium = (active: boolean): React.CSSProperties => {
    const base = df.navStyle(active);
    if (noche) {
      return {
        ...base, borderRadius: 10, padding: '9px 11px', minHeight: 40, color: active ? '#EEF3FF' : '#9AA8C9', fontWeight: active ? 600 : 500,
        background: active ? 'linear-gradient(90deg, rgba(16,185,129,.18), rgba(46,139,255,.12))' : 'transparent',
        boxShadow: active ? 'inset 2px 0 0 #10B981' : undefined,
      };
    }
    if (!premium || !active) return base;
    return {
      ...base,
      background: 'linear-gradient(135deg, rgba(37,99,235,.38), rgba(124,58,237,.38))',
      boxShadow: '0 0 0 1px rgba(148,163,253,.4), 0 0 18px rgba(99,102,241,.45)',
    };
  };
  const grupo = (texto: string) => noche ? <div style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7D8DB5', padding: '12px 11px 4px' }}>{texto}</div> : null;

  const item = (
    id: VendedorSection,
    icon: React.ReactNode,
    label: string,
    extra?: React.ReactNode,
  ) =>
    df.puedeVerSeccion(id) ? (
      <EnlaceApp key={id} href={urlDe({ mode: 'vendedor', section: id })} onAbrir={() => df.go(id)} title="Ctrl + clic para abrir en otra pestaña" style={navStylePremium(vSection === id)}>
        {icon}
        <span>{label}</span>
        {extra}
      </EnlaceApp>
    ) : null;

  const adminItem = (id: AdminSection, icon: React.ReactNode, label: string) => (
    <EnlaceApp key={id} href={urlDe({ mode: 'admin', adminSection: id })} onAbrir={() => df.goAdmin(id)} style={navStylePremium(aSection === id)}>
      {icon}
      <span>{label}</span>
    </EnlaceApp>
  );

  return (
    <aside style={{ width: noche ? 236 : 224, flexShrink: 0, background: noche ? '#040611' : premium ? 'linear-gradient(180deg, rgba(10,12,34,.78), rgba(14,12,40,.62))' : '#0F172A', borderRight: noche ? '1px solid rgba(154,168,201,.16)' : premium ? '1px solid rgba(148,163,253,.14)' : undefined, display: 'flex', flexDirection: 'column', padding: '18px 12px 14px', overflowY: 'auto' }}>
      {noche ? (
        <a href="/inicio" title="Ir a la página de inicio de DealFlow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 16px', textDecoration: 'none' }}>
          <img src={iconoApp} alt="" style={{ width: 32, height: 32, borderRadius: 9, filter: 'drop-shadow(0 4px 12px rgba(70,140,255,.35))' }} />
          <span style={{ color: '#EEF3FF', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: '-0.03em', lineHeight: 1 }}>DealFlow<small style={{ display: 'block', fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 9, letterSpacing: '.14em', color: '#7D8DB5', textTransform: 'uppercase', fontWeight: 400, marginTop: 4 }}>Panel de ventas</small></span>
        </a>
      ) : (
      <a href="/inicio" title="Ir a la página de inicio de DealFlow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px', textDecoration: 'none' }}>
        <img src={logo} alt="DealFlow" style={{ width: 34, height: 30, objectFit: 'contain' }} />
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>DealFlow</span>
      </a>
      )}

      {df.isVendedor && (
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {item('resumen', <IconResumen />, 'Resumen')}
          {item('estadisticas', <IconEstadisticas />, 'Estadísticas')}
          {item('productos', <IconProductos />, 'Productos')}
          {item('landings', <IconLandings />, 'Tienda en línea')}
          {item('asistente', <IconAsistente />, 'Asistente')}
          {item(
            'whatsapp',
            <IconWhatsApp />,
            'WhatsApp',
            df.waConnected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--df-brand-mid)', marginLeft: 'auto' }} />,
          )}
          {df.effiApi?.conectado && item('logistica', <IconLogistica />, 'Logística Effi')}
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
          {grupo('Crecer')}
          {item('biblioteca', <IconBiblioteca />, 'Biblioteca')}
          {item('dealshop', <IconDealShop />, 'DealShop')}
          {grupo('Configurar')}
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
            {df.isSuperadmin && adminItem('plantillas', <span style={{ fontSize: 16 }}>📩</span>, 'Plantillas WA')}
            {adminItem('trazabilidad', <span style={{ fontSize: 16 }}>🧭</span>, 'Trazabilidad')}
            {adminItem('proveedores', <span style={{ fontSize: 16 }}>🤝</span>, 'Proveedores')}
            {adminItem('contabilidad', <IconVentas />, 'Contabilidad')}
            {adminItem('planes', <IconPlanes />, 'Planes')}
            {adminItem('cuentas', <IconCuentas />, 'Cuentas')}
            {adminItem('cupones', <span style={{ fontSize: 16 }}>🎁</span>, 'Cupones')}
            {adminItem('biblioteca', <IconBiblioteca />, 'Biblioteca')}
          </nav>
        </>
      )}

      {/* Tutoriales en vivo: recorrido interactivo de cada función (página propia, /tutoriales). */}
      <a
        href="/tutoriales"
        style={{ ...df.navStyle(false), textDecoration: 'none', marginTop: 8, borderTop: '1px solid var(--df-text-strong)', paddingTop: 12, borderRadius: 0 }}
      >
        <span style={{ fontSize: 16 }}>🎓</span>
        <span>Tutoriales</span>
      </a>

      <div style={{ flex: 1 }} />
      {noche && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('df:abrir-sky'))}
          title="Abrir a SKY, el asistente de soporte"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, marginBottom: 8, borderRadius: 12, border: '1px solid rgba(154,168,201,.16)', background: 'linear-gradient(120deg, rgba(46,139,255,.12), rgba(176,90,255,.12))', color: '#EEF3FF', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
        >
          <img src={skyMascota} alt="" style={{ width: 38, height: 38 }} />
          <span><b style={{ display: 'block', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13 }}>SKY · soporte</b><span style={{ fontSize: 11.5, color: '#9AA8C9' }}>Pregúntale cómo se hace</span></span>
        </button>
      )}
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
