import { useEffect, useMemo, useState } from 'react';
import { useRecordado } from '../lib/rutas';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from '../components/Dropdown';
import { OrigenBadge } from '../components/OrigenPedido';
import { IcoBuscar } from '../components/iconosNoche';
import { iniciales, pesos } from '../lib/noche';
import { apiLeadsEstados, apiSetLeadEstado } from '../lib/api';
import type { EstadoLead, LeadEstado } from '../lib/api';

/**
 * Leads = embudo de ventas. Cada chat cae solo en un estado según la
 * conversación y sus pedidos (preguntando → con intención → faltan datos →
 * datos completos → venta). El dueño puede moverlo a mano y, con un clic, ir
 * directo a ese chat en el Inbox. No es otro chat: es el resumen de todos.
 */
export const ESTADOS: { id: EstadoLead; titulo: string; icono: string; color: string; ayuda: string }[] = [
  { id: 'preguntando', titulo: 'Preguntando', icono: '💬', color: '#9AA8C9', ayuda: 'Escribió, pero aún no muestra intención de compra.' },
  { id: 'interesado', titulo: 'Con intención', icono: '🔥', color: '#FFC65C', ayuda: 'Preguntó precio, talla, envío o dijo que lo quiere.' },
  { id: 'faltan_datos', titulo: 'Faltan datos', icono: '📝', color: '#B75DFF', ayuda: 'Ya está dando sus datos de envío, pero faltan algunos.' },
  { id: 'datos_completos', titulo: 'Datos completos', icono: '✅', color: '#46D8FF', ayuda: 'Ya tiene el resumen del pedido: falta que confirme.' },
  { id: 'venta', titulo: 'Ventas', icono: '🛒', color: '#34D399', ayuda: 'Ya tiene un pedido creado.' },
  { id: 'perdido', titulo: 'No compró', icono: '🚫', color: '#FF6B8A', ayuda: 'Lo marcaste como perdido (no cuenta en el embudo).' },
];
const est = (id: string) => ESTADOS.find((e) => e.id === id) || ESTADOS[0];
const siguiente = (id: EstadoLead): EstadoLead | null => {
  const orden: EstadoLead[] = ['preguntando', 'interesado', 'faltan_datos', 'datos_completos'];
  const i = orden.indexOf(id);
  return i >= 0 && i < orden.length - 1 ? orden[i + 1] : null;
};
type Rango = 'todo' | 'hoy' | '7' | '30';
const POR_COLUMNA = 40;

function Tarjeta({ l, onAbrir, onMover }: { l: LeadEstado; onAbrir: () => void; onMover: (e: EstadoLead | '') => void }) {
  const sig = l.estado === 'venta' || l.estado === 'perdido' ? null : siguiente(l.estado);
  return (
    <article className="lead">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="avatar ne" style={{ width: 28, height: 28, fontSize: 11, flex: '0 0 28px' }}>{iniciales(l.nombre || l.tel)}</span>
        <a href="#" onClick={(ev) => { ev.preventDefault(); onAbrir(); }} title="Abrir el chat" style={{ fontWeight: 700, fontSize: 13, textDecoration: 'none', color: 'var(--tinta)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{l.nombre || l.tel || 'Sin nombre'}</a>
        <span className="mono tenue" style={{ marginLeft: 'auto', fontSize: 10.5, whiteSpace: 'nowrap' }}>{l.hora}</span>
      </div>
      {l.ultimo && <p className="suave-t" style={{ fontSize: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} translate="no">“{l.ultimo}”</p>}
      <div className="fila" style={{ gap: 6, fontSize: 11 }}>
        <OrigenBadge origen={l.canal} size={16} />
        {l.pedido && <span className="pill ok sin chica" style={{ padding: '1px 7px', fontSize: 10.5 }}>DF-{l.pedido.numero} · {pesos(l.pedido.total)}</span>}
        {l.manual && <span className="tenue" title="Lo moviste tú a este estado">✋ manual</span>}
        {l.estado !== 'venta' && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <Dropdown
              variant="pill" ariaLabel="Mover a otro estado" value="" active={false}
              onChange={(v) => onMover(v === '__auto' ? '' : (v as EstadoLead))}
              options={[
                { value: '', label: '⇄' },
                ...(l.manual ? [{ value: '__auto', label: `↺ Automático (${est(l.auto).titulo})` }] : []),
                ...ESTADOS.filter((x) => x.id !== 'venta' && x.id !== l.estado).map((x) => ({ value: x.id, label: `${x.icono} ${x.titulo}` })),
              ]}
            />
            {sig && <button type="button" className="mover" onClick={() => onMover(sig)} aria-label={`Mover a ${est(sig).titulo}`} title={`Mover a ${est(sig).titulo}`}>→</button>}
          </span>
        )}
      </div>
    </article>
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
  const tasa = embudo > 0 ? Math.round((ventas / embudo) * 100) : 0;
  const frios = filtrados.filter((l) => l.estado !== 'venta' && l.estado !== 'perdido' && Date.now() - new Date(String(l.ultimoIso).replace(' ', 'T') + 'Z').getTime() > 2 * 3600e3).length;
  const RANGOS: { id: Rango; t: string }[] = [{ id: 'todo', t: 'Todo' }, { id: 'hoy', t: 'Hoy' }, { id: '7', t: '7 días' }, { id: '30', t: '30 días' }];

  return (
    <section data-screen-label="Leads" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Embudo · {RANGOS.find((r) => r.id === rango)?.t.toLowerCase()}</span>
          <h1>Leads</h1>
          <p className="sub">En qué va cada cliente. El asistente los mueve solo según la conversación; tú puedes moverlos con la flecha. Toca el nombre para ir a su chat.</p>
        </div>
        <div className="fila">
          <div className="buscar" style={{ flex: '1 1 240px', maxWidth: 340 }}>
            <IcoBuscar />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o mensaje…" aria-label="Buscar lead" />
          </div>
          {RANGOS.map((r) => <button key={r.id} type="button" className={`chip${rango === r.id ? ' activa' : ''}`} onClick={() => setRango(r.id)}>{r.t}</button>)}
          <button type="button" className={`chip${verPerdidos ? ' activa' : ''}`} onClick={() => setVerPerdidos((v) => !v)}>🚫 No compró <span className="n">{porEstado('perdido').length}</span></button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="eti">Leads en el embudo</span><span className="valor">{leads ? embudo : '…'}</span><span className="delta">{porEstado('preguntando').length} preguntando · {porEstado('interesado').length} con intención</span></div>
        <div className="kpi"><span className="eti">Llegaron a comprar</span><span className="valor">{leads ? ventas : '…'}</span><span className="delta"><b>{tasa} %</b> de conversión</span></div>
        <div className="kpi"><span className="eti">Por cerrar</span><span className="valor">{leads ? porEstado('faltan_datos').length + porEstado('datos_completos').length : '…'}</span><span className="delta">{porEstado('datos_completos').length} con el resumen listo, falta que confirmen</span></div>
        <div className="kpi"><span className="eti">Sin respuesta hace +2 h</span><span className="valor">{leads ? frios : '…'}</span><span className="delta">{df.seguimientoActivo ? 'el asistente les vuelve a escribir solo' : 'enciende el seguimiento en Asistente'}</span></div>
      </div>

      {!leads && <div className="vacio">Cargando leads…</div>}
      {leads && (
        <div className="kanban" style={columnas.length !== 5 ? { gridTemplateColumns: `repeat(${columnas.length}, minmax(0, 1fr))` } : undefined}>
          {columnas.map((e) => {
            const lista = porEstado(e.id);
            const max = limite[e.id] || POR_COLUMNA;
            return (
              <section key={e.id} id={`col-${e.id}`} className="col" aria-label={e.titulo} title={e.ayuda}>
                <div className="col-cab"><i style={{ background: e.color }} />{e.titulo}<span className="mono tenue" style={{ marginLeft: 'auto', fontSize: 11 }}>{lista.length}</span></div>
                <div className="col-cuerpo">
                  {!lista.length && <div className="tenue" style={{ fontSize: 12, textAlign: 'center', padding: '14px 6px' }}>{e.ayuda}</div>}
                  {lista.slice(0, max).map((l) => (
                    <Tarjeta key={l.id} l={l} onAbrir={() => df.abrirChat(l.id)} onMover={(nuevo) => mover(l, nuevo)} />
                  ))}
                  {lista.length > max && (
                    <button type="button" className="btn btn-sec btn-chico" onClick={() => setLimite((m) => ({ ...m, [e.id]: max + POR_COLUMNA }))}>
                      Ver {Math.min(POR_COLUMNA, lista.length - max)} más ({lista.length - max} restantes)
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
