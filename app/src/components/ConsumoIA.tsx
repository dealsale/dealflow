import { Fragment, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Superadmin: consumo de IA por tienda (tokens y dólares estimados). Sirve para encontrar la
 * tienda que se disparó y ver por qué: más respuestas, respuestas más pesadas (catálogo grande)
 * o un chat que se lleva casi todo (bot en bucle con otro bot).
 */
interface Tienda { store_id: string; nombre: string | null; llamadas: number; entrada: number; cache: number; salida: number; usd: number; respuestas: number; promedioRespuesta: number; productos: number; ia?: { proveedor: string; modelo: string; clave: 'tienda' | 'dealflow' | 'ninguna'; fotos: 'tienda' | 'dealflow' | 'ninguna' } }
interface Detalle {
  porDia: { dia: string; llamadas: number; entrada: number; usd: number }[];
  porTipo: { tipo: string; nombre: string; llamadas: number; entrada: number; usd: number; promedioEntrada: number }[];
  chats: { lead_id: string; nombre: string | null; tel: string | null; llamadas: number; entrada: number }[];
  total: { llamadas: number; entrada: number; usd: number };
}
const n = (x: number) => Math.round(x).toLocaleString('es-CO');
const tk = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : x >= 1e3 ? `${Math.round(x / 1e3)} mil` : String(x));
const usd = (x: number) => `US$ ${x < 1 ? x.toFixed(3) : x.toFixed(2)}`;
const CLAVE: Record<string, string> = { tienda: 'clave de la tienda', dealflow: 'clave de DealFlow', ninguna: 'sin clave' };
const celda: CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--df-border)', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' };

export function ConsumoIA() {
  const [dias, setDias] = useState(7);
  const [filas, setFilas] = useState<Tienda[] | null>(null);
  const [abierta, setAbierta] = useState('');
  const [det, setDet] = useState<Detalle | null>(null);
  useEffect(() => { setFilas(null); void fetch(`/api/superadmin/consumo-ia?dias=${dias}`, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => setFilas(d?.tiendas || [])).catch(() => setFilas([])); }, [dias]);
  const abrir = (id: string) => {
    if (abierta === id) { setAbierta(''); return; }
    setAbierta(id); setDet(null);
    void fetch(`/api/superadmin/consumo-ia/${id}?dias=14`, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then(setDet).catch(() => setDet(null));
  };
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>🧠 IA por tienda: modelo y consumo</div>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Tokens enviados a DeepSeek/OpenAI y costo estimado. «Peso por respuesta» alto = catálogo o instrucciones muy largas; muchas respuestas en un solo chat = posible bucle.</div>
        </div>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 8px', fontFamily: 'inherit', fontSize: 12.5 }}>
          <option value={1}>Hoy</option><option value={3}>3 días</option><option value={7}>7 días</option><option value={30}>30 días</option>
        </select>
      </div>
      {filas === null ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>
        : !filas.length ? <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>No hay tiendas.</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>
                <th style={{ ...celda, textAlign: 'left', borderTop: 'none' }}>Tienda</th><th style={{ ...celda, textAlign: 'left', borderTop: 'none' }}>IA (modelo · clave)</th><th style={{ ...celda, borderTop: 'none' }}>Llamadas</th><th style={{ ...celda, borderTop: 'none' }}>Tokens</th>
                <th style={{ ...celda, borderTop: 'none' }}>Peso por respuesta</th><th style={{ ...celda, borderTop: 'none' }}>Productos</th><th style={{ ...celda, borderTop: 'none' }}>Costo est.</th>
              </tr></thead>
              <tbody>
                {filas.map((t) => (
                  <Fragment key={t.store_id}>
                    <tr onClick={() => abrir(t.store_id)} style={{ cursor: 'pointer', background: abierta === t.store_id ? 'var(--df-bg)' : undefined }}>
                      <td style={{ ...celda, textAlign: 'left', fontWeight: 700 }}>{abierta === t.store_id ? '▾' : '▸'} {t.nombre || t.store_id}</td>
                      <td style={{ ...celda, textAlign: 'left' }}>{t.ia?.proveedor
                        ? <><b>{t.ia.proveedor}</b> · {t.ia.modelo}<br /><span style={{ fontSize: 11.5, color: t.ia.clave === 'dealflow' ? '#b45309' : 'var(--df-text-muted)' }}>{CLAVE[t.ia.clave]}</span></>
                        : <span style={{ color: 'var(--df-danger-dark, #b91c1c)' }}>Sin IA configurada</span>}</td>
                      <td style={celda}>{n(t.llamadas)}</td><td style={celda}>{tk(t.entrada + t.salida)}</td>
                      <td style={{ ...celda, color: t.promedioRespuesta > 15000 ? '#b45309' : undefined, fontWeight: t.promedioRespuesta > 15000 ? 700 : 400 }}>{tk(t.promedioRespuesta)}</td>
                      <td style={celda}>{t.productos}</td><td style={{ ...celda, fontWeight: 700 }}>{usd(t.usd)}</td>
                    </tr>
                    {abierta === t.store_id && (
                      <tr><td colSpan={7} style={{ padding: '8px 8px 12px', borderTop: '1px solid var(--df-border)' }}>
                        {!det ? <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Cargando detalle…</span> : (
                          <div style={{ display: 'grid', gap: 10, fontSize: 12.5 }}>
                            {t.ia && <div><b>IA:</b> escribe con {t.ia.proveedor || '—'} ({t.ia.modelo || '—'}, {CLAVE[t.ia.clave]}) · fotos y notas de voz con OpenAI ({CLAVE[t.ia.fotos]})</div>}
                            <div><b>Por día (14 días):</b> {det.porDia.map((d) => `${d.dia.slice(5)}: ${n(d.llamadas)} llamadas · ${usd(d.usd)}`).join('  |  ') || 'sin datos'}</div>
                            <div><b>En qué se gasta:</b>{det.porTipo.map((x) => <div key={x.tipo}>• {x.nombre}: {n(x.llamadas)} llamadas · {tk(x.promedioEntrada)} tokens c/u · {usd(x.usd)}</div>)}</div>
                            <div><b>Chats que más usan la IA (7 días):</b>{det.chats.map((c) => <div key={c.lead_id}>• {c.nombre || 'Sin nombre'} {c.tel ? `(${c.tel})` : ''}: {n(c.llamadas)} respuestas{c.llamadas >= 60 ? ' ⚠️ revisar: puede ser otro bot' : ''}</div>)}</div>
                          </div>
                        )}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Costo estimado con precios de DeepSeek (entrada US$0,28/M, en caché US$0,028/M, salida US$0,42/M). Lo exacto está en la consola de DeepSeek de la tienda.</div>
    </div>
  );
}
