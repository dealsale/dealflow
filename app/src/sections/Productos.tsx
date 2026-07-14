import { useState } from 'react';
import { PhotoAddChip, PhotoDropTile, UploadedThumb } from '../components/PhotoUpload';
import type { DealFlowState, DecoratedProduct } from '../hooks/useDealFlowState';

/** Editor de opciones del producto: grupos como Color (Negro, Azul…) y Talla (S, M, L…). */
function OpcionesEditor({ p }: { p: DecoratedProduct }) {
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [valorDrafts, setValorDrafts] = useState<Record<number, string>>({});
  const setDraft = (gi: number, v: string) => setValorDrafts((d) => ({ ...d, [gi]: v }));

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
        {p.opcionesDecoradas.map((o, gi) => (
          <div key={gi} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{o.nombre}</span>
              <span style={{ color: '#94A3B8', fontSize: 12 }}>· {o.valores.length} {o.valores.length === 1 ? 'opción' : 'opciones'}</span>
              <div style={{ flex: 1 }} />
              <span onClick={o.remove} className="df-danger-hover" title="Quitar este grupo" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
              {o.valores.map((val, vi) => (
                <div key={vi} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#F1F5F9', borderRadius: 10, padding: '5px 8px' }}>
                  {val.foto && <img src={val.foto} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(15,23,42,.1)' }} />}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{val.valor}</span>
                  {val.foto ? (
                    <span onClick={() => o.removeValorFoto(vi)} className="df-danger-hover" title="Quitar la foto de esta opción" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 11 }}>quitar foto</span>
                  ) : (
                    <PhotoAddChip label="+ foto" onFiles={(files) => o.setValorFoto(vi, files)} />
                  )}
                  <span onClick={() => o.removeValor(vi)} className="df-danger-hover" title="Quitar" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</span>
                </div>
              ))}
              {o.valores.length === 0 && <span style={{ color: '#94A3B8', fontSize: 12.5 }}>Aún no agregas opciones a este grupo.</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="df-input"
                value={valorDrafts[gi] || ''}
                onChange={(e) => setDraft(gi, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { o.addValor(valorDrafts[gi] || ''); setDraft(gi, ''); } }}
                placeholder={`Agregar a ${o.nombre}… (ej: ${o.nombre.toLowerCase().includes('tall') ? 'M' : 'Negro'})`}
                style={{ flex: 1, minWidth: 140, border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13 }}
              />
              <button
                onClick={() => { o.addValor(valorDrafts[gi] || ''); setDraft(gi, ''); }}
                className="df-btn-outline-green"
                style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
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
          style={{ flex: 1, minWidth: 180, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
        />
        <button
          onClick={() => { p.addOpcion(nuevoGrupo); setNuevoGrupo(''); }}
          className="df-btn-outline-green"
          style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Agregar grupo
        </button>
      </div>
      <div style={{ color: '#94A3B8', fontSize: 12 }}>
        Crea un grupo por cada tipo de opción: uno "Color" con Negro, Azul… y otro "Talla" con S, M, L… El asistente se las ofrece al cliente.
      </div>
    </div>
  );
}

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
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, marginBottom: 14 }}>
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
          <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 10 }}>Al abrirlo agregas fotos, videos, opciones (Color, Talla…), combos y reglas.</div>
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
              className="df-row-hover df-prow"
              style={{ display: 'grid', gridTemplateColumns: '52px 1fr 120px 130px 24px', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
            >
              <div style={p.fotoStyle}>{p.iniciales}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nombre}</div>
                <div style={{ color: '#64748B', fontSize: 12, marginTop: 1 }}>{p.precioFmt} · {p.variantesLabel}</div>
              </div>
              <div className="df-prow-price" style={{ fontWeight: 700, fontSize: 14 }}>{p.precioFmt}</div>
              <span style={p.stockPill}>{p.stockLabel}</span>
              <span style={{ color: '#94A3B8', fontSize: 12 }}>{p.chevron}</span>
            </div>

            {p.expanded && (
              <div className="df-pexp" style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', padding: '18px 18px 18px 84px' }}>
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
                <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Modo de uso · cómo se usa el producto</div>
                    <textarea
                      className="df-input"
                      value={p.modosUso || ''}
                      onChange={(e) => p.setModosUso(e.target.value)}
                      rows={2}
                      placeholder="Ej: Aplicar sobre la piel limpia, 2 veces al día…"
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                    />
                  </div>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Contenido del paquete · qué le llega al cliente</div>
                    <textarea
                      className="df-input"
                      value={p.contenidoPaquete || ''}
                      onChange={(e) => p.setContenidoPaquete(e.target.value)}
                      rows={2}
                      placeholder="Ej: 1 jogger, 1 bolsa de regalo y guía de tallas."
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Mensaje inicial · fotos, textos y videos que se envían solos
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: p.mensajeInicialActivo !== false ? '#059669' : '#94A3B8', fontWeight: 600 }}>
                    {p.mensajeInicialActivo !== false ? 'Encendido' : 'Apagado'}
                  </span>
                  <span
                    onClick={p.toggleMensajeInicial}
                    title="Encender o apagar el envío automático del mensaje inicial"
                    style={{ width: 40, height: 23, borderRadius: 999, background: p.mensajeInicialActivo !== false ? '#059669' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}
                  >
                    <span style={{ position: 'absolute', top: 2, left: p.mensajeInicialActivo !== false ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(15,23,42,.3)' }} />
                  </span>
                </div>
                <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Disparador · si el primer mensaje se parece a esto, envía todo el mensaje inicial</div>
                    <input
                      className="df-input"
                      value={p.disparador || ''}
                      onChange={(e) => p.setDisparador(e.target.value)}
                      placeholder="Ej: ¡Hola! Me interesan los Bota recta ámbar."
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>ID en Dropi · para crear la orden real al despachar</div>
                    <input
                      className="df-input"
                      value={p.dropiId || ''}
                      onChange={(e) => p.setDropiId(e.target.value)}
                      placeholder="Ej: 123456"
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {p.bloquesDecorados.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 12px' }}>
                      <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: "'JetBrains Mono',monospace" }}>{i + 1}</span>
                      <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', width: 52, flexShrink: 0 }}>
                        {b.tipo === 'texto' ? 'Texto' : b.tipo === 'imagen' ? 'Imagen' : 'Video'}
                      </span>
                      {b.tipo === 'texto' && <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{b.valor}</span>}
                      {b.tipo === 'imagen' && (
                        <img src={b.valor} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(15,23,42,.1)' }} />
                      )}
                      {b.tipo === 'video' && <video src={b.valor} controls style={{ width: 180, maxWidth: '100%', borderRadius: 8, background: '#0F172A' }} />}
                      {b.tipo !== 'texto' && <div style={{ flex: 1 }} />}
                      <span onClick={b.remove} className="df-danger-hover" title="Quitar bloque" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>
                        ✕
                      </span>
                    </div>
                  ))}
                  {p.bloquesDecorados.length === 0 && !!(p.mensajeInicial || '').trim() && (
                    <div style={{ color: '#94A3B8', fontSize: 12, background: '#fff', border: '1px dashed #E2E8F0', borderRadius: 8, padding: '9px 12px' }}>
                      Hoy el asistente usa este texto: “{p.mensajeInicial}”. Agrega bloques y los usará en su lugar.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="df-input"
                    value={df.bloqueTexto}
                    onChange={(e) => df.setBloqueTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') p.addBloqueTexto(); }}
                    placeholder="Escribe un bloque de texto · ej: ¡Claro! Te cuento: 3 joggers por $109.900…"
                    style={{ flex: 1, minWidth: 220, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <button
                    onClick={p.addBloqueTexto}
                    className="df-btn-outline-green"
                    style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    + Texto
                  </button>
                  <PhotoAddChip label="+ Imagen" onFiles={p.addBloqueImagen} />
                  <PhotoAddChip label="+ Video" accept="video/*" onFiles={p.addBloqueVideo} />
                </div>
                <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 16 }}>
                  Cuando un cliente pregunte por este producto, el asistente enviará estos bloques en orden, como mensajes de WhatsApp.
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Combos · llevar varias unidades por un precio especial
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {p.bundlesDecorados.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 12px' }}>
                      <span style={{ background: '#FEF3C7', color: '#B45309', borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {b.cantidad} unidades
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{b.precioFmt}</span>
                      {b.etiqueta && <span style={{ fontSize: 12, color: '#64748B' }}>· {b.etiqueta}</span>}
                      <div style={{ flex: 1 }} />
                      <span onClick={b.remove} className="df-danger-hover" title="Quitar combo" style={{ color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="df-input"
                    value={df.bundleCantidad}
                    onChange={(e) => df.setBundleCantidad(e.target.value)}
                    placeholder="Cantidad · ej: 3"
                    style={{ width: 120, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
                  />
                  <input
                    className="df-input"
                    value={df.bundlePrecio}
                    onChange={(e) => df.setBundlePrecio(e.target.value)}
                    placeholder="Precio total (COP) · ej: 109900"
                    style={{ width: 200, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}
                  />
                  <input
                    className="df-input"
                    value={df.bundleEtiqueta}
                    onChange={(e) => df.setBundleEtiqueta(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') p.addBundle(); }}
                    placeholder="Etiqueta opcional · ej: ¡El más pedido!"
                    style={{ flex: 1, minWidth: 160, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <button
                    onClick={p.addBundle}
                    className="df-btn-outline-green"
                    style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Agregar combo
                  </button>
                </div>
                <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 16 }}>
                  El asistente ofrece estos combos para subir el ticket (ej: 3 por $109.900 en vez de $180.000).
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
                {df.mediaWarn && <div style={{ color: '#DC2626', fontSize: 12, marginTop: -8, marginBottom: 16 }}>{df.mediaWarn}</div>}

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Testimonios · capturas de clientes felices que el asistente puede enviar
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {p.testimoniosList.map((src, i) => (
                    <UploadedThumb key={i} src={src} size={64} onRemove={() => p.removeTestimonio(i)} />
                  ))}
                  <PhotoDropTile size={64} label="Subir captura" onFiles={p.addTestimonios} />
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Videos del producto
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
                  {p.videosList.map((src, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <video src={src} controls style={{ width: 180, borderRadius: 10, background: '#0F172A', display: 'block' }} />
                      <span
                        onClick={() => p.removeVideo(i)}
                        title="Quitar video"
                        style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#0F172A', color: '#fff', fontSize: 10, lineHeight: '18px', textAlign: 'center', cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.3)' }}
                      >
                        ✕
                      </span>
                    </div>
                  ))}
                  <PhotoDropTile size={64} label="Subir video" accept="video/*" onFiles={p.addVideos} />
                </div>
                {df.videoWarn && <div style={{ color: '#DC2626', fontSize: 12, marginTop: -10, marginBottom: 16 }}>{df.videoWarn}</div>}

                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Opciones · Color, Talla… (el asistente las ofrece)
                </div>
                <OpcionesEditor p={p} />

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
