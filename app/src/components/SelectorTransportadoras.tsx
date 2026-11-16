import { useEffect, useState } from 'react';
import { apiEffiCotizar, type CotizacionEffi } from '../lib/api';

/**
 * Selector de transportadoras para la guía de Effi, al estilo de Dropi: cada opción con su flete
 * estimado, si cobra contra entrega, si llega a la ciudad y en cuántos días entrega.
 * El flete es un ESTIMADO (Effi no cotiza antes de crear la guía): sale de las guías anteriores
 * de la tienda a esa ciudad o departamento; el valor exacto lo pone la transportadora al crearla.
 */
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const COLORES: [RegExp, string, string][] = [
  [/coordinadora/i, '#0B4EA2', '#fff'], [/env[ií]a/i, '#E30613', '#fff'], [/inter/i, '#F39200', '#fff'], [/servientrega/i, '#00843D', '#fff'],
  [/tcc/i, '#FFCC00', '#111'], [/domina/i, '#6D2077', '#fff'], [/deprisa/i, '#D71920', '#fff'], [/99|minutos/i, '#00B2A9', '#fff'],
];
const marca = (n: string) => COLORES.find(([re]) => re.test(n)) || [/./, '#475569', '#fff'] as [RegExp, string, string];
const iniciales = (n: string) => n.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🚚';

export function SelectorTransportadoras({ orderId, remitente, value, onElegir, onSinDatos }: {
  orderId: string; remitente: string; value: string; onElegir: (id: string) => void; onSinDatos?: () => void;
}) {
  const [d, setD] = useState<{ cotizaciones: CotizacionEffi[]; recaudo: number; ciudad: string; departamento: string; aviso: string } | null>(null);
  const [error, setError] = useState('');
  const [verTodas, setVerTodas] = useState(false);
  useEffect(() => {
    let vivo = true;
    setError('');
    void apiEffiCotizar(orderId, remitente).then((r) => {
      if (!vivo) return;
      if (r.data) setD(r.data); else { setError(r.error || 'No se pudo cotizar.'); onSinDatos?.(); }
    });
    return () => { vivo = false; };
  }, [orderId, remitente]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return null;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', padding: '8px 0' }}>🚚 Cotizando transportadoras para este pedido…</div>;
  const cod = d.recaudo > 0;
  const validas = d.cotizaciones.filter((c) => c.llega !== false && !(cod && (c.admiteRecaudo === false || c.modalidad === 'sin')));
  const conPrecio = validas.filter((c) => c.flete > 0);
  const barata = conPrecio.length ? conPrecio.reduce((a, b) => (b.flete < a.flete ? b : a)) : null;
  const conDias = validas.filter((c) => c.dias);
  const rapida = conDias.length ? conDias.reduce((a, b) => ((b.dias || 99) < (a.dias || 99) ? b : a)) : null;
  // Primero las que sirven para este pedido; las demás, plegadas.
  const lista = verTodas ? d.cotizaciones : d.cotizaciones.filter((c) => validas.includes(c) || c.transportadoraId === value);
  const ocultas = d.cotizaciones.length - lista.length;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>
        Envío a <b>{[d.ciudad, d.departamento].filter(Boolean).join(', ')}</b> · {cod ? <>contra entrega <b>{pesos(d.recaudo)}</b></> : 'pedido pagado (sin recaudo)'}
      </div>
      <div role="radiogroup" aria-label="Transportadora" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 8 }}>
        {lista.map((c) => {
          const [, fondo, letra] = marca(c.nombre);
          const sel = c.transportadoraId === value;
          const noSirve = c.llega === false || (cod && (c.admiteRecaudo === false || c.modalidad === 'sin'));
          return (
            <button key={c.transportadoraId} type="button" role="radio" aria-checked={sel} onClick={() => onElegir(c.transportadoraId)}
              style={{ textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: sel ? 'var(--df-brand-subtle, rgba(16,185,129,.08))' : 'var(--df-surface)', color: 'var(--df-text)',
                border: `2px solid ${sel ? 'var(--df-brand, #10B981)' : 'var(--df-border)'}`, borderRadius: 12, padding: 10, display: 'grid', gap: 6, opacity: noSirve && !sel ? 0.6 : 1, position: 'relative' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span aria-hidden style={{ width: 34, height: 34, borderRadius: 9, background: fondo, color: letra, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flex: '0 0 auto' }}>{iniciales(c.nombre)}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 13.5, display: 'block' }}>{c.nombre}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--df-text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.opcion}>{c.opcion.replace(new RegExp(`^${c.nombre}\\s*(effi)?\\s*\\|?`, 'i'), '').trim() || c.opcion}</span>
                </span>
                {sel && <span aria-hidden style={{ color: 'var(--df-brand, #10B981)', fontWeight: 800 }}>✓</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{c.flete ? `≈ ${pesos(c.flete)}` : 'Al crear la guía'}</span>
                {c.dias && <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>· 🕒 {c.dias} día{c.dias === 1 ? '' : 's'}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {barata && c.transportadoraId === barata.transportadoraId && <Etiqueta fondo="rgba(16,185,129,.15)" color="var(--df-brand-dark, #047857)">💰 Más barata</Etiqueta>}
                {rapida && c.transportadoraId === rapida.transportadoraId && <Etiqueta fondo="rgba(59,130,246,.14)" color="#1D4ED8">⚡ Más rápida</Etiqueta>}
                {c.llega === false ? <Etiqueta fondo="rgba(220,38,38,.12)" color="#B91C1C">✕ No llega a {d.ciudad}</Etiqueta>
                  : c.modalidad === 'sin' ? <Etiqueta fondo="var(--df-bg)" color="var(--df-text-muted)">Sin recaudo</Etiqueta>
                  : c.admiteRecaudo === false ? <Etiqueta fondo="rgba(245,158,11,.15)" color="#92400E">Sin contra entrega en esta ciudad</Etiqueta>
                  : (c.admiteRecaudo || c.modalidad === 'con') ? <Etiqueta fondo="rgba(16,185,129,.12)" color="var(--df-brand-dark, #047857)">💵 Con recaudo</Etiqueta> : null}
              </div>
              {c.flete > 0 && (
                <div style={{ fontSize: 10.5, color: 'var(--df-text-faint)', lineHeight: 1.35 }}>
                  Envío {pesos(c.base)}{c.manejo ? ` + manejo ${pesos(c.manejo)}` : ''}{c.comision ? ` + ${cod && c.modalidad !== 'sin' ? `recaudo ${c.pctComision} %` : 'otros'} ${pesos(c.comision)}` : ''}
                  <div>{c.detalle}{c.diasFuente === 'historial' ? ' · días según tus entregas' : ''}</div>
                </div>
              )}
              {!c.flete && <div style={{ fontSize: 10.5, color: 'var(--df-text-faint)' }}>{c.detalle}</div>}
            </button>
          );
        })}
      </div>
      {(ocultas > 0 || verTodas) && (
        <button type="button" onClick={() => setVerTodas(!verTodas)} style={{ justifySelf: 'start', background: 'none', border: 0, padding: 0, color: 'var(--df-purple, #7C3AED)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          {verTodas ? 'Ocultar las que no sirven' : `Ver ${ocultas} opción${ocultas === 1 ? '' : 'es'} más (no llegan o no cobran contra entrega)`}
        </button>
      )}
      <div style={{ fontSize: 10.5, color: 'var(--df-text-faint)' }}>Los valores son estimados con tus guías anteriores: Effi no cotiza antes de crear la guía; el flete exacto lo pone la transportadora al crearla.{d.aviso ? ` ${d.aviso}` : ''}</div>
    </div>
  );
}

function Etiqueta({ children, fondo, color }: { children: React.ReactNode; fondo: string; color: string }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: fondo, color }}>{children}</span>;
}
