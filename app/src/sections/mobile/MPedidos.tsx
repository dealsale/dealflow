import { OrigenBadge } from '../../components/OrigenPedido';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { Dropdown } from '../../components/Dropdown';
import { textoGuia } from '../Pedidos';
import { useState } from 'react';
import { useFiltrosPedidos, PanelFiltros, ResumenFiltros, ORDENES, fechaCorta, type Orden } from '../../components/PedidosFiltros';
import { ESTADOS_TODOS } from '../../lib/style';

export function MPedidos({ df }: { df: DealFlowState }) {
  const fp = useFiltrosPedidos(df.allOrders, df.orderQuery);
  const [abierto, setAbierto] = useState(false);
  const n = fp.activos.length;
  return (
    <section data-screen-label="Móvil Pedidos">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, flex: 1 }}>Pedidos</h1>
        <button
          onClick={() => df.abrirCrearPedido()}
          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 40, whiteSpace: 'nowrap' }}
        >
          ＋ Crear
        </button>
      </div>
      <input
        className="df-input"
        value={df.orderQuery}
        onChange={(e) => df.setOrderQuery(e.target.value)}
        placeholder="Cliente, teléfono, número o guía…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 999, padding: '11px 16px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)', minHeight: 44, marginBottom: 10 }}
      />
      {/* Estados rápidos (varios a la vez) + botón de filtros completos. */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}>
        <button
          onClick={() => setAbierto((x) => !x)}
          aria-expanded={abierto}
          style={{ padding: '9px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit', background: n ? 'var(--df-brand-subtle)' : 'var(--df-surface)', color: n ? 'var(--df-brand-dark)' : 'var(--df-text-body)', border: '1px solid ' + (n ? 'var(--df-brand)' : 'var(--df-border)') }}
        >
          ☰ Filtros{n ? ` (${n})` : ''}
        </button>
        {ESTADOS_TODOS.map((e) => {
          const active = fp.f.estados.includes(e);
          return (
            <button
              key={e}
              onClick={() => fp.alternar('estados', e)}
              style={{ padding: '9px 15px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit', background: active ? '#0F172A' : 'var(--df-surface)', color: active ? '#fff' : 'var(--df-text-muted)', border: '1px solid ' + (active ? '#0F172A' : 'var(--df-border)') }}
            >
              {e} {fp.conteoEstados[e] || 0}
            </button>
          );
        })}
      </div>
      {abierto && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Ordenar</span>
            <Dropdown ariaLabel="Ordenar pedidos" value={fp.f.orden} onChange={(v) => fp.set({ orden: v as Orden })} options={ORDENES.map((o) => ({ value: o.id, label: o.label }))} width={170} />
          </div>
          <PanelFiltros fp={fp} />
        </>
      )}
      <ResumenFiltros fp={fp} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fp.filtrados.map((o) => (
          <div
            key={o.id}
            onClick={o.open}
            style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-muted)' }}>{o.id}</span>
              <span style={o.pillStyle}>{o.estado}</span>
              <div style={{ flex: 1 }} />
              <span style={{ color: 'var(--df-text-faint)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{fechaCorta(o.fecha)}{o.hora ? ' · ' + o.hora : ''}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
              <OrigenBadge origen={o.origen} size={19} />
              <span>{o.cliente}</span> <span style={{ color: 'var(--df-text-faint)', fontWeight: 400, fontSize: 12.5 }}>· {o.ciudad}</span>
            </div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 13, margin: '3px 0 10px' }}>{o.itemsResumen}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{o.totalFmt}</span>
              <div style={{ flex: 1 }} />
              {/* Estado de la guía (solo lectura): se cambia a mano dentro del pedido. */}
              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: o.hasGuia ? 'var(--df-text-body)' : 'var(--df-text-faint)' }}>{o.hasGuia ? `${o.transportadora || 'Guía'} · ${o.guia}` : o.despachado ? 'esperando guía' : 'Sin despachar'}</div>
                {textoGuia(o) && <div style={{ fontSize: 11, color: 'var(--df-text-muted)', marginTop: 2 }}>{textoGuia(o)}</div>}
              </div>
            </div>
          </div>
        ))}
        {fp.filtrados.length === 0 && (
          <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, padding: 28, textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
            {df.orderQuery.trim()
              ? `No encontramos pedidos para «${df.orderQuery.trim()}». Revisa el nombre o el número.`
              : n ? 'Ningún pedido coincide con los filtros.' : 'Todavía no hay pedidos.'}
          </div>
        )}
      </div>
    </section>
  );
}
