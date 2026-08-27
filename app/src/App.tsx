import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { BotPreloader } from './components/BotPreloader';
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
import { Flujos } from './sections/Flujos';
import { DealShop } from './sections/DealShop';
import { Resumen } from './sections/Resumen';
import { WhatsAppSection } from './sections/WhatsApp';
import { Cuentas } from './sections/admin/Cuentas';
import { Planes } from './sections/admin/Planes';
import { Cupones } from './sections/admin/Cupones';
import { Ventas } from './sections/admin/Ventas';
import { Superadmin } from './sections/admin/Superadmin';
import { MCRM } from './sections/mobile/MCRM';
import { MLeads } from './sections/mobile/MLeads';
import { MPedidos } from './sections/mobile/MPedidos';
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

function SuscripcionBanner({ df }: { df: DealFlowState }) {
  const s = df.suscripcion;
  if (!s || df.esAgente) return null;
  // El vencido total ya está tapado por el muro de pago; aquí solo avisamos cuando está por vencer.
  const porVencer = s.estado === 'activa' && s.diasRestantes !== null && s.diasRestantes >= 0 && s.diasRestantes <= 5;
  if (!porVencer) return null;
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
      <span>⏳ Tu renta mensual (plan {s.plan}) vence en {s.diasRestantes} día{s.diasRestantes === 1 ? '' : 's'}.</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => df.pagarSuscripcion()}
        style={{ background: '#FEF3C7', color: '#78350F', border: 'none', borderRadius: 7, padding: '6px 16px', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
      >
        Pagar renta ${s.mensual.toLocaleString('es-CO')} →
      </button>
    </div>
  );
}

/** Muro de pago: se muestra cuando la tienda no ha pagado el valor inicial o venció la renta. */
function Paywall({ df }: { df: DealFlowState }) {
  const s = df.suscripcion;
  const money = (n: number) => '$' + (n || 0).toLocaleString('es-CO');
  const vencida = s?.estado === 'vencida';
  const cargando = suscMsgEsPago(df.suscMsg);

  // Cupón: se aplica tanto a la instalación como a la renta. Puede ser % o precio fijo.
  const [cuponInput, setCuponInput] = useState('');
  const [cupon, setCupon] = useState<{ codigo: string; descuento: number; montoFijo: number | null } | null>(null);
  const [cuponMsg, setCuponMsg] = useState('');
  const conDesc = (base: number) => {
    if (!cupon) return base;
    if (cupon.montoFijo != null) return Math.max(0, cupon.montoFijo); // precio fijo: paga solo eso
    return Math.max(0, Math.round(base * (100 - cupon.descuento) / 100));
  };
  const etiquetaCupon = cupon ? (cupon.montoFijo != null ? (cupon.montoFijo <= 0 ? 'gratis' : `paga solo ${money(cupon.montoFijo)}`) : `${cupon.descuento}% de descuento`) : '';
  const aplicarCupon = () => {
    const code = cuponInput.trim();
    if (!code) return;
    setCuponMsg('Validando…');
    void df.validarCupon(code).then((r) => {
      if (r.error || !r.data?.valido) { setCupon(null); setCuponMsg(r.data?.mensaje || r.error || 'Cupón inválido.'); return; }
      setCupon({ codigo: r.data.codigo || code.toUpperCase(), descuento: r.data.descuento, montoFijo: r.data.montoFijo });
      setCuponMsg(r.data.mensaje);
    });
  };
  const quitarCupon = () => { setCupon(null); setCuponInput(''); setCuponMsg(''); };
  const codigoCupon = cupon?.codigo;

  const cuponBox = (
    <div style={{ marginTop: 20, borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
      {!cupon ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <input
            value={cuponInput}
            onChange={(e) => setCuponInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aplicarCupon(); }}
            placeholder="¿Tienes un cupón? Escríbelo aquí"
            style={{ flex: '1 1 220px', maxWidth: 300, border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, textTransform: 'uppercase' }}
          />
          <button onClick={aplicarCupon} style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Aplicar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', color: '#047857', fontSize: 13.5, fontWeight: 700 }}>
          🎁 Cupón <b>{cupon.codigo}</b> · {etiquetaCupon}
          <button onClick={quitarCupon} style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>quitar</button>
        </div>
      )}
      {cuponMsg && !cupon && <div style={{ textAlign: 'center', color: '#B91C1C', fontSize: 12.5, marginTop: 8 }}>{cuponMsg}</div>}
    </div>
  );

  // Un agente (no dueño) no paga: solo ve el aviso de cuenta suspendida.
  if (df.esAgente) {
    return (
      <PaywallShell df={df} titulo="Cuenta en pausa" sub="El dueño de la tienda debe ponerse al día con el pago para reactivar el acceso.">
        <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.6, textAlign: 'center' }}>
          Escríbele al dueño de la cuenta para que renueve la suscripción de DealFlow. En cuanto pague, tu acceso vuelve automáticamente.
        </div>
      </PaywallShell>
    );
  }

  if (vencida) {
    const rentaBase = s?.mensual || 0;
    const renta = conDesc(rentaBase);
    return (
      <PaywallShell df={df} titulo="Tu renta mensual venció" sub={`Renueva tu plan ${s?.plan} para volver a entrar a tu tienda.`}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>Renta mensual · plan {s?.plan}</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#0F172A', marginBottom: 16 }}>
            {cupon && <span style={{ fontSize: 18, fontWeight: 600, color: '#94A3B8', textDecoration: 'line-through', marginRight: 8 }}>{money(rentaBase)}</span>}
            {money(renta)}<span style={{ fontSize: 15, fontWeight: 600, color: '#64748B' }}> /mes</span>
          </div>
          <button onClick={() => df.pagarSuscripcion(undefined, codigoCupon)} disabled={cargando} className="df-pw-btn" style={pwBtn}>
            {cargando ? 'Abriendo el pago…' : renta <= 0 ? 'Renovar gratis con el cupón →' : `Pagar renta ${money(renta)} →`}
          </button>
        </div>
        {cuponBox}
      </PaywallShell>
    );
  }

  // Sin plan: elegir y comprar (valor inicial + renta).
  return (
    <PaywallShell df={df} titulo="Elige tu plan para empezar" sub="Actívate con el pago de instalación única (incluye 30 días de servicio). Después, una renta mensual de $250.000.">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        {df.planes.length === 0 && <div style={{ color: '#64748B', fontSize: 14, textAlign: 'center', gridColumn: '1/-1' }}>Cargando planes…</div>}
        {df.planes.map((p, i) => {
          const premium = i === df.planes.length - 1 && df.planes.length > 1;
          return (
            <div key={p.nombre} style={{ border: premium ? '2px solid #059669' : '1px solid #E2E8F0', borderRadius: 16, padding: 22, background: '#fff', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {premium && <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#059669', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>RECOMENDADO</div>}
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{p.nombre}</div>
              <div style={{ margin: '10px 0 1px' }}>
                {cupon && <span style={{ fontSize: 17, fontWeight: 600, color: '#94A3B8', textDecoration: 'line-through', marginRight: 7 }}>{money(p.precio)}</span>}
                <span style={{ fontSize: 30, fontWeight: 800, color: cupon ? '#047857' : '#0F172A' }}>{money(conDesc(p.precio))}</span>
                <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}> instalación única</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>Incluye 30 días de servicio{cupon ? ` · cupón: ${etiquetaCupon}` : ''}</div>
              <div style={{ fontSize: 13.5, color: '#059669', fontWeight: 700, marginBottom: 14 }}>+ {money(conDesc(p.mensual))} / mes de renta</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#334155', lineHeight: 1.4 }}>
                    <span style={{ color: '#059669', fontWeight: 800 }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => df.pagarSuscripcion(p.nombre, codigoCupon)}
                disabled={cargando}
                className="df-pw-btn"
                style={{ ...pwBtn, background: premium ? 'linear-gradient(135deg,#34D399,#059669)' : '#0F172A' }}
              >
                {cargando ? 'Abriendo…' : conDesc(p.precio) <= 0 ? `Activar ${p.nombre} gratis` : `Comprar ${p.nombre}`}
              </button>
            </div>
          );
        })}
      </div>
      {cuponBox}
    </PaywallShell>
  );
}

const pwBtn: React.CSSProperties = {
  width: '100%',
  background: 'linear-gradient(135deg,#34D399,#059669)',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  padding: '13px 18px',
  fontFamily: 'inherit',
  fontWeight: 800,
  fontSize: 15,
  cursor: 'pointer',
  boxShadow: '0 10px 26px -12px rgba(16,185,129,.5)',
};

function suscMsgEsPago(msg: string) {
  return msg === 'Abriendo el pago…';
}

function PaywallShell({ df, titulo, sub, children }: { df: DealFlowState; titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(158deg,#071120 0%,#0A1B2E 46%,#07271F 100%)', fontFamily: "'Inter',system-ui,sans-serif", padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color: '#F1F5F9' }}>DealFlow</span>
      </div>
      <div style={{ width: 720, maxWidth: '100%', background: 'rgba(255,255,255,.97)', borderRadius: 22, padding: 30, boxShadow: '0 30px 80px -20px rgba(0,0,0,.55)' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', letterSpacing: '-0.01em' }}>{titulo}</div>
          <div style={{ color: '#64748B', fontSize: 14, marginTop: 6, maxWidth: 460, marginInline: 'auto', lineHeight: 1.5 }}>{sub}</div>
        </div>
        {children}
        {df.suscMsg && !suscMsgEsPago(df.suscMsg) && (
          <div style={{ marginTop: 16, textAlign: 'center', color: '#B91C1C', fontSize: 13, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 12px' }}>{df.suscMsg}</div>
        )}
        {df.misTiendas.length > 1 && (
          <div style={{ marginTop: 18, borderTop: '1px solid #E2E8F0', paddingTop: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, marginBottom: 8 }}>IR A OTRA DE MIS TIENDAS</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {df.misTiendas.filter((t) => !t.activa).map((t) => (
                <button key={t.id} onClick={() => df.cambiarTienda(t.id)} style={{ background: '#F1F5F9', color: '#334155', border: 'none', borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                  {t.nombre}{t.bloqueada ? ' · pago pendiente' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={df.logout} style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cerrar sesión</button>
        </div>
      </div>
      <div style={{ color: 'rgba(226,232,240,.5)', fontSize: 12, marginTop: 16, textAlign: 'center', maxWidth: 440, lineHeight: 1.5 }}>
        Pago seguro con Wompi (Bancolombia). Tu cuenta se activa automáticamente al confirmarse el pago.
      </div>
    </div>
  );
}

function AdminContent({ df }: { df: DealFlowState }) {
  // El superadmin solo tiene su panel de todas las tiendas.
  if (df.isSuperadmin) return <Superadmin df={df} />;
  return (
    <>
      {df.adminSection === 'ventas' && <Ventas df={df} />}
      {df.adminSection === 'planes' && <Planes df={df} />}
      {df.adminSection === 'cuentas' && <Cuentas df={df} />}
      {df.adminSection === 'cupones' && <Cupones df={df} />}
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
          {df.isVendedor && df.section === 'flujos' && <Flujos df={df} />}
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
        {df.isVendedor && df.section === 'productos' && <Productos df={df} />}
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

  // Preloader de bots: aparece al abrir la app con sesión activa y también
  // justo después de iniciar sesión.
  const [splash, setSplash] = useState(false);
  const prevLogged = useRef(false);
  useEffect(() => {
    if (df.isLoggedIn && !prevLogged.current) {
      setSplash(true);
      const t = setTimeout(() => setSplash(false), 2200);
      prevLogged.current = true;
      return () => clearTimeout(t);
    }
    prevLogged.current = df.isLoggedIn;
  }, [df.isLoggedIn]);

  if (!df.isLoggedIn) return <Login df={df} />;
  // Muro de pago: la tienda no accede a nada hasta activar su plan (pagar el inicial) o ponerse al día con la renta.
  if (df.isVendedor && df.suscripcion?.bloqueado) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
        {df.impersonando && <ImpersonationBanner df={df} />}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}><Paywall df={df} /></div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {splash && <BotPreloader />}
      {df.impersonando && <ImpersonationBanner df={df} />}
      {df.isVendedor && <SuscripcionBanner df={df} />}
      <div style={{ flex: 1, minHeight: 0 }}>{isMobile ? <MobileApp df={df} /> : <DesktopApp df={df} />}</div>
    </div>
  );
}

export default App;
