import { useState } from 'react';
import { apiEffiVerificacion, type ChequeoEffi, type ProductoVerificado } from '../lib/api';

const ICONO: Record<ChequeoEffi['estado'], string> = { ok: '✅', aviso: '⚠️', error: '❌' };
const th: React.CSSProperties = { textAlign: 'left', padding: '7px 8px', fontSize: 11.5, color: 'var(--df-text-muted)', fontWeight: 700, borderBottom: '1px solid var(--df-border)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '7px 8px', fontSize: 12.5, borderBottom: '1px solid var(--df-border)', verticalAlign: 'top' };

/**
 * "🔎 Revisar la integración": todo lo que Effi necesita para despachar bien, con lo que
 * falta, y cada producto con su vínculo, su convenio y su bodega (y de dónde salió cada cosa).
 */
export function VerificacionEffi() {
  const [datos, setDatos] = useState<{ chequeos: ChequeoEffi[]; productos: ProductoVerificado[]; aprendido: { productos: number; convenios: number; envios: number } } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const revisar = async () => {
    setCargando(true); setError('');
    const r = await apiEffiVerificacion();
    setCargando(false);
    if (r.error || !r.data) { setError(r.error || 'No se pudo revisar.'); return; }
    setDatos(r.data);
  };
  const csv = () => {
    if (!datos) return;
    const filas = [['Producto', 'Variantes', 'Vinculadas', 'Convenio', 'Origen convenio', 'Bodega', 'Origen bodega', 'Envíos recogidos']];
    for (const p of datos.productos) filas.push([p.nombre, String(p.variantes), String(p.vinculadas), p.convenio.nombre, p.convenio.origen, p.bodega.nombre, p.bodega.origen, p.bodega.total ? `${p.bodega.usos}/${p.bodega.total}` : '']);
    const txt = filas.map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `effi-productos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const visibles = (datos?.productos || []).filter((p) => !filtro || p.nombre.toLowerCase().includes(filtro.toLowerCase()));
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void revisar()} disabled={cargando} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--df-text)' }}>
          {cargando ? 'Revisando…' : datos ? '↻ Revisar de nuevo' : '🔎 Revisar la integración'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Conexión, configuración, remitentes y cada producto: vínculo, convenio y bodega.</span>
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)', marginTop: 8 }}>{error}</div>}
      {datos && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {datos.chequeos.map((c) => (
              <div key={c.titulo} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}>
                <span>{ICONO[c.estado]}</span>
                <span><b>{c.titulo}:</b> <span style={{ color: 'var(--df-text-muted)' }}>{c.detalle}</span></span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Bodegas aprendidas de {datos.aprendido.envios} envío{datos.aprendido.envios === 1 ? '' : 's'} recogido{datos.aprendido.envios === 1 ? '' : 's'}: {datos.aprendido.productos} producto{datos.aprendido.productos === 1 ? '' : 's'} y {datos.aprendido.convenios} convenio{datos.aprendido.convenios === 1 ? '' : 's'}.</div>
          </div>
          {datos.productos.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar producto…" style={{ border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)', minWidth: 0, flex: '1 1 180px', maxWidth: 280 }} />
                <button onClick={csv} style={{ background: 'none', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--df-text)' }}>⬇ Descargar CSV</button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--df-border)', borderRadius: 10, maxHeight: 420 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                  <thead><tr><th style={th}>Producto</th><th style={th}>Variantes</th><th style={th}>Convenio</th><th style={th}>Bodega (remitente)</th></tr></thead>
                  <tbody>
                    {visibles.map((p) => (
                      <tr key={p.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{p.nombre}</td>
                        <td style={td}>{p.vinculadas < p.variantes ? '⚠️' : '✅'} {p.vinculadas}/{p.variantes}</td>
                        <td style={td}>{p.convenio.nombre || <span style={{ color: 'var(--df-text-faint)' }}>Sin convenio aún</span>}{p.convenio.origen && p.convenio.origen !== 'propio' && <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>{p.convenio.origen === 'fijo' ? 'fijado por ti' : 'de su última venta'}</div>}</td>
                        <td style={td}>
                          {p.bodega.nombre || <span style={{ color: 'var(--df-danger-dark)' }}>Sin bodega: se elige en cada pedido</span>}
                          <div style={{ fontSize: 11, color: p.bodega.origen === 'defecto' ? 'var(--df-warning, #B45309)' : 'var(--df-text-faint)' }}>
                            {p.bodega.origen === 'fija' ? 'fijada por ti' : p.bodega.origen === 'aprendida' ? `aprendida: ${p.bodega.usos} de ${p.bodega.total} envíos recogidos salieron de aquí` : p.bodega.origen === 'defecto' ? 'por defecto (aún sin envíos recogidos)' : ''}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
