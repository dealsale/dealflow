import { useEffect, useRef, useState } from 'react';
import { apiSoporteLlamar } from '../lib/api';
import { useSoporteConfig } from './AsistenteSoporte';
import { useLlamada, iniciarLlamada, minimizarLlamada } from '../lib/llamadaRTC';

/**
 * Botón «Soporte» del encabezado (junto al estado de WhatsApp): llama al equipo de DealFlow.
 * La llamada (audio y pantalla compartida) ocurre en la ventana flotante, dentro del panel.
 * Durante la llamada el botón muestra el tiempo y, si está minimizada, la vuelve a abrir.
 */
const dur = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function BotonSoporte({ seccion, compacto }: { seccion: string; compacto?: boolean }) {
  const cfg = useSoporteConfig();
  const ll = useLlamada();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [, tic] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ll?.fase !== 'conectada') return; const t = setInterval(() => tic((x) => x + 1), 1000); return () => clearInterval(t); }, [ll?.fase]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const serv = cfg?.llamadas;
  if (!serv?.activo) return null;
  const enLlamada = !!ll && ll.rol === 'tienda' && ll.fase !== 'terminada';

  const llamar = async () => {
    setOcupado(true); setMsg('');
    const r = await apiSoporteLlamar(motivo.trim(), seccion);
    setOcupado(false);
    if (!r.data) { setMsg(r.error || 'No se pudo iniciar la llamada.'); return; }
    setAbierto(false); setMotivo('');
    iniciarLlamada(r.data.id, 'tienda', 'Soporte DealFlow');
  };

  const pill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: compacto ? '5px 10px' : '4px 12px', fontSize: 12, fontWeight: 700,
    fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid',
  };
  if (enLlamada) {
    return (
      <button type="button" onClick={() => minimizarLlamada(false)} title="Ver la llamada"
        style={{ ...pill, background: '#047857', borderColor: '#047857', color: '#fff' }}>
        <span className="df-sop-onda" />📞 {ll!.fase === 'conectada' && ll!.inicio ? `En llamada ${dur(Date.now() - ll!.inicio)}` : ll!.fase === 'pausada' ? 'Llamada en pausa' : 'Llamando a soporte…'}
        <style>{'.df-sop-onda { width: 7px; height: 7px; border-radius: 50%; background: #6EE7B7; animation: dfSopOnda 1.2s ease-in-out infinite } @keyframes dfSopOnda { 0%,100% { opacity: .4 } 50% { opacity: 1 } }'}</style>
      </button>
    );
  }
  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAbierto((v) => !v)} title={serv.abierto ? 'Habla con el equipo de DealFlow (audio y pantalla compartida)' : `Soporte por llamada: ${serv.horario}`}
        style={{ ...pill, background: 'var(--df-surface)', borderColor: 'var(--df-border)', color: serv.abierto ? 'var(--df-text-body)' : 'var(--df-text-muted)' }}>
        <span style={{ fontSize: 13 }}>🎧</span>{compacto ? 'Soporte' : 'Llamar a soporte'}
        {serv.abierto && <span title="Disponible ahora" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--df-brand-mid, #10B981)' }} />}
      </button>
      {abierto && (
        <div role="dialog" aria-label="Llamar a soporte" style={{ ...(compacto ? { position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 72px)' } : { position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 300 }), zIndex: 70, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, boxShadow: '0 20px 50px -18px rgba(2,6,23,.45)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, lineHeight: 1.45, color: 'var(--df-text-body)' }}>
          <b style={{ fontSize: 14, color: 'var(--df-text-strong)' }}>🎧 Soporte DealFlow</b>
          {serv.abierto ? (
            <>
              <div style={{ color: 'var(--df-text-muted)' }}>Te llamamos aquí mismo, sin instalar nada: hablas con el equipo y, si quieres, nos muestras tu pantalla. Te pediremos permiso para el micrófono.</div>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} autoFocus placeholder="¿Con qué te ayudamos? (opcional)" onKeyDown={(e) => { if (e.key === 'Enter') void llamar(); }}
                style={{ font: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--df-border)', background: 'var(--df-bg)', color: 'var(--df-text)' }} />
              <button type="button" onClick={() => void llamar()} disabled={ocupado}
                style={{ border: 0, borderRadius: 10, padding: '10px 12px', background: '#047857', color: '#fff', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: ocupado ? 0.6 : 1 }}>
                {ocupado ? 'Llamando…' : '📞 Llamar ahora'}
              </button>
            </>
          ) : (
            <div style={{ color: 'var(--df-text-muted)' }}>Ahora no hay atención por llamada. Horario: {serv.horario}.{serv.aviso ? ` ${serv.aviso}` : ''}</div>
          )}
          {msg && <div style={{ color: 'var(--df-danger-dark, #B91C1C)', fontWeight: 600 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
