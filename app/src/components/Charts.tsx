import { useState } from 'react';

/**
 * Gráficos livianos en SVG (sin dependencias) para la pestaña de Estadísticas.
 * Todos son responsivos (viewBox + width 100%), respetan los temas con los
 * tokens --df-* y tienen interacción al pasar el mouse.
 */

// Paleta categórica accesible (funciona en claro, oscuro y premium).
export const PALETA = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6', '#EF4444', '#6366F1'];

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const miles = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));

/** Etiqueta corta de fecha "12 sep" a partir de YYYY-MM-DD. */
function diaCorto(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
}

const tooltipBox: React.CSSProperties = {
  position: 'absolute', pointerEvents: 'none', background: 'var(--df-text)', color: 'var(--df-surface)',
  fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '6px 9px', whiteSpace: 'nowrap',
  transform: 'translate(-50%, -115%)', zIndex: 5, boxShadow: '0 4px 14px rgba(0,0,0,.25)',
};

/** Gráfico de área/línea para una serie temporal (ej. ventas por día). */
export function LineChart({ data, color = PALETA[0], formato = 'num', alto = 220 }: {
  data: { fecha: string; valor: number }[];
  color?: string;
  formato?: 'money' | 'num';
  alto?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = alto, padL = 8, padR = 8, padT = 14, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const fmt = formato === 'money' ? money : (n: number) => String(Math.round(n));
  if (!data.length) return <SinDatos alto={alto} />;
  const max = Math.max(1, ...data.map((d) => d.valor));
  const x = (i: number) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => padT + ih - (v / max) * ih;
  const pts = data.map((d, i) => `${x(i)},${y(d.valor)}`).join(' ');
  const area = `${padL},${padT + ih} ${pts} ${padL + iw},${padT + ih}`;
  // Cuántas etiquetas de fecha caben sin amontonarse.
  const paso = Math.ceil(data.length / 8);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`g-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* rejilla horizontal */}
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={padL} x2={padL + iw} y1={padT + ih * f} y2={padT + ih * f} stroke="var(--df-border)" strokeWidth="1" />
        ))}
        <polygon points={area} fill={`url(#g-${color.slice(1)})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i}>
            {hover === i && <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + ih} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity={0.6} />}
            <circle cx={x(i)} cy={y(d.valor)} r={hover === i ? 4.5 : 0} fill={color} stroke="var(--df-surface)" strokeWidth="2" />
            {/* zona de hover ancha e invisible */}
            <rect x={x(i) - iw / (data.length * 2 || 1)} y={padT} width={Math.max(6, iw / (data.length || 1))} height={ih} fill="transparent"
              onMouseEnter={() => setHover(i)} />
            {i % paso === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--df-text-faint)">{diaCorto(d.fecha)}</text>
            )}
          </g>
        ))}
      </svg>
      {hover !== null && data[hover] && (
        <div style={{ ...tooltipBox, left: `${(x(hover) / W) * 100}%`, top: (y(data[hover].valor) / H) * 100 + '%' }}>
          {diaCorto(data[hover].fecha)} · {fmt(data[hover].valor)}
        </div>
      )}
    </div>
  );
}

/** Barras agrupadas para dos series por día (ej. chats vs pedidos). */
export function GroupedBars({ data, series, alto = 220 }: {
  data: { fecha: string; [k: string]: number | string }[];
  series: { key: string; label: string; color: string }[];
  alto?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = alto, padL = 8, padR = 8, padT = 14, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  if (!data.length) return <SinDatos alto={alto} />;
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const grupo = iw / data.length;
  const bw = Math.max(2, Math.min(18, (grupo * 0.7) / series.length));
  const paso = Math.ceil(data.length / 8);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--df-text-muted)', fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={padL} x2={padL + iw} y1={padT + ih * f} y2={padT + ih * f} stroke="var(--df-border)" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const cx = padL + grupo * i + grupo / 2;
          const totalW = bw * series.length + 2 * (series.length - 1);
          return (
            <g key={i}>
              {hover === i && <rect x={cx - grupo / 2} y={padT} width={grupo} height={ih} fill="var(--df-surface-2)" opacity={0.6} onMouseEnter={() => setHover(i)} />}
              {series.map((s, si) => {
                const v = Number(d[s.key]) || 0;
                const bh = (v / max) * ih;
                const bx = cx - totalW / 2 + si * (bw + 2);
                return <rect key={s.key} x={bx} y={padT + ih - bh} width={bw} height={bh} rx={2} fill={s.color} />;
              })}
              <rect x={cx - grupo / 2} y={padT} width={grupo} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
              {i % paso === 0 && <text x={cx} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--df-text-faint)">{diaCorto(d.fecha)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div style={{ ...tooltipBox, position: 'relative', display: 'inline-block', transform: 'none', margin: '4px auto 0', textAlign: 'center', pointerEvents: 'auto' }}>
          <strong>{diaCorto(String(data[hover].fecha))}</strong>
          {series.map((s) => <span key={s.key} style={{ marginLeft: 10 }}>{s.label}: {Number(data[hover][s.key]) || 0}</span>)}
        </div>
      )}
    </div>
  );
}

/** Dona con leyenda (ej. chats por canal). */
export function Donut({ data, alto = 200 }: { data: { label: string; valor: number; color: string }[]; alto?: number }) {
  const total = data.reduce((a, d) => a + d.valor, 0);
  if (!total) return <SinDatos alto={alto} />;
  const R = 80, r = 50, cx = 100, cy = 100;
  let ang = -Math.PI / 2;
  const arcs = data.filter((d) => d.valor > 0).map((d) => {
    const frac = d.valor / total;
    const a0 = ang, a1 = ang + frac * Math.PI * 2;
    ang = a1;
    const large = frac > 0.5 ? 1 : 0;
    const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    const dPath = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
    return { d, dPath, frac };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg viewBox="0 0 200 200" width={alto} height={alto} style={{ maxWidth: '45%' }}>
        {arcs.map((a, i) => <path key={i} d={a.dPath} fill={a.d.color}><title>{a.d.label}: {a.d.valor}</title></path>)}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--df-text)">{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="var(--df-text-muted)">total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 120 }}>
        {data.filter((d) => d.valor > 0).map((d) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--df-text-body)', textTransform: 'capitalize' }}>{d.label}</span>
            <span style={{ fontWeight: 700 }}>{d.valor}</span>
            <span style={{ color: 'var(--df-text-faint)', fontSize: 12, width: 40, textAlign: 'right' }}>{Math.round((d.valor / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontales con valor (ej. top anuncios por chats). */
export function HBars({ data }: { data: { label: string; valor: number; sub?: string; color?: string }[] }) {
  if (!data.length) return <SinDatos alto={140} />;
  const max = Math.max(1, ...data.map((d) => d.valor));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--df-text-body)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.label}>{d.label}</span>
            {d.sub && <span style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>{d.sub}</span>}
            <span style={{ fontSize: 13, fontWeight: 800 }}>{d.valor}</span>
          </div>
          <div style={{ height: 9, borderRadius: 999, background: 'var(--df-surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${(d.valor / max) * 100}%`, height: '100%', borderRadius: 999, background: d.color || PALETA[i % PALETA.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface AnuncioStat { id: string; titular: string; canal: string; url: string; media: string; chats: number; ventas: number; pedidos: number }

/** Top de anuncios con miniatura, barra (por chats o por ventas) y clic para abrir. */
export function TopAnuncios({ data, orden = 'chats' }: { data: AnuncioStat[]; orden?: 'chats' | 'ventas' }) {
  if (!data.length) return <SinDatos alto={140} />;
  const val = (d: AnuncioStat) => (orden === 'ventas' ? d.ventas : d.chats);
  const filas = [...data].sort((a, b) => val(b) - val(a));
  const max = Math.max(1, ...filas.map(val));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {filas.map((d, i) => (
        <AdRow key={d.id || i} d={d} color={PALETA[i % PALETA.length]} pct={(val(d) / max) * 100} orden={orden} />
      ))}
    </div>
  );
}

function AdRow({ d, color, pct, orden }: { d: AnuncioStat; color: string; pct: number; orden: 'chats' | 'ventas' }) {
  const [imgOk, setImgOk] = useState(true);
  const clickable = !!d.url;
  const abrir = () => { if (d.url) window.open(d.url, '_blank', 'noopener'); };
  return (
    <div
      onClick={clickable ? abrir : undefined}
      title={clickable ? 'Abrir el anuncio' : d.titular}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: 8, borderRadius: 10,
        border: '1px solid var(--df-border)', background: 'var(--df-surface)',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      {/* Miniatura del anuncio (o marcador si no hay imagen / falla la carga). */}
      <div style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0, background: 'var(--df-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {d.media && imgOk
          ? <img src={d.media} alt="" onError={() => setImgOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 20 }}>📢</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--df-text-body)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.titular}</span>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{orden === 'ventas' ? money(d.ventas) : d.chats}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--df-surface-2)', overflow: 'hidden', margin: '5px 0 4px' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: color }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 600 }}>💬 {d.chats}</span>
          <span style={{ fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 600 }}>🛒 {d.pedidos}</span>
          <span style={{ fontSize: 11, color: 'var(--df-text-muted)', fontWeight: 600 }}>💰 {money(d.ventas)}</span>
          {clickable && <span style={{ fontSize: 11, color: 'var(--df-brand-dark)', fontWeight: 700, marginLeft: 'auto' }}>Ver anuncio ↗</span>}
        </div>
      </div>
    </div>
  );
}

function SinDatos({ alto }: { alto: number }) {
  return (
    <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--df-text-faint)', fontSize: 13 }}>
      Sin datos en este rango.
    </div>
  );
}

export { money as fmtMoney, miles as fmtMiles };
