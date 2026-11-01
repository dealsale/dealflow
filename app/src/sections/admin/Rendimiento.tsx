import { useState } from 'react';
import { apiRendimiento, apiRendimientoReiniciar, type ReporteRendimiento } from '../../lib/api';

/**
 * Rendimiento del servidor: qué lo está frenando (bloqueos del hilo, rutas lentas, tareas de
 * fondo y tamaño de la base). Se abre a pedido, para no cargar el servidor.
 */
const hora = (t: number) => new Date(t - 5 * 3600e3).toISOString().slice(11, 19);
const color = (ms: number) => (ms >= 2000 ? 'var(--df-danger-dark, #B91C1C)' : ms >= 700 ? 'var(--df-warning, #B45309)' : 'var(--df-text-body)');

export function RendimientoServidor() {
  const [r, setR] = useState<ReporteRendimiento | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const medir = async () => { setCargando(true); const x = await apiRendimiento(); setCargando(false); if (x.data) setR(x.data); };
  const caja: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 14, marginBottom: 14 };
  const tit: React.CSSProperties = { fontWeight: 800, fontSize: 13, margin: '12px 0 6px' };
  const fila: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, fontSize: 12.5, padding: '4px 0', borderTop: '1px solid var(--df-border)' };
  return (
    <div style={caja}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14.5, flex: 1, minWidth: 200 }}>⚡ Rendimiento del servidor</b>
        {abierto && <button type="button" onClick={() => void apiRendimientoReiniciar().then(medir)} style={btn}>Medir desde cero</button>}
        <button type="button" onClick={() => { setAbierto(true); void medir(); }} style={{ ...btn, background: '#047857', color: '#fff', borderColor: '#047857' }}>{cargando ? 'Midiendo…' : abierto ? 'Actualizar' : 'Ver qué lo frena'}</button>
      </div>
      {abierto && r && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--df-text-muted)' }}>
            <span>Hilo: p50 <b style={{ color: color(r.hilo.p50) }}>{r.hilo.p50} ms</b> · p99 <b style={{ color: color(r.hilo.p99) }}>{r.hilo.p99} ms</b> · máx <b style={{ color: color(r.hilo.max) }}>{r.hilo.max} ms</b></span>
            <span>Memoria {r.memoriaMB.rss} MB</span>
            <span>Base {r.base.dbMB} MB · WAL {r.base.walMB} MB</span>
            <span>Encendido hace {Math.round(r.arriba / 60)} min</span>
          </div>
          <div style={tit}>Bloqueos del servidor (última hora)</div>
          {!r.bloqueos.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Ninguno: el servidor responde fluido.</div>}
          {r.bloqueos.map((b, i) => (
            <div key={i} style={fila}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{hora(b.t)} · {[...b.tareas, ...b.peticiones].join(' · ') || 'sin tarea identificada'}</span>
              <b style={{ color: color(b.ms) }}>{b.ms} ms</b>
            </div>
          ))}
          <div style={tit}>Rutas y tareas que más tiempo consumen</div>
          {r.rutas.map((x) => (
            <div key={x.ruta} style={fila}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x.ruta} <span style={{ color: 'var(--df-text-muted)' }}>· {x.n} veces · máx {x.max} ms</span></span>
              <b style={{ color: color(x.prom) }}>{x.prom} ms</b>
            </div>
          ))}
          <div style={tit}>Peticiones lentas recientes</div>
          {!r.lentas.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Ninguna de más de 0,8 s.</div>}
          {r.lentas.slice(0, 15).map((x, i) => (
            <div key={i} style={fila}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{hora(x.t)} · {x.ruta} ({x.estado})</span><b style={{ color: color(x.ms) }}>{x.ms} ms</b></div>
          ))}
          <div style={tit}>Tablas más grandes</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12.5, color: 'var(--df-text-muted)' }}>
            {r.base.tablas.map((t) => <span key={t.tabla}>{t.tabla}: <b style={{ color: 'var(--df-text-body)' }}>{t.filas.toLocaleString('es-CO')}</b></span>)}
          </div>
        </div>
      )}
    </div>
  );
}
const btn: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 12px', background: 'var(--df-surface)', color: 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };
