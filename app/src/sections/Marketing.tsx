import { useEffect, useRef } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { Chip } from '../components/Filters';

const label = { color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 };
const input = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13 };
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

const FORMATOS = [
  { id: 'anuncio', label: '📢 Anuncio' },
  { id: 'historia', label: '🎬 Historia / Reel' },
  { id: 'organico', label: '💬 Post orgánico' },
  { id: 'producto', label: '🏷️ Descripción' },
];
const TAMANOS = [
  { id: 'feed', label: 'Feed 1:1', ratio: '1 / 1' },
  { id: 'historia', label: 'Historia 9:16', ratio: '9 / 16' },
  { id: 'horizontal', label: 'Horizontal 16:9', ratio: '16 / 9' },
];

function Cantidad({ valor, onChange, color }: { valor: number; onChange: (n: number) => void; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={() => onChange(n)}
          style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: valor === n ? color : '#fff', color: valor === n ? '#fff' : '#64748B', border: '1px solid ' + (valor === n ? color : '#E2E8F0') }}>
          {n}
        </span>
      ))}
    </div>
  );
}

/** Marco tipo publicación de Instagram/Facebook para previsualizar una imagen. */
function PostPreview({ url, tienda, ratio }: { url: string; tienda: string; ratio: string }) {
  const inicial = (tienda || 'T').trim().charAt(0).toUpperCase();
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px' }}>
        <div style={{ width: 26, height: 26, borderRadius: 999, background: 'linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{inicial}</div>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{tienda}</span>
        <span style={{ marginLeft: 'auto', color: '#94A3B8', fontSize: 16, lineHeight: 1 }}>⋯</span>
      </div>
      <div style={{ width: '100%', aspectRatio: ratio, background: '#F1F5F9' }}>
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '8px 11px', color: '#334155', fontSize: 15 }}>
        <span>♡</span><span>💬</span><span>➤</span>
      </div>
    </div>
  );
}

function CreditosBar({ df }: { df: DealFlowState }) {
  const bajo = df.creditos < df.costoCreditos.imagen;
  return (
    <div style={{ background: df.mkSinCreditos || bajo ? '#FFF7ED' : '#F0FDF4', border: '1px solid ' + (df.mkSinCreditos || bajo ? '#FED7AA' : '#BBF7D0'), borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 600 }}>Créditos del Marketing IA</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>{df.creditos.toLocaleString('es-CO')} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>créditos</span></div>
        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Textos: {df.costoCreditos.texto} cr · Imagen: {df.costoCreditos.imagen} cr c/u</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {df.paquetesCreditos.map((p, i) => (
          <button key={p.id} onClick={() => df.recargarCreditos(p.id)} title={`${p.creditos.toLocaleString('es-CO')} créditos`}
            style={{ background: i === 1 ? 'linear-gradient(135deg,#34D399,#059669)' : '#fff', color: i === 1 ? '#fff' : '#0F172A', border: '1px solid ' + (i === 1 ? 'transparent' : '#E2E8F0'), borderRadius: 10, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}>
            {p.nombre}<br /><span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{p.creditos.toLocaleString('es-CO')} cr · ${p.precio.toLocaleString('es-CO')}</span>
          </button>
        ))}
      </div>
      {(df.mkSinCreditos || bajo) && (
        <div style={{ width: '100%', color: '#9A3412', fontSize: 12.5, fontWeight: 600 }}>
          {df.mkSinCreditos ? 'Te quedaste sin créditos suficientes. Recarga para seguir generando.' : 'Tu saldo está bajo. Recarga para no quedarte sin generar.'}
        </div>
      )}
    </div>
  );
}

/** Un copy (título + descripción + texto + hashtags) con botón de copiar. */
function CopyCard({ c, copiado, onCopiar }: { c: { titulo?: string; descripcion?: string; texto?: string; hashtags?: string }; copiado: boolean; onCopiar: () => void }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '13px 15px' }}>
      {c.titulo && <><div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 3 }}>TÍTULO</div><div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 9 }}>{c.titulo}</div></>}
      {c.descripcion && <><div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 3 }}>DESCRIPCIÓN</div><div style={{ fontSize: 13, color: '#334155', marginBottom: 9 }}>{c.descripcion}</div></>}
      {c.texto && <><div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 3 }}>TEXTO</div><div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.texto}</div></>}
      {c.hashtags && <div style={{ fontSize: 12.5, color: '#2563EB', marginTop: 8, lineHeight: 1.5 }}>{c.hashtags}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={onCopiar} style={{ background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
          {copiado ? '✓ Copiado' : 'Copiar todo'}
        </button>
      </div>
    </div>
  );
}

function textoCompleto(c: { titulo?: string; descripcion?: string; texto?: string; hashtags?: string }) {
  return [c.titulo, c.descripcion, c.texto, c.hashtags].filter(Boolean).join('\n\n');
}

export function Marketing({ df }: { df: DealFlowState }) {
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void df.reloadCreditos(); void df.reloadHistorialMk(); }, []);

  const tab = (id: 'crear' | 'historial', txt: string) => (
    <button onClick={() => df.setMkTab(id)}
      style={{ background: 'transparent', border: 'none', borderBottom: '2px solid ' + (df.mkTab === id ? '#059669' : 'transparent'), color: df.mkTab === id ? '#0F172A' : '#64748B', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, padding: '8px 4px', cursor: 'pointer' }}>
      {txt}
    </button>
  );

  return (
    <section data-screen-label="Marketing">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Marketing con IA</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>Tu estudio creativo: copys, historias, posts e imágenes para tus redes, sin salir de DealFlow.</p>
      </div>

      <CreditosBar df={df} />

      <div style={{ display: 'flex', gap: 18, borderBottom: '1px solid #E2E8F0', marginBottom: 18 }}>
        {tab('crear', '✨ Crear')}
        {tab('historial', `🗂️ Historial${df.mkHistorial.length ? ` (${df.mkHistorial.length})` : ''}`)}
      </div>

      {df.mkTab === 'crear' ? (
        <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* ── Copys / textos ── */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Textos y copys ✍️</div>
            <div style={{ color: '#94A3B8', fontSize: 12.5, marginBottom: 14 }}>Elige el formato, describe el producto <b>o sube su foto</b>, y el agente escribe.</div>

            <div style={{ marginBottom: 12 }}>
              <div style={label}>Formato</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {FORMATOS.map((f) => (
                  <Chip key={f.id} active={df.mkFormato === f.id} onClick={() => df.setMkFormato(f.id)}>{f.label}</Chip>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={label}>¿De qué es?</div>
              <textarea className="df-input" value={df.mkIdea} onChange={(e) => df.setMkIdea(e.target.value)} rows={3}
                placeholder="Ej: Jogger bota recta de dama, tiro alto, $59.900 y 2 x $99.900, envío contra entrega."
                style={{ ...input, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={label}>Foto del producto (opcional · el agente la analiza)</div>
              {df.mkImagen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={df.mkImagen} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10, border: '1px solid #E2E8F0' }} />
                  <button onClick={() => df.setMkImagenFile(null)} style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Quitar foto</button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="df-upload-tile" style={{ background: '#fff', border: '1px dashed #CBD5E1', color: '#64748B', borderRadius: 8, padding: '10px 14px', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>📷 Subir foto del producto</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => df.setMkImagenFile(e.target.files?.[0] || null)} />
            </div>

            <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><div style={label}>Plataforma</div><input className="df-input" value={df.mkPlataforma} onChange={(e) => df.setMkPlataforma(e.target.value)} placeholder="Facebook, Instagram…" style={input} /></div>
              <div><div style={label}>Tono</div><input className="df-input" value={df.mkTono} onChange={(e) => df.setMkTono(e.target.value)} placeholder="Cercano, elegante, urgente…" style={input} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><div style={label}>Objetivo</div><input className="df-input" value={df.mkObjetivo} onChange={(e) => df.setMkObjetivo(e.target.value)} placeholder="Que escriban por WhatsApp, que compren ya…" style={input} /></div>
            <div style={{ marginBottom: 14 }}><div style={label}>¿Cuántas versiones?</div><Cantidad valor={df.mkCantidad} onChange={df.setMkCantidad} color="#059669" /></div>

            <button onClick={df.generarCopys} disabled={df.mkLoading} className="df-btn-primary"
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.mkLoading ? 'default' : 'pointer', opacity: df.mkLoading ? 0.7 : 1 }}>
              {df.mkLoading ? 'El agente está escribiendo…' : `✨ Generar ${df.mkCantidad} ${df.mkCantidad === 1 ? 'versión' : 'versiones'}`}
            </button>
            {df.mkError && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{df.mkError}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {df.mkCopys.map((c, i) => (
                <CopyCard key={i} c={c} copiado={df.mkCopied === i} onCopiar={() => df.copiarCopy(i, textoCompleto(c))} />
              ))}
            </div>
          </div>

          {/* ── Imágenes ── */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Imágenes para redes 🖼️</div>
            <div style={{ color: '#94A3B8', fontSize: 12.5, marginBottom: 14 }}>Elige el tamaño de la red, describe la imagen y la IA genera hasta 5 versiones.</div>

            <div style={{ marginBottom: 12 }}>
              <div style={label}>Tamaño</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {TAMANOS.map((t) => (
                  <Chip key={t.id} active={df.mkTamano === t.id} onClick={() => df.setMkTamano(t.id)}>{t.label}</Chip>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={label}>¿Qué imagen quieres?</div>
              <textarea className="df-input" value={df.mkImgPrompt} onChange={(e) => df.setMkImgPrompt(e.target.value)} rows={4}
                placeholder="Ej: Foto de producto estilo estudio, jogger beige sobre fondo degradado verde, luz suave, moderna y limpia, para anuncio de Instagram."
                style={{ ...input, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 14 }}><div style={label}>¿Cuántas imágenes?</div><Cantidad valor={df.mkImgCantidad} onChange={df.setMkImgCantidad} color="#0F172A" /></div>

            <button onClick={df.generarImagen} disabled={df.mkImgLoading} className="df-btn-primary"
              style={{ background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, cursor: df.mkImgLoading ? 'default' : 'pointer', opacity: df.mkImgLoading ? 0.7 : 1 }}>
              {df.mkImgLoading ? 'Generando…' : `✨ Generar ${df.mkImgCantidad} imagen${df.mkImgCantidad === 1 ? '' : 'es'}`}
            </button>
            {df.mkImgError && <div style={{ color: '#B45309', fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{df.mkImgError}</div>}

            {df.mkImgUrls.length > 0 && (
              <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: df.mkImgUrls.length > 1 ? '1fr 1fr' : '1fr', gap: 12, marginTop: 16 }}>
                {df.mkImgUrls.map((url, i) => (
                  <div key={i}>
                    <PostPreview url={url} tienda={df.storeNombre} ratio={(TAMANOS.find((t) => t.id === df.mkTamano) || TAMANOS[0]).ratio} />
                    <a href={url} download={`anuncio-${i + 1}.png`} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', marginTop: 8, background: '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12.5 }}>Descargar</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <Historial df={df} />
      )}
    </section>
  );
}

function Historial({ df }: { df: DealFlowState }) {
  if (df.mkHistorial.length === 0) {
    return <div style={{ ...card, textAlign: 'center', color: '#64748B', fontSize: 14, padding: 40 }}>Aún no has generado contenido. Ve a <b>Crear</b> y lo que generes se guardará aquí para reusarlo.</div>;
  }
  const estrella = (fav: boolean): React.CSSProperties => ({ cursor: 'pointer', fontSize: 16, color: fav ? '#F59E0B' : '#CBD5E1', userSelect: 'none' });
  return (
    <div className="df-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
      {df.mkHistorial.map((it) => (
        <div key={it.id} style={{ ...card, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: it.tipo === 'imagen' ? '#7C3AED' : '#059669', background: it.tipo === 'imagen' ? '#F3E8FF' : '#D1FAE5', borderRadius: 6, padding: '2px 7px' }}>{it.tipo === 'imagen' ? '🖼️ Imagen' : '✍️ Texto'}</span>
            <div style={{ flex: 1 }} />
            <span title="Favorito" onClick={() => df.favoritoMk(it.id, !it.favorito)} style={estrella(it.favorito)}>{it.favorito ? '★' : '☆'}</span>
            <span title="Eliminar" onClick={() => df.borrarMk(it.id)} style={{ cursor: 'pointer', color: '#CBD5E1', fontSize: 14 }}>🗑️</span>
          </div>
          {it.tipo === 'imagen' && it.contenido.url ? (
            <>
              <img src={it.contenido.url} alt="" style={{ width: '100%', borderRadius: 10, border: '1px solid #E2E8F0', display: 'block' }} />
              <a href={it.contenido.url} download target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, background: '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12 }}>Descargar</a>
            </>
          ) : (
            <div>
              {it.contenido.titulo && <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 5 }}>{it.contenido.titulo}</div>}
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>{it.contenido.texto || it.contenido.descripcion}</div>
              {it.contenido.hashtags && <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 6 }}>{it.contenido.hashtags}</div>}
              <button onClick={() => { try { navigator.clipboard?.writeText(textoCompleto(it.contenido)); } catch { /* nada */ } }}
                style={{ marginTop: 9, background: '#fff', color: '#059669', border: '1px solid #059669', borderRadius: 8, padding: '5px 11px', fontFamily: 'inherit', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Copiar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
