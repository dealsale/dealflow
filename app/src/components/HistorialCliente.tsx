import { useEffect, useState } from 'react';
import { apiHistorialCliente, type HistorialCliente } from '../lib/api';

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
  const [h, setH] = useState<HistorialCliente | null>(null);
  useEffect(() => {
    setH(null);
    if (!rowId || String(tel || '').replace(/\D/g, '').length < 10) return;
    let vivo = true;
    void apiHistorialCliente(rowId).then((r) => { if (vivo && r.data) setH(r.data); });
    return () => { vivo = false; };
  }, [rowId, tel]);
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
