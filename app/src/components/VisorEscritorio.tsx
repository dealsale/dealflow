import { useEffect, useRef, useState } from 'react';
import { SesionVisor, type EstadoConexion } from '../escritorio/conexion';
import { CapaControl } from './VentanaLlamada';

/**
 * Visor del equipo de DealFlow: la pantalla del computador de la tienda (app «DealFlow Soporte»)
 * con ratón, teclado, rueda y pegar. Se abre desde la llamada con «Conectar a su computador».
 */
export interface EquipoRemoto { id: string; nombre: string; so: string; version: string; pantalla: string; enLinea: boolean; visto: string; ocupado: string }

export function VisorEscritorio({ sesionId, equipo, onCerrar }: { sesionId: string; equipo: string; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const ses = useRef<SesionVisor | null>(null);
  const [estado, setEstado] = useState<EstadoConexion>('esperando');
  const [detalle, setDetalle] = useState('');
  const [completa, setCompleta] = useState(false);
  useEffect(() => {
    const s = new SesionVisor(sesionId, (e, d) => { setEstado(e); if (d) setDetalle(d); }, (st) => {
      if (video.current && video.current.srcObject !== st) { video.current.srcObject = st; void video.current.play().catch(() => {}); }
    });
    ses.current = s;
    void s.iniciar();
    const f = () => setCompleta(document.fullscreenElement === marco.current && !!marco.current);
    document.addEventListener('fullscreenchange', f);
    return () => { document.removeEventListener('fullscreenchange', f); if (s.vivo) { void fetch(`/api/escritorio/sesion/${sesionId}/terminar`, { method: 'POST', credentials: 'same-origin' }).catch(() => {}); s.terminar(); } };
  }, [sesionId]);
  const terminar = async () => {
    await fetch(`/api/escritorio/sesion/${sesionId}/terminar`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    ses.current?.terminar('Cerraste la sesión.');
  };
  const txt: Record<EstadoConexion, string> = {
    esperando: 'Esperando que la tienda toque «Permitir» en su computador…',
    conectando: 'Conectando con el computador…',
    conectada: 'Conectado: haz clic en la pantalla y escribe.',
    reconectando: 'Se perdió la conexión: reconectando…',
    terminada: detalle || 'La sesión terminó.',
  };
  const b = (bg: string, fg = '#fff'): React.CSSProperties => ({ border: 0, borderRadius: 9, padding: '8px 13px', background: bg, color: fg, fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' });
  return (
    <div role="dialog" aria-label="Computador de la tienda" data-df-no-remoto="" style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(2,6,23,.92)', display: 'flex', flexDirection: 'column', fontFamily: 'inherit', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'linear-gradient(135deg,#1E3A8A,#047857)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>💻</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{equipo}</div>
          <div role="status" style={{ fontSize: 12, opacity: 0.9 }}>{txt[estado]}</div>
        </div>
        {estado !== 'terminada' && <button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void marco.current?.requestFullscreen?.(); }} style={b('rgba(255,255,255,.16)')}>⛶ Pantalla completa</button>}
        {estado !== 'terminada' ? <button onClick={() => void terminar()} style={b('#DC2626')}>Terminar</button> : <button onClick={onCerrar} style={b('#fff', '#0B1220')}>Cerrar</button>}
      </div>
      <div ref={marco} style={{ position: 'relative', flex: 1, minHeight: 0, background: '#000', display: 'grid', placeItems: 'center' }}>
        <video ref={video} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', display: estado === 'conectada' || estado === 'reconectando' ? 'block' : 'none' }} />
        {(estado === 'conectada' || estado === 'reconectando') && <CapaControl video={video} enviar={(a) => ses.current?.enviar(a)} atajos />}
        {estado !== 'conectada' && estado !== 'reconectando' && <div style={{ fontSize: 15, opacity: 0.85, padding: 20, textAlign: 'center' }}>{txt[estado]}</div>}
        {completa && estado !== 'terminada' && <button onClick={() => void terminar()} style={{ ...b('#DC2626'), position: 'absolute', top: 10, right: 10, zIndex: 2 }}>Terminar</button>}
      </div>
      <div style={{ padding: '6px 14px', fontSize: 11.5, opacity: 0.7 }}>Clic, doble clic, clic derecho, rueda y teclado. Pegar texto: Ctrl+V. La tienda puede detener la sesión cuando quiera.</div>
    </div>
  );
}
