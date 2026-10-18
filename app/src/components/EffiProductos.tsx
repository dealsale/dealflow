import { useEffect, useMemo, useRef, useState } from 'react';
import {
  apiEffiApiArticulos, apiEffiApiBuscar, apiEffiApiProveedor, apiEffiApiSyncArticulos, apiEffiApiVincular,
  type EffiArticulo, type EffiVarianteDF,
} from '../lib/api';

/**
 * Productos de la tienda ↔ artículos de Effi.
 * Cada producto se marca como "se despacha por Effi" o "por Dropi": la
 * sincronización con Effi solo toca los de Effi. Las variantes sin vínculo se
 * enlazan buscando el artículo en Effi por nombre o referencia.
 */

type Filtro = 'effi' | 'sin' | 'dropi';

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-surface)', color: 'var(--df-text)' };
const btn: React.CSSProperties = { background: 'var(--df-purple)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' };
const mini: React.CSSProperties = { border: '1px solid var(--df-border)', background: 'var(--df-surface)', borderRadius: 7, padding: '5px 9px', fontFamily: 'inherit', fontWeight: 600, fontSize: 11.5, cursor: 'pointer', color: 'var(--df-text-body)', whiteSpace: 'nowrap' };

/** Buscador de artículos de Effi: filtra los vinculados en memoria y busca en vivo en Effi. */
function BuscadorArticulo({ cache, onElegir, inicial }: { cache: EffiArticulo[]; onElegir: (a: EffiArticulo) => void; inicial: string }) {
  const [q, setQ] = useState(inicial);
  const [remotos, setRemotos] = useState<EffiArticulo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(t.current);
    if (q.trim().length < 2) { setRemotos([]); return; }
    t.current = window.setTimeout(() => {
      setBuscando(true);
      void apiEffiApiBuscar(q).then((r) => { setBuscando(false); setRemotos(r.data?.articulos || []); });
    }, 450);
    return () => window.clearTimeout(t.current);
  }, [q]);
  const locales = useMemo(() => {
    const palabras = norm(q).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return cache.filter((a) => { const txt = norm(`${a.descripcion} ${a.referencia}`); return palabras.every((p) => txt.includes(p)); }).slice(0, 8);
  }, [q, cache]);
  const vistos = new Set(locales.map((a) => a.id));
  const lista = [...locales, ...remotos.filter((a) => !vistos.has(a.id))].slice(0, 12);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input id="effi-buscar-articulo" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca el artículo en Effi por nombre o referencia…" style={inp} />
      {buscando && <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Buscando en Effi…</span>}
      {!buscando && q.trim().length >= 2 && !lista.length && <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Effi no tiene artículos con ese nombre o referencia.</span>}
      {lista.length > 0 && (
        <div style={{ border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {lista.map((a) => (
            <button key={a.id} onClick={() => onElegir(a)} className="df-row-hover" style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 8, alignItems: 'center', padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--df-border)', background: 'var(--df-surface)', fontFamily: 'inherit', cursor: 'pointer', color: 'var(--df-text)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{a.descripcion}</span>
                <span style={{ fontSize: 11, color: 'var(--df-text-faint)', fontFamily: "'JetBrains Mono',monospace" }}>#{a.id}{a.referencia ? ` · ref ${a.referencia}` : ''}{a.stock != null ? ` · stock ${a.stock}` : ''}</span>
              </span>
              {a.ecommerce && <span style={{ fontSize: 10.5, fontWeight: 700, background: 'var(--df-purple-subtle)', color: 'var(--df-purple)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>en tu e-commerce</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EffiProductos({ onMsg }: { onMsg: (m: string) => void }) {
  const [variantes, setVariantes] = useState<EffiVarianteDF[]>([]);
  const [cache, setCache] = useState<EffiArticulo[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Filtro>('effi');
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<string>(''); // variantId con el buscador abierto
  const [buscarProd, setBuscarProd] = useState('');

  const cargar = async () => {
    const r = await apiEffiApiArticulos();
    if (r.data) { setVariantes(r.data.variantes); setCache(r.data.articulos); setNombres(r.data.nombres || {}); }
  };
  useEffect(() => { void cargar(); }, []);

  // Agrupa variantes por producto.
  const productos = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; proveedor: string; vars: EffiVarianteDF[] }>();
    for (const v of variantes) {
      const p = m.get(v.productId) || { id: v.productId, nombre: v.producto, proveedor: v.proveedor, vars: [] };
      p.vars.push(v); m.set(v.productId, p);
    }
    return [...m.values()];
  }, [variantes]);
  const cuenta = (f: Filtro) => productos.filter((p) => (f === 'effi' ? p.proveedor === 'effi' : f === 'dropi' ? p.proveedor === 'dropi' : !p.proveedor)).length;
  const visibles = productos
    .filter((p) => (filtro === 'effi' ? p.proveedor === 'effi' : filtro === 'dropi' ? p.proveedor === 'dropi' : !p.proveedor))
    .filter((p) => !buscarProd.trim() || norm(p.nombre).includes(norm(buscarProd.trim())));
  const varsEffi = variantes.filter((v) => v.proveedor === 'effi');
  const vinculadas = varsEffi.filter((v) => v.effiId).length;

  const marcar = async (ids: string[], proveedor: 'effi' | 'dropi' | '') => {
    const r = await apiEffiApiProveedor(ids, proveedor);
    if (r.error) { onMsg(r.error); return; }
    setVariantes((vs) => vs.map((v) => (ids.includes(v.productId) ? { ...v, proveedor } : v)));
  };
  const sincronizar = async () => {
    setCargando(true); onMsg('Leyendo tus artículos de Effi y vinculando los productos de Effi…');
    const r = await apiEffiApiSyncArticulos();
    setCargando(false);
    if (r.error || !r.data) { onMsg(r.error || 'No se pudo sincronizar.'); return; }
    const d = r.data;
    onMsg(`✓ ${d.total} artículos ${d.soloVinculados ? 'vinculados a tu e-commerce' : 'de venta'} leídos de Effi · ${d.vinculadas} variantes de Effi vinculadas${d.sinVinculo.length ? ` · ${d.sinVinculo.length} por vincular` : ''}${d.sinProveedor ? ` · ${d.sinProveedor} productos sin definir si son de Effi o Dropi` : ''}.`);
    await cargar();
  };
  const vincular = async (v: EffiVarianteDF, a: EffiArticulo) => {
    const r = await apiEffiApiVincular(v.variantId, a.id);
    if (r.error) { onMsg(r.error); return; }
    setNombres((n) => ({ ...n, [a.id]: a.descripcion + (a.referencia ? ` [${a.referencia}]` : '') }));
    setVariantes((vs) => vs.map((x) => (x.variantId === v.variantId ? { ...x, effiId: a.id } : x)));
    setAbierto('');
  };

  const pestaña = (f: Filtro, txt: string) => (
    <button onClick={() => setFiltro(f)} style={{ border: 'none', borderBottom: '2px solid ' + (filtro === f ? 'var(--df-purple)' : 'transparent'), background: 'transparent', padding: '8px 4px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, color: filtro === f ? 'var(--df-purple)' : 'var(--df-text-muted)', cursor: 'pointer' }}>
      {txt} <span style={{ fontWeight: 600, opacity: 0.8 }}>({cuenta(f)})</span>
    </button>
  );
  const seg = (p: { id: string; proveedor: string }) => (
    <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
      {([['effi', 'Effi'], ['dropi', 'Dropi']] as const).map(([k, t]) => (
        <button key={k} onClick={() => void marcar([p.id], p.proveedor === k ? '' : k)} title={p.proveedor === k ? 'Quitar' : `Se despacha por ${t}`}
          style={{ border: 'none', padding: '5px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', background: p.proveedor === k ? (k === 'effi' ? 'var(--df-purple)' : 'var(--df-warning)') : 'var(--df-surface)', color: p.proveedor === k ? '#fff' : 'var(--df-text-muted)' }}>
          {t}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <p style={{ color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.5, margin: '0 0 12px' }}>
        Marca cada producto como <b>Effi</b> o <b>Dropi</b>. La sincronización solo vincula los de Effi, con los artículos que enlazaste en tu e-commerce de Effi (por la referencia o el nombre). Los que no casen los buscas aquí mismo.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={sincronizar} disabled={cargando} style={{ ...btn, opacity: cargando ? 0.7 : 1 }}>↻ Sincronizar productos de Effi</button>
        <span style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}><b style={{ color: 'var(--df-text-strong)' }}>{vinculadas}/{varsEffi.length}</b> variantes de Effi vinculadas · {cache.length} artículos en memoria</span>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--df-border)', marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {pestaña('effi', 'De Effi')}
        {pestaña('sin', 'Sin definir')}
        {pestaña('dropi', 'De Dropi')}
        <input value={buscarProd} onChange={(e) => setBuscarProd(e.target.value)} placeholder="Buscar producto…" style={{ ...inp, width: 180, marginLeft: 'auto', marginBottom: 6 }} />
      </div>

      {filtro === 'sin' && visibles.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>Marcar los {visibles.length} de esta lista como:</span>
          <button onClick={() => void marcar(visibles.map((p) => p.id), 'effi')} style={{ ...mini, color: 'var(--df-purple)', borderColor: 'var(--df-purple-border)' }}>Todos Effi</button>
          <button onClick={() => void marcar(visibles.map((p) => p.id), 'dropi')} style={{ ...mini, color: 'var(--df-warning)', borderColor: 'var(--df-warning-border)' }}>Todos Dropi</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
        {!visibles.length && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12.5, color: 'var(--df-text-muted)', border: '1px dashed var(--df-border)', borderRadius: 10 }}>
            {filtro === 'effi' ? 'Todavía no marcas productos como de Effi. Ve a "Sin definir" y márcalos.' : filtro === 'sin' ? 'Todos tus productos tienen proveedor definido.' : 'No hay productos marcados como de Dropi.'}
          </div>
        )}
        {visibles.map((p) => {
          const faltan = p.vars.filter((v) => !v.effiId).length;
          return (
            <div key={p.id} style={{ border: '1px solid var(--df-border)', borderRadius: 11, padding: '10px 12px', background: 'var(--df-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ flex: 1, minWidth: 140, fontSize: 13.5 }}>{p.nombre}</b>
                {p.proveedor === 'effi' && (
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px', background: faltan ? 'var(--df-warning-subtle)' : 'var(--df-purple-subtle)', color: faltan ? 'var(--df-warning)' : 'var(--df-purple)' }}>
                    {faltan ? `${faltan} por vincular` : '✓ vinculado'}
                  </span>
                )}
                {seg(p)}
              </div>
              {p.proveedor === 'effi' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {p.vars.map((v) => {
                    const etiqueta = v.nombre.startsWith(p.nombre) ? (v.nombre.slice(p.nombre.length).replace(/^\s*\(|\)\s*$/g, '') || 'Única') : v.nombre;
                    return (
                      <div key={v.variantId} style={{ borderTop: '1px dashed var(--df-border)', paddingTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 90 }}>{etiqueta}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: v.effiId ? 'var(--df-text-body)' : 'var(--df-warning)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.effiId ? `→ ${nombres[v.effiId] || `Artículo #${v.effiId}`}` : 'Sin artículo de Effi'}
                          </span>
                          <button onClick={() => setAbierto(abierto === v.variantId ? '' : v.variantId)} style={mini}>{abierto === v.variantId ? 'Cerrar' : v.effiId ? 'Cambiar' : 'Buscar en Effi'}</button>
                        </div>
                        {abierto === v.variantId && (
                          <div style={{ marginTop: 8 }}>
                            <BuscadorArticulo cache={cache} inicial={p.nombre} onElegir={(a) => void vincular(v, a)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
