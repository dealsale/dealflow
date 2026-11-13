import { useEffect, useState } from 'react';
import { ImportarContactos } from './ImportarContactos';
import { CampanaPlantilla } from './CampanaPlantilla';
import { Dropdown } from './Dropdown';
import { notificar } from './dialogs';
import {
  apiRemarketing, apiRemarketingAccion, apiRemarketingConfig,
  type PanelRemarketing, type ResultadoRmk,
} from '../lib/api';

/**
 * Remarketing SALIENTE por WhatsApp a los leads que ya escribieron (sin pauta):
 *  - Automático: rescate antes de que cierre la ventana de 24 h y recuperación con plantilla
 *    de quien dio sus datos y no confirmó.
 *  - Envíos por grupo de clientes, con plantilla de marketing aprobada.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btnS: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

function Interruptor({ on, onChange, titulo, ayuda }: { on: boolean; onChange: (v: boolean) => void; titulo: string; ayuda: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
      <span onClick={(e) => { e.preventDefault(); onChange(!on); }} role="switch" aria-checked={on}
        style={{ flex: '0 0 auto', width: 40, height: 23, borderRadius: 999, background: on ? 'var(--df-brand, #10B981)' : 'var(--df-border)', position: 'relative', transition: 'background .2s', marginTop: 1 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
      </span>
      <span><b style={{ fontSize: 13.5 }}>{titulo}</b><div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', lineHeight: 1.5, marginTop: 2 }}>{ayuda}</div></span>
    </label>
  );
}

function Cifras({ r }: { r: ResultadoRmk }) {
  const items: [string, string | number, string?][] = [
    ['Enviados', r.enviados], ['Respondieron', r.respondieron], ['Compraron', r.compraron, '#047857'], ['Ventas', pesos(r.ventas), '#047857'],
  ];
  if (r.pendientes || r.esperandoPlantilla) items.push(['En cola', r.pendientes + r.esperandoPlantilla]);
  if (r.fallidos) items.push(['Fallidos', r.fallidos, '#B91C1C']);
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map(([t, v, c]) => <div key={t}><div style={{ fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 600 }}>{t}</div><div style={{ fontSize: 17, fontWeight: 800, color: c || 'var(--df-text-strong)' }}>{v}</div></div>)}
    </div>
  );
}

const ESTADO_PLANTILLA: Record<string, [string, string]> = {
  aprobada: ['✓ Aprobada por Meta', '#047857'], pendiente: ['⏳ En revisión de Meta', '#B45309'], rechazada: ['✗ Rechazada por Meta', '#B91C1C'],
  error: ['⚠️ No se pudo enviar a Meta', '#B91C1C'], sin_publicar: ['⏳ Todavía no se ha enviado a Meta', '#B45309'],
};

export function Remarketing() {
  const [p, setP] = useState<PanelRemarketing | null>(null);
  const [dias] = useState(60);
  const cargar = () => void apiRemarketing(dias).then((r) => r.data && setP(r.data));
  useEffect(() => { cargar(); const t = setInterval(() => { if (!document.hidden) cargar(); }, 30_000); return () => clearInterval(t); }, [dias]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: 20 }}>Cargando remarketing…</div>;
  const oficial = p.whatsapp === 'oficial';
  const cambiarCfg = (c: Partial<PanelRemarketing['cfg']>) => {
    setP({ ...p, cfg: { ...p.cfg, ...c } });
    void apiRemarketingConfig(c).then((r) => { if (r.error) { notificar(r.error, 'error'); cargar(); } });
  };
  const accion = (id: string, a: 'pausar' | 'reanudar' | 'cancelar') => void apiRemarketingAccion(id, a).then(cargar);
  const recupera = p.mensajes.find((m) => m.id === 'recuperar_pedido');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!oficial && (
        <div style={{ ...card, background: 'rgba(245,158,11,.1)', borderColor: 'var(--df-warning, #F59E0B)', fontSize: 13, lineHeight: 1.5 }}>
          ⚠️ {p.whatsapp === 'qr'
            ? 'Tu WhatsApp está conectado por QR: solo funciona el rescate antes de las 24 h. Los envíos con plantilla necesitan la conexión oficial (por QR el riesgo de bloqueo es muy alto).'
            : 'Conecta WhatsApp para usar el remarketing.'}
        </div>
      )}

      {/* Automático */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🤖 Automático</div>
        <p style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>Para los clientes que ya dieron sus datos y no terminaron la compra. Corre solo; si el cliente responde, el asistente sigue la conversación y cierra el pedido.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Interruptor on={p.cfg.rescate24h} onChange={(v) => cambiarCfg({ rescate24h: v })} titulo="Último mensaje antes de que se cierre la ventana de 24 h"
              ayuda={<>A las ~21 h de su último mensaje, a quien dio sus datos (completos o a mitad) y dejó de responder: <i>"Tu pedido quedó pendiente: … ¿Te lo enviamos? Respóndeme Sí"</i>. Va como mensaje normal: <b>no gasta plantilla</b>.</>} />
            <div style={{ marginTop: 8, marginLeft: 52 }}><Cifras r={p.automaticos.rescate} /></div>
          </div>
          <div>
            <Interruptor on={p.cfg.recuperar} onChange={(v) => cambiarCfg({ recuperar: v })} titulo="Recuperar a quien dio sus datos y no confirmó (con plantilla)"
              ayuda={<>Un día después de su último mensaje (ya con la ventana cerrada) le llega la plantilla <b>"Tu pedido quedó a un paso"</b> con sus productos y el total, y un botón <b>"Sí, envíamelo"</b>. Hasta 7 días después de que dejó de escribir.
                {recupera && <div style={{ marginTop: 4, fontWeight: 700, color: (ESTADO_PLANTILLA[recupera.aprobacion.estado] || ESTADO_PLANTILLA.sin_publicar)[1] }}>Plantilla: {(ESTADO_PLANTILLA[recupera.aprobacion.estado] || ESTADO_PLANTILLA.sin_publicar)[0]}{recupera.aprobacion.motivo ? ` · ${recupera.aprobacion.motivo}` : ''}</div>}</>} />
            {p.cfg.recuperar && (
              <div style={{ marginTop: 8, marginLeft: 52, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                <span>Mensajes:</span>
                <Dropdown variant="pill" value={String(p.cfg.toques)} onChange={(v) => cambiarCfg({ toques: v === '2' ? 2 : 1 })}
                  options={[{ value: '1', label: '1 (al día siguiente)' }, { value: '2', label: '2 (y otro 3 días después)' }]} />
              </div>
            )}
            <div style={{ marginTop: 8, marginLeft: 52 }}><Cifras r={p.automaticos.recuperacion} /></div>
          </div>
        </div>
      </div>

      {/* Contactos importados y etiquetas */}
      <ImportarContactos etiquetas={p.etiquetas} onCambio={cargar} />

      {/* Campaña con plantilla propia aprobada por Meta */}
      <CampanaPlantilla p={p} onEnviada={cargar} />

      {/* Historial de envíos */}
      {p.campanas.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>📊 Envíos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {p.campanas.map((c) => (
              <div key={c.id} style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <b style={{ fontSize: 13, flex: 1, minWidth: 180 }}>{c.nombre}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{new Date(c.creado.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 9px', background: c.estado === 'enviando' ? 'rgba(124,58,237,.1)' : c.estado === 'pausada' ? 'rgba(245,158,11,.15)' : 'var(--df-surface-2)', color: c.estado === 'pausada' ? '#B45309' : 'var(--df-text-body)' }}>
                    {c.estado === 'enviando' ? '📤 Enviando' : c.estado === 'pausada' ? '⏸ Pausado' : c.estado === 'cancelada' ? 'Cancelado' : '✓ Terminado'}
                  </span>
                  {c.estado === 'enviando' && <button onClick={() => accion(c.id, 'pausar')} style={btnS}>Pausar</button>}
                  {c.estado === 'pausada' && <button onClick={() => accion(c.id, 'reanudar')} style={btnS}>Reanudar</button>}
                  {(c.estado === 'enviando' || c.estado === 'pausada') && <button onClick={() => accion(c.id, 'cancelar')} style={{ ...btnS, color: '#B91C1C' }}>Cancelar</button>}
                </div>
                {c.motivo && <div style={{ fontSize: 12, color: '#B45309', marginBottom: 6 }}>{c.motivo}</div>}
                <Cifras r={c} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
