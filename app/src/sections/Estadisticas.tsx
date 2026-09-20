import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { fmt } from '../lib/format';
import { LineChart, GroupedBars, Donut, TopAnuncios, PALETA } from '../components/Charts';

const card: React.CSSProperties = {
  background: 'var(--df-surface)',
  border: '1px solid var(--df-border)',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,.04)',
};

// Color fijo por canal (coherente en toda la app).
const COLOR_CANAL: Record<string, string> = {
  whatsapp: '#10B981', messenger: '#3B82F6', instagram: '#EC4899', web: '#F59E0B',
};

const PRESETS: { key: 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'mesPasado'; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mesPasado', label: 'Mes pasado' },
];

function Kpi({ label, valor, sub, color }: { label: string; valor: string; sub?: string; color?: string }) {
  return (
    <div style={card}>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: color || 'var(--df-text)' }}>{valor}</div>
      {sub && <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function Estadisticas({ df }: { df: DealFlowState }) {
  const s = df.stats;
  const t = s?.totales;
  const [ordenAds, setOrdenAds] = useState<'chats' | 'ventas'>('chats');
  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--df-brand)' : 'var(--df-surface)',
    color: active ? '#fff' : 'var(--df-text-body)',
    border: '1px solid ' + (active ? 'var(--df-brand)' : 'var(--df-border)'),
    borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  });
  const dateInput: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)' };

  const ventasSerie = (s?.serie || []).map((d) => ({ fecha: d.fecha, valor: d.ventas }));
  const canalData = (s?.porCanal || []).map((c) => ({ label: c.canal, valor: c.n, color: COLOR_CANAL[c.canal] || PALETA[5] }));
  const topAds = s?.topAnuncios || [];

  return (
    <section data-screen-label="Estadísticas">
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Estadísticas 📊</h1>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '0 0 16px' }}>Rendimiento de tus chats, campañas y ventas. Filtra por el periodo que quieras.</p>

      {/* Filtros de fecha */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => df.elegirStatsPreset(p.key)} style={chip(df.statsPreset === p.key)}>{p.label}</button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600 }}>Rango:</span>
          <input type="date" value={df.statsRango.desde} max={df.statsRango.hasta} onChange={(e) => df.setStatsFechas(e.target.value, df.statsRango.hasta)} style={dateInput} />
          <span style={{ color: 'var(--df-text-faint)' }}>→</span>
          <input type="date" value={df.statsRango.hasta} min={df.statsRango.desde} onChange={(e) => df.setStatsFechas(df.statsRango.desde, e.target.value)} style={dateInput} />
        </div>
      </div>

      {df.statsCargando && !s ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--df-text-muted)', padding: '48px 20px' }}>Cargando estadísticas…</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }} className="df-stats-kpis">
            <Kpi label="💬 Chats totales" valor={String(t?.chats ?? 0)} sub="conversaciones en el periodo" />
            <Kpi label="📢 Chats por anuncio" valor={String(t?.chatsAnuncio ?? 0)} sub={`${t?.chatsOrganicos ?? 0} orgánicos`} color="var(--df-brand-dark)" />
            <Kpi label="🛒 Pedidos" valor={String(t?.pedidos ?? 0)} sub={`conversión ${t?.conversion ?? 0}%`} color="var(--df-warning-mid)" />
            <Kpi label="💰 Ventas" valor={fmt(t?.ventas ?? 0)} sub={`ticket prom. ${fmt(t?.ticketPromedio ?? 0)}`} />
          </div>

          {/* Ventas por día */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Ventas por día</div>
            <LineChart data={ventasSerie} formato="money" color={PALETA[0]} />
          </div>

          {/* Chats vs pedidos por día */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Chats y pedidos por día</div>
            <GroupedBars
              data={(s?.serie || []).map((d) => ({ fecha: d.fecha, chats: d.chats, pedidos: d.pedidos }))}
              series={[{ key: 'chats', label: 'Chats', color: PALETA[1] }, { key: 'pedidos', label: 'Pedidos', color: PALETA[3] }]}
            />
          </div>

          {/* Canal + Top anuncios */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="df-collapse">
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Chats por canal</div>
              <Donut data={canalData} />
            </div>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Estadística de anuncios</div>
                <div style={{ marginLeft: 'auto', display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden' }}>
                  {(['chats', 'ventas'] as const).map((o) => (
                    <button key={o} onClick={() => setOrdenAds(o)}
                      style={{ background: ordenAds === o ? 'var(--df-brand)' : 'var(--df-surface)', color: ordenAds === o ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '6px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      {o === 'chats' ? 'Por chats' : 'Por ventas'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '4px 0 14px' }}>
                Qué pauta genera más chats y cuánto dinero produce cada una.
                {(t?.ventasAnuncio ?? 0) > 0 && <> Ventas atribuidas a anuncios: <strong style={{ color: 'var(--df-brand-dark)' }}>{fmt(t?.ventasAnuncio ?? 0)}</strong>.</>}
              </div>
              {topAds.length ? <TopAnuncios data={topAds} orden={ordenAds} /> : (
                <div style={{ color: 'var(--df-text-faint)', fontSize: 13, padding: '18px 0' }}>
                  Aún no hay chats ni ventas que hayan entrado por un anuncio en este periodo.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
