import { useState } from 'react';
import type { DealFlowState } from '../../hooks/useDealFlowState';
import { fmt } from '../../lib/format';
import { Dropdown } from '../../components/Dropdown';

/** Panel del superadmin: todas las tiendas + la Biblioteca de productos. */
export function Superadmin({ df }: { df: DealFlowState }) {
  const [tab, setTab] = useState<'tiendas' | 'biblioteca'>('tiendas');
  return (
    <section data-screen-label="Superadmin">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Superadmin</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>Gestiona todas las tiendas y la biblioteca de productos que los clientes pueden importar.</p>
      </div>
      <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden', marginBottom: 18 }}>
        {(['tiendas', 'biblioteca'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: tab === t ? '#0F172A' : 'var(--df-surface)', color: tab === t ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '8px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t === 'tiendas' ? 'Todas las tiendas' : 'Biblioteca de productos'}
          </button>
        ))}
      </div>
      {tab === 'tiendas' ? <Tiendas df={df} /> : <BibliotecaAdmin df={df} />}
    </section>
  );
}

function Tiendas({ df }: { df: DealFlowState }) {
  const visibles = df.superStores.filter((s) => !s.oculta).length;
  const ocultas = df.superStores.length - visibles;
  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{df.superStores.length}</div>
        </div>
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}>Visibles para el admin</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--df-brand-dark)' }}>{visibles}</div>
        </div>
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600 }}>Fantasma (ocultas)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--df-purple)' }}>{ocultas}</div>
        </div>
      </div>
      {df.superStores.length === 0 ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>No hay tiendas todavía.</div>
      ) : (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 130px 120px 160px', gap: 14, padding: '11px 18px', borderBottom: '1px solid var(--df-border)', color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <span>Tienda</span><span>Plan</span><span>Ventas del mes</span><span>Estado</span><span>Visibilidad</span>
          </div>
          {df.superStores.map((s) => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 130px 120px 160px', gap: 14, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid var(--df-border)', background: s.oculta ? '#FAF5FF' : 'var(--df-surface)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.tienda}</div>
                <div style={{ color: 'var(--df-text-faint)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.correo}</div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Plan {s.plan}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{s.ventas > 0 ? fmt(s.ventas) : '—'}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: s.activa ? 'var(--df-brand-dark)' : 'var(--df-danger-dark)', background: s.activa ? 'var(--df-brand-subtle)' : 'var(--df-danger-subtle-2)', borderRadius: 6, padding: '3px 9px', justifySelf: 'start' }}>{s.activa ? 'Activa' : 'Inactiva'}</span>
              <button onClick={() => df.toggleHideStore(s.id, s.oculta)}
                style={{ border: '1px solid ' + (s.oculta ? 'var(--df-purple)' : 'var(--df-border)'), background: s.oculta ? 'var(--df-purple)' : 'var(--df-surface)', color: s.oculta ? '#fff' : 'var(--df-text-body)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {s.oculta ? '👻 Oculta · Mostrar' : 'Ocultar del admin'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function BibliotecaAdmin({ df }: { df: DealFlowState }) {
  const [tiendaSel, setTiendaSel] = useState('');
  const [prodSel, setProdSel] = useState('');
  const [gratis, setGratis] = useState(true);
  const [precio, setPrecio] = useState('');
  const [editable, setEditable] = useState(true); // ¿el cliente podrá editar su estructura?

  const elegirTienda = (id: string) => { setTiendaSel(id); setProdSel(''); df.cargarProductosDeTienda(id); };
  const enviar = () => {
    if (!prodSel) return;
    df.enviarProductoABiblioteca(prodSel, gratis, gratis ? 0 : parseInt(precio.replace(/[^0-9]/g, ''), 10) || 0, editable);
    setProdSel(''); setPrecio('');
  };

  return (
    <>
      {/* Agregar producto a la biblioteca desde una tienda */}
      <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Agregar un producto a la biblioteca</div>
        <div style={{ color: 'var(--df-text-faint)', fontSize: 12.5, marginBottom: 12 }}>Elige una tienda y uno de sus productos: se clona completo (reglas, fotos, estructura) a la biblioteca.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Tienda</div>
            <Dropdown
              value={tiendaSel}
              onChange={elegirTienda}
              placeholder="Elige una tienda…"
              options={[{ value: '', label: 'Elige una tienda…' }, ...df.superStores.map((s) => ({ value: s.id, label: s.tienda }))]}
            />
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Producto</div>
            <Dropdown
              value={prodSel}
              onChange={setProdSel}
              placeholder={tiendaSel ? (df.superStoreProducts.length ? 'Elige un producto…' : 'Esta tienda no tiene productos') : 'Primero elige la tienda'}
              options={[
                { value: '', label: tiendaSel ? (df.superStoreProducts.length ? 'Elige un producto…' : 'Esta tienda no tiene productos') : 'Primero elige la tienda' },
                ...df.superStoreProducts.map((p) => ({ value: p.id, label: `${p.nombre} · ${fmt(p.precio)}` })),
              ]}
            />
          </div>
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Tipo</div>
            <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden' }}>
              {([[true, 'Gratis'], [false, 'De pago']] as const).map(([g, label]) => (
                <button key={label} onClick={() => setGratis(g)}
                  style={{ background: gratis === g ? '#0F172A' : 'var(--df-surface)', color: gratis === g ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
          </div>
          {!gratis && (
            <div style={{ width: 170 }}>
              <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio de importación</div>
              <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: 49900"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
            </div>
          )}
          <div>
            <div style={{ color: 'var(--df-text-muted)', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Edición del cliente</div>
            <div style={{ display: 'inline-flex', border: '1px solid var(--df-border)', borderRadius: 8, overflow: 'hidden' }}>
              {([[true, 'Editable'], [false, '🔒 Bloqueado']] as const).map(([e, label]) => (
                <button key={label} onClick={() => setEditable(e)}
                  style={{ background: editable === e ? '#0F172A' : 'var(--df-surface)', color: editable === e ? '#fff' : 'var(--df-text-body)', border: 'none', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
          </div>
          <button onClick={enviar} disabled={!prodSel} className="df-btn-primary"
            style={{ background: prodSel ? 'var(--df-purple)' : '#C4B5FD', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: prodSel ? 'pointer' : 'default' }}>
            Enviar a biblioteca
          </button>
        </div>
      </div>

      {/* Productos ya en la biblioteca */}
      {df.superBiblioteca.length === 0 ? (
        <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: 'var(--df-text-muted)', fontSize: 14 }}>
          La biblioteca está vacía. Agrega el primer producto arriba.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {df.superBiblioteca.map((p) => (
            <div key={p.id} style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
              <div style={{ height: 130, background: 'var(--df-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {p.portada ? <img src={p.portada} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--df-border-strong)', fontSize: 28 }}>🛍️</span>}
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => df.actualizarBibliotecaItem(p.id, { gratis: !p.gratis })}
                    style={{ border: '1px solid ' + (p.gratis ? 'var(--df-brand-border)' : 'var(--df-purple-border)'), background: p.gratis ? 'var(--df-brand-subtle-2)' : '#F5F3FF', color: p.gratis ? 'var(--df-brand-dark)' : 'var(--df-purple)', borderRadius: 7, padding: '4px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    {p.gratis ? 'Gratis' : 'De pago'}
                  </button>
                  {!p.gratis && (
                    <input defaultValue={p.precioImportacion || ''} placeholder="Precio"
                      onBlur={(e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0; if (v !== p.precioImportacion) df.actualizarBibliotecaItem(p.id, { precioImportacion: v }); }}
                      style={{ width: 100, border: '1px solid var(--df-border)', borderRadius: 7, padding: '5px 8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }} />
                  )}
                </div>
                <button onClick={() => df.actualizarBibliotecaItem(p.id, { editable: !p.editable })}
                  title={p.editable ? 'Los clientes pueden editar su estructura' : 'Estructura bloqueada: el cliente no puede editarla'}
                  style={{ alignSelf: 'flex-start', border: '1px solid ' + (p.editable ? 'var(--df-border)' : 'var(--df-warning-border)'), background: p.editable ? 'var(--df-surface)' : 'var(--df-warning-subtle-2)', color: p.editable ? 'var(--df-text-body)' : 'var(--df-warning)', borderRadius: 7, padding: '4px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {p.editable ? 'Editable' : '🔒 Bloqueado'}
                </button>
                <div style={{ color: 'var(--df-text-faint)', fontSize: 12 }}>{p.importos} {p.importos === 1 ? 'tienda lo importó' : 'tiendas lo importaron'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => df.actualizarBibliotecaItem(p.id, { activo: !p.activo })}
                    style={{ flex: 1, border: '1px solid ' + (p.activo ? 'var(--df-border)' : 'var(--df-warning-border)'), background: p.activo ? 'var(--df-surface)' : 'var(--df-warning-subtle-2)', color: p.activo ? 'var(--df-text-body)' : 'var(--df-warning)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                    {p.activo ? 'Visible · ocultar' : 'Oculto · mostrar'}
                  </button>
                  <span onClick={() => df.eliminarBibliotecaItem(p.id)} title="Eliminar de la biblioteca" className="df-danger-hover"
                    style={{ color: 'var(--df-text-faint)', cursor: 'pointer', fontSize: 14, padding: 4 }}>🗑</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
