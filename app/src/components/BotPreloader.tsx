import { useEffect, useState } from 'react';
import logo from '../assets/logo.png';

/**
 * Preloader de la app: pantalla de arranque con un look tecnológico —
 * un núcleo con el logo, un anillo de energía que gira, ondas concéntricas,
 * partículas flotando y una barra de progreso con brillo. Fondo oscuro fijo
 * (independiente del tema) para que se sienta premium al entrar.
 *
 * variante 'completo' → secuencia de "encendido de motores" paso a paso (primer
 * inicio en el dispositivo). variante 'simple' → carga corta para los siguientes.
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
@keyframes dfplStepIn { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform: translateY(0) } }
@keyframes dfplMiniSpin { to { transform: rotate(360deg) } }
@keyframes dfplScan { 0% { transform: translateY(-120%) } 100% { transform: translateY(2400%) } }
@keyframes dfplOut { to { opacity:0; transform: scale(1.03); filter: blur(4px) } }
@keyframes dfplPop { 0% { transform: scale(.6); opacity:0 } 60% { transform: scale(1.15); opacity:1 } 100% { transform: scale(1) } }
@keyframes dfplRay { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
@keyframes dfplLog { from { opacity:0; transform: translateX(-6px) } to { opacity:1; transform: none } }
.dfpl { animation: dfplIn .3s ease both }
`;

// Pasos de "encendido" para la secuencia completa del primer inicio.
const PASOS = [
  'Encendiendo los motores de DealFlow',
  'Conectando con WhatsApp Cloud API',
  'Activando el asistente de IA',
  'Sincronizando pedidos y catálogo',
  'Preparando tu panel',
];

// Líneas de "consola" que acompañan cada fase (sensación de sistema real arrancando).
const LOGS = [
  'motor.ia ............ OK',
  'whatsapp.cloud ...... conectado',
  'modelo.ventas ....... cargado',
  'pedidos.sync ........ al día',
  'panel.ui ............ listo',
];

export function BotPreloader({ variante = 'simple', duracion = 4400 }: { variante?: 'completo' | 'simple'; duracion?: number }) {
  const completo = variante === 'completo';
  // Progreso 0→1 atado al TIEMPO (no a la carga real): la secuencia completa
  // siempre se ve entera. El último ~18% es el cierre "Todo listo" + salida.
  const [prog, setProg] = useState(0);
  useEffect(() => {
    if (!completo) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duracion);
      setProg(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [completo, duracion]);
  const FASES = 0.78; // fracción del tiempo dedicada a las fases
  const paso = completo ? Math.min(PASOS.length, Math.floor((prog / FASES) * PASOS.length)) : 0;
  const listo = completo && prog >= FASES;
  const pct = Math.min(100, Math.round((prog / FASES) * 100));
  const R = 76, CIRC = 2 * Math.PI * R;

  return (
    <div
      className="dfpl"
      style={{
        animation: completo ? `dfplIn .3s ease both, dfplOut .38s ease ${Math.max(0, duracion - 380)}ms forwards` : undefined,
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
        {completo && (
          <svg width={176} height={176} viewBox="0 0 176 176" style={{ position: 'absolute', inset: -4, transform: 'rotate(-90deg)', filter: 'drop-shadow(0 0 8px rgba(52,211,153,.55))' }}>
            <defs>
              <linearGradient id="dfplGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#34D399" /><stop offset=".6" stopColor="#38BDF8" /><stop offset="1" stopColor="#A78BFA" />
              </linearGradient>
            </defs>
            <circle cx={88} cy={88} r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={3} />
            <circle cx={88} cy={88} r={R} fill="none" stroke="url(#dfplGrad)" strokeWidth={3} strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)} />
          </svg>
        )}
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
          position: 'relative', width: 104, height: 104, borderRadius: 24, overflow: 'hidden',
          background: 'linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.02))',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.15), 0 12px 34px rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}>
          {listo ? (
            <span style={{ fontSize: 46, fontWeight: 900, color: '#34D399', textShadow: '0 0 18px rgba(52,211,153,.8)', animation: 'dfplPop .45s cubic-bezier(.2,.8,.2,1) both' }}>✓</span>
          ) : (
            <img src={logo} alt="" style={{ width: 58, height: 52, objectFit: 'contain', filter: 'drop-shadow(0 3px 10px rgba(16,185,129,.4))' }} />
          )}
          {/* línea de escaneo que recorre el tile (sensación de "booteando") */}
          {completo && !listo && <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, background: 'linear-gradient(180deg, rgba(52,211,153,.55), transparent)', animation: 'dfplScan 1.6s linear infinite' }} />}
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

      {completo ? (
        /* Secuencia de arranque: pasos que se van encendiendo (primer inicio). */
        <div style={{ width: 300, maxWidth: '82vw', marginTop: 22, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {PASOS.map((txt, i) => {
            const estado = i < paso ? 'ok' : i === paso ? 'activo' : 'pend';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                color: estado === 'pend' ? '#51677A' : estado === 'activo' ? '#CFE9DD' : '#8CA6B6',
                opacity: estado === 'pend' ? 0.5 : 1,
                animation: i <= paso ? 'dfplStepIn .3s ease both' : undefined,
                transition: 'color .3s, opacity .3s',
              }}>
                <span style={{ width: 16, height: 16, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {estado === 'ok' ? (
                    <span style={{ color: '#34D399', fontSize: 14, fontWeight: 800 }}>✓</span>
                  ) : estado === 'activo' ? (
                    <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(52,211,153,.35)', borderTopColor: '#34D399', animation: 'dfplMiniSpin .7s linear infinite' }} />
                  ) : (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3A4D5E' }} />
                  )}
                </span>
                <span>{txt}{estado === 'activo' ? '…' : ''}</span>
              </div>
            );
          })}
          {/* consola: una línea por fase completada */}
          <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 10, background: 'rgba(0,0,0,.28)', border: '1px solid rgba(52,211,153,.14)', fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 10.5, lineHeight: 1.6, color: '#5E8C7A', minHeight: 30 }}>
            {LOGS.slice(0, paso).map((l, i) => (
              <div key={i} style={{ animation: 'dfplLog .25s ease both', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: '#34D399' }}>›</span> {l}
              </div>
            ))}
            {listo && <div style={{ animation: 'dfplLog .25s ease both', color: '#6EE7B7', fontWeight: 600 }}>› sistema en línea · bienvenido</div>}
          </div>
        </div>
      ) : (
        /* Carga sencilla (inicios siguientes). */
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8CA6B6', fontSize: 13, marginTop: 10, letterSpacing: '.01em' }}>
          <span>Preparando tu panel</span>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', display: 'inline-block', animation: `dfplDots 1.2s ease-in-out ${i * 0.18}s infinite` }} />
          ))}
        </div>
      )}

      {/* barra de progreso con brillo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <div style={{ position: 'relative', width: 230, height: 3, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
          {completo ? (
            <span style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, borderRadius: 999, background: 'linear-gradient(90deg, #10B981, #38BDF8, #A78BFA)', boxShadow: '0 0 10px rgba(56,189,248,.7)' }} />
          ) : (
            <span style={{
              position: 'absolute', top: 0, width: '42%', height: '100%', borderRadius: 999,
              background: 'linear-gradient(90deg, transparent, #10B981, #38BDF8, transparent)',
              animation: 'dfplBar 1.25s ease-in-out infinite',
            }} />
          )}
        </div>
        {completo && <span style={{ fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 12, color: listo ? '#34D399' : '#8CA6B6', minWidth: 38, textAlign: 'right' }}>{pct}%</span>}
      </div>
    </div>
  );
}
