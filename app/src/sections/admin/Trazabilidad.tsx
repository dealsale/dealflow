import { useEffect, useRef, useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { Dropdown } from '../../components/Dropdown';
import { apiTrazabilidad, apiTrazaPedido } from '../../lib/api';
import type { EventoTraza, PedidoTraza, ResumenTraza } from '../../lib/api';

const ETAPAS: { value: string; label: string; icono: string }[] = [
  { value: '', label: 'Todas las etapas', icono: '' },
  { value: 'pedido', label: 'Pedido creado', icono: '🛒' },
  { value: 'estado', label: 'Cambio de estado', icono: '🔁' },
  { value: 'despacho', label: 'Despacho', icono: '📦' },
  { value: 'guia', label: 'Guía', icono: '🏷️' },
  { value: 'api', label: 'Llamadas a API', icono: '🔌' },
  { value: 'webhook', label: 'Avisos de Effi', icono: '📡' },
  { value: 'aviso', label: 'Aviso al cliente', icono: '💬' },
];
const iconoEtapa = (e: string) => ETAPAS.find((x) => x.value === e)?.icono || '•';
const COLOR: Record<string, string> = { ok: 'var(--df-brand)', info: 'var(--df-text-faint)', warn: 'var(--df-warning, #d97706)', error: 'var(--df-danger, #dc2626)' };

// Las fechas vienen en UTC (SQLite); se muestran en hora de Colombia.
const fecha = (s: string, conDia = true) => {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', ...(conDia ? { day: '2-digit', month: 'short' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

function Punto({ nivel }: { nivel: string }) {
  return <span aria-label={nivel} style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR[nivel] || COLOR.info, flexShrink: 0, display: 'inline-block' }} />;
}

function Datos({ datos }: { datos: unknown }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  if (datos == null || datos === '') return null;
  const txt = typeof datos === 'string' ? datos : JSON.stringify(datos, null, 2);
  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setAbierto((v) => !v)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--df-accent, #2e8bff)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        {abierto ? '▾ Ocultar datos' : '▸ Ver datos (petición / respuesta)'}
      </button>
      {abierto && (
        <div style={{ position: 'relative', marginTop: 6 }}>
          <button
            onClick={() => { void navigator.clipboard?.writeText(txt).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }); }}
            style={{ position: 'absolute', top: 6, right: 6, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 6, padding: '3px 8px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer', color: 'var(--df-text-body)' }}
          >{copiado ? '✓ Copiado' : 'Copiar'}</button>
          <pre style={{ margin: 0, maxHeight: 320, overflow: 'auto', background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--df-text-body)' }}>{txt}</pre>
        </div>
      )}
    </div>
  );
}

/** Línea de tiempo completa de un pedido. */
function PanelPedido({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof apiTrazaPedido>>['data'] | null>(null);
  const [cargando, setCargando] = useState(true);
  const cargar = () => { setCargando(true); void apiTrazaPedido(orderId).then((r) => { setD(r.data || null); setCargando(false); }); };
  useEffect(cargar, [orderId]);
  const p: PedidoTraza | null | undefined = d?.pedido;
  const fila = (k: string, v: React.ReactNode) => v ? <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--df-text-faint)', minWidth: 92 }}>{k}</span><span style={{ fontWeight: 600, minWidth: 0, wordBreak: 'break-word' }}>{v}</span></div> : null;
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 8px 30px -12px rgba(15,23,42,.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--df-border)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{p ? `DF-${p.numero}` : 'Pedido'} {p && <span style={{ fontWeight: 600, color: 'var(--df-text-muted)', fontSize: 13 }}>· {p.tienda}</span>}</div>
          {p && <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Creado {fecha(p.created_at)}</div>}
        </div>
        <button onClick={cargar} title="Actualizar" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--df-text-body)' }}>↻</button>
        <button onClick={onClose} title="Cerrar" aria-label="Cerrar" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--df-text-body)' }}>✕</button>
      </div>
      <div style={{ overflowY: 'auto', padding: 16 }}>
        {cargando && !d && <div style={{ color: 'var(--df-text-faint)', fontSize: 13 }}>Cargando…</div>}
        {p && (
          <div style={{ display: 'grid', gap: 4, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            {fila('Cliente', `${p.cliente} · ${p.tel}`)}
            {fila('Destino', [p.direccion, p.ciudad, p.departamento].filter(Boolean).join(', '))}
            {fila('Estado', `${p.estado}${p.estado_woo ? ` (Effi: ${p.estado_woo})` : ''}`)}
            {fila('Total', `$${Number(p.total || 0).toLocaleString('es-CO')}${p.envio ? ` (envío $${Number(p.envio).toLocaleString('es-CO')})` : ''}`)}
            {fila('Canal', p.origen)}
            {fila('Despacho', p.despacho_proveedor ? `${p.despacho_proveedor}${p.effi_remision ? ` · remisión ${p.effi_remision}` : ''}${p.dropi_order_id ? ` · orden ${p.dropi_order_id}` : ''}` : 'Sin despachar')}
            {fila('Guía', p.guia ? `${p.transportadora ? p.transportadora + ' ' : ''}${p.guia}` : '')}
            {d?.items?.length ? fila('Productos', d.items.map((i) => `${i.qty}× ${i.nombre}`).join(' · ')) : null}
          </div>
        )}
        {d && !d.eventos.length && <div style={{ color: 'var(--df-text-faint)', fontSize: 13 }}>Este pedido aún no tiene eventos registrados (es anterior a la trazabilidad o no se ha movido).</div>}
        <div style={{ position: 'relative' }}>
          {d?.eventos.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', gap: 10, paddingBottom: 14, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 26 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: 'var(--df-surface)', border: `2px solid ${COLOR[e.nivel] || COLOR.info}` }}>{iconoEtapa(e.etapa)}</div>
                {i < d.eventos.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--df-border)', marginTop: 2 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: e.nivel === 'error' ? COLOR.error : 'var(--df-text-strong)', wordBreak: 'break-word' }}>{e.titulo}</div>
                <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{fecha(e.created_at)}</div>
                {e.detalle && <div style={{ fontSize: 12.5, color: 'var(--df-text-body)', marginTop: 3, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.detalle}</div>}
                <Datos datos={e.datos} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ titulo, valor, color }: { titulo: string; valor: number | null; color?: string }) {
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--df-text-strong)', lineHeight: 1.2 }}>{valor ?? 0}</div>
    </div>
  );
}

export function Trazabilidad({ df }: { df: DealFlowState }) {
  const [eventos, setEventos] = useState<EventoTraza[]>([]);
  const [resumen, setResumen] = useState<ResumenTraza | null>(null);
  const [store, setStore] = useState('');
  const [q, setQ] = useState('');
  const [nivel, setNivel] = useState('');
  const [etapa, setEtapa] = useState('');
  const [cargando, setCargando] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [abierto, setAbierto] = useState('');
  const tq = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cargar = (mas = false) => {
    setCargando(true);
    const antes = mas && eventos.length ? eventos[eventos.length - 1].id : undefined;
    void apiTrazabilidad({ store, q, nivel, etapa, antes }).then((r) => {
      setCargando(false);
      if (!r.data) return;
      setEventos((prev) => (mas ? [...prev, ...r.data!.eventos] : r.data!.eventos));
      setResumen(r.data.resumen);
      setHayMas(r.data.eventos.length >= 100);
    });
  };
  // Al cambiar filtros recarga (la búsqueda espera a que termines de escribir).
  useEffect(() => {
    clearTimeout(tq.current);
    tq.current = setTimeout(() => cargar(false), q ? 350 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, q, nivel, etapa]);

  const tiendas = [{ value: '', label: 'Todas las tiendas' }, ...df.accounts.map((a) => ({ value: String(a.id), label: a.tienda }))];

  return (
    <section data-screen-label="Admin Trazabilidad">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Trazabilidad de pedidos 🧭</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 16px' }}>Todo lo que le pasa a cada pedido: creación, estados, envíos a Effi y Dropi con lo que se mandó y lo que respondieron, guías, avisos y mensajes al cliente.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Tile titulo="Pedidos creados (24 h)" valor={resumen?.pedidos ?? 0} />
        <Tile titulo="Despachos exitosos (24 h)" valor={resumen?.despachos ?? 0} color="var(--df-brand)" />
        <Tile titulo="Despachos con error (24 h)" valor={resumen?.fallos ?? 0} color={resumen?.fallos ? COLOR.error : undefined} />
        <Tile titulo="Llamadas a API fallidas (24 h)" valor={resumen?.apiFallos ?? 0} color={resumen?.apiFallos ? COLOR.warn : undefined} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 DF-1234, cliente, teléfono, guía o remisión…"
          style={{ flex: '1 1 240px', minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 999, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)' }}
        />
        <Dropdown variant="pill" label="Tienda" value={store} onChange={setStore} options={tiendas} />
        <Dropdown variant="pill" label="Nivel" value={nivel} onChange={setNivel} options={[{ value: '', label: 'Todo' }, { value: 'problemas', label: 'Solo problemas' }, { value: 'error', label: 'Solo errores' }, { value: 'ok', label: 'Solo éxitos' }]} />
        <Dropdown variant="pill" label="Etapa" value={etapa} onChange={setEtapa} options={ETAPAS.map((e) => ({ value: e.value, label: `${e.icono ? e.icono + ' ' : ''}${e.label}` }))} />
        <button onClick={() => cargar(false)} title="Actualizar" style={{ height: 34, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '0 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)' }}>{cargando ? '…' : '↻ Actualizar'}</button>
      </div>

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: abierto ? 'minmax(0, 1fr) minmax(320px, 440px)' : 'minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
          {!eventos.length && !cargando && (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--df-text-faint)', fontSize: 13.5 }}>No hay eventos con estos filtros. Los pedidos nuevos y cada despacho empiezan a registrarse desde ahora.</div>
          )}
          {eventos.map((e) => {
            const sel = abierto === e.order_id;
            return (
              <div
                key={e.id}
                onClick={() => setAbierto(sel ? '' : e.order_id)}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer', background: sel ? 'var(--df-brand-subtle-2)' : 'transparent' }}
              >
                <div style={{ paddingTop: 6 }}><Punto nivel={e.nivel} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 12.5 }}>{e.numero ? `DF-${e.numero}` : '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{e.tienda}</span>
                    {e.cliente && <span style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>· {e.cliente}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--df-text-faint)', whiteSpace: 'nowrap' }}>{fecha(e.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: e.nivel === 'error' ? COLOR.error : 'var(--df-text-strong)', marginTop: 2, wordBreak: 'break-word' }}>
                    <span style={{ marginRight: 6 }}>{iconoEtapa(e.etapa)}</span>{e.titulo}
                  </div>
                  {e.detalle && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.detalle}</div>}
                </div>
              </div>
            );
          })}
          {hayMas && (
            <button onClick={() => cargar(true)} disabled={cargando} style={{ width: '100%', background: 'var(--df-surface-2)', border: 'none', padding: 12, fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--df-text-body)' }}>
              {cargando ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </div>
        {abierto && (
          <div style={{ position: 'sticky', top: 12, minWidth: 0 }}>
            <PanelPedido orderId={abierto} onClose={() => setAbierto('')} />
          </div>
        )}
      </div>
    </section>
  );
}
