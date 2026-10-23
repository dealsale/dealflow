import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from './Dropdown';
import {
  apiEffiApiArticulos, apiEffiApiBuscar, apiRevisarVinculos, apiAplicarVinculos, type SugerenciaVinculo, type ArtVinculo, apiEffiApiProveedor, apiEffiApiConvenioProducto, apiEffiApiSyncArticulos, apiEffiApiVincular,
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

const tokens = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length > 1);
/** Qué tanto se parece un artículo a la variante (para ordenar el selector). */
const parecido = (a: EffiArticulo, sugerencia: string[]) => {
  const t = tokens(`${a.descripcion} ${a.referencia}`);
  return sugerencia.filter((x) => t.some((y) => y === x || y.startsWith(x) || x.startsWith(y))).length;
};

/**
 * Elegir el artículo de Effi de una variante: un SELECTOR con todos tus artículos
 * (ordenados por parecido a la variante y con buscador adentro) y, debajo, la
 * búsqueda en vivo en Effi para traer los que aún no están en la lista.
 */
function BuscadorArticulo({ cache, onElegir, producto, variante }: { cache: EffiArticulo[]; onElegir: (a: EffiArticulo) => void; producto: string; variante: string }) {
  const [q, setQ] = useState('');
  const [remotos, setRemotos] = useState<EffiArticulo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState('');
  const t = useRef<number | undefined>(undefined);
  const traer = (term: string) => {
    setBuscando(true);
    void apiEffiApiBuscar(term).then((r) => { setBuscando(false); const nuevos = r.data?.articulos || []; setRemotos((prev) => [...prev, ...nuevos.filter((x) => !prev.some((p) => p.id === x.id))]); });
  };
  // Al abrir: trae de Effi los artículos con el nombre del producto (por si no estaban en memoria).
  useEffect(() => { const base = tokens(producto).slice(0, 2).join(' '); if (base.length >= 2) traer(base); }, [producto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.clearTimeout(t.current);
    if (q.trim().length < 2) return;
    t.current = window.setTimeout(() => traer(q.trim()), 450);
    return () => window.clearTimeout(t.current);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugerencia = useMemo(() => tokens(`${producto} ${variante}`), [producto, variante]);
  const todos = useMemo(() => {
    const m = new Map<string, EffiArticulo>();
    for (const a of [...cache, ...remotos]) if (!m.has(a.id)) m.set(a.id, a);
    // Lo que escribas en la búsqueda manda; luego, el parecido con la variante.
    const tq = tokens(q);
    const score = (a: EffiArticulo) => parecido(a, tq) * 10 + parecido(a, sugerencia);
    return [...m.values()].sort((x, y) => score(y) - score(x) || x.descripcion.localeCompare(y.descripcion));
  }, [cache, remotos, sugerencia, q]);
  const etiqueta = (a: EffiArticulo) => `${a.descripcion}${a.referencia ? ` · ref ${a.referencia}` : ''} · #${a.id}${a.stock != null ? ` · stock ${a.stock}` : ''}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 4 }}>Elige el artículo de Effi ({todos.length} disponibles{buscando ? ', cargando más…' : ''})</div>
        <Dropdown
          ariaLabel="Artículo de Effi"
          placeholder="Selecciona un artículo…"
          buscar
          value={elegido}
          onChange={(id) => { setElegido(id); const a = todos.find((x) => x.id === id); if (a) onElegir(a); }}
          options={todos.map((a) => ({ value: a.id, label: etiqueta(a) }))}
        />
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', marginBottom: 4 }}>¿No aparece? Búscalo en Effi</div>
        <input id="effi-buscar-articulo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o referencia en Effi (se agrega al selector)…" style={inp} />
        {!buscando && q.trim().length >= 2 && !todos.some((a) => tokens(`${a.descripcion} ${a.referencia}`).some((x) => tokens(q).some((y) => x.startsWith(y)))) && (
          <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)' }}>Effi no tiene artículos con ese nombre o referencia.</span>
        )}
      </div>
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
  // Acordeón: un producto abierto a la vez (con muchas variantes la lista se hacía eterna).
  const [prodAbierto, setProdAbierto] = useState('');
  const [convProd, setConvProd] = useState<Record<string, string>>({});
  const [convenios, setConvenios] = useState<{ id: string; nombre: string }[]>([]);

  const cargar = async () => {
    const r = await apiEffiApiArticulos();
    if (r.data) { setVariantes(r.data.variantes); setCache(r.data.articulos); setNombres(r.data.nombres || {}); setConvProd(r.data.conveniosProducto || {}); setConvenios(r.data.convenios || []); }
  };
  const cambiarConvenio = async (productId: string, convenio: string) => {
    setConvProd((m) => ({ ...m, [productId]: convenio }));
    const r = await apiEffiApiConvenioProducto([productId], convenio);
    if (r.error) onMsg(r.error);
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
    onMsg(`✓ ${d.total} artículos ${d.soloVinculados ? 'vinculados a tu e-commerce' : 'de venta'} leídos de Effi · ${d.vinculadas} variantes de Effi vinculadas${d.marcados ? ` · ${d.marcados} productos encontrados en Effi y marcados como de Effi` : ''}${d.sinVinculo.length ? ` · ${d.sinVinculo.length} por vincular` : ''}${d.sinProveedor ? ` · ${d.sinProveedor} productos sin definir si son de Effi o Dropi` : ''}${d.stockActualizado ? ` · stock actualizado en ${d.stockActualizado} variantes` : ''}.`);
    await cargar();
  };
  const vincular = async (v: EffiVarianteDF, a: EffiArticulo) => {
    const r = await apiEffiApiVincular(v.variantId, a.id);
    if (r.error) { onMsg(r.error); return; }
    setNombres((n) => ({ ...n, [a.id]: a.descripcion + (a.referencia ? ` [${a.referencia}]` : '') }));
    setVariantes((vs) => vs.map((x) => (x.variantId === v.variantId ? { ...x, effiId: a.id, auto: false } : x)));
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
        <b>Se vinculan solos:</b> al crear o editar un producto (y cada 30 min) DealFlow lo busca en Effi y une cada talla/color con su artículo por el <b>nombre y la variante</b>, aunque las palabras estén en otro orden. Marca cada producto como <b>Effi</b> o <b>Dropi</b> (si no usas Dropi, los que aparezcan en Effi se marcan solos). Lo que no case lo eliges aquí mismo. <b>El stock se trae de Effi cada 30 min</b> (o al tocar Sincronizar) y es el que usa el asistente.
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
          const desplegado = prodAbierto === p.id && p.proveedor === 'effi';
          return (
            <div key={p.id} style={{ border: `1px solid ${desplegado ? 'var(--df-purple-border)' : 'var(--df-border)'}`, borderRadius: 11, padding: '10px 12px', background: 'var(--df-surface)', transition: 'border-color .2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => p.proveedor === 'effi' && setProdAbierto(desplegado ? '' : p.id)}
                  aria-expanded={desplegado}
                  disabled={p.proveedor !== 'effi'}
                  style={{ flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', color: 'var(--df-text-strong)', cursor: p.proveedor === 'effi' ? 'pointer' : 'default' }}
                >
                  {p.proveedor === 'effi' && <span aria-hidden style={{ fontSize: 11, color: 'var(--df-text-faint)', transition: 'transform .2s', transform: desplegado ? 'rotate(90deg)' : 'none' }}>▸</span>}
                  <b style={{ fontSize: 13.5 }}>{p.nombre}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)', fontWeight: 500 }}>{p.vars.length} variante{p.vars.length === 1 ? '' : 's'}</span>
                </button>
                {p.proveedor === 'effi' && (
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px', background: faltan ? 'var(--df-warning-subtle)' : 'var(--df-purple-subtle)', color: faltan ? 'var(--df-warning)' : 'var(--df-purple)' }}>
                    {faltan ? `${faltan} por vincular` : '✓ vinculado'}
                  </span>
                )}
                {seg(p)}
              </div>
              {p.proveedor === 'effi' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)' }}>Convenio:</span>
                  <div style={{ minWidth: 220, flex: '0 1 300px' }}>
                    <Dropdown
                      ariaLabel={`Convenio de ${p.nombre}`}
                      value={convProd[p.id] || ''}
                      onChange={(v) => void cambiarConvenio(p.id, v)}
                      options={[
                        { value: '', label: 'Automático (según sus ventas en Effi)' },
                        { value: 'propio', label: 'Mercancía propia (sin convenio)' },
                        ...convenios.map((c) => ({ value: c.id, label: `${c.nombre} · ${c.id}` })),
                        ...(convProd[p.id] && convProd[p.id] !== 'propio' && !convenios.some((c) => c.id === convProd[p.id]) ? [{ value: convProd[p.id], label: `Convenio ${convProd[p.id]}` }] : []),
                      ]}
                    />
                  </div>
                  {!convenios.length && <span style={{ fontSize: 11, color: 'var(--df-text-faint)' }}>Agrega tus convenios en la configuración de Effi (arriba) para elegirlos aquí.</span>}
                </div>
              )}
              {desplegado && (
                <div className="df-expand" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {p.vars.map((v) => {
                    const etiqueta = v.nombre.startsWith(p.nombre) ? (v.nombre.slice(p.nombre.length).replace(/^\s*\(|\)\s*$/g, '') || 'Única') : v.nombre;
                    return (
                      <div key={v.variantId} style={{ borderTop: '1px dashed var(--df-border)', paddingTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 90 }}>{etiqueta}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: v.effiId ? 'var(--df-text-body)' : 'var(--df-warning)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.effiId ? `→ ${nombres[v.effiId] || `Artículo #${v.effiId}`}` : 'Sin artículo de Effi'}
                          </span>
                          {v.effiId && v.auto && <span title="DealFlow lo vinculó solo por nombre y variante. Si no es el correcto, cámbialo." style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 7px', background: 'var(--df-purple-subtle)', color: 'var(--df-purple)' }}>⚡ automático</span>}
                          <button onClick={() => setAbierto(abierto === v.variantId ? '' : v.variantId)} style={mini}>{abierto === v.variantId ? 'Cerrar' : v.effiId ? 'Cambiar' : 'Buscar en Effi'}</button>
                        </div>
                        {abierto === v.variantId && (
                          <div style={{ marginTop: 8 }}>
                            <BuscadorArticulo cache={cache} producto={p.nombre} variante={etiqueta} onElegir={(a) => void vincular(v, a)} />
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

/**
 * Vínculo con Effi DENTRO del producto (Productos → Variantes): el convenio del
 * producto y, por cada variante, su artículo de Effi (con el mismo selector).
 */
export function EffiVinculoProducto({ productId, productoNombre, onCambio, conConvenio = true }: { productId: string; productoNombre: string; onCambio?: () => void; conConvenio?: boolean }) {
  const [vars, setVars] = useState<EffiVarianteDF[] | null>(null);
  const [cache, setCache] = useState<EffiArticulo[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [convenio, setConvenio] = useState('');
  const [convenios, setConvenios] = useState<{ id: string; nombre: string }[]>([]);
  const [abierto, setAbierto] = useState('');
  const [msg, setMsg] = useState('');
  const cargar = async () => {
    const r = await apiEffiApiArticulos(productId);
    if (!r.data) { setMsg(r.error || 'No pudimos leer Effi.'); return; }
    setVars(r.data.variantes); setCache(r.data.articulos); setNombres(r.data.nombres || {});
    setConvenio(r.data.conveniosProducto?.[productId] || ''); setConvenios(r.data.convenios || []);
  };
  useEffect(() => { void cargar(); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps
  const vincular = async (v: EffiVarianteDF, a: EffiArticulo) => {
    const r = await apiEffiApiVincular(v.variantId, a.id);
    if (r.error) { setMsg(r.error); return; }
    setNombres((n) => ({ ...n, [a.id]: a.descripcion + (a.referencia ? ` [${a.referencia}]` : '') }));
    setVars((vs) => (vs || []).map((x) => (x.variantId === v.variantId ? { ...x, effiId: a.id, auto: false } : x)));
    setAbierto(''); setMsg(`✓ ${v.nombre} → ${a.descripcion}`);
    onCambio?.();
  };
  const cambiarConvenio = async (c: string) => {
    setConvenio(c);
    const r = await apiEffiApiConvenioProducto([productId], c);
    if (r.error) setMsg(r.error);
  };
  if (!vars) return <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>{msg || 'Leyendo Effi…'}</div>;
  const vinculadas = vars.filter((v) => v.effiId).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {conConvenio && <>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Convenio:</span>
        <div style={{ minWidth: 220, flex: '0 1 320px' }}>
          <Dropdown ariaLabel="Convenio del producto" value={convenio} onChange={(v) => void cambiarConvenio(v)}
            options={opcionesConvenio(convenio, convenios)} />
        </div>
        </>}
        <span style={{ fontSize: 12, color: vinculadas === vars.length ? 'var(--df-purple)' : 'var(--df-warning)', fontWeight: 700, marginLeft: 'auto' }}>{vinculadas}/{vars.length} variantes vinculadas</span>
      </div>
      {vars.map((v) => {
        const etiqueta = v.nombre.startsWith(productoNombre) ? (v.nombre.slice(productoNombre.length).replace(/^\s*\(|\)\s*$/g, '') || 'Única') : v.nombre;
        return (
          <div key={v.variantId} style={{ borderTop: '1px dashed var(--df-border)', paddingTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 90 }}>{etiqueta}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: v.effiId ? 'var(--df-text-body)' : 'var(--df-warning)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.effiId ? `→ ${nombres[v.effiId] || `Artículo #${v.effiId}`}` : 'Sin artículo de Effi'}
              </span>
              {v.effiId && v.auto && <span title="DealFlow lo vinculó solo por nombre y variante. Si no es el correcto, cámbialo." style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 7px', background: 'var(--df-purple-subtle)', color: 'var(--df-purple)' }}>⚡ automático</span>}
              <button onClick={() => setAbierto(abierto === v.variantId ? '' : v.variantId)} style={mini}>{abierto === v.variantId ? 'Cerrar' : v.effiId ? 'Cambiar' : 'Elegir artículo'}</button>
            </div>
            {abierto === v.variantId && <div style={{ marginTop: 8 }}><BuscadorArticulo cache={cache} producto={productoNombre} variante={etiqueta} onElegir={(a) => void vincular(v, a)} /></div>}
          </div>
        );
      })}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--df-purple)' : 'var(--df-danger)' }}>{msg}</div>}
    </div>
  );
}

const opcionesConvenio = (actual: string, convenios: { id: string; nombre: string }[]) => [
  { value: '', label: 'Automático (según sus ventas en Effi)' },
  { value: 'propio', label: 'Mercancía propia (sin convenio)' },
  ...convenios.map((c) => ({ value: c.id, label: `${c.nombre} · ${c.id}` })),
  ...(actual && actual !== 'propio' && !convenios.some((c) => c.id === actual) ? [{ value: actual, label: `Convenio ${actual}` }] : []),
];

/** Convenio dropshipping del producto (arriba del producto, junto a "Se despacha por"). */
export function ConvenioProductoEffi({ productId }: { productId: string }) {
  const [convenio, setConvenio] = useState<string | null>(null);
  const [convenios, setConvenios] = useState<{ id: string; nombre: string }[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void apiEffiApiArticulos(productId).then((r) => { if (r.data) { setConvenio(r.data.conveniosProducto?.[productId] || ''); setConvenios(r.data.convenios || []); } });
  }, [productId]);
  if (convenio === null) return null;
  const cambiar = async (c: string) => {
    setConvenio(c); setMsg('');
    const r = await apiEffiApiConvenioProducto([productId], c);
    setMsg(r.error || '✓ Guardado');
    if (!r.error) setTimeout(() => setMsg(''), 1500);
  };
  return (
    <div style={{ marginTop: 10, maxWidth: 420 }}>
      <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>🤝 Convenio en Effi {msg && <span style={{ fontWeight: 600, color: msg.startsWith('✓') ? 'var(--df-purple)' : 'var(--df-danger)' }}>· {msg}</span>}</div>
      <Dropdown ariaLabel="Convenio del producto en Effi" value={convenio} onChange={(v) => void cambiar(v)} options={opcionesConvenio(convenio, convenios)} />
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 5 }}>
        {convenio === 'propio' ? 'Se envía como mercancía tuya: Effi exige stock en tu bodega.' : convenio ? 'Cada pedido de este producto sale a Effi con este convenio, sin preguntar.' : 'Automático: usa el convenio con el que ya se ha vendido en Effi. Si es de un proveedor, elígelo aquí para que salga bien desde la primera venta.'}
        {!convenios.length && ' Agrega tus convenios en Integraciones → Effi.'}
      </div>
    </div>
  );
}

/**
 * Revisión rápida: todas las variantes del producto con su artículo ACTUAL y el que
 * DealFlow SUGIERE (mismo nombre exacto, prefiriendo el del proveedor). Marca de una vez
 * las que están mal y las corrige con un clic.
 */
export function RevisionVinculos({ productId, onCambio }: { productId: string; onCambio?: () => void }) {
  const [filas, setFilas] = useState<SugerenciaVinculo[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState('');
  const revisar = async () => {
    setCargando(true); setMsg('');
    const r = await apiRevisarVinculos(productId);
    setCargando(false);
    if (r.error || !r.data) { setMsg(r.error || 'No se pudo revisar.'); return; }
    setFilas(r.data.filas);
    setMarcadas(new Set(r.data.filas.filter((f) => f.estado === 'cambiar').map((f) => f.variantId)));
  };
  const aplicar = async (soloQuitar = false) => {
    if (!filas) return;
    const cambios = filas.filter((f) => marcadas.has(f.variantId)).map((f) => ({ variantId: f.variantId, effiId: soloQuitar ? '' : f.sugerido?.id || '' }));
    if (!cambios.length) return;
    setCargando(true);
    const r = await apiAplicarVinculos(productId, cambios);
    setCargando(false);
    if (r.error || !r.data) { setMsg(r.error || 'No se pudo aplicar.'); return; }
    setMsg(`✓ ${r.data.cambios} variante(s) ${soloQuitar ? 'desvinculadas' : 'corregidas'}.`);
    onCambio?.();
    await revisar();
  };
  const chip = (a: ArtVinculo | null) => a ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '1px 6px', background: a.drop ? 'var(--df-purple-subtle)' : 'var(--df-surface-2)', color: a.drop ? 'var(--df-purple)' : 'var(--df-text-muted)', flexShrink: 0 }}>{a.drop ? 'PROVEEDOR' : 'PROPIO'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descripcion} · #{a.id}{a.stock != null ? ` · stock ${a.stock}` : ''}</span>
    </span>
  ) : <span style={{ color: 'var(--df-text-faint)' }}>—</span>;
  const color: Record<SugerenciaVinculo['estado'], string> = { ok: 'var(--df-brand-dark)', cambiar: 'var(--df-warning)', sin: 'var(--df-text-faint)', revisar: 'var(--df-danger)' };
  const texto: Record<SugerenciaVinculo['estado'], string> = { ok: '✓ bien', cambiar: '↻ cambiar', sin: 'no encontrado', revisar: '⚠ revisar' };
  const nCambiar = filas?.filter((f) => f.estado === 'cambiar').length || 0;
  return (
    <div style={{ border: '1px dashed var(--df-purple-border)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => void revisar()} disabled={cargando} style={{ ...mini, color: 'var(--df-purple)', borderColor: 'var(--df-purple-border)', fontWeight: 800 }}>{cargando ? 'Revisando en Effi…' : filas ? '↻ Volver a revisar' : '🔍 Revisar todos los vínculos'}</button>
        <span style={{ fontSize: 11.5, color: 'var(--df-text-muted)', flex: 1, minWidth: 200 }}>Compara cada variante con el artículo de Effi del mismo nombre (prefiere el del <b>proveedor</b>) y te muestra cuáles quedaron mal.</span>
      </div>
      {filas && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 6px', fontSize: 12 }}>
            <b>{nCambiar ? `${nCambiar} por corregir` : 'Todo se ve bien'}</b>
            <span style={{ color: 'var(--df-text-faint)' }}>· {filas.filter((f) => f.estado === 'ok').length} bien · {filas.filter((f) => f.estado === 'revisar').length} para revisar · {filas.filter((f) => f.estado === 'sin').length} sin artículo</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setMarcadas(new Set(filas.filter((f) => f.sugerido).map((f) => f.variantId)))} style={mini}>Marcar todas</button>
            <button onClick={() => setMarcadas(new Set())} style={mini}>Ninguna</button>
            <button onClick={() => void aplicar()} disabled={cargando || !marcadas.size} style={{ ...mini, background: 'var(--df-purple)', color: '#fff', borderColor: 'var(--df-purple)', opacity: marcadas.size ? 1 : 0.5 }}>Aplicar sugeridos ({marcadas.size})</button>
            <button onClick={() => void aplicar(true)} disabled={cargando || !marcadas.size} title="Quita el vínculo de las marcadas (para elegirlas a mano)" style={{ ...mini, color: 'var(--df-danger)' }}>Desvincular marcadas</button>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filas.map((f) => (
              <label key={f.variantId} style={{ display: 'grid', gridTemplateColumns: '22px minmax(90px,.6fr) minmax(0,1.5fr) minmax(0,1.5fr) 80px', gap: 8, alignItems: 'center', padding: '6px 2px', borderTop: '1px solid var(--df-border)', fontSize: 11.5, cursor: f.sugerido ? 'pointer' : 'default' }}>
                <input type="checkbox" disabled={!f.sugerido && !f.actual} checked={marcadas.has(f.variantId)} onChange={(e) => setMarcadas((m) => { const n = new Set(m); if (e.target.checked) n.add(f.variantId); else n.delete(f.variantId); return n; })} />
                <b style={{ fontSize: 12 }}>{f.label || 'Única'}</b>
                <span style={{ minWidth: 0 }}><span style={{ color: 'var(--df-text-faint)' }}>Ahora: </span>{chip(f.actual)}</span>
                <span style={{ minWidth: 0 }}><span style={{ color: 'var(--df-text-faint)' }}>Sugerido: </span>{chip(f.sugerido)}</span>
                <span style={{ fontWeight: 800, color: color[f.estado], textAlign: 'right' }}>{texto[f.estado]}</span>
              </label>
            ))}
          </div>
        </>
      )}
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.startsWith('✓') ? 'var(--df-purple)' : 'var(--df-danger)' }}>{msg}</div>}
    </div>
  );
}
