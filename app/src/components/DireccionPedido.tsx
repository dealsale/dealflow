import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { apiDireccionPedido, apiSugerirDireccion } from '../lib/api';
import { enlaceMapa, ordenarDireccion } from '../lib/direccion';
import { notificar } from './dialogs';

const btn: CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', color: 'var(--df-text-body)', borderRadius: 8, padding: '5px 10px', font: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' };

/**
 * Botón 🌐 junto a la dirección del pedido: la deja lista para la guía (MAYÚSCULAS,
 * CRA/CL/AV…, APTO/TO/INT/CS/CJ, BRR y LOC en Bogotá). Primero la propone la IA de la
 * tienda con esas reglas; si no hay IA o no responde, se ordena sin IA. Se puede abrir
 * en el mapa para revisarla.
 */
export function OrdenarDireccion({ rowId, direccion, ciudad, departamento, onCambio }: { rowId?: string; direccion: string; ciudad: string; departamento: string; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ia, setIa] = useState<{ cargando: boolean; sugerida?: string; aviso?: string }>({ cargando: false });
  const local = abierto ? ordenarDireccion(direccion) : null;
  const propuesta = ia.sugerida || local;
  const igual = (propuesta || '') === direccion.replace(/\s+/g, ' ').trim();

  useEffect(() => {
    if (!abierto || !rowId) return;
    let vivo = true;
    setIa({ cargando: true });
    void apiSugerirDireccion(rowId).then((r) => {
      if (!vivo) return;
      const e = r.data?.error || r.error;
      setIa(r.data?.sugerida ? { cargando: false, sugerida: r.data.sugerida } : { cargando: false, aviso: e === 'sin_ia' ? 'Sin IA conectada: se ordenó con las reglas básicas (sin barrio ni localidad).' : e ? `${e} Se ordenó con las reglas básicas.` : undefined });
    });
    return () => { vivo = false; };
  }, [abierto, rowId, direccion]);

  const aplicar = async () => {
    if (!rowId || !propuesta) return;
    setGuardando(true);
    const r = await apiDireccionPedido(rowId, propuesta);
    setGuardando(false);
    if (r.error) return notificar(r.error, 'error');
    notificar('✓ Dirección lista para la guía.');
    setAbierto(false);
    onCambio();
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto((v) => !v)} title="Dejar la dirección lista para la guía y verla en el mapa" aria-label="Ordenar la dirección y verla en el mapa"
        style={{ border: '1px solid var(--df-border)', background: abierto ? 'var(--df-brand-subtle)' : 'var(--df-surface)', borderRadius: 7, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '3px 6px', flexShrink: 0 }}>🌐</button>
      {abierto && (
        <div style={{ flexBasis: '100%', marginTop: 6, border: '1px solid var(--df-border)', background: 'var(--df-surface)', borderRadius: 10, padding: 10, display: 'grid', gap: 8, fontSize: 13 }}>
          {ia.cargando && <div style={{ color: 'var(--df-text-muted)' }}>✨ Organizando la dirección con IA…</div>}
          {!ia.cargando && propuesta && !igual && (
            <>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12 }}>{ia.sugerida ? '✨ Lista para la guía (IA · revisa barrio y localidad):' : 'Lista para la guía:'}</div>
              <div style={{ fontWeight: 800, color: 'var(--df-text-strong)', letterSpacing: '.01em' }}>{propuesta}</div>
            </>
          )}
          {!ia.cargando && propuesta && igual && <div style={{ color: 'var(--df-brand-dark)', fontWeight: 600 }}>✓ La dirección ya está lista para la guía.</div>}
          {!ia.cargando && ia.aviso && <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{ia.aviso}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!ia.cargando && propuesta && !igual && rowId && <button type="button" style={{ ...btn, background: 'var(--df-brand)', borderColor: 'var(--df-brand)', color: '#fff' }} disabled={guardando} onClick={() => void aplicar()}>{guardando ? 'Guardando…' : 'Usar esta dirección'}</button>}
            <a href={enlaceMapa(propuesta || direccion, ciudad, departamento)} target="_blank" rel="noreferrer" style={btn}>🗺️ Ver en el mapa ↗</a>
            <button type="button" style={btn} onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
