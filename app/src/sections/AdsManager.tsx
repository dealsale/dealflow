import { useEffect, useMemo, useState } from 'react';
import { confirmar, notificar } from '../components/dialogs';
import { ymdCO } from '../lib/fechaCO';
import {
  apiAdsBorrarRegla, apiAdsConfig, apiAdsEstado, apiAdsPanel, apiAdsPresupuesto, apiAdsRegla, apiAdsSincronizar, apiAdsSugerencia,
  type CampanaAds, type ConfigAds, type PanelAds, type ReglaAds, type SugerenciaAds,
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
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', borderTop: '1px solid var(--df-border)', fontSize: 12.5, whiteSpace: 'nowrap' };
const tdN: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const dec = (n: number) => (n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });

const PERIODOS: { k: string; label: string; dias: number }[] = [
  { k: 'hoy', label: 'Hoy', dias: 0 }, { k: 'ayer', label: 'Ayer', dias: -1 }, { k: '7d', label: '7 días', dias: 7 }, { k: '30d', label: '30 días', dias: 30 },
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
  const r = useMemo(() => rango(periodo), [periodo]);

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
          {PERIODOS.map((x) => <button key={x.k} onClick={() => setPeriodo(x.k)} style={{ ...btnS, ...(periodo === x.k ? { background: 'var(--df-text-strong, #0F172A)', color: '#fff', borderColor: 'transparent' } : {}) }}>{x.label}</button>)}
          <button onClick={() => void sincronizar()} disabled={sync || !p.conectada} style={{ ...btnS, opacity: sync || !p.conectada ? 0.6 : 1 }}>{sync ? 'Sincronizando…' : '↻ Sincronizar'}</button>
        </div>
      </div>

      {!p.conectada && (
        <div style={{ ...card, background: 'var(--df-warning-subtle)', borderColor: 'var(--df-warning)', fontSize: 13, lineHeight: 1.5 }}>
          ⚠️ {p.errorMeta || 'Conecta tu cuenta publicitaria.'} Ve a <b>Integraciones → Meta Ads</b> y dale «Conectar». Mientras tanto ves los chats y pedidos que llegaron por anuncios.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {kpis.map(([t, v, sub]) => (
          <div key={t} style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)' }}>{t}</div>
            <div style={{ fontSize: 21, fontWeight: 800, marginTop: 2, color: t === 'Utilidad estimada' && s.utilidad < 0 ? 'var(--df-danger-dark)' : undefined }}>{v}</div>
            {sub && <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 2 }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
        <div style={{ ...card, flex: '3 1 480px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>Gasto vs. ventas por día</b>
            <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>▮ gris = gasto · ▮ verde = ventas</span>
          </div>
          {p.serie.length ? (
            <div role="img" aria-label="Gasto y ventas por día" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, height: 160, borderBottom: '1px solid var(--df-border)' }}>
              {p.serie.map((x) => (
                <div key={x.fecha} title={`${x.fecha}: gasto ${pesos(x.gasto)} · ventas ${pesos(x.ventas)} · ${x.pedidos} pedidos`} style={{ flex: '1 1 0', maxWidth: 56, display: 'flex', gap: 2, alignItems: 'flex-end', height: '100%' }}>
                  <div style={{ flex: 1, height: `${(x.gasto / maxSerie) * 100}%`, background: '#CBD5E1', borderRadius: '3px 3px 0 0', minHeight: x.gasto ? 2 : 0 }} />
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

      {/* Campañas */}
      <div style={card}>
        <b style={{ fontSize: 14 }}>Campañas</b>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 10px' }}>Ventas = pedidos de DealFlow que llegaron por cada anuncio (WhatsApp, landing o Shopify). ROAS esperado = lo entregado + lo que va en camino × tu tasa de entrega.</div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--df-border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead><tr style={{ background: 'var(--df-bg)' }}>
              {['', 'Campaña', 'Presupuesto diario', 'Gasto', 'Chats', 'Pedidos', 'Entregados', 'Devol.', 'ROAS', 'ROAS esperado', 'Costo/venta', 'Utilidad'].map((h, i) => <th key={i} style={{ ...th, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {!p.campanas.length && <tr><td colSpan={12} style={{ ...td, color: 'var(--df-text-faint)' }}>No hay campañas {p.conectada ? 'en tu cuenta' : '(conecta Meta Ads)'}.</td></tr>}
              {p.campanas.map((c) => <FilaCampana key={c.id} c={c} abierta={!!abiertas[c.id]} onAbrir={() => setAbiertas((a) => ({ ...a, [c.id]: !a[c.id] }))} ocupado={ocupado}
                onEstado={cambiarEstado} onPres={cambiarPres} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Embudo por anuncio */}
      <div style={card}>
        <b style={{ fontSize: 14 }}>Embudo de WhatsApp por anuncio</b>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', margin: '2px 0 10px' }}>Dónde se cae cada anuncio: si trae chats que no compran, el problema es el anuncio o el mensaje; si compran pero devuelven, el producto o la ciudad.</div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--df-border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead><tr style={{ background: 'var(--df-bg)' }}>
              {['Anuncio', 'Gasto', 'Clics', 'Chats', 'Respondieron', 'Dieron datos', 'Pedidos', 'Entregados', 'Devueltos', 'CTR', 'Frecuencia', 'ROAS esperado'].map((h, i) => <th key={h} style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {!p.anuncios.length && <tr><td colSpan={12} style={{ ...td, color: 'var(--df-text-faint)' }}>Sin anuncios con gasto o chats en este periodo.</td></tr>}
              {p.anuncios.slice(0, 60).map((a) => (
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
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        {/* Ciudades */}
        <div style={{ ...card, flex: '1 1 380px', minWidth: 0 }}>
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
        <Reglas reglas={p.reglas} onCambio={cargar} />
      </div>

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
                  <span style={{ color: h.ok ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}> · {h.origen === 'manual' ? h.usuario || 'a mano' : h.origen === 'sugerencia' ? 'sugerencia' : 'regla automática'} · {new Date(h.creado.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{h.ok ? '' : ` · falló: ${h.error}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
const ACCION: Record<string, string> = { activar: 'activada', pausar: 'pausada', subir_presupuesto: 'presupuesto subido', bajar_presupuesto: 'presupuesto bajado', aviso: 'aviso' };

function FilaCampana({ c, abierta, onAbrir, ocupado, onEstado, onPres }: {
  c: CampanaAds; abierta: boolean; onAbrir: () => void; ocupado: string;
  onEstado: (id: string, nombre: string, activar: boolean) => void; onPres: (id: string, nombre: string, actual: number, factor: number) => void;
}) {
  const archivada = c.estado === 'ARCHIVED';
  const presBotones = (id: string, nombre: string, valor: number) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => onPres(id, nombre, valor, 0.9)} disabled={ocupado === 'pres' + id} aria-label={`Bajar 10% ${nombre}`} style={{ ...btnS, padding: '3px 8px' }}>−</button>
      <span style={{ minWidth: 76, textAlign: 'center', fontWeight: 700 }}>{pesos(valor)}</span>
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
