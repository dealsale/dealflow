import { useEffect, useState } from 'react';
import { apiHistorialCliente, type HistorialCliente } from '../lib/api';
import { confirmar } from './dialogs';

/** Historial del cliente del pedido (se pide una vez por pedido y celular). */
export function useHistorialCliente(rowId?: string, tel?: string): HistorialCliente | null {
  const [h, setH] = useState<HistorialCliente | null>(null);
  useEffect(() => {
    setH(null);
    if (!rowId || String(tel || '').replace(/\D/g, '').length < 10) return;
    let vivo = true;
    void apiHistorialCliente(rowId).then((r) => { if (vivo && r.data) setH(r.data); });
    return () => { vivo = false; };
  }, [rowId, tel]);
  return h;
}

/** Devoluciones que el cliente ya tuvo CON ESTA tienda (sus pedidos o su Effi). */
export const devolucionesPropias = (h: HistorialCliente | null) => (h ? Math.max(h.propia?.devueltos || 0, h.effi?.devoluciones || 0) : 0);

/** Antes de crear la remisión/orden: si ya devolvió con esta tienda, se pide confirmar. */
export async function confirmarSiDevolvio(h: HistorialCliente | null): Promise<boolean> {
  const n = devolucionesPropias(h);
  if (!n) return true;
  return confirmar({
    titulo: `Este cliente ya tuvo ${n} ${n === 1 ? 'devolución' : 'devoluciones'} con ${h!.propia?.tienda || 'tu tienda'}`,
    mensaje: 'Muchas tiendas no le vuelven a despachar contra entrega a un cliente que ya devolvió, a menos que el pago sea anticipado. ¿Despachar de todas formas?',
    aceptar: 'Sí, despachar', peligro: true,
  });
}

/** Aviso arriba del despacho cuando el cliente ya devolvió con esta tienda. */
export function AvisoDevolucionPropia({ h }: { h: HistorialCliente | null }) {
  const n = devolucionesPropias(h);
  if (!n) return null;
  return (
    <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-danger-subtle, #FEF2F2)', border: '1px solid var(--df-danger-border, #FECACA)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--df-text-body)' }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>⛔</span>
      <span><b style={{ color: 'var(--df-danger-dark, #B91C1C)' }}>Este cliente ya tuvo {n} {n === 1 ? 'devolución' : 'devoluciones'} con {h!.propia?.tienda || 'tu tienda'}.</b> Despáchalo solo si el pago es anticipado o si ya lo confirmaste por llamada.</span>
    </div>
  );
}

const RIESGO: Record<HistorialCliente['riesgo'], { icono: string; titulo: string; color: string; fondo: string; borde: string }> = {
  nuevo: { icono: '🆕', titulo: 'Cliente nuevo', color: 'var(--df-text-body)', fondo: 'var(--df-bg)', borde: 'var(--df-border)' },
  bajo: { icono: '✅', titulo: 'Buen historial', color: 'var(--df-brand-dark)', fondo: 'var(--df-brand-subtle-2)', borde: 'var(--df-brand-border)' },
  medio: { icono: '⚠️', titulo: 'Ha devuelto pedidos', color: '#B45309', fondo: 'var(--df-warning-subtle-2, #FFFBEB)', borde: 'var(--df-warning-border, #FDE68A)' },
  alto: { icono: '⛔', titulo: 'Riesgo alto de devolución', color: 'var(--df-danger-dark, #B91C1C)', fondo: 'var(--df-danger-subtle, #FEF2F2)', borde: 'var(--df-danger-border, #FECACA)' },
};

/**
 * Historial de entregas del cliente por su celular: red DealFlow (solo conteos de todas las
 * tiendas, sin datos de ninguna) y, si la tienda tiene Effi, sus guías en Effi.
 */
export function HistorialClienteCard({ rowId, tel }: { rowId?: string; tel: string }) {
  const h = useHistorialCliente(rowId, tel);
  if (!h) return null;
  const c = RIESGO[h.riesgo];
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
  return (
    <div style={{ background: c.fondo, border: `1px solid ${c.borde}`, borderRadius: 10, padding: '10px 12px', marginBottom: 18, fontSize: 12.5, display: 'grid', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15 }}>{c.icono}</span>
        <b style={{ color: c.color, fontSize: 13 }}>{c.titulo}</b>
        <span style={{ color: 'var(--df-text-body)' }}>{h.resumen}</span>
      </div>
      {h.propia.devueltos > 0 && <div style={{ color: 'var(--df-danger-dark, #B91C1C)', fontWeight: 700 }}>⛔ {h.propia.devueltos} {h.propia.devueltos === 1 ? 'devolución' : 'devoluciones'} con {h.propia.tienda}</div>}
      {h.red.pedidos > 0 && (
        <div style={{ color: 'var(--df-text-muted)' }}>
          🛡️ <b>Red DealFlow</b>: {n(h.red.pedidos, 'pedido anterior', 'pedidos anteriores')} · {n(h.red.entregados, 'entregado', 'entregados')} · {n(h.red.devueltos, 'devuelto', 'devueltos')}{h.red.cancelados ? ` · ${n(h.red.cancelados, 'cancelado', 'cancelados')}` : ''}{h.red.enCurso ? ` · ${h.red.enCurso} en curso` : ''}
        </div>
      )}
      {h.effi && h.effi.guias > 0 && (
        <div style={{ color: 'var(--df-text-muted)' }}>
          📦 <b>Tu Effi</b>: {n(h.effi.guias, 'guía', 'guías')} · {n(h.effi.entregadas, 'entregada', 'entregadas')} · {n(h.effi.devoluciones, 'devolución', 'devoluciones')}{h.effi.conNovedad ? ` · ${h.effi.conNovedad} con novedad` : ''}
        </div>
      )}
      {(h.riesgo === 'medio' || h.riesgo === 'alto') && <div style={{ color: c.color, fontWeight: 600 }}>Antes de despachar, confírmalo por llamada o pide un anticipo del envío.</div>}
      <div style={{ color: 'var(--df-text-faint)', fontSize: 11 }}>Por el celular {h.celular}. De otras tiendas solo se ven conteos, nunca sus datos.</div>
    </div>
  );
}
