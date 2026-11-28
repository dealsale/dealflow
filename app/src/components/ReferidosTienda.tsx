import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icono } from './Icono';
import { notificar } from './dialogs';
import { fmt } from '../lib/format';
import { fmtCO } from '../lib/fechaCO';
import { apiReferidos, linkReferido, type EstadoReferida, type ProgramaReferidos } from '../lib/api';

/*
 * Programa de referidos (en la Billetera): solo aparece en las cuentas que DealFlow activó.
 * Muestra el link para invitar, lo ganado y las cuentas de su red. Lo ganado cae en la billetera.
 */

const card: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 10, padding: '9px 14px', font: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 };
export const ESTADO_REFERIDA: Record<EstadoReferida, { texto: string; color: string }> = {
  sin_activar: { texto: 'Sin activar', color: '#F59E0B' },
  activa: { texto: 'Activa', color: '#10B981' },
  vencida: { texto: 'Vencida', color: '#94A3B8' },
};
export const fechaCorta = (s: string) => { if (!s) return ''; const d = new Date(/[zZ]$/.test(s) ? s : s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? s : fmtCO('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(d); };

export function ReferidosTienda() {
  const [p, setP] = useState<ProgramaReferidos | null>(null);
  useEffect(() => { void apiReferidos().then((r) => setP(r.data?.programa || null)); }, []);
  if (!p) return null;

  const link = linkReferido(p.codigo);
  const copiar = () => { void navigator.clipboard?.writeText(link).then(() => notificar('Link copiado. Compártelo con quien quieras invitar.', 'ok')).catch(() => notificar(link, 'info', 8000)); };
  const textoWA = encodeURIComponent(`Te recomiendo DealFlow: un asistente con IA que vende por WhatsApp y deja los pedidos listos para despachar. Crea tu cuenta aquí: ${link}`);
  const activas = p.red.filter((c) => c.estado === 'activa').length;

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Icono nombre="regalo" tam={20} degradado />
        <div style={{ fontWeight: 800, fontSize: 16 }}>Programa de referidos</div>
        {!p.activo && <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(148,163,184,.18)', color: 'var(--df-text-muted)' }}>En pausa</span>}
      </div>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 13.5, margin: '0 0 14px', lineHeight: 1.55 }}>
        {p.activo
          ? <>Ganas <b style={{ color: 'var(--df-text-body)' }}>{fmt(p.monto)}</b> cuando una cuenta que llegó por tu link activa su bot, y otros <b style={{ color: 'var(--df-text-body)' }}>{fmt(p.monto)}</b> cada mes que paga. Lo que ganas cae en tu billetera y lo puedes retirar cuando quieras.</>
          : 'Tu programa de referidos está en pausa: por ahora los pagos de tu red no suman. Escríbenos si tienes dudas.'}
      </p>

      {p.activo && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: '1 1 260px', minWidth: 0, border: '1px dashed var(--df-border)', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'var(--df-surface-2, transparent)' }} title={link}>{link}</div>
          <button style={btn} onClick={copiar}><Icono nombre="copiar" tam={15} />Copiar link</button>
          <a style={{ ...btn, textDecoration: 'none' }} href={`https://wa.me/?text=${textoWA}`} target="_blank" rel="noopener"><Icono nombre="chat" tam={15} />Compartir</a>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: p.red.length ? 16 : 0 }}>
        {[
          { t: 'Ganado en total', v: fmt(p.ganado) },
          { t: 'Últimos 30 días', v: fmt(p.ganadoMes) },
          { t: 'Cuentas en tu red', v: `${p.red.length}${p.red.length ? ` · ${activas} activa${activas === 1 ? '' : 's'}` : ''}` },
        ].map((x) => (
          <div key={x.t} style={{ border: '1px solid var(--df-border)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: 'var(--df-text-muted)', fontWeight: 600 }}>{x.t}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{x.v}</div>
          </div>
        ))}
      </div>

      {p.red.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {p.red.map((c) => {
            const e = ESTADO_REFERIDA[c.estado];
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--df-border)', borderRadius: 10, fontSize: 13.5 }}>
                <Icono nombre="tienda" tam={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>En tu red desde {fechaCorta(c.desde)}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: e.color, background: `${e.color}22` }}>{e.texto}</span>
                <div style={{ fontWeight: 800, minWidth: 80, textAlign: 'right' }}>{fmt(c.ganado)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
