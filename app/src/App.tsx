import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { BotPreloader } from './components/BotPreloader';
import { InstalarAppPopup, esAppInstalada, esIOS } from './components/InstalarAppPopup';
import { Login } from './components/Login';
import { OrderDetailPanel } from './components/OrderDetailPanel';
import { OrderToast } from './components/OrderToast';
import { DialogHost } from './components/dialogs';
import { ProcesoOverlay } from './components/Proceso';
import { ManualOrderModal } from './components/ManualOrderModal';
import { CompletarPedidoModal } from './components/CompletarPedidoModal';
import { EditarPedidoModal } from './components/EditarPedidoModal';
import { Trazabilidad } from './sections/admin/Trazabilidad';
import { AsistenteSoporte } from './components/AsistenteSoporte';
import { Proveedores } from './sections/admin/Proveedores';
import { Dropdown } from './components/Dropdown';
import { apiSoporteTiendas, apiSoporteCambiar } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { FloatingNav } from './components/FloatingNav';
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
import { Logistica } from './sections/Logistica';
import { Productos } from './sections/Productos';
import { Equipo } from './sections/Equipo';
import { DealShop } from './sections/DealShop';
import { Biblioteca } from './sections/Biblioteca';
import { Landings } from './sections/Landings';
import { Resumen } from './sections/Resumen';
import { Estadisticas } from './sections/Estadisticas';
import { WhatsAppSection } from './sections/WhatsApp';
import { Cuentas } from './sections/admin/Cuentas';
import { PlantillasWA } from './sections/admin/PlantillasWA';
import { Planes } from './sections/admin/Planes';
import { Cupones } from './sections/admin/Cupones';
import { Contabilidad } from './sections/admin/Contabilidad';
import { Superadmin, BibliotecaAdmin } from './sections/admin/Superadmin';
import { MCRM } from './sections/mobile/MCRM';
import { MLeads } from './sections/mobile/MLeads';
import { MPedidos } from './sections/mobile/MPedidos';
import { MResumen } from './sections/mobile/MResumen';

const DURACION_BOOT = 4400; // ms del preloader completo tras iniciar sesión

/**
 * Barra de modo soporte (admin dentro de una tienda): una línea finita con un
 * botón para volver al panel y un selector para saltar a otra tienda sin salir.
 */
function ImpersonationBanner({ df }: { df: DealFlowState }) {
  const [tiendas, setTiendas] = useState<{ id: string; nombre: string }[]>([]);
  const [actual, setActual] = useState('');
  const [cambiando, setCambiando] = useState(false);
  useEffect(() => {
    void apiSoporteTiendas().then((r) => { if (r.data) { setTiendas(r.data.tiendas); setActual(r.data.actual || ''); } });
  }, []);
  const cambiar = (id: string) => {
    if (!id || id === actual || cambiando) return;
    setCambiando(true);
    void apiSoporteCambiar(id).then((r) => {
      if (r.error) { setCambiando(false); return; }
      window.location.reload();
    });
  };
  const opciones = tiendas.length ? tiendas.map((t) => ({ value: t.id, label: t.nombre })) : [{ value: actual, label: df.tiendaImpersonada || 'Tienda' }];
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 30, boxSizing: 'border-box',
        background: 'var(--df-alert-brown)', color: '#FEF3C7', padding: '0 10px',
        fontFamily: df.theme === 'noche' ? "'Inter',system-ui,sans-serif" : "'Plus Jakarta Sans',system-ui,sans-serif", fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden',
      }}
    >
      <button
        onClick={df.volverAlAdmin}
        title="Volver al panel de administración"
        aria-label="Volver al panel de administración"
        style={{ width: 22, height: 22, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.16)', color: '#fff', border: '1px solid rgba(255,255,255,.28)', borderRadius: 6, cursor: 'pointer', padding: 0 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
      </button>
      <Dropdown variant="pill" compacto ariaLabel="Cambiar de tienda" value={actual} options={opciones} onChange={cambiar} buscar={tiendas.length > 6} />
      <span style={{ opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cambiando ? 'Cambiando de tienda…' : 'Modo soporte · los cambios afectan la tienda real'}</span>
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
        background: 'var(--df-alert-brown)',
        color: '#FEF3C7',
        padding: '9px 16px',
        fontFamily: df.theme === 'noche' ? "'Inter',system-ui,sans-serif" : "'Plus Jakarta Sans',system-ui,sans-serif",
        fontSize: 13.5,
        fontWeight: 600,
      }}
    >
      <span>⏳ Tu renta mensual (plan {s.plan}) vence en {s.diasRestantes} día{s.diasRestantes === 1 ? '' : 's'}.</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => df.pagarSuscripcion()}
        style={{ background: 'var(--df-warning-subtle)', color: 'var(--df-alert-brown)', border: 'none', borderRadius: 7, padding: '6px 16px', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
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
    <div style={{ marginTop: 20, borderTop: '1px solid var(--df-border)', paddingTop: 16 }}>
      {!cupon ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <input
            value={cuponInput}
            onChange={(e) => setCuponInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aplicarCupon(); }}
            placeholder="¿Tienes un cupón? Escríbelo aquí"
            style={{ flex: '1 1 220px', maxWidth: 300, border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, textTransform: 'uppercase' }}
          />
          <button onClick={aplicarCupon} style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Aplicar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', color: 'var(--df-brand-dark)', fontSize: 13.5, fontWeight: 700 }}>
          🎁 Cupón <b>{cupon.codigo}</b> · {etiquetaCupon}
          <button onClick={quitarCupon} style={{ background: 'transparent', border: 'none', color: 'var(--df-text-faint)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>quitar</button>
        </div>
      )}
      {cuponMsg && !cupon && <div style={{ textAlign: 'center', color: 'var(--df-danger-dark)', fontSize: 12.5, marginTop: 8 }}>{cuponMsg}</div>}
    </div>
  );

  // Un agente (no dueño) no paga: solo ve el aviso de cuenta suspendida.
  if (df.esAgente) {
    return (
      <PaywallShell df={df} titulo="Cuenta en pausa" sub="El dueño de la tienda debe ponerse al día con el pago para reactivar el acceso.">
        <div style={{ color: 'var(--df-text-body)', fontSize: 14, lineHeight: 1.6, textAlign: 'center' }}>
          Escríbele al dueño de la cuenta para que renueve la suscripción de DealFlow. En cuanto pague, tu acceso vuelve automáticamente.
        </div>
      </PaywallShell>
    );
  }

  if (vencida) {
    const rentaBase = s?.mensual || 0;
    const renta = conDesc(rentaBase);
    // Tienda extra recién creada (nunca pagó): no "venció", solo falta activarla.
    const nueva = !!s?.primeraVez;
    return (
      <PaywallShell
        df={df}
        titulo={nueva ? 'Activa tu nueva tienda' : 'Tu renta mensual venció'}
        sub={nueva
          ? `Esta tienda extra usa el plan ${s?.plan}. Paga la primera renta mensual y queda lista al instante (sin instalación).`
          : `Renueva tu plan ${s?.plan} para volver a entrar a tu tienda.`}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--df-text-muted)', marginBottom: 6 }}>Renta mensual · plan {s?.plan}</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--df-text)', marginBottom: 16 }}>
            {cupon && <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--df-text-faint)', textDecoration: 'line-through', marginRight: 8 }}>{money(rentaBase)}</span>}
            {money(renta)}<span style={{ fontSize: 15, fontWeight: 600, color: 'var(--df-text-muted)' }}> /mes</span>
          </div>
          <button onClick={() => df.pagarSuscripcion(undefined, codigoCupon)} disabled={cargando} className="df-pw-btn" style={pwBtn}>
            {cargando
              ? 'Abriendo el pago…'
              : renta <= 0
                ? (nueva ? 'Activar gratis con el cupón →' : 'Renovar gratis con el cupón →')
                : (nueva ? `Activar por ${money(renta)} →` : `Pagar renta ${money(renta)} →`)}
          </button>
        </div>
        {cuponBox}
      </PaywallShell>
    );
  }

  // Sin plan: elegir y comprar (valor inicial + renta).
  return (
    <PaywallShell df={df} titulo="Activa tu cuenta DealFlow" sub="Un solo paquete: pagas la instalación una vez (incluye 30 días de servicio) y luego una mensualidad.">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: df.planes.length === 1 ? 'minmax(0, 380px)' : 'repeat(auto-fit, minmax(230px, 1fr))', justifyContent: 'center' }}>
        {df.planes.length === 0 && <div style={{ color: 'var(--df-text-muted)', fontSize: 14, textAlign: 'center', gridColumn: '1/-1' }}>Cargando planes…</div>}
        {df.planes.map((p, i) => {
          const premium = i === df.planes.length - 1 && df.planes.length > 1;
          return (
            <div key={p.nombre} style={{ border: premium ? '2px solid var(--df-brand)' : '1px solid var(--df-border)', borderRadius: 16, padding: 22, background: 'var(--df-surface)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {premium && <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: 'var(--df-brand)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>RECOMENDADO</div>}
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--df-text)' }}>{p.nombre}</div>
              <div style={{ margin: '10px 0 1px' }}>
                {cupon && <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--df-text-faint)', textDecoration: 'line-through', marginRight: 7 }}>{money(p.precio)}</span>}
                <span style={{ fontSize: 30, fontWeight: 800, color: cupon ? 'var(--df-brand-dark)' : '#0F172A' }}>{money(conDesc(p.precio))}</span>
                <span style={{ fontSize: 13, color: 'var(--df-text-muted)', fontWeight: 600 }}> instalación única</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginBottom: 8 }}>Incluye 30 días de servicio{cupon ? ` · cupón: ${etiquetaCupon}` : ''}</div>
              <div style={{ fontSize: 13.5, color: 'var(--df-brand)', fontWeight: 700, marginBottom: 14 }}>+ {money(conDesc(p.mensual))} de mensualidad</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--df-text-body)', lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--df-brand)', fontWeight: 800 }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => df.pagarSuscripcion(p.nombre, codigoCupon)}
                disabled={cargando}
                className="df-pw-btn"
                style={{ ...pwBtn, background: premium ? 'linear-gradient(135deg,var(--df-brand-light),var(--df-brand))' : '#0F172A' }}
              >
                {cargando ? 'Abriendo…' : conDesc(p.precio) <= 0 ? `Activar ${p.nombre} gratis` : `Activar por ${money(conDesc(p.precio))}`}
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
  background: 'linear-gradient(135deg,var(--df-brand-light),var(--df-brand))',
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
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(158deg,#071120 0%,#0A1B2E 46%,#07271F 100%)', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <a href="/inicio" title="Ir a la página de inicio de DealFlow" style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color: '#F1F5F9', textDecoration: 'none' }}>DealFlow</a>
      </div>
      <div className="df-light-scope" style={{ width: 720, maxWidth: '100%', background: 'rgba(255,255,255,.97)', borderRadius: 22, padding: 30, boxShadow: '0 30px 80px -20px rgba(0,0,0,.55)' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--df-text)', letterSpacing: '-0.01em' }}>{titulo}</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 14, marginTop: 6, maxWidth: 460, marginInline: 'auto', lineHeight: 1.5 }}>{sub}</div>
        </div>
        {children}
        {df.suscMsg && !suscMsgEsPago(df.suscMsg) && (
          <div style={{ marginTop: 16, textAlign: 'center', color: 'var(--df-danger-dark)', fontSize: 13, background: 'var(--df-danger-subtle)', border: '1px solid var(--df-danger-border)', borderRadius: 10, padding: '9px 12px' }}>{df.suscMsg}</div>
        )}
        {df.misTiendas.length > 1 && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--df-border)', paddingTop: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--df-text-faint)', fontWeight: 600, marginBottom: 8 }}>IR A OTRA DE MIS TIENDAS</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {df.misTiendas.filter((t) => !t.activa).map((t) => (
                <button key={t.id} onClick={() => df.cambiarTienda(t.id)} style={{ background: 'var(--df-surface-2)', color: 'var(--df-text-body)', border: 'none', borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                  {t.nombre}{t.bloqueada ? ' · pago pendiente' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={df.logout} style={{ background: 'transparent', border: 'none', color: 'var(--df-text-faint)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cerrar sesión</button>
        </div>
      </div>
      <div style={{ color: 'rgba(226,232,240,.5)', fontSize: 12, marginTop: 16, textAlign: 'center', maxWidth: 440, lineHeight: 1.5 }}>
        Pago seguro con Wompi (Bancolombia). Tu cuenta se activa automáticamente al confirmarse el pago.
      </div>
    </div>
  );
}

function AdminContent({ df }: { df: DealFlowState }) {
  // El superadmin tiene TODO lo del admin (ventas, planes, cuentas, cupones,
  // biblioteca) y además su panel de "Todas las tiendas" (visibilidad).
  return (
    <>
      {df.adminSection === 'superadmin' && df.isSuperadmin && <Superadmin df={df} />}
      {df.adminSection === 'plantillas' && df.isSuperadmin && <PlantillasWA df={df} />}
      {df.adminSection === 'trazabilidad' && <Trazabilidad df={df} />}
      {df.adminSection === 'proveedores' && <Proveedores />}
      {df.adminSection === 'contabilidad' && <Contabilidad />}
      {df.adminSection === 'planes' && <Planes df={df} />}
      {df.adminSection === 'cuentas' && <Cuentas df={df} />}
      {df.adminSection === 'cupones' && <Cupones df={df} />}
      {df.adminSection === 'biblioteca' && (
        <section data-screen-label="Biblioteca admin">
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Biblioteca de productos</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 16px' }}>Crea productos (con toda su estructura) que las tiendas pueden importar. Elige si son gratis o de pago y si el cliente puede editarlos o quedan bloqueados.</p>
          <BibliotecaAdmin df={df} />
        </section>
      )}
    </>
  );
}

/** Resplandor del tema Premium que sigue al mouse por el fondo. */
function FocoMouse() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const cont = el?.parentElement;
    if (!el || !cont) return;
    let raf = 0, x = 0, y = 0;
    const pintar = () => { raf = 0; el.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
    const mover = (e: MouseEvent) => {
      const r = cont.getBoundingClientRect();
      x = e.clientX - r.left; y = e.clientY - r.top;
      el.style.opacity = '1';
      if (!raf) raf = requestAnimationFrame(pintar);
    };
    const salir = () => { el.style.opacity = '0'; };
    cont.addEventListener('mousemove', mover);
    cont.addEventListener('mouseleave', salir);
    return () => { cont.removeEventListener('mousemove', mover); cont.removeEventListener('mouseleave', salir); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return <div ref={ref} className="df-foco-mouse" aria-hidden="true" style={{ opacity: 0 }} />;
}

function DesktopApp({ df }: { df: DealFlowState }) {
  return (
    <div
      className={df.theme === 'premium' ? 'df-premium-canvas' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
        minHeight: 600,
        fontFamily: df.theme === 'noche' ? "'Inter',system-ui,sans-serif" : "'Plus Jakarta Sans',system-ui,sans-serif",
        background: df.theme === 'premium' ? undefined : 'var(--df-bg)',
        color: 'var(--df-text-strong)',
        overflow: 'hidden',
      }}
    >
      {df.theme === 'premium' && <div className="df-aurora" aria-hidden="true"><i /><i /><i /><i /></div>}
      {df.theme === 'premium' && <FocoMouse />}
      {df.sidebarVisible && <Sidebar df={df} />}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header df={df} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '26px 28px 40px' }}>
          {df.isVendedor && df.section === 'resumen' && <Resumen df={df} />}
          {df.isVendedor && df.section === 'estadisticas' && <Estadisticas df={df} />}
          {df.isVendedor && df.section === 'productos' && <Productos df={df} />}
          {df.isVendedor && df.section === 'landings' && <Landings df={df} />}
          {df.isVendedor && df.section === 'asistente' && <Asistente df={df} />}
          {df.isVendedor && df.section === 'whatsapp' && <WhatsAppSection df={df} />}
          {df.isVendedor && df.section === 'equipo' && <Equipo df={df} />}
          {df.isVendedor && df.section === 'dealshop' && <DealShop df={df} />}
          {df.isVendedor && df.section === 'biblioteca' && <Biblioteca df={df} />}
          {df.isVendedor && df.section === 'logistica' && <Logistica df={df} />}
          {df.isVendedor && df.section === 'pedidos' && <Pedidos df={df} />}
          {df.isVendedor && df.section === 'leads' && <Leads df={df} />}
          {df.isVendedor && df.section === 'crm' && <CRM df={df} />}
          {df.isVendedor && df.section === 'integraciones' && <Integraciones df={df} />}
          {df.isAdmin && <AdminContent df={df} />}
        </main>
      </div>

      {df.floatingNav && <FloatingNav df={df} />}
      <AsistenteSoporte usuario={df.sessionUser?.email || 'anon'} seccion={df.isAdmin ? `admin/${df.adminSection}` : df.section} oculto={df.hasSelectedOrder} />
      <OrderDetailPanel df={df} />
      <OrderToast df={df} />
      <ManualOrderModal df={df} open={df.crearPedidoAbierto} onClose={df.cerrarCrearPedido} prefill={df.crearPedidoPrefill} />
      <CompletarPedidoModal df={df} />
      <EditarPedidoModal df={df} />
    </div>
  );
}

function MobileApp({ df }: { df: DealFlowState }) {
  return (
    <div
      className={df.theme === 'premium' ? 'df-premium-canvas' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        fontFamily: df.theme === 'noche' ? "'Inter',system-ui,sans-serif" : "'Plus Jakarta Sans',system-ui,sans-serif",
        background: df.theme === 'premium' ? undefined : 'var(--df-bg)',
        color: 'var(--df-text-strong)',
        overflow: 'hidden',
      }}
    >
      {df.theme === 'premium' && <div className="df-aurora" aria-hidden="true"><i /><i /><i /><i /></div>}
      <MobileHeader df={df} />

      <main style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 90px' }}>
        {df.isVendedor && df.section === 'resumen' && <MResumen df={df} />}
        {df.isVendedor && df.section === 'estadisticas' && <Estadisticas df={df} />}
        {df.isVendedor && df.section === 'logistica' && <Logistica df={df} />}
        {df.isVendedor && df.section === 'pedidos' && <MPedidos df={df} />}
        {df.isVendedor && df.section === 'productos' && <Productos df={df} />}
        {df.isVendedor && df.section === 'crm' && <MCRM df={df} />}
        {df.isVendedor && df.section === 'landings' && <Landings df={df} />}
        {df.isVendedor && df.section === 'leads' && <MLeads df={df} />}
        {df.isVendedor && df.section === 'asistente' && <Asistente df={df} />}
        {df.isVendedor && df.section === 'whatsapp' && <WhatsAppSection df={df} />}
        {df.isVendedor && df.section === 'equipo' && <Equipo df={df} />}
        {df.isVendedor && df.section === 'dealshop' && <DealShop df={df} />}
        {df.isVendedor && df.section === 'biblioteca' && <Biblioteca df={df} />}
        {df.isVendedor && df.section === 'integraciones' && <Integraciones df={df} />}
        {df.isAdmin && <AdminContent df={df} />}
      </main>

      {df.floatingNav && <FloatingNav df={df} />}
      <AsistenteSoporte mobile usuario={df.sessionUser?.email || 'anon'} seccion={df.isAdmin ? `admin/${df.adminSection}` : df.section} oculto={df.hasSelectedOrder || df.mobileChatOpen} />
      <MobileDrawer df={df} />
      <MobileChat df={df} />
      <MobileOrderSheet df={df} />
      <OrderToast df={df} mobile />
      <ManualOrderModal df={df} open={df.crearPedidoAbierto} onClose={df.cerrarCrearPedido} prefill={df.crearPedidoPrefill} />
      <CompletarPedidoModal df={df} />
      <EditarPedidoModal df={df} />
    </div>
  );
}

function App() {
  const df = useDealFlowState();
  const isMobile = useIsMobile();

  // Preloader de bots:
  //  - Al INICIAR SESIÓN desde el formulario → secuencia completa de "encendido de
  //    motores" por fases, que SIEMPRE corre hasta el final (aunque el panel ya
  //    haya cargado debajo): es la firma de la marca.
  //  - Al abrir/recargar con la sesión ya activa → carga rápida.
  const [splash, setSplash] = useState<null | 'completo' | 'simple'>(null);
  const vioLogin = useRef(false);
  const [ofrecerInstalar, setOfrecerInstalar] = useState(false);
  const prevLogged = useRef(false);
  useEffect(() => {
    if (df.isLoggedIn && !prevLogged.current) {
      const variante = vioLogin.current ? 'completo' : 'simple';
      vioLogin.current = false;
      prevLogged.current = true;
      setSplash(variante);
      // Tras iniciar sesión (o si viene de "Instala la app" en la landing), ofrecer
      // instalar la app si no se está usando ya instalada.
      const pidioInstalar = typeof location !== 'undefined' && /[?&]instalar=1\b/.test(location.search);
      if ((variante === 'completo' || pidioInstalar) && !esAppInstalada()) setOfrecerInstalar(true);
      const t = setTimeout(() => setSplash(null), variante === 'completo' ? DURACION_BOOT : 1400);
      return () => clearTimeout(t);
    }
    prevLogged.current = df.isLoggedIn;
  }, [df.isLoggedIn]);

  // Mientras confirmamos la sesión con el servidor, mostramos el preloader (no el
  // login ni datos viejos): evita el parpadeo feo al recargar con sesión activa.
  if (df.arrancando) return <BotPreloader variante="simple" />;
  if (!df.isLoggedIn) { vioLogin.current = true; return <Login df={df} />; }
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
      {splash && <BotPreloader variante={splash} duracion={splash === 'completo' ? DURACION_BOOT : undefined} />}
      {!splash && ofrecerInstalar && (df.pwaDisponible || esIOS()) && <InstalarAppPopup df={df} onClose={() => setOfrecerInstalar(false)} />}
      {df.impersonando && <ImpersonationBanner df={df} />}
      {df.isVendedor && <SuscripcionBanner df={df} />}
      <div style={{ flex: 1, minHeight: 0 }}>{isMobile ? <MobileApp df={df} /> : <DesktopApp df={df} />}</div>
      <DialogHost />
      <ProcesoOverlay />
    </div>
  );
}

export default App;
