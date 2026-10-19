import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { apiNovedadAvisar, apiNovedadSolucion, apiNovedadesSync, type NovedadPedido, type PropuestaNovedad } from '../lib/api';

/**
 * Novedades de envío (Effi): lo que reporta la transportadora cuando no pudo
 * entregar. Tarjeta dentro del pedido (para resolverla) y bandeja en Pedidos
 * (las abiertas, de la más antigua a la más nueva).
 */

const SOLUCIONES: { id: PropuestaNovedad['solucion']; label: string; ayuda: string }[] = [
  { id: 'ofrecer', label: 'Volver a ofrecer', ayuda: 'Misma dirección, otro día' },
  { id: 'redireccionar', label: 'Otra dirección', ayuda: 'En la misma ciudad' },
  { id: 'devolver', label: 'Devolver', ayuda: 'Regresa al remitente' },
];
const NOMBRE: Record<string, string> = { ofrecer: 'Volver a ofrecer', redireccionar: 'Redireccionar', devolver: 'Devolver al remitente' };

/** YYYY-MM-DD en Colombia, `dias` desde hoy. */
const fechaCO = (dias: number) => new Date(Date.now() - 5 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);
const hace = (d: number) => (d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`);

const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-strong)' };
const lbl: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 3, display: 'block' };
const btn = (primario: boolean): CSSProperties => ({ background: primario ? 'var(--df-warning)' : 'var(--df-surface)', color: primario ? '#fff' : 'var(--df-text-body)', border: primario ? 'none' : '1px solid var(--df-border)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' });

/** Texto corto de en qué va la novedad (para la bandeja y la tarjeta). */
export function avanceNovedad(n: NovedadPedido): { texto: string; color: string } {
  if (!n.abierta) return { texto: `Cerrada · ${n.estado}`, color: 'var(--df-text-muted)' };
  if (n.propuestaEstado === 'enviada') {
    if (n.gestionEst === 3) return { texto: `Effi rechazó la solución${n.gestionMsg ? `: ${n.gestionMsg}` : ''}`, color: 'var(--df-danger-dark)' };
    return { texto: `Solución enviada · ${n.gestionTxt || 'en revisión'}`, color: 'var(--df-purple)' };
  }
  if (n.propuestaEstado === 'lista' && n.propuesta) return { texto: `El cliente eligió: ${NOMBRE[n.propuesta.solucion]}${n.propuesta.fecha ? ` (${n.propuesta.fecha})` : ''} · falta enviarla`, color: 'var(--df-warning)' };
  if (n.propuestaEstado === 'error') return { texto: n.gestionMsg || 'Falta un dato para enviarla', color: 'var(--df-danger-dark)' };
  if (n.aviso) return { texto: `Esperando respuesta del cliente (avisado por ${n.aviso === 'plantilla' ? 'plantilla' : 'WhatsApp'})`, color: 'var(--df-text-muted)' };
  return { texto: 'Sin avisar al cliente', color: 'var(--df-danger-dark)' };
}

/** Tarjeta de la novedad dentro del pedido. */
export function NovedadCard({ df, sel }: { df: DealFlowState; sel: DecoratedOrder }) {
  const n = sel.novedad;
  const base: PropuestaNovedad = n?.propuesta || { solucion: 'ofrecer' };
  const [p, setP] = useState<PropuestaNovedad>(base);
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Al cambiar de pedido (o llegar la propuesta del bot), precargamos.
  useEffect(() => {
    setP({
      solucion: base.solucion,
      fecha: base.fecha && base.fecha >= fechaCO(1) ? base.fecha : fechaCO(1),
      recibe: base.recibe || sel.cliente,
      direccion: base.direccion || sel.direccion,
      telefono: base.telefono || String(sel.tel || '').replace(/\D/g, '').slice(-10),
      nota: base.nota || '',
    });
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.id, n?.id, n?.propuestaEstado, n?.propuesta?.fecha]);
  if (!n) return null;

  const av = avanceNovedad(n);
  const enEspera = n.propuestaEstado === 'enviada' && n.gestionEst !== 3;
  const puedeEnviar = n.abierta && !enEspera;
  const set = (k: keyof PropuestaNovedad, v: string) => setP((x) => ({ ...x, [k]: v }));

  async function enviar() {
    setEnviando(true); setMsg('Enviando a Effi…');
    const r = await apiNovedadSolucion(n!.id, { ...p, direccion: p.solucion === 'ofrecer' ? (p.direccion || sel.direccion) : p.direccion });
    setEnviando(false);
    if (r.error) { setMsg(r.error); return; }
    setMsg(`✓ Solución enviada · ${r.data?.estado || 'en revisión'}`);
    await df.refrescarPedidos();
  }
  async function avisar() {
    setMsg('Escribiéndole al cliente…');
    const r = await apiNovedadAvisar(n!.id);
    setMsg(r.error ? r.error : `✓ Cliente avisado (${r.data?.via === 'plantilla' ? 'con plantilla' : 'por WhatsApp'})`);
    await df.refrescarPedidos();
  }

  return (
    <div style={{ border: `1px solid ${n.abierta ? 'var(--df-warning-border)' : 'var(--df-border)'}`, background: n.abierta ? 'var(--df-warning-subtle-2)' : 'var(--df-bg)', borderRadius: 12, padding: 14, marginBottom: 12 }} className="df-novedad">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{n.abierta ? '⚠️' : '✅'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: n.abierta ? 'var(--df-warning)' : 'var(--df-text-strong)' }}>Novedad: {n.nombre || 'problema en la entrega'}</div>
          <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 2 }}>{n.transportadora || 'Transportadora'} · {hace(n.dias)} · {n.estado}</div>
          {n.aclaracion && <div style={{ fontSize: 12.5, color: 'var(--df-text-body)', marginTop: 6 }}>{n.aclaracion}</div>}
          <div style={{ fontSize: 12, fontWeight: 700, color: av.color, marginTop: 6 }}>{av.texto}</div>
        </div>
        {n.foto && <a href={n.foto} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-purple)' }}>📷 Foto</a>}
      </div>

      {n.abierta && !n.aviso && <div style={{ marginTop: 10 }}><button onClick={avisar} style={btn(false)}>💬 Avisar al cliente por WhatsApp</button></div>}

      {puedeEnviar && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--df-warning-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {n.propuesta?.origen === 'bot' && n.propuestaEstado !== 'enviada' && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>🤖 Lo acordó el asistente con el cliente; revísalo y envíalo.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {SOLUCIONES.map((s) => {
              const on = p.solucion === s.id;
              return (
                <button key={s.id} onClick={() => set('solucion', s.id)} aria-pressed={on} style={{ textAlign: 'left', border: `1.5px solid ${on ? 'var(--df-warning)' : 'var(--df-border)'}`, background: on ? 'var(--df-warning-subtle)' : 'var(--df-surface)', borderRadius: 9, padding: '7px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--df-text-strong)' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>{s.ayuda}</div>
                </button>
              );
            })}
          </div>
          {p.solucion !== 'devolver' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={lbl}>Fecha de entrega</label><input type="date" style={input} value={p.fecha || ''} min={fechaCO(1)} max={fechaCO(5)} onChange={(e) => set('fecha', e.target.value)} /></div>
              <div><label style={lbl}>Quién recibe</label><input style={input} value={p.recibe || ''} maxLength={50} onChange={(e) => set('recibe', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>{p.solucion === 'ofrecer' ? 'Dirección (la misma del pedido)' : 'Nueva dirección (misma ciudad)'}</label><input style={input} value={p.direccion || ''} maxLength={100} onChange={(e) => set('direccion', e.target.value)} /></div>
              <div><label style={lbl}>Celular de contacto</label><input style={input} value={p.telefono || ''} maxLength={40} onChange={(e) => set('telefono', e.target.value)} /></div>
              <div><label style={lbl}>Nota (opcional)</label><input style={input} value={p.nota || ''} maxLength={300} onChange={(e) => set('nota', e.target.value)} placeholder="Ej. llamar antes de llegar" /></div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={enviar} disabled={enviando} style={{ ...btn(true), opacity: enviando ? 0.6 : 1 }}>{enviando ? 'Enviando…' : '📤 Enviar solución a Effi'}</button>
            <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>La fecha debe ser entre mañana y 5 días.</span>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
    </div>
  );
}

/** Bandeja "Novedades por resolver" (arriba de la lista de pedidos). */
export function NovedadesBandeja({ df }: { df: DealFlowState }) {
  const abiertas = df.allOrders.filter((o) => o.novedad?.abierta).sort((a, b) => (b.novedad!.dias - a.novedad!.dias));
  const [ver, setVer] = useState(true);
  const [msg, setMsg] = useState('');
  if (!df.effiApi.conectado && !abiertas.length) return null;
  async function revisar() {
    setMsg('Revisando en Effi…');
    const r = await apiNovedadesSync();
    setMsg(r.error ? r.error : `✓ Revisado: ${r.data?.abiertas || 0} abierta(s)${r.data?.nuevas ? ` · ${r.data.nuevas} nueva(s)` : ''}`);
    await df.refrescarPedidos();
  }
  if (!abiertas.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 12 }}>
        <span>✅ Sin novedades de envío por resolver.</span>
        <button onClick={revisar} style={{ background: 'transparent', border: 'none', color: 'var(--df-purple)', fontWeight: 700, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', padding: 0 }}>↻ Revisar en Effi</button>
        {msg && <span style={{ color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</span>}
      </div>
    );
  }
  return (
    <div style={{ border: '1px solid var(--df-warning-border)', background: 'var(--df-warning-subtle-2)', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }} className="df-novedad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', flexWrap: 'wrap' }}>
        <button onClick={() => setVer((x) => !x)} aria-expanded={ver} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, color: 'var(--df-warning)' }}>
          ⚠️ {abiertas.length} {abiertas.length === 1 ? 'novedad' : 'novedades'} por resolver {ver ? '▴' : '▾'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--df-warning)', opacity: 0.8 }}>Resuélvelas antes de que la transportadora devuelva el pedido.</span>
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</span>}
        <button onClick={revisar} style={btn(false)}>↻ Revisar en Effi</button>
      </div>
      {ver && abiertas.map((o) => {
        const n = o.novedad!; const av = avanceNovedad(n);
        return (
          <div key={o.id} onClick={o.open} className="df-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderTop: '1px solid var(--df-warning-border)', cursor: 'pointer', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, fontWeight: 700, minWidth: 74 }}>{o.id}</span>
            <span style={{ fontWeight: 700, fontSize: 13, minWidth: 0, flex: '0 1 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} translate="no">{o.cliente}</span>
            <span style={{ fontSize: 12.5, color: 'var(--df-text-body)', flex: '1 1 160px', minWidth: 0 }}>{n.nombre}{n.transportadora ? ` · ${n.transportadora}` : ''}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: av.color, flex: '1 1 200px', minWidth: 0 }}>{av.texto}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: n.dias >= 2 ? 'var(--df-danger-dark)' : 'var(--df-warning)', whiteSpace: 'nowrap' }}>{hace(n.dias)}</span>
          </div>
        );
      })}
    </div>
  );
}
