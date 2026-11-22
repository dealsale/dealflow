import { useState } from 'react';
import { apiQuitarVinculos, apiReanudarVinculos, type IntegVinculo } from '../lib/api';
import { confirmar, notificar } from './dialogs';

const NOMBRE: Record<IntegVinculo, string> = { effi: 'Effi', dropi: 'Dropi', skydropx: 'Skydropx' };
const btn: React.CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', borderRadius: 7, padding: '5px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' };

/**
 * Encabezado de la vinculación de variantes de un producto (Effi, Dropi o Skydropx):
 * dice si se vinculan solas o si están en pausa, y trae «Quitar todo» para desconectar
 * todas las variantes del producto de una vez.
 */
export function VinculosBarra({ productId, integ, pausado, vinculadas, total, onCambio }: {
  productId: string; integ: IntegVinculo; pausado: boolean; vinculadas: number; total: number; onCambio: () => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const n = NOMBRE[integ];
  const quitar = async () => {
    const ok = await confirmar({
      titulo: `¿Quitar todas las conexiones con ${n}?`,
      mensaje: `Las ${vinculadas} variante${vinculadas === 1 ? '' : 's'} de este producto quedan sin conexión con ${n} y DealFlow deja de vincularlas solo, hasta que toques «Vincular solas de nuevo». Mientras tanto, sus pedidos no salen por ${n}.`,
      aceptar: 'Quitar todo', peligro: true,
    });
    if (!ok) return;
    setTrabajando(true);
    const r = await apiQuitarVinculos(productId, integ);
    setTrabajando(false);
    if (r.error) { notificar(r.error, 'error'); return; }
    notificar(`✓ Se quitaron las conexiones con ${n}.`);
    onCambio();
  };
  const reanudar = async () => {
    setTrabajando(true);
    const r = await apiReanudarVinculos(productId, integ);
    setTrabajando(false);
    if (r.error) { notificar(r.error, 'error'); return; }
    onCambio();
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: total && vinculadas === total ? 'var(--df-brand-dark)' : 'var(--df-warning)' }}>{vinculadas}/{total} variantes conectadas</span>
      {pausado
        ? <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)' }}>⏸ Vinculación automática en pausa</span>
        : <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--df-text-faint)' }}>⚡ Se vinculan solas, también las variantes nuevas</span>}
      <span style={{ flex: 1 }} />
      {pausado && <button onClick={() => void reanudar()} disabled={trabajando} style={{ ...btn, color: 'var(--df-brand-dark)', borderColor: 'var(--df-brand)' }}>⚡ Vincular solas de nuevo</button>}
      {vinculadas > 0 && <button onClick={() => void quitar()} disabled={trabajando} style={{ ...btn, color: 'var(--df-danger)' }}>{trabajando ? 'Quitando…' : 'Quitar todo'}</button>}
    </div>
  );
}
