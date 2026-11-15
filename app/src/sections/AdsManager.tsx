import { useEffect, useMemo, useState } from 'react';
import { confirmar, notificar } from '../components/dialogs';
import { ymdCO } from '../lib/fechaCO';
import {
  apiAdsAlertas, apiAdsBorrarPrueba, apiAdsBorrarRegla, apiAdsConfig, apiAdsCrearPrueba, apiAdsDuplicarConjunto, apiAdsEstado, apiAdsGuardarAlertas,
  apiAdsOpcionesPrueba, apiAdsPanel, apiAdsPresupuesto, apiAdsProbarAlerta, apiAdsPruebas, apiAdsRegla, apiAdsRevisarAlertas, apiAdsSincronizar,
  apiAdsSugerencia, apiAdsTerminarPrueba,
  type AlertaAds, type CampanaAds, type CfgAlertasAds, type ConfigAds, type OpcionesPruebaAds, type PanelAds, type PruebaAds, type ReglaAds,
  type SugerenciaAds, type TipoAlertaAds,
} from '../lib/api';

/**
 * Administrador de anuncios: estadísticas en vivo de las campañas de Meta cruzadas con las
 * ventas REALES de DealFlow (entregas y devoluciones), y herramientas para optimizarlas sin
 * salir de DealFlow: encender/pausar, subir/bajar presupuesto, sugerencias y reglas automáticas.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btnS: React.CSSProperties = { background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const btnP: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const inp: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)', boxSizing: 'border-box' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 8px', fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 8px', borderTop: '1px solid var(--df-border)', fontSize: 12.5, whiteSpace: 'nowrap' };
const tdN: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const dec = (n: number) => (n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });

const PERIODOS: { k: string; label: string; dias: number }[] = [
  { k: 'hoy', label: 'Hoy', dias: 0 }, { k: 'ayer', label: 'Ayer', dias: -1 }, { k: '7d', label: '7 días', dias: 7 }, { k: '30d', label: '30 días', dias: 30 },
];
const activo: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', borderColor: 'var(--df-brand)' };
type Tab = 'resumen' | 'campanas' | 'anuncios' | 'automatizar' | 'ajustes';
const TABS: { k: Tab; label: string }[] = [
  { k: 'resumen', label: 'Resumen' }, { k: 'campanas', label: 'Campañas' }, { k: 'anuncios', label: 'Anuncios' },
  { k: 'automatizar', label: 'Reglas, alertas y A/B' }, { k: 'ajustes', label: 'Costos e historial' },
];
const restar = (f: string, n: number) => new Date(new Date(f + 'T12:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
function rango(k: string): { desde: string; hasta: string } {
  const hoy = ymdCO();
  if (k === 'ayer') { const a = restar(hoy, 1); return { desde: a, hasta: a }; }
  const p = PERIODOS.find((x) => x.k === k);
  return p && p.dias > 0 ? { desde: restar(hoy, p.dias - 1), hasta: hoy } : { desde: hoy, hasta: hoy };
}

function colorRoas(r: number, gasto: number): React.CSSProperties {
  const base: React.CSSProperties = { display: 'inline-block', minWidth: 44, textAlign: 'center', borderRadius: 999, padding: '2px 8px', fontWeight: 700, fontSize: 12 };
  if (!gasto) return { ...base, background: 'var(--df-surface-2, #F1F5F9)', color: 'var(--df-text-muted)' };
  if (r >= 3) return { ...base, background: 'var(--df-brand-subtle)', color: 'var(--df-brand-dark)' };
  if (r < 1.5) return { ...base, background: 'var(--df-danger-subtle-2, #FEE2E2)', color: 'var(--df-danger-dark)' };
  return { ...base, background: 'var(--df-warning-subtle)', color: 'var(--df-warning)' };
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
      style={{ position: 'relative', width: 40, height: 23, borderRadius: 999, border: 0, cursor: disabled ? 'wait' : 'pointer', background: on ? 'var(--df-brand, #10B981)' : 'var(--df-border)', flex: '0 0 auto', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </button>
  );
}

export function AdsManager() {
  const [periodo, setPeriodo] = useState('hoy');
  const [p, setP] = useState<PanelAds | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [sync, setSync] = useState(false);
  const [actualizado, setActualizado] = useState(0);
  const [editPres, setEditPres] = useState<{ id: string; nombre: string; actual: number } | null>(null);
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem('ads:tab'); return (TABS.some((x) => x.k === t) ? t : 'resumen') as Tab; } catch { return 'resumen'; } });
  const [filtroCamp, setFiltroCamp] = useState<'gasto' | 'activas' | 'todas'>('gasto');
  const [buscar, setBuscar] = useState('');
  const [verTodosAds, setVerTodosAds] = useState(false);
  const r = useMemo(() => rango(periodo), [periodo]);
  const irA = (t: Tab) => { setTab(t); setBuscar(''); try { localStorage.setItem('ads:tab', t); } catch { /* sin almacenamiento */ } };

  const cargar = async () => {
    const x = await apiAdsPanel(r.desde, r.hasta);
    if (x.error || !x.data) { setError(x.error || 'No se pudo cargar.'); return; }
    setError(''); setP(x.data); setActualizado(Date.now());
  };
  // En vivo: se refresca cada minuto mientras la pestaña esté visible.
  useEffect(() => { setP(null); void cargar(); const t = setInterval(() => { if (!document.hidden) void cargar(); }, 60_000); return () => clearInterval(t); }, [r.desde, r.hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const hacer = async (clave: string, fn: () => Promise<{ error?: string }>, ok: string) => {
    setOcupado(clave);
    const x = await fn();
    setOcupado('');
    if (x.error) { notificar(x.error, 'error', 7000); return; }
    notificar(ok); void cargar();
  };
  const sincronizar = async () => { setSync(true); const x = await apiAdsSincronizar(periodo === '30d' ? 30 : periodo === '7d' ? 7 : 3); setSync(false); if (x.error) notificar(x.error, 'error', 7000); void cargar(); };

  if (error && !p) return <section style={{ ...card }}><b>No se pudo cargar el administrador de anuncios.</b><div style={{ fontSize: 13, color: 'var(--df-text-muted)', marginTop: 4 }}>{error}</div></section>;
  if (!p) return <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: 20 }}>Cargando anuncios…</div>;
  const s = p.resumen;
  const hace = actualizado ? Math.max(0, Math.round((Date.now() - actualizado) / 1000)) : 0;

  const cambiarEstado = (id: string, nombre: string, activar: boolean) => void (async () => {
    if (!activar && !(await confirmar({ titulo: `¿Pausar ${nombre}?`, mensaje: 'Se pausa en Meta ahora mismo y deja de gastar.', aceptar: 'Pausar' }))) return;
    await hacer('estado' + id, () => apiAdsEstado(id, activar), activar ? `✓ ${nombre} activada en Meta.` : `✓ ${nombre} pausada en Meta.`);
  })();
  const cambiarPres = (id: string, nombre: string, actual: number, factor: number) => void (async () => {
    const nuevo = Math.round((actual * factor) / 100) * 100;
    if (!(await confirmar({ titulo: `¿Cambiar el presupuesto de ${nombre}?`, mensaje: `${pesos(actual)} → ${pesos(nuevo)} al día. Se aplica en Meta ahora mismo. Cambios de más de 20% pueden reiniciar el aprendizaje.`, aceptar: 'Cambiar' }))) return;
    await hacer('pres' + id, () => apiAdsPresupuesto(id, nuevo), `✓ Presupuesto de ${nombre}: ${pesos(nuevo)} al día.`);
  })();
  const aplicar = (sg: SugerenciaAds) => void (async () => {
    if (!sg.accion) return;
    if (!(await confirmar({ titulo: sg.titulo, mensaje: `${sg.porque}\n\nSe aplica en Meta ahora mismo.`, aceptar: 'Aplicar' }))) return;
    await hacer('sug' + sg.id, () => apiAdsSugerencia(sg.accion!), '✓ Aplicado en Meta.');
  })();

  const maxSerie = Math.max(1, ...p.serie.map((x) => Math.max(x.gasto, x.ventas)));
  const q = buscar.trim().toLowerCase();
  const conGasto = p.campanas.filter((c) => c.gasto > 0).length;
  const activas = p.campanas.filter((c) => c.activa).length;
  const campanasVistas = p.campanas
    .filter((c) => filtroCamp === 'todas' || (filtroCamp === 'activas' ? c.activa : c.gasto > 0 || c.chats > 0 || c.pedidos > 0))
    .filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.conjuntos.some((a) => a.nombre.toLowerCase().includes(q)));
  // Campañas que gastan sin chats ni pedidos: casi siempre son de landing / Shopify sin parámetros de URL.
  const webSinPedidos = p.campanas.filter((c) => c.gasto > 0 && !c.chats && !c.pedidos).map((c) => c.nombre);
  const anunciosVistos = p.anuncios.filter((a) => !q || `${a.nombre} ${a.campana} ${a.conjunto} ${a.producto}`.toLowerCase().includes(q));
  const kpis: [string, string, string?][] = [
    ['Gasto', pesos(s.gasto)],
    ['Ventas (pedidos)', pesos(s.ventas), `${s.pedidos - s.cancelados} pedidos`],
    ['ROAS', dec(s.roas), 'ventas ÷ gasto'],
    ['ROAS esperado', dec(s.roasNeto), `con ${p.tasaEntregaTienda}% de entrega`],
    ['Costo por venta', pesos(s.cpa), `entregada: ${pesos(s.cpaEntregado)}`],
    ['Utilidad estimada', pesos(s.utilidad), 'después de producto, flete, devoluciones y anuncios'],
    ['Chats', String(s.chats), `costo por chat ${pesos(s.costoChat)}`],
    ['Devoluciones', `${s.tasaDevolucion}%`, `${s.devueltos} de ${s.entregados + s.devueltos} cerrados`],
  ];

  return (
    <section data-screen-label="Anuncios" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 2px' }}>Administrador de anuncios</h1>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>
            {p.conectada ? <>🟢 En vivo · actualizado hace {hace < 60 ? `${hace} s` : `${Math.round(hace / 60)} min`} · el gasto de Meta se trae cada 30 min (o con «Sincronizar»)</> : '⚪ Sin conectar a Meta'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODOS.map((x) => <button key={x.k} onClick={() => setPeriodo(x.k)} aria-pressed={periodo === x.k} style={{ ...btnS, ...(periodo === x.k ? activo : {}) }}>{x.label}</button>)}
          <button onClick={() => void sincronizar()} disabled={sync || !p.conectada} style={{ ...btnS, opacity: sync || !p.conectada ? 0.6 : 1 }}>{sync ? 'Sincronizando…' : '↻ Sincronizar'}</button>
        </div>
      </div>

      {!p.conectada && (
        <div style={{ ...card, background: 'var(--df-warning-subtle)', borderColor: 'var(--df-warning)', fontSize: 13, lineHeight: 1.5 }}>
          ⚠️ {p.errorMeta || 'Conecta tu cuenta publicitaria.'} Ve a <b>Integraciones → Meta Ads</b> y dale «Conectar». Mientras tanto ves los chats y pedidos que llegaron por anuncios.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(max(150px, calc((100% - 30px) / 4)), 1fr))', gap: 10 }}>
        {kpis.map(([t, v, sub]) => (
          <div key={t} style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)' }}>{t}</div>
            <div style={{ fontSize: 21, fontWeight: 800, marginTop: 2, color: t === 'Utilidad estimada' && s.utilidad < 0 ? 'var(--df-danger-dark)' : undefined }}>{v}</div>
            {sub && <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 2 }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Secciones de anuncios" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--df-border)', overflowX: 'auto' }}>
        {TABS.map((x) => {
          const n = x.k === 'campanas' ? conGasto : x.k === 'anuncios' ? p.anuncios.length : x.k === 'resumen' ? p.sugerencias.length : 0;
          return (
            <button key={x.k} role="tab" aria-selected={tab === x.k} onClick={() => irA(x.k)}
              style={{ background: 'none', border: 0, borderBottom: `2px solid ${tab === x.k ? 'var(--df-brand)' : 'transparent'}`, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: tab === x.k ? 800 : 600, color: tab === x.k ? 'var(--df-text-strong, var(--df-text))' : 'var(--df-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {x.label}{n ? <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--df-bg)', color: 'var(--df-text-muted)' }}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === 'resumen' && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
        <div style={{ ...card, flex: '3 1 480px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>{p.serie.length === 1 ? 'Gasto vs. ventas' : 'Gasto vs. ventas por día'}</b>
            <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>▮ gris = gasto · ▮ verde = ventas</span>
          </div>
          {p.serie.length === 1 ? (
            <div style={{ display: 'grid', gap: 12, padding: '8px 0' }}>
              {([['Gasto', p.serie[0].gasto, '#94A3B8'], ['Ventas', p.serie[0].ventas, '#10B981']] as const).map(([t, v, color]) => (
                <div key={t}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}><span style={{ color: 'var(--df-text-muted)' }}>{t}</span><b>{pesos(v)}</b></div>
                  <div style={{ height: 14, borderRadius: 7, background: 'var(--df-bg)' }}><div style={{ width: `${(v / maxSerie) * 100}%`, height: '100%', borderRadius: 7, background: color, minWidth: v ? 4 : 0 }} /></div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Elige 7 o 30 días para ver la tendencia por día.</div>
            </div>
          ) : p.serie.length ? (
            <div role="img" aria-label="Gasto y ventas por día" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, height: 160, borderBottom: '1px solid var(--df-border)' }}>
              {p.serie.map((x) => (
                <div key={x.fecha} title={`${x.fecha}: gasto ${pesos(x.gasto)} · ventas ${pesos(x.ventas)} · ${x.pedidos} pedidos`} style={{ flex: '1 1 0', maxWidth: 56, display: 'flex', gap: 2, alignItems: 'flex-end', height: '100%' }}>
                  <div style={{ flex: 1, height: `${(x.gasto / maxSerie) * 100}%`, background: '#94A3B8', borderRadius: '3px 3px 0 0', minHeight: x.gasto ? 2 : 0 }} />
                  <div style={{ flex: 1, height: `${(x.ventas / maxSerie) * 100}%`, background: '#10B981', borderRadius: '3px 3px 0 0', minHeight: x.ventas ? 2 : 0 }} />
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--df-text-faint)' }}>Sin datos en este periodo.</div>}
        </div>

        <div style={{ ...card, flex: '2 1 320px', minWidth: 0, background: '#0B1220', borderColor: '#0B1220', color: '#E2E8F0' }}>
          <b style={{ fontSize: 14, color: '#fff' }}>Optimizador · {p.sugerencias.length} sugerencia{p.sugerencias.length === 1 ? '' : 's'}</b>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxHeight: 360, overflowY: 'auto' }}>
            {!p.sugerencias.length && <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Todo en orden con los datos de este periodo.</div>}
            {p.sugerencias.map((sg) => (
              <div key={sg.id} style={{ background: '#131C2E', border: '1px solid #1E293B', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{sg.tipo === 'escalar' ? '📈 ' : sg.tipo === 'recortar' ? '✂️ ' : sg.tipo === 'creativo' ? '🎬 ' : sg.tipo === 'publico' ? '📍 ' : 'ℹ️ '}{sg.titulo}</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3, lineHeight: 1.45 }}>{sg.porque}</div>
                {sg.accion && <button onClick={() => aplicar(sg)} disabled={ocupado === 'sug' + sg.id} style={{ ...btnP, marginTop: 7, padding: '6px 11px', fontSize: 12 }}>{sg.accion.tipo === 'estado' ? 'Pausar en Meta' : `Subir a ${pesos(sg.accion.valor)}`}</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

        {/* Ciudades */}
        <div style={{ ...card, flex: '1 1 100%', minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>Ciudades que más devuelven</b>
          <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 10px' }}>Pedidos que llegaron por anuncios. Una ciudad que devuelve mucho te cuesta flete de ida y vuelta: sácala de la segmentación en Meta.</div>
          {!p.ciudades.length ? <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Aún no hay suficientes pedidos de anuncios en este periodo.</div> : (
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--df-border)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--df-bg)' }}>{['Ciudad', 'Pedidos', 'Entregados', 'Devueltos', '% devolución'].map((h, i) => <th key={h} style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>{p.ciudades.map((c) => (
                  <tr key={c.ciudad + c.dep}>
                    <td style={td}><b>{c.ciudad}</b>{c.dep && <span style={{ color: 'var(--df-text-muted)' }}> · {c.dep}</span>}</td>
                    <td style={tdN}>{c.pedidos}</td><td style={tdN}>{c.entregados}</td><td style={tdN}>{c.devueltos}</td>
                    <td style={{ ...tdN, fontWeight: 700, color: c.tasaDevolucion >= 40 && c.cerrados >= 4 ? 'var(--df-danger-dark)' : undefined }}>{c.cerrados ? `${c.tasaDevolucion}%` : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </>}

      {tab === 'campanas' && <>
        {webSinPedidos.length > 0 && <ParametrosUrl campanas={webSinPedidos} />}
            <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: 14 }}>Campañas</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {([['gasto', `Con gasto (${conGasto})`], ['activas', `Activas (${activas})`], ['todas', `Todas (${p.campanas.length})`]] as const).map(([k, t]) => (
              <button key={k} onClick={() => setFiltroCamp(k)} aria-pressed={filtroCamp === k} style={{ ...btnS, padding: '5px 10px', ...(filtroCamp === k ? activo : {}) }}>{t}</button>
            ))}
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar campaña…" aria-label="Buscar campaña" style={{ ...inp, width: 180 }} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '4px 0 10px' }}>Ventas = pedidos de DealFlow que llegaron por cada anuncio (WhatsApp, landing o Shopify). ROAS esperado = lo entregado + lo que va en camino × tu tasa de entrega.</div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--df-border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead><tr style={{ background: 'var(--df-bg)' }}>
              {['', 'Campaña', 'Presupuesto diario', 'Gasto', 'Chats', 'Pedidos', 'Entregados', 'Devol.', 'ROAS', 'ROAS esperado', 'Costo/venta', 'Utilidad'].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {!p.campanas.length && <tr><td colSpan={12} style={{ ...td, color: 'var(--df-text-faint)' }}>No hay campañas {p.conectada ? 'en tu cuenta' : '(conecta Meta Ads)'}.</td></tr>}
              {!!p.campanas.length && !campanasVistas.length && <tr><td colSpan={12} style={{ ...td, color: 'var(--df-text-faint)' }}>Ninguna campaña con ese filtro. <button onClick={() => { setFiltroCamp('todas'); setBuscar(''); }} style={{ ...btnS, padding: '3px 8px' }}>Ver todas</button></td></tr>}
              {campanasVistas.map((c) => <FilaCampana key={c.id} c={c} abierta={!!abiertas[c.id]} onAbrir={() => setAbiertas((a) => ({ ...a, [c.id]: !a[c.id] }))} ocupado={ocupado}
                onEstado={cambiarEstado} onPres={cambiarPres} onEditar={(id, nombre, actual) => setEditPres({ id, nombre, actual })} />)}
            </tbody>
          </table>
        </div>
      </div>

      </>}

      {tab === 'anuncios' && <>
            <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: 14 }}>Embudo de WhatsApp por anuncio</b>
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar anuncio o campaña…" aria-label="Buscar anuncio" style={{ ...inp, width: 220 }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '4px 0 10px' }}>Dónde se cae cada anuncio: si trae chats que no compran, el problema es el anuncio o el mensaje; si compran pero devuelven, el producto o la ciudad.</div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--df-border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead><tr style={{ background: 'var(--df-bg)' }}>
              {['Anuncio', 'Gasto', 'Clics', 'Chats', 'Respondieron', 'Dieron datos', 'Pedidos', 'Entregados', 'Devueltos', 'CTR', 'Frecuencia', 'ROAS esperado'].map((h, i) => <th key={h} style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {!anunciosVistos.length && <tr><td colSpan={12} style={{ ...td, color: 'var(--df-text-faint)' }}>{p.anuncios.length ? 'Ningún anuncio coincide con la búsqueda.' : 'Sin anuncios con gasto o chats en este periodo.'}</td></tr>}
              {anunciosVistos.slice(0, verTodosAds || q ? 200 : 15).map((a) => (
                <tr key={a.id}>
                  <td style={{ ...td, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {a.thumb ? <img src={a.thumb} alt="" width={34} height={34} style={{ borderRadius: 6, objectFit: 'cover', flex: '0 0 auto' }} /> : <span style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--df-bg)', flex: '0 0 auto' }} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.nombre}</a> : a.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--df-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.campana || 'Sin campaña en Meta'}{a.producto ? ` · ${a.producto}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdN}>{pesos(a.gasto)}</td><td style={tdN}>{a.clics}</td><td style={tdN}>{a.chats}</td><td style={tdN}>{a.respondieron}</td><td style={tdN}>{a.dieronDatos}</td>
                  <td style={tdN}>{a.pedidos - a.cancelados}</td><td style={tdN}>{a.entregados}</td><td style={tdN}>{a.devueltos}</td>
                  <td style={tdN}>{a.ctr ? `${dec(a.ctr)}%` : '—'}</td>
                  <td style={{ ...tdN, color: a.frecuencia >= 3.5 ? 'var(--df-danger-dark)' : undefined }}>{a.frecuencia ? dec(a.frecuencia) : '—'}</td>
                  <td style={tdN}><span style={colorRoas(a.roasNeto, a.gasto)}>{a.gasto ? dec(a.roasNeto) : '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!q && anunciosVistos.length > 15 && <button onClick={() => setVerTodosAds(!verTodosAds)} style={{ ...btnS, marginTop: 10 }}>{verTodosAds ? 'Ver menos' : `Ver los ${anunciosVistos.length} anuncios`}</button>}
      </div>

      </>}

      {tab === 'automatizar' && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <Reglas reglas={p.reglas} onCambio={cargar} />
          <PruebasAB onCambio={cargar} />
        </div>
        <Alertas />
      </div>
      </>}

      {tab === 'ajustes' && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <Costos config={p.config} onCambio={cargar} />
        {/* Historial */}
        <div style={{ ...card, flex: '2 1 420px', minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>Historial de cambios</b>
          <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 10px' }}>Todo lo que se cambió en Meta desde DealFlow: a mano, por sugerencia o por una regla.</div>
          {!p.historial.length ? <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Todavía no hay cambios.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {p.historial.map((h, i) => (
                <div key={i} style={{ fontSize: 12.5, borderBottom: '1px solid var(--df-border)', paddingBottom: 6 }}>
                  <b>{h.nombre}</b> · {ACCION[h.accion] || h.accion}{h.antes || h.despues ? `: ${h.antes}${h.antes && h.despues ? ' → ' : ''}${h.despues}` : ''}
                  <span style={{ color: h.ok ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}> · {h.origen === 'manual' ? h.usuario || 'a mano' : h.origen === 'sugerencia' ? 'sugerencia' : h.origen === 'prueba A/B' ? 'prueba A/B' : 'regla automática'} · {new Date(h.creado.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{h.ok ? '' : ` · falló: ${h.error}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>}
      {editPres && (
        <EditorPresupuesto {...editPres} tope={p.config.topeDiarioCuenta}
          totalActivo={p.campanas.filter((x) => x.activa).reduce((t, x) => t + (x.presupuestoEn === 'campaign' ? x.presupuesto : x.conjuntos.filter((a) => a.activa).reduce((u, a) => u + (a.presupuesto || 0), 0)), 0)}
          onCerrar={() => setEditPres(null)}
          onAplicar={async (nuevo) => { const e = editPres; setEditPres(null); await hacer('pres' + e.id, () => apiAdsPresupuesto(e.id, nuevo), `✓ Presupuesto de ${e.nombre}: ${pesos(nuevo)} al día.`); }} />
      )}
    </section>
  );
}
const ACCION: Record<string, string> = { activar: 'activada', pausar: 'pausada', subir_presupuesto: 'presupuesto subido', bajar_presupuesto: 'presupuesto bajado', aviso: 'aviso', duplicar: 'duplicado' };

function FilaCampana({ c, abierta, onAbrir, ocupado, onEstado, onPres, onEditar }: {
  c: CampanaAds; abierta: boolean; onAbrir: () => void; ocupado: string;
  onEstado: (id: string, nombre: string, activar: boolean) => void; onPres: (id: string, nombre: string, actual: number, factor: number) => void;
  onEditar: (id: string, nombre: string, actual: number) => void;
}) {
  const archivada = c.estado === 'ARCHIVED';
  const presBotones = (id: string, nombre: string, valor: number) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => onPres(id, nombre, valor, 0.9)} disabled={ocupado === 'pres' + id} aria-label={`Bajar 10% ${nombre}`} style={{ ...btnS, padding: '3px 8px' }}>−</button>
      <button onClick={() => onEditar(id, nombre, valor)} disabled={ocupado === 'pres' + id} title="Cambiar el presupuesto: porcentaje, monto o valor fijo" aria-label={`Editar presupuesto de ${nombre}`}
        style={{ minWidth: 86, textAlign: 'center', fontWeight: 700, background: 'none', border: '1px dashed var(--df-border)', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'inherit' }}>{pesos(valor)} ✎</button>
      <button onClick={() => onPres(id, nombre, valor, 1.1)} disabled={ocupado === 'pres' + id} aria-label={`Subir 10% ${nombre}`} style={{ ...btnS, padding: '3px 8px' }}>+</button>
    </span>
  );
  return (
    <>
      <tr style={{ opacity: archivada ? 0.6 : 1 }}>
        <td style={td}>{!archivada && <Switch on={c.activa} disabled={ocupado === 'estado' + c.id} label={`${c.activa ? 'Pausar' : 'Activar'} ${c.nombre}`} onChange={() => onEstado(c.id, c.nombre, !c.activa)} />}</td>
        <td style={{ ...td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <button onClick={onAbrir} disabled={!c.conjuntos.length} style={{ background: 'none', border: 0, padding: 0, cursor: c.conjuntos.length ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', color: 'inherit' }}>
            <div style={{ fontWeight: 700 }}>{c.conjuntos.length ? (abierta ? '▾ ' : '▸ ') : ''}{c.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>{archivada ? 'Ya no está en Meta' : `${c.objetivo || ''}${c.conjuntos.some((a) => a.aprendizaje) ? ` · ${c.conjuntos.find((a) => a.aprendizaje)!.aprendizaje}` : ''}`}</div>
          </button>
        </td>
        <td style={td}>{c.presupuestoEn === 'campaign' ? presBotones(c.id, c.nombre, c.presupuesto) : c.presupuestoEn === 'adset' ? <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{pesos(c.presupuesto)} en conjuntos ▸</span> : '—'}</td>
        <td style={tdN}>{pesos(c.gasto)}</td><td style={tdN}>{c.chats}</td><td style={tdN}>{c.pedidos - c.cancelados}</td><td style={tdN}>{c.entregados}</td>
        <td style={tdN}>{c.entregados + c.devueltos ? `${c.tasaDevolucion}%` : '—'}</td>
        <td style={tdN}><span style={colorRoas(c.roas, c.gasto)}>{c.gasto ? dec(c.roas) : '—'}</span></td>
        <td style={tdN}><span style={colorRoas(c.roasNeto, c.gasto)}>{c.gasto ? dec(c.roasNeto) : '—'}</span></td>
        <td style={tdN}>{c.pedidos - c.cancelados ? pesos(c.cpa) : '—'}</td>
        <td style={{ ...tdN, fontWeight: 700, color: c.utilidad < 0 ? 'var(--df-danger-dark)' : 'var(--df-brand-dark)' }}>{c.gasto || c.ventas ? pesos(c.utilidad) : '—'}</td>
      </tr>
      {abierta && c.conjuntos.map((a) => (
        <tr key={a.id} style={{ background: 'var(--df-bg)' }}>
          <td style={td}><Switch on={a.activa} disabled={ocupado === 'estado' + a.id} label={`${a.activa ? 'Pausar' : 'Activar'} ${a.nombre}`} onChange={() => onEstado(a.id, a.nombre, !a.activa)} /></td>
          <td style={{ ...td, paddingLeft: 26, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <div style={{ fontWeight: 600 }}>{a.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>{[a.edad && `${a.edad} años`, a.ubicaciones, a.aprendizaje].filter(Boolean).join(' · ') || 'Conjunto'}</div>
            {!c.activa && a.activa && <div style={{ fontSize: 11, color: 'var(--df-warning)', fontWeight: 600 }}>No está corriendo: su campaña está en pausa</div>}
          </td>
          <td style={td}>{a.presupuesto ? presBotones(a.id, a.nombre, a.presupuesto) : <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>de la campaña</span>}</td>
          <td style={tdN}>{pesos(a.gasto)}</td><td style={tdN}>{a.chats}</td><td style={tdN}>{a.pedidos - a.cancelados}</td><td style={tdN}>{a.entregados}</td>
          <td style={tdN}>{a.entregados + a.devueltos ? `${a.tasaDevolucion}%` : '—'}</td>
          <td style={tdN}><span style={colorRoas(a.roas, a.gasto)}>{a.gasto ? dec(a.roas) : '—'}</span></td>
          <td style={tdN}><span style={colorRoas(a.roasNeto, a.gasto)}>{a.gasto ? dec(a.roasNeto) : '—'}</span></td>
          <td style={tdN}>{a.pedidos - a.cancelados ? pesos(a.cpa) : '—'}</td>
          <td style={{ ...tdN, color: a.utilidad < 0 ? 'var(--df-danger-dark)' : undefined }}>{a.gasto || a.ventas ? pesos(a.utilidad) : '—'}</td>
        </tr>
      ))}
    </>
  );
}

const METRICA: Record<ReglaAds['metrica'], string> = { cpa: 'Costo por venta', roas_neto: 'ROAS esperado', gasto_sin_venta: 'Gasto sin ninguna venta', tasa_devolucion: '% de devolución' };
const ACCION_REGLA: Record<ReglaAds['accion'], string> = { pausar: 'pausar la campaña', subir: 'subir el presupuesto', bajar: 'bajar el presupuesto', avisar: 'solo avisarme' };

function Reglas({ reglas, onCambio }: { reglas: ReglaAds[]; onCambio: () => void }) {
  const nueva: Partial<ReglaAds> = { metrica: 'cpa', operador: '>', valor: 45000, dias: 2, accion: 'pausar', pct: 15, tope: 0 };
  const [f, setF] = useState<Partial<ReglaAds> | null>(null);
  const guardar = async () => {
    if (!f) return;
    const r = await apiAdsRegla(f);
    if (r.error) return notificar(r.error, 'error');
    setF(null); onCambio();
  };
  const conPct = f?.accion === 'subir' || f?.accion === 'bajar';
  const describir = (r: ReglaAds) => `Si ${METRICA[r.metrica].toLowerCase()} ${r.operador === '>' ? 'es mayor a' : 'es menor a'} ${r.metrica === 'roas_neto' ? r.valor : r.metrica === 'tasa_devolucion' ? `${r.valor}%` : pesos(r.valor)} en ${r.dias === 1 ? 'el día' : `${r.dias} días`}`;
  return (
    <div style={{ ...card, flex: '1 1 380px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14 }}>Reglas automáticas</b>
        {!f && <button onClick={() => setF(nueva)} style={btnS}>+ Nueva regla</button>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 10px' }}>Se revisan cada 30 minutos con tus ventas reales. Cada regla actúa como mucho una vez al día por campaña y te avisa con una notificación.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!reglas.length && !f && <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Sin reglas todavía.</div>}
        {reglas.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--df-border)', borderRadius: 10, padding: 10 }}>
            <Switch on={r.activa} label={`${r.activa ? 'Apagar' : 'Encender'} regla`} onChange={() => void apiAdsRegla({ ...r, activa: !r.activa }).then(onCambio)} />
            <div style={{ flex: 1, fontSize: 12.5 }}>
              <b>{describir(r)}</b>
              <div style={{ color: 'var(--df-text-muted)' }}>→ {ACCION_REGLA[r.accion]}{r.accion === 'subir' || r.accion === 'bajar' ? ` ${r.pct}%` : ''}{r.accion === 'subir' && r.tope ? ` (máximo ${pesos(r.tope)} al día)` : ''}</div>
            </div>
            <button onClick={() => void apiAdsBorrarRegla(r.id).then(onCambio)} aria-label="Borrar regla" style={{ ...btnS, padding: '3px 8px', color: 'var(--df-danger-dark)' }}>✕</button>
          </div>
        ))}
        {f && (
          <div style={{ border: '1px solid var(--df-brand-border, var(--df-border))', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              Si
              <select value={f.metrica} onChange={(e) => setF({ ...f, metrica: e.target.value as ReglaAds['metrica'] })} style={inp} aria-label="Métrica">{Object.entries(METRICA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select value={f.operador} onChange={(e) => setF({ ...f, operador: e.target.value as '>' | '<' })} style={inp} aria-label="Comparación"><option value=">">es mayor a</option><option value="<">es menor a</option></select>
              <input type="number" min={0} value={f.valor ?? 0} onChange={(e) => setF({ ...f, valor: Number(e.target.value) })} style={{ ...inp, width: 110 }} aria-label="Valor" />
              en
              <select value={String(f.dias)} onChange={(e) => setF({ ...f, dias: Number(e.target.value) })} style={inp} aria-label="Días"><option value="1">el día</option><option value="2">2 días</option><option value="3">3 días</option><option value="7">7 días</option></select>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              entonces
              <select value={f.accion} onChange={(e) => setF({ ...f, accion: e.target.value as ReglaAds['accion'] })} style={inp} aria-label="Acción">{Object.entries(ACCION_REGLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {conPct && <><input type="number" min={1} max={30} value={f.pct ?? 15} onChange={(e) => setF({ ...f, pct: Number(e.target.value) })} style={{ ...inp, width: 70 }} aria-label="Porcentaje" />%</>}
              {f.accion === 'subir' && <>máximo <input type="number" min={0} value={f.tope ?? 0} onChange={(e) => setF({ ...f, tope: Number(e.target.value) })} style={{ ...inp, width: 110 }} aria-label="Tope diario" /> al día</>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => void guardar()} style={btnP}>Guardar regla</button>
              <button onClick={() => setF(null)} style={btnS}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Costos({ config, onCambio }: { config: ConfigAds; onCambio: () => void }) {
  const [c, setC] = useState(config);
  useEffect(() => setC(config), [config]);
  const guardar = async () => { const r = await apiAdsConfig(c); if (r.error) return notificar(r.error, 'error'); notificar('✓ Guardado. La utilidad se recalcula con estos valores.'); onCambio(); };
  const campo = (k: keyof ConfigAds, label: string, ayuda: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 600, color: 'var(--df-text-muted)' }}>
      {label}
      <input type="number" min={0} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} style={inp} />
      <span style={{ fontWeight: 400, color: 'var(--df-text-faint)' }}>{ayuda}</span>
    </label>
  );
  return (
    <div style={{ ...card, flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b style={{ fontSize: 14 }}>Tus costos (para la utilidad)</b>
      {campo('costoProductoPct', 'Costo del producto (% del precio)', 'Lo que te cuesta la mercancía o el proveedor')}
      {campo('flete', 'Flete promedio por pedido ($)', 'Envío de ida')}
      {campo('costoDevolucion', 'Costo de una devolución ($)', 'Flete de regreso')}
      {campo('cpaObjetivo', 'Costo por venta objetivo ($)', 'Para las sugerencias (0 = sin objetivo)')}
      {campo('topeDiarioCuenta', 'Tope de gasto diario de la cuenta ($)', 'Las reglas nunca suben más de esto (0 = sin tope)')}
      <button onClick={() => void guardar()} style={{ ...btnP, alignSelf: 'flex-start' }}>Guardar</button>
    </div>
  );
}

// ── Pruebas A/B ──────────────────────────────────────────────────────────────────────────────
function PruebasAB({ onCambio }: { onCambio: () => void }) {
  const [pruebas, setPruebas] = useState<PruebaAds[] | null>(null);
  const [ops, setOps] = useState<OpcionesPruebaAds | null>(null);
  const [f, setF] = useState<{ nivel: 'ad' | 'adset'; aId: string; bId: string; metrica: 'cpa' | 'roas'; diasMin: number; ventasMin: number; accion: 'pausar' | 'avisar' } | null>(null);
  const [dup, setDup] = useState('');
  const [ocupado, setOcupado] = useState('');
  const cargar = () => void apiAdsPruebas().then((r) => setPruebas(r.data?.pruebas || []));
  useEffect(cargar, []);
  const abrir = async () => {
    setF({ nivel: 'ad', aId: '', bId: '', metrica: 'cpa', diasMin: 3, ventasMin: 5, accion: 'pausar' });
    if (!ops) { const r = await apiAdsOpcionesPrueba(); setOps(r.data || { anuncios: [], conjuntos: [] }); }
  };
  const lista = f?.nivel === 'adset' ? (ops?.conjuntos || []).map((x) => ({ id: x.id, nombre: x.nombre, sub: x.campana + (x.activa ? '' : ' · en pausa') }))
    : (ops?.anuncios || []).map((x) => ({ id: x.id, nombre: x.nombre || x.id, sub: `${x.campana} · ${x.conjunto}` }));
  const nombreDe = (id: string) => lista.find((x) => x.id === id)?.nombre || '';
  const crear = async () => {
    if (!f) return;
    setOcupado('crear');
    const r = await apiAdsCrearPrueba({ ...f, aNombre: nombreDe(f.aId), bNombre: nombreDe(f.bId) });
    setOcupado('');
    if (r.error || !r.data) return notificar(r.error || 'No se pudo crear la prueba.', 'error');
    setPruebas(r.data.pruebas); setF(null);
    notificar('✓ Prueba creada. Te avisamos al celular cuando haya un ganador.');
  };
  const terminar = async (p: PruebaAds) => {
    if (!(await confirmar({ titulo: 'Terminar la prueba', mensaje: `Se cierra con los números de hoy.${p.accion === 'pausar' ? ' Si ya hay una diferencia clara, pausamos al perdedor.' : ''}`, aceptar: 'Terminar' }))) return;
    setOcupado('fin' + p.id);
    const r = await apiAdsTerminarPrueba(p.id);
    setOcupado('');
    if (r.error) return notificar(r.error, 'error');
    setPruebas(r.data?.pruebas || []); onCambio();
  };
  const borrar = async (p: PruebaAds) => {
    if (!(await confirmar({ titulo: 'Borrar la prueba', mensaje: 'Solo se borra de DealFlow; tus anuncios en Meta no cambian.', aceptar: 'Borrar', peligro: true }))) return;
    const r = await apiAdsBorrarPrueba(p.id);
    setPruebas(r.data?.pruebas || []);
  };
  const duplicar = async () => {
    if (!dup) return;
    setOcupado('dup');
    const r = await apiAdsDuplicarConjunto(dup);
    setOcupado('');
    if (r.error) return notificar(r.error, 'error');
    notificar('✓ Conjunto duplicado en pausa. Cámbiale el anuncio o el público en Meta, actívalo y crea la prueba.');
    setDup(''); setOps(null); onCambio();
  };
  const valor = (p: PruebaAds, l: PruebaAds['a']) => (p.metrica === 'cpa' ? (l.pedidos ? pesos(l.cpa) : '—') : (l.gasto ? dec(l.roas) : '—'));
  return (
    <div style={{ ...card, flex: '1 1 420px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14 }}>Pruebas A/B</b>
        {!f && <button onClick={() => void abrir()} style={btnS}>+ Nueva prueba</button>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 10px' }}>Compara dos anuncios o dos conjuntos con tus ventas reales (no con clics). Gana el que venda más barato con al menos 15 % de diferencia; al terminar te avisamos y, si quieres, pausamos al perdedor.</div>
      {f && (
        <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ad', 'adset'] as const).map((n) => <button key={n} onClick={() => setF({ ...f, nivel: n, aId: '', bId: '' })} style={{ ...btnS, ...(f.nivel === n ? { background: 'var(--df-brand)', color: '#fff', borderColor: 'var(--df-brand)' } : {}) }}>{n === 'ad' ? 'Dos anuncios' : 'Dos conjuntos'}</button>)}
          </div>
          {!ops ? <div style={{ color: 'var(--df-text-faint)' }}>Cargando…</div> : !lista.length ? <div style={{ color: 'var(--df-text-faint)' }}>{f.nivel === 'ad' ? 'No hay anuncios con gasto en los últimos 30 días.' : 'No hay conjuntos en tu cuenta.'}</div> : (
            (['aId', 'bId'] as const).map((k, i) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontWeight: 600, color: 'var(--df-text-muted)' }}>
                Opción {i ? 'B' : 'A'}
                <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={{ ...inp, width: '100%' }}>
                  <option value="">Elige…</option>
                  {lista.filter((x) => x.id !== (k === 'aId' ? f.bId : f.aId)).map((x) => <option key={x.id} value={x.id}>{x.nombre} — {x.sub}</option>)}
                </select>
              </label>
            ))
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            Gana el de
            <select value={f.metrica} onChange={(e) => setF({ ...f, metrica: e.target.value as 'cpa' | 'roas' })} style={inp} aria-label="Métrica"><option value="cpa">menor costo por venta</option><option value="roas">mayor ROAS esperado</option></select>
            tras
            <select value={String(f.diasMin)} onChange={(e) => setF({ ...f, diasMin: Number(e.target.value) })} style={inp} aria-label="Días mínimos">{[2, 3, 4, 5, 7].map((d) => <option key={d} value={d}>{d} días</option>)}</select>
            y
            <select value={String(f.ventasMin)} onChange={(e) => setF({ ...f, ventasMin: Number(e.target.value) })} style={inp} aria-label="Ventas mínimas">{[3, 5, 8, 10, 15].map((d) => <option key={d} value={d}>{d} ventas</option>)}</select>
            cada uno
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            Al terminar
            <select value={f.accion} onChange={(e) => setF({ ...f, accion: e.target.value as 'pausar' | 'avisar' })} style={inp} aria-label="Al terminar"><option value="pausar">pausar al perdedor y avisarme</option><option value="avisar">solo avisarme</option></select>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => void crear()} disabled={!f.aId || !f.bId || ocupado === 'crear'} style={{ ...btnP, opacity: !f.aId || !f.bId ? 0.5 : 1 }}>Empezar prueba</button>
            <button onClick={() => setF(null)} style={btnS}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pruebas === null ? <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Cargando…</div> : !pruebas.length && !f ? <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Sin pruebas todavía.</div> : pruebas.map((p) => (
          <div key={p.id} style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 10, fontSize: 12.5, opacity: p.estado === 'terminada' ? 0.85 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <b>{p.nombre}</b>
                <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>{p.nivel === 'ad' ? 'Anuncios' : 'Conjuntos'} · {p.metrica === 'cpa' ? 'costo por venta' : 'ROAS esperado'} · {p.estado === 'corriendo' ? `día ${p.dias}` : 'terminada'}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {p.estado === 'corriendo' && <button onClick={() => void terminar(p)} disabled={ocupado === 'fin' + p.id} style={{ ...btnS, padding: '3px 8px' }}>Terminar</button>}
                <button onClick={() => void borrar(p)} aria-label="Borrar prueba" style={{ ...btnS, padding: '3px 8px', color: 'var(--df-danger-dark)' }}>✕</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              {(['a', 'b'] as const).map((k) => {
                const l = p[k];
                const gana = p.ganador === k;
                const pierde = (p.ganador === 'a' || p.ganador === 'b') && !gana;
                return (
                  <div key={k} style={{ borderRadius: 8, padding: 8, background: gana ? 'var(--df-brand-50, rgba(16,185,129,.1))' : 'var(--df-bg)', border: `1px solid ${gana ? 'var(--df-brand)' : 'var(--df-border)'}`, opacity: pierde ? 0.6 : 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--df-text-muted)' }}>{k.toUpperCase()}{gana ? ' · 🏆 Ganador' : pierde ? ' · Perdedor' : ''}</div>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.nombre}>{l.nombre}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{valor(p, l)}</div>
                    <div style={{ fontSize: 11, color: 'var(--df-text-muted)' }}>{pesos(l.gasto)} gastado · {l.pedidos} ventas{l.devueltos ? ` · ${l.devueltos} devueltas` : ''}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: p.estado === 'terminada' ? 'var(--df-text-body)' : 'var(--df-text-muted)' }}>{p.progreso}</div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--df-border)', marginTop: 12, paddingTop: 10, fontSize: 12.5 }}>
        <b>¿Quieres probar un cambio?</b>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 6px' }}>Duplica un conjunto con sus anuncios. La copia queda en pausa para que le cambies el video, el texto o el público en Meta antes de activarla.</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={dup} onFocus={() => { if (!ops) void apiAdsOpcionesPrueba().then((r) => setOps(r.data || { anuncios: [], conjuntos: [] })); }} onChange={(e) => setDup(e.target.value)} style={{ ...inp, flex: '1 1 200px', minWidth: 0 }} aria-label="Conjunto a duplicar">
            <option value="">Elige un conjunto…</option>
            {(ops?.conjuntos || []).map((x) => <option key={x.id} value={x.id}>{x.nombre} — {x.campana}</option>)}
          </select>
          <button onClick={() => void duplicar()} disabled={!dup || ocupado === 'dup'} style={{ ...btnS, opacity: dup ? 1 : 0.5 }}>{ocupado === 'dup' ? 'Duplicando…' : 'Duplicar en pausa'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Alertas al celular ───────────────────────────────────────────────────────────────────────
const ICONO_ALERTA: Record<TipoAlertaAds, string> = { gasto_sin_venta: '💸', cpa_alto: '📈', rechazado: '⛔', cuenta: '💳', pixel: '📡', resumen: '☀️' };
function Alertas() {
  const [cfg, setCfg] = useState<CfgAlertasAds | null>(null);
  const [tipos, setTipos] = useState<Record<TipoAlertaAds, string> | null>(null);
  const [ultimas, setUltimas] = useState<AlertaAds[]>([]);
  const [ocupado, setOcupado] = useState('');
  const permiso = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  useEffect(() => { void apiAdsAlertas().then((r) => { if (r.data) { setCfg(r.data.config); setTipos(r.data.tipos); setUltimas(r.data.ultimas); } }); }, []);
  const guardar = async (c: CfgAlertasAds) => {
    setCfg(c);
    const r = await apiAdsGuardarAlertas(c);
    if (r.error) return notificar(r.error, 'error');
    if (r.data) setCfg(r.data.config);
  };
  const probar = async () => {
    setOcupado('probar');
    await apiAdsProbarAlerta();
    setOcupado('');
    notificar(permiso === 'granted' ? '✓ Enviada. Debe llegarte en unos segundos.' : '✓ Enviada. Si no te llega, activa las notificaciones en la campana 🔔 de arriba.');
  };
  const revisar = async () => {
    setOcupado('revisar');
    const r = await apiAdsRevisarAlertas();
    setOcupado('');
    if (r.error || !r.data) return notificar(r.error || 'No se pudo revisar.', 'error');
    setUltimas(r.data.ultimas);
    notificar(r.data.enviadas ? `Se enviaron ${r.data.enviadas} alerta(s).` : '✓ Todo en orden: no hay nada que avisar ahora.');
  };
  if (!cfg || !tipos) return <div style={{ ...card, flex: '1 1 340px', minWidth: 0, fontSize: 12.5, color: 'var(--df-text-faint)' }}>Cargando alertas…</div>;
  const on = (t: TipoAlertaAds) => cfg.activas.includes(t);
  const cambiar = (t: TipoAlertaAds) => void guardar({ ...cfg, activas: on(t) ? cfg.activas.filter((x) => x !== t) : [...cfg.activas, t] });
  return (
    <div style={{ ...card, flex: '1 1 340px', minWidth: 0 }}>
      <b style={{ fontSize: 14 }}>Alertas al celular</b>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 10px' }}>Te llegan como notificación al celular del dueño (y por correo si quieres). Se revisan cada 30 minutos y cada alerta sale como mucho una vez al día.</div>
      {permiso !== 'granted' && <div style={{ fontSize: 12, background: 'var(--df-warning-bg, #fff7e6)', color: 'var(--df-warning-dark, #8a5a00)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{permiso === 'unsupported' ? 'Este navegador no recibe notificaciones. Abre DealFlow en tu celular (Chrome o la app instalada).' : 'Las notificaciones no están activas en este dispositivo. Actívalas en la campana 🔔 de arriba, desde tu celular.'}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(Object.keys(tipos) as TipoAlertaAds[]).map((t) => (
          <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
            <Switch on={on(t)} label={`${on(t) ? 'Apagar' : 'Encender'}: ${tipos[t]}`} onChange={() => cambiar(t)} />
            <span style={{ flex: 1 }}>{ICONO_ALERTA[t]} {tipos[t]}</span>
            {t === 'gasto_sin_venta' && on(t) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--df-text-muted)' }}>
                desde
                <input type="number" min={1000} step={5000} defaultValue={cfg.gastoSinVenta} onBlur={(e) => { const v = Number(e.target.value); if (v && v !== cfg.gastoSinVenta) void guardar({ ...cfg, gastoSinVenta: v }); }} style={{ ...inp, width: 100 }} aria-label="Gasto sin venta" />
              </label>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, borderTop: '1px solid var(--df-border)', paddingTop: 8 }}>
          <Switch on={cfg.correo} label={cfg.correo ? 'No enviar por correo' : 'Enviar también por correo'} onChange={() => void guardar({ ...cfg, correo: !cfg.correo })} />
          <span style={{ flex: 1 }}>✉️ También por correo</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={() => void probar()} disabled={ocupado === 'probar'} style={btnS}>Enviar alerta de prueba</button>
        <button onClick={() => void revisar()} disabled={ocupado === 'revisar'} style={btnS}>{ocupado === 'revisar' ? 'Revisando…' : 'Revisar ahora'}</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 6 }}>Últimas alertas</div>
        {!ultimas.length ? <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Ninguna todavía.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {ultimas.map((a, i) => (
              <div key={i} style={{ fontSize: 12.5, borderBottom: '1px solid var(--df-border)', paddingBottom: 6 }}>
                <b>{ICONO_ALERTA[a.tipo] || '🔔'} {a.titulo}</b>
                <div style={{ color: 'var(--df-text-muted)' }}>{a.detalle}</div>
                <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>{new Date(a.creado.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Cómo marcar los anuncios de landing / Shopify para que DealFlow sepa de qué anuncio vino cada pedido. */
const PARAMS_URL = 'utm_source=facebook&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.id}}';
function ParametrosUrl({ campanas }: { campanas: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const copiar = () => { void navigator.clipboard?.writeText(PARAMS_URL).then(() => notificar('✓ Copiado.')).catch(() => notificar('Cópialo a mano.', 'error')); };
  return (
    <div style={{ ...card, background: 'var(--df-warning-subtle, #fff7e6)', borderColor: 'var(--df-warning, #d97706)', fontSize: 12.5, lineHeight: 1.55 }}>
      <b>{campanas.length === 1 ? `«${campanas[0]}» gasta` : `${campanas.length} campañas gastan`} sin chats ni pedidos en DealFlow.</b>{' '}
      Si llevan a tu landing o a Shopify, DealFlow reconoce el anuncio por la dirección de entrada (y, si no tiene datos, por el enlace del anuncio). Para que no se pierda ninguna venta, agrégales los parámetros de URL.{' '}
      <button onClick={() => setAbierto(!abierto)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--df-brand)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>{abierto ? 'Ocultar' : '¿Cómo?'}</button>
      {abierto && (
        <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>En el Administrador de anuncios de Meta, edita cada anuncio de esas campañas.</li>
          <li>Baja hasta <b>Seguimiento → Parámetros de URL</b> y pega esto:
            <div style={{ display: 'flex', gap: 6, margin: '4px 0', flexWrap: 'wrap' }}>
              <code style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 6, padding: '4px 8px', fontSize: 11.5, wordBreak: 'break-all', flex: '1 1 260px' }}>{PARAMS_URL}</code>
              <button onClick={copiar} style={{ ...btnS, padding: '4px 10px' }}>Copiar</button>
            </div>
          </li>
          <li>Publica. Desde ese momento cada pedido de la landing o de Shopify queda con su anuncio exacto. Los pedidos sin esos datos se asignan por el enlace del anuncio y salen como «estimado».</li>
          <li>Meta cuenta compras con su propio criterio (hasta 7 días después del clic, e incluso solo por ver el anuncio): sus números no van a ser iguales a los pedidos reales que ves aquí.</li>
        </ol>
      )}
    </div>
  );
}

// ── Editor de presupuesto: porcentaje, sumar/restar un monto o valor fijo ───────────────────
type ModoPres = 'pct' | 'monto' | 'fijo';
function EditorPresupuesto({ nombre, actual, tope, totalActivo, onCerrar, onAplicar }: {
  id: string; nombre: string; actual: number; tope: number; totalActivo: number; onCerrar: () => void; onAplicar: (nuevo: number) => void | Promise<void>;
}) {
  const [modo, setModo] = useState<ModoPres>('pct');
  const [subir, setSubir] = useState(true);
  const [pct, setPct] = useState('20');
  const [monto, setMonto] = useState('20000');
  const [fijo, setFijo] = useState(String(actual));
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onCerrar]);
  const n = (v: string) => Number(String(v).replace(/[^\d.]/g, '')) || 0;
  const signo = subir ? 1 : -1;
  const bruto = modo === 'pct' ? actual * (1 + (signo * n(pct)) / 100) : modo === 'monto' ? actual + signo * n(monto) : n(fijo);
  const nuevo = Math.max(0, Math.round(bruto / 100) * 100);
  const dif = nuevo - actual;
  const difPct = actual ? Math.round((dif / actual) * 100) : 0;
  const errores: string[] = [];
  if (nuevo < 1000) errores.push('El presupuesto diario debe ser de al menos $1.000.');
  const avisos: string[] = [];
  if (Math.abs(difPct) > 20 && nuevo >= 1000) avisos.push('Cambios de más de 20 % pueden reiniciar la fase de aprendizaje de Meta. Si va bien, mejor subir de a 20 % cada 2 o 3 días.');
  if (tope > 0 && dif > 0 && totalActivo + dif > tope) avisos.push(`Con este cambio la cuenta gastaría hasta ${pesos(totalActivo + dif)} al día, más que tu tope de ${pesos(tope)}.`);
  if (actual && nuevo > actual * 3) avisos.push('Es más del triple del presupuesto actual: revisa que el valor esté bien escrito.');
  const chip = (activo: boolean): React.CSSProperties => ({ ...btnS, padding: '5px 10px', ...(activo ? { background: 'var(--df-brand)', color: '#fff', borderColor: 'var(--df-brand)' } : {}) });
  const sinCambio = nuevo === actual;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Presupuesto de ${nombre}`} onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 12, boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div>
          <b style={{ fontSize: 15 }}>Presupuesto diario</b>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre} · hoy {pesos(actual)} al día</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['pct', 'Porcentaje'], ['monto', 'Sumar o restar'], ['fijo', 'Valor fijo']] as const).map(([k, t]) => <button key={k} onClick={() => setModo(k)} aria-pressed={modo === k} style={chip(modo === k)}>{t}</button>)}
        </div>
        {modo !== 'fijo' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setSubir(true)} aria-pressed={subir} style={chip(subir)}>▲ Subir</button>
            <button onClick={() => setSubir(false)} aria-pressed={!subir} style={chip(!subir)}>▼ Bajar</button>
          </div>
        )}
        {modo === 'pct' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[10, 15, 20, 30, 50, 100].map((x) => <button key={x} onClick={() => setPct(String(x))} aria-pressed={n(pct) === x} style={chip(n(pct) === x)}>{x} %</button>)}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>Otro:
              <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} aria-label="Porcentaje" style={{ ...inp, width: 90 }} /> %
            </label>
          </div>
        )}
        {modo === 'monto' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[5000, 10000, 20000, 50000, 100000].map((x) => <button key={x} onClick={() => setMonto(String(x))} aria-pressed={n(monto) === x} style={chip(n(monto) === x)}>{subir ? '+' : '−'}{pesos(x)}</button>)}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>Otro monto: $
              <input inputMode="numeric" value={n(monto) ? n(monto).toLocaleString('es-CO') : ''} onChange={(e) => setMonto(e.target.value.replace(/\D/g, '').slice(0, 10))} aria-label="Monto" style={{ ...inp, width: 140 }} />
            </label>
          </div>
        )}
        {modo === 'fijo' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>Nuevo presupuesto: $
            <input inputMode="numeric" autoFocus value={n(fijo) ? n(fijo).toLocaleString('es-CO') : ''} onChange={(e) => setFijo(e.target.value.replace(/\D/g, '').slice(0, 10))} aria-label="Presupuesto diario" style={{ ...inp, width: 160 }} /> al día
          </label>
        )}
        <div style={{ background: 'var(--df-bg)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Queda en</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{pesos(nuevo)} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--df-text-muted)' }}>al día</span></div>
          {!sinCambio && <div style={{ fontSize: 12.5, fontWeight: 700, color: dif > 0 ? 'var(--df-brand-dark, #047857)' : 'var(--df-danger-dark, #b91c1c)' }}>{dif > 0 ? '▲ +' : '▼ −'}{pesos(Math.abs(dif))} ({dif > 0 ? '+' : '−'}{Math.abs(difPct)} %)</div>}
        </div>
        {errores.map((x) => <div key={x} style={{ fontSize: 12.5, color: 'var(--df-danger-dark, #b91c1c)' }}>⛔ {x}</div>)}
        {avisos.map((x) => <div key={x} style={{ fontSize: 12, color: 'var(--df-warning-dark, #92400e)', background: 'var(--df-warning-subtle, #fff7e6)', borderRadius: 8, padding: '6px 9px' }}>⚠️ {x}</div>)}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} style={btnS}>Cancelar</button>
          <button onClick={() => void onAplicar(nuevo)} disabled={!!errores.length || sinCambio} style={{ ...btnP, opacity: errores.length || sinCambio ? 0.5 : 1 }}>Aplicar en Meta</button>
        </div>
      </div>
    </div>
  );
}
