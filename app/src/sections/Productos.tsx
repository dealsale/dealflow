import { useState, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { PhotoAddChip, PhotoDropTile, UploadedThumb } from '../components/PhotoUpload';
import { AutoTextarea } from '../components/AutoTextarea';
import { BloquesBuilder } from '../components/BloquesBuilder';
import type { Variante, Opcion } from '../types';
import type { DealFlowState, DecoratedProduct } from '../hooks/useDealFlowState';


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

// Metadatos de cada integración (mismo formato para las tres).
type IntegId = 'dropi' | 'effi' | 'shopify';
const INTEGRACIONES: { id: IntegId; nombre: string; logo?: string; color: string; placeholder: string }[] = [
  { id: 'dropi', nombre: 'Dropi', logo: '/logos/dropi.jpg', color: 'var(--df-warning)', placeholder: 'ID / código en Dropi' },
  { id: 'effi', nombre: 'Effi', logo: '/logos/effi.png', color: 'var(--df-purple)', placeholder: 'Referencia de Effi (ej: 35)' },
  { id: 'shopify', nombre: 'Shopify', color: '#5E8E3E', placeholder: 'SKU en Shopify' },
];

/**
 * Panel UNIFICADO de conexiones por variante. Un producto puede estar en varias
 * integraciones a la vez (Dropi, Effi, Shopify), cada una con su código por variante.
 * Un sub-panel plegable por integración CONECTADA, todos en el MISMO formato.
 */
function ConexionesVariantes({ p, df }: { p: DecoratedProduct; df: DealFlowState }) {
  useEffect(() => { void df.cargarShopify?.(); }, []); // saber si Shopify está conectado
  const variantes = (p.variantes || []).filter((v) => v.id && (v.label || '').toLowerCase() !== 'única');
  const conectada = (id: IntegId) => id === 'dropi' ? df.dropiConectado
    : id === 'effi' ? (df.wooProveedores.includes('effi') || !!df.effiWoo?.activo)
      : df.shopifyConectado;
  const activas = INTEGRACIONES.filter((i) => conectada(i.id));
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--df-border)', paddingTop: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4, letterSpacing: '.02em' }}>🔗 Conexiones por variante</div>
      <div style={{ color: 'var(--df-text-faint)', fontSize: 12, marginBottom: 10 }}>
        Pon el código de cada variante en cada integración donde vendes este producto. El despacho usa el código de la integración por la que se envía. Se guarda al salir del campo.
      </div>
      {!variantes.length && <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>Primero genera las variantes (arriba) para poder vincularlas.</div>}
      {!!variantes.length && !activas.length && (
        <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)' }}>No tienes integraciones conectadas. Conecta Dropi, Effi o Shopify en <b>Integraciones</b> y aquí aparecerá un panel por cada una.</div>
      )}
      {!!variantes.length && activas.map((integ) => (
        <PanelIntegracion key={integ.id} integ={integ} p={p} df={df} variantes={variantes} />
      ))}
    </div>
  );
}

function PanelIntegracion({ integ, p, df, variantes }: { integ: { id: IntegId; nombre: string; logo?: string; color: string; placeholder: string }; p: DecoratedProduct; df: DealFlowState; variantes: Variante[] }) {
  const [abierto, setAbierto] = useState(false);
  const [orden, setOrden] = useState<'def' | 'color' | 'talla'>('def');
  const [publicando, setPublicando] = useState(false);
  // Valor por variante: refs[integracion] y, para Effi, cae al sku legado.
  const valorDe = (v: Variante) => (v.refs?.[integ.id] ?? (integ.id === 'effi' ? (v.sku || '') : '')) || '';
  const conectadas = variantes.filter((v) => valorDe(v).trim()).length;
  const completo = conectadas === variantes.length && variantes.length > 0;
  const mostradas = orden === 'def' ? variantes : ordenarVariantes(variantes, p.opciones, orden);
  const btnOrden = (modo: 'def' | 'color' | 'talla'): CSSProperties => ({
    background: orden === modo ? integ.color : 'var(--df-surface)', color: orden === modo ? '#fff' : 'var(--df-text-secondary)',
    border: `1px solid ${orden === modo ? integ.color : 'var(--df-border)'}`, borderRadius: 7, padding: '3px 9px',
    fontFamily: 'inherit', fontWeight: 600, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
  });
  return (
    <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      <button onClick={() => setAbierto((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: abierto ? 'var(--df-bg)' : 'var(--df-surface)', border: 'none', padding: '10px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: 12, color: 'var(--df-text-faint)', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
        {integ.logo
          ? <img src={integ.logo} alt={integ.nombre} style={{ height: 18, width: integ.id === 'dropi' ? 18 : 'auto', borderRadius: integ.id === 'dropi' ? 5 : 0, objectFit: 'cover' }} />
          : <span style={{ width: 20, height: 18, borderRadius: 4, background: integ.color, color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Sh</span>}
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left' }}>{integ.nombre}</span>
        {completo && <span style={{ color: integ.color, fontSize: 12 }}>✓</span>}
        <span style={{ fontSize: 11.5, fontWeight: 700, color: completo ? integ.color : 'var(--df-text-faint)' }}>{conectadas}/{variantes.length}</span>
      </button>
      {abierto && (
        <div style={{ padding: 12, borderTop: '1px solid var(--df-border)' }}>
          {integ.id === 'shopify' && (
            <div style={{ background: 'var(--df-bg)', border: '1px dashed var(--df-border)', borderRadius: 9, padding: '9px 11px', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginBottom: 8, lineHeight: 1.45 }}>
                ¿No existe este producto en Shopify todavía? Créalo allá con un clic: DealFlow sube el nombre, la descripción, las variantes con su precio y un SKU, y deja el vínculo listo. Se crea como <b>borrador</b> para que lo revises antes de publicarlo.
              </div>
              <button
                onClick={() => { setPublicando(true); df.publicarEnShopify(String(p.id), false, () => setPublicando(false)); }}
                disabled={publicando}
                style={{ background: integ.color, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: publicando ? 0.6 : 1 }}
              >{publicando ? 'Creando en Shopify…' : '🛍️ Crear este producto en Shopify'}</button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--df-text-faint)', fontWeight: 600 }}>Ordenar:</span>
            <button onClick={() => setOrden('def')} style={btnOrden('def')}>Por defecto</button>
            <button onClick={() => setOrden('color')} style={btnOrden('color')}>Por color</button>
            <button onClick={() => setOrden('talla')} style={btnOrden('talla')}>Por talla</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mostradas.map((v) => (
              <VarSkuInput key={v.id} label={v.label} sku={valorDe(v)} placeholder={integ.placeholder} accent={integ.color} onSave={(s) => df.setVariantRef(p.id, v.id!, integ.id, s)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Rango de tallas para ordenar cuando el producto no define el grupo "Talla".
const RANGO_TALLA: Record<string, number> = { xs: 0, s: 1, m: 2, l: 3, xl: 4, xxl: 5, '2xl': 5, xxxl: 6, '3xl': 6, unica: 99 };
const normTok = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Ordena las variantes agrupando por COLOR o por TALLA (para gestionarlas: tener
 * todos los amarillos juntos, o todas las M juntas). Usa el orden que el dueño
 * definió en las opciones (Color/Talla); si no hay, adivina la talla por su rango.
 */
function ordenarVariantes(variantes: Variante[], opciones: Opcion[] | undefined, modo: 'color' | 'talla'): Variante[] {
  const gc = (opciones || []).find((g) => /color/i.test(g.nombre));
  const gt = (opciones || []).find((g) => /(talla|tama|size)/i.test(g.nombre));
  const colores = (gc?.valores || []).map((v) => normTok(v.valor));
  const tallas = (gt?.valores || []).map((v) => normTok(v.valor));
  const analiza = (label: string) => {
    const tokens = label.split(/[·\-–—/,|]+/).map((t) => normTok(t)).filter(Boolean);
    let color = ''; let talla = '';
    for (const t of tokens) { if (!color && colores.includes(t)) color = t; else if (!talla && tallas.includes(t)) talla = t; }
    if (!talla) talla = tokens.find((t) => t in RANGO_TALLA) || '';
    if (!color) color = tokens.find((t) => t !== talla) || label.toLowerCase();
    return { color, talla };
  };
  const iColor = (c: string) => { const i = colores.indexOf(c); return i < 0 ? 999 : i; };
  const iTalla = (t: string) => { const i = tallas.indexOf(t); if (i >= 0) return i; return t in RANGO_TALLA ? 100 + RANGO_TALLA[t] : 999; };
  return [...variantes].sort((a, b) => {
    const A = analiza(a.label); const B = analiza(b.label);
    if (modo === 'color') return iColor(A.color) - iColor(B.color) || A.color.localeCompare(B.color) || iTalla(A.talla) - iTalla(B.talla) || a.label.localeCompare(b.label);
    return iTalla(A.talla) - iTalla(B.talla) || A.talla.localeCompare(B.talla) || iColor(A.color) - iColor(B.color) || a.label.localeCompare(b.label);
  });
}

function VarSkuInput({ label, sku, onSave, placeholder, accent }: { label: string; sku: string; onSave: (sku: string) => void; placeholder?: string; accent?: string }) {
  const [val, setVal] = useState(sku || '');
  useEffect(() => { setVal(sku || ''); }, [sku]); // refleja cambios externos (ej. generar variantes)
  const guardar = () => { const t = val.trim(); if (t !== (sku || '')) onSave(t); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 11px' }}>
      <span style={{ fontWeight: 600, fontSize: 13, minWidth: 120, flex: '0 0 auto' }}>{label}</span>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={placeholder || 'Referencia / código'}
        style={{ flex: 1, minWidth: 160, boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 11px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
      />
      {(val || '').trim() ? <span style={{ fontSize: 15, color: accent || 'var(--df-brand)' }}>✓</span> : <span style={{ fontSize: 11.5, color: 'var(--df-text-faint)' }}>sin código</span>}
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
            <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 6 }}>Vincula este producto con Dropi, Effi y/o Shopify en la pestaña <b>Variantes → Conexiones por variante</b>.</div>
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
          <ConexionesVariantes p={p} df={df} />
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
            <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 6 }}>Vincula este producto con Dropi, Effi y/o Shopify en la pestaña <b>Variantes → Conexiones por variante</b>.</div>
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
