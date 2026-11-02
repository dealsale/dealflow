import { useEffect, useRef, useState } from 'react';
import { apiSoporteContestar, apiSoporteEntrante, apiSoporteRechazar } from '../lib/api';
import { iniciarLlamada, useLlamada } from '../lib/llamadaRTC';

/**
 * Llamada ENTRANTE para la tienda: el administrador de DealFlow la está llamando.
 * La app pregunta cada pocos segundos; si hay una, aparece un aviso grande en toda la
 * pantalla con timbre, y la tienda contesta (se abre la llamada de siempre) o rechaza.
 */
interface Entrante { id: string; motivo: string; quien: string }

/** Timbre de teléfono hecho con el navegador (sin archivos), repetido mientras timbra. */
function sonarTimbre(): () => void {
  let ctx: AudioContext | null = null;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
  } catch { return () => {}; }
  const c = ctx;
  const ring = () => {
    if (c.state === 'suspended') void c.resume().catch(() => {});
    for (let i = 0; i < 2; i++) {
      const t = c.currentTime + i * 0.45;
      [440, 480].forEach((f) => {
        const o = c.createOscillator(); const g = c.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
        g.gain.setValueAtTime(0.12, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.4);
      });
    }
  };
  ring();
  const iv = setInterval(ring, 2600);
  return () => { clearInterval(iv); void c.close().catch(() => {}); };
}

export function LlamadaEntrante({ mobile }: { mobile?: boolean }) {
  const ll = useLlamada();
  const [entrante, setEntrante] = useState<Entrante | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');
  const rechazadas = useRef<Set<string>>(new Set());
  const enLlamada = !!ll && ll.fase !== 'terminada';

  // Pregunta cada 5 s (también con la pestaña en segundo plano, para que suene).
  useEffect(() => {
    let vivo = true;
    const ver = () => void apiSoporteEntrante().then((r) => {
      if (!vivo || !r.data) return;
      const l = r.data.llamada;
      setEntrante(l && !rechazadas.current.has(l.id) ? l : null);
    }).catch(() => {});
    ver();
    const t = setInterval(ver, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const visible = !!entrante && !enLlamada;
  // Timbre, aviso del navegador y título parpadeando mientras timbra.
  useEffect(() => {
    if (!visible || !entrante) return;
    const parar = sonarTimbre();
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('📞 Te está llamando el ' + entrante.quien, { body: entrante.motivo || 'Abre DealFlow para contestar.', requireInteraction: true }); } catch { /* sin avisos */ }
    const titulo = document.title;
    let alt = false;
    const iv = setInterval(() => { alt = !alt; document.title = alt ? '📞 Llamada entrante' : titulo; }, 1000);
    return () => { parar(); clearInterval(iv); document.title = titulo; };
  }, [visible, entrante]);

  if (!visible || !entrante) return null;

  const contestar = async () => {
    setOcupado(true); setMsg('');
    const r = await apiSoporteContestar(entrante.id);
    setOcupado(false);
    if (!r.data) { setMsg(r.error || 'La llamada ya no está disponible.'); setTimeout(() => setEntrante(null), 2500); return; }
    setEntrante(null);
    iniciarLlamada(entrante.id, 'tienda', r.data.quien);
  };
  const rechazar = async () => {
    rechazadas.current.add(entrante.id);
    setEntrante(null);
    await apiSoporteRechazar(entrante.id);
  };

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="df-entrante-t" aria-describedby="df-entrante-d"
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(2,6,23,.72)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))' }}>
      <div style={{ width: mobile ? '100%' : 440, maxWidth: '100%', borderRadius: 24, overflow: 'hidden', background: '#0B1220', color: '#fff', boxShadow: '0 40px 90px -20px rgba(0,0,0,.8)', textAlign: 'center' }}>
        <div style={{ background: 'linear-gradient(150deg, #047857, #1D4ED8)', padding: '34px 24px 28px', display: 'grid', justifyItems: 'center', gap: 14 }}>
          <div className="df-ent-icono" aria-hidden="true">
            <img src="/logo.png" alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.85 }}>Llamada entrante</div>
          <h2 id="df-entrante-t" style={{ margin: 0, fontSize: mobile ? 24 : 28, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.02em' }}>El {entrante.quien.charAt(0).toLowerCase() + entrante.quien.slice(1)} te está llamando</h2>
          <p id="df-entrante-d" style={{ margin: 0, fontSize: 14.5, opacity: 0.9, maxWidth: 340 }}>
            {entrante.motivo ? `«${entrante.motivo}»` : 'Contesta para hablar con el equipo de DealFlow. Puedes compartir tu pantalla durante la llamada.'}
          </p>
        </div>
        <div style={{ padding: '22px 24px 24px', display: 'grid', gap: 12 }}>
          {msg && <div style={{ fontSize: 13.5, color: '#FCA5A5' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => void rechazar()} disabled={ocupado}
              style={{ flex: 1, minHeight: 56, border: 0, borderRadius: 14, background: '#DC2626', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
              Rechazar
            </button>
            <button type="button" onClick={() => void contestar()} disabled={ocupado} autoFocus
              style={{ flex: 1.4, minHeight: 56, border: 0, borderRadius: 14, background: '#10B981', color: '#052e1f', fontFamily: 'inherit', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
              {ocupado ? 'Conectando…' : '📞 Contestar'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Te pediremos permiso para usar el micrófono.</div>
        </div>
      </div>
      <style>{`.df-ent-icono{width:104px;height:104px;border-radius:50%;background:rgba(255,255,255,.14);display:grid;place-items:center;animation:dfEntPulso 1.6s ease-out infinite}
@keyframes dfEntPulso{0%{box-shadow:0 0 0 0 rgba(255,255,255,.45)}70%{box-shadow:0 0 0 26px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}
@media (prefers-reduced-motion:reduce){.df-ent-icono{animation:none}}`}</style>
    </div>
  );
}
