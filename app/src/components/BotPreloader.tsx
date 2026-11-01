import { useEffect, useRef, useState } from 'react';
import logo from '../assets/logo.png';

/**
 * Preloader de la app ("Constelación IA"): cientos de partículas conectadas como una red
 * neuronal se juntan hasta formar el logo exacto de DealFlow; luego aparece el logo y, al
 * terminar la secuencia completa, las partículas estallan hacia afuera. Fondo oscuro fijo
 * (independiente del tema).
 *
 * variante 'completo' → secuencia entera con pasos y porcentaje (tras iniciar sesión).
 * variante 'simple'   → el logo se forma rápido y queda brillando mientras carga.
 */
const CSS = `
@keyframes dfplIn { from { opacity:0 } to { opacity:1 } }
@keyframes dfplOut { to { opacity:0; transform: scale(1.03); filter: blur(4px) } }
@keyframes dfplBrillo { to { background-position: -300% 0 } }
@keyframes dfplBar { 0% { left:-42% } 100% { left:104% } }
@keyframes dfplPuntos { 0% { content:'' } 25% { content:'.' } 50% { content:'..' } 75% { content:'...' } }
@keyframes dfplFlash { 0% { opacity:0 } 18% { opacity:1 } 100% { opacity:0 } }
.dfpl-paso.cargando::after { content:''; display:inline-block; width:1.2em; text-align:left; animation: dfplPuntos 1.2s steps(1) infinite }
`;

const PASOS = ['Encendiendo los motores', 'Conectando con WhatsApp', 'Despertando al asistente de IA', 'Sincronizando pedidos y catálogo', 'Preparando tu panel'];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Part { tx: number; ty: number; c: string; x: number; y: number; vx: number; vy: number; d: number; ex: number; ey: number; X: number; Y: number; tw: number }

export function BotPreloader({ variante = 'simple', duracion = 4400 }: { variante?: 'completo' | 'simple'; duracion?: number }) {
  const completo = variante === 'completo';
  const raiz = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [prog, setProg] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const el = raiz.current, cv = lienzo.current, logoEl = imgRef.current;
    if (!el || !cv || !logoEl) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, P: Part[] = [], red: Part[] = [], listo = false, raf = 0, vivo = true, ultimoPct = -1;
    const img = new Image(); img.src = logo;

    const construir = () => {
      if (!listo || !W) return;
      const S = Math.min(W * 0.62, H * 0.42, 320), sw = Math.round(S), sh = Math.round((S * 470) / 583);
      cx = W / 2; cy = H * 0.38;
      Object.assign(logoEl.style, { width: `${sw}px`, left: `${cx - sw / 2}px`, top: `${cy - sh / 2}px` });
      const oc = document.createElement('canvas'); oc.width = sw; oc.height = sh;
      const o = oc.getContext('2d');
      if (!o) return;
      o.drawImage(img, 0, 0, sw, sh);
      const d = o.getImageData(0, 0, sw, sh).data, gap = Math.max(3, Math.round(S / 64));
      const nuevos: Part[] = [];
      for (let y = 0; y < sh; y += gap) for (let x = 0; x < sw; x += gap) {
        const i = (y * sw + x) * 4;
        if (d[i + 3] <= 150) continue;
        const tx = cx - sw / 2 + x, ty = cy - sh / 2 + y, dx = tx - cx, dy = ty - cy, m = Math.hypot(dx, dy) || 1, sp = rnd(0.5, 1.5);
        nuevos.push({ tx, ty, c: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`, x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.035, 0.035), vy: rnd(-0.035, 0.035), d: Math.random(), ex: (dx / m) * sp + rnd(-0.2, 0.2), ey: (dy / m) * sp + rnd(-0.2, 0.2), X: 0, Y: 0, tw: rnd(0, 6.28) });
      }
      P = nuevos;
      const paso = Math.max(1, Math.floor(P.length / 130));
      red = P.filter((_, i) => i % paso === 0);
    };
    const medir = () => {
      W = el.clientWidth; H = el.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr;
      construir();
    };
    const ro = new ResizeObserver(medir); ro.observe(el);
    img.decode().then(() => { listo = true; medir(); }).catch(() => { listo = false; logoEl.style.opacity = '1'; });

    const t0 = performance.now();
    let last = t0, explotando = false;
    const frame = (now: number) => {
      if (!vivo) return;
      const dt = Math.min(50, now - last); last = now;
      const t = now - t0;
      // Fases (0..1): conv = cuánto se juntaron las partículas; show = aparición del logo;
      // f = estallido final (solo en la secuencia completa).
      let conv: number, show: number, f = -1;
      if (completo) {
        const p = clamp(t / duracion);
        conv = clamp((p - 0.1) / 0.45);
        show = clamp((p - 0.58) / 0.14);
        const fin = 1 - 650 / duracion;
        if (p >= fin) f = clamp((p - fin) / (1 - fin));
        const pct = Math.min(100, Math.round(clamp(p / 0.86) * 100));
        if (pct !== ultimoPct) { ultimoPct = pct; setProg(pct); }
        if (f >= 0 && !explotando) { explotando = true; setFlash(true); }
      } else {
        conv = clamp(t / 950);
        show = clamp((t - 900) / 450);
      }
      if (quieto) { conv = 1; show = 1; f = -1; }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.5);
      g.addColorStop(0, `rgba(37,99,235,${0.12 + conv * 0.16})`); g.addColorStop(1, 'rgba(37,99,235,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      if (!quieto) {
        ctx.globalCompositeOperation = 'lighter';
        for (const q of P) {
          q.x += q.vx * dt; q.y += q.vy * dt;
          if (q.x < 0) q.x += W; else if (q.x > W) q.x -= W;
          if (q.y < 0) q.y += H; else if (q.y > H) q.y -= H;
          const k = ease(clamp((conv - q.d * 0.35) / 0.65));
          let X = q.x + (q.tx - q.x) * k, Y = q.y + (q.ty - q.y) * k, al: number;
          if (f >= 0) { const e = f * f * 700; X = q.tx + q.ex * e; Y = q.ty + q.ey * e; al = Math.max(0, 1 - f * 1.1); }
          else al = (k > 0.97 ? 0.95 - show * 0.55 : 0.7) * (0.65 + 0.35 * Math.sin(now * 0.004 + q.tw));
          q.X = X; q.Y = Y;
          ctx.globalAlpha = al;
          ctx.fillStyle = k > 0.5 ? q.c : q.d < 0.5 ? '#38BDF8' : '#A78BFA';
          const s = k > 0.97 ? 2.2 : 1.8;
          ctx.fillRect(X - s / 2, Y - s / 2, s, s);
        }
        // Red neuronal: líneas entre partículas cercanas mientras flotan sueltas.
        if (f < 0 && conv < 1) {
          ctx.lineWidth = 0.7; ctx.strokeStyle = '#60A5FA';
          for (let i = 0; i < red.length; i++) for (let j = i + 1; j < red.length; j++) {
            const a = red[i], b = red[j], dx = a.X - b.X, dy = a.Y - b.Y, d2 = dx * dx + dy * dy;
            if (d2 < 13000) { ctx.globalAlpha = (1 - d2 / 13000) * (1 - conv) * 0.55; ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke(); }
          }
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      logoEl.style.opacity = String(f >= 0 ? Math.max(0, 1 - f * 2.4) : show);
      logoEl.style.transform = `scale(${f >= 0 ? 1 + f * 0.25 : 0.96 + show * 0.04})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [completo, duracion]);

  const final = completo && prog >= 100;
  const paso = final ? '¡Todo listo!' : completo ? PASOS[Math.min(PASOS.length - 1, Math.floor((prog / 100) * PASOS.length))] : 'Preparando tu panel';

  return (
    <div
      ref={raiz}
      role="status"
      aria-label="Cargando DealFlow"
      style={{
        animation: completo ? `dfplIn .3s ease both, dfplOut .38s ease ${Math.max(0, duracion - 380)}ms forwards` : 'dfplIn .3s ease both',
        position: 'fixed', inset: 0, zIndex: 999, overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 38%, #0B1430 0%, #060A17 55%, #04070F 100%)',
        fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: '#E6ECF5',
      }}
    >
      <style>{CSS}</style>
      <canvas ref={lienzo} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <img ref={imgRef} src={logo} alt="" style={{ position: 'absolute', opacity: 0, filter: 'drop-shadow(0 0 30px rgba(59,130,246,.6))', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '9%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '0 20px calc(env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7DD3FC' }}>Inteligencia artificial de ventas</div>
        <div style={{ fontWeight: 800, fontSize: 38, lineHeight: 1, letterSpacing: '-.035em', color: '#fff' }}>
          Deal<span style={{ background: 'linear-gradient(90deg, #22D3EE, #3B82F6, #8B5CF6, #22D3EE)', backgroundSize: '300% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'dfplBrillo 4s linear infinite' }}>Flow</span>
        </div>
        <div className={`dfpl-paso${final ? '' : ' cargando'}`} style={{ fontSize: 14.5, fontWeight: 500, color: '#B8C6DA', minHeight: '1.3em', textAlign: 'center' }}>{paso}</div>
        <div style={{ position: 'relative', width: 'min(320px, 78vw)', height: 5, borderRadius: 99, background: 'rgba(148,163,184,.14)', overflow: completo ? 'visible' : 'hidden' }}>
          {completo ? (
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog}%`, borderRadius: 99, background: 'linear-gradient(90deg, #22D3EE, #3B82F6 45%, #8B5CF6)', boxShadow: '0 0 14px rgba(59,130,246,.6)' }}>
              <span style={{ position: 'absolute', right: -6, top: '50%', width: 13, height: 13, marginTop: -6.5, borderRadius: '50%', background: '#E0F7FF', boxShadow: '0 0 10px 3px rgba(34,211,238,.9), 0 0 28px 8px rgba(59,130,246,.55)' }} />
            </div>
          ) : (
            <span style={{ position: 'absolute', top: 0, width: '42%', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, transparent, #22D3EE, #3B82F6, #8B5CF6, transparent)', animation: 'dfplBar 1.25s ease-in-out infinite' }} />
          )}
        </div>
      </div>
      {flash && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 38%, rgba(224,247,255,.9), rgba(59,130,246,.3) 40%, transparent 75%)', animation: 'dfplFlash .9s ease-out forwards' }} />}
    </div>
  );
}
