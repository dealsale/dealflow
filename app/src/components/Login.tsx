import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import logo from '../assets/logo.png';

/* Cursor cute: flecha esmeralda con un mini-bot amarillo de compañero. */
const CUR_DEFAULT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M3 2l6.8 18.6 3-7.6 7.8-2.6z' fill='%2334D399' stroke='%23064E3B' stroke-width='1.5' stroke-linejoin='round'/%3E%3Ccircle cx='21.5' cy='4' r='1.2' fill='%23F59E0B'/%3E%3Crect x='21.1' y='4.8' width='0.9' height='1.6' fill='%23B45309'/%3E%3Crect x='16.5' y='6.4' width='10' height='8' rx='2.8' fill='%23FBBF24' stroke='%23854D0E' stroke-width='1.2'/%3E%3Ccircle cx='20' cy='10.2' r='1.1' fill='%23422006'/%3E%3Ccircle cx='23.4' cy='10.2' r='1.1' fill='%23422006'/%3E%3C/svg%3E") 3 2, auto`;
const CUR_POINTER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M3 2l6.8 18.6 3-7.6 7.8-2.6z' fill='%23FBBF24' stroke='%23854D0E' stroke-width='1.5' stroke-linejoin='round'/%3E%3Ccircle cx='21.5' cy='4' r='1.2' fill='%2334D399'/%3E%3Crect x='21.1' y='4.8' width='0.9' height='1.6' fill='%23064E3B'/%3E%3Crect x='16.5' y='6.4' width='10' height='8' rx='2.8' fill='%2334D399' stroke='%23064E3B' stroke-width='1.2'/%3E%3Ccircle cx='20' cy='10' r='1.1' fill='%23052018'/%3E%3Ccircle cx='23.4' cy='10' r='1.1' fill='%23052018'/%3E%3Cpath d='M20 12.2q1.7 1.3 3.4 0' stroke='%23052018' stroke-width='1' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") 3 2, pointer`;

const CSS = `
.df-lg { cursor: ${CUR_DEFAULT}; }
.df-lg button, .df-lg a { cursor: ${CUR_POINTER}; }
.df-lg input { cursor: text; }
@keyframes dfFloat { 0%,100% { transform: translateY(0) rotate(var(--rot,0deg)); } 50% { transform: translateY(-16px) rotate(var(--rot,0deg)); } }
@keyframes dfFloat2 { 0%,100% { transform: translateY(-8px) rotate(var(--rot,0deg)); } 50% { transform: translateY(10px) rotate(var(--rot,0deg)); } }
@keyframes dfBlink { 0%, 91%, 100% { transform: scaleY(1); } 94%, 97% { transform: scaleY(0.08); } }
@keyframes dfWave { 0%,100% { transform: rotate(0deg); } 30% { transform: rotate(-22deg); } 60% { transform: rotate(10deg); } }
@keyframes dfAntena { 0%,100% { opacity:.55; } 50% { opacity:1; } }
@keyframes dfTwinkle { 0%,100% { opacity:.15; transform: scale(.7) rotate(0deg); } 50% { opacity:.9; transform: scale(1.15) rotate(25deg); } }
@keyframes dfCardIn { from { opacity:0; transform: translateY(26px) scale(.96); } to { opacity:1; transform: none; } }
@keyframes dfLogoBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes dfShake { 10%,90% { transform: translateX(-2px); } 20%,80% { transform: translateX(3px); } 30%,70% { transform: translateX(-5px); } 40%,60% { transform: translateX(5px); } 50% { transform: translateX(-3px); } }
@keyframes dfBlob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-20px) scale(1.12); } }
@keyframes dfPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,.45); } 50% { box-shadow: 0 0 0 12px rgba(52,211,153,0); } }
.df-lg-pulse { animation: dfPulse 1.6s ease-out infinite; }
.df-lg-bot { position:absolute; animation: dfFloat var(--dur,6s) ease-in-out infinite; animation-delay: var(--del,0s); filter: drop-shadow(0 14px 22px rgba(0,0,0,.35)); will-change: transform; }
.df-lg-bot.alt { animation-name: dfFloat2; }
.df-lg-eye { transform-origin: center; transform-box: fill-box; animation: dfBlink 4.4s infinite; animation-delay: var(--bdel,0s); }
.df-lg-arm { transform-origin: top center; transform-box: fill-box; animation: dfWave 3.6s ease-in-out infinite; animation-delay: var(--wdel,.6s); }
.df-lg-ant { animation: dfAntena 2s ease-in-out infinite; }
.df-lg-spark { position:absolute; color:#FDE68A; animation: dfTwinkle var(--dur,3s) ease-in-out infinite; animation-delay: var(--del,0s); user-select:none; pointer-events:none; }
.df-lg-card { animation: dfCardIn .6s cubic-bezier(.2,.8,.25,1.1) both .1s; }
.df-lg-card.err { animation: dfShake .5s both; }
.df-lg-logo { animation: dfLogoBob 3.4s ease-in-out infinite; }
.df-lg-btn { position:relative; overflow:hidden; transition: transform .18s, box-shadow .25s; }
.df-lg-btn:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -12px rgba(16,185,129,.55); }
.df-lg-btn::after { content:""; position:absolute; top:0; left:-80%; width:50%; height:100%; background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent); transform:skewX(-20deg); transition:left .5s; }
.df-lg-btn:hover::after { left:130%; }
.df-lg-input { transition: border-color .2s, box-shadow .2s, transform .2s; }
.df-lg-input:focus { outline:none; border-color:#34D399 !important; box-shadow:0 0 0 4px rgba(52,211,153,.18); }
.df-lg-blob { position:absolute; border-radius:50%; filter:blur(80px); pointer-events:none; animation: dfBlob 11s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .df-lg-bot, .df-lg-spark, .df-lg-logo, .df-lg-eye, .df-lg-arm, .df-lg-ant, .df-lg-blob { animation: none !important; }
}
@media (max-width: 640px) { .df-lg-bot.hide-sm { display:none; } }
`;

/** Bot cute: cuerpo redondito, ojos que parpadean, cachetes, antena y bracito que saluda. */
function CuteBot({ body, dark, cheek, size, style, className, blinkDelay = '0s', waveDelay = '.5s' }: {
  body: string; dark: string; cheek: string; size: number;
  style?: React.CSSProperties; className?: string; blinkDelay?: string; waveDelay?: string;
}) {
  return (
    <div className={`df-lg-bot ${className || ''}`} style={style} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        {/* antena */}
        <circle className="df-lg-ant" cx="32" cy="7" r="3.4" fill="#FDE68A" />
        <rect x="30.9" y="9" width="2.2" height="5" rx="1" fill={dark} />
        {/* orejitas */}
        <rect x="6" y="30" width="5" height="10" rx="2.5" fill={dark} />
        <rect x="53" y="30" width="5" height="10" rx="2.5" fill={dark} />
        {/* cuerpo */}
        <rect x="10" y="14" width="44" height="40" rx="15" fill={body} />
        <rect x="10" y="14" width="44" height="40" rx="15" stroke={dark} strokeWidth="2.4" />
        {/* carita (pantalla) */}
        <rect x="16" y="21" width="32" height="24" rx="10" fill={dark} opacity=".92" />
        {/* ojos */}
        <circle className="df-lg-eye" style={{ ['--bdel' as never]: blinkDelay }} cx="26" cy="32" r="3.4" fill="#A7F3D0" />
        <circle className="df-lg-eye" style={{ ['--bdel' as never]: blinkDelay }} cx="38" cy="32" r="3.4" fill="#A7F3D0" />
        {/* sonrisa */}
        <path d="M27 38.5q5 3.6 10 0" stroke="#A7F3D0" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* cachetes */}
        <circle cx="20.5" cy="37" r="2.4" fill={cheek} opacity=".85" />
        <circle cx="43.5" cy="37" r="2.4" fill={cheek} opacity=".85" />
        {/* bracito que saluda */}
        <g className="df-lg-arm" style={{ ['--wdel' as never]: waveDelay }}>
          <rect x="56" y="20" width="5.5" height="14" rx="2.75" fill={body} stroke={dark} strokeWidth="1.8" transform="rotate(28 58 21)" />
        </g>
        {/* patitas */}
        <rect x="20" y="54" width="8" height="6" rx="3" fill={dark} />
        <rect x="36" y="54" width="8" height="6" rx="3" fill={dark} />
      </svg>
    </div>
  );
}

export function Login({ df }: { df: DealFlowState }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const entrar = () => df.login(email, password);

  return (
    <div
      className="df-lg"
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(158deg,#071120 0%,#0A1B2E 46%,#07271F 100%)',
        fontFamily: "'Inter',system-ui,sans-serif",
        color: '#1E293B',
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{CSS}</style>

      {/* blobs de luz */}
      <div className="df-lg-blob" style={{ width: 440, height: 440, top: -140, right: -100, background: 'radial-gradient(circle, rgba(16,185,129,.24), transparent 68%)' }} />
      <div className="df-lg-blob" style={{ width: 380, height: 380, bottom: -120, left: -110, background: 'radial-gradient(circle, rgba(245,158,11,.16), transparent 70%)', animationDelay: '-5s' }} />

      {/* bots cute flotando */}
      <CuteBot body="#34D399" dark="#064E3B" cheek="#FCA5A5" size={92} style={{ top: '12%', left: '9%', ['--dur' as never]: '6.5s' }} blinkDelay="0s" waveDelay=".4s" />
      <CuteBot body="#FBBF24" dark="#78350F" cheek="#FDA4AF" size={68} className="alt" style={{ top: '64%', left: '16%', ['--dur' as never]: '7.5s', ['--rot' as never]: '-7deg' }} blinkDelay="1.2s" waveDelay="1.4s" />
      <CuteBot body="#93C5FD" dark="#1E3A8A" cheek="#F9A8D4" size={76} style={{ top: '18%', right: '11%', ['--dur' as never]: '8s', ['--rot' as never]: '6deg' }} blinkDelay="2.1s" waveDelay="2s" />
      <CuteBot body="#F9A8D4" dark="#831843" cheek="#FDE68A" size={60} className="alt hide-sm" style={{ bottom: '14%', right: '17%', ['--dur' as never]: '6s', ['--rot' as never]: '-5deg' }} blinkDelay="3s" waveDelay=".9s" />
      <CuteBot body="#C4B5FD" dark="#4C1D95" cheek="#FCA5A5" size={54} className="hide-sm" style={{ bottom: '30%', left: '38%', ['--dur' as never]: '9s', ['--rot' as never]: '4deg', opacity: 0.5 }} blinkDelay="1.7s" waveDelay="2.6s" />

      {/* sparkles */}
      {[
        { top: '9%', left: '30%', fs: 18, dur: '2.6s', del: '0s' },
        { top: '30%', left: '5%', fs: 13, dur: '3.4s', del: '.7s' },
        { top: '74%', left: '8%', fs: 16, dur: '3s', del: '1.4s' },
        { top: '12%', right: '28%', fs: 14, dur: '2.8s', del: '.4s' },
        { top: '58%', right: '9%', fs: 19, dur: '3.6s', del: '1s' },
        { top: '84%', right: '30%', fs: 13, dur: '2.4s', del: '1.8s' },
      ].map((s, i) => (
        <span key={i} className="df-lg-spark" style={{ top: s.top, left: s.left, right: s.right, fontSize: s.fs, ['--dur' as never]: s.dur, ['--del' as never]: s.del }}>✦</span>
      ))}

      {df.pwaDisponible && (
        <button
          onClick={df.instalarPwa}
          className={`df-lg-btn${typeof location !== 'undefined' && location.search.includes('instalar=1') ? ' df-lg-pulse' : ''}`}
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 3, background: 'rgba(16,185,129,.14)', color: '#A7F3D0', border: '1px solid rgba(52,211,153,.4)', borderRadius: 999, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          📲 Instalar la app
        </button>
      )}

      <div style={{ width: 384, maxWidth: '100%', position: 'relative', zIndex: 2 }}>
        <div className="df-lg-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
          <img src={logo} alt="DealFlow" style={{ width: 42, height: 38, objectFit: 'contain', filter: 'drop-shadow(0 6px 14px rgba(16,185,129,.4))' }} />
          <span style={{ fontWeight: 800, fontSize: 23, letterSpacing: '-0.02em', color: '#F1F5F9' }}>DealFlow</span>
        </div>

        <div
          className={`df-lg-card${df.loginError ? ' err' : ''}`}
          style={{
            background: 'rgba(255,255,255,.94)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,.6)',
            borderRadius: 20,
            padding: 28,
            boxShadow: '0 30px 80px -20px rgba(0,0,0,.55), 0 0 0 1px rgba(16,185,129,.08)',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 2, letterSpacing: '-0.01em' }}>¡Hola de nuevo! 👋</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>Tu tienda y tu asistente de WhatsApp te están esperando.</div>

          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Correo</div>
          <input
            className="df-lg-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              df.clearLoginError();
            }}
            placeholder="tucorreo@tienda.co"
            autoComplete="username"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, marginBottom: 12, minHeight: 44, background: '#fff' }}
          />
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Contraseña</div>
          <input
            className="df-lg-input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              df.clearLoginError();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') entrar();
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, marginBottom: 14, minHeight: 44, background: '#fff' }}
          />
          {df.loginError && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#DC2626', fontSize: 13, marginBottom: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 12px' }}>
              <span>🤖</span>
              <span>{df.loginError}</span>
            </div>
          )}
          <button
            onClick={entrar}
            className="df-lg-btn"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg,#34D399,#059669)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: 14,
              fontFamily: 'inherit',
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: '.01em',
              boxShadow: '0 10px 26px -10px rgba(16,185,129,.5)',
            }}
          >
            Entrar a mi tienda →
          </button>
        </div>

        {!df.apiMode && (
          <div style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(52,211,153,.35)', borderRadius: 12, padding: '12px 16px', marginTop: 14, fontSize: 12.5, color: '#A7F3D0', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Cuentas de la demo</div>
            Vendedora: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>karla@lunaaccesorios.co · demo123</span>
            <br />
            Admin: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>admin@dealflow.co · admin123</span>
          </div>
        )}
      </div>
    </div>
  );
}
