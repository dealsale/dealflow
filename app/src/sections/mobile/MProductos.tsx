import { PhotoAddChip, PhotoDropTile, UploadedThumb } from '../../components/PhotoUpload';
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
                  {p.uploadedMain.map((src, i) => (
                    <UploadedThumb key={i} src={src} size={58} onRemove={() => p.removeMainFoto(i)} />
                  ))}
                  <PhotoDropTile size={58} label="Subir" onFiles={p.addMainFotos} />
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
                        {v.uploaded.map((src, k) => (
                          <UploadedThumb key={k} src={src} size={20} onRemove={() => v.removeFoto(k)} />
                        ))}
                      </div>
                      <PhotoAddChip onFiles={v.addFotos} />
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

                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Reglas para el asistente
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {p.reglasDecoradas.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px' }}>
                      <span style={{ color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{r.texto}</span>
                      <span onClick={r.remove} className="df-danger-hover" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 4 }}>
                        ✕
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    className="df-input"
                    value={df.productRuleDraft}
                    onChange={(e) => df.setProductRuleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') p.addRegla();
                    }}
                    placeholder="Regla nueva…"
                    style={{ flex: 1, minWidth: 0, border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 12px', fontFamily: 'inherit', fontSize: 13, minHeight: 44, boxSizing: 'border-box' }}
                  />
                  <button
                    onClick={p.addRegla}
                    className="df-btn-outline-green"
                    style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 44 }}
                  >
                    Agregar
                  </button>
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
