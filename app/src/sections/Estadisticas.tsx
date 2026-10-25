import type { DealFlowState } from '../hooks/useDealFlowState';
import { RecaudosEffi } from '../components/RecaudosEffi';
import { ConversionAnuncios } from '../components/ConversionAnuncios';
import { AnalisisVentas } from '../components/AnalisisVentas';

const card: React.CSSProperties = {
  background: 'var(--df-surface)',
  border: '1px solid var(--df-border)',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,.04)',
};

const PRESETS: { key: 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'mesPasado'; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mesPasado', label: 'Mes pasado' },
];

export function Estadisticas({ df }: { df: DealFlowState }) {
  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--df-brand)' : 'var(--df-surface)',
    color: active ? '#fff' : 'var(--df-text-body)',
    border: '1px solid ' + (active ? 'var(--df-brand)' : 'var(--df-border)'),
    borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  });
  const dateInput: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)' };

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const unDia = df.statsRango.desde === df.statsRango.hasta;
  const moverDia = (f: string, n: number) => new Date(new Date(f + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
  const flecha: React.CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 8, width: 30, height: 32, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };


  return (
    <section data-screen-label="Estadísticas">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Estadísticas 📊</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 16px' }}>Rendimiento de tus chats, campañas y ventas. Filtra por el periodo que quieras.</p>

      <RecaudosEffi df={df} />

      {/* Filtros de fecha */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => df.elegirStatsPreset(p.key)} style={chip(df.statsPreset === p.key)}>{p.label}</button>
        ))}
        {/* Un solo día, con flechas para pasar al anterior / siguiente. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Día:</span>
          <button onClick={() => { const d = moverDia(df.statsRango.desde, -1); df.setStatsFechas(d, d); }} title="Día anterior" style={flecha}>‹</button>
          <input type="date" value={unDia ? df.statsRango.desde : ''} max={hoy} onChange={(e) => e.target.value && df.setStatsFechas(e.target.value, e.target.value)} style={dateInput} />
          <button onClick={() => { const d = moverDia(unDia ? df.statsRango.desde : df.statsRango.hasta, 1); if (d <= hoy) df.setStatsFechas(d, d); }} disabled={unDia && df.statsRango.desde >= hoy} title="Día siguiente" style={flecha}>›</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Rango:</span>
          <input type="date" value={df.statsRango.desde} max={df.statsRango.hasta} onChange={(e) => df.setStatsFechas(e.target.value, df.statsRango.hasta)} style={dateInput} />
          <span style={{ color: 'var(--df-text-faint)' }}>→</span>
          <input type="date" value={df.statsRango.hasta} min={df.statsRango.desde} onChange={(e) => df.setStatsFechas(df.statsRango.desde, e.target.value)} style={dateInput} />
        </div>
      </div>

      <AnalisisVentas desde={df.statsRango.desde} hasta={df.statsRango.hasta} />
      <ConversionAnuncios desde={df.statsRango.desde} hasta={df.statsRango.hasta} onDia={(d) => df.setStatsFechas(d, d)} />
    </section>
  );
}
