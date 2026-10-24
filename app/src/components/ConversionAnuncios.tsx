import { useEffect, useState } from 'react';
import { apiStatsAnuncios, apiSincronizarAnuncios, type ConversionAnuncio, type EstadoMetaAds } from '../lib/api';
import { fmt } from '../lib/format';
import { GroupedBars, PALETA } from './Charts';
import { enProceso } from './Proceso';

const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
type Orden = 'ventas' | 'chats' | 'conversion' | 'entregados' | 'gasto' | 'roas';
type Nivel = 'anuncio' | 'conjunto' | 'campana';

/** Recalcula los indicadores derivados de una fila (tras sumar varias). */
function derivar(f: ConversionAnuncio): ConversionAnuncio {
  const efectivos = f.pedidos - f.cancelados;
  const cerrados = f.entregados + f.devueltos;
  return {
    ...f,
    conversion: f.chats ? Math.round((f.pedidos / f.chats) * 1000) / 10 : 0,
    ticket: efectivos ? Math.round(f.ventas / efectivos) : 0,
    tasaEntrega: cerrados ? Math.round((f.entregados / cerrados) * 1000) / 10 : 0,
    costoChat: f.gasto && f.chats ? Math.round(f.gasto / f.chats) : 0,
    costoPedido: f.gasto && efectivos ? Math.round(f.gasto / efectivos) : 0,
    costoEntregado: f.gasto && f.entregados ? Math.round(f.gasto / f.entregados) : 0,
    roas: f.gasto ? Math.round((f.ventas / f.gasto) * 100) / 100 : 0,
  };
}

/** Agrupa los anuncios por conjunto o campaña (sumando todo). */
function agrupar(filas: ConversionAnuncio[], nivel: Nivel): ConversionAnuncio[] {
  if (nivel === 'anuncio') return filas;
  const grupos = new Map<string, ConversionAnuncio>();
  const sumables = ['chats', 'respondieron', 'pedidos', 'confirmados', 'despachados', 'enCamino', 'entregados', 'devueltos', 'cancelados', 'ventas', 'ventasEntregadas', 'gasto', 'impresiones', 'clics', 'conversacionesMeta'] as const;
  for (const f of filas) {
    const id = (nivel === 'campana' ? f.campaignId : f.adsetId) || `sin-${f.id}`;
    const nombre = (nivel === 'campana' ? f.campaignName : f.adsetName) || f.titular;
    let g = grupos.get(id);
    if (!g) {
      g = { ...f, id, titular: nombre, producto: nivel === 'conjunto' ? f.campaignName : '', media: f.media, productos: [], serie: f.serie.map((d) => ({ ...d, chats: 0, pedidos: 0, ventas: 0, gasto: 0 })) };
      for (const k of sumables) g[k] = 0;
      grupos.set(id, g);
    }
    for (const k of sumables) g[k] += f[k];
    f.serie.forEach((d, i) => { if (g!.serie[i]) { g!.serie[i].chats += d.chats; g!.serie[i].pedidos += d.pedidos; g!.serie[i].ventas += d.ventas; g!.serie[i].gasto += d.gasto; } });
    for (const p of f.productos) {
      const x = g.productos.find((y) => y.nombre === p.nombre);
      if (x) { x.unidades += p.unidades; x.ventas += p.ventas; } else g.productos.push({ ...p });
    }
  }
  return [...grupos.values()].map((g) => derivar({ ...g, productos: g.productos.sort((a, b) => b.unidades - a.unidades) }));
}

/**
 * Conversión por anuncio: de cada pauta, el embudo completo (chats → respondieron →
 * pedidos → despachados → entregados), el dinero que dejó, los productos que vendió y,
 * con el Administrador de anuncios conectado, cuánto costó (costo por chat, por pedido y ROAS).
 */
export function ConversionAnuncios({ desde, hasta }: { desde: string; hasta: string }) {
  const [datos, setDatos] = useState<{ anuncios: ConversionAnuncio[]; organico: ConversionAnuncio | null; meta: EstadoMetaAds } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<string>('');
  const [orden, setOrden] = useState<Orden>('ventas');
  const [nivel, setNivel] = useState<Nivel>('anuncio');
  const [msg, setMsg] = useState('');
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    void apiStatsAnuncios(desde, hasta).then((r) => { if (vivo) { setCargando(false); if (r.data) setDatos(r.data); } });
    return () => { vivo = false; };
  }, [desde, hasta, recarga]);

  const sincronizar = async () => {
    setMsg('');
    const dias = Math.min(90, Math.max(3, Math.round((Date.now() - new Date(desde + 'T12:00:00Z').getTime()) / 86400000) + 1));
    const r = await enProceso('Trayendo el gasto y los resultados de Meta…', () => apiSincronizarAnuncios(dias));
    setMsg(r.error ? `⚠️ ${r.error}` : `✓ Listo: ${r.data?.filas ?? 0} registros de Meta actualizados.`);
    setRecarga((n) => n + 1);
  };

  const meta = datos?.meta;
  const conGasto = (datos?.anuncios || []).some((f) => f.gasto > 0);
  const filas = agrupar(datos?.anuncios || [], nivel).sort((a, b) => (b[orden] as number) - (a[orden] as number) || b.chats - a.chats);
  const todas = datos?.organico && nivel === 'anuncio' ? [...filas, datos.organico] : filas;
  const tot = derivar(filas.reduce((a, f) => ({ ...a, chats: a.chats + f.chats, pedidos: a.pedidos + f.pedidos, cancelados: a.cancelados + f.cancelados, ventas: a.ventas + f.ventas, entregados: a.entregados + f.entregados, devueltos: a.devueltos + f.devueltos, gasto: a.gasto + f.gasto }), { ...(filas[0] || ({} as ConversionAnuncio)), chats: 0, pedidos: 0, cancelados: 0, ventas: 0, entregados: 0, devueltos: 0, gasto: 0 }));
  const th: React.CSSProperties = { textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--df-text-muted)', padding: '8px 8px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--df-border)' };
  const td: React.CSSProperties = { textAlign: 'right', fontSize: 13, padding: '9px 8px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--df-border)', fontVariantNumeric: 'tabular-nums' };
  const seg = (activo: boolean): React.CSSProperties => ({ background: activo ? 'var(--df-brand)' : 'var(--df-surface)', color: activo ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '6px 11px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' });
  const ordenes: [Orden, string][] = [['ventas', 'Ventas'], ['chats', 'Chats'], ['conversion', 'Conversión'], ['entregados', 'Entregados'], ...(conGasto ? [['gasto', 'Gasto'], ['roas', 'ROAS']] as [Orden, string][] : [])];

  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>📈 Conversión por anuncio</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden' }}>
            {([['anuncio', 'Anuncio'], ['conjunto', 'Conjunto'], ['campana', 'Campaña']] as [Nivel, string][]).map(([k, l]) => (
              <button key={k} onClick={() => { setNivel(k); setAbierto(''); }} disabled={k !== 'anuncio' && !conGasto} title={k !== 'anuncio' && !conGasto ? 'Conecta el Administrador de anuncios para agrupar por conjunto o campaña' : ''} style={{ ...seg(nivel === k), opacity: k !== 'anuncio' && !conGasto ? 0.5 : 1 }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden', flexWrap: 'wrap' }}>
            {ordenes.map(([k, l]) => <button key={k} onClick={() => setOrden(k)} style={seg(orden === k)}>{l}</button>)}
          </div>
        </div>
      </div>

      {/* Estado del Administrador de anuncios */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, margin: '8px 0 4px', color: 'var(--df-text-muted)' }}>
        {meta?.conectada ? (
          <>
            <span style={{ fontWeight: 700, color: meta.error ? 'var(--df-danger)' : 'var(--df-success)' }}>● Meta Ads{meta.cuenta ? `: ${meta.cuenta}` : ''}</span>
            <span>{meta.error ? meta.error : meta.ultima ? `actualizado ${new Date(meta.ultima.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })} · se actualiza solo cada hora` : 'aún no se ha sincronizado'}</span>
            <button onClick={() => void sincronizar()} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--df-brand-dark)', fontWeight: 700, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>↻ Traer ahora</button>
          </>
        ) : (
          <span>💡 Conecta tu <b>Administrador de anuncios</b> en Marketing para ver aquí el gasto, el costo por chat, el costo por pedido y el ROAS de cada anuncio.</span>
        )}
        {msg && <span style={{ color: msg.startsWith('✓') ? 'var(--df-success)' : 'var(--df-danger)' }}>{msg}</span>}
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '4px 0 12px', lineHeight: 1.5 }}>
        Por cada anuncio: cuántos chats llegaron, cuántos respondieron, cuántos compraron, cuántos pedidos llegaron al cliente y qué productos vendió. Toca una fila para ver el detalle.
        {filas.length > 0 && <> En el periodo, los anuncios trajeron <b>{tot.chats}</b> chats, <b>{tot.pedidos}</b> pedidos (<b>{tot.conversion}%</b>) y <b>{fmt(tot.ventas)}</b>{tot.gasto > 0 && <> con una inversión de <b>{fmt(tot.gasto)}</b>: <b>{fmt(tot.costoChat)}</b> por chat, <b>{fmt(tot.costoPedido)}</b> por pedido y ROAS <b>{tot.roas}x</b></>}.</>}
      </div>
      {cargando && !datos ? <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: '18px 0' }}>Cargando…</div>
        : !todas.length ? <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: '18px 0' }}>Aún no hay chats ni pedidos en este periodo.</div>
        : (
          <div style={{ overflowX: 'auto', margin: '0 -6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: conGasto ? 1180 : 860 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>{nivel === 'campana' ? 'Campaña' : nivel === 'conjunto' ? 'Conjunto de anuncios' : 'Anuncio'}</th>
                  {conGasto && <th style={th} title="Inversión en Meta en el periodo">💸 Gasto</th>}
                  <th style={th} title="Chats que entraron por el anuncio">💬 Chats</th>
                  {conGasto && <th style={th} title="Gasto ÷ chats">Costo/chat</th>}
                  <th style={th} title="El cliente escribió 2 o más mensajes">Respondieron</th>
                  <th style={th}>🛒 Pedidos</th>
                  <th style={th} title="Pedidos ÷ chats">Conversión</th>
                  {conGasto && <th style={th} title="Gasto ÷ pedidos (sin cancelados)">Costo/pedido</th>}
                  <th style={th}>🚚 Despachados</th>
                  <th style={th}>✅ Entregados</th>
                  <th style={th}>↩️ Devueltos</th>
                  <th style={th}>❌ Cancelados</th>
                  <th style={th}>💰 Ventas</th>
                  <th style={th} title="Dinero de pedidos entregados">Entregado $</th>
                  {conGasto && <th style={th} title="Ventas ÷ gasto: cuántos pesos vendiste por cada peso invertido">ROAS</th>}
                </tr>
              </thead>
              <tbody>
                {todas.map((f, i) => (
                  <FilaAd key={f.id} f={f} conGasto={conGasto} color={f.id === 'organico' ? 'var(--df-text-faint)' : PALETA[i % PALETA.length]} abierto={abierto === f.id} onClick={() => setAbierto(abierto === f.id ? '' : f.id)} td={td} />
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function FilaAd({ f, color, abierto, onClick, td, conGasto }: { f: ConversionAnuncio; color: string; abierto: boolean; onClick: () => void; td: React.CSSProperties; conGasto: boolean }) {
  const [imgOk, setImgOk] = useState(true);
  const org = f.id === 'organico';
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  const dinero = (n: number) => (n ? fmt(n) : '—');
  const sub = f.producto ? `🏷️ ${f.producto}` : org ? 'Chats que no vinieron de una pauta' : f.campaignName && f.campaignName !== f.titular ? `📣 ${f.campaignName}` : f.canal || ' ';
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
              <span style={{ display: 'block', fontSize: 11, color: 'var(--df-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--df-text-faint)', fontSize: 11 }}>{abierto ? '▲' : '▼'}</span>
          </div>
        </td>
        {conGasto && <td style={{ ...td, fontWeight: 700 }}>{dinero(f.gasto)}</td>}
        <td style={td}>{f.chats}</td>
        {conGasto && <td style={td}>{dinero(f.costoChat)}</td>}
        <td style={td}>{f.respondieron} <span style={{ color: 'var(--df-text-faint)', fontSize: 11 }}>{pct(f.respondieron, f.chats)}</span></td>
        <td style={{ ...td, fontWeight: 700 }}>{f.pedidos}</td>
        <td style={{ ...td, fontWeight: 800, color: f.conversion >= 20 ? 'var(--df-success)' : f.conversion >= 8 ? 'var(--df-warning-mid)' : 'var(--df-text-body)' }}>{f.conversion}%</td>
        {conGasto && <td style={td}>{dinero(f.costoPedido)}</td>}
        <td style={td}>{f.despachados}</td>
        <td style={{ ...td, color: 'var(--df-success)', fontWeight: 700 }}>{f.entregados}</td>
        <td style={{ ...td, color: f.devueltos ? 'var(--df-danger)' : undefined }}>{f.devueltos}</td>
        <td style={{ ...td, color: 'var(--df-text-muted)' }}>{f.cancelados}</td>
        <td style={{ ...td, fontWeight: 800 }}>{fmt(f.ventas)}</td>
        <td style={td}>{fmt(f.ventasEntregadas)}</td>
        {conGasto && <td style={{ ...td, fontWeight: 800, color: !f.gasto ? undefined : f.roas >= 3 ? 'var(--df-success)' : f.roas >= 1.5 ? 'var(--df-warning-mid)' : 'var(--df-danger)' }}>{f.gasto ? `${f.roas}x` : '—'}</td>}
      </tr>
      {abierto && (
        <tr>
          <td colSpan={conGasto ? 15 : 11} style={{ padding: '12px 10px 16px', borderBottom: '1px solid var(--df-border)', background: 'var(--df-bg)' }}>
            <Detalle f={f} />
          </td>
        </tr>
      )}
    </>
  );
}

function Detalle({ f }: { f: ConversionAnuncio }) {
  const pasos = [
    ...(f.impresiones ? [{ l: 'Impresiones', n: f.impresiones, c: PALETA[5] }, { l: 'Clics', n: f.clics, c: PALETA[6 % PALETA.length] }] : []),
    { l: 'Chats', n: f.chats, c: PALETA[1] },
    { l: 'Respondieron', n: f.respondieron, c: PALETA[2] },
    { l: 'Pedidos', n: f.pedidos, c: PALETA[3] },
    { l: 'Despachados', n: f.despachados, c: PALETA[4] },
    { l: 'Entregados', n: f.entregados, c: '#10B981' },
  ];
  const maxU = Math.max(1, ...f.productos.map((p) => p.unidades));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Embudo</div>
        {pasos.map((p, i) => {
          // Las impresiones/clics van en otra escala: cada barra se mide contra su paso anterior.
          const base = i === 0 ? p.n : pasos[i - 1].n;
          const ancho = i === 0 ? 100 : base ? Math.min(100, (p.n / base) * 100) : 0;
          return (
            <div key={p.l} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{p.l}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{p.n.toLocaleString('es-CO')}{i > 0 && base ? <span style={{ color: 'var(--df-text-faint)', fontWeight: 600 }}> · {Math.round((p.n / base) * 1000) / 10}%</span> : ''}</span>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'var(--df-surface-2)', overflow: 'hidden' }}>
                <div style={{ width: `${ancho}%`, height: '100%', borderRadius: 999, background: p.c, transition: 'width .4s' }} />
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          Ticket promedio <b>{fmt(f.ticket)}</b> · En camino <b>{f.enCamino}</b> · Tasa de entrega <b>{f.tasaEntrega ? `${f.tasaEntrega}%` : '—'}</b>
          {f.gasto > 0 && <><br />Gasto <b>{fmt(f.gasto)}</b> · Costo por pedido entregado <b>{f.costoEntregado ? fmt(f.costoEntregado) : '—'}</b>{f.conversacionesMeta ? <> · Meta contó <b>{f.conversacionesMeta}</b> conversaciones</> : ''}</>}
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
