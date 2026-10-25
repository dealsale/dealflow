import { useEffect, useMemo, useState } from 'react';
import { useRecordado } from '../lib/rutas';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from '../components/Dropdown';
import { OrigenBadge } from '../components/OrigenPedido';
import { apiLeadsEstados, apiSetLeadEstado } from '../lib/api';
import type { EstadoLead, LeadEstado } from '../lib/api';

/**
 * Leads = embudo de ventas. Cada chat cae solo en un estado según la
 * conversación y sus pedidos (preguntando → con intención → faltan datos →
 * datos completos → venta). El dueño puede moverlo a mano y, con un clic, ir
 * directo a ese chat en el Inbox. No es otro chat: es el resumen de todos.
 */
export const ESTADOS: { id: EstadoLead; titulo: string; icono: string; color: string; ayuda: string }[] = [
  { id: 'preguntando', titulo: 'Preguntando', icono: '💬', color: '#64748B', ayuda: 'Escribió, pero aún no muestra intención de compra.' },
  { id: 'interesado', titulo: 'Con intención de compra', icono: '🔥', color: '#F59E0B', ayuda: 'Preguntó precio, talla, envío o dijo que lo quiere.' },
  { id: 'faltan_datos', titulo: 'Faltan datos', icono: '📝', color: '#8B5CF6', ayuda: 'Ya está dando sus datos de envío, pero faltan algunos.' },
  { id: 'datos_completos', titulo: 'Datos completos', icono: '✅', color: '#0EA5E9', ayuda: 'Ya tiene el resumen del pedido: falta que confirme.' },
  { id: 'venta', titulo: 'Ventas', icono: '🛒', color: '#10B981', ayuda: 'Ya tiene un pedido creado.' },
  { id: 'perdido', titulo: 'No compró', icono: '🚫', color: '#EF4444', ayuda: 'Lo marcaste como perdido (no cuenta en el embudo).' },
];
const est = (id: string) => ESTADOS.find((e) => e.id === id) || ESTADOS[0];
type Rango = 'todo' | 'hoy' | '7' | '30';
const POR_COLUMNA = 40;

function Tarjeta({ l, onAbrir, onMover }: { l: LeadEstado; onAbrir: () => void; onMover: (e: EstadoLead | '') => void }) {
  const e = est(l.estado);
  return (
    <div
      onClick={onAbrir}
      className="df-lead-card"
      style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderLeft: `3px solid ${e.color}`, borderRadius: 10, padding: '10px 11px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <OrigenBadge origen={l.canal} size={16} />
        <b style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nombre || l.tel || 'Sin nombre'}</b>
        <span style={{ fontSize: 11, color: 'var(--df-text-faint)', whiteSpace: 'nowrap' }}>{l.hora}</span>
      </div>
      {l.ultimo && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} translate="no">{l.ultimo}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} onClick={(ev) => ev.stopPropagation()}>
        {l.pedido && <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: 'rgba(16,185,129,.12)', borderRadius: 6, padding: '2px 7px' }}>DF-{l.pedido.numero} · ${l.pedido.total.toLocaleString('es-CO')}</span>}
        {l.manual && <span title="Lo moviste tú a este estado" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--df-text-muted)', background: 'var(--df-surface-2)', borderRadius: 6, padding: '2px 6px' }}>✋ manual</span>}
        <span style={{ flex: 1 }} />
        {l.estado !== 'venta' && (
          <Dropdown
            variant="pill"
            ariaLabel="Mover a otro estado"
            value=""
            onChange={(v) => onMover(v === '__auto' ? '' : (v as EstadoLead))}
            active={false}
            options={[
              { value: '', label: '⇄ Mover' },
              ...(l.manual ? [{ value: '__auto', label: `↺ Automático (${est(l.auto).titulo})` }] : []),
              ...ESTADOS.filter((x) => x.id !== 'venta' && x.id !== l.estado).map((x) => ({ value: x.id, label: `${x.icono} ${x.titulo}` })),
            ]}
          />
        )}
      </div>
    </div>
  );
}

export function Leads({ df }: { df: DealFlowState }) {
  const [leads, setLeads] = useState<LeadEstado[] | null>(null);
  const [q, setQ] = useState('');
  const [rango, setRango] = useRecordado<Rango>('leads:rango', 'todo');
  const [verPerdidos, setVerPerdidos] = useState(false);
  const [limite, setLimite] = useState<Record<string, number>>({});

  const cargar = () => { void apiLeadsEstados().then((r) => { if (r.data) setLeads(r.data.leads); }); };
  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (!document.hidden) cargar(); }, 30_000);
    return () => clearInterval(t);
  }, []);

  const mover = (l: LeadEstado, e: EstadoLead | '') => {
    setLeads((st) => (st || []).map((x) => (x.id === l.id ? { ...x, estado: e || x.auto, manual: !!e && e !== x.auto } : x)));
    void apiSetLeadEstado(l.id, e).then((r) => { if (r.error) cargar(); });
  };

  const filtrados = useMemo(() => {
    const desde = rango === 'todo' ? 0 : rango === 'hoy' ? new Date(new Date().toDateString()).getTime() : Date.now() - Number(rango) * 86400000;
    const nq = q.trim().toLowerCase();
    return (leads || []).filter((l) => {
      if (desde && new Date(String(l.ultimoIso).replace(' ', 'T') + 'Z').getTime() < desde) return false;
      return !nq || `${l.nombre} ${l.tel} ${l.ultimo}`.toLowerCase().includes(nq);
    });
  }, [leads, q, rango]);
  const porEstado = (id: EstadoLead) => filtrados.filter((l) => l.estado === id);
  const columnas = ESTADOS.filter((e) => e.id !== 'perdido' || verPerdidos);
  const embudo = filtrados.filter((l) => l.estado !== 'perdido').length;
  const ventas = porEstado('venta').length;

  return (
    <section data-screen-label="Leads">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Leads</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: 0 }}>En qué va cada cliente. Toca una tarjeta para ir directo a su chat.</p>
        </div>
        {embudo > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
            Conversión: <b style={{ color: 'var(--df-text-strong)', fontSize: 15 }}>{Math.round((ventas / embudo) * 100)}%</b> ({ventas} de {embudo})
          </div>
        )}
      </div>

      {/* Resumen por estado: también filtra (lleva a la columna). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        {ESTADOS.filter((e) => e.id !== 'perdido').map((e) => (
          <a key={e.id} href={`#col-${e.id}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(`col-${e.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); }}
            style={{ textDecoration: 'none', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderTop: `3px solid ${e.color}`, borderRadius: 10, padding: '9px 11px', color: 'inherit' }} title={e.ayuda}>
            <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.icono} {e.titulo}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{leads ? porEstado(e.id).length : '…'}</div>
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar por nombre, teléfono o mensaje…"
          style={{ flex: '1 1 240px', minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 999, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)' }} />
        <Dropdown variant="pill" label="Actividad" value={rango} onChange={(v) => setRango(v as Rango)}
          options={[{ value: 'todo', label: 'Todo' }, { value: 'hoy', label: 'Hoy' }, { value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }]} />
        <button onClick={() => setVerPerdidos((v) => !v)} style={{ height: 34, background: verPerdidos ? 'var(--df-surface-2)' : 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '0 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)' }}>
          🚫 {verPerdidos ? 'Ocultar' : 'Ver'} "No compró" ({porEstado('perdido').length})
        </button>
      </div>

      {!leads && <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: 20 }}>Cargando leads…</div>}
      {leads && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start', scrollSnapType: 'x proximity' }}>
          {columnas.map((e) => {
            const lista = porEstado(e.id);
            const max = limite[e.id] || POR_COLUMNA;
            return (
              <div key={e.id} id={`col-${e.id}`} style={{ flex: '1 0 215px', maxWidth: 340, minWidth: 215, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 300px)', minHeight: 200, scrollSnapAlign: 'start' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--df-border)', display: 'flex', alignItems: 'center', gap: 7 }} title={e.ayuda}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.color }} />
                  <b style={{ fontSize: 13, flex: 1 }}>{e.icono} {e.titulo}</b>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '1px 8px' }}>{lista.length}</span>
                </div>
                <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {!lista.length && <div style={{ fontSize: 12, color: 'var(--df-text-faint)', textAlign: 'center', padding: '14px 6px' }}>{e.ayuda}</div>}
                  {lista.slice(0, max).map((l) => (
                    <Tarjeta key={l.id} l={l} onAbrir={() => df.abrirChat(l.id)} onMover={(nuevo) => mover(l, nuevo)} />
                  ))}
                  {lista.length > max && (
                    <button onClick={() => setLimite((m) => ({ ...m, [e.id]: max + POR_COLUMNA }))} style={{ background: 'var(--df-surface)', border: '1px dashed var(--df-border)', borderRadius: 9, padding: 8, fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer', color: 'var(--df-text-body)' }}>
                      Ver {Math.min(POR_COLUMNA, lista.length - max)} más ({lista.length - max} restantes)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
