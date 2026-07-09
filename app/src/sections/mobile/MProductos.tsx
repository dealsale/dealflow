import type { DealFlowState } from '../../hooks/useDealFlowState';

export function MProductos({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Móvil Productos">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Productos</h1>
        <div style={{ flex: 1 }} />
        <button
          className="df-btn-primary"
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 15px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', minHeight: 44 }}
        >
          + Nuevo
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {df.products.map((p) => (
          <div key={p.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
            <div onClick={p.toggle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', cursor: 'pointer' }}>
              <div style={{ ...p.fotoStyle, width: 46, height: 46, flexShrink: 0 }}>{p.iniciales}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.nombre}</div>
                <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 1 }}>
                  {p.precioFmt} · {p.variantesLabel}
                </div>
              </div>
              <span style={p.stockPill}>{p.stockLabel}</span>
              <span style={{ color: '#94A3B8', fontSize: 11 }}>{p.chevron}</span>
            </div>

            {p.expanded && (
              <div style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9', padding: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Fotos principales · las envía el asistente
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {p.fotosMain.map((f, i) => (
                    <div key={i} style={{ ...f.tileStyle, width: 58, height: 58, fontSize: 9.5, paddingBottom: 4 }}>
                      {f.label}
                    </div>
                  ))}
                  <div
                    className="df-upload-tile"
                    style={{
                      width: 58,
                      height: 58,
                      border: '1px dashed #CBD5E1',
                      borderRadius: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      color: '#64748B',
                      fontSize: 9.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <span style={{ fontSize: 15, lineHeight: 1 }}>＋</span>
                    <span>Subir</span>
                  </div>
                </div>

                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Variantes · cada una con sus fotos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {p.variantesDecorated.map((v, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', minHeight: 44, boxSizing: 'border-box' }}
                    >
                      <span style={v.swatchStyle} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...v.labelStyle, minWidth: 0 }}>{v.label}</div>
                        <div style={{ color: '#64748B', fontSize: 11.5 }}>
                          {v.stockLabel} · {v.fotosLabel}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {v.thumbs.map((t, k) => (
                          <div key={k} style={{ ...t, width: 20, height: 20 }} />
                        ))}
                      </div>
                      <span className="df-upload-tile" style={{ border: '1px dashed #CBD5E1', borderRadius: 6, padding: '5px 9px', fontSize: 12, fontWeight: 600, color: '#64748B', cursor: 'pointer' }}>
                        + Foto
                      </span>
                    </div>
                  ))}
                  <span
                    className="df-upload-tile"
                    style={{ alignSelf: 'flex-start', background: '#fff', border: '1px dashed #CBD5E1', color: '#64748B', borderRadius: 8, padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}
                  >
                    + Agregar variante
                  </span>
                </div>
                <div style={{ color: '#94A3B8', fontSize: 11.5, marginBottom: 12 }}>
                  Si el cliente elige un color o talla, el asistente envía solo las fotos de esa variante.
                </div>
                <button
                  className="df-btn-primary"
                  style={{ width: '100%', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: 13, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                >
                  Guardar producto
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
