import type { DealFlowState } from '../hooks/useDealFlowState';

export function Productos({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Productos">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Productos</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>{df.productCount} productos en tu catálogo. Toca uno para editarlo.</p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="df-btn-primary" style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          + Nuevo producto
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        {df.products.map((p) => (
          <div key={p.id}>
            <div
              onClick={p.toggle}
              className="df-row-hover"
              style={{ display: 'grid', gridTemplateColumns: '52px 1fr 120px 130px 24px', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
            >
              <div style={p.fotoStyle}>{p.iniciales}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nombre}</div>
                <div style={{ color: '#64748B', fontSize: 12, marginTop: 1 }}>{p.variantesLabel}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.precioFmt}</div>
              <span style={p.stockPill}>{p.stockLabel}</span>
              <span style={{ color: '#94A3B8', fontSize: 12 }}>{p.chevron}</span>
            </div>

            {p.expanded && (
              <div style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', padding: '18px 18px 18px 84px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Fotos principales · las que envía el asistente al ofrecer el producto
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {p.fotosMain.map((f, i) => (
                    <div key={i} style={f.tileStyle}>
                      {f.label}
                    </div>
                  ))}
                  <div
                    className="df-upload-tile"
                    style={{
                      width: 64,
                      height: 64,
                      border: '1px dashed #CBD5E1',
                      borderRadius: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      color: '#64748B',
                      fontSize: 10.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
                    <span>Subir foto</span>
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Variantes · cada una con sus propias fotos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {p.variantesDecorated.map((v, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 12px' }}>
                      <span style={v.swatchStyle} />
                      <span style={v.labelStyle}>{v.label}</span>
                      <span style={v.stockPill}>{v.stockLabel}</span>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        {v.thumbs.map((t, k) => (
                          <div key={k} style={t} />
                        ))}
                        <span style={{ color: '#64748B', fontSize: 12 }}>{v.fotosLabel}</span>
                        <span className="df-upload-tile" style={{ border: '1px dashed #CBD5E1', borderRadius: 6, padding: '4px 9px', fontSize: 12, fontWeight: 600, color: '#64748B', cursor: 'pointer' }}>
                          + Foto
                        </span>
                      </div>
                    </div>
                  ))}
                  <span
                    className="df-upload-tile"
                    style={{ alignSelf: 'flex-start', background: '#fff', border: '1px dashed #CBD5E1', color: '#64748B', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}
                  >
                    + Agregar variante
                  </span>
                </div>
                <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 16 }}>
                  Si el cliente elige un color o talla, el asistente envía solo las fotos de esa variante.
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Regla para el asistente</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#1E293B' }}>{p.regla}</div>
                  <button className="df-btn-primary" style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    Guardar producto
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
