import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from './Dropdown';
import { notificar } from './dialogs';
import { apiSkydropxProductos, apiSkydropxVincularAuto, apiSkydropxVincular, apiSkydropxCsv, type ProductoSkydropx, type VarianteSkydropx } from '../lib/api';

/**
 * Variantes de la tienda ↔ productos de Skydropx (como la vinculación de Effi).
 * Skydropx no deja crear productos por API: se descarga el archivo con las variantes,
 * se sube en Skydropx y luego DealFlow vincula cada variante por código o por nombre.
 */

const btn: React.CSSProperties = { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 13px', minHeight: 36, fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnSec: React.CSSProperties = { ...btn, background: 'var(--df-surface)', color: 'var(--df-text-body)', border: '1px solid var(--df-border)' };
const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Filtro = 'todas' | 'sin' | 'con';

export function SkydropxProductos() {
  const [vars, setVars] = useState<VarianteSkydropx[]>([]);
  const [prods, setProds] = useState<ProductoSkydropx[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [q, setQ] = useState('');

  const cargar = async () => {
    setCargando(true);
    const r = await apiSkydropxProductos();
    setCargando(false);
    if (r.error) { setError(r.error); return; }
    setVars(r.data?.variantes || []); setProds(r.data?.productosSky || []); setError(r.data?.error || '');
  };
  useEffect(() => { void cargar(); }, []);

  const auto = async () => {
    setTrabajando(true);
    const r = await apiSkydropxVincularAuto();
    setTrabajando(false);
    if (r.error || !r.data) { notificar(r.error || 'No se pudo vincular.'); return; }
    const d = r.data;
    notificar(d.productosSky
      ? `✓ ${d.vinculadas} variante${d.vinculadas === 1 ? '' : 's'} vinculada${d.vinculadas === 1 ? '' : 's'} ahora. ${d.sinVinculo ? `Faltan ${d.sinVinculo}: elígelas abajo.` : 'Todas quedaron vinculadas.'}`
      : 'Tu cuenta de Skydropx aún no tiene productos. Descarga el archivo de variantes y súbelo en Skydropx primero.');
    await cargar();
  };

  const descargar = async () => {
    const r = await apiSkydropxCsv();
    if (!r.data) { notificar(r.error || 'No se pudo armar el archivo.'); return; }
    const blob = new Blob(['﻿' + r.data.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'variantes-para-skydropx.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const elegir = async (v: VarianteSkydropx, skyId: string) => {
    const p = prods.find((x) => x.id === skyId) || null;
    const r = await apiSkydropxVincular(v.productId, v.variantId, p);
    if (r.error) { notificar(r.error); return; }
    setVars((xs) => xs.map((x) => (x.productId === v.productId && x.variantId === v.variantId ? { ...x, skyId: p?.id || '', skyNombre: p?.nombre || '', auto: false } : x)));
  };

  const opciones = useMemo(() => [{ value: '', label: '— Sin vincular —' }, ...prods.map((p) => ({ value: p.id, label: `${p.nombre}${p.sku ? ` · ${p.sku}` : ''}` }))], [prods]);
  const vinculadas = vars.filter((v) => v.skyId).length;
  const visibles = vars.filter((v) => (filtro === 'sin' ? !v.skyId : filtro === 'con' ? !!v.skyId : true) && (!q.trim() || norm(`${v.producto} ${v.label} ${v.sku}`).includes(norm(q.trim()))));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--df-border)', paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>Productos en Skydropx</div>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.55 }}>
        Cada talla y color va como un producto en Skydropx, igual que en Effi. Skydropx no deja que DealFlow los cree solo, así que:
        <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li><b>Descarga el archivo</b> con todas tus variantes (nombre, código y precio).</li>
          <li>En <b>Skydropx → Productos</b>, créalas o impórtalas con ese archivo, usando el mismo <b>código (SKU)</b>.</li>
          <li>Vuelve aquí y toca <b>Vincular automático</b>: DealFlow casa cada variante por código o por nombre. Las que no casen, elígelas a mano.</li>
        </ol>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => void descargar()} style={btnSec}>⬇ Descargar variantes</button>
        <button onClick={() => void auto()} disabled={trabajando} style={{ ...btn, opacity: trabajando ? 0.6 : 1 }}>{trabajando ? 'Vinculando…' : 'Vincular automático'}</button>
        <button onClick={() => void cargar()} disabled={cargando} style={btnSec}>{cargando ? 'Cargando…' : '↻ Recargar'}</button>
        {!cargando && <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}><b>{vinculadas}</b> de {vars.length} vinculadas · {prods.length} producto{prods.length === 1 ? '' : 's'} en Skydropx</span>}
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)' }}>{error}</div>}

      {vars.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, talla o código…" style={{ flex: 1, minWidth: 180, boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)' }} />
            <div style={{ width: 170 }}>
              <Dropdown ariaLabel="Filtrar variantes" value={filtro} onChange={(v) => setFiltro(v as Filtro)}
                options={[{ value: 'todas', label: 'Todas' }, { value: 'sin', label: 'Sin vincular' }, { value: 'con', label: 'Vinculadas' }]} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
            {visibles.map((v) => (
              <div key={`${v.productId}|${v.variantId}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(200px, 1.2fr)', gap: 10, alignItems: 'center', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 10px', background: v.skyId ? 'var(--df-surface)' : 'var(--df-purple-subtle)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.producto}{v.label ? <span style={{ color: 'var(--df-text-muted)', fontWeight: 600 }}> · {v.label}</span> : null}</div>
                  <div style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>Código {v.sku}{v.skyId ? (v.auto ? ' · vinculada sola' : ' · elegida a mano') : ''}</div>
                </div>
                {prods.length
                  ? <Dropdown ariaLabel={`Producto de Skydropx para ${v.producto} ${v.label}`} buscar placeholder="Elige el producto de Skydropx…" value={v.skyId} onChange={(id) => void elegir(v, id)} options={opciones} />
                  : <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Aún no hay productos en Skydropx</span>}
              </div>
            ))}
            {!visibles.length && <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Nada con ese filtro.</div>}
          </div>
        </>
      )}
      {!cargando && !vars.length && <div style={{ fontSize: 12, color: 'var(--df-text-faint)' }}>Tu tienda aún no tiene productos.</div>}
    </div>
  );
}
