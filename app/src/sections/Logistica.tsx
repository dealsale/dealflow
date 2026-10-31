import { useEffect, useMemo, useState } from 'react';
import { useRecordado } from '../lib/rutas';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from '../components/Dropdown';
import { NovedadesBandeja, NovedadCard } from '../components/Novedades';
import { IcoBuscar } from '../components/iconosNoche';
import { pesos } from '../lib/noche';
import { apiLogistica, apiLogisticaActualizar, type GuiaLogistica, type TableroLogistica } from '../lib/api';

/**
 * Logística Effi (diseño "Noche"): KPIs, chips por etapa, tabla de guías con su
 * estado real y, a la derecha, el detalle de la guía elegida y su novedad.
 */
type Etapa = GuiaLogistica['etapa'];
const ETAPAS: { id: Etapa; titulo: string; clase: string; ayuda: string }[] = [
  { id: 'sin_guia', titulo: 'Sin guía', clase: 'neutro', ayuda: 'Remisión creada en Effi; falta la guía.' },
  { id: 'por_recoger', titulo: 'Por recoger', clase: 'info', ayuda: 'Guía generada: la transportadora aún no la recoge.' },
  { id: 'transito', titulo: 'En tránsito', clase: 'info', ayuda: 'Va en camino hacia la ciudad del cliente.' },
  { id: 'reparto', titulo: 'Llega hoy', clase: 'aviso', ayuda: 'En reparto: el mensajero la lleva hoy.' },
  { id: 'novedad', titulo: 'Novedad', clase: 'mal', ayuda: 'La transportadora reportó un problema.' },
  { id: 'entregado', titulo: 'Entregado', clase: 'ok', ayuda: 'El cliente ya lo recibió.' },
  { id: 'devuelto', titulo: 'Devuelto', clase: 'neutro', ayuda: 'Volvió a la bodega.' },
];
const etapaDe = (id: Etapa) => ETAPAS.find((x) => x.id === id) || ETAPAS[0];
const fecha = (s: string) => { if (!s) return ''; const d = new Date(s.replace(' ', 'T') + (s.includes('Z') || s.length <= 10 ? '' : 'Z')); return isNaN(+d) ? s : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }); };
const POR_PAGINA = 60;

export function Logistica({ df }: { df: DealFlowState }) {
  const [t, setT] = useState<TableroLogistica | null>(null);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(false);
  const [q, setQ] = useState('');
  const [transp, setTransp] = useRecordado('logistica:transp', '');
  const [dias, setDias] = useRecordado('logistica:dias', '45');
  const [origen, setOrigen] = useRecordado<'' | 'df' | 'effi'>('logistica:origen', '');
  const [etapa, setEtapa] = useState<Etapa | ''>('');
  const [selId, setSelId] = useState('');
  const [max, setMax] = useState(POR_PAGINA);
  const [copiado, setCopiado] = useState(false);

  const cargar = (d = dias) => { void apiLogistica(Number(d)).then((r) => { if (r.data) { setT(r.data); setError(''); } else setError(r.error || 'No se pudo cargar.'); }); };
  useEffect(() => {
    cargar();
    const iv = setInterval(() => { if (!document.hidden) cargar(); }, 60_000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const actualizar = async () => {
    setActualizando(true);
    const r = await apiLogisticaActualizar(Number(dias));
    setActualizando(false);
    if (r.data) setT(r.data); else setError(r.error || 'No se pudo actualizar.');
  };

  const transportadoras = useMemo(() => [...new Set((t?.guias || []).map((g) => g.transportadora).filter(Boolean))].sort(), [t]);
  const base = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (t?.guias || []).filter((g) => (!origen || (origen === 'effi' ? !!g.externa : !g.externa)) && (!transp || g.transportadora === transp) && (!nq || `${g.id} ${g.cliente} ${g.tel} ${g.guia} ${g.ciudad}`.toLowerCase().includes(nq)));
  }, [t, q, transp, origen]);
  const filtradas = etapa ? base.filter((g) => g.etapa === etapa) : base;
  const cuenta = (e: Etapa) => base.filter((g) => g.etapa === e).length;
  useEffect(() => { setMax(POR_PAGINA); }, [q, transp, origen, etapa]);
  const sel = filtradas.find((g) => g.rowId === selId) || null;
  const pedidoSel = sel && !sel.externa ? df.allOrders.find((o) => String(o.rowId) === String(sel.rowId)) || null : null;
  const r = t?.resumen;
  const efect = r?.efectividad != null ? `${Math.round(r.efectividad)} % de efectividad` : 'lo que ya recibió el cliente';

  return (
    <section data-screen-label="Logística Effi" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">Solo Effi · últimos {dias} días</span>
          <h1>Logística Effi</h1>
          <p className="sub">Todas tus guías con su estado real (también las que hiciste por fuera de DealFlow), desde qué bodega salieron y las novedades que el asistente ya está gestionando con el cliente.</p>
        </div>
        <div className="fila">
          <button type="button" className="btn btn-sec" onClick={() => void actualizar()} disabled={actualizando}>{actualizando ? '↻ Consultando Effi…' : '↻ Actualizar desde Effi'}</button>
          <button type="button" className="btn btn-pri" onClick={() => df.go('integraciones')}>🔎 Revisar la integración</button>
        </div>
      </div>

      {error && <div className="aviso-caja mal">{error}</div>}

      <div className="kpis">
        <div className="kpi"><span className="eti">Guías activas</span><span className="valor">{r ? r.activas : '…'}</span><span className="delta">{r?.llegaHoy ? <><b>{r.llegaHoy}</b> llegan hoy</> : 'ninguna llega hoy'}</span></div>
        <div className="kpi"><span className="eti">Entregadas</span><span className="valor">{r ? r.entregadas : '…'}</span><span className="delta">{efect}</span></div>
        <div className="kpi"><span className="eti">Con novedad</span><span className={`valor${r?.novedades ? ' aviso' : ''}`}>{r ? r.novedades : '…'}</span><span className="delta">{r?.devueltas ? <><b className="baja">{r.devueltas}</b> devueltas</> : 'sin devoluciones en el periodo'}</span></div>
        <div className="kpi"><span className="eti">Por recaudar</span><span className="valor" style={{ fontSize: 24 }}>{r ? pesos(r.porRecaudar) : '…'}</span><span className="delta">fletes {r ? pesos(r.fleteTotal) : '…'}</span></div>
      </div>

      {/* Novedades de entrega: se gestionan aquí (ya no en Pedidos). */}
      <NovedadesBandeja df={df} />

      <div className="fila">
        <button type="button" className={`chip${etapa === '' ? ' activa' : ''}`} onClick={() => setEtapa('')}>Todas <span className="n">{base.length}</span></button>
        {ETAPAS.filter((e) => cuenta(e.id) > 0).map((e) => <button key={e.id} type="button" className={`chip${etapa === e.id ? ' activa' : ''}`} onClick={() => setEtapa(e.id)} title={e.ayuda}>{e.titulo} <span className="n">{cuenta(e.id)}</span></button>)}
        {!!r?.soloEffi && (
          <Dropdown ariaLabel="Origen" value={origen} onChange={(v) => setOrigen(v as '' | 'df' | 'effi')} width={170}
            options={[{ value: '', label: 'Todas las guías' }, { value: 'df', label: 'Pedidos de DealFlow' }, { value: 'effi', label: `Solo en Effi (${r.soloEffi})` }]} />
        )}
        {transportadoras.length > 1 && <Dropdown ariaLabel="Transportadora" value={transp} onChange={setTransp} width={170} options={[{ value: '', label: 'Todas las transportadoras' }, ...transportadoras.map((x) => ({ value: x, label: x }))]} />}
        <Dropdown ariaLabel="Periodo" value={dias} onChange={(v) => { setDias(v); cargar(v); }} width={150}
          options={[{ value: '7', label: 'Últimos 7 días' }, { value: '15', label: 'Últimos 15 días' }, { value: '45', label: 'Últimos 45 días' }, { value: '90', label: 'Últimos 90 días' }]} />
        <div className="buscar" style={{ flex: '1 1 240px', maxWidth: 380, marginLeft: 'auto' }}>
          <IcoBuscar />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por pedido, cliente, guía o ciudad…" aria-label="Buscar guía" />
        </div>
      </div>

      <div className="lateral angosto">
        <section className="tarjeta scroll-x" style={{ padding: '4px 6px' }}>
          {!t && !error && <div className="vacio" style={{ margin: 8 }}>Cargando guías…</div>}
          {t && !t.guias.length && <div className="vacio" style={{ margin: 8 }}>Todavía no hay pedidos enviados por Effi en este periodo. Cuando despaches uno, aparece aquí con su guía.</div>}
          {t && t.guias.length > 0 && (
            <table className="tabla" style={{ minWidth: 720 }}>
              <thead><tr><th>Guía</th><th>Pedido</th><th>Cliente</th><th>Transportadora</th><th>Estado</th><th>Flete</th><th>Recaudo</th></tr></thead>
              <tbody>
                {filtradas.slice(0, max).map((g) => {
                  const e = etapaDe(g.etapa);
                  return (
                    <tr key={g.rowId} className={`clic${sel?.rowId === g.rowId ? ' fila-sel' : ''}`} onClick={() => setSelId(g.rowId)} style={{ cursor: 'pointer' }}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}><b>{g.guia || (g.remision ? `Rem. ${g.remision}` : '—')}</b><div className="tenue" style={{ fontSize: 10.5 }}>{fecha(g.creado)}</div></td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{g.externa ? <span className="pill neutro sin chica" title="Esta guía se hizo en Effi, por fuera de DealFlow">Solo Effi</span> : g.id}</td>
                      <td style={{ maxWidth: 170 }}><b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.cliente}</b><div className="tenue" style={{ fontSize: 12 }}>{[g.ciudad, g.departamento].filter(Boolean).join(' · ') || 'Sin ciudad'}</div></td>
                      <td>{g.transportadora || '—'}</td>
                      <td><span className={`pill ${e.clase} chica`}>{g.llegaHoy && g.etapa !== 'entregado' ? 'Llega hoy' : e.titulo}</span>{g.ultimoMovimiento?.estado && <div className="tenue" style={{ fontSize: 11, marginTop: 3, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.ultimoMovimiento.estado}</div>}</td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{g.flete > 0 ? pesos(g.flete) : '—'}</td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{g.recaudo > 0 ? pesos(g.recaudo) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {t && t.guias.length > 0 && (
            <div className="fila" style={{ padding: '10px 8px', justifyContent: 'space-between' }}>
              <span className="tenue" style={{ fontSize: 12 }}>Mostrando {Math.min(max, filtradas.length)} de {filtradas.length} guías · se actualiza solo cada minuto{t.guiasEffiAt ? ` · todas las de Effi cada 20 min (última: ${fecha(t.guiasEffiAt)})` : ''}</span>
              {filtradas.length > max && <button type="button" className="btn btn-sec btn-chico" onClick={() => setMax(max + POR_PAGINA)}>Ver más</button>}
            </div>
          )}
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, position: 'sticky', top: 0 }}>
          {!sel && <section className="tarjeta" aria-label="Detalle de la guía"><div className="vacio">Toca una guía de la tabla para ver su detalle, su último movimiento y gestionar su novedad.</div></section>}
          {sel && (
            <section className="tarjeta" aria-label="Detalle de la guía">
              <div className="tarjeta-cab">
                <div><span className="eti">{sel.guia ? `Guía ${sel.guia}` : sel.remision ? `Remisión ${sel.remision}` : 'Sin guía'}</span><h2 style={{ fontSize: 18 }}>{sel.cliente}</h2></div>
                <span className={`pill ${etapaDe(sel.etapa).clase}`}>{etapaDe(sel.etapa).titulo}</span>
              </div>
              <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Pedido</span>{sel.externa ? <b>Solo en Effi</b> : <button type="button" className="mono enlace" onClick={() => df.verPedido(sel.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{sel.id} →</button>}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Transportadora</span><b>{sel.transportadora || '—'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="suave-t">Llega a</span><b style={{ textAlign: 'right' }}>{[sel.ciudad, sel.departamento].filter(Boolean).join(', ') || '—'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Celular</span><b className="mono">{sel.tel || '—'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Recaudo</span><b className="mono">{sel.recaudo > 0 ? pesos(sel.recaudo) : '—'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Flete</span><b className="mono">{sel.flete > 0 ? pesos(sel.flete) : '—'}{sel.envioCobrado > 0 ? <span className="tenue"> · cobrado {pesos(sel.envioCobrado)}</span> : null}</b></div>
                {sel.entregaEstimada && sel.etapa !== 'entregado' && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="suave-t">Entrega estimada</span><b>{sel.entregaEstimada}</b></div>}
              </div>
              <div className="fila" style={{ gap: 6 }}>
                {sel.guiaUrl && <a className="btn btn-sec btn-chico" href={sel.guiaUrl} target="_blank" rel="noreferrer">Ver la guía</a>}
                {sel.guia && <button type="button" className="btn btn-sec btn-chico" onClick={() => { void navigator.clipboard?.writeText(sel.guia).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }); }}>{copiado ? '✓ Copiada' : 'Copiar guía'}</button>}
                {(sel.leadId || sel.tel) && <button type="button" className="btn btn-fant btn-chico" onClick={() => df.abrirChatDePedido({ leadId: sel.leadId, tel: sel.tel })}>Abrir el chat</button>}
              </div>
              {(sel.ultimoMovimiento || sel.estadoEffi) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
                  <span className="eti" style={{ fontSize: 10 }}>Último movimiento</span>
                  {sel.ultimoMovimiento ? (
                    <div style={{ display: 'flex', gap: 10 }}><span className="mono tenue" style={{ flex: '0 0 86px', fontSize: 10.5 }}>{fecha(sel.ultimoMovimiento.fecha)}</span><span><b>{sel.ultimoMovimiento.estado}</b>{sel.ultimoMovimiento.observacion ? <span className="suave-t"> · {sel.ultimoMovimiento.observacion}</span> : null}</span></div>
                  ) : <span>{sel.estadoEffi}</span>}
                </div>
              )}
            </section>
          )}
          {pedidoSel?.novedad?.abierta && (
            <section className="nov" aria-label="Novedad">
              <div className="tarjeta-cab"><h3 style={{ color: 'var(--coral)' }}>⚠ Novedad de entrega</h3><span className="pill ia sin">✦ el asistente la gestiona</span></div>
              <NovedadCard df={df} sel={pedidoSel} />
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
