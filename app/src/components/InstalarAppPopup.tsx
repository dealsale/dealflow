import type { DealFlowState } from '../hooks/useDealFlowState';
import logo from '../assets/logo.png';

/** ¿La app ya corre instalada (PWA en pantalla completa)? */
export function esAppInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}

/** iPhone/iPad: Safari no dispara el aviso de instalación; se instala desde "Compartir". */
export function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const CSS = `
@keyframes dfInsIn { from { opacity:0; transform: translateY(28px) scale(.97) } to { opacity:1; transform:none } }
@keyframes dfInsSpin { to { transform: rotate(360deg) } }
.df-ins { position: fixed; right: 22px; bottom: 22px; z-index: 1200; width: 370px; max-width: calc(100vw - 24px); border-radius: 22px; padding: 1.5px; overflow: hidden; animation: dfInsIn .5s cubic-bezier(.2,.8,.2,1) both; box-shadow: 0 30px 80px -20px rgba(0,0,0,.7); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
.df-ins::before { content:""; position:absolute; inset:-60%; background: conic-gradient(from 0deg, transparent 0 60%, #46D8FF 72%, #7658FF 82%, #34D399 90%, transparent 96%); animation: dfInsSpin 6s linear infinite; }
.df-ins-in { position: relative; border-radius: 21px; background: linear-gradient(160deg, rgba(14,19,42,.98), rgba(8,11,28,.99)); padding: 20px 20px 18px; color: #EEF3FF; }
.df-ins-x { position:absolute; top:12px; right:12px; width:28px; height:28px; border-radius:9px; border:1px solid rgba(134,154,255,.2); background: rgba(255,255,255,.03); color:#9AA8C9; cursor:pointer; display:grid; place-items:center; font-size:13px; }
.df-ins-x:hover { color:#fff; border-color: rgba(134,154,255,.45); }
.df-ins-li { display:flex; align-items:center; gap:10px; font-size:13px; color:#C6D0EA; padding:5px 0; }
.df-ins-li i { font-style:normal; width:26px; height:26px; border-radius:8px; display:grid; place-items:center; background: linear-gradient(120deg, rgba(46,139,255,.16), rgba(176,90,255,.14)); border:1px solid rgba(134,154,255,.25); font-size:13px; flex-shrink:0; }
.df-ins-btn { flex:1; border:none; border-radius:12px; padding:12px; font-family:inherit; font-weight:800; font-size:14px; color:#fff; cursor:pointer; background: linear-gradient(120deg, #10B981 0%, #2E8BFF 55%, #7658FF 100%); box-shadow: 0 12px 28px -12px rgba(46,139,255,.6); transition: transform .18s; }
.df-ins-btn:hover { transform: translateY(-1px); }
.df-ins-sec { border:1px solid rgba(134,154,255,.3); background: transparent; color:#9AA8C9; border-radius:12px; padding:12px 16px; font-family:inherit; font-weight:700; font-size:13.5px; cursor:pointer; }
.df-ins-sec:hover { color:#fff; }
@media (max-width: 560px) { .df-ins { left: 12px; right: 12px; bottom: 12px; width: auto; } }
`;

/**
 * Invitación a instalar la app, como ventana flotante (no un botón fijo en el
 * login). Aparece justo después de iniciar sesión cuando NO se está usando la app
 * instalada; se cierra con "Ahora no" y vuelve a ofrecerse en el siguiente login.
 */
export function InstalarAppPopup({ df, onClose }: { df: DealFlowState; onClose: () => void }) {
  const ios = esIOS() && !df.pwaDisponible;
  const instalar = () => { df.instalarPwa(); onClose(); };
  return (
    <div className="df-ins" role="dialog" aria-label="Instalar la app de DealFlow">
      <style>{CSS}</style>
      <div className="df-ins-in">
        <button className="df-ins-x" onClick={onClose} aria-label="Cerrar">✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingRight: 30 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(134,154,255,.3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <img src={logo} alt="" style={{ width: 32, height: 28, objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>Instala DealFlow</div>
            <div style={{ fontSize: 12.5, color: '#9AA8C9', marginTop: 2 }}>Tu tienda a un toque, como una app más.</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="df-ins-li"><i>⚡</i>Abre directo desde tu escritorio o celular</div>
          <div className="df-ins-li"><i>🔔</i>Avisos al instante de pedidos y chats nuevos</div>
          <div className="df-ins-li"><i>🖥️</i>Pantalla completa, sin pestañas del navegador</div>
        </div>

        {ios ? (
          <>
            <div style={{ fontSize: 12.5, color: '#C6D0EA', lineHeight: 1.6, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(134,154,255,.18)', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
              En Safari toca <b>Compartir</b> <span style={{ fontSize: 14 }}>⎋</span> y luego <b>“Agregar a inicio”</b>.
            </div>
            <div style={{ display: 'flex' }}>
              <button className="df-ins-btn" onClick={onClose}>Entendido</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="df-ins-sec" onClick={onClose}>Ahora no</button>
            <button className="df-ins-btn" onClick={instalar}>📲 Instalar ahora</button>
          </div>
        )}
      </div>
    </div>
  );
}
