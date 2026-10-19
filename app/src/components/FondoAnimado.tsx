import { useEffect, useRef, useState } from 'react';

/**
 * Fondo vivo del panel (mismo lenguaje que la landing): red de partículas que se
 * mueve y reacciona al mouse, "paquetes de datos" que viajan por las conexiones,
 * resplandores que derivan, brillo que sigue al cursor y borde iluminado en la
 * tarjeta que está bajo el mouse.
 *
 * Pensado para no pesar: un solo <canvas> a 30 cuadros por segundo, se pausa
 * cuando la pestaña no está visible, sin backdrop-filter, y se apaga solo con
 * "reducir movimiento" del sistema o con el interruptor del menú de perfil
 * (localStorage dealflow:fondo = 'off').
 */
export function fondoActivo(): boolean {
  try { if (localStorage.getItem('dealflow:fondo') === 'off') return false; } catch { /* modo privado */ }
  return !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

const COLORES = {
  oscuro: { p: ['rgba(70,216,255,.85)', 'rgba(118,88,255,.8)', 'rgba(52,211,153,.75)'], linea: '110,140,255', alfaLinea: 0.2, paquete: 'rgba(120,230,255,1)' },
  claro: { p: ['rgba(16,185,129,.55)', 'rgba(46,139,255,.5)', 'rgba(118,88,255,.5)'], linea: '46,139,255', alfaLinea: 0.12, paquete: 'rgba(46,139,255,.9)' },
};

export function FondoAnimado({ tema }: { tema: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const oscuro = tema !== 'light';
  const [on, setOn] = useState(fondoActivo);
  useEffect(() => {
    const cambio = () => setOn(fondoActivo());
    window.addEventListener('df-fondo', cambio);
    return () => window.removeEventListener('df-fondo', cambio);
  }, []);

  useEffect(() => {
    if (!on) return;
    const c = canvasRef.current, raiz = c?.parentElement;
    if (!c || !raiz) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const pal = oscuro ? COLORES.oscuro : COLORES.claro;
    let W = 0, H = 0, raf = 0, ultimo = 0, vivo = true;
    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string };
    let P: P[] = [];
    const paquetes: { a: number; b: number; t: number; v: number }[] = [];
    const mouse = { x: -9999, y: -9999, dentro: false };

    const medir = () => {
      const r = raiz.getBoundingClientRect();
      W = r.width; H = r.height;
      const d = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.round(W * d); c.height = Math.round(H * d);
      c.style.width = W + 'px'; c.style.height = H + 'px';
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const n = Math.max(24, Math.min(80, Math.round((W * H) / 19000)));
      P = Array.from({ length: n }, (_, i) => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.9, vy: (Math.random() - 0.5) * 0.9,
        r: Math.random() * 1.7 + 0.6, c: pal.p[i % pal.p.length],
      }));
    };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(raiz);

    const cuadro = (t: number) => {
      raf = requestAnimationFrame(cuadro);
      if (!vivo || t - ultimo < 33) return; // ~30 fps
      ultimo = t;
      ctx.clearRect(0, 0, W, H);
      // Partículas: derivan, rebotan y se apartan un poco del mouse.
      for (const p of P) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, dm = Math.hypot(dx, dy);
        if (dm < 130 && dm > 0) { p.x += (dx / dm) * 1.1; p.y += (dy / dm) * 1.1; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fillStyle = p.c; ctx.fill();
      }
      // Conexiones entre partículas cercanas (y de vez en cuando nace un "paquete").
      const max = 140;
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const a = P[i], b = P[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < max) {
            ctx.strokeStyle = `rgba(${pal.linea},${(1 - d / max) * pal.alfaLinea})`;
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            if (paquetes.length < 7 && Math.random() < 0.0009) paquetes.push({ a: i, b: j, t: 0, v: 0.012 + Math.random() * 0.02 });
          }
        }
      }
      // Líneas hacia el cursor: la red "responde" cuando pasas el mouse.
      if (mouse.dentro) {
        for (const p of P) {
          const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          if (d < 190) { ctx.strokeStyle = `rgba(${pal.linea},${(1 - d / 190) * pal.alfaLinea * 1.6})`; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
        }
      }
      // Paquetes de datos viajando por las conexiones.
      for (let k = paquetes.length - 1; k >= 0; k--) {
        const q = paquetes[k], a = P[q.a], b = P[q.b];
        q.t += q.v;
        if (!a || !b || q.t >= 1 || Math.hypot(a.x - b.x, a.y - b.y) > max * 1.2) { paquetes.splice(k, 1); continue; }
        const x = a.x + (b.x - a.x) * q.t, y = a.y + (b.y - a.y) * q.t;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.283); ctx.fillStyle = pal.paquete;
        ctx.shadowColor = pal.paquete; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
      }
    };
    raf = requestAnimationFrame(cuadro);

    // Brillo que sigue al cursor + borde iluminado en la tarjeta bajo el mouse.
    const esTarjeta = new WeakMap<Element, boolean>();
    const tarjetaDe = (el: Element | null): HTMLElement | null => {
      for (let n = 0; el && n < 7; n++, el = el.parentElement) {
        if (el === raiz) return null;
        let ok = esTarjeta.get(el);
        if (ok === undefined) {
          const cs = getComputedStyle(el), h = el as HTMLElement;
          ok = parseFloat(cs.borderTopLeftRadius) >= 10 && parseFloat(cs.borderTopWidth) >= 1
            && h.offsetWidth > 150 && h.offsetHeight > 56 && h.offsetWidth < raiz.clientWidth * 0.97;
          esTarjeta.set(el, ok);
        }
        if (ok) return el as HTMLElement;
      }
      return null;
    };
    const glow = glowRef.current, spot = spotRef.current;
    let actual: HTMLElement | null = null;
    const mover = (e: PointerEvent) => {
      const r = raiz.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.dentro = true;
      if (glow) { glow.style.opacity = '1'; glow.style.transform = `translate(${mouse.x - 260}px, ${mouse.y - 260}px)`; }
      if (!spot) return;
      const t = tarjetaDe(e.target as Element);
      if (t !== actual) { actual = t; spot.style.opacity = t ? '1' : '0'; }
      if (t) {
        const tr = t.getBoundingClientRect();
        spot.style.left = tr.left + 'px'; spot.style.top = tr.top + 'px'; spot.style.width = tr.width + 'px'; spot.style.height = tr.height + 'px';
        spot.style.borderRadius = getComputedStyle(t).borderTopLeftRadius;
        spot.style.setProperty('--mx', e.clientX - tr.left + 'px'); spot.style.setProperty('--my', e.clientY - tr.top + 'px');
      }
    };
    const salir = () => { mouse.dentro = false; mouse.x = mouse.y = -9999; if (glow) glow.style.opacity = '0'; if (spot) spot.style.opacity = '0'; actual = null; };
    const ocultarSpot = () => { if (spot) spot.style.opacity = '0'; actual = null; };
    const visibilidad = () => { vivo = !document.hidden; };
    raiz.addEventListener('pointermove', mover, { passive: true });
    raiz.addEventListener('pointerleave', salir);
    window.addEventListener('scroll', ocultarSpot, true);
    document.addEventListener('visibilitychange', visibilidad);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      raiz.removeEventListener('pointermove', mover); raiz.removeEventListener('pointerleave', salir);
      window.removeEventListener('scroll', ocultarSpot, true); document.removeEventListener('visibilitychange', visibilidad);
    };
  }, [oscuro, on]);

  if (!on) return null;
  return (
    <>
      <div aria-hidden className={'df-fondo-blobs' + (oscuro ? '' : ' claro')} />
      {oscuro && <div aria-hidden className="df-fondo-grid" />}
      <canvas ref={canvasRef} aria-hidden className="df-fondo-canvas" />
      <div ref={glowRef} aria-hidden className={'df-fondo-glow' + (oscuro ? '' : ' claro')} />
      <div ref={spotRef} aria-hidden className="df-spot" />
    </>
  );
}

/** Enciende/apaga el fondo animado en este dispositivo (menú de perfil). */
export function setFondoActivo(v: boolean) {
  try { localStorage.setItem('dealflow:fondo', v ? 'on' : 'off'); } catch { /* modo privado */ }
  window.dispatchEvent(new Event('df-fondo'));
}
