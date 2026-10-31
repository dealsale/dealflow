import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from './Dropdown';
import { confirmar, notificar } from './dialogs';
import {
  apiRemarketing, apiRemarketingAccion, apiRemarketingCampana, apiRemarketingConfig, apiRemarketingSegmento,
  type LeadRmk, type PanelRemarketing, type ResultadoRmk, type SegmentoRmk,
} from '../lib/api';

/**
 * Remarketing SALIENTE por WhatsApp a los leads que ya escribieron (sin pauta):
 *  - Automático: rescate antes de que cierre la ventana de 24 h y recuperación con plantilla
 *    de quien dio sus datos y no confirmó.
 *  - Envíos por grupo de clientes, con plantilla de marketing aprobada.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnS: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 5 };
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
  const [dias, setDias] = useState(60);
  const [seg, setSeg] = useState<SegmentoRmk>('datos_completos');
  const [msgId, setMsgId] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [limite, setLimite] = useState(200);
  const [vista, setVista] = useState<LeadRmk[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cargar = () => void apiRemarketing(dias).then((r) => r.data && setP(r.data));
  useEffect(() => { cargar(); const t = setInterval(() => { if (!document.hidden) cargar(); }, 30_000); return () => clearInterval(t); }, [dias]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVista(null); }, [seg, dias]);

  const mensajes = useMemo(() => (p?.mensajes || []).filter((m) => m.segmentos.includes(seg)), [p, seg]);
  useEffect(() => { if (mensajes.length && !mensajes.some((m) => m.id === msgId)) setMsgId(mensajes[0].id); }, [mensajes]); // eslint-disable-line react-hooks/exhaustive-deps
  const msg = mensajes.find((m) => m.id === msgId);
  const s = p?.segmentos.find((x) => x.id === seg);

  if (!p) return <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: 20 }}>Cargando remarketing…</div>;
  const oficial = p.whatsapp === 'oficial';
  const cambiarCfg = (c: Partial<PanelRemarketing['cfg']>) => {
    setP({ ...p, cfg: { ...p.cfg, ...c } });
    void apiRemarketingConfig(c).then((r) => { if (r.error) { notificar(r.error, 'error'); cargar(); } });
  };
  const verGrupo = () => void apiRemarketingSegmento(seg, dias).then((r) => setVista(r.data?.leads || []));
  const enviar = async () => {
    if (!msg || !s) return;
    const n = Math.min(s.aptos, limite);
    if (!(await confirmar({
      titulo: `¿Enviar "${msg.titulo}" a ${n} cliente${n === 1 ? '' : 's'}?`,
      mensaje: `Salen de a pocos (unos 5 por minuto, de 8 a. m. a 8 p. m.) y con un máximo de ${p.cfg.topeDiario} al día. A quien escribió en las últimas 24 h le llega como mensaje normal; a los demás, con la plantilla aprobada. Los que piden la baja no vuelven a recibir.`,
      aceptar: 'Enviar',
    }))) return;
    setEnviando(true);
    const r = await apiRemarketingCampana({ segmento: seg, mensaje: msg.id, campos, dias, limite });
    setEnviando(false);
    if (r.error || !r.data) return notificar(r.error || 'No se pudo.', 'error', 7000);
    notificar(`✓ ${r.data.encolados} en cola${r.data.excluidos ? ` (${r.data.excluidos} excluidos)` : ''}. Van saliendo de a pocos.`);
    cargar();
  };
  const accion = (id: string, a: 'pausar' | 'reanudar' | 'cancelar') => void apiRemarketingAccion(id, a).then(cargar);
  const faltaCampo = !!msg?.campos.some((c) => !String(campos[c.id] || '').trim());
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

      {/* Envío por grupo */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>📣 Enviar a un grupo de clientes</div>
          <Dropdown variant="pill" label="Escribieron en" value={String(dias)} onChange={(v) => setDias(Number(v))}
            options={[{ value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }, { value: '60', label: 'Últimos 60 días' }, { value: '90', label: 'Últimos 90 días' }]} />
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Nunca a quien pidió la baja, máximo 1 mensaje por cliente a la semana, de 8 a. m. a 8 p. m. y hasta {p.cfg.topeDiario} al día ({p.enviadosHoy} hoy). Si Meta avisa límite o spam, el envío se pausa solo.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 14 }}>
          {p.segmentos.map((x) => (
            <button key={x.id} onClick={() => setSeg(x.id)} title={x.ayuda}
              style={{ textAlign: 'left', background: seg === x.id ? 'var(--df-purple-subtle, rgba(124,58,237,.08))' : 'var(--df-bg)', border: `1.5px solid ${seg === x.id ? 'var(--df-purple)' : 'var(--df-border)'}`, borderRadius: 10, padding: '9px 11px', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-body)', lineHeight: 1.3 }}>{x.titulo}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{x.aptos}<span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--df-text-muted)' }}>{x.total > x.aptos ? ` de ${x.total}` : ''}</span></div>
            </button>
          ))}
        </div>
        {s && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 12 }}>{s.ayuda} {s.ventanaAbierta > 0 && <>· <b>{s.ventanaAbierta}</b> escribieron en las últimas 24 h (les llega como mensaje normal).</>} <button onClick={verGrupo} style={{ ...btnS, padding: '3px 9px', marginLeft: 4 }}>Ver quiénes</button></div>}
        {vista && (
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--df-border)', borderRadius: 8, marginBottom: 12 }}>
            {!vista.length && <div style={{ padding: 12, fontSize: 12.5, color: 'var(--df-text-faint)' }}>No hay clientes en este grupo.</div>}
            {vista.map((l) => (
              <div key={l.id} style={{ display: 'flex', gap: 10, padding: '7px 10px', borderBottom: '1px solid var(--df-border)', fontSize: 12.5, opacity: l.excluido ? 0.55 : 1 }}>
                <b style={{ minWidth: 120 }}>{l.nombre}</b>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--df-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.ultimo}</span>
                {l.excluido && <span style={{ color: '#B45309', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.excluido}</span>}
              </div>
            ))}
          </div>
        )}
        {!mensajes.length ? <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>No hay mensajes para este grupo.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={lbl}>Mensaje</label>
                <Dropdown value={msgId} onChange={setMsgId} ariaLabel="Mensaje" options={mensajes.map((m) => ({ value: m.id, label: m.titulo }))} />
                {msg && <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 5, color: (ESTADO_PLANTILLA[msg.aprobacion.estado] || ESTADO_PLANTILLA.sin_publicar)[1] }}>Plantilla "{msg.plantilla}": {(ESTADO_PLANTILLA[msg.aprobacion.estado] || ESTADO_PLANTILLA.sin_publicar)[0]}{msg.aprobacion.estado !== 'aprobada' ? ' — mientras tanto solo les llega a quienes escribieron en las últimas 24 h; los demás esperan en cola hasta 5 días.' : ''}</div>}
              </div>
              {msg?.campos.map((c) => (
                <div key={c.id}>
                  <label style={lbl}>{c.titulo}</label>
                  <input value={campos[c.id] || ''} onChange={(e) => setCampos((x) => ({ ...x, [c.id]: e.target.value }))} placeholder={`Ej. ${c.ejemplo}`} maxLength={200} style={inp} />
                </div>
              ))}
              <div>
                <label style={lbl}>Máximo de clientes</label>
                <input type="number" min={1} max={1000} value={limite} onChange={(e) => setLimite(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} style={{ ...inp, maxWidth: 140 }} />
              </div>
              <button onClick={() => void enviar()} disabled={!oficial || !s?.aptos || enviando || faltaCampo} style={{ ...btn, opacity: !oficial || !s?.aptos || enviando || faltaCampo ? 0.5 : 1 }}>
                {enviando ? 'Poniendo en cola…' : `Enviar a ${Math.min(s?.aptos || 0, limite)} cliente${Math.min(s?.aptos || 0, limite) === 1 ? '' : 's'}`}
              </button>
            </div>
            {msg && (
              <div>
                <label style={lbl}>Así le llega (ejemplo)</label>
                <div style={{ background: '#E7FFDB', color: '#111B21', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', boxShadow: '0 1px 1px rgba(0,0,0,.1)' }}>
                  {msg.campos.reduce((t, c) => t.replace(c.ejemplo, campos[c.id]?.trim() || c.ejemplo), msg.ejemplo)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 5 }}>El nombre, los productos y el total salen del chat de cada cliente.</div>
              </div>
            )}
          </div>
        )}
      </div>

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
