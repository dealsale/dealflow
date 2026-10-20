import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DealFlowState, DecoratedOrder } from '../hooks/useDealFlowState';
import { apiDevolucionEffi, apiRastreo, type PasoRastreo } from '../lib/api';

/**
 * Datos de Effi alrededor del envío, dentro del detalle del pedido:
 * rastreo de la guía y devolución.
 */

const caja: CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', background: 'var(--df-bg)', fontSize: 12.5 };
const btnLink: CSSProperties = { background: 'transparent', border: 'none', padding: 0, color: 'var(--df-purple)', fontWeight: 700, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' };
// Effi entrega la fecha en UTC: la mostramos en hora de Colombia.
const fechaCO = (f: string) => {
  const d = new Date(f.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? f : d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Historial de la guía: cada cambio de estado con fecha y hora. */
export function RastreoGuia({ sel }: { sel: DecoratedOrder }) {
  const [abierto, setAbierto] = useState(false);
  const [pasos, setPasos] = useState<PasoRastreo[] | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setAbierto(false); setPasos(null); setMsg(''); }, [sel.id]);
  if (!sel.hasGuia || sel.despachoProveedor !== 'effi') return null;
  const cargar = async (forzar = false) => {
    setMsg('Consultando a Effi…');
    const r = await apiRastreo(String(sel.rowId), forzar);
    if (r.error) { setMsg(r.error); return; }
    setPasos(r.data?.pasos || []); setMsg('');
  };
  const alternar = () => { const v = !abierto; setAbierto(v); if (v && !pasos) void cargar(); };
  return (
    <div style={caja}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b>📍 Rastreo de la guía</b>
        <div style={{ flex: 1 }} />
        {abierto && <button onClick={() => void cargar(true)} style={btnLink}>↻ Actualizar</button>}
        <button onClick={alternar} style={btnLink}>{abierto ? 'Ocultar' : 'Ver movimientos'}</button>
      </div>
      {abierto && (
        <div style={{ marginTop: 8 }}>
          {msg && <div style={{ color: msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
          {pasos && !pasos.length && !msg && <div style={{ color: 'var(--df-text-muted)' }}>La transportadora todavía no reporta movimientos.</div>}
          {pasos && pasos.length > 0 && (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {pasos.map((p, i) => (
                <li key={p.fecha + p.estado} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i === pasos.length - 1 ? 0 : 10 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 4, background: i === 0 ? 'var(--df-purple)' : 'var(--df-border-strong)' }} />
                    {i < pasos.length - 1 && <span style={{ width: 2, flex: 1, background: 'var(--df-border)', marginTop: 2 }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: i === 0 ? 'var(--df-text-strong)' : 'var(--df-text-body)' }}>{p.estado || p.estadoGlobal}</b>
                    <span style={{ color: 'var(--df-text-muted)', marginLeft: 6, fontSize: 11.5 }}>{fechaCO(p.fecha)}</span>
                    {p.observacion && <div style={{ color: 'var(--df-text-muted)', fontSize: 12 }}>{p.observacion}</div>}
                    {p.foto && <a href={p.foto} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-purple)' }}>📷 Evidencia</a>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Registrar en Effi la devolución de un pedido devuelto (la mercancía vuelve a la bodega). */
export function DevolucionEffi({ df, sel }: { df: DealFlowState; sel: DecoratedOrder }) {
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => setMsg(''), [sel.id]);
  if (sel.despachoProveedor !== 'effi' || !sel.effiRemision) return null;
  if (sel.effiDevolucion) return <div style={caja}>↩️ Devolución <b>{sel.effiDevolucion}</b> registrada en Effi: la mercancía volvió a la bodega.</div>;
  if (sel.estado !== 'Devuelto') return null;
  const registrar = async () => {
    setEnviando(true); setMsg('Registrando la devolución en Effi…');
    const r = await apiDevolucionEffi(String(sel.rowId));
    setEnviando(false);
    if (r.error) { setMsg(r.error); return; }
    setMsg(`✓ Devolución ${r.data?.devolucion} registrada`);
    await df.refrescarPedidos();
  };
  return (
    <div style={{ ...caja, borderColor: 'var(--df-warning-border)', background: 'var(--df-warning-subtle-2)' }}>
      <b>↩️ Pedido devuelto</b>
      <div style={{ color: 'var(--df-text-body)', margin: '2px 0 8px' }}>Registra la devolución en Effi para que los productos vuelvan al inventario de tu bodega.</div>
      <button onClick={registrar} disabled={enviando} style={{ background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 13px', fontWeight: 700, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}>Registrar devolución en Effi</button>
      {msg && <div style={{ marginTop: 6, fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-brand-dark)' : msg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{msg}</div>}
    </div>
  );
}
