import { useRef } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';

const label = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

function Cantidad({ valor, onChange, color }: { valor: number; onChange: (n: number) => void; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={() => onChange(n)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            background: valor === n ? color : '#fff',
            color: valor === n ? '#fff' : '#64748B',
            border: '1px solid ' + (valor === n ? color : '#E2E8F0'),
          }}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

export function Marketing({ df }: { df: DealFlowState }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section data-screen-label="Marketing">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Marketing con IA</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>Tu copywriter con IA: anuncios completos para Facebook e imágenes para redes, sin salir de DealFlow.</p>
      </div>

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── Copys ── */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Copys para anuncios ✍️</div>
          <div style={{ color: '#94A3B8', fontSize: 12.5, marginBottom: 16 }}>
            Describe el producto <b>o sube su foto</b> y el agente escribe anuncios completos de Facebook: título, descripción y texto principal.
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={label}>¿De qué es el anuncio?</div>
            <textarea
              className="df-input"
              value={df.mkIdea}
              onChange={(e) => df.setMkIdea(e.target.value)}
              rows={3}
              placeholder="Ej: Jogger bota recta de dama, tiro alto, $59.900 y 2 x $99.900, envío contra entrega."
              style={{ ...input, resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={label}>Foto del producto (opcional · el agente la analiza)</div>
            {df.mkImagen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={df.mkImagen} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid #E2E8F0' }} />
                <button
                  onClick={() => df.setMkImagenFile(null)}
                  style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                >
                  Quitar foto
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="df-upload-tile"
                style={{ background: '#fff', border: '1px dashed #CBD5E1', color: '#64748B', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}
              >
                📷 Subir foto del producto
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => df.setMkImagenFile(e.target.files?.[0] || null)} />
          </div>

          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={label}>Plataforma</div>
              <input className="df-input" value={df.mkPlataforma} onChange={(e) => df.setMkPlataforma(e.target.value)} placeholder="Facebook, Instagram…" style={input} />
            </div>
            <div>
              <div style={label}>Tono</div>
              <input className="df-input" value={df.mkTono} onChange={(e) => df.setMkTono(e.target.value)} placeholder="Cercano, elegante, urgente…" style={input} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={label}>Objetivo</div>
            <input className="df-input" value={df.mkObjetivo} onChange={(e) => df.setMkObjetivo(e.target.value)} placeholder="Que escriban por WhatsApp, que compren ya…" style={input} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={label}>¿Cuántos copys?</div>
            <Cantidad valor={df.mkCantidad} onChange={df.setMkCantidad} color="#059669" />
          </div>
          <button
            onClick={df.generarCopys}
            disabled={df.mkLoading}
            className="df-btn-primary"
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.mkLoading ? 'default' : 'pointer', opacity: df.mkLoading ? 0.7 : 1 }}
          >
            {df.mkLoading ? 'El agente está escribiendo…' : `✨ Generar ${df.mkCantidad} copy${df.mkCantidad === 1 ? '' : 's'}`}
          </button>
          {df.mkError && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{df.mkError}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {df.mkCopys.map((c, i) => {
              const completo = `${c.titulo}\n\n${c.descripcion}\n\n${c.texto}`;
              return (
                <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '13px 15px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 3 }}>TÍTULO</div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 9 }}>{c.titulo}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 3 }}>DESCRIPCIÓN</div>
                  <div style={{ fontSize: 13, color: '#334155', marginBottom: 9 }}>{c.descripcion}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 3 }}>TEXTO PRINCIPAL</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.texto}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      onClick={() => df.copiarCopy(i, completo)}
                      style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                    >
                      {df.mkCopied === i ? '✓ Copiado' : 'Copiar todo'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Imágenes ── */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Imágenes para redes 🖼️</div>
          <div style={{ color: '#94A3B8', fontSize: 12.5, marginBottom: 16 }}>Describe la imagen del anuncio y la IA genera hasta 5 versiones. Descárgalas o envíalas por WhatsApp.</div>

          <div style={{ marginBottom: 12 }}>
            <div style={label}>¿Qué imagen quieres?</div>
            <textarea
              className="df-input"
              value={df.mkImgPrompt}
              onChange={(e) => df.setMkImgPrompt(e.target.value)}
              rows={4}
              placeholder="Ej: Foto de producto estilo estudio, jogger beige sobre fondo degradado verde, luz suave, moderna y limpia, para anuncio de Instagram."
              style={{ ...input, resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={label}>¿Cuántas imágenes?</div>
            <Cantidad valor={df.mkImgCantidad} onChange={df.setMkImgCantidad} color="#0F172A" />
          </div>
          <button
            onClick={df.generarImagen}
            disabled={df.mkImgLoading}
            className="df-btn-primary"
            style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.mkImgLoading ? 'default' : 'pointer', opacity: df.mkImgLoading ? 0.7 : 1 }}
          >
            {df.mkImgLoading ? 'Generando…' : `✨ Generar ${df.mkImgCantidad} imagen${df.mkImgCantidad === 1 ? '' : 'es'}`}
          </button>
          {df.mkImgError && <div style={{ color: '#B45309', fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{df.mkImgError}</div>}

          {df.mkImgUrls.length > 0 && (
            <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: df.mkImgUrls.length > 1 ? '1fr 1fr' : '1fr', gap: 10, marginTop: 16 }}>
              {df.mkImgUrls.map((url, i) => (
                <div key={i}>
                  <img src={url} alt={`Imagen generada ${i + 1}`} style={{ width: '100%', borderRadius: 12, border: '1px solid #E2E8F0', display: 'block' }} />
                  <a
                    href={url}
                    download={`anuncio-${i + 1}.png`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', marginTop: 8, background: '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5 }}
                  >
                    Descargar
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
