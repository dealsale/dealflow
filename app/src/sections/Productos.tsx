import { PhotoAddChip, PhotoDropTile, UploadedThumb } from '../components/PhotoUpload';
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
        <button
          onClick={df.toggleNewProduct}
          className="df-btn-primary"
          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          + Nuevo producto
        </button>
      </div>

      {df.newProductOpen && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Nuevo producto</div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Nombre</div>
              <input
                className="df-input"
                value={df.newProdNombre}
                onChange={(e) => df.setNewProdNombre(e.target.value)}
                placeholder="Ej: Chaqueta bomber"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>
            <div>
              <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio (COP)</div>
              <input
                className="df-input"
                value={df.newProdPrecio}
                onChange={(e) => df.setNewProdPrecio(e.target.value)}
                placeholder="Ej: 79900"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
              />
            </div>
            <div>
              <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Stock inicial</div>
              <input
                className="df-input"
                value={df.newProdStock}
                onChange={(e) => df.setNewProdStock(e.target.value)}
                placeholder="Ej: 10"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={df.crearProducto}
              className="df-btn-primary"
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Crear producto
            </button>
            <button
              onClick={df.toggleNewProduct}
              style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            {df.newProdError && <span style={{ color: '#DC2626', fontSize: 13 }}>Falta el nombre o el precio. Complétalos y vuelve a intentar.</span>}
          </div>
          <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 10 }}>Se crea con una variante "Única". Al abrirlo puedes agregar más variantes, fotos y reglas.</div>
        </div>
      )}

      {df.products.length === 0 && !df.newProductOpen && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '40px 24px', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aún no tienes productos.</div>
          <div style={{ color: '#64748B', fontSize: 13.5 }}>Crea el primero y el asistente empieza a ofrecerlo en WhatsApp.</div>
          <button
            onClick={df.toggleNewProduct}
            className="df-btn-primary"
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            + Crear mi primer producto
          </button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)', display: df.products.length === 0 ? 'none' : 'block' }}>
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
                  Datos del producto
                </div>
                <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10, marginBottom: 16, maxWidth: 560 }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Nombre</div>
                    <input
                      className="df-input"
                      value={p.nombre}
                      onChange={(e) => p.setNombre(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                    />
                  </div>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Precio (COP)</div>
                    <input
                      className="df-input"
                      value={String(p.precio)}
                      onChange={(e) => p.setPrecio(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Información del producto · la usa el asistente para vender
                </div>
                <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Descripción</div>
                    <textarea
                      className="df-input"
                      value={p.descripcion || ''}
                      onChange={(e) => p.setDescripcion(e.target.value)}
                      rows={3}
                      placeholder="Qué es, para quién, por qué es bueno…"
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                    />
                  </div>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Características</div>
                    <textarea
                      className="df-input"
                      value={p.caracteristicas || ''}
                      onChange={(e) => p.setCaracteristicas(e.target.value)}
                      rows={3}
                      placeholder="Material, medidas, cuidados…"
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Mensaje inicial · cómo debe presentarlo el asistente</div>
                  <textarea
                    className="df-input"
                    value={p.mensajeInicial || ''}
                    onChange={(e) => p.setMensajeInicial(e.target.value)}
                    rows={2}
                    placeholder="Ej: ¡Claro! Te cuento: 3 joggers por $109.900, envío gratis…"
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                  />
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Fotos principales · las que envía el asistente al ofrecer el producto
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {p.fotosMain.map((f, i) => (
                    <div key={i} style={f.tileStyle}>
                      {f.label}
                    </div>
                  ))}
                  {p.uploadedMain.map((src, i) => (
                    <UploadedThumb key={i} src={src} size={64} onRemove={() => p.removeMainFoto(i)} />
                  ))}
                  <PhotoDropTile size={64} onFiles={p.addMainFotos} />
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Variantes · cada una con sus propias fotos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {p.variantesDecorated.map((v, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 12px' }}>
                      <span style={v.swatchStyle} />
                      <span style={v.labelStyle}>{v.label}</span>
                      <span
                        onClick={v.decStock}
                        className={v.stock > 0 ? 'df-copy-btn' : undefined}
                        title="Quitar una unidad"
                        style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', color: v.stock > 0 ? '#64748B' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: v.stock > 0 ? 'pointer' : 'default', userSelect: 'none' }}
                      >
                        −
                      </span>
                      <span style={v.stockPill}>{v.stockLabel}</span>
                      <span
                        onClick={v.incStock}
                        className="df-copy-btn"
                        title="Sumar una unidad"
                        style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}
                      >
                        +
                      </span>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        {v.thumbs.map((t, k) => (
                          <div key={k} style={t} />
                        ))}
                        {v.uploaded.map((src, k) => (
                          <UploadedThumb key={k} src={src} size={22} onRemove={() => v.removeFoto(k)} />
                        ))}
                        <span style={{ color: '#64748B', fontSize: 12 }}>{v.fotosLabel}</span>
                        <PhotoAddChip onFiles={v.addFotos} />
                        {v.deleteArmed ? (
                          <span
                            onClick={v.requestDelete}
                            style={{ background: '#DC2626', color: '#fff', borderRadius: 6, padding: '4px 9px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Sí, quitar
                          </span>
                        ) : (
                          <span
                            onClick={v.requestDelete}
                            className="df-danger-hover"
                            title="Quitar esta variante"
                            style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '4px 2px' }}
                          >
                            ✕
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {!df.variantFormOpen ? (
                    <span
                      onClick={df.openVariantForm}
                      className="df-upload-tile"
                      style={{ alignSelf: 'flex-start', background: '#fff', border: '1px dashed #CBD5E1', color: '#64748B', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}
                    >
                      + Agregar variante
                    </span>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        className="df-input"
                        value={df.variantLabel}
                        onChange={(e) => df.setVariantLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') p.addVariante();
                        }}
                        placeholder="Talla · Color (ej: M · Rojo)"
                        autoFocus
                        style={{ flex: 1, minWidth: 180, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13 }}
                      />
                      <input
                        className="df-input"
                        value={df.variantStock}
                        onChange={(e) => df.setVariantStock(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') p.addVariante();
                        }}
                        placeholder="Stock"
                        style={{ width: 80, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
                      />
                      <button
                        onClick={p.addVariante}
                        className="df-btn-outline-green"
                        style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Agregar variante
                      </button>
                      <span onClick={df.cancelVariantForm} className="df-danger-hover" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, padding: 4 }}>
                        ✕
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 16 }}>
                  Si el cliente elige un color o talla, el asistente envía solo las fotos de esa variante.
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Reglas para el asistente · agrega todas las que necesites
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {p.reglasDecoradas.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                      <span style={{ color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{r.texto}</span>
                      <span onClick={r.remove} className="df-danger-hover" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>
                        ✕
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input
                    className="df-input"
                    value={df.productRuleDraft}
                    onChange={(e) => df.setProductRuleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') p.addRegla();
                    }}
                    placeholder="Escribe una regla nueva para este producto…"
                    style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <button
                    onClick={p.addRegla}
                    className="df-btn-outline-green"
                    style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Agregar regla
                  </button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Preguntas frecuentes · el asistente responde con esto
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {p.faqsDecoradas.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{f.pregunta}</div>
                        <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{f.respuesta}</div>
                      </div>
                      <span onClick={f.remove} className="df-danger-hover" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <input
                    className="df-input"
                    value={df.faqP}
                    onChange={(e) => df.setFaqP(e.target.value)}
                    placeholder="Pregunta · ej: ¿Hacen envíos a Pasto?"
                    style={{ flex: 1, minWidth: 180, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <input
                    className="df-input"
                    value={df.faqR}
                    onChange={(e) => df.setFaqR(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') p.addFaq(); }}
                    placeholder="Respuesta"
                    style={{ flex: 1, minWidth: 180, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <button
                    onClick={p.addFaq}
                    className="df-btn-outline-green"
                    style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Agregar
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={p.requestDelete}
                    style={
                      p.deleteArmed
                        ? { background: '#DC2626', color: '#fff', border: '1px solid #DC2626', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
                        : { background: '#fff', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
                    }
                  >
                    {p.deleteArmed ? '¿Seguro? Sí, eliminar' : 'Eliminar producto'}
                  </button>
                  <div style={{ flex: 1 }} />
                  {p.saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Producto guardado. El asistente ya lo ofrece así.</span>}
                  <button
                    onClick={p.save}
                    className="df-btn-primary"
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
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
