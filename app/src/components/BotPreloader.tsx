import logo from '../assets/logo.png';

const CSS = `
@keyframes dfplJump { 0%,100% { transform: translateY(0) scaleY(1); } 30% { transform: translateY(-22px) scaleY(1.04); } 50% { transform: translateY(0) scaleY(.92); } 62% { transform: translateY(-8px) scaleY(1.01); } 74% { transform: translateY(0) scaleY(1); } }
@keyframes dfplShadow { 0%,100% { transform: scaleX(1); opacity:.35; } 30% { transform: scaleX(.6); opacity:.18; } 50% { transform: scaleX(1.05); opacity:.4; } }
@keyframes dfplBlink { 0%,88%,100% { transform: scaleY(1); } 92%,96% { transform: scaleY(.08); } }
@keyframes dfplAnt { 0%,100% { opacity:.5; } 50% { opacity:1; } }
@keyframes dfplDots { 0%,80%,100% { transform: translateY(0); opacity:.35; } 40% { transform: translateY(-7px); opacity:1; } }
@keyframes dfplBar { 0% { left:-40%; } 100% { left:105%; } }
@keyframes dfplOrbit { from { transform: rotate(0deg) translateX(86px) rotate(0deg); } to { transform: rotate(360deg) translateX(86px) rotate(-360deg); } }
@keyframes dfplTwinkle { 0%,100% { opacity:.15; transform: scale(.7); } 50% { opacity:.9; transform: scale(1.1); } }
@keyframes dfplIn { from { opacity:0; } to { opacity:1; } }
.dfpl { animation: dfplIn .25s ease both; }
.dfpl-eye { transform-origin: center; transform-box: fill-box; animation: dfplBlink 3.2s infinite; }
.dfpl-mini { position:absolute; top:50%; left:50%; margin:-11px 0 0 -11px; animation: dfplOrbit var(--dur,3.6s) linear infinite; animation-delay: var(--del,0s); }
`;

/** Bot mini que orbita alrededor del bot principal. */
function MiniBot({ color, dark, dur, del }: { color: string; dark: string; dur: string; del: string }) {
  return (
    <div className="dfpl-mini" style={{ ['--dur' as never]: dur, ['--del' as never]: del }}>
      <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="7" r="4" fill="#FDE68A" />
        <rect x="10" y="14" width="44" height="40" rx="15" fill={color} stroke={dark} strokeWidth="3" />
        <rect x="16" y="21" width="32" height="24" rx="10" fill={dark} opacity=".9" />
        <circle cx="26" cy="33" r="4" fill="#fff" />
        <circle cx="38" cy="33" r="4" fill="#fff" />
      </svg>
    </div>
  );
}

/** Preloader animado (enfocado en bots) que aparece al entrar a la app. */
export function BotPreloader() {
  return (
    <div
      className="dfpl"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        background: 'linear-gradient(158deg,#071120 0%,#0A1B2E 46%,#07271F 100%)',
        fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <style>{CSS}</style>

      {/* sparkles */}
      {[
        { top: '18%', left: '22%', fs: 16, del: '0s' },
        { top: '30%', right: '18%', fs: 13, del: '.6s' },
        { top: '68%', left: '16%', fs: 14, del: '1.1s' },
        { top: '74%', right: '24%', fs: 17, del: '.3s' },
      ].map((s, i) => (
        <span key={i} style={{ position: 'absolute', top: s.top, left: s.left, right: s.right, fontSize: s.fs, color: '#FDE68A', animation: `dfplTwinkle 2.6s ease-in-out ${s.del} infinite` }}>✦</span>
      ))}

      {/* bot principal saltando + mini-bots orbitando */}
      <div style={{ position: 'relative', width: 200, height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MiniBot color="#FBBF24" dark="#78350F" dur="3.6s" del="0s" />
        <MiniBot color="#93C5FD" dark="#1E3A8A" dur="3.6s" del="-1.2s" />
        <MiniBot color="#F9A8D4" dark="#831843" dur="3.6s" del="-2.4s" />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ animation: 'dfplJump 1.5s cubic-bezier(.3,.9,.4,1) infinite', filter: 'drop-shadow(0 18px 26px rgba(0,0,0,.45))' }}>
            <svg width="104" height="104" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="7" r="3.6" fill="#FDE68A" style={{ animation: 'dfplAnt 1.4s ease-in-out infinite' }} />
              <rect x="30.9" y="9" width="2.2" height="5" rx="1" fill="#064E3B" />
              <rect x="6" y="30" width="5" height="10" rx="2.5" fill="#064E3B" />
              <rect x="53" y="30" width="5" height="10" rx="2.5" fill="#064E3B" />
              <rect x="10" y="14" width="44" height="40" rx="15" fill="#34D399" stroke="#064E3B" strokeWidth="2.4" />
              <rect x="16" y="21" width="32" height="24" rx="10" fill="#064E3B" opacity=".92" />
              <circle className="dfpl-eye" cx="26" cy="32" r="3.6" fill="#A7F3D0" />
              <circle className="dfpl-eye" cx="38" cy="32" r="3.6" fill="#A7F3D0" />
              <path d="M26.5 38.8q5.5 4 11 0" stroke="#A7F3D0" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <circle cx="20.5" cy="37" r="2.5" fill="#FCA5A5" opacity=".85" />
              <circle cx="43.5" cy="37" r="2.5" fill="#FCA5A5" opacity=".85" />
              <rect x="20" y="54" width="8" height="6" rx="3" fill="#064E3B" />
              <rect x="36" y="54" width="8" height="6" rx="3" fill="#064E3B" />
            </svg>
          </div>
          <div style={{ width: 74, height: 10, borderRadius: '50%', background: 'rgba(0,0,0,.5)', filter: 'blur(4px)', marginTop: 2, animation: 'dfplShadow 1.5s cubic-bezier(.3,.9,.4,1) infinite' }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <img src={logo} alt="" style={{ width: 34, height: 30, objectFit: 'contain' }} />
        <span style={{ color: '#F1F5F9', fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em' }}>DealFlow</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8CA0AE', fontSize: 13.5, marginTop: 12 }}>
        <span>Despertando a tus bots vendedores</span>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', display: 'inline-block', animation: `dfplDots 1.2s ease-in-out ${i * 0.18}s infinite` }} />
        ))}
      </div>

      <div style={{ position: 'relative', width: 220, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden', marginTop: 16 }}>
        <span style={{ position: 'absolute', top: 0, width: '40%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,transparent,#34D399,#FBBF24,transparent)', animation: 'dfplBar 1.15s ease-in-out infinite' }} />
      </div>
    </div>
  );
}
