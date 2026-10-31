import type { DealFlowState } from '../hooks/useDealFlowState';
import { RecaudosEffi } from '../components/RecaudosEffi';
import { ConversionAnuncios } from '../components/ConversionAnuncios';
import { AnalisisVentas } from '../components/AnalisisVentas';

const PRESETS: { key: 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'mesPasado'; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mesPasado', label: 'Mes pasado' },
];
const fechaCorta = (f: string) => { const d = new Date(f + 'T12:00:00Z'); return isNaN(+d) ? f : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };

/**
 * Estadísticas (diseño "Noche"): periodo arriba (chips, un día con flechas o un
 * rango) y debajo ventas, canales, anuncios y recaudos de Effi.
 */
export function Estadisticas({ df }: { df: DealFlowState }) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const unDia = df.statsRango.desde === df.statsRango.hasta;
  const moverDia = (f: string, n: number) => new Date(new Date(f + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
  const rango = unDia ? fechaCorta(df.statsRango.desde) : `${fechaCorta(df.statsRango.desde)} → ${fechaCorta(df.statsRango.hasta)}`;

  return (
    <section data-screen-label="Estadísticas" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="encabezado">
        <div className="encabezado-txt">
          <span className="eti">{PRESETS.find((p) => p.key === df.statsPreset)?.label || 'Periodo'} · {rango}</span>
          <h1>Estadísticas</h1>
          <p className="sub">Ventas, canales y lo que hace el asistente, cruzado con tus anuncios y tus recaudos de Effi.</p>
        </div>
        <div className="fila" role="group" aria-label="Periodo">
          {PRESETS.map((p) => <button key={p.key} type="button" className={`chip${df.statsPreset === p.key ? ' activa' : ''}`} onClick={() => df.elegirStatsPreset(p.key)}>{p.label}</button>)}
        </div>
      </div>

      <div className="fila" style={{ gap: 14 }}>
        {/* Un solo día, con flechas para pasar al anterior / siguiente. */}
        <div className="fila" style={{ gap: 6 }}>
          <span className="suave-t" style={{ fontSize: 12.5, fontWeight: 600 }}>Día</span>
          <button type="button" className="btn btn-sec btn-chico" onClick={() => { const d = moverDia(df.statsRango.desde, -1); df.setStatsFechas(d, d); }} title="Día anterior">‹</button>
          <input className="entrada" type="date" value={unDia ? df.statsRango.desde : ''} max={hoy} onChange={(e) => e.target.value && df.setStatsFechas(e.target.value, e.target.value)} style={{ width: 150 }} />
          <button type="button" className="btn btn-sec btn-chico" onClick={() => { const d = moverDia(unDia ? df.statsRango.desde : df.statsRango.hasta, 1); if (d <= hoy) df.setStatsFechas(d, d); }} disabled={unDia && df.statsRango.desde >= hoy} title="Día siguiente">›</button>
        </div>
        <div className="fila" style={{ gap: 6, marginLeft: 'auto' }}>
          <span className="suave-t" style={{ fontSize: 12.5, fontWeight: 600 }}>Rango</span>
          <input className="entrada" type="date" value={df.statsRango.desde} max={df.statsRango.hasta} onChange={(e) => df.setStatsFechas(e.target.value, df.statsRango.hasta)} style={{ width: 150 }} />
          <span className="tenue">→</span>
          <input className="entrada" type="date" value={df.statsRango.hasta} min={df.statsRango.desde} onChange={(e) => df.setStatsFechas(df.statsRango.desde, e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      <AnalisisVentas desde={df.statsRango.desde} hasta={df.statsRango.hasta} />
      <ConversionAnuncios desde={df.statsRango.desde} hasta={df.statsRango.hasta} onDia={(d) => df.setStatsFechas(d, d)} />
      <RecaudosEffi df={df} />
    </section>
  );
}
