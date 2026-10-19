import { OrigenBadge } from '../OrigenPedido';
import { useEffect } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { Dropdown } from '../Dropdown';
import { confirmar } from '../dialogs';
import { DespachoPedido } from '../OrderDetailPanel';

export function MobileOrderSheet({ df }: { df: DealFlowState }) {
  useEffect(() => { void df.cargarEffiApi?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!df.hasSelectedOrder || !df.sel) return null;
  const sel = df.sel;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={df.closeOrder} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)' }} />
      <div
        style={{
          position: 'relative',
          background: 'var(--df-surface)',
          borderRadius: '18px 18px 0 0',
          maxHeight: '86%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -12px 40px rgba(15,23,42,.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--df-border)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 18px 12px', borderBottom: '1px solid var(--df-border)' }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600 }}>{sel.id}</span>
          <span style={sel.pillStyle}>{sel.estado}</span>
          <div style={{ flex: 1 }} />
          <span onClick={df.closeOrder} style={{ color: 'var(--df-text-muted)', cursor: 'pointer', fontSize: 18, padding: 6 }}>
            ✕
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          <div style={{ background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 13, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{sel.cliente}</div>
              <OrigenBadge origen={sel.origen} texto />
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 6px' }}>{sel.tel}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{sel.direccion}</div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13 }}>{sel.ciudad}</div>
          </div>
          <div style={{ border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
            {sel.itemsDecorated.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderBottom: '1px solid var(--df-border)' }}>
                <span style={{ background: 'var(--df-surface-2)', borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 7px', color: 'var(--df-text-secondary)' }}>{it.qty}×</span>
                <span style={{ fontSize: 13, flex: 1 }}>{it.nombre}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{it.precioFmt}</span>
              </div>
            ))}
            <div style={{ display: 'flex', padding: '11px 13px', fontWeight: 800, fontSize: 15, background: 'var(--df-bg)' }}>
              <span>Total</span>
              <div style={{ flex: 1 }} />
              <span>{sel.totalFmt}</span>
            </div>
          </div>

          {/* Despacho: mismo bloque que en escritorio (Effi por API / Dropi). */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--df-text-muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>Despacho</div>
            <DespachoPedido df={df} sel={sel} />
          </div>
        </div>

        {/* Estado: se actualiza solo desde Dropi/Effi, pero también se puede cambiar
            a mano o eliminar el pedido. */}
        <div style={{ padding: '14px 18px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)', borderTop: '1px solid var(--df-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 7 }}>Estado del pedido</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Dropdown ariaLabel="Cambiar estado del pedido" value={sel.estado} onChange={(v) => sel.setEstado(v as typeof sel.estado)} options={sel.estadosDisponibles.map((e) => ({ value: e, label: e }))} />
            </div>
            <button
              onClick={() => df.abrirEditarPedido(sel)}
              title="Editar pedido"
              style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '11px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-text-strong)', cursor: 'pointer', minHeight: 44 }}
            >✏️</button>
            <button
              onClick={async () => { if (await confirmar({ titulo: `Eliminar ${sel.id}`, mensaje: 'Solo lo quita del panel; no cancela nada en Dropi/Effi.', aceptar: 'Eliminar', peligro: true })) sel.eliminar(); }}
              style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '11px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: 'var(--df-danger-dark)', cursor: 'pointer', minHeight: 44 }}
            >🗑</button>
          </div>
        </div>
      </div>
    </div>
  );
}
