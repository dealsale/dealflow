import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { apiRecaudos, type ResumenRecaudos } from '../lib/api';

/**
 * Recaudos contraentrega de Effi: lo que Effi consignó en tu Wallet por cada
 * guía, lo que descontó (fletes y comisiones), lo que retiraste a tu banco y
 * los pedidos entregados que todavía no te han pagado.
 */
const caja: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const peso = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const mesActual = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);

export function RecaudosEffi({ df }: { df: DealFlowState }) {
  const conEffi = df.effiApi.conectado || df.allOrders.some((o) => o.despachoProveedor === 'effi');
  const [mes, setMes] = useState(mesActual());
  const [r, setR] = useState<ResumenRecaudos | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [verPagados, setVerPagados] = useState(false);
  useEffect(() => {
    if (!conEffi) return;
    setCargando(true); setError('');
    void apiRecaudos(mes).then((x) => { setCargando(false); if (x.error) { setError(x.error); setR(null); } else setR(x.data || null); });
  }, [mes, conEffi]);
  if (!conEffi) return null;
  const pendiente = r ? r.pendientes.reduce((a, p) => a + p.total, 0) : 0;
  const kpi = (label: string, valor: string, color: string, nota?: string) => (
    <div style={{ flex: '1 1 150px', minWidth: 0, border: '1px solid var(--df-border)', borderRadius: 10, padding: '11px 13px', background: 'var(--df-bg)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{valor}</div>
      {nota && <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>{nota}</div>}
    </div>
  );
  return (
    <div style={{ ...caja, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>💵 Recaudos contraentrega · Effi</div>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Lo que Effi ya consignó en tu Wallet por cada guía, y lo que falta.</div>
        </div>
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 12.5, color: 'var(--df-text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          Mes
          <input type="month" value={mes} max={mesActual()} onChange={(e) => e.target.value && setMes(e.target.value)} style={{ border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-body)' }} />
        </label>
      </div>
      {cargando && <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Consultando tu Wallet en Effi…</div>}
      {error && !cargando && <div style={{ fontSize: 13, color: 'var(--df-danger-dark)' }}>⚠️ {error}. Revisa que el usuario de la API key de Effi tenga permiso de consulta en «Movimientos de wallets».</div>}
      {r && !cargando && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {kpi('Recaudado', peso(r.recaudado), 'var(--df-brand-dark)', `${r.pagados.length} guía${r.pagados.length === 1 ? '' : 's'} pagada${r.pagados.length === 1 ? '' : 's'}`)}
            {kpi('Fletes y comisiones', peso(r.descuentos), 'var(--df-danger-dark)', 'Descontado por Effi')}
            {kpi('Neto', peso(r.neto), 'var(--df-text-strong)')}
            {kpi('Retirado a tu banco', peso(r.retirado), 'var(--df-purple)')}
            {kpi('Pendiente de pago', peso(pendiente), pendiente ? 'var(--df-warning)' : 'var(--df-text-muted)', `${r.pendientes.length} pedido${r.pendientes.length === 1 ? '' : 's'} entregado${r.pendientes.length === 1 ? '' : 's'}`)}
          </div>
          {r.pendientes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--df-text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Entregados sin pagar todavía</div>
              {r.pendientes.map((p) => (
                <div key={p.orderId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--df-border)', fontSize: 13, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, minWidth: 70 }}>DF-{p.numero}</span>
                  <span style={{ flex: '1 1 160px', fontWeight: 600 }} translate="no">{p.cliente}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--df-text-muted)' }}>{p.guia}</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{peso(p.total)}</b>
                </div>
              ))}
            </div>
          )}
          {r.pagados.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setVerPagados((x) => !x)} style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--df-purple)', fontWeight: 700, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>{verPagados ? '▾' : '▸'} Ver las {r.pagados.length} guías pagadas</button>
              {verPagados && r.pagados.map((p) => (
                <div key={p.orderId} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--df-border)', fontSize: 13, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, minWidth: 70 }}>DF-{p.numero}</span>
                  <span style={{ flex: '1 1 160px', fontWeight: 600 }} translate="no">{p.cliente}</span>
                  <span style={{ color: 'var(--df-brand-dark)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{peso(p.recaudo)}</span>
                  {p.descuentos > 0 && <span style={{ color: 'var(--df-danger-dark)', fontVariantNumeric: 'tabular-nums' }}>−{peso(p.descuentos)}</span>}
                </div>
              ))}
            </div>
          )}
          {!r.movimientos && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--df-text-muted)' }}>Effi no registra movimientos en tu Wallet este mes.</div>}
        </>
      )}
    </div>
  );
}
