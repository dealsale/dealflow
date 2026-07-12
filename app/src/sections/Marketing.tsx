import type { DealFlowState } from '../hooks/useDealFlowState';

const label = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

export function Marketing({ df }: { df: DealFlowState }) {
  return (
    <section data-screen-label="Marketing">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Marketing con IA</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>Crea copys para tus anuncios y genera imágenes para redes, sin salir de DealFlow.</p>
      </div>

      <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── Copys ── */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Copys para anuncios ✍️</div>
          <div style={{ color: '#94A3B8', fontSize: 12.5, marginBottom: 16 }}>Describe el producto o la promo y la IA te da 3 versiones listas para publicar.</div>

          <div style={{ marginBottom: 12 }}>
            <div style={label}>¿De qué es el anuncio?</div>
            <textarea
              className="df-input"
              value={df.mkIdea}
              onChange={(e) => df.setMkIdea(e.target.value)}
              rows={3}
              placeholder="Ej: Camisa de compresión para caballero, moldea la figura, $59.900 y 3 x $109.900, envío contra entrega."
              style={{ ...input, resize: 'vertical' }}
            />
          </div>
          <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={label}>Plataforma</div>
              <input className="df-input" value={df.mkPlataforma} onChange={(e) => df.setMkPlataforma(e.target.value)} placeholder="Instagram, Facebook…" style={input} />
            </div>
            <div>
              <div style={label}>Tono</div>
              <input className="df-input" value={df.mkTono} onChange={(e) => df.setMkTono(e.target.value)} placeholder="Cercano, elegante, urgente…" style={input} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={label}>Objetivo</div>
            <input className="df-input" value={df.mkObjetivo} onChange={(e) => df.setMkObjetivo(e.target.value)} placeholder="Que escriban por WhatsApp, que compren ya…" style={input} />
          </div>
          <button
            onClick={df.generarCopys}
            disabled={df.mkLoading}
            className="df-btn-primary"
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.mkLoading ? 'default' : 'pointer', opacity: df.mkLoading ? 0.7 : 1 }}
          >
            {df.mkLoading ? 'Generando…' : '✨ Generar copys'}
          </button>
          {df.mkError && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10 }}>{df.mkError}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {df.mkCopys.map((c, i) => (
              <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    onClick={() => df.copiarCopy(i, c)}
                    style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    {df.mkCopied === i ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Imágenes ── */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Imágenes para redes 🖼️</div>
          <div style={{ color: '#94A3B8', fontSize: 12.5, marginBottom: 16 }}>Describe la imagen del anuncio y la IA la genera. Puedes descargarla o enviarla por WhatsApp.</div>

          <div style={{ marginBottom: 14 }}>
            <div style={label}>¿Qué imagen quieres?</div>
            <textarea
              className="df-input"
              value={df.mkImgPrompt}
              onChange={(e) => df.setMkImgPrompt(e.target.value)}
              rows={4}
              placeholder="Ej: Foto de producto estilo estudio, camisa de compresión negra sobre fondo degradado verde, luz suave, moderna y limpia, para anuncio de Instagram."
              style={{ ...input, resize: 'vertical' }}
            />
          </div>
          <button
            onClick={df.generarImagen}
            disabled={df.mkImgLoading}
            className="df-btn-primary"
            style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.mkImgLoading ? 'default' : 'pointer', opacity: df.mkImgLoading ? 0.7 : 1 }}
          >
            {df.mkImgLoading ? 'Generando…' : '✨ Generar imagen'}
          </button>
          {df.mkImgError && <div style={{ color: '#B45309', fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{df.mkImgError}</div>}

          {df.mkImgUrl && (
            <div style={{ marginTop: 16 }}>
              <img src={df.mkImgUrl} alt="Imagen generada" style={{ width: '100%', borderRadius: 12, border: '1px solid #E2E8F0', display: 'block' }} />
              <a
                href={df.mkImgUrl}
                download="anuncio.png"
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-block', marginTop: 10, background: '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}
              >
                Descargar imagen
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
