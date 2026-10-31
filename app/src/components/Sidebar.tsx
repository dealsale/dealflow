import type { ReactNode } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import type { AdminSection, VendedorSection } from '../types';
import { EnlaceApp } from './EnlaceApp';
import { urlDe } from '../lib/rutas';
import iconoApp from '../assets/icono-app.png';
import skyMascota from '../assets/sky-mascota.png';
import {
  IcoAsistente, IcoBiblioteca, IcoDealShop, IcoEquipo, IcoEstadisticas, IcoInbox, IcoIntegraciones, IcoLeads, IcoLogistica,
  IcoMarketing, IcoPedidos, IcoProductos, IcoResumen, IcoTienda, IcoTutoriales, IcoWhatsApp,
} from './iconosNoche';
import { IconBiblioteca, IconCuentas, IconPlanes, IconVentas } from './icons';

/**
 * Barra lateral del rediseño: marca arriba, secciones en tres grupos (operar, Crecer,
 * Configurar), número de pedidos nuevos, punto de WhatsApp conectado y, abajo, la
 * tarjeta de SKY (soporte). Es el mismo menú del artifact "Rediseño del panel".
 */
export function Sidebar({ df }: { df: DealFlowState }) {
  const vSection = df.isVendedor ? df.section : null;
  const aSection = df.isAdmin ? df.adminSection : null;
  const sinLeer = df.isVendedor ? df.crmChats.filter((c) => c.sinResponder > 0).length : 0;

  const item = (id: VendedorSection, icono: ReactNode, label: string, extra?: ReactNode) =>
    df.puedeVerSeccion(id) ? (
      <EnlaceApp key={id} href={urlDe({ mode: 'vendedor', section: id })} onAbrir={() => df.go(id)} title="Ctrl + clic para abrir en otra pestaña" className={`item${vSection === id ? ' activa' : ''}`}>
        {icono}
        <span>{label}</span>
        {extra}
      </EnlaceApp>
    ) : null;

  const adminItem = (id: AdminSection, icono: ReactNode, label: string) => (
    <EnlaceApp key={id} href={urlDe({ mode: 'admin', adminSection: id })} onAbrir={() => df.goAdmin(id)} className={`item${aSection === id ? ' activa' : ''}`}>
      {icono}
      <span>{label}</span>
    </EnlaceApp>
  );
  const emoji = (e: string) => <span style={{ width: 18, textAlign: 'center', fontSize: 15, flex: '0 0 18px' }}>{e}</span>;

  return (
    <nav className="barra" aria-label="Secciones">
      <a className="marca" href="/inicio" title="Ir a la página de inicio de DealFlow">
        <img src={iconoApp} alt="" />
        <span>DealFlow<small>{df.isAdmin ? 'Administración' : 'Panel de ventas'}</small></span>
      </a>

      {df.isVendedor && (
        <>
          {item('resumen', <IcoResumen />, 'Resumen')}
          {item('estadisticas', <IcoEstadisticas />, 'Estadísticas')}
          {item('productos', <IcoProductos />, 'Productos')}
          {item('landings', <IcoTienda />, 'Tienda en línea')}
          {item('asistente', <IcoAsistente />, 'Asistente')}
          {item('whatsapp', <IcoWhatsApp />, 'WhatsApp', df.waConnected && <span className="punto" aria-label="conectado" />)}
          {df.effiApi?.conectado && item('logistica', <IcoLogistica />, 'Logística Effi')}
          {item('pedidos', <IcoPedidos />, 'Pedidos', df.hasNewOrders && <span className="num">{df.newOrdersCount}</span>)}
          {item('leads', <IcoLeads />, 'Leads')}
          {item('crm', <IcoInbox />, 'Inbox', sinLeer > 0 ? <span className="num">{sinLeer}</span> : <span className="punto late" aria-label="en vivo" />)}
          <div className="grupo">Crecer</div>
          {item('biblioteca', <IcoBiblioteca />, 'Biblioteca')}
          {item('dealshop', <IcoDealShop />, 'DealShop')}
          {item('marketing', <IcoMarketing />, 'Marketing IA')}
          <div className="grupo">Configurar</div>
          {item('equipo', <IcoEquipo />, 'Equipo')}
          {item('integraciones', <IcoIntegraciones />, 'Integraciones')}
        </>
      )}

      {df.isAdmin && (
        <>
          <div className="grupo">{df.isSuperadmin ? 'Superadmin' : 'Administración'}</div>
          {df.isSuperadmin && adminItem('superadmin', emoji('🌐'), 'Todas las tiendas')}
          {df.isSuperadmin && adminItem('plantillas', emoji('📩'), 'Plantillas WA')}
          {adminItem('trazabilidad', emoji('🧭'), 'Trazabilidad')}
          {adminItem('proveedores', emoji('🤝'), 'Proveedores')}
          {adminItem('contabilidad', <IconVentas />, 'Contabilidad')}
          {adminItem('planes', <IconPlanes />, 'Planes')}
          {adminItem('cuentas', <IconCuentas />, 'Cuentas')}
          {adminItem('cupones', emoji('🎁'), 'Cupones')}
          {adminItem('biblioteca', <IconBiblioteca />, 'Biblioteca')}
        </>
      )}

      <a href="/tutoriales" className="item" style={{ marginTop: 6 }}>
        <IcoTutoriales />
        <span>Tutoriales</span>
      </a>

      {df.canAdmin && !df.apiMode && (
        <button type="button" onClick={df.toggleMode} className="item">{emoji('⇄')}<span>{df.modeBtnLabel}</span></button>
      )}
      {!df.apiMode && (
        <button type="button" onClick={df.resetDemo} className="item" title="Vuelve a los datos de muestra originales">{emoji('↺')}<span>Restablecer demo</span></button>
      )}

      <button type="button" className="sky" onClick={() => window.dispatchEvent(new CustomEvent('df:abrir-sky'))} title="Abrir a SKY, el asistente de soporte">
        <img src={skyMascota} alt="" />
        <div><b>SKY · soporte</b><span>Pregúntale cómo se hace</span></div>
      </button>
    </nav>
  );
}
