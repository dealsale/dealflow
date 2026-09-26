import logo from '../assets/logo.png';

/**
 * Preloader de la app: pantalla de arranque con un look tecnológico —
 * un núcleo con el logo, un anillo de energía que gira, ondas concéntricas,
 * partículas flotando y una barra de progreso con brillo. Fondo oscuro fijo
 * (independiente del tema) para que se sienta premium al entrar.
 */
const CSS = `
@keyframes dfplIn { from { opacity:0 } to { opacity:1 } }
@keyframes dfplSpin { to { transform: rotate(360deg) } }
@keyframes dfplSpinRev { to { transform: rotate(-360deg) } }
@keyframes dfplGlow { 0%,100% { opacity:.45; transform: scale(.92) } 50% { opacity:.9; transform: scale(1.08) } }
@keyframes dfplWave { 0% { transform: scale(.7); opacity:.55 } 100% { transform: scale(1.9); opacity:0 } }
@keyframes dfplFloat { 0%,100% { transform: translateY(0); opacity:.35 } 50% { transform: translateY(-14px); opacity:.9 } }
@keyframes dfplBar { 0% { left:-42% } 100% { left:104% } }
@keyframes dfplDots { 0%,80%,100% { transform: translateY(0); opacity:.3 } 40% { transform: translateY(-6px); opacity:1 } }
@keyframes dfplGrid { from { background-position: 0 0, 0 0 } to { background-position: 46px 0, 0 46px } }
@keyframes dfplTilt { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes dfplSheen { 0% { background-position: -160% 0 } 100% { background-position: 260% 0 } }
.dfpl { animation: dfplIn .3s ease both }
`;

export function BotPreloader() {
  return (
    <div
      className="dfpl"
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 38%, #0d2a44 0%, #0A1B2E 42%, #060f1c 100%)',
        fontFamily: "'Inter',system-ui,sans-serif", overflow: 'hidden',
      }}
    >
      <style>{CSS}</style>

      {/* rejilla técnica de fondo, muy sutil, en movimiento lento */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(16,185,129,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,.06) 1px, transparent 1px)',
        backgroundSize: '46px 46px', animation: 'dfplGrid 6s linear infinite',
        maskImage: 'radial-gradient(circle at 50% 40%, #000 0%, transparent 72%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 40%, #000 0%, transparent 72%)',
      }} />

      {/* partículas flotando */}
      {[
        { top: '22%', left: '20%', s: 4, d: '0s', c: '#34D399' },
        { top: '30%', right: '16%', s: 3, d: '.7s', c: '#38BDF8' },
        { top: '66%', left: '18%', s: 3, d: '1.3s', c: '#A78BFA' },
        { top: '72%', right: '22%', s: 5, d: '.4s', c: '#34D399' },
        { top: '48%', left: '10%', s: 3, d: '1s', c: '#38BDF8' },
        { top: '52%', right: '11%', s: 4, d: '.2s', c: '#34D399' },
      ].map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: p.top, left: p.left, right: p.right,
          width: p.s, height: p.s, borderRadius: '50%', background: p.c,
          boxShadow: `0 0 8px ${p.c}`, animation: `dfplFloat 3.4s ease-in-out ${p.d} infinite`,
        }} />
      ))}

      {/* núcleo: ondas + anillos giratorios + logo */}
      <div style={{ position: 'relative', width: 168, height: 168, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'dfplTilt 3.2s ease-in-out infinite' }}>
        {/* ondas concéntricas */}
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            position: 'absolute', width: 132, height: 132, borderRadius: 30,
            border: '1.5px solid rgba(52,211,153,.5)', animation: `dfplWave 2.4s ease-out ${i * 0.8}s infinite`,
          }} />
        ))}

        {/* glow suave detrás */}
        <span style={{
          position: 'absolute', width: 150, height: 150, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,.5) 0%, transparent 70%)',
          filter: 'blur(6px)', animation: 'dfplGlow 2.2s ease-in-out infinite',
        }} />

        {/* anillo de energía exterior (conic, girando) */}
        <span style={{
          position: 'absolute', width: 140, height: 140, borderRadius: 32,
          background: 'conic-gradient(from 0deg, transparent 0deg, #10B981 70deg, #34D399 130deg, transparent 210deg, transparent 360deg)',
          animation: 'dfplSpin 2.4s linear infinite',
          filter: 'drop-shadow(0 0 12px rgba(16,185,129,.45))',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor', maskComposite: 'exclude', padding: 3,
        }} />
        {/* anillo interior fino, girando al revés (punteado tech) */}
        <span style={{
          position: 'absolute', width: 118, height: 118, borderRadius: 26,
          border: '1px dashed rgba(56,189,248,.45)', animation: 'dfplSpinRev 8s linear infinite',
        }} />

        {/* tile de vidrio con el logo */}
        <div style={{
          position: 'relative', width: 104, height: 104, borderRadius: 24,
          background: 'linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.02))',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.15), 0 12px 34px rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}>
          <img src={logo} alt="" style={{ width: 58, height: 52, objectFit: 'contain', filter: 'drop-shadow(0 3px 10px rgba(16,185,129,.4))' }} />
        </div>
      </div>

      {/* wordmark con brillo que recorre */}
      <div style={{ marginTop: 26, fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>
        <span style={{
          background: 'linear-gradient(90deg, #E7F6EF 0%, #6EE7B7 30%, #E7F6EF 60%)',
          backgroundSize: '220% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent', animation: 'dfplSheen 3s linear infinite',
        }}>DealFlow</span>
      </div>

      {/* estado + puntos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8CA6B6', fontSize: 13, marginTop: 10, letterSpacing: '.01em' }}>
        <span>Preparando tu panel</span>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', display: 'inline-block', animation: `dfplDots 1.2s ease-in-out ${i * 0.18}s infinite` }} />
        ))}
      </div>

      {/* barra de progreso con brillo */}
      <div style={{ position: 'relative', width: 230, height: 3, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden', marginTop: 20 }}>
        <span style={{
          position: 'absolute', top: 0, width: '42%', height: '100%', borderRadius: 999,
          background: 'linear-gradient(90deg, transparent, #10B981, #38BDF8, transparent)',
          animation: 'dfplBar 1.25s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}
