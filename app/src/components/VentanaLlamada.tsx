import { useEffect, useRef, useState } from 'react';
import {
  useLlamada, retomarGuardada, iniciarLlamada, colgarLlamada, cerrarVentanaLlamada, silenciarLlamada, compartirPantalla,
  dejarDeCompartir, minimizarLlamada, puedeCompartirPantalla,
} from '../lib/llamadaRTC';

/**
 * Ventana de la llamada de soporte (dentro de DealFlow). Flota sobre el panel y sigue abierta
 * aunque cambies de sección. La tienda la ve compacta; el equipo, grande (para ver la pantalla
 * que le comparten).
 */
const dur = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function VentanaLlamada({ mobile }: { mobile?: boolean }) {
  const ll = useLlamada();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, tic] = useState(0);
  const [grande, setGrande] = useState(false);
  useEffect(() => { retomarGuardada(); }, []);
  useEffect(() => { if (ll?.fase !== 'conectada') return; const t = setInterval(() => tic((x) => x + 1), 1000); return () => clearInterval(t); }, [ll?.fase]);
  useEffect(() => {
    if (audioRef.current && ll?.remotoStream && audioRef.current.srcObject !== ll.remotoStream) { audioRef.current.srcObject = ll.remotoStream; void audioRef.current.play().catch(() => {}); }
    if (videoRef.current && ll?.remotoStream && videoRef.current.srcObject !== ll.remotoStream) { videoRef.current.srcObject = ll.remotoStream; void videoRef.current.play().catch(() => {}); }
  });
  if (!ll) return null;

  const soporte = ll.rol === 'soporte';
  const activa = ll.fase !== 'terminada' && ll.fase !== 'pausada';
  const conQuien = soporte ? ll.titulo : ll.atendidoPor ? (ll.atendidoPor.includes('DealFlow') ? ll.atendidoPor : `${ll.atendidoPor} (soporte DealFlow)`) : 'Soporte DealFlow';
  const estadoTxt: Record<string, string> = {
    preparando: 'Preparando el micrófono…',
    esperando: 'Esperando a que entre alguien de soporte… normalmente tarda unos minutos.',
    conectando: soporte ? (ll.timbrando ? 'Timbrando… esperando a que la tienda conteste.' : 'Conectando con la tienda…') : `${ll.atendidoPor || 'Soporte'} está entrando a la llamada…`,
    conectada: `En llamada con ${conQuien}`,
    reconectando: 'Se perdió la conexión: reconectando…',
    pausada: 'La llamada quedó en pausa (se recargó la página).',
    terminada: ll.aviso || 'La llamada terminó.',
  };
  const tiempo = ll.fase === 'conectada' && ll.inicio ? dur(Date.now() - ll.inicio) : '';

  // Minimizada: una píldora con el tiempo (la llamada sigue).
  if (ll.minimizada && activa) {
    return (
      <>
        <audio ref={audioRef} autoPlay />
        <button onClick={() => minimizarLlamada(false)} style={{ position: 'fixed', right: mobile ? 12 : 104, bottom: mobile ? 'calc(env(safe-area-inset-bottom,0px) + 84px)' : 32, zIndex: 58, border: 0, borderRadius: 999, padding: '10px 16px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 12px 28px -10px rgba(4,120,87,.7)' }}>
          📞 {ll.fase === 'conectada' ? `En llamada ${tiempo}` : 'Llamada de soporte'}{ll.silenciado ? ' · 🔇' : ''}{ll.compartiendo ? ' · 🖥️' : ''}
        </button>
      </>
    );
  }

  const ancho = soporte ? (grande ? 'min(1100px, calc(100vw - 40px))' : 'min(560px, calc(100vw - 32px))') : (mobile ? 'calc(100vw - 16px)' : 340);
  const boton = (activo: boolean): React.CSSProperties => ({ flex: 1, minWidth: 0, border: 0, borderRadius: 10, padding: '10px 8px', fontFamily: 'inherit', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', background: activo ? '#FEF3C7' : 'rgba(255,255,255,.12)', color: activo ? '#92400E' : '#fff' });
  return (
    <div role="dialog" aria-label="Llamada de soporte" style={{ position: 'fixed', right: mobile ? 8 : 20, bottom: mobile ? 'calc(env(safe-area-inset-bottom,0px) + 84px)' : 100, zIndex: 58, width: ancho, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', background: '#0B1220', color: '#fff', borderRadius: 16, boxShadow: '0 30px 70px -20px rgba(2,6,23,.75)', overflow: 'hidden', fontFamily: 'inherit' }}>
      <audio ref={audioRef} autoPlay />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'linear-gradient(135deg, #047857, #1D4ED8)' }}>
        <span style={{ fontSize: 18 }}>📞</span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{soporte ? ll.titulo : ll.atendidoPor.includes('DealFlow') ? ll.atendidoPor : 'Soporte DealFlow'}</div>
          <div style={{ fontSize: 11.5, opacity: 0.85 }}>{tiempo ? `En llamada · ${tiempo}` : ll.fase === 'terminada' ? 'Terminada' : 'Llamada de voz'}</div>
        </div>
        {soporte && activa && <button onClick={() => setGrande((g) => !g)} title={grande ? 'Achicar' : 'Agrandar'} style={cab}>{grande ? '⤡' : '⤢'}</button>}
        {activa && <button onClick={() => minimizarLlamada(true)} title="Minimizar (la llamada sigue)" style={cab}>—</button>}
        {!activa && <button onClick={cerrarVentanaLlamada} aria-label="Cerrar" style={cab}>✕</button>}
      </div>

      {/* Pantalla que comparte el otro lado */}
      {activa && ll.remotoVideo && (
        <div style={{ position: 'relative', background: '#000' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: soporte ? (grande ? '72vh' : 320) : 220, display: 'block', objectFit: 'contain', background: '#000' }} />
          <button onClick={() => void videoRef.current?.requestFullscreen?.()} title="Pantalla completa" style={{ ...cab, position: 'absolute', right: 8, top: 8, background: 'rgba(0,0,0,.55)' }}>⛶</button>
          <div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11, fontWeight: 700, background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '2px 7px' }}>🖥️ Pantalla de {soporte ? 'la tienda' : (ll.atendidoPor || 'soporte')}</div>
        </div>
      )}
      {!(activa && ll.remotoVideo) && <video ref={videoRef} muted style={{ display: 'none' }} />}

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, lineHeight: 1.45, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {(ll.fase === 'esperando' || ll.fase === 'conectando' || ll.fase === 'reconectando' || ll.fase === 'preparando') && <span className="df-llamada-pulso" />}
          <span>{estadoTxt[ll.fase]}</span>
        </div>
        {ll.compartiendo && <div style={{ fontSize: 12, fontWeight: 700, color: '#FDE68A' }}>🖥️ Estás compartiendo tu pantalla{soporte ? '' : ': soporte la está viendo'}.</div>}
        {!soporte && ll.fase === 'conectada' && !ll.compartiendo && puedeCompartirPantalla() && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>Para mostrarnos lo que ves, toca «Compartir pantalla».</div>}
        {ll.aviso && ll.fase !== 'terminada' && <div style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.4 }}>{ll.aviso}</div>}

        {ll.fase === 'pausada' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => iniciarLlamada(ll.id, ll.rol, ll.titulo)} style={{ ...boton(false), background: '#10B981' }}>🔄 Reconectar</button>
            <button onClick={() => void colgarLlamada()} style={{ ...boton(false), background: '#DC2626' }}>Colgar</button>
          </div>
        ) : activa ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {ll.mic && <button onClick={silenciarLlamada} style={boton(ll.silenciado)}>{ll.silenciado ? '🔇 Activar mic' : '🎤 Silenciar'}</button>}
            {puedeCompartirPantalla() && (ll.compartiendo
              ? <button onClick={dejarDeCompartir} style={boton(true)}>⏹ Dejar de compartir</button>
              : <button onClick={compartirPantalla} disabled={ll.fase !== 'conectada'} style={{ ...boton(false), opacity: ll.fase === 'conectada' ? 1 : 0.45 }}>🖥️ Compartir pantalla</button>)}
            <button onClick={() => void colgarLlamada()} style={{ ...boton(false), background: '#DC2626' }}>Colgar</button>
          </div>
        ) : null}
      </div>
      <style>{`.df-llamada-pulso { flex: 0 0 auto; width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: #34D399; animation: dfLlPulso 1.2s ease-in-out infinite }
        @keyframes dfLlPulso { 0%,100% { opacity: .35; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.15) } }`}</style>
    </div>
  );
}

const cab: React.CSSProperties = { width: 30, height: 30, borderRadius: 9, border: 0, background: 'rgba(255,255,255,.16)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, flex: '0 0 auto' };
