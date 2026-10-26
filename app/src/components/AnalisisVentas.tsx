import { useEffect, useState } from 'react';
import { useRecordado } from '../lib/rutas';
import { apiAnalisis, type Analisis, type FiltrosAnalisis } from '../lib/api';
import { fmt } from '../lib/format';
import { GroupedBars, Donut, PALETA } from './Charts';
import { Dropdown } from './Dropdown';

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', minWidth: 0 };
const titulo: React.CSSProperties = { fontWeight: 700, fontSize: 15, marginBottom: 10 };
const COLOR_CANAL: Record<string, string> = { whatsapp: '#10B981', messenger: '#3B82F6', instagram: '#EC4899', web: '#F59E0B', shopify: '#5E8E3E', landing: '#8B5CF6', manual: '#94A3B8' };
const COLOR_ESTADO: Record<string, string> = { Nuevo: '#3B82F6', Confirmado: '#6366F1', 'Guía generada': '#8B5CF6', 'En tránsito': '#F59E0B', 'En reparto': '#F97316', Novedad: '#EF4444', Entregado: '#10B981', Devuelto: '#DC2626', Cancelado: '#94A3B8' };
const money = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);

function Kpi({ label, valor, sub, color }: { label: string; valor: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: color || 'var(--df-text)' }}>{valor}</div>
      {sub && <div style={{ color: 'var(--df-text-faint)', fontSize: 11.5, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Ventas (área) contra inversión en Meta (línea), día por día. */
function VentasVsGasto({ serie }: { serie: Analisis['serie'] }) {
  const W = 720, H = 220, P = { l: 52, r: 12, t: 12, b: 26 };
  const max = Math.max(1, ...serie.map((d) => Math.max(d.ventas, d.gasto)));
  const x = (i: number) => P.l + (serie.length < 2 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (serie.length - 1));
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const linea = (k: 'ventas' | 'gasto') => serie.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ');
  const hayGasto = serie.some((d) => d.gasto > 0);
  const [hover, setHover] = useState<number | null>(null);
  if (!serie.some((d) => d.ventas || d.gasto)) return <div style={{ height: 160, display: 'grid', placeItems: 'center', color: 'var(--df-text-faint)', fontSize: 13 }}>Sin ventas en este periodo.</div>;
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const cada = Math.max(1, Math.ceil(serie.length / 8));
  const d = hover !== null ? serie[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
        {marcas.map((m) => <g key={m}><line x1={P.l} x2={W - P.r} y1={y(m)} y2={y(m)} stroke="var(--df-border)" strokeDasharray="3 4" /><text x={P.l - 6} y={y(m) + 4} textAnchor="end" fontSize="10.5" fill="var(--df-text-faint)">{money(m)}</text></g>)}
        <path d={`${linea('ventas')} L${x(serie.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`} fill={PALETA[0]} opacity={0.15} />
        <path d={linea('ventas')} fill="none" stroke={PALETA[0]} strokeWidth={2.4} strokeLinejoin="round" />
        {hayGasto && <path d={linea('gasto')} fill="none" stroke={PALETA[6]} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}
        {serie.map((s, i) => (i === serie.length - 1 || (i % cada === 0 && serie.length - 1 - i >= cada / 2)) && <text key={s.fecha} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--df-text-faint)">{s.fecha.slice(8)}/{s.fecha.slice(5, 7)}</text>)}
        {serie.map((s, i) => <rect key={s.fecha} x={x(i) - (W - P.l - P.r) / Math.max(1, serie.length) / 2} y={P.t} width={(W - P.l - P.r) / Math.max(1, serie.length)} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--df-text-faint)" />}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--df-text-muted)', marginTop: 4, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: PALETA[0], marginRight: 5 }} />Ventas</span>
        {hayGasto && <span><span style={{ display: 'inline-block', width: 14, borderTop: `2px dashed ${PALETA[6]}`, marginRight: 5, verticalAlign: 'middle' }} />Inversión en Meta</span>}
        {d && <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--df-text-body)' }}>{d.fecha}: {fmt(d.ventas)} en {d.pedidos} pedidos{hayGasto ? ` · gasto ${fmt(d.gasto)}${d.gasto ? ` · ROAS ${Math.round((d.ventas / d.gasto) * 100) / 100}x` : ''}` : ''} · {d.chats} chats</span>}
      </div>
    </div>
  );
}

/** Barras horizontales con valor y detalle. */
function Barras({ filas, color = PALETA[0], onClick }: { filas: { k: string; label: string; valor: number; texto: string; sub?: string }[]; color?: string; onClick?: (k: string) => void }) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  if (!filas.length) return <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: '14px 0' }}>Sin datos en este periodo.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {filas.map((f) => (
        <div key={f.k} onClick={onClick ? () => onClick(f.k) : undefined} title={onClick ? 'Filtrar por esto' : undefined} style={{ cursor: onClick ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
            <span style={{ fontWeight: 800 }}>{f.texto}</span>
            {f.sub && <span style={{ color: 'var(--df-text-muted)', fontSize: 11.5 }}>{f.sub}</span>}
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--df-surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${(f.valor / max) * 100}%`, height: '100%', borderRadius: 999, background: color, transition: 'width .4s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Columnas verticales (hora del día / día de la semana). */
function Columnas({ datos, color, etiqueta }: { datos: { label: string; valor: number; extra?: string }[]; color: string; etiqueta: string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const top = datos.reduce((a, d) => (d.valor > a.valor ? d : a), datos[0]);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
        {datos.map((d) => (
          <div key={d.label} title={`${d.label}: ${d.valor} ${etiqueta}${d.extra ? ` · ${d.extra}` : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ width: '100%', height: `${(d.valor / max) * 100}%`, minHeight: d.valor ? 3 : 0, background: d === top && d.valor ? color : `${color}99`, borderRadius: '4px 4px 0 0', transition: 'height .4s' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {datos.map((d, i) => <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--df-text-faint)' }}>{datos.length > 12 ? (i % 3 === 0 ? d.label : '') : d.label}</div>)}
      </div>
      {top?.valor > 0 && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 6 }}>Pico: <b>{top.label}</b> con {top.valor} {etiqueta}.</div>}
    </div>
  );
}

const NOMBRE_CANAL: Record<string, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', web: 'Chat web', shopify: 'Shopify', landing: 'Tienda en línea', manual: 'Manual' };
/** Pesos abreviados para el centro de las donas: $15,7 M · $420 mil. */
const pesosCorto = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1).replace('.', ',')} M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)} mil` : `$${Math.round(n)}`);

/**
 * Análisis de ventas con filtros cruzados: todo (KPI y gráficas) responde a los filtros.
 * Tocar una barra (producto, ciudad, estado, canal) filtra por eso.
 */
export function AnalisisVentas({ desde, hasta }: { desde: string; hasta: string }) {
  const [f, setF] = useRecordado<FiltrosAnalisis>('stats:filtros', {});
  const [a, setA] = useState<Analisis | null>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    void apiAnalisis(desde, hasta, f).then((r) => { if (vivo) { setCargando(false); if (r.data) setA(r.data); } });
    return () => { vivo = false; };
  }, [desde, hasta, f]);
  const poner = (k: keyof FiltrosAnalisis, v: string) => setF((x) => ({ ...x, [k]: v || undefined, ...(k === 'campana' ? { ad: undefined } : {}) }));
  const activos = Object.entries(f).filter(([, v]) => v);
  const o = a?.opciones;
  const k = a?.kpis;
  const sel = (k2: keyof FiltrosAnalisis, label: string, opciones: { value: string; label: string }[], ancho = 170) => (
    <div style={{ minWidth: ancho, flex: `0 1 ${ancho}px` }}>
      <Dropdown ariaLabel={label} buscar={opciones.length > 8} value={f[k2] || ''} onChange={(v) => poner(k2, v)} options={[{ value: '', label }, ...opciones]} />
    </div>
  );
  const nombreFiltro = (k2: string, v: string) => {
    if (k2 === 'producto') return o?.productos.find((p) => p.id === v)?.nombre || v;
    if (k2 === 'campana') return o?.campanas.find((c) => c.id === v)?.nombre || v;
    if (k2 === 'ad') return o?.anuncios.find((c) => c.id === v)?.nombre || v;
    if (k2 === 'canal') return NOMBRE_CANAL[v] || v;
    if (k2 === 'origen') return v === 'anuncio' ? 'Desde anuncios' : 'Orgánico';
    return v;
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Barra de filtros */}
      <div style={{ ...card, marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--df-text-muted)' }}>🔎 Filtrar:</span>
          {sel('origen', 'Todo origen', [{ value: 'anuncio', label: '📢 Desde anuncios' }, { value: 'organico', label: '🌱 Orgánico' }], 150)}
          {sel('canal', 'Todos los canales', (o?.canales || []).map((c) => ({ value: c, label: NOMBRE_CANAL[c] || c })), 160)}
          {sel('producto', 'Todos los productos', (o?.productos || []).map((p) => ({ value: p.id, label: p.nombre })), 190)}
          {(o?.campanas.length || 0) > 0 && sel('campana', 'Todas las campañas', (o?.campanas || []).map((c) => ({ value: c.id, label: c.nombre })), 190)}
          {(o?.anuncios.length || 0) > 0 && sel('ad', 'Todos los anuncios', (o?.anuncios || []).map((c) => ({ value: c.id, label: c.nombre })), 190)}
          {sel('ciudad', 'Todas las ciudades', (o?.ciudades || []).map((c) => ({ value: c, label: c })), 170)}
          {sel('estado', 'Todos los estados', (o?.estados || []).map((c) => ({ value: c, label: c })), 160)}
          {cargando && <span style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Actualizando…</span>}
        </div>
        {activos.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            {activos.map(([k2, v]) => (
              <span key={k2} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--df-brand-subtle, var(--df-bg))', color: 'var(--df-brand-dark)', border: '1px solid var(--df-brand-border, var(--df-border))', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                {nombreFiltro(k2, String(v))}
                <button onClick={() => poner(k2 as keyof FiltrosAnalisis, '')} aria-label="Quitar filtro" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 13, lineHeight: 1 }}>✕</button>
              </span>
            ))}
            <button onClick={() => setF({})} style={{ background: 'none', border: 'none', color: 'var(--df-text-muted)', fontWeight: 700, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Quitar todos</button>
            {(f.ciudad || f.estado) && (k?.gasto || 0) > 0 && <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>El gasto de Meta no se puede separar por ciudad ni por estado: se muestra el total de los anuncios.</span>}
          </div>
        )}
      </div>

      {!a ? <div style={{ ...card, textAlign: 'center', color: 'var(--df-text-muted)', padding: '48px 20px' }}>Cargando análisis…</div> : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Kpi label="💰 Ventas" valor={fmt(k!.ventas)} sub={`${k!.unidades} unidades · ticket ${fmt(k!.ticket)}`} color="var(--df-brand-dark)" />
            <Kpi label="🛒 Pedidos" valor={String(k!.pedidos)} sub={`${k!.cancelados} cancelados`} color="var(--df-warning-mid)" />
            <Kpi label="💬 Chats" valor={String(k!.chats)} sub={`${k!.chatsAnuncio} de anuncios · ${k!.respondieron} respondieron`} />
            <Kpi label="📈 Conversión" valor={`${k!.conversion}%`} sub="pedidos ÷ chats" />
            <Kpi label="✅ Entregados" valor={String(k!.entregados)} sub={`${fmt(k!.ventasEntregadas)} · tasa ${k!.tasaEntrega || 0}%`} color="var(--df-success)" />
            <Kpi label="↩️ Devueltos" valor={String(k!.devueltos)} sub={`${k!.despachados} despachados`} color={k!.devueltos ? 'var(--df-danger)' : undefined} />
            {k!.gasto > 0 && <Kpi label="💸 Inversión Meta" valor={fmt(k!.gasto)} sub={`${fmt(k!.costoChat)} por chat · ${fmt(k!.costoPedido)} por pedido`} />}
            {k!.gasto > 0 && <Kpi label="🎯 ROAS" valor={`${k!.roas}x`} sub="ventas ÷ inversión" color={k!.roas >= 3 ? 'var(--df-success)' : k!.roas >= 1.5 ? 'var(--df-warning-mid)' : 'var(--df-danger)'} />}
          </div>

          <div style={{ ...card, marginBottom: 14 }}>
            <div style={titulo}>Ventas{k!.gasto > 0 ? ' vs. inversión en Meta' : ''} por día</div>
            <VentasVsGasto serie={a.serie} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <div style={titulo}>Chats, pedidos y entregados por día</div>
              <GroupedBars data={a.serie.map((d) => ({ fecha: d.fecha, chats: d.chats, pedidos: d.pedidos, entregados: d.entregados }))}
                series={[{ key: 'chats', label: 'Chats', color: PALETA[1] }, { key: 'pedidos', label: 'Pedidos', color: PALETA[3] }, { key: 'entregados', label: 'Entregados', color: PALETA[0] }]} />
            </div>
            <div style={card}>
              <div style={titulo}>Embudo</div>
              <Barras filas={a.embudo.map((e, i) => ({ k: e.paso, label: e.paso, valor: e.n, texto: String(e.n), sub: i && a.embudo[i - 1].n ? `${Math.round((e.n / a.embudo[i - 1].n) * 100)}%` : undefined }))} color={PALETA[2]} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <div style={titulo}>🏷️ Productos más vendidos</div>
              <Barras filas={a.porProducto.slice(0, 10).map((p) => ({ k: p.id || p.nombre, label: p.nombre, valor: p.ventas, texto: fmt(p.ventas), sub: `${p.unidades} u.` }))}
                onClick={(id) => { if (o?.productos.some((p) => p.id === id)) poner('producto', id); }} />
            </div>
            <div style={card}>
              <div style={titulo}>📍 Ciudades</div>
              <Barras filas={a.porCiudad.slice(0, 10).map((c) => ({ k: c.ciudad, label: c.ciudad, valor: c.pedidos, texto: `${c.pedidos} ped.`, sub: `${fmt(c.ventas)}${c.devueltos ? ` · ${c.devueltos} dev.` : ''}` }))} color={PALETA[1]}
                onClick={(c) => c !== '—' && poner('ciudad', c)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <div style={titulo}>Pedidos por estado</div>
              <Donut data={a.porEstado.map((e) => ({ label: e.estado, valor: e.n, color: COLOR_ESTADO[e.estado] || PALETA[5] }))} />
            </div>
            <div style={card}>
              <div style={titulo}>Ventas por canal</div>
              <Donut formato={fmt} corto={pesosCorto} data={a.porCanal.map((c) => ({ label: NOMBRE_CANAL[c.canal] || c.canal, valor: c.ventas, color: COLOR_CANAL[c.canal] || PALETA[5] }))} />
            </div>
            <div style={card}>
              <div style={titulo}>Anuncios vs. orgánico</div>
              <Donut formato={fmt} corto={pesosCorto} data={[{ label: 'Desde anuncios', valor: a.porOrigen.anuncio.ventas, color: PALETA[1] }, { label: 'Orgánico', valor: a.porOrigen.organico.ventas, color: PALETA[0] }]} />
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                Anuncios: {a.porOrigen.anuncio.chats} chats · {a.porOrigen.anuncio.pedidos} pedidos<br />Orgánico: {a.porOrigen.organico.chats} chats · {a.porOrigen.organico.pedidos} pedidos
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <div style={card}>
              <div style={titulo}>🕐 Pedidos por hora del día</div>
              <Columnas datos={a.porHora.map((h) => ({ label: `${h.h}h`, valor: h.pedidos, extra: `${h.chats} chats` }))} color={PALETA[3]} etiqueta="pedidos" />
            </div>
            <div style={card}>
              <div style={titulo}>📅 Ventas por día de la semana</div>
              <Columnas datos={a.porSemana.map((d) => ({ label: d.dia, valor: d.pedidos, extra: fmt(d.ventas) }))} color={PALETA[0]} etiqueta="pedidos" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
