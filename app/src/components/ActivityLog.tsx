import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

/** Formatea la marca de tiempo del evento en hora de Bogotá ("11 sept, 14:30"). */
function cuando(iso: string): string {
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).endsWith('Z') ? '' : 'Z'));
  if (isNaN(+d)) return iso;
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' });
}

const COLOR: Record<string, { dot: string; bg: string; txt: string }> = {
  error: { dot: '#DC2626', bg: '#FEF2F2', txt: '#B91C1C' },
  warn: { dot: '#D97706', bg: '#FFFBEB', txt: '#B45309' },
  info: { dot: '#059669', bg: '#F0FDF4', txt: '#047857' },
};

/**
 * Registro de actividad de la tienda: ventana discreta que se abre desde el
 * Inbox y muestra qué pasó (flujos disparados, respuestas del asistente,
 * pedidos) y, sobre todo, los errores de envío de mensajes.
 */
export function ActivityLog({ df }: { df: DealFlowState }) {
  const [soloErrores, setSoloErrores] = useState(false);
  if (!df.logsOpen) return null;
  const items = df.logs.filter((l) => !soloErrores || l.nivel === 'error');
  const errores = df.logs.filter((l) => l.nivel === 'error').length;

  return (
    <div
      onClick={df.cerrarLogs}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', width: 'min(680px, 100%)', maxHeight: '82vh', borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: 16 }}>🩺</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Registro de actividad</div>
            <div style={{ color: '#94A3B8', fontSize: 12 }}>Lo que pasó en tu tienda: flujos, respuestas y errores de envío.</div>
          </div>
          <div style={{ flex: 1 }} />
          <span onClick={df.cerrarLogs} title="Cerrar" style={{ cursor: 'pointer', color: '#94A3B8', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSoloErrores(false)}
            style={{ border: '1px solid ' + (!soloErrores ? '#0F172A' : '#E2E8F0'), background: !soloErrores ? '#0F172A' : '#fff', color: !soloErrores ? '#fff' : '#475569', borderRadius: 999, padding: '5px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
          >Todo</button>
          <button
            onClick={() => setSoloErrores(true)}
            style={{ border: '1px solid ' + (soloErrores ? '#DC2626' : '#E2E8F0'), background: soloErrores ? '#DC2626' : '#fff', color: soloErrores ? '#fff' : '#475569', borderRadius: 999, padding: '5px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
          >Solo errores{errores ? ` (${errores})` : ''}</button>
          <div style={{ flex: 1 }} />
          <button onClick={df.reloadLogs} style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#334155', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>↻ Actualizar</button>
          <button onClick={df.limpiarLogs} className="df-danger-hover" style={{ border: '1px solid #FECACA', background: '#fff', color: '#B91C1C', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Limpiar</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 12px' }}>
          {items.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              {soloErrores ? 'Sin errores registrados. 🎉' : 'Aún no hay actividad registrada.'}
            </div>
          ) : (
            items.map((l, i) => {
              const c = COLOR[l.nivel] || COLOR.info;
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 8px', borderBottom: '1px solid #F8FAFC', alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: c.txt, background: c.bg, borderRadius: 5, padding: '1px 7px' }}>{l.evento || l.nivel}</span>
                      <span style={{ color: '#94A3B8', fontSize: 11.5 }}>{cuando(l.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', marginTop: 3, lineHeight: 1.45 }}>{l.detalle}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
