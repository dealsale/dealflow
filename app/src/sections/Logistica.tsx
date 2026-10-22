import { useEffect, useMemo, useRef, useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Dropdown } from '../components/Dropdown';
import { NovedadesBandeja } from '../components/Novedades';
import { apiLogistica, apiLogisticaActualizar, type GuiaLogistica, type TableroLogistica } from '../lib/api';

/**
 * Logística Effi: todas las guías en un tablero (como Leads), por etapa del
 * envío. Cada tarjeta muestra por dónde va, la transportadora, el flete, el
 * recaudo y el último movimiento; las que llegan hoy laten. Arriba, las
 * novedades de entrega para gestionarlas desde aquí.
 */
type Etapa = GuiaLogistica['etapa'];
const ETAPAS: { id: Etapa; titulo: string; icono: string; color: string; ayuda: string }[] = [
  { id: 'sin_guia', titulo: 'Sin guía', icono: '🧾', color: '#94A3B8', ayuda: 'Remisión creada en Effi; falta la guía.' },
  { id: 'por_recoger', titulo: 'Por recoger', icono: '📦', color: '#8B5CF6', ayuda: 'Guía generada: la transportadora aún no la recoge.' },
  { id: 'transito', titulo: 'En tránsito', icono: '🚚', color: '#0EA5E9', ayuda: 'Va en camino hacia la ciudad del cliente.' },
  { id: 'reparto', titulo: 'Llega hoy', icono: '🛵', color: '#F59E0B', ayuda: 'En reparto: el mensajero la lleva hoy.' },
  { id: 'novedad', titulo: 'Novedad', icono: '⚠️', color: '#EF4444', ayuda: 'La transportadora reportó un problema.' },
  { id: 'entregado', titulo: 'Entregado', icono: '✅', color: '#10B981', ayuda: 'El cliente ya lo recibió.' },
  { id: 'devuelto', titulo: 'Devuelto', icono: '↩️', color: '#64748B', ayuda: 'Volvió a la bodega.' },
];
const PASOS: Etapa[] = ['sin_guia', 'por_recoger', 'transito', 'reparto', 'entregado'];
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const fecha = (s: string) => { if (!s) return ''; const d = new Date(s.replace(' ', 'T') + (s.includes('Z') || s.length <= 10 ? '' : 'Z')); return isNaN(+d) ? s : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }); };

/** Número que sube animado hasta su valor. */
function Contador({ valor, formato }: { valor: number; formato?: (n: number) => string }) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const desde = prev.current; const t0 = performance.now(); let raf = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / 700); const e = 1 - Math.pow(1 - k, 3);
      setV(desde + (valor - desde) * e);
      if (k < 1) raf = requestAnimationFrame(paso); else prev.current = valor;
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{formato ? formato(v) : Math.round(v)}</>;
}

function Progreso({ etapa, color }: { etapa: Etapa; color: string }) {
  const i = etapa === 'novedad' ? 2.5 : etapa === 'devuelto' ? 2 : PASOS.indexOf(etapa);
  const pct = Math.max(0, (i / (PASOS.length - 1)) * 100);
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'var(--df-border)', overflow: 'hidden' }}>
      <div className="df-log-barra" style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
    </div>
  );
}

function Tarjeta({ g, df, i }: { g: GuiaLogistica; df: DealFlowState; i: number }) {
  const e = ETAPAS.find((x) => x.id === g.etapa)!;
  const [copiado, setCopiado] = useState(false);
  return (
    <div className={`df-log-card${g.llegaHoy ? ' df-log-hoy' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderLeft: `3px solid ${e.color}`, borderRadius: 11, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}
      onClick={() => df.verPedido(g.id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{g.id}</b>
        {g.llegaHoy && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#F59E0B', borderRadius: 999, padding: '1px 7px' }}>HOY</span>}
        <span style={{ flex: 1 }} />
        {g.transportadora && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--df-text-muted)', background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 6, padding: '1px 6px', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🚚 {g.transportadora}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.cliente}</div>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>📍 {[g.ciudad, g.departamento].filter(Boolean).join(', ') || 'Sin ciudad'}</div>
      <Progreso etapa={g.etapa} color={e.color} />
      {g.ultimoMovimiento ? (
        <div style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--df-text-body)' }}>
          <span style={{ fontWeight: 700 }}>{g.ultimoMovimiento.estado}</span>
          {g.ultimoMovimiento.observacion && <span style={{ color: 'var(--df-text-muted)' }}> · {g.ultimoMovimiento.observacion}</span>}
          <div style={{ fontSize: 10.5, color: 'var(--df-text-faint)' }}>{fecha(g.ultimoMovimiento.fecha)}</div>
        </div>
      ) : g.estadoEffi ? <div style={{ fontSize: 11.5, color: 'var(--df-text-body)', fontWeight: 600 }}>{g.estadoEffi}</div> : null}
      {g.entregaEstimada && g.etapa !== 'entregado' && <div style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>🗓️ Entrega estimada: <b>{g.entregaEstimada}</b></div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
        {g.recaudo > 0 && <span style={{ fontWeight: 700, color: '#047857', background: 'rgba(16,185,129,.12)', borderRadius: 6, padding: '2px 7px' }}>💵 Recaudo {pesos(g.recaudo)}</span>}
        {g.flete > 0 && <span style={{ fontWeight: 700, color: '#B45309', background: 'rgba(245,158,11,.14)', borderRadius: 6, padding: '2px 7px' }}>Flete {pesos(g.flete)}</span>}
        {g.envioCobrado > 0 && <span style={{ fontWeight: 600, color: 'var(--df-text-muted)', background: 'var(--df-bg)', borderRadius: 6, padding: '2px 7px' }}>Envío cobrado {pesos(g.envioCobrado)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} onClick={(ev) => ev.stopPropagation()}>
        {g.guia ? (
          <button onClick={() => { void navigator.clipboard?.writeText(g.guia).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }); }} title="Copiar número de guía"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', color: 'var(--df-text-body)' }}>
            {copiado ? '✓ copiada' : `# ${g.guia}`}
          </button>
        ) : <span style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>{g.remision || 'Sin remisión'}</span>}
        <span style={{ flex: 1 }} />
        {g.guiaUrl && <a href={g.guiaUrl} target="_blank" rel="noreferrer" title="Ver la guía" style={{ fontSize: 13, textDecoration: 'none' }}>📄</a>}
        {(g.leadId || g.tel) && <button onClick={() => df.abrirChatDePedido({ leadId: g.leadId, tel: g.tel })} title="Abrir el chat del cliente" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>💬</button>}
      </div>
    </div>
  );
}

export function Logistica({ df }: { df: DealFlowState }) {
  const [t, setT] = useState<TableroLogistica | null>(null);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(false);
  const [q, setQ] = useState('');
  const [transp, setTransp] = useState('');
  const [dias, setDias] = useState('45');
  const [verCerradas, setVerCerradas] = useState(true);

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
  const filtradas = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (t?.guias || []).filter((g) => (!transp || g.transportadora === transp) && (!nq || `${g.id} ${g.cliente} ${g.tel} ${g.guia} ${g.ciudad}`.toLowerCase().includes(nq)));
  }, [t, q, transp]);
  const columnas = ETAPAS.filter((e) => verCerradas || (e.id !== 'entregado' && e.id !== 'devuelto'));
  const r = t?.resumen;

  const kpi = (titulo: string, valor: number, color: string, icono: string, formato?: (n: number) => string, pulso = false) => (
    <div className="df-log-kpi" style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderTop: `3px solid ${color}`, borderRadius: 12, padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        {pulso && valor > 0 && <span className="df-log-punto" style={{ background: color }} />}{icono} {titulo}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}><Contador valor={valor} formato={formato} /></div>
    </div>
  );

  return (
    <section data-screen-label="Logística Effi">
      <style>{`
        @keyframes dfLogEntra { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
        @keyframes dfLogBarra { from { width: 0 } }
        @keyframes dfLogPulso { 0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,.45) } 50% { box-shadow: 0 0 0 6px rgba(245,158,11,0) } }
        @keyframes dfLogPunto { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.6); opacity: .5 } }
        @keyframes dfLogCamion { 0% { left: -40px } 100% { left: calc(100% + 10px) } }
        @keyframes dfLogVia { to { background-position: -40px 0 } }
        @keyframes dfLogGira { to { transform: rotate(360deg) } }
        .df-log-card { animation: dfLogEntra .45s cubic-bezier(.2,.8,.2,1) both; transition: transform .18s, box-shadow .18s }
        .df-log-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -14px rgba(15,23,42,.45) }
        .df-log-hoy { animation: dfLogEntra .45s cubic-bezier(.2,.8,.2,1) both, dfLogPulso 1.8s ease-in-out infinite }
        .df-log-barra { animation: dfLogBarra 1s cubic-bezier(.2,.8,.2,1) both }
        .df-log-kpi { animation: dfLogEntra .5s both }
        .df-log-punto { width: 7px; height: 7px; border-radius: 50%; display: inline-block; animation: dfLogPunto 1.4s infinite }
        .df-log-via { position: relative; height: 26px; margin: 4px 0 14px; border-radius: 999px; overflow: hidden;
          background: repeating-linear-gradient(90deg, var(--df-border) 0 22px, transparent 22px 40px); background-size: 40px 2px; background-repeat: repeat-x; background-position: 0 50%; animation: dfLogVia .8s linear infinite }
        .df-log-via span { position: absolute; top: 0; font-size: 20px; animation: dfLogCamion 9s linear infinite }
        .df-log-gira { display: inline-block; animation: dfLogGira 1s linear infinite }
        @media (prefers-reduced-motion: reduce) { .df-log-card, .df-log-hoy, .df-log-barra, .df-log-kpi, .df-log-punto, .df-log-via, .df-log-via span { animation: none !important } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Logística Effi</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: 0 }}>Todas tus guías, por dónde va cada una y cuáles llegan hoy. Toca una tarjeta para ver el pedido.</p>
        </div>
        <button onClick={() => void actualizar()} disabled={actualizando} style={{ background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: actualizando ? 0.75 : 1 }}>
          {actualizando ? <><span className="df-log-gira">↻</span> Consultando Effi…</> : '↻ Actualizar desde Effi'}
        </button>
      </div>
      <div className="df-log-via" aria-hidden="true"><span>🚚</span></div>

      {error && <div style={{ color: 'var(--df-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {r && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
          {kpi('Guías activas', r.activas, '#0EA5E9', '🚚')}
          {kpi('Llegan hoy', r.llegaHoy, '#F59E0B', '🛵', undefined, true)}
          {kpi('Novedades', r.novedades, '#EF4444', '⚠️', undefined, true)}
          {kpi('Entregadas', r.entregadas, '#10B981', '✅')}
          {kpi('Por recaudar', r.porRecaudar, '#047857', '💵', pesos)}
          {kpi('Fletes', r.fleteTotal, '#B45309', '🧾', pesos)}
          {r.efectividad != null && kpi('Efectividad', r.efectividad, '#8B5CF6', '🎯', (n) => `${Math.round(n)}%`)}
        </div>
      )}

      {/* Novedades de entrega: se gestionan aquí (ya no en Pedidos). */}
      <NovedadesBandeja df={df} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar por pedido, cliente, guía o ciudad…"
          style={{ flex: '1 1 240px', minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 999, padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)' }} />
        {transportadoras.length > 1 && (
          <Dropdown variant="pill" label="Transportadora" value={transp} onChange={setTransp} options={[{ value: '', label: 'Todas' }, ...transportadoras.map((x) => ({ value: x, label: x }))]} />
        )}
        <Dropdown variant="pill" label="Periodo" value={dias} onChange={(v) => { setDias(v); cargar(v); }}
          options={[{ value: '7', label: 'Últimos 7 días' }, { value: '15', label: 'Últimos 15 días' }, { value: '45', label: 'Últimos 45 días' }, { value: '90', label: 'Últimos 90 días' }]} />
        <button onClick={() => setVerCerradas((v) => !v)} style={{ height: 34, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '0 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', color: 'var(--df-text-body)' }}>
          {verCerradas ? 'Ocultar entregadas y devueltas' : 'Ver entregadas y devueltas'}
        </button>
      </div>

      {!t && !error && <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: 20 }}>Cargando guías…</div>}
      {t && !t.guias.length && (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--df-text-muted)', border: '1px dashed var(--df-border)', borderRadius: 12 }}>
          Todavía no hay pedidos enviados por Effi en este periodo. Cuando despaches uno, aparece aquí con su guía.
        </div>
      )}
      {t && t.guias.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start', scrollSnapType: 'x proximity' }}>
          {columnas.map((e) => {
            const lista = filtradas.filter((g) => g.etapa === e.id);
            return (
              <div key={e.id} style={{ flex: '1 0 220px', maxWidth: 320, minWidth: 220, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 260px)', minHeight: 180, scrollSnapAlign: 'start' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--df-border)', display: 'flex', alignItems: 'center', gap: 7 }} title={e.ayuda}>
                  <span className={e.id === 'reparto' || e.id === 'novedad' ? 'df-log-punto' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, display: 'inline-block' }} />
                  <b style={{ fontSize: 13, flex: 1 }}>{e.icono} {e.titulo}</b>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 999, padding: '1px 8px' }}>{lista.length}</span>
                </div>
                <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {!lista.length && <div style={{ fontSize: 12, color: 'var(--df-text-faint)', textAlign: 'center', padding: '14px 6px' }}>{e.ayuda}</div>}
                  {lista.slice(0, 80).map((g, i) => <Tarjeta key={g.rowId} g={g} df={df} i={i} />)}
                  {lista.length > 80 && <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', textAlign: 'center' }}>…y {lista.length - 80} más (usa la búsqueda)</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {t && <div style={{ fontSize: 11, color: 'var(--df-text-faint)', marginTop: 6 }}>Se actualiza solo cada minuto con lo que avisa Effi · última lectura {fecha(t.actualizado)}</div>}
    </section>
  );
}
