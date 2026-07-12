import { Header } from './components/Header';
import { Login } from './components/Login';
import { OrderDetailPanel } from './components/OrderDetailPanel';
import { OrderToast } from './components/OrderToast';
import { Sidebar } from './components/Sidebar';
import { MobileChat } from './components/mobile/MobileChat';
import { MobileDrawer } from './components/mobile/MobileDrawer';
import { MobileHeader } from './components/mobile/MobileHeader';
import { MobileOrderSheet } from './components/mobile/MobileOrderSheet';
import { useDealFlowState } from './hooks/useDealFlowState';
import type { DealFlowState } from './hooks/useDealFlowState';
import { useIsMobile } from './hooks/useIsMobile';
import { Asistente } from './sections/Asistente';
import { CRM } from './sections/CRM';
import { Integraciones } from './sections/Integraciones';
import { Leads } from './sections/Leads';
import { Pedidos } from './sections/Pedidos';
import { Productos } from './sections/Productos';
import { Equipo } from './sections/Equipo';
import { Marketing } from './sections/Marketing';
import { DealShop } from './sections/DealShop';
import { Resumen } from './sections/Resumen';
import { WhatsAppSection } from './sections/WhatsApp';
import { Cuentas } from './sections/admin/Cuentas';
import { Planes } from './sections/admin/Planes';
import { Ventas } from './sections/admin/Ventas';
import { MCRM } from './sections/mobile/MCRM';
import { MLeads } from './sections/mobile/MLeads';
import { MPedidos } from './sections/mobile/MPedidos';
import { MProductos } from './sections/mobile/MProductos';
import { MResumen } from './sections/mobile/MResumen';

function ImpersonationBanner({ df }: { df: DealFlowState }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        background: '#78350F',
        color: '#FEF3C7',
        padding: '9px 16px',
        fontFamily: "'Inter',system-ui,sans-serif",
        fontSize: 13.5,
        fontWeight: 600,
      }}
    >
      <span>👀 Estás dentro de <b style={{ color: '#fff' }}>{df.tiendaImpersonada || 'una tienda'}</b> en modo soporte. Los cambios que hagas afectan a esta tienda real.</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={df.volverAlAdmin}
        style={{ background: '#FEF3C7', color: '#78350F', border: 'none', borderRadius: 7, padding: '6px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
      >
        ← Volver al panel de admin
      </button>
    </div>
  );
}

function AdminContent({ df }: { df: DealFlowState }) {
  return (
    <>
      {df.adminSection === 'ventas' && <Ventas df={df} />}
      {df.adminSection === 'planes' && <Planes df={df} />}
      {df.adminSection === 'cuentas' && <Cuentas df={df} />}
    </>
  );
}

function DesktopApp({ df }: { df: DealFlowState }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
        minHeight: 600,
        fontFamily: "'Inter',system-ui,sans-serif",
        background: '#F8FAFC',
        color: '#1E293B',
        overflow: 'hidden',
      }}
    >
      <Sidebar df={df} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header df={df} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '26px 28px 40px' }}>
          {df.isVendedor && df.section === 'resumen' && <Resumen df={df} />}
          {df.isVendedor && df.section === 'productos' && <Productos df={df} />}
          {df.isVendedor && df.section === 'asistente' && <Asistente df={df} />}
          {df.isVendedor && df.section === 'whatsapp' && <WhatsAppSection df={df} />}
          {df.isVendedor && df.section === 'equipo' && <Equipo df={df} />}
          {df.isVendedor && df.section === 'marketing' && <Marketing df={df} />}
          {df.isVendedor && df.section === 'dealshop' && <DealShop df={df} />}
          {df.isVendedor && df.section === 'pedidos' && <Pedidos df={df} />}
          {df.isVendedor && df.section === 'leads' && <Leads df={df} />}
          {df.isVendedor && df.section === 'crm' && <CRM df={df} />}
          {df.isVendedor && df.section === 'integraciones' && <Integraciones df={df} />}
          {df.isAdmin && <AdminContent df={df} />}
        </main>
      </div>

      <OrderDetailPanel df={df} />
      <OrderToast df={df} />
    </div>
  );
}

function MobileApp({ df }: { df: DealFlowState }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        fontFamily: "'Inter',system-ui,sans-serif",
        background: '#F8FAFC',
        color: '#1E293B',
        overflow: 'hidden',
      }}
    >
      <MobileHeader df={df} />

      <main style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 90px' }}>
        {df.isVendedor && df.section === 'resumen' && <MResumen df={df} />}
        {df.isVendedor && df.section === 'pedidos' && <MPedidos df={df} />}
        {df.isVendedor && df.section === 'productos' && <MProductos df={df} />}
        {df.isVendedor && df.section === 'crm' && <MCRM df={df} />}
        {df.isVendedor && df.section === 'leads' && <MLeads df={df} />}
        {df.isVendedor && df.section === 'asistente' && <Asistente df={df} />}
        {df.isVendedor && df.section === 'whatsapp' && <WhatsAppSection df={df} />}
        {df.isVendedor && df.section === 'equipo' && <Equipo df={df} />}
        {df.isVendedor && df.section === 'marketing' && <Marketing df={df} />}
        {df.isVendedor && df.section === 'dealshop' && <DealShop df={df} />}
        {df.isVendedor && df.section === 'integraciones' && <Integraciones df={df} />}
        {df.isAdmin && <AdminContent df={df} />}
      </main>

      <MobileDrawer df={df} />
      <MobileChat df={df} />
      <MobileOrderSheet df={df} />
      <OrderToast df={df} mobile />
    </div>
  );
}

function App() {
  const df = useDealFlowState();
  const isMobile = useIsMobile();
  if (!df.isLoggedIn) return <Login df={df} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {df.impersonando && <ImpersonationBanner df={df} />}
      <div style={{ flex: 1, minHeight: 0 }}>{isMobile ? <MobileApp df={df} /> : <DesktopApp df={df} />}</div>
    </div>
  );
}

export default App;
