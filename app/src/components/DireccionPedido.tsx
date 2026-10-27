import { useState } from 'react';
import type { CSSProperties } from 'react';
import { apiDireccionPedido } from '../lib/api';
import { enlaceMapa, ordenarDireccion } from '../lib/direccion';
import { notificar } from './dialogs';

const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 8, padding: '5px 10px', font: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' };

/**
 * Botón 🌐 junto a la dirección del pedido: propone la dirección con la nomenclatura
 * abreviada (Cl, Cra, Dg, Tv, Av… # 00 - 00), deja igual apto, barrio y referencias, y
 * la abre en el mapa para revisarla.
 */
export function OrdenarDireccion({ rowId, direccion, ciudad, departamento, onCambio }: { rowId?: string; direccion: string; ciudad: string; departamento: string; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const propuesta = abierto ? ordenarDireccion(direccion) : null;
  const igual = propuesta === direccion.replace(/\s+/g, ' ').trim();

  const aplicar = async () => {
    if (!rowId || !propuesta) return;
    setGuardando(true);
    const r = await apiDireccionPedido(rowId, propuesta);
    setGuardando(false);
    if (r.error) return notificar(r.error, 'error');
    notificar('✓ Dirección ordenada.');
    setAbierto(false);
    onCambio();
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto((v) => !v)} title="Ordenar la dirección y verla en el mapa" aria-label="Ordenar la dirección y verla en el mapa"
        style={{ border: '1px solid var(--df-border)', background: abierto ? 'var(--df-brand-subtle)' : 'var(--df-surface)', borderRadius: 7, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '3px 6px', flexShrink: 0 }}>🌐</button>
      {abierto && (
        <div style={{ flexBasis: '100%', marginTop: 6, border: '1px solid var(--df-border)', background: 'var(--df-surface)', borderRadius: 10, padding: 10, display: 'grid', gap: 8, fontSize: 13 }}>
          {propuesta && !igual && (
            <>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12 }}>Así queda (las referencias no se tocan):</div>
              <div style={{ fontWeight: 700, color: 'var(--df-text-strong)' }}>{propuesta}</div>
            </>
          )}
          {propuesta && igual && <div style={{ color: 'var(--df-brand-dark)', fontWeight: 600 }}>✓ La dirección ya está ordenada.</div>}
          {!propuesta && <div style={{ color: 'var(--df-text-muted)' }}>No reconocí calle, carrera, diagonal… con su placa (puede ser rural, de manzana o una avenida con nombre). Revísala en el mapa y corrígela a mano si hace falta.</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {propuesta && !igual && rowId && <button type="button" style={{ ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff' }} disabled={guardando} onClick={() => void aplicar()}>{guardando ? 'Guardando…' : 'Usar esta dirección'}</button>}
            <a href={enlaceMapa(propuesta || direccion, ciudad, departamento)} target="_blank" rel="noreferrer" style={btn}>🗺️ Ver en el mapa ↗</a>
            <button type="button" style={btn} onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
