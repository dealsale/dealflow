import { useState, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { PhotoAddChip, PhotoDropTile, UploadedThumb } from '../components/PhotoUpload';
import { AutoTextarea } from '../components/AutoTextarea';
import { BloquesBuilder } from '../components/BloquesBuilder';
import { apiWooBuscarProductos, apiWooCatalogo, apiDropiProducto, type ProductoWoo, type ProductoCatalogoWoo, type DropiProducto } from '../lib/api';
import { Dropdown } from '../components/Dropdown';
import { confirmar, notificar } from '../components/dialogs';
import type { DealFlowState, DecoratedProduct } from '../hooks/useDealFlowState';

/**
 * Proveedor con el que se despacha ESTE producto, ya resuelto: el elegido a
 * mano; o —si solo hay uno conectado— ese único. Es la ÚNICA fuente de verdad
 * para saber qué vinculador (Dropi o Effi) mostrar. '' = ambos conectados y aún
 * sin elegir. Así nunca se muestran los dos a la vez ni el toggle viejo.
 */
export function despachoEfectivo(p: DecoratedProduct, df: DealFlowState): string {
  if (p.despachoProveedor) return p.despachoProveedor;
  const dropi = df.dropiConectado, effi = df.wooProveedores.includes('effi');
  if (dropi && !effi) return 'dropi';
  if (effi && !dropi) return 'effi';
  return '';
}
/** ¿Ya está vinculado el producto a un e-commerce? (SKU del producto o de alguna variante). */
function estaVinculado(p: DecoratedProduct): boolean {
  return !!(p.sku || '').trim() || (p.variantes || []).some((v) => (v.sku || '').trim());
}

/**
 * Elige por cuál proveedor se despacha ESTE producto: Dropi o Effi. Es exclusivo:
 * apenas queda vinculado a uno, el otro se bloquea (gris). Para cambiar, primero
 * "Desconectar" (suelta SKU del producto y de sus variantes) y ahí se habilita el
 * otro. Cada proveedor va con su propio nombre; no hay "vincular e-commerce".
 */
function SelectorDespachoProducto({ p, df }: { p: DecoratedProduct; df: DealFlowState }) {
  const dropiOn = df.dropiConectado;
  const effiOn = df.wooProveedores.includes('effi');
  if (!dropiOn && !effiOn) return null; // nada conectado: no hay despacho que elegir
  const efectivo = despachoEfectivo(p, df);
  const vinculado = estaVinculado(p);
  const opt = (val: string, label: string, on: boolean) => {
    const activo = efectivo === val;
    // Bloqueado si ya hay vínculo con el OTRO proveedor: hay que desconectar primero.
    const bloqueado = vinculado && !!efectivo && !activo;
    const disabled = !on || bloqueado;
    return (
      <button
        key={val}
        onClick={() => { if (disabled) return; p.setDespachoProveedor(p.despachoProveedor === val ? '' : val); }}
        disabled={disabled}
        title={!on ? `Conéctalo en Integraciones para despachar por ${label}.` : bloqueado ? 'Desconecta el otro proveedor primero para cambiar.' : ''}
        style={{
          background: activo ? 'var(--df-purple)' : 'var(--df-surface)',
          border: '1px solid var(--df-purple-border)', color: activo ? '#fff' : disabled ? 'var(--df-text-faint)' : 'var(--df-purple)',
          borderRadius: 7, padding: '6px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled && !activo ? 0.55 : 1,
        }}
      >{label}{!on ? ' · sin conectar' : ''}</button>
    );
  };
  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginBottom: 6 }}>Este producto se despacha por:</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {opt('dropi', 'Dropi', dropiOn)}
        {opt('effi', 'Effi', effiOn)}
        {vinculado && efectivo && (
          <button
            onClick={async () => { if (await confirmar({ titulo: `Desconectar de ${efectivo === 'dropi' ? 'Dropi' : 'Effi'}`, mensaje: 'Se suelta el vínculo del producto y de todas sus variantes para poder cambiar de proveedor.', aceptar: 'Desconectar', peligro: true })) { p.desvincularDespacho(); notificar('Producto desconectado. Ya puedes elegir el otro proveedor.'); } }}
            style={{ background: 'transparent', border: '1px solid var(--df-danger)', color: 'var(--df-danger-dark)', borderRadius: 7, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
          >Desconectar</button>
        )}
        {dropiOn && effiOn && !efectivo && <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)', alignSelf: 'center' }}>← elige con cuál para vincularlo</span>}
      </div>
      {vinculado && efectivo && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--df-brand-dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>✓</span><span>Vinculado con {efectivo === 'dropi' ? 'Dropi' : 'Effi'}</span>
        </div>
      )}
    </div>
  );
}

// Título de sección resaltado en negro (para diferenciar los grupos del editor).
const TITULO_NEGRO: CSSProperties = { fontSize: 13.5, fontWeight: 800, color: 'var(--df-text)', letterSpacing: '-0.01em', margin: '2px 0 10px' };
// Subtítulo dentro de un grupo (jerarquía secundaria, en gris).
const SUBLABEL: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--df-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', margin: '0 0 8px' };

/** Editor de opciones del producto: grupos como Color (Negro, Azul…) y Talla (S, M, L…). */
function OpcionesEditor({ p }: { p: DecoratedProduct }) {
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [valorDrafts, setValorDrafts] = useState<Record<number, string>>({});
  const setDraft = (gi: number, v: string) => setValorDrafts((d) => ({ ...d, [gi]: v }));

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
        {p.opcionesDecoradas.map((o, gi) => (
          <div key={gi} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{o.nombre}</span>
              <span style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>· {o.valores.length} {o.valores.length === 1 ? 'opción' : 'opciones'}</span>
              <div style={{ flex: 1 }} />
              <span onClick={o.remove} className="df-danger-hover" title="Quitar este grupo" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
              {o.valores.map((val, vi) => (
                <div key={vi} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--df-surface-2)', borderRadius: 10, padding: '5px 8px' }}>
                  {val.foto && <img src={val.foto} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(15,23,42,.1)' }} />}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{val.valor}</span>
                  {val.foto ? (
                    <span onClick={() => o.removeValorFoto(vi)} className="df-danger-hover" title="Quitar la foto de esta opción" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 11 }}>quitar foto</span>
                  ) : (
                    <PhotoAddChip label="+ foto" onFiles={(files) => o.setValorFoto(vi, files)} />
                  )}
                  <span onClick={() => o.removeValor(vi)} className="df-danger-hover" title="Quitar" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</span>
                </div>
              ))}
              {o.valores.length === 0 && <span style={{ color: 'var(--df-text-faint)', fontSize: 12.5 }}>Aún no agregas opciones a este grupo.</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="df-input"
                value={valorDrafts[gi] || ''}
                onChange={(e) => setDraft(gi, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { o.addValor(valorDrafts[gi] || ''); setDraft(gi, ''); } }}
                placeholder={`Agregar a ${o.nombre}… (ej: ${o.nombre.toLowerCase().includes('tall') ? 'M' : 'Negro'})`}
                style={{ flex: 1, minWidth: 140, border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13 }}
              />
              <button
                onClick={() => { o.addValor(valorDrafts[gi] || ''); setDraft(gi, ''); }}
                className="df-btn-outline-green"
                style={{ background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Agregar
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <input
          className="df-input"
          value={nuevoGrupo}
          onChange={(e) => setNuevoGrupo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { p.addOpcion(nuevoGrupo); setNuevoGrupo(''); } }}
          placeholder="Nuevo grupo · ej: Color, Talla, Sabor…"
          style={{ flex: 1, minWidth: 180, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
        />
        <button
          onClick={() => { p.addOpcion(nuevoGrupo); setNuevoGrupo(''); }}
          className="df-btn-outline-green"
          style={{ background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Agregar grupo
        </button>
      </div>
      <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>
        Crea un grupo por cada tipo de opción: uno "Color" con Negro, Azul… y otro "Talla" con S, M, L… El asistente se las ofrece al cliente.
      </div>
    </div>
  );
}

/**
 * "Generar combinaciones desde Opciones": crea de una sola vez TODAS las
 * variantes (talla × color × …) que falten, a partir de los grupos de Opciones
 * ya cargados. Evita el error de ir creándolas una por una a mano y que falten
 * (ej. "tengo 5 tallas × 3 colores, deberían ser 15 y solo salen 13").
 */
function BotonGenerarVariantes({ p, df }: { p: DecoratedProduct; df: DealFlowState }) {
  const conValores = (p.opcionesDecoradas || []).filter((o) => (o.valores || []).length > 0);
  if (conValores.length < 1) return null;
  const totalPosibles = conValores.reduce((acc, o) => acc * o.valores.length, 1);
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={p.generarVariantes}
        style={{ background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', color: 'var(--df-purple)', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
      >⚡ Sincronizar variantes con las opciones ({totalPosibles} en total)</button>
      <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 5 }}>Deja exactamente las {totalPosibles} combinaciones (talla × color): crea las que falten y quita repetidas o sobrantes. Se hace solo al guardar, esto es por si quieres forzarlo ya.</div>
      {df.variantesGenMsg && <div style={{ marginTop: 6, fontSize: 12.5, color: df.variantesGenMsg.startsWith('✓') ? 'var(--df-brand-dark)' : df.variantesGenMsg.includes('…') ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>{df.variantesGenMsg}</div>}
    </div>
  );
}

/**
 * Vincular el producto con Dropi por su API directa: el SKU = ID del producto en
 * Dropi. Se pega el ID, se valida contra Dropi (trae nombre + variaciones) y queda
 * listo. Las variaciones (talla/color) se emparejan solas al despachar.
 */
function VincularDropiApi({ p, df }: { p: DecoratedProduct; df: DealFlowState }) {
  const [abierto, setAbierto] = useState(false);
  const [id, setId] = useState(p.sku || '');
  const [prod, setProd] = useState<DropiProducto | null>(null);
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);
  if (!df.dropiConectado) return null;
  const validar = () => {
    const v = id.trim(); if (!v) return;
    setCargando(true); setMsg('');
    void apiDropiProducto(v).then((r) => {
      setCargando(false);
      if (r.error || !r.data) { setProd(null); setMsg(r.error || 'Dropi no encontró ese ID.'); return; }
      setProd(r.data); p.setSku(v); setMsg('');
    });
  };
  return (
    <div style={{ marginTop: 8 }}>
      {!abierto ? (
        <button onClick={() => setAbierto(true)} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-warning)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-warning)', cursor: 'pointer' }}>🔗 Vincular con Dropi (por ID)</button>
      ) : (
        <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, background: 'var(--df-bg)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 8 }}>Pega el <b>ID del producto en Dropi</b> (lo ves en Dropi, en el producto). Lo validamos y las variantes se emparejan solas al despachar.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') validar(); }} placeholder="Ej. 1000001" style={{ flex: 1, minWidth: 160, boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
            <button onClick={validar} disabled={cargando} style={{ background: 'var(--df-warning)', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer', opacity: cargando ? 0.7 : 1 }}>{cargando ? 'Validando…' : 'Validar'}</button>
          </div>
          {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--df-danger-dark)' }}>{msg}</div>}
          {prod && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--df-brand-subtle)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '9px 12px' }}>
              <span style={{ fontSize: 15 }}>✓</span>
              <div style={{ fontSize: 12.5, color: 'var(--df-brand-dark)', lineHeight: 1.5 }}>
                Vinculado con Dropi: <b>{prod.name || '(sin nombre)'}</b> · {prod.tipo === 'VARIABLE' ? `${prod.variaciones.length} variaciones` : 'producto simple'}.<br />
                <span style={{ color: 'var(--df-text-muted)' }}>Acuérdate de <b>Guardar</b> el producto.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Trae y cachea el catálogo completo del WooCommerce de un proveedor. Se comparte
 * entre todas las filas de variantes de un producto para no pedirlo mil veces.
 * Al cambiar de proveedor, se limpia para volver a traerlo del Woo correcto.
 */
function useCatalogoWoo(prov: string) {
  const [activo, setActivo] = useState(false); // se enciende al abrir el buscador
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [productos, setProductos] = useState<ProductoCatalogoWoo[] | null>(null);
  // Una vez activo, cada vez que cambia el proveedor se vuelve a traer SU catálogo
  // automáticamente (antes había que darle "Elegir de la lista" otra vez).
  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    setCargando(true); setError(''); setProductos(null);
    void apiWooCatalogo(prov).then((r) => {
      if (cancelado) return;
      setCargando(false);
      if (r.error || !r.data) { setError(r.error || 'No pudimos traer el catálogo.'); return; }
      setProductos(r.data.productos);
    });
    return () => { cancelado = true; };
  }, [prov, activo]);
  const cargar = () => setActivo(true);
  return { cargando, error, productos, cargar };
}
type CatalogoWoo = ReturnType<typeof useCatalogoWoo>;

/**
 * Lista desplegable del catálogo del WooCommerce: cada producto se abre y muestra
 * sus variaciones (talla/color) con su SKU y stock. Un clic en "Usar" vincula ese
 * SKU. Así no hay que ir pegando códigos: se elige de la lista. (Sobre todo Dropi.)
 */
/** Busca el nombre "bonito" de un SKU en el catálogo (producto o producto — variante). */
function nombreDeSku(cat: CatalogoWoo, sku: string): string {
  if (!sku) return '';
  for (const p of cat.productos || []) {
    if (p.sku && p.sku === sku) return p.nombre;
    for (const v of p.variaciones) if (v.sku === sku) return `${p.nombre} — ${v.nombre}`;
  }
  return '';
}

function CatalogoPicker({ cat, nombreProv, onPick, usados }: { cat: CatalogoWoo; nombreProv: string; onPick: (sku: string, nombre: string) => void; usados?: Set<string> }) {
  const [filtro, setFiltro] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  useEffect(() => { cat.cargar(); }, []); // trae el catálogo al abrir
  const f = filtro.trim().toLowerCase();
  const yaUsado = (sku: string) => !!sku && !!usados && usados.has(sku);
  // Ocultamos lo que ya vinculaste a OTRA variante (para no repetir). En variables,
  // filtramos las variaciones usadas; si no queda ninguna, ocultamos el producto.
  const productos = (cat.productos || [])
    .map((p) => ({ ...p, variaciones: p.variaciones.filter((v) => !yaUsado(v.sku)) }))
    .filter((p) => {
      const variable = p.tipo === 'variable' && (p.variaciones.length > 0);
      if (!variable && yaUsado(p.sku)) return false; // simple ya usado
      if (p.tipo === 'variable' && p.variaciones.length === 0) return false; // todas usadas
      if (!f) return true;
      return p.nombre.toLowerCase().includes(f) || (p.sku || '').toLowerCase().includes(f) ||
        p.variaciones.some((v) => v.nombre.toLowerCase().includes(f) || (v.sku || '').toLowerCase().includes(f));
    });
  const btnUsar = (disabled: boolean): CSSProperties => ({
    background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', color: 'var(--df-purple)',
    borderRadius: 7, padding: '5px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
  });
  // Chip que indica si el producto/variante está vinculado a Dropi en el plugin
  // (lo que hace que el pedido de Woo SÍ se empuje a Dropi).
  const chipDropi = (esDropi: boolean) => esDropi
    ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--df-warning)', background: 'var(--df-warning-subtle)', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>Dropi ✓</span>
    : null;
  // Marca los productos que NO están publicados (borrador): no se despachan hasta publicarlos.
  const chipBorrador = (estado: string) => estado && estado !== 'publish'
    ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--df-text-faint)', background: 'var(--df-surface-2)', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>borrador</span>
    : null;
  return (
    <div style={{ marginTop: 8 }}>
      {cat.cargando && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', padding: '6px 2px' }}>Trayendo el catálogo de {nombreProv}…</div>}
      {cat.error && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)', padding: '6px 2px' }}>{cat.error}</div>}
      {cat.productos && (
        <>
          <input
            value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por nombre o código…"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 11px', fontSize: 13, marginBottom: 8 }}
          />
          {!productos.length && (
            (cat.productos && cat.productos.length === 0)
              ? <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', padding: '6px 2px', lineHeight: 1.55 }}>
                  Este WooCommerce de <b>{nombreProv}</b> no tiene productos todavía. Súbelos desde <b>Integraciones → WooCommerce · {nombreProv} → “Enviar productos”</b>, o pídele a {nombreProv} que sincronice su catálogo en esa tienda. Luego vuelve aquí.
                </div>
              : <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', padding: '4px 2px' }}>No hay productos disponibles que coincidan.</div>
          )}
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {productos.map((p) => {
              const variable = p.tipo === 'variable' && p.variaciones.length > 0;
              const exp = abierto === p.id;
              return (
                <div key={p.id} style={{ border: '1px solid var(--df-border)', borderRadius: 8, background: 'var(--df-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre || '(sin nombre)'}</span>
                        {chipDropi(p.dropi)}
                        {chipBorrador(p.estado)}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--df-text-muted)', marginTop: 1 }}>
                        {variable ? `${p.variaciones.length} variantes disponibles` : `SKU: ${p.sku || '—'}`}{!variable && ` · stock: ${p.stock ?? '—'}`}
                      </div>
                    </div>
                    {variable
                      ? <button onClick={() => setAbierto(exp ? null : p.id)} style={btnUsar(false)}>{exp ? 'Cerrar' : 'Ver variantes'}</button>
                      : <button onClick={() => onPick(p.sku, p.nombre)} disabled={!p.sku} title={p.sku ? '' : `Este producto no tiene SKU en ${nombreProv}`} style={btnUsar(!p.sku)}>Usar</button>}
                  </div>
                  {variable && exp && (
                    <div style={{ borderTop: '1px solid var(--df-border)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {p.variaciones.map((v) => (
                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-bg)', borderRadius: 6, padding: '6px 9px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v.nombre}</span>
                              {chipDropi(v.dropi)}
                            </div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--df-text-muted)' }}>SKU: {v.sku || '—'} · stock: {v.stock ?? '—'}</div>
                          </div>
                          <button onClick={() => onPick(v.sku, `${p.nombre} — ${v.nombre}`)} disabled={!v.sku} title={v.sku ? '' : `Esta variante no tiene SKU en ${nombreProv}`} style={btnUsar(!v.sku)}>Usar</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Buscador para vincular el SKU con un producto real del WooCommerce de Effi/Dropi.
 * El dueño pega el código (o el nombre), lo buscamos en su tienda, le mostramos
 * nombre + stock para que confirme, y con un clic le dejamos el SKU correcto.
 * Solo aparece si hay un WooCommerce (Effi/Dropi) conectado.
 */
function VincularSkuEffi({ p, df }: { p: DecoratedProduct; df: DealFlowState }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState(p.sku || '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [resultados, setResultados] = useState<ProductoWoo[]>([]);
  const [vinculado, setVinculado] = useState<ProductoWoo | null>(null);

  const prov = 'effi'; // este vinculador es SOLO de Effi; Dropi tiene el suyo (por ID)
  const [modo, setModo] = useState<'lista' | 'buscar'>('lista');
  const cat = useCatalogoWoo(prov);

  if (!df.wooProveedores.includes('effi')) return null; // sin Effi conectado, no aplica
  const nombreProv = 'Effi';

  const buscar = () => {
    const query = q.trim();
    if (!query) return;
    setCargando(true); setError(''); setBuscado(true); setVinculado(null);
    void apiWooBuscarProductos(query, prov).then((r) => {
      setCargando(false);
      if (r.error || !r.data) { setError(r.error || 'No pudimos buscar.'); setResultados([]); return; }
      setResultados(r.data.productos);
    });
  };
  const vincular = (prod: ProductoWoo) => { p.setSku(prod.sku); setVinculado(prod); setResultados([]); };
  const vincularSku = (sku: string, nombre: string) => { if (!sku) return; p.setSku(sku); setVinculado({ id: 0, nombre, sku, stock: null, precio: '' }); setResultados([]); };
  const tab = (activo: boolean): CSSProperties => ({
    background: activo ? 'var(--df-purple)' : 'transparent', color: activo ? '#fff' : 'var(--df-purple)',
    border: '1px solid var(--df-purple-border)', borderRadius: 7, padding: '5px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
  });

  const btnMini: CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, color: 'var(--df-purple)', cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div style={{ marginTop: 8 }}>
      {!abierto ? (
        <button onClick={() => setAbierto(true)} style={btnMini}>🔗 Vincular con Effi</button>
      ) : (
        <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, padding: 12, background: 'var(--df-bg)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', marginBottom: 8 }}>
            Vincula este producto con su equivalente en <b>{nombreProv}</b> para que te quede el SKU exacto y {nombreProv} sí lo despache. Elígelo de la lista del catálogo o búscalo por código.
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => setModo('lista')} style={tab(modo === 'lista')}>Elegir de la lista</button>
            <button onClick={() => setModo('buscar')} style={tab(modo === 'buscar')}>Buscar por código</button>
          </div>

          {modo === 'lista' && <CatalogoPicker cat={cat} nombreProv={nombreProv} onPick={vincularSku} />}

          {modo === 'buscar' && (<>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="df-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
              placeholder="Código o nombre del producto"
              style={{ flex: 1, minWidth: 180, boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
            />
            <button onClick={buscar} disabled={cargando} style={{ background: 'var(--df-purple)', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: '#fff', cursor: cargando ? 'default' : 'pointer', opacity: cargando ? 0.7 : 1 }}>{cargando ? 'Buscando…' : 'Buscar'}</button>
          </div>

          {error && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--df-danger-dark)' }}>{error}</div>}

          {!!resultados.length && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {resultados.map((prod) => (
                <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 11px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod.nombre || '(producto sin nombre)'}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: 'var(--df-text-muted)', marginTop: 1 }}>
                      SKU: {prod.sku || '— sin SKU en ' + nombreProv} · stock: {prod.stock ?? '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => vincular(prod)}
                    disabled={!prod.sku}
                    title={prod.sku ? '' : `Este producto no tiene SKU en ${nombreProv}; ponle uno allá primero.`}
                    style={{ ...btnMini, opacity: prod.sku ? 1 : 0.5, cursor: prod.sku ? 'pointer' : 'not-allowed' }}
                  >Vincular</button>
                </div>
              ))}
            </div>
          )}

          {buscado && !cargando && !error && !resultados.length && !vinculado && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--df-text-muted)' }}>No encontramos ese producto en {nombreProv}. Revisa el código o busca por el nombre.</div>
          )}
          </>)}

          {vinculado && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--df-brand-subtle)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '9px 12px' }}>
              <span style={{ fontSize: 15 }}>✓</span>
              <div style={{ fontSize: 12.5, color: 'var(--df-brand-dark)', lineHeight: 1.5 }}>
                Vinculado con {nombreProv}: <b>{vinculado.nombre || '(sin nombre)'}</b> · stock <b>{vinculado.stock ?? '—'}</b>.<br />
                <span style={{ color: 'var(--df-text-muted)' }}>Acuérdate de <b>Guardar</b> el producto para que quede.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Vincula cada variante (talla/color) de DealFlow con su VARIACIÓN en Dropi (API
 * directa). Trae las variaciones del producto de Dropi (por su ID = SKU del
 * producto) y para cada variante local muestra un desplegable para elegir la de
 * Dropi. Guarda el ID de la variación en el SKU de la variante. Así el despacho
 * no adivina por texto: usa la variación exacta que vinculaste.
 */
function SkuVariantesDropi({ p, df }: { p: DecoratedProduct; df: DealFlowState }) {
  const [vars, setVars] = useState<DropiProducto['variaciones'] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const dropiId = (p.sku || '').trim();
  useEffect(() => {
    if (!df.dropiConectado || !dropiId) { setVars(null); return; }
    setCargando(true); setError('');
    let cancel = false;
    void apiDropiProducto(dropiId).then((r) => {
      if (cancel) return;
      setCargando(false);
      if (r.error || !r.data) { setError(r.error || 'No pudimos traer las variaciones de Dropi.'); setVars(null); return; }
      setVars(r.data.variaciones || []);
    });
    return () => { cancel = true; };
  }, [df.dropiConectado, dropiId]);
  if (!df.dropiConectado || !dropiId) return null;
  const variantes = (p.variantes || []).filter((v) => (v.label || '').toLowerCase() !== 'única');
  if (!variantes.length) return null;
  const opts = [{ value: '', label: 'Elegir variación de Dropi…' }, ...(vars || []).map((v) => ({ value: String(v.id), label: `${v.atributos}${v.sku ? ` · ${v.sku}` : ''}` }))];
  const vinculadas = variantes.filter((v) => (v.sku || '').trim()).length;
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--df-warning-subtle)', color: 'var(--df-warning)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10 }}>Dr</span>
        Vincular variantes con Dropi
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: vinculadas === variantes.length ? 'var(--df-brand-dark)' : 'var(--df-text-faint)', fontWeight: 600 }}>{vinculadas}/{variantes.length}</span>
      </div>
      <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 10 }}>Elige, para cada talla/color, cuál es su variación en Dropi. Así se despacha la exacta.</div>
      {cargando && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Trayendo variaciones de Dropi…</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--df-danger-dark)' }}>{error}</div>}
      {vars && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {variantes.map((v) => (
            <div key={v.id || v.label} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13, minWidth: 120, flex: '0 0 auto' }}>{v.label}</span>
              {v.id ? (
                <div style={{ flex: 1, minWidth: 180 }}>
                  <Dropdown ariaLabel={`Variación Dropi para ${v.label}`} value={(v.sku || '')} onChange={(val) => df.setVariantSku(p.id, v.id!, val)} options={opts} placeholder="Elegir variación…" />
                </div>
              ) : (
                <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>Guarda el producto primero para vincularla</span>
              )}
            </div>
          ))}
          {!vars.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Ese producto en Dropi no tiene variaciones (es simple). No hace falta vincular variantes.</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Conecta el SKU de CADA variante (talla/color) con su código en Dropi/Effi,
 * para que despache la variante exacta. Reusa el buscador de productos del Woo.
 */
function SkuVariantes({ p, df }: { p: DecoratedProduct; df: DealFlowState }) {
  const prov = 'effi'; // vincular variantes con Effi (Dropi tiene su propio panel por variación)
  const [abierto, setAbierto] = useState(false); // plegable: se puede ocultar
  const cat = useCatalogoWoo(prov);
  if (!df.wooProveedores.includes('effi')) return null;
  const variantes = (p.variantes || []).filter((v) => v.id && (v.label || '').toLowerCase() !== 'única');
  if (!variantes.length) return null;
  const nombreProv = 'Effi';
  const vinculadas = variantes.filter((v) => (v.sku || '').trim()).length;
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
      {/* Cabecera plegable: muestra cuántas variantes están vinculadas y se puede ocultar. */}
      <button
        onClick={() => setAbierto(!abierto)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 13, transition: 'transform .15s', transform: abierto ? 'rotate(90deg)' : 'none', color: 'var(--df-text-muted)' }}>▶</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>Vincular variantes con Effi</span>
        <span style={{ fontSize: 11.5, color: vinculadas === variantes.length ? 'var(--df-brand-dark)' : 'var(--df-text-faint)', fontWeight: 600 }}>
          {vinculadas}/{variantes.length} vinculadas
        </span>
      </button>
      {abierto && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 10 }}>Vincula cada talla/color con su producto en {nombreProv} para que despache la variante exacta. Lo que vinculas a una variante deja de aparecer para las demás.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {variantes.map((v) => (
              <VarSkuRow
                key={v.id}
                label={v.label}
                sku={v.sku || ''}
                nombreProv={nombreProv}
                prov={prov}
                cat={cat}
                usados={new Set(variantes.filter((o) => o.id !== v.id && (o.sku || '').trim()).map((o) => (o.sku || '').trim()))}
                onSet={(s) => df.setVariantSku(p.id, v.id!, s)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VarSkuRow({ label, sku, nombreProv, prov, cat, usados, onSet }: { label: string; sku: string; nombreProv: string; prov: string; cat: CatalogoWoo; usados?: Set<string>; onSet: (sku: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'lista' | 'buscar'>('lista');
  const [q, setQ] = useState(sku || '');
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState<ProductoWoo[]>([]);
  const [error, setError] = useState('');
  const buscar = () => {
    const query = q.trim(); if (!query) return;
    setCargando(true); setError('');
    void apiWooBuscarProductos(query, prov).then((r) => {
      setCargando(false);
      if (r.error || !r.data) { setError(r.error || 'No pudimos buscar.'); setResultados([]); return; }
      setResultados(r.data.productos);
    });
  };
  const usar = (s: string) => { onSet(s); setResultados([]); setQ(s); setAbierto(false); };
  const tab = (activo: boolean): CSSProperties => ({
    background: activo ? 'var(--df-purple)' : 'transparent', color: activo ? '#fff' : 'var(--df-purple)',
    border: '1px solid var(--df-purple-border)', borderRadius: 7, padding: '4px 11px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer',
  });
  // Nombre del producto/variante de Woo al que quedó vinculada (para verlo en verde).
  const nombreVinc = sku ? nombreDeSku(cat, sku) : '';
  return (
    <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 120 }}>{label}</span>
        {sku
          ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: 'var(--df-brand-dark)', background: 'var(--df-brand-subtle)', borderRadius: 6, padding: '2px 8px' }}>SKU: {sku}</span>
          : <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>sin SKU</span>}
        <button onClick={() => setAbierto(!abierto)} style={{ background: 'transparent', border: '1px solid var(--df-purple-border)', color: 'var(--df-purple)', borderRadius: 7, padding: '5px 10px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{abierto ? 'Cerrar' : sku ? 'Cambiar' : '🔎 Vincular'}</button>
      </div>
      {/* Nombre vinculado en verde: para saber a qué producto de Woo quedó atada la variante. */}
      {nombreVinc && (
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--df-brand-dark)', fontWeight: 600 }}>
          <span>✓</span><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreVinc}</span>
        </div>
      )}
      {abierto && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => setModo('lista')} style={tab(modo === 'lista')}>Elegir de la lista</button>
            <button onClick={() => setModo('buscar')} style={tab(modo === 'buscar')}>Buscar por código</button>
          </div>
          {modo === 'lista' ? (
            <CatalogoPicker cat={cat} nombreProv={nombreProv} onPick={usar} usados={usados} />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} placeholder={`Código o nombre en ${nombreProv}`} style={{ flex: 1, minWidth: 140, border: '1px solid var(--df-border)', borderRadius: 7, padding: '7px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }} />
                <button onClick={buscar} disabled={cargando} style={{ background: 'var(--df-purple)', border: 'none', borderRadius: 7, padding: '7px 13px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, color: '#fff', cursor: 'pointer' }}>{cargando ? '…' : 'Buscar'}</button>
              </div>
              {error && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--df-danger-dark)' }}>{error}</div>}
              {!!resultados.length && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {resultados.map((prod) => (
                    <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--df-bg)', border: '1px solid var(--df-border)', borderRadius: 7, padding: '7px 10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod.nombre || '(sin nombre)'}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--df-text-muted)' }}>SKU: {prod.sku || '—'} · stock: {prod.stock ?? '—'}</div>
                      </div>
                      <button onClick={() => usar(prod.sku)} disabled={!prod.sku} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-purple-border)', color: 'var(--df-purple)', borderRadius: 7, padding: '6px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: prod.sku ? 'pointer' : 'not-allowed', opacity: prod.sku ? 1 : 0.5 }}>Vincular</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Editor desplegado de un producto. Se muestra de dos formas según `vista`:
 * - 'normal': todos los grupos abiertos, uno tras otro (como una ficha larga).
 * - 'agrupada': cada grupo es un acordeón; se despliega al hacer clic en su
 *   título, para no tener todo el menú abierto a la vez.
 */
function ProductoEditor({ p, df, vista, openGroups, toggleGroup }: {
  p: DecoratedProduct;
  df: DealFlowState;
  vista: 'normal' | 'agrupada';
  openGroups: Record<string, boolean>;
  toggleGroup: (k: string) => void;
}) {
  const inputStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13 };
  const label: CSSProperties = { color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 };

  const grupos: { id: string; titulo: string; body: ReactNode }[] = [
    {
      id: 'datos',
      titulo: 'Producto',
      body: (
        <>
          {/* Cambiar entre producto físico y servicio (sin tener que borrar y volver a subir). */}
          <div style={{ marginBottom: 12 }}>
            <div style={label}>Tipo</div>
            <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }}>
              {(['producto', 'servicio'] as const).map((t) => {
                const activo = (p.tipo || 'producto') === t;
                return (
                  <button
                    key={t}
                    onClick={() => p.setTipo(t)}
                    style={{ background: activo ? 'var(--df-brand)' : 'var(--df-surface)', color: activo ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '8px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    {t === 'producto' ? '📦 Producto' : '🧩 Servicio'}
                  </button>
                );
              })}
            </div>
          </div>
          {(p.tipo || 'producto') === 'servicio' && (
            <div style={{ marginBottom: 14, maxWidth: 260 }}>
              <div style={label}>Duración <span style={{ fontWeight: 400, color: 'var(--df-text-faint)' }}>· opcional</span></div>
              <input className="df-input" value={p.duracion || ''} onChange={(e) => p.setDuracion(e.target.value)} placeholder="Ej: 45 minutos" style={inputStyle} />
            </div>
          )}
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10, marginBottom: 14, maxWidth: 560 }}>
            <div>
              <div style={label}>Nombre</div>
              <input className="df-input" value={p.nombre} onChange={(e) => p.setNombre(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }} />
            </div>
            <div>
              <div style={label}>Precio (COP)</div>
              <input className="df-input" value={String(p.precio)} onChange={(e) => p.setPrecio(e.target.value)} style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace" }} />
            </div>
          </div>
          <div style={{ maxWidth: 560 }}>
            <div style={label}>SKU <span style={{ fontWeight: 400, color: 'var(--df-text-faint)' }}>· para casar este producto con Dropi/Effi (opcional)</span></div>
            <input className="df-input" value={p.sku || ''} onChange={(e) => p.setSku(e.target.value)} placeholder="Ej: FAJA-NEGRA-M" style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace" }} />
            <SelectorDespachoProducto p={p} df={df} />
            {despachoEfectivo(p, df) === 'dropi' && <VincularDropiApi p={p} df={df} />}
            {despachoEfectivo(p, df) === 'effi' && <VincularSkuEffi p={p} df={df} />}
          </div>
        </>
      ),
    },
    {
      id: 'info',
      titulo: 'Información',
      body: (
        <>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 10 }}>La usa el asistente para vender.</div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={label}>Descripción</div>
              <AutoTextarea value={p.descripcion || ''} onChange={p.setDescripcion} minRows={3} placeholder="Qué es, para quién, por qué es bueno…" style={{ ...inputStyle }} />
            </div>
            <div>
              <div style={label}>Características</div>
              <AutoTextarea value={p.caracteristicas || ''} onChange={p.setCaracteristicas} minRows={3} placeholder="Material, medidas, cuidados…" style={{ ...inputStyle }} />
            </div>
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={label}>Modo de uso · cómo se usa el producto</div>
              <AutoTextarea value={p.modosUso || ''} onChange={p.setModosUso} minRows={2} placeholder="Ej: Aplicar sobre la piel limpia, 2 veces al día…" style={{ ...inputStyle }} />
            </div>
            <div>
              <div style={label}>Contenido del paquete · qué le llega al cliente</div>
              <AutoTextarea value={p.contenidoPaquete || ''} onChange={p.setContenidoPaquete} minRows={2} placeholder="Ej: 1 jogger, 1 bolsa de regalo y guía de tallas." style={{ ...inputStyle }} />
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'mensaje',
      titulo: 'Mensaje inicial',
      body: (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>Fotos, textos y videos que se envían solos cuando el cliente pregunta por el producto.</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: p.mensajeInicialActivo !== false ? 'var(--df-brand)' : 'var(--df-text-faint)', fontWeight: 600 }}>
              {p.mensajeInicialActivo !== false ? 'Encendido' : 'Apagado'}
            </span>
            <span
              onClick={p.toggleMensajeInicial}
              title="Encender o apagar el envío automático del mensaje inicial"
              style={{ width: 40, height: 23, borderRadius: 999, background: p.mensajeInicialActivo !== false ? 'var(--df-brand)' : 'var(--df-border-strong)', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: 2, left: p.mensajeInicialActivo !== false ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: 'var(--df-surface)', transition: 'left .2s', boxShadow: '0 1px 2px rgba(15,23,42,.3)' }} />
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={label}>Disparador · si el primer mensaje se parece a esto, envía todo el mensaje inicial</div>
            <input className="df-input" value={p.disparador || ''} onChange={(e) => p.setDisparador(e.target.value)} placeholder="Ej: ¡Hola! Me interesan los Bota recta ámbar." style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {p.bloquesDecorados.length === 0 && !!(p.mensajeInicial || '').trim() && (
              <div style={{ color: 'var(--df-text-faint)', fontSize: 12, background: 'var(--df-surface)', border: '1px dashed var(--df-border)', borderRadius: 8, padding: '9px 12px' }}>
                Hoy el asistente usa este texto: “{p.mensajeInicial}”. Agrega bloques y los usará en su lugar.
              </div>
            )}
            <BloquesBuilder
              bloques={p.bloquesDecorados}
              moverBloque={p.moverBloque}
              textoDraft={df.bloqueTexto}
              setTextoDraft={df.setBloqueTexto}
              onAddTexto={p.addBloqueTexto}
              onAddImagen={p.addBloqueImagen}
              onAddVideo={p.addBloqueVideo}
              onAddAudio={p.addBloqueAudio}
              placeholderTexto="Escribe un bloque de texto · ej: ¡Claro! Te cuento: 3 joggers por $109.900…"
            />
          </div>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>
            Cuando un cliente pregunte por este producto, el asistente enviará estos bloques en orden, como mensajes de WhatsApp.
          </div>
        </>
      ),
    },
    {
      id: 'combos',
      titulo: 'Combos',
      body: (
        <>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 10 }}>Llevar varias unidades por un precio especial.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {p.bundlesDecorados.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '9px 12px' }}>
                <span style={{ background: 'var(--df-warning-subtle)', color: 'var(--df-warning)', borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{b.cantidad} unidades</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{b.precioFmt}</span>
                {b.etiqueta && <span style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>· {b.etiqueta}</span>}
                <div style={{ flex: 1 }} />
                <span onClick={b.remove} className="df-danger-hover" title="Quitar combo" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="df-input" value={df.bundleCantidad} onChange={(e) => df.setBundleCantidad(e.target.value)} placeholder="Cantidad · ej: 3" style={{ width: 120, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
            <input className="df-input" value={df.bundlePrecio} onChange={(e) => df.setBundlePrecio(e.target.value)} placeholder="Precio total (COP) · ej: 109900" style={{ width: 200, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
            <input className="df-input" value={df.bundleEtiqueta} onChange={(e) => df.setBundleEtiqueta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') p.addBundle(); }} placeholder="Etiqueta opcional · ej: ¡El más pedido!" style={{ flex: 1, minWidth: 160, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }} />
            <button onClick={p.addBundle} className="df-btn-outline-green" style={{ background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Agregar combo</button>
          </div>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>
            El asistente ofrece estos combos para subir el ticket (ej: 3 por $109.900 en vez de $180.000).
          </div>
        </>
      ),
    },
    {
      id: 'multimedia',
      titulo: 'Multimedia',
      body: (
        <>
          <div style={SUBLABEL}>Fotos principales · las que envía el asistente al ofrecer el producto</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            {p.fotosMain.map((f, i) => (<div key={i} style={f.tileStyle}>{f.label}</div>))}
            {p.uploadedMain.map((src, i) => (<UploadedThumb key={i} src={src} size={64} onRemove={() => p.removeMainFoto(i)} />))}
            <PhotoDropTile size={64} onFiles={p.addMainFotos} />
          </div>
          {df.mediaWarn && <div style={{ color: 'var(--df-danger)', fontSize: 12, marginBottom: 12 }}>{df.mediaWarn}</div>}
          <div style={{ ...SUBLABEL, marginTop: 16 }}>Testimonios · capturas de clientes felices que el asistente puede enviar</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            {p.testimoniosList.map((src, i) => (<UploadedThumb key={i} src={src} size={64} onRemove={() => p.removeTestimonio(i)} />))}
            <PhotoDropTile size={64} label="Subir captura" onFiles={p.addTestimonios} />
          </div>
          <div style={{ ...SUBLABEL, marginTop: 16 }}>Videos del producto</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            {p.videosList.map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <video src={src} controls style={{ width: 180, borderRadius: 10, background: '#0F172A', display: 'block' }} />
                <span onClick={() => p.removeVideo(i)} title="Quitar video" style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#0F172A', color: '#fff', fontSize: 10, lineHeight: '18px', textAlign: 'center', cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.3)' }}>✕</span>
              </div>
            ))}
            <PhotoDropTile size={64} label="Subir video" accept="video/*" onFiles={p.addVideos} />
          </div>
          {df.videoWarn && <div style={{ color: 'var(--df-danger)', fontSize: 12, marginTop: 8 }}>{df.videoWarn}</div>}
        </>
      ),
    },
    {
      id: 'variantes',
      titulo: 'Variantes',
      body: (
        <>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 10 }}>Color, Talla… El asistente las ofrece al cliente.</div>
          <OpcionesEditor p={p} />
          <BotonGenerarVariantes p={p} df={df} />
          {despachoEfectivo(p, df) === 'dropi' && <SkuVariantesDropi p={p} df={df} />}
          {despachoEfectivo(p, df) === 'effi' && <SkuVariantes p={p} df={df} />}
        </>
      ),
    },
    {
      id: 'reglas',
      titulo: 'Reglas y preguntas',
      body: (
        <>
          <div style={SUBLABEL}>Reglas para el asistente · agrega todas las que necesites</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {p.reglasDecoradas.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px' }}>
                <span style={{ color: 'var(--df-brand)', fontWeight: 700, flexShrink: 0, marginTop: 6 }}>✓</span>
                <AutoTextarea
                  value={r.texto}
                  onChange={(v) => r.editar(v)}
                  style={{ flex: 1, fontSize: 13, lineHeight: 1.5, border: '1px solid transparent', background: 'transparent', borderRadius: 6, padding: '4px 6px', fontFamily: 'inherit', color: 'var(--df-text-strong)' }}
                  onFocus={(e) => { e.currentTarget.style.background = 'var(--df-bg)'; e.currentTarget.style.borderColor = 'var(--df-border)'; }}
                  onBlur={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                />
                <span onClick={r.remove} className="df-danger-hover" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2, marginTop: 6 }}>✕</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input className="df-input" value={df.productRuleDraft} onChange={(e) => df.setProductRuleDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') p.addRegla(); }} placeholder="Escribe una regla nueva para este producto…" style={{ flex: 1, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }} />
            <button onClick={p.addRegla} className="df-btn-outline-green" style={{ background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Agregar regla</button>
          </div>
          <div style={SUBLABEL}>Preguntas frecuentes · el asistente responde con esto</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {p.faqsDecoradas.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    value={f.pregunta}
                    onChange={(e) => f.editar('pregunta', e.target.value)}
                    placeholder="Pregunta"
                    style={{ fontSize: 13, fontWeight: 600, border: '1px solid transparent', background: 'transparent', borderRadius: 6, padding: '4px 6px', fontFamily: 'inherit', color: 'var(--df-text-strong)' }}
                    onFocus={(e) => { e.currentTarget.style.background = 'var(--df-bg)'; e.currentTarget.style.borderColor = 'var(--df-border)'; }}
                    onBlur={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                  />
                  <AutoTextarea
                    value={f.respuesta}
                    onChange={(v) => f.editar('respuesta', v)}
                    placeholder="Respuesta"
                    style={{ fontSize: 13, color: 'var(--df-text-muted)', border: '1px solid transparent', background: 'transparent', borderRadius: 6, padding: '4px 6px', fontFamily: 'inherit', lineHeight: 1.5 }}
                    onFocus={(e) => { e.currentTarget.style.background = 'var(--df-bg)'; e.currentTarget.style.borderColor = 'var(--df-border)'; e.currentTarget.style.color = 'var(--df-text-strong)'; }}
                    onBlur={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--df-text-muted)'; }}
                  />
                </div>
                <span onClick={f.remove} className="df-danger-hover" style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2, marginTop: 6 }}>✕</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="df-input" value={df.faqP} onChange={(e) => df.setFaqP(e.target.value)} placeholder="Pregunta · ej: ¿Hacen envíos a Pasto?" style={{ flex: 1, minWidth: 180, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }} />
            <input className="df-input" value={df.faqR} onChange={(e) => df.setFaqR(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') p.addFaq(); }} placeholder="Respuesta" style={{ flex: 1, minWidth: 180, border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }} />
            <button onClick={p.addFaq} className="df-btn-outline-green" style={{ background: 'var(--df-surface)', color: 'var(--df-brand)', border: '1px solid var(--df-brand)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Agregar</button>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="df-pexp" style={{ background: 'var(--df-bg)', borderBottom: '1px solid var(--df-border)', padding: '18px 18px 18px 84px' }}>
      {p.bloqueado && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-warning-subtle)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <div style={{ fontSize: 13, color: 'var(--df-warning)', lineHeight: 1.5 }}>
              <b>Producto de la biblioteca.</b> Su estructura (mensaje inicial, reglas, descripción, combos, variantes) está <b>bloqueada</b> para proteger la venta con el bot. Solo puedes ajustar el <b>precio</b> y el <b>SKU</b> de tu tienda.
            </div>
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, maxWidth: 560 }}>
            <div>
              <div style={label}>Precio (COP) <span style={{ fontWeight: 400, color: 'var(--df-text-faint)' }}>· tu precio de venta</span></div>
              <input className="df-input" value={String(p.precio)} onChange={(e) => p.setPrecio(e.target.value)} style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace" }} />
            </div>
            <div>
              <div style={label}>SKU <span style={{ fontWeight: 400, color: 'var(--df-text-faint)' }}>· para Effi/WooCommerce</span></div>
              <input className="df-input" value={p.sku || ''} onChange={(e) => p.setSku(e.target.value)} placeholder="Ej: BODY-NEGRO-M" style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace" }} />
            </div>
          </div>
          <div style={{ maxWidth: 560, marginBottom: 16 }}>
            <SelectorDespachoProducto p={p} df={df} />
            {despachoEfectivo(p, df) === 'dropi' && <VincularDropiApi p={p} df={df} />}
            {despachoEfectivo(p, df) === 'effi' && <VincularSkuEffi p={p} df={df} />}
          </div>
        </>
      )}
      {/* Cuando está bloqueado, la estructura se muestra como REFERENCIA (no editable). */}
      <div style={p.bloqueado ? { pointerEvents: 'none', opacity: 0.6, userSelect: 'none' } : undefined}>
      {grupos.map((g) => {
        const key = `${p.id}::${g.id}`;
        const abierto = vista === 'normal' || !!openGroups[key];
        return (
          <div key={g.id} style={{ marginBottom: vista === 'agrupada' ? 8 : 18 }}>
            {vista === 'agrupada' ? (
              <div
                onClick={() => toggleGroup(key)}
                className="df-row-hover"
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '11px 14px', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10 }}
              >
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--df-text)', letterSpacing: '-0.01em' }}>{g.titulo}</span>
                <div style={{ flex: 1 }} />
                <span style={{ color: 'var(--df-text-faint)', fontSize: 13, display: 'inline-block', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
              </div>
            ) : (
              <div style={TITULO_NEGRO}>{g.titulo}</div>
            )}
            {abierto && <div style={{ paddingTop: vista === 'agrupada' ? 12 : 0 }}>{g.body}</div>}
          </div>
        );
      })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <button
          onClick={p.requestDelete}
          style={
            p.deleteArmed
              ? { background: 'var(--df-danger)', color: '#fff', border: '1px solid var(--df-danger)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
              : { background: 'var(--df-surface)', color: 'var(--df-danger)', border: '1px solid var(--df-danger-border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
          }
        >
          {p.deleteArmed ? '¿Seguro? Sí, eliminar' : 'Eliminar producto'}
        </button>
        <div style={{ flex: 1 }} />
        {p.saved && <span style={{ color: 'var(--df-brand)', fontSize: 13, fontWeight: 600 }}>✓ Producto guardado. El asistente ya lo ofrece así.</span>}
        <button onClick={p.save} className="df-btn-primary" style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Guardar producto</button>
      </div>
    </div>
  );
}

export function Productos({ df }: { df: DealFlowState }) {
  const [vista, setVista] = useState<'normal' | 'agrupada'>(() => {
    try { return localStorage.getItem('df_prod_vista') === 'agrupada' ? 'agrupada' : 'normal'; } catch { return 'normal'; }
  });
  const cambiarVista = (v: 'normal' | 'agrupada') => { setVista(v); try { localStorage.setItem('df_prod_vista', v); } catch { /* modo privado */ } };
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setOpenGroups((o) => ({ ...o, [k]: !o[k] }));

  // Detecta productos que comparten el MISMO disparador (o el mismo nombre): el bot
  // se confunde y puede enviar la versión equivocada. Suele pasar al importar un
  // producto de la biblioteca que la tienda ya tenía → queda duplicado.
  const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const claves = new Map<string, string[]>();
  for (const p of df.products) {
    const clave = norm(p.disparador) || 'n:' + norm(p.nombre);
    if (!clave || clave === 'n:') continue;
    claves.set(clave, [...(claves.get(clave) || []), p.nombre]);
  }
  const duplicados = [...claves.values()].filter((v) => v.length > 1);

  return (
    <section data-screen-label="Productos">
      {duplicados.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--df-warning-subtle)', border: '1px solid var(--df-warning-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 13, color: 'var(--df-warning)', lineHeight: 1.5 }}>
            <b>Hay productos duplicados</b> (mismo disparador o nombre). El bot puede enviar la versión vieja/importada en vez de la que editaste. Deja <b>solo uno</b> de cada grupo y elimina el repetido:
            <div style={{ marginTop: 4 }}>{duplicados.map((g, i) => <div key={i}>• {g.join('  ·  ')}</div>)}</div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Productos</h1>
          <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>{df.productCount} productos en tu catálogo. Toca uno para editarlo.</p>
        </div>
        <div style={{ flex: 1 }} />
        {/* Switch de vista: normal (todo abierto) o agrupada (secciones acordeón) */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }} title="Cómo se ve el editor del producto">
          {(['normal', 'agrupada'] as const).map((v) => (
            <button
              key={v}
              onClick={() => cambiarVista(v)}
              style={{ background: vista === v ? '#0F172A' : 'var(--df-surface)', color: vista === v ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
            >
              {v === 'normal' ? 'Vista normal' : 'Vista agrupada'}
            </button>
          ))}
        </div>
        <button
          onClick={df.toggleNewProduct}
          className="df-btn-primary"
          style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          + Nuevo producto
        </button>
      </div>

      {df.newProductOpen && (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Nuevo {df.newProdTipo === 'servicio' ? 'servicio' : 'producto'}</div>

          {/* Producto físico o servicio */}
          <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden', marginBottom: 14 }}>
            {(['producto', 'servicio'] as const).map((t) => (
              <button
                key={t}
                onClick={() => df.setNewProdTipo(t)}
                style={{ background: df.newProdTipo === t ? 'var(--df-brand)' : 'var(--df-surface)', color: df.newProdTipo === t ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '8px 18px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t === 'producto' ? '📦 Producto' : '🧩 Servicio'}
              </button>
            ))}
          </div>

          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Nombre</div>
              <input
                className="df-input"
                value={df.newProdNombre}
                onChange={(e) => df.setNewProdNombre(e.target.value)}
                placeholder={df.newProdTipo === 'servicio' ? 'Ej: Corte de cabello' : 'Ej: Chaqueta bomber'}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
            <div>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio (COP){df.newProdTipo === 'servicio' ? ' · 0 = gratis' : ''}</div>
              <input
                className="df-input"
                value={df.newProdPrecio}
                onChange={(e) => df.setNewProdPrecio(e.target.value)}
                placeholder={df.newProdTipo === 'servicio' ? 'Ej: 25000' : 'Ej: 79900'}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
              />
            </div>
          </div>

          {df.newProdTipo === 'servicio' && (
            <div style={{ marginBottom: 14, maxWidth: 240 }}>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Duración (opcional)</div>
              <input
                className="df-input"
                value={df.newProdDuracion}
                onChange={(e) => df.setNewProdDuracion(e.target.value)}
                placeholder="Ej: 30 min, 1 h, mensual"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={df.crearProducto}
              className="df-btn-primary"
              style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Crear {df.newProdTipo === 'servicio' ? 'servicio' : 'producto'}
            </button>
            <button
              onClick={df.toggleNewProduct}
              style={{ background: 'var(--df-surface)', color: 'var(--df-text-muted)', border: '1px solid var(--df-border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            {df.newProdError && <span style={{ color: 'var(--df-danger)', fontSize: 13 }}>Falta el nombre o el precio. Complétalos y vuelve a intentar.</span>}
          </div>
          <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginTop: 10 }}>Al abrirlo agregas fotos, videos, opciones (Color, Talla…), combos y reglas.</div>
        </div>
      )}

      {df.products.length === 0 && !df.newProductOpen && (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aún no tienes productos.</div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 13.5 }}>Crea el primero y el asistente empieza a ofrecerlo en WhatsApp.</div>
          <button
            onClick={df.toggleNewProduct}
            className="df-btn-primary"
            style={{ background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            + Crear mi primer producto
          </button>
        </div>
      )}

      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: df.products.length === 0 ? 'none' : 'block' }}>
        {df.products.map((p) => (
          <div key={p.id}>
            <div
              onClick={p.toggle}
              className="df-row-hover df-prow"
              style={{ display: 'grid', gridTemplateColumns: '52px 1fr 120px 130px 24px', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--df-border)', cursor: 'pointer' }}
            >
              {p.previewImg
                ? <img src={p.previewImg} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(15,23,42,.08)' }} />
                : <div style={p.fotoStyle}>{p.iniciales}</div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  {p.nombre}
                  {p.tipo === 'servicio' && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--df-indigo)', background: 'var(--df-indigo-subtle)', borderRadius: 5, padding: '1px 6px' }}>🧩 SERVICIO</span>}
                  {p.bloqueado && <span title="Producto de la biblioteca: estructura bloqueada" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--df-warning)', background: 'var(--df-warning-subtle)', border: '1px solid var(--df-warning-border)', borderRadius: 5, padding: '1px 6px' }}>🔒 BIBLIOTECA</span>}
                </div>
                <div style={{ color: 'var(--df-text-muted)', fontSize: 12, marginTop: 1 }}>{p.precioFmt}{p.tipo === 'servicio' ? (p.duracion ? ' · ' + p.duracion : '') : ' · ' + p.variantesLabel}</div>
              </div>
              <div className="df-prow-price" style={{ fontWeight: 700, fontSize: 14 }}>{p.precioFmt}</div>
              <span style={p.stockPill}>{p.stockLabel}</span>
              <span style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{p.chevron}</span>
            </div>

            {p.expanded && <ProductoEditor p={p} df={df} vista={vista} openGroups={openGroups} toggleGroup={toggleGroup} />}
          </div>
        ))}
      </div>
    </section>
  );
}
