import { useEffect, useRef, useState } from 'react';
import { cambiarIdiomaUI, idiomaUI, t } from '../i18n/traductor';
import type { DealFlowState } from '../hooks/useDealFlowState';
import logo from '../assets/logo.png';

/*
 * Pantalla de inicio de sesión / registro con el mismo lenguaje visual de la
 * landing: fondo de red de datos animada (canvas), panel de marca con frases que
 * rotan, y una tarjeta de vidrio oscuro con borde de
 * luz giratorio. Los colores son FIJOS (no usan las variables del tema) para que
 * se vea igual con cualquier tema guardado — antes, con Premium, la tarjeta
 * blanca quedaba con textos claros que no se leían.
 */
const C = {
  bg: '#050713',
  text: '#EEF3FF',
  muted: '#9AA8C9',
  faint: '#6F7B9E',
  line: 'rgba(134,154,255,.16)',
  lineStrong: 'rgba(134,154,255,.32)',
  cyan: '#46D8FF',
  green: '#34D399',
  violet: '#7658FF',
  danger: '#FF6B8A',
};

const CSS = `
.dfl { --mx: 50%; --my: 50%; }
.dfl *::selection { background: rgba(118,88,255,.4); }
@keyframes dflSpin { to { transform: rotate(360deg) } }
@keyframes dflIn { from { opacity:0; transform: translateY(22px) scale(.98) } to { opacity:1; transform:none } }
@keyframes dflShake { 10%,90% { transform: translateX(-2px) } 20%,80% { transform: translateX(3px) } 30%,70% { transform: translateX(-6px) } 40%,60% { transform: translateX(6px) } 50% { transform: translateX(-3px) } }
@keyframes dflShine { to { background-position: -300% 0 } }
@keyframes dflCaret { 50% { border-color: transparent } }
@keyframes dflScan { 0% { transform: translateY(-140px) } 100% { transform: translateY(110vh) } }
@keyframes dflMsg { from { opacity:0; transform: translateY(8px) scale(.97) } to { opacity:1; transform:none } }
@keyframes dflPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,.5) } 50% { box-shadow: 0 0 0 7px rgba(52,211,153,0) } }
@keyframes dflGrid { to { background-position: 64px 64px, 64px 64px } }
@keyframes dflSweep { 0%,55% { left:-60% } 100% { left:130% } }
.dfl-grid { position:absolute; inset:0; pointer-events:none; background-image: linear-gradient(rgba(120,145,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(120,145,255,.05) 1px, transparent 1px); background-size: 64px 64px; animation: dflGrid 22s linear infinite; -webkit-mask-image: radial-gradient(circle at 50% 40%, #000 15%, transparent 75%); mask-image: radial-gradient(circle at 50% 40%, #000 15%, transparent 75%); }
.dfl-scan { position:absolute; left:0; right:0; top:0; height:120px; pointer-events:none; background: linear-gradient(180deg, transparent, rgba(70,216,255,.05) 48%, rgba(70,216,255,.12) 50%, transparent); animation: dflScan 8s linear infinite; }
.dfl-card-wrap { position:relative; border-radius:24px; padding:1.5px; overflow:hidden; animation: dflIn .7s cubic-bezier(.2,.8,.2,1) both .15s; }
.dfl-card-wrap::before { content:""; position:absolute; inset:-60%; background: conic-gradient(from 0deg, transparent 0 55%, ${C.cyan} 68%, ${C.violet} 78%, ${C.green} 86%, transparent 94%); animation: dflSpin 6s linear infinite; }
.dfl-card-wrap.err { animation: dflShake .5s both; }
.dfl-card { position:relative; border-radius:23px; background: linear-gradient(160deg, rgba(14,19,42,.96), rgba(8,11,28,.97)); padding: 30px 28px 26px; }
.dfl-card::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; background: radial-gradient(420px circle at var(--mx) var(--my), rgba(90,110,255,.10), transparent 60%); }
.dfl-label { display:block; font-size:11.5px; font-weight:600; letter-spacing:.04em; color:${C.muted}; margin:0 0 6px 2px; text-transform:uppercase; font-family:'JetBrains Mono',ui-monospace,monospace; }
.dfl-field { position:relative; margin-bottom:14px; }
.dfl-field svg.ic { position:absolute; left:13px; top:50%; transform:translateY(-50%); width:17px; height:17px; color:${C.faint}; transition: color .2s; pointer-events:none; }
.dfl-input { width:100%; box-sizing:border-box; min-height:48px; padding:12px 44px 12px 40px; border-radius:12px; border:1px solid ${C.lineStrong}; background: rgba(5,8,24,.7) !important; color:${C.text} !important; font-family:inherit; font-size:14.5px; outline:none; transition: border-color .2s, box-shadow .25s, background .2s; }
.dfl-input::placeholder { color:#5E6A8F; }
.dfl-input:focus { border-color:${C.cyan}; box-shadow: 0 0 0 4px rgba(70,216,255,.14), 0 0 24px -6px rgba(70,216,255,.5); background: rgba(8,12,34,.85) !important; }
.dfl-field:focus-within svg.ic { color:${C.cyan}; }
.dfl-input:-webkit-autofill { -webkit-text-fill-color:${C.text}; -webkit-box-shadow: 0 0 0 40px #0A0F27 inset; caret-color:${C.text}; }
.dfl-eye { position:absolute; right:8px; top:50%; transform:translateY(-50%); background:transparent; border:none; color:${C.faint}; cursor:pointer; padding:6px; border-radius:8px; display:grid; place-items:center; }
.dfl-eye:hover { color:${C.text}; background: rgba(255,255,255,.05); }
.dfl-btn { position:relative; overflow:hidden; width:100%; border:none; border-radius:13px; padding:15px; font-family:inherit; font-weight:800; font-size:15px; letter-spacing:.01em; color:#fff; cursor:pointer; background: linear-gradient(120deg, #10B981 0%, #2E8BFF 55%, #7658FF 100%); background-size: 160% 100%; box-shadow: 0 14px 34px -12px rgba(46,139,255,.6); transition: transform .18s, box-shadow .25s, background-position .5s; }
.dfl-btn:hover { transform: translateY(-2px); background-position: 100% 0; box-shadow: 0 18px 40px -12px rgba(118,88,255,.7); }
.dfl-btn:active { transform: translateY(0); }
.dfl-btn::after { content:""; position:absolute; top:0; left:-60%; width:40%; height:100%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent); transform: skewX(-20deg); animation: dflSweep 3.4s ease-in-out infinite; }
.dfl-btn[disabled] { opacity:.75; cursor:progress; }
.dfl-spin { display:inline-block; width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,.35); border-top-color:#fff; animation: dflSpin .7s linear infinite; vertical-align:-3px; margin-right:8px; }
.dfl-tabs { display:grid; grid-template-columns:1fr 1fr; padding:4px; border-radius:12px; background: rgba(255,255,255,.04); border:1px solid ${C.line}; margin-bottom:22px; position:relative; }
.dfl-tabs button { position:relative; z-index:1; border:none; background:transparent; color:${C.muted}; font-family:inherit; font-weight:700; font-size:13px; padding:9px; border-radius:9px; cursor:pointer; transition: color .25s; }
.dfl-tabs button.on { color:#fff; }
.dfl-tabs .pill { position:absolute; top:4px; bottom:4px; width:calc(50% - 4px); border-radius:9px; background: linear-gradient(120deg, rgba(46,139,255,.35), rgba(118,88,255,.35)); border:1px solid rgba(134,154,255,.35); transition: transform .35s cubic-bezier(.2,.8,.2,1); }
.dfl-grad { background: linear-gradient(110deg, #2E8BFF, #6C59FF, #B05AFF, #46D8FF, #2E8BFF); background-size: 300% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; animation: dflShine 7s linear infinite; }
.dfl-rot { color:${C.cyan}; border-right:2px solid ${C.cyan}; padding-right:3px; animation: dflCaret 1s step-end infinite; white-space:nowrap; }
.dfl-chip { display:inline-flex; align-items:center; gap:7px; padding:7px 12px; border-radius:999px; border:1px solid ${C.line}; background: rgba(255,255,255,.03); font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11.5px; color:${C.muted}; }
.dfl-chip b { color:${C.cyan}; font-weight:700; }
.dfl-social { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:11px; border:1px solid ${C.line}; color:${C.muted}; background: rgba(255,255,255,.02); transition: color .2s, border-color .2s, transform .2s; }
.dfl-social:hover { color:${C.text}; border-color:${C.lineStrong}; transform: translateY(-2px); }
.dfl-left { display:flex; }
@media (max-width: 1020px) { .dfl-left { display:none !important; } }
@media (min-width: 1021px) { .dfl-mobile-brand { display:none !important; } }
@media (max-width: 520px) { .dfl-card { padding: 24px 18px 20px; } }
@media (prefers-reduced-motion: reduce) { .dfl * { animation-duration: .001ms !important; animation-iteration-count: 1 !important; } }
`;

const FRASES_ES = ['duermes', 'estás con tu familia', 'buscas tu próximo producto ganador', 'montas tu siguiente campaña'];
// Se escriben letra por letra: se traducen antes (la traducción en vivo no reconoce palabras a medias).
const FRASES = FRASES_ES.map((f) => t(f));

/** Fondo: red de nodos con paquetes de datos viajando y etiquetas que aparecen. */
function RedDatos() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const small = window.innerWidth < 700;
    const dpr = small ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const TAGS = ['pedido #1043 ✓', '+$119.900', 'chat nuevo · Bogotá', 'IA → 1,8 s', 'guía generada', 'venta cerrada', 'remisión Effi ✓', 'enviado a Dropi', 'opt-in ✓', '02:13 a.m. · vendido'].map((x) => t(x));
    let w = 0, h = 0, raf = 0, last = 0, pkT = 0, tagT = 0;
    let nodes: { x: number; y: number; vx: number; vy: number; z: number }[] = [];
    let packets: { a: number; b: number; t: number; sp: number; col: string }[] = [];
    let tags: { n: number; txt: string; life: number }[] = [];
    const size = () => {
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(small ? 28 : 64, (w * h) / 21000));
      nodes = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, z: 0.4 + Math.random() * 0.8 }));
    };
    size();
    window.addEventListener('resize', size);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(50, t - last || 16); last = t;
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        n.x += n.vx * n.z; n.y += n.vy * n.z;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      const links: [number, number][] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = dx * dx + dy * dy;
          if (d < 28000) {
            ctx.strokeStyle = `rgba(105,135,255,${0.2 * (1 - d / 28000)})`;
            ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
            links.push([i, j]);
          }
        }
      }
      for (const n of nodes) { ctx.fillStyle = `rgba(140,170,255,${0.45 * n.z})`; ctx.beginPath(); ctx.arc(n.x, n.y, 1 + n.z * 1.2, 0, 6.283); ctx.fill(); }
      pkT += dt;
      if (pkT > 220 && links.length && packets.length < (small ? 6 : 16)) {
        pkT = 0;
        const L = links[(Math.random() * links.length) | 0];
        const r = Math.random();
        packets.push({ a: L[0], b: L[1], t: 0, sp: 0.0013 + Math.random() * 0.0016, col: r < 0.4 ? '70,216,255' : r < 0.7 ? '52,211,153' : '183,93,255' });
      }
      packets = packets.filter((k) => {
        k.t += k.sp * dt;
        if (k.t >= 1) return false;
        const A = nodes[k.a], B = nodes[k.b];
        if (!A || !B) return false;
        const x = A.x + (B.x - A.x) * k.t, y = A.y + (B.y - A.y) * k.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, `rgba(${k.col},.95)`); g.addColorStop(1, `rgba(${k.col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();
        return true;
      });
      tagT += dt;
      if (tagT > (small ? 2400 : 1200) && nodes.length) {
        tagT = 0;
        const ni = (Math.random() * nodes.length) | 0;
        if (nodes[ni].y > 80 && nodes[ni].y < h - 80 && nodes[ni].x < w - 200) tags.push({ n: ni, txt: TAGS[(Math.random() * TAGS.length) | 0], life: 0 });
      }
      ctx.font = '600 10.5px "JetBrains Mono", ui-monospace, monospace';
      tags = tags.filter((tg) => {
        tg.life += dt;
        const L = 3200;
        if (tg.life > L) return false;
        const a = tg.life < 400 ? tg.life / 400 : tg.life > L - 600 ? (L - tg.life) / 600 : 1;
        const p0 = nodes[tg.n];
        const x = p0.x + 10, y = p0.y - 12 - tg.life * 0.006, tw = ctx.measureText(tg.txt).width + 16;
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = 'rgba(10,16,36,.88)'; ctx.strokeStyle = 'rgba(110,140,255,.4)'; ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y - 14, tw, 20, 7); else ctx.rect(x, y - 14, tw, 20);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#bfe9ff'; ctx.fillText(tg.txt, x + 8, y);
        ctx.globalAlpha = 1;
        return true;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

/** Palabra que se escribe y se borra sola ("Mientras tú ___, DealFlow vende"). */
function PalabraRotativa() {
  const [txt, setTxt] = useState(FRASES[0]);
  useEffect(() => {
    let wi = 0, ci = FRASES[0].length, borrando = true, to = 0;
    const tick = () => {
      const palabra = FRASES[wi];
      if (borrando) {
        ci--; setTxt(palabra.slice(0, ci));
        if (ci <= 0) { borrando = false; wi = (wi + 1) % FRASES.length; }
        to = window.setTimeout(tick, 38);
      } else {
        ci++; setTxt(FRASES[wi].slice(0, ci));
        if (ci >= FRASES[wi].length) { borrando = true; to = window.setTimeout(tick, 1900); return; }
        to = window.setTimeout(tick, 62);
      }
    };
    to = window.setTimeout(tick, 2200);
    return () => clearTimeout(to);
  }, []);
  return <span className="dfl-rot">{txt}</span>;
}

const IcoMail = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
);
const IcoLock = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
);
const IcoUser = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></svg>
);
const IcoStore = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5h16v2a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0Z" /><path d="M5.5 13v7h13v-7" /></svg>
);

export function Login({ df }: { df: DealFlowState }) {
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [nombre, setNombre] = useState('');
  const [negocio, setNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const esRegistro = modo === 'registro';
  const entrar = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      await (esRegistro ? df.registrar(nombre, negocio, email, password) : df.login(email, password));
    } finally {
      // Si el login fue exitoso este componente se desmonta; si no, reactivamos el botón.
      window.setTimeout(() => setEnviando(false), 400);
    }
  };
  const cambiarModo = (m: 'login' | 'registro') => { if (m !== modo) { setModo(m); df.clearLoginError(); } };
  const limpiar = () => df.clearLoginError();

  // Luz que sigue al cursor dentro de la tarjeta.
  const onMove = (e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <div
      className="dfl"
      style={{
        minHeight: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'auto',
        background: `radial-gradient(900px circle at 12% 8%, rgba(37,99,235,.22), transparent 55%), radial-gradient(800px circle at 90% 90%, rgba(139,92,246,.2), transparent 55%), radial-gradient(600px circle at 70% 10%, rgba(16,185,129,.12), transparent 55%), ${C.bg}`,
        fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", color: C.text, colorScheme: 'dark',
      }}
    >
      {/* Idioma de la interfaz (antes de entrar no hay menú de perfil). */}
      <div translate="no" style={{ position: 'absolute', top: 14, right: 14, zIndex: 5, display: 'flex', border: '1px solid rgba(255,255,255,.18)', borderRadius: 999, overflow: 'hidden', background: 'rgba(0,0,0,.25)' }}>
        {(['es', 'en'] as const).map((l) => (
          <button key={l} onClick={() => cambiarIdiomaUI(l)} aria-label={l === 'es' ? 'Español' : 'English'}
            style={{ border: 'none', padding: '5px 11px', fontFamily: 'inherit', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', background: idiomaUI() === l ? 'rgba(255,255,255,.18)' : 'transparent', color: '#fff' }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <style>{CSS}</style>
      <div className="dfl-grid" />
      <RedDatos />
      <div className="dfl-scan" />


      {/* ── Panel de marca (escritorio) ── */}
      <div className="dfl-left" style={{ flex: '1 1 55%', position: 'relative', zIndex: 2, flexDirection: 'column', justifyContent: 'center', padding: '48px 56px', gap: 34, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/inicio" title="Ir a la página de inicio de DealFlow" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,.05)', border: `1px solid ${C.lineStrong}`, display: 'grid', placeItems: 'center' }}>
            <img src={logo} alt="" style={{ width: 30, height: 27, objectFit: 'contain' }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>DealFlow</span>
          </a>
          <span className="dfl-chip" style={{ marginLeft: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 10px ${C.green}`, animation: 'dflPulse 1.8s ease-out infinite' }} />sistema en línea</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 44, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0, maxWidth: 540 }}>
            <div style={{ fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase', color: C.cyan, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 28, height: 1, background: `linear-gradient(90deg, ${C.cyan}, transparent)` }} />Ventas con IA por WhatsApp
            </div>
            <h1 style={{ fontSize: 'clamp(2.2rem, 3.6vw, 3.4rem)', lineHeight: 1.04, letterSpacing: '-0.035em', fontWeight: 800, margin: 0 }}>
              Tu tienda en <span className="dfl-grad">piloto automático.</span>
            </h1>
            <p style={{ fontSize: 17, margin: '18px 0 0', color: C.text, minHeight: '3.2em' }}>
              Mientras tú <PalabraRotativa />, DealFlow vende.
            </p>
            <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.65, margin: '12px 0 0', maxWidth: 470 }}>
              La IA atiende cada chat, responde con tu catálogo, cierra la venta y deja el pedido listo para despachar con Dropi, Effi o Shopify.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 24 }}>
              <span className="dfl-chip">Atención <b>24/7</b></span>
              <span className="dfl-chip">Respuesta en <b>segundos</b></span>
              <span className="dfl-chip">Chat → <b>pedido</b> → guía</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Formulario ── */}
      <div style={{ flex: '1 1 45%', position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 18px', minWidth: 0, minHeight: '100%' }}>
        <div style={{ width: 410, maxWidth: '100%', margin: 'auto 0' }}>
          {/* logo visible en celular (el panel de marca se oculta) */}
          <a href="/inicio" title="Ir a la página de inicio de DealFlow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20, textDecoration: 'none', color: 'inherit' }} className="dfl-mobile-brand">
            <img src={logo} alt="DealFlow" style={{ width: 40, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 6px 14px rgba(70,216,255,.35))' }} />
            <span style={{ fontWeight: 800, fontSize: 23, letterSpacing: '-0.02em' }}>DealFlow</span>
          </a>

          <div className={`dfl-card-wrap${df.loginError ? ' err' : ''}`} key={df.loginError ? 'e' + df.loginError : 'ok'}>
            <div className="dfl-card" ref={cardRef} onMouseMove={onMove}>
              <div className="dfl-tabs" role="tablist">
                <span className="pill" style={{ transform: esRegistro ? 'translateX(calc(100% + 0px))' : 'none', left: 4 }} />
                <button role="tab" className={!esRegistro ? 'on' : ''} onClick={() => cambiarModo('login')}>Iniciar sesión</button>
                <button role="tab" className={esRegistro ? 'on' : ''} onClick={() => cambiarModo('registro')}>Crear cuenta</button>
              </div>

              <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', marginBottom: 4 }}>
                {esRegistro ? <>Activa tu <span className="dfl-grad">asistente</span> 🚀</> : <>¡Hola de nuevo! 👋</>}
              </div>
              <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 22, lineHeight: 1.5 }}>
                {esRegistro ? 'Regístrate y deja que la IA empiece a vender por ti.' : 'Tu tienda y tu asistente de WhatsApp te están esperando.'}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); void entrar(); }}>
                {esRegistro && (
                  <>
                    <label className="dfl-label" htmlFor="dfl-nombre">Tu nombre</label>
                    <div className="dfl-field">
                      <IcoUser />
                      <input id="dfl-nombre" className="dfl-input" value={nombre} onChange={(e) => { setNombre(e.target.value); limpiar(); }} placeholder="Ej: Camila Torres" autoComplete="name" />
                    </div>
                    <label className="dfl-label" htmlFor="dfl-negocio">Nombre de tu tienda</label>
                    <div className="dfl-field">
                      <IcoStore />
                      <input id="dfl-negocio" className="dfl-input" value={negocio} onChange={(e) => { setNegocio(e.target.value); limpiar(); }} placeholder="Ej: Luna Accesorios" />
                    </div>
                  </>
                )}

                <label className="dfl-label" htmlFor="dfl-email">Correo</label>
                <div className="dfl-field">
                  <IcoMail />
                  <input id="dfl-email" type="email" className="dfl-input" value={email} onChange={(e) => { setEmail(e.target.value); limpiar(); }} placeholder="tucorreo@tienda.co" autoComplete="username" />
                </div>

                <label className="dfl-label" htmlFor="dfl-clave">Contraseña</label>
                <div className="dfl-field" style={{ marginBottom: 18 }}>
                  <IcoLock />
                  <input id="dfl-clave" type={verClave ? 'text' : 'password'} className="dfl-input" value={password} onChange={(e) => { setPassword(e.target.value); limpiar(); }} placeholder={esRegistro ? 'Mínimo 8 caracteres' : '••••••••'} autoComplete={esRegistro ? 'new-password' : 'current-password'} />
                  <button type="button" className="dfl-eye" onClick={() => setVerClave((v) => !v)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {verClave ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M3 3l18 18" /><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4 9.5 6-.4.8-1.2 2-2.4 3.2M6.5 7.6C4.6 8.9 3.3 10.7 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6Z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>

                {df.loginError && (
                  <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', color: '#FFC2CF', fontSize: 13, marginBottom: 14, background: 'rgba(255,107,138,.1)', border: '1px solid rgba(255,107,138,.35)', borderRadius: 11, padding: '10px 12px', animation: 'dflMsg .3s ease both' }}>
                    <span>⚠️</span>
                    <span>{df.loginError}</span>
                  </div>
                )}

                <button type="submit" className="dfl-btn" disabled={enviando}>
                  {enviando ? <><span className="dfl-spin" />{esRegistro ? 'Creando tu cuenta…' : 'Entrando…'}</> : esRegistro ? 'Crear mi cuenta →' : 'Entrar a mi tienda →'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 0', color: C.faint, fontSize: 11.5, fontFamily: "'JetBrains Mono',ui-monospace,monospace" }}>
                <span style={{ flex: 1, height: 1, background: C.line }} />
                <span>🔒 conexión cifrada · API oficial de WhatsApp</span>
                <span style={{ flex: 1, height: 1, background: C.line }} />
              </div>
            </div>
          </div>

          {!df.apiMode && (
            <div style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(52,211,153,.3)', borderRadius: 12, padding: '12px 16px', marginTop: 14, fontSize: 12.5, color: '#A7F3D0', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Cuentas de la demo</div>
              Vendedora: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>karla@lunaaccesorios.co · demo123</span>
              <br />
              Admin: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>admin@dealflow.co · admin123</span>
            </div>
          )}

          {/* Redes sociales + legales */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 }}>
            <a className="dfl-social" href="https://www.instagram.com/dealflow444" target="_blank" rel="noopener" aria-label="Instagram de DealFlow" title="Instagram">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>
            </a>
            <a className="dfl-social" href="https://www.facebook.com/dealflowsbs/" target="_blank" rel="noopener" aria-label="Facebook de DealFlow" title="Facebook">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M14 8.5V7c0-.8.2-1.2 1.3-1.2H17V3h-2.5c-2.6 0-3.7 1.5-3.7 3.6v1.9H9V11h1.8v9H14v-9h2.2l.4-2.5H14Z" /></svg>
            </a>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: C.faint }}>
            <a href="/legal/privacidad.html" target="_blank" rel="noopener" style={{ color: C.muted }}>Privacidad</a>
            {' · '}
            <a href="/legal/terminos.html" target="_blank" rel="noopener" style={{ color: C.muted }}>Términos</a>
          </div>
        </div>
      </div>
    </div>
  );
}
