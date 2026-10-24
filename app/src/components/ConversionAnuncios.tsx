import { useEffect, useState } from 'react';
import { apiStatsAnuncios, type ConversionAnuncio } from '../lib/api';
import { fmt } from '../lib/format';
import { GroupedBars, PALETA } from './Charts';

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
type Orden = 'ventas' | 'chats' | 'conversion' | 'entregados';

/**
 * Conversión por anuncio: de cada pauta, el embudo completo (chats → respondieron →
 * pedidos → despachados → entregados), el dinero que dejó y los productos que vendió.
 */
export function ConversionAnuncios({ desde, hasta }: { desde: string; hasta: string }) {
  const [datos, setDatos] = useState<{ anuncios: ConversionAnuncio[]; organico: ConversionAnuncio | null } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<string>('');
  const [orden, setOrden] = useState<Orden>('ventas');
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    void apiStatsAnuncios(desde, hasta).then((r) => { if (vivo) { setCargando(false); if (r.data) setDatos(r.data); } });
    return () => { vivo = false; };
  }, [desde, hasta]);

  const filas = [...(datos?.anuncios || [])].sort((a, b) => (b[orden] as number) - (a[orden] as number) || b.chats - a.chats);
  const todas = datos?.organico ? [...filas, datos.organico] : filas;
  const tot = filas.reduce((a, f) => ({ chats: a.chats + f.chats, pedidos: a.pedidos + f.pedidos, ventas: a.ventas + f.ventas, entregados: a.entregados + f.entregados }), { chats: 0, pedidos: 0, ventas: 0, entregados: 0 });
  const th: React.CSSProperties = { textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--df-text-muted)', padding: '8px 8px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--df-border)' };
  const td: React.CSSProperties = { textAlign: 'right', fontSize: 13, padding: '9px 8px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--df-border)', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>📈 Conversión por anuncio</div>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden', flexWrap: 'wrap' }}>
          {([['ventas', 'Ventas'], ['chats', 'Chats'], ['conversion', 'Conversión'], ['entregados', 'Entregados']] as [Orden, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setOrden(k)} style={{ background: orden === k ? 'var(--df-brand)' : 'var(--df-surface)', color: orden === k ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '6px 11px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '4px 0 12px', lineHeight: 1.5 }}>
        Por cada anuncio: cuántos chats llegaron, cuántos respondieron, cuántos compraron, cuántos pedidos llegaron al cliente y qué productos vendió. Toca un anuncio para ver el detalle.
        {filas.length > 0 && <> En el periodo, los anuncios trajeron <b>{tot.chats}</b> chats, <b>{tot.pedidos}</b> pedidos (<b>{tot.chats ? Math.round((tot.pedidos / tot.chats) * 1000) / 10 : 0}%</b>) y <b>{fmt(tot.ventas)}</b>.</>}
      </div>
      {cargando && !datos ? <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: '18px 0' }}>Cargando…</div>
        : !todas.length ? <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: '18px 0' }}>Aún no hay chats ni pedidos en este periodo.</div>
        : (
          <div style={{ overflowX: 'auto', margin: '0 -6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Anuncio</th>
                  <th style={th} title="Chats que entraron por el anuncio">💬 Chats</th>
                  <th style={th} title="El cliente escribió 2 o más mensajes">Respondieron</th>
                  <th style={th}>🛒 Pedidos</th>
                  <th style={th} title="Pedidos ÷ chats">Conversión</th>
                  <th style={th}>🚚 Despachados</th>
                  <th style={th}>✅ Entregados</th>
                  <th style={th}>↩️ Devueltos</th>
                  <th style={th}>❌ Cancelados</th>
                  <th style={th}>💰 Ventas</th>
                  <th style={th} title="Dinero de pedidos entregados">Entregado $</th>
                </tr>
              </thead>
              <tbody>
                {todas.map((f, i) => (
                  <FilaAd key={f.id} f={f} color={f.id === 'organico' ? 'var(--df-text-faint)' : PALETA[i % PALETA.length]} abierto={abierto === f.id} onClick={() => setAbierto(abierto === f.id ? '' : f.id)} td={td} />
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function FilaAd({ f, color, abierto, onClick, td }: { f: ConversionAnuncio; color: string; abierto: boolean; onClick: () => void; td: React.CSSProperties }) {
  const [imgOk, setImgOk] = useState(true);
  const org = f.id === 'organico';
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  return (
    <>
      <tr onClick={onClick} style={{ cursor: 'pointer', background: abierto ? 'var(--df-bg)' : undefined }}>
        <td style={{ ...td, textAlign: 'left', maxWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: color, flexShrink: 0 }} />
            <span style={{ width: 36, height: 36, borderRadius: 7, overflow: 'hidden', background: 'var(--df-surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {f.media && imgOk ? <img src={f.media} alt="" onError={() => setImgOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 16 }}>{org ? '🌱' : '📢'}</span>}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.titular}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--df-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.producto ? `🏷️ ${f.producto}` : org ? 'Chats que no vinieron de una pauta' : f.canal || ' '}</span>
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--df-text-faint)', fontSize: 11 }}>{abierto ? '▲' : '▼'}</span>
          </div>
        </td>
        <td style={td}>{f.chats}</td>
        <td style={td}>{f.respondieron} <span style={{ color: 'var(--df-text-faint)', fontSize: 11 }}>{pct(f.respondieron, f.chats)}</span></td>
        <td style={{ ...td, fontWeight: 700 }}>{f.pedidos}</td>
        <td style={{ ...td, fontWeight: 800, color: f.conversion >= 20 ? 'var(--df-success)' : f.conversion >= 8 ? 'var(--df-warning-mid)' : 'var(--df-text-body)' }}>{f.conversion}%</td>
        <td style={td}>{f.despachados}</td>
        <td style={{ ...td, color: 'var(--df-success)', fontWeight: 700 }}>{f.entregados}</td>
        <td style={{ ...td, color: f.devueltos ? 'var(--df-danger)' : undefined }}>{f.devueltos}</td>
        <td style={{ ...td, color: 'var(--df-text-muted)' }}>{f.cancelados}</td>
        <td style={{ ...td, fontWeight: 800 }}>{fmt(f.ventas)}</td>
        <td style={td}>{fmt(f.ventasEntregadas)}</td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={11} style={{ padding: '12px 10px 16px', borderBottom: '1px solid var(--df-border)', background: 'var(--df-bg)' }}>
            <Detalle f={f} />
          </td>
        </tr>
      )}
    </>
  );
}

function Detalle({ f }: { f: ConversionAnuncio }) {
  const pasos = [
    { l: 'Chats', n: f.chats, c: PALETA[1] },
    { l: 'Respondieron', n: f.respondieron, c: PALETA[2] },
    { l: 'Pedidos', n: f.pedidos, c: PALETA[3] },
    { l: 'Despachados', n: f.despachados, c: PALETA[4] },
    { l: 'Entregados', n: f.entregados, c: '#10B981' },
  ];
  const max = Math.max(1, ...pasos.map((p) => p.n));
  const maxU = Math.max(1, ...f.productos.map((p) => p.unidades));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Embudo</div>
        {pasos.map((p, i) => (
          <div key={p.l} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{p.l}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{p.n}{i > 0 && pasos[i - 1].n ? <span style={{ color: 'var(--df-text-faint)', fontWeight: 600 }}> · {Math.round((p.n / pasos[i - 1].n) * 100)}%</span> : ''}</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: 'var(--df-surface-2)', overflow: 'hidden' }}>
              <div style={{ width: `${(p.n / max) * 100}%`, height: '100%', borderRadius: 999, background: p.c, transition: 'width .4s' }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          Ticket promedio <b>{fmt(f.ticket)}</b> · En camino <b>{f.enCamino}</b> · Tasa de entrega <b>{f.tasaEntrega ? `${f.tasaEntrega}%` : '—'}</b>
          {f.url && <> · <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--df-brand-dark)', fontWeight: 700 }}>Ver anuncio ↗</a></>}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Productos vendidos</div>
        {!f.productos.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-faint)' }}>Sin ventas en este periodo.</div>}
        {f.productos.slice(0, 8).map((p) => (
          <div key={p.nombre} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', fontSize: 12, gap: 8, marginBottom: 3 }}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
              <span style={{ fontWeight: 800 }}>{p.unidades} u.</span>
              <span style={{ color: 'var(--df-text-muted)' }}>{fmt(p.ventas)}</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: 'var(--df-surface-2)', overflow: 'hidden' }}>
              <div style={{ width: `${(p.unidades / maxU) * 100}%`, height: '100%', borderRadius: 999, background: PALETA[0] }} />
            </div>
          </div>
        ))}
      </div>
      {f.serie.length > 1 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Chats y pedidos por día</div>
          <GroupedBars alto={160} data={f.serie.map((d) => ({ fecha: d.fecha, chats: d.chats, pedidos: d.pedidos }))}
            series={[{ key: 'chats', label: 'Chats', color: PALETA[1] }, { key: 'pedidos', label: 'Pedidos', color: PALETA[3] }]} />
        </div>
      )}
    </div>
  );
}
