import type { DealFlowState } from '../hooks/useDealFlowState';
import { Icono } from './Icono';
import logo from '../assets/logo.png';
import {
  IconAsistente,
  IconComentarios, IconCRM,
  IconCuentas,
  IconEquipo,
  IconDealShop,
  IconMarketing,
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
import { useEffect, useState } from 'react';

// Frases del recuadro de DealFlow en el menú: cambian solas cada pocos segundos.
const FRASES = [
  'Cada chat es una venta esperando.',
  'Hoy es un gran día para vender.',
  'Pequeños pasos, grandes ventas.',
  'Tu tienda vende aunque duermas.',
  'Responde rápido, vende más.',
  'La constancia vence al talento.',
  'Cada pedido cuenta. ¡Sigue así!',
  'Lo que no se mide, no crece.',
  'Hoy puedes vender más que ayer.',
  'Tu esfuerzo de hoy es la venta de mañana.',
  'Los grandes negocios empezaron pequeños.',
  'Un cliente feliz trae a otro.',
];

function FraseMotivacional() {
  const [i, setI] = useState(() => Math.floor(Math.random() * FRASES.length));
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout>;
    const t = setInterval(() => {
      setVisible(false);
      espera = setTimeout(() => { setI((n) => (n + 1) % FRASES.length); setVisible(true); }, 400);
    }, 7000);
    return () => { clearInterval(t); clearTimeout(espera); };
  }, []);
  return (
    <div style={{ color: 'rgba(255,255,255,.88)', fontSize: 12, lineHeight: 1.4, marginTop: 3, marginBottom: 10, minHeight: 34, whiteSpace: 'normal', overflowWrap: 'anywhere', opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(3px)', transition: 'opacity .4s, transform .4s' }}>
      {FRASES[i]}
    </div>
  );
}

// Color propio de cada sección del menú (íconos de colores sobre el fondo oscuro).
export const COLOR_SECCION: Record<string, string> = {
  resumen: '#60A5FA', estadisticas: '#A78BFA', productos: '#F472B6', landings: '#34D399', asistente: '#22D3EE',
  whatsapp: '#25D366', logistica: '#FBBF24', pedidos: '#FB923C', leads: '#F87171', crm: '#38BDF8',
  comentarios: '#C084FC', marketing: '#E879F9', anuncios: '#818CF8', biblioteca: '#FACC15', dealshop: '#2DD4BF',
  equipo: '#93C5FD', integraciones: '#A3E635',
  // Admin
  contabilidad: '#34D399', planes: '#FBBF24', cuentas: '#60A5FA',
};
export const iconoColor = (id: string, icon: React.ReactNode) => (
  <span style={{ display: 'inline-flex', color: COLOR_SECCION[id] || 'currentColor', filter: 'drop-shadow(0 0 6px color-mix(in srgb, currentColor 35%, transparent))' }}>{icon}</span>
);

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
      <EnlaceApp key={id} href={urlDe({ mode: 'vendedor', section: id })} onAbrir={() => df.go(id)} title="Ctrl + clic para abrir en otra pestaña" style={navStylePremium(vSection === id)}>
        {iconoColor(id, icon)}
        <span>{label}</span>
        {extra}
      </EnlaceApp>
    ) : null;

  const adminItem = (id: AdminSection, icon: React.ReactNode, label: string) => (
    <EnlaceApp key={id} href={urlDe({ mode: 'admin', adminSection: id })} onAbrir={() => df.goAdmin(id)} style={navStylePremium(aSection === id)}>
      {iconoColor(id, icon)}
      <span>{label}</span>
    </EnlaceApp>
  );

  return (
    <aside style={{ width: 224, flexShrink: 0, background: premium ? 'linear-gradient(180deg, rgba(10,12,34,.78), rgba(14,12,40,.62))' : '#0F172A', borderRight: premium ? '1px solid rgba(148,163,253,.14)' : undefined, display: 'flex', flexDirection: 'column', padding: '18px 12px 14px', overflowY: 'auto' }}>
      <a href="/inicio" title="Ir a la página de inicio de DealFlow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px', textDecoration: 'none' }}>
        <img src={logo} alt="DealFlow" style={{ width: 34, height: 30, objectFit: 'contain' }} />
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>DealFlow</span>
      </a>

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
          {item('comentarios', <IconComentarios />, 'Comentarios')}
          {item('marketing', <IconMarketing />, 'Marketing IA')}
          {item('anuncios', <IconEstadisticas />, 'Anuncios')}
          {item('biblioteca', <IconBiblioteca />, 'Biblioteca')}
          {item('dealshop', <IconDealShop />, 'DealShop')}
          {item('equipo', <IconEquipo />, 'Equipo')}
          {item('integraciones', <IconIntegraciones />, 'Integraciones')}
        </nav>
      )}

      {df.isAdmin && (
        <>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 10px 8px' }}>
            {df.isSoporte ? 'Soporte' : 'Administración'}
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* El superadmin ve TODO lo del admin y, además, "Todas las tiendas". */}
            {df.isSuperadmin && adminItem('superadmin', <Icono nombre="web" tam={17} grosor={1.8} />, 'Todas las tiendas')}
            {df.isSuperadmin && adminItem('plantillas', <Icono nombre="plantillas" tam={17} grosor={1.8} />, 'Plantillas WA')}
            {df.isSuperadmin && adminItem('equipo', <Icono nombre="equipoDF" tam={17} grosor={1.8} />, 'Equipo DealFlow')}
            {adminItem('soporte', <Icono nombre="soporte" tam={17} grosor={1.8} />, 'Soporte en vivo')}
            {adminItem('trazabilidad', <Icono nombre="ruta" tam={17} grosor={1.8} />, 'Trazabilidad')}
            {/* Drive del equipo: se abre aparte (/drive). */}
            <a href={'/drive'} target="_blank" rel="noopener" title="Abrir el Drive del equipo en otra pestaña" style={{ ...navStylePremium(false), textDecoration: 'none' }}>
              <Icono nombre="nube" tam={17} grosor={1.8} />
              <span>Drive del equipo</span>
            </a>
            {!df.isSoporte && <>
            {adminItem('proveedores', <Icono nombre="aliado" tam={17} grosor={1.8} />, 'Proveedores')}
            {adminItem('estudio', <Icono nombre="estudio" tam={17} grosor={1.8} />, 'Estudio IA')}
            {df.isSuperadmin && adminItem('contabilidad', <IconVentas />, 'Contabilidad')}
            {adminItem('planes', <IconPlanes />, 'Planes')}
            {adminItem('cuentas', <IconCuentas />, 'Cuentas')}
            {adminItem('cupones', <Icono nombre="cupon" tam={17} grosor={1.8} />, 'Cupones')}
            {adminItem('biblioteca', <IconBiblioteca />, 'Biblioteca')}
            </>}
          </nav>
        </>
      )}

      {/* Tutoriales en vivo: recorrido interactivo de cada función (página propia, /tutoriales). */}
      <a
        href="/tutoriales"
        style={{ ...df.navStyle(false), textDecoration: 'none', marginTop: 8, borderTop: '1px solid var(--df-text-strong)', paddingTop: 12, borderRadius: 0 }}
      >
        <Icono nombre="tutoriales" tam={17} grosor={1.8} color="#FDBA74" />
        <span>Tutoriales</span>
      </a>

      <div style={{ flex: 1 }} />
      {premium && (
        <div
          style={{
            position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 14px', marginBottom: 10, flexShrink: 0,
            background: 'linear-gradient(145deg,#4338CA,#7C3AED 55%,#2563EB)', boxShadow: '0 10px 26px -8px rgba(99,102,241,.6)',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 25% 15%, rgba(255,255,255,.28), transparent 55%)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>DealFlow</div>
            <FraseMotivacional />
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
