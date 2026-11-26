import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiPedidosRepetidos, apiCancelarRepetido, apiNoEsRepetido, type ParRepetido } from '../lib/api';
import { confirmar, notificar } from './dialogs';

const plata = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const fecha = (s: string) => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(+d) ? s : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }); };
const DONDE: Record<string, { txt: string; color: string }> = {
  dropi: { txt: 'Dropi', color: '#F97316' }, effi: { txt: 'Effi', color: '#2563EB' }, bodega: { txt: 'Bodega DealFlow', color: '#7C3AED' }, guia: { txt: 'Con guía', color: '#0891B2' },
};

/**
 * Aviso en Pedidos: compras que el asistente registró dos veces (el cliente respondió al aviso de
 * entrega y salió otra guía). La tienda revisa cada par y cancela el repetido sin avisarle al cliente.
 */
export function PedidosRepetidos({ verPedido, alCambiar }: { verPedido: (id: string) => void; alCambiar: () => void }) {
  const [pares, setPares] = useState<ParRepetido[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const cargar = () => apiPedidosRepetidos().then(({ data }) => setPares(data?.pares || []));
  useEffect(() => { void cargar(); }, []);
  if (!pares.length) return null;

  const cancelar = async (p: ParRepetido) => {
    const ok = await confirmar({
      titulo: `¿Cancelar DF-${p.repetido.numero}?`,
      mensaje: `Se cancela el pedido repetido de ${p.cliente}. El original DF-${p.original.numero} sigue igual. Al cliente no le llega ningún mensaje.${p.repetido.donde === 'effi' ? ' También se anula la guía en Effi.' : p.repetido.donde === 'dropi' ? ' Ojo: la orden en Dropi la tienes que cancelar tú allá.' : ''}`,
      aceptar: 'Sí, cancelar el repetido', peligro: true,
    });
    if (!ok) return;
    setOcupado(p.repetido.id);
    const r = await apiCancelarRepetido(p.repetido.id);
    setOcupado('');
    if (r.error) return notificar(r.error, 'error', 7000);
    notificar(`DF-${p.repetido.numero} cancelado.${r.data?.nota ? ' ' + r.data.nota : ''}`, 'ok', r.data?.nota ? 8000 : 3600);
    setPares((x) => x.filter((y) => y.repetido.id !== p.repetido.id));
    alCambiar();
  };
  const noEs = async (p: ParRepetido) => {
    setOcupado(p.repetido.id);
    await apiNoEsRepetido(p.repetido.id);
    setOcupado('');
    setPares((x) => x.filter((y) => y.repetido.id !== p.repetido.id));
  };

  const chip = (_t: string, color: string): CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 13%, transparent)`, whiteSpace: 'nowrap' });
  const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div style={{ border: '1px solid color-mix(in srgb, #F59E0B 45%, transparent)', background: 'color-mix(in srgb, #F59E0B 8%, var(--df-surface))', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
      <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--df-text-body)' }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: '#F59E0B', color: '#fff', fontSize: 16, flexShrink: 0 }}>⚠</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>{pares.length} pedido{pares.length === 1 ? '' : 's'} posiblemente repetido{pares.length === 1 ? '' : 's'}</b>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--df-text-muted)' }}>El mismo cliente con los mismos productos de un pedido que ya había salido. Revísalos y cancela los que sobran.</span>
        </span>
        <span style={{ fontWeight: 800, color: '#B45309', fontSize: 13, whiteSpace: 'nowrap' }}>{abierto ? 'Ocultar ▴' : 'Revisar ▾'}</span>
      </button>
      {abierto && (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {pares.map((p) => {
            const d = DONDE[p.repetido.donde];
            return (
              <div key={p.repetido.id} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13.5 }}>{p.cliente || 'Cliente'}</b>
                  <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{p.tel}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{p.repetido.items}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  <button onClick={() => verPedido(p.original.id)} style={{ ...btn, textAlign: 'left', fontWeight: 600, display: 'grid', gap: 3, borderColor: 'color-mix(in srgb, #16A34A 40%, transparent)' }}>
                    <span><span style={chip('Original', '#16A34A')}>Original</span> <b>DF-{p.original.numero}</b> · {fecha(p.original.creado)}</span>
                    <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{p.original.estado} · {plata(p.original.total)}{p.original.guia ? ` · guía ${p.original.guia}` : ''}</span>
                  </button>
                  <button onClick={() => verPedido(p.repetido.id)} style={{ ...btn, textAlign: 'left', fontWeight: 600, display: 'grid', gap: 3, borderColor: 'color-mix(in srgb, #DC2626 40%, transparent)' }}>
                    <span><span style={chip('Repetido', '#DC2626')}>Repetido</span> <b>DF-{p.repetido.numero}</b> · {fecha(p.repetido.creado)} {d && <span style={chip(d.txt, d.color)}>{d.txt}</span>}</span>
                    <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{p.repetido.estado} · {plata(p.repetido.total)}{p.repetido.guia ? ` · guía ${p.repetido.guia}` : ''}</span>
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => void noEs(p)} disabled={!!ocupado} style={btn} title="Era una compra de verdad: no vuelve a salir aquí">No es repetido</button>
                  <button onClick={() => void cancelar(p)} disabled={!!ocupado}
                    style={{ ...btn, background: '#DC2626', borderColor: '#DC2626', color: '#fff', opacity: ocupado === p.repetido.id ? 0.6 : 1 }}>
                    {ocupado === p.repetido.id ? 'Cancelando…' : `Cancelar DF-${p.repetido.numero}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
