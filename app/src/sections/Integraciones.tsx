import { apiShopifyPedidosCfg, apiShopifyPedidosGuardar, apiShopifyTraerPedidos, type CfgPedidosShopify } from '../lib/api';
import { useEffect, useRef, useState } from 'react';
import { EffiApiCard } from '../components/EffiApiCard';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from '../components/Dropdown';
import { IntegracionFila, LogoInteg } from '../components/IntegracionFila';
import { DiagnosticoMessenger, CapiCard } from '../components/MetaExtras';

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 };

const GRUPOS: { id: string; titulo: string; sub: string }[] = [
  { id: 'ia', titulo: 'Inteligencia artificial', sub: 'El cerebro de tu asistente. Cada tienda pone sus llaves y paga solo lo que consume.' },
  { id: 'canales', titulo: 'Canales', sub: 'Por dónde atiende y vende tu asistente.' },
  { id: 'envios', titulo: 'Envíos y tiendas', sub: 'Despacha tus pedidos, genera guías y sigue su estado.' },
  { id: 'publicidad', titulo: 'Publicidad', sub: 'Gasto y resultados de tus anuncios, cruzados con tus chats y ventas.' },
];

/** Conexión de Dropi por su API directa (token de integración + URL). Con esto
 *  DealFlow cotiza transportadoras y crea el pedido en Dropi. */
/** Qué hace DealFlow con cada pedido que llega de Shopify. */
function PedidosShopifyCfg({ alTraer }: { alTraer?: () => void }) {
  const [cfg, setCfg] = useState<CfgPedidosShopify | null>(null);
  const [trayendo, setTrayendo] = useState(false);
  const [msg, setMsg] = useState('');
  const traer = () => {
    setTrayendo(true); setMsg('');
    void apiShopifyTraerPedidos().then((r) => {
      setTrayendo(false);
      if (r.error || !r.data) { setMsg(r.error || 'No se pudo consultar Shopify.'); return; }
      const d = r.data;
      setMsg((d.nuevos ? `✅ ${d.nuevos} pedido(s) nuevo(s) traído(s).` : `Sin pedidos nuevos (revisados ${d.revisados} de la última semana).`) + (d.aviso ? ` ⚠️ ${d.aviso}` : ''));
      if (d.nuevos) alTraer?.();
    });
  };
  useEffect(() => { void apiShopifyPedidosCfg().then((r) => r.data && setCfg(r.data)); }, []);
  if (!cfg) return null;
  const cambiar = (k: keyof CfgPedidosShopify) => { const n = { ...cfg, [k]: !cfg[k] }; setCfg(n); void apiShopifyPedidosGuardar({ [k]: n[k] }); };
  const fila = (k: keyof CfgPedidosShopify, titulo: string, ayuda: string) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '7px 0', borderTop: '1px dashed var(--df-border)' }}>
      <input type="checkbox" checked={cfg[k]} onChange={() => cambiar(k)} style={{ marginTop: 2, accentColor: '#5E8E3E' }} />
      <span><b style={{ fontSize: 12.5 }}>{titulo}</b><br /><span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{ayuda}</span></span>
    </label>
  );
  return (
    <div style={{ marginTop: 6 }}>
      {fila('confirmar', 'Confirmar cada pedido por WhatsApp', 'Al comprador le llega la plantilla "confirmacion_pedido_tienda" con botones Sí / No. Si dice No, el chat pasa a tu equipo.')}
      {fila('autoDespacho', 'Despachar solo cuando el cliente confirma', 'Con Effi: se crea la remisión (y la guía si la tienes activa). Al salir la guía, el pedido se marca enviado en Shopify con el número de guía.')}
      {fila('modoPrueba', 'Modo prueba (no crea envíos reales)', 'Para probar o para la revisión de Shopify: simula el despacho con una guía de prueba.')}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px dashed var(--df-border)' }}>
        <button onClick={traer} disabled={trayendo} style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: trayendo ? 0.6 : 1 }}>{trayendo ? 'Revisando Shopify…' : '↻ Traer pedidos de Shopify'}</button>
        <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>También se revisa solo cada 5 minutos.</span>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>{msg}</div>}
    </div>
  );
}

function ShopifyCard({ df }: { df: DealFlowState }) {
  const [abierto, setAbierto] = useState(false);
  const [metodo, setMetodo] = useState<'token' | 'cc'>('cc'); // 'cc' = Client ID + Secret (Dev Dashboard)
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [shopApp, setShopApp] = useState('');
  const [codigo, setCodigo] = useState('');
  const [instalando, setInstalando] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => { void df.cargarShopify?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const conectada = df.shopifyConectado;
  const listo = metodo === 'token' ? !!(shop.trim() && token.trim()) : !!(shop.trim() && clientId.trim() && clientSecret.trim());
  const guardar = () => {
    if (!listo) return;
    setGuardando(true);
    const creds = metodo === 'token' ? { token: token.trim() } : { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
    df.conectarShopify(shop.trim(), creds, (ok) => { setGuardando(false); if (ok) { setAbierto(false); setToken(''); setClientId(''); setClientSecret(''); setShop(''); } });
  };
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, marginTop: 6 };
  const tab = (m: 'token' | 'cc'): React.CSSProperties => ({
    flex: 1, textAlign: 'center', background: metodo === m ? '#5E8E3E' : 'var(--df-bg)', color: metodo === m ? '#fff' : 'var(--df-text-secondary)',
    border: `1px solid ${metodo === m ? '#5E8E3E' : 'var(--df-border)'}`, borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer',
  });
  return (
    <IntegracionFila
      logo={<LogoInteg fondo="#5E8E3E">🛍️</LogoInteg>}
      nombre="Shopify"
      desc={conectada ? <>Conectada a <b>{df.shopifyNombre}</b> ({df.shopifyShop}). Trae productos por SKU y crea pedidos.</> : 'Trae tus productos (por SKU) y crea los pedidos en tu tienda Shopify.'}
      estado={conectada ? 'on' : 'off'}
      abierta={abierto}
      onToggle={() => setAbierto((v) => !v)}
    >
      {df.shopifyAppDisponible && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {conectada ? (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--df-text-body)', lineHeight: 1.5 }}>✓ Conectada{df.shopifyVia === 'app' ? <> con la <b>app DealFlow</b> instalada en tu tienda</> : ''}. Los pedidos nuevos de Shopify llegan a DealFlow.</div>
              <PedidosShopifyCfg alTraer={() => void df.recargarPedidos?.()} />
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>
                <b style={{ color: 'var(--df-text-strong)' }}>Instala DealFlow en tu Shopify con un clic</b> (sin crear apps ni copiar tokens). Escribe tu dominio, acepta en Shopify y queda conectada.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={shopApp} onChange={(e) => setShopApp(e.target.value)} placeholder="mitienda.myshopify.com" style={{ ...inp, marginTop: 0, flex: 1, minWidth: 200 }} />
                <button onClick={() => { if (shopApp.trim()) { setInstalando(true); df.instalarShopifyApp(shopApp.trim(), () => setInstalando(false)); } }} disabled={instalando || !shopApp.trim()} style={{ ...btnPrimary, background: '#5E8E3E', opacity: instalando || !shopApp.trim() ? 0.6 : 1 }}>Instalar en Shopify</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>¿Instalaste DealFlow desde Shopify? Pega el código que te muestra la app:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código de 6 caracteres" maxLength={6} style={{ ...inp, marginTop: 0, width: 200, letterSpacing: '.12em', fontWeight: 700 }} />
                <button onClick={() => { if (codigo.trim()) df.vincularShopifyCodigo(codigo.trim(), (ok) => ok && setCodigo('')); }} disabled={codigo.trim().length !== 6} style={{ ...btnPrimary, opacity: codigo.trim().length !== 6 ? 0.6 : 1 }}>Vincular</button>
              </div>
            </>
          )}
          <button onClick={() => setManual((v) => !v)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: 'var(--df-text-muted)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
            {manual ? 'Ocultar conexión manual' : 'Conexión manual (avanzado: token o Client ID + Secret)'}
          </button>
        </div>
      )}
      {(manual || !df.shopifyAppDisponible) && (<>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }}>
          <b>Mientras Shopify aprueba la app de DealFlow</b>, el comercio puede conectarse así: en <b>dev.shopify.com</b> (Dev Dashboard) crea una app, dale los permisos <b>read_products, read_orders, write_orders, read_merchant_managed_fulfillment_orders y write_merchant_managed_fulfillment_orders</b>, instálala en su tienda y pega aquí el <b>Client ID y el Secret</b>. Los pedidos se traen solos cada 5 min. Hay dos formas de conectar según cómo te dé Shopify las llaves.
        </div>
        <input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="mitienda.myshopify.com" style={inp} />
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button onClick={() => setMetodo('cc')} style={tab('cc')}>Client ID + Secret</button>
          <button onClick={() => setMetodo('token')} style={tab('token')}>Admin API token</button>
        </div>
        {metodo === 'cc' ? (
          <>
            <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 8 }}>Para apps del <b>Dev Dashboard</b> / tiendas de desarrollo. Copia el <b>ID de cliente</b> y el <b>Secreto del cliente</b> de la pestaña Credenciales de tu app.</div>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID (ID de cliente)" style={inp} />
            <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client Secret (shpss_…)" style={inp} />
          </>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 8 }}>Para apps personalizadas instaladas. Pega el <b>Admin API access token</b> que sale al instalar la app (empieza por <b>shpat_</b>).</div>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin API access token (shpat_…)" style={inp} />
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={guardar} disabled={guardando || !listo} style={{ ...btnPrimary, opacity: (guardando || !listo) ? 0.6 : 1 }}>{guardando ? 'Conectando…' : conectada ? 'Cambiar credenciales' : 'Conectar'}</button>
          {conectada && <button onClick={df.desconectarShopify} style={btnGhostRed}>Desconectar</button>}
        </div>
        </>)}
      {conectada && df.shopifyAppDisponible && !manual && <div style={{ marginTop: 4 }}><button onClick={df.desconectarShopify} style={btnGhostRed}>Desconectar</button></div>}
    </IntegracionFila>
  );
}

function DropiApiCard({ df }: { df: DealFlowState }) {
  const [abierto, setAbierto] = useState(false);
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Sin URL guardada, se propone la URL propia de la tienda en DealFlow (no hace falta tener página web).
  useEffect(() => { setUrl(df.dropiIntegrationUrl || df.dropiUrlSugerida || ''); }, [df.dropiIntegrationUrl, df.dropiUrlSugerida]);
  const [copiada, setCopiada] = useState(false);
  const copiar = () => { const u = df.dropiUrlSugerida; if (!u) return; void navigator.clipboard?.writeText(u).then(() => { setCopiada(true); setTimeout(() => setCopiada(false), 1800); }).catch(() => {}); };
  const conectada = df.dropiConectado;
  const guardar = () => {
    if (!token.trim() || !url.trim()) return;
    setGuardando(true);
    df.conectarDropi(token.trim(), url.trim(), (ok) => { setGuardando(false); if (ok) { setAbierto(false); setToken(''); } });
  };
  const pref = df.dropiPreferencia === 'operador' ? 'la elige el operador' : df.dropiPreferencia === 'cheapest' ? 'la más barata' : df.dropiPreferencia === 'auto' ? 'Dropi decide' : 'una fija';
  return (
    <IntegracionFila
      logo={<LogoInteg src="/logos/dropi.jpg" alt="Dropi" />}
      nombre="Dropi"
      desc={conectada ? <>Conectada · {df.dropiIntegrationUrl} · transportadora: <b>{pref}</b></> : 'Cotiza transportadoras, crea el pedido en Dropi y trae la guía.'}
      estado={conectada ? 'on' : 'off'}
      abierta={abierto}
      onToggle={() => { setAbierto((v) => !v); setToken(''); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
          El token se genera en <b>Dropi → Mis Integraciones</b> (tipo WooCommerce). Cuando Dropi te pida la <b>URL de la tienda</b>, pega esta (es la página de tu tienda en DealFlow; no necesitas WordPress ni Dropify):
        </div>
        {df.dropiUrlSugerida && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: '1px dashed var(--df-purple-border)', background: 'var(--df-purple-subtle)', borderRadius: 10, padding: '8px 10px' }}>
            <code style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--df-purple)', overflowWrap: 'anywhere' }}>{df.dropiUrlSugerida}</code>
            <button onClick={copiar} style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }}>{copiada ? '✓ Copiada' : 'Copiar'}</button>
            <a href={df.dropiUrlSugerida} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--df-purple)' }}>Ver</a>
          </div>
        )}
        <div>
          <div style={lbl}>Token de integración</div>
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={conectada ? 'Pega un token nuevo solo si quieres cambiarlo' : 'Pega aquí el token (JWT)'} style={inputStyle} />
        </div>
        <div>
          <div style={lbl}>URL de integración (idéntica a la que pegaste en Dropi)</div>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mitienda.com" style={inputStyle} />
        </div>
        <div>
          <div style={lbl}>Transportadora por defecto</div>
          <Dropdown ariaLabel="Preferencia de transportadora" value={df.dropiPreferencia} onChange={df.guardarDropiPreferencia}
            options={[
              { value: 'operador', label: 'La elige el operador (al enviar)' },
              { value: 'cheapest', label: 'La más barata' },
              { value: 'auto', label: 'Que Dropi decida' },
              { value: 'fixed', label: 'Una fija' },
            ]} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={guardar} disabled={guardando || !token.trim() || !url.trim()} style={{ ...btnPrimary, opacity: guardando || !token.trim() || !url.trim() ? 0.6 : 1 }}>{guardando ? 'Conectando…' : 'Guardar y probar'}</button>
        </div>
      </div>
    </IntegracionFila>
  );
}

/** Tarjeta especial: Administrador de anuncios de Meta (se conecta con el popup de Facebook). */
function MetaAdsCard({ df }: { df: DealFlowState }) {
  const ads = df.adsCuenta;
  const ops = df.adsOpciones;
  const [cuenta, setCuenta] = useState('');
  const [pagina, setPagina] = useState('');
  const conectada = !!ads?.conectada;

  const [abierta, setAbierta] = useState(false);
  return (
    <IntegracionFila
      logo={<LogoInteg fondo="#1877F2">📣</LogoInteg>}
      nombre="Meta Ads (Administrador de anuncios)"
      desc={conectada ? `✓ ${ads!.adAccountNombre}${ads!.pageNombre ? ` · página ${ads!.pageNombre}` : ''}` : 'Trae el gasto, las impresiones y los clics de cada anuncio para ver en Estadísticas el costo por chat, por pedido y el ROAS.'}
      estado={conectada ? 'on' : 'off'}
      abierta={abierta}
      onToggle={() => setAbierta((v) => !v)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!conectada && ops && (
          <>
            <div>
              <div style={lbl}>Cuenta publicitaria</div>
              <Dropdown value={cuenta} onChange={setCuenta} placeholder="Elige una…"
                options={[{ value: '', label: 'Elige una…' }, ...ops.cuentas.map((a) => ({ value: a.id, label: `${a.nombre} (${a.moneda})` }))]} />
            </div>
            <div>
              <div style={lbl}>Página de Facebook</div>
              <Dropdown value={pagina} onChange={setPagina} placeholder="Elige una…"
                options={[{ value: '', label: 'Elige una…' }, ...ops.paginas.map((p) => ({ value: p.id, label: p.nombre }))]} />
            </div>
            <button
              onClick={() => {
                const a = ops.cuentas.find((x) => x.id === cuenta);
                const p = ops.paginas.find((x) => x.id === pagina);
                df.elegirCuentaAds({ adAccountId: cuenta, adAccountNombre: a?.nombre || '', moneda: a?.moneda || '', pageId: pagina, pageNombre: p?.nombre || '' });
              }}
              disabled={!cuenta}
              style={{ ...btnPrimary, opacity: cuenta ? 1 : 0.6, alignSelf: 'flex-start' }}
            >Guardar conexión</button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void df.cambiarCuentaAds()} disabled={df.mkLoading} style={btnGhost}>¿No es tu cuenta? Usar otra cuenta de Facebook</button>
              <button onClick={df.desconectarAds} style={btnGhostRed}>Cancelar</button>
            </div>
          </>
        )}
        {df.mkError && !conectada && <div style={{ color: 'var(--df-danger-dark)', fontSize: 12.5 }}>{df.mkError}</div>}
        {!conectada && !ops && <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Si Facebook entra solo con la cuenta equivocada, cierra sesión en facebook.com o abre DealFlow en una ventana de incógnito.</div>}
        {conectada && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Se actualiza sola cada 30 minutos. Mira los resultados en <b>Estadísticas → Conversión por anuncio</b>.</div>}
        {conectada ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void df.cambiarCuentaAds()} disabled={df.mkLoading} style={btnGhost}>Cambiar de cuenta de Facebook</button>
            <button onClick={df.desconectarAds} style={btnGhostRed}>Desconectar</button>
          </div>
        ) : !ops && (
          <button onClick={df.conectarAds} disabled={df.mkLoading} style={{ ...btnFacebook, opacity: df.mkLoading ? 0.7 : 1, alignSelf: 'flex-start' }}>
            {df.mkLoading ? 'Conectando…' : 'Conectar con Facebook'}
          </button>
        )}
      </div>
    </IntegracionFila>
  );
}

/** Tarjeta de canales de Meta: Messenger + Instagram DM (conexión en un clic). */
function MetaCanalesCard({ df }: { df: DealFlowState }) {
  const e = df.metaEstado;
  const on = e.messenger || e.instagram;
  const [abierta, setAbierta] = useState(false);
  return (
    <IntegracionFila
      logo={<LogoInteg fondo="linear-gradient(135deg,#0084FF,#E1306C)">💬</LogoInteg>}
      nombre="Messenger e Instagram"
      desc={on ? `✓ ${e.paginas.join(', ')} · Messenger${e.instagram ? ' + Instagram' : ''}` : 'Responde los mensajes directos de Facebook e Instagram desde el mismo Inbox, con tu asistente.'}
      estado={on ? 'on' : 'off'}
      abierta={abierta}
      onToggle={() => setAbierta((v) => !v)}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={df.conectarMeta} disabled={df.metaLoading} style={{ ...btnFacebook, opacity: df.metaLoading ? 0.7 : 1 }}>{df.metaLoading ? 'Conectando…' : on ? 'Reconectar' : 'Conectar con Facebook'}</button>
        {on && <button onClick={() => void df.cambiarCuentaMeta()} disabled={df.metaLoading} style={btnGhost}>Cambiar de cuenta de Facebook</button>}
        {on && <button onClick={df.desconectarMeta} style={btnGhostRed}>Desconectar</button>}
      </div>
      {df.metaMsg && <div style={{ fontSize: 12.5, marginTop: 8, color: df.metaMsg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)' }}>{df.metaMsg}</div>}
      {on && <DiagnosticoMessenger />}
    </IntegracionFila>
  );
}

const lbl: React.CSSProperties = { color: 'var(--df-text-muted)', fontSize: 11.5, fontWeight: 600, marginBottom: 4 };
const btnPrimary: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnFacebook: React.CSSProperties = { background: '#1877F2', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' };
const btnGhostRed: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-danger-dark)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' };

export function Integraciones({ df }: { df: DealFlowState }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [predeterminada, setPredeterminada] = useState(false);

  // Al entrar cargamos el estado de la cuenta publicitaria (para la tarjeta de Meta Ads).
  const cargarAds = useRef(df.reloadCampanas);
  cargarAds.current = df.reloadCampanas;
  useEffect(() => { void cargarAds.current(); }, []);

  function abrir(id: string) {
    setAbierta(abierta === id ? null : id);
    setForm({});
    setPredeterminada(false);
  }

  return (
    <section data-screen-label="Integraciones">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Integraciones</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 8px' }}>
        Conecta DealFlow con las herramientas que ya usas. Cada tienda pone sus propias claves y paga solo lo que consume.
      </p>
      <div style={{ background: 'var(--df-brand-subtle-3)', border: '1px solid #BBF7D0', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#166534', margin: '0 0 18px', lineHeight: 1.6 }}>
        🧠 <b>Tu asistente usa dos IA para ahorrar:</b> conecta <b>DeepSeek</b> (escribe los textos, más económico) y <b>OpenAI</b> (transcribe las notas de voz y entiende las imágenes de tus clientes). Con las dos, tu asistente lee, oye y ve.
      </div>
      {df.integracionMsg && (
        <div style={{ background: df.integracionMsg.startsWith('✓') ? 'var(--df-brand-subtle-2)' : 'var(--df-danger-subtle)', border: '1px solid ' + (df.integracionMsg.startsWith('✓') ? 'var(--df-brand-border)' : 'var(--df-danger-border)'), color: df.integracionMsg.startsWith('✓') ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {df.integracionMsg}
        </div>
      )}

      {GRUPOS.map((g) => {
        const items = df.integrations.filter((i) => (i.grupo || 'canales') === g.id);
        const extras = g.id === 'envios' ? 3 : g.id === 'canales' || g.id === 'publicidad' ? 1 : 0;
        if (!items.length && !extras) return null;
        return (
          <div key={g.id} style={{ marginBottom: 26 }}>
            <div style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>{g.titulo}</h2>
              <p style={{ color: 'var(--df-text-faint)', fontSize: 12.5, margin: '2px 0 0' }}>{g.sub}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.id === 'envios' && <EffiApiCard df={df} />}
              {g.id === 'envios' && <DropiApiCard df={df} />}
              {g.id === 'envios' && <ShopifyCard df={df} />}
              {g.id === 'canales' && <MetaCanalesCard df={df} />}
              {g.id === 'publicidad' && <MetaAdsCard df={df} />}
              {g.id === 'publicidad' && <CapiCard />}
              {items.map((i) => {
                if (i.especial === 'meta-ads') return null; // se muestra en Publicidad
                const abiertaEsta = abierta === i.id;
                const configurada = !!df.integracionesCfg[i.id];
                const conectado = i.id === 'wa' ? df.waConnected : configurada;
                const esAgente = i.esIA && df.iaPredeterminada === i.id;
                return (
                  <IntegracionFila
                    key={i.id}
                    logo={<div style={{ ...i.logoStyle, width: 44, height: 44, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i.logoText}</div>}
                    nombre={i.nombre}
                    desc={i.desc}
                    extra={esAgente ? <span title="Este es el agente que responde tus chats" style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 7px' }}>🤖 Agente</span> : undefined}
                    estado={conectado ? 'on' : 'off'}
                    abierta={abiertaEsta}
                    onToggle={() => abrir(i.id)}
                    accion={i.campos ? undefined : { texto: i.id === 'wa' ? 'Ir a WhatsApp →' : conectado ? 'Configurar' : 'Conectar', onClick: () => i.action() }}
                  >
                    {i.campos ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
                        {configurada && (
                          <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>
                            Guardado: {Object.entries(df.integracionesCfg[i.id]).map(([k, v]) => `${k} ${v}`).join(' · ')}
                          </div>
                        )}
                        {i.campos.map((c) => (
                          <div key={c.key}>
                            <div style={lbl}>{c.label}</div>
                            <input
                              className="df-input"
                              type={c.secreto ? 'password' : 'text'}
                              value={form[c.key] || ''}
                              onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                              placeholder={c.placeholder || ''}
                              style={inputStyle}
                            />
                          </div>
                        ))}
                        {i.esIA && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--df-text-body)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={predeterminada} onChange={(e) => setPredeterminada(e.target.checked)} />
                            Usar como agente predeterminado (responde los chats)
                          </label>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => { df.guardarIntegracion(i.id, form, predeterminada); setAbierta(null); }} style={btnPrimary}>Guardar</button>
                          {i.esIA && configurada && !esAgente && (
                            <button onClick={() => df.elegirIaPredeterminada(i.id)} style={{ background: 'var(--df-surface)', color: 'var(--df-brand-dark)', border: '1px solid var(--df-brand-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Hacer agente</button>
                          )}
                          {configurada && (
                            <button onClick={() => { df.eliminarIntegracion(i.id); setAbierta(null); }} style={btnGhostRed}>Desconectar</button>
                          )}
                        </div>
                      </div>
                    ) : undefined}
                  </IntegracionFila>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
