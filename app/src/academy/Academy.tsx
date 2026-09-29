import { useEffect, useState, useCallback } from 'react';
import { DialogHost, notificar, confirmar } from '../components/dialogs';

/**
 * DealFlow Academy — portal educativo (academy.dealflow.sbs).
 * Independiente del panel: hace su propio fetch y usa la sesión compartida
 * (cookie en .dealflow.sbs). Cualquier usuario logueado ve los cursos; el
 * admin/superadmin puede administrarlos desde el mismo portal.
 */

// ── Tema (autocontenido, look de marca — vibrante, con acentos en degradé) ──
const C = {
  ink: '#0A0F1C', panel: '#111F32', line: 'rgba(255,255,255,.10)', line2: 'rgba(255,255,255,.16)',
  emerald: '#34D399', emeraldDeep: '#059669', text: '#E8EFEA', muted: '#9DB0BD', muted2: '#6F8494',
  danger: '#F87171', violet: '#A78BFA', sky: '#38BDF8', pink: '#F472B6',
};
const sans = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

// Animaciones + fondo con orbes flotando (sutil, no distrae de leer/ver video).
const GLOBAL_CSS = `
@keyframes acFadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
@keyframes acFadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes acFloat1 { 0%,100% { transform:translate(0,0) scale(1) } 50% { transform:translate(30px,-40px) scale(1.08) } }
@keyframes acFloat2 { 0%,100% { transform:translate(0,0) scale(1) } 50% { transform:translate(-40px,30px) scale(1.1) } }
@keyframes acShine { 0% { background-position:-150% 0 } 100% { background-position:250% 0 } }
@keyframes acPulseRing { 0% { box-shadow:0 0 0 0 rgba(52,211,153,.45) } 70% { box-shadow:0 0 0 10px rgba(52,211,153,0) } 100% { box-shadow:0 0 0 0 rgba(52,211,153,0) } }
@keyframes acPop { 0% { transform:scale(.6); opacity:0 } 60% { transform:scale(1.08) } 100% { transform:scale(1); opacity:1 } }
.ac-card { animation: acFadeUp .5s cubic-bezier(.2,.8,.2,1) both; transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s, border-color .22s; }
.ac-card:hover { transform: translateY(-6px) scale(1.015); box-shadow: 0 22px 44px rgba(0,0,0,.38), 0 0 0 1px rgba(52,211,153,.25); border-color: rgba(52,211,153,.4) !important; }
.ac-card:hover .ac-cover { transform: scale(1.06); }
.ac-cover { transition: transform .4s cubic-bezier(.2,.8,.2,1); }
.ac-btn { transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
.ac-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
.ac-btn:active { transform: translateY(0) scale(.97); }
.ac-logo-badge { animation: acPulseRing 2.6s ease-out infinite; }
.ac-check-pop { animation: acPop .35s cubic-bezier(.3,1.4,.4,1) both; }
.ac-blob { position:fixed; border-radius:50%; filter:blur(70px); pointer-events:none; z-index:0; opacity:.35; }
.ac-lec { transition: background .15s ease; }
.ac-lec:hover { background: rgba(255,255,255,.05) !important; }
`;

// ── Tipos ──
interface PasoImagen { url: string; caption?: string }
interface Leccion { id: string; cursoId: string; seccionId: string; titulo: string; tipo: 'video' | 'articulo'; videoUrl: string; contenido: string; duracion: string; orden: number; publicado: boolean; imagenes?: PasoImagen[] }
interface Seccion { id: string; cursoId: string; titulo: string; orden: number; lecciones: Leccion[] }
interface Curso { id: string; titulo: string; descripcion: string; portada: string; nivel: string; orden: number; publicado: boolean; lecciones: Leccion[] | number; secciones?: Seccion[]; completadas?: string[] }
interface Sesion { id: string; nombre: string; role: string }

// ── API helper ──
async function aReq<T>(url: string, method = 'GET', body?: unknown): Promise<{ data?: T; error?: string; status: number }> {
  try {
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = r.headers.get('content-type') || '';
    const b = ct.includes('application/json') ? await r.json() : {};
    if (!r.ok) return { error: (b as { error?: string }).error || 'Error', status: r.status };
    return { data: b as T, status: r.status };
  } catch {
    return { error: 'Sin conexión', status: 0 };
  }
}

/** Convierte una URL de YouTube/Vimeo en URL de embed; deja pasar mp4/otros. */
function embedUrl(u: string): { tipo: 'iframe' | 'video'; src: string } | null {
  const url = (u || '').trim();
  if (!url) return null;
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (m) return { tipo: 'iframe', src: `https://www.youtube.com/embed/${m[1]}` };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { tipo: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };
  // Video subido a Academy o archivo de video directo → reproductor <video>.
  if (url.includes('/api/academy/media/') || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return { tipo: 'video', src: url };
  return { tipo: 'iframe', src: url }; // último recurso: intentar embeber
}

export function Academy() {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined); // undefined = cargando
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoAbierto, setCursoAbierto] = useState<Curso | null>(null);
  const [admin, setAdmin] = useState(false);

  const esAdmin = sesion?.role === 'ADMIN' || sesion?.role === 'SUPERADMIN';

  const cargarSesion = useCallback(async () => {
    const r = await aReq<{ user: Sesion | null }>('/api/auth/me');
    setSesion(r.data?.user || null);
  }, []);
  const cargarCursos = useCallback(async () => {
    const r = await aReq<{ cursos: Curso[] }>('/api/academy/cursos');
    if (r.data) setCursos(r.data.cursos);
  }, []);

  useEffect(() => { void cargarSesion(); }, [cargarSesion]);
  useEffect(() => { if (sesion) void cargarCursos(); }, [sesion, cargarCursos]);

  if (sesion === undefined) return <Centro><div style={{ color: C.muted }}>Cargando…</div></Centro>;
  if (!sesion) return <LoginAcademy onOk={() => { setSesion(undefined); void cargarSesion(); }} />;

  return (
    <div style={{ height: '100vh', background: C.ink, color: C.text, fontFamily: sans, position: 'relative', overflowY: 'auto', overflowX: 'hidden' }}>
      <style>{`${GLOBAL_CSS}@media (max-width: 820px){
        .ac-curso-grid{grid-template-columns:1fr !important;}
        .ac-temario{position:static !important;order:-1;}
      }`}</style>
      {/* Fondo: orbes de color flotando muy despacio, detrás de todo. */}
      <div className="ac-blob" style={{ width: 460, height: 460, top: -120, left: -100, background: C.emerald, animation: 'acFloat1 22s ease-in-out infinite' }} />
      <div className="ac-blob" style={{ width: 380, height: 380, top: 320, right: -120, background: C.violet, animation: 'acFloat2 26s ease-in-out infinite' }} />
      <div className="ac-blob" style={{ width: 300, height: 300, bottom: -100, left: '30%', background: C.sky, animation: 'acFloat1 30s ease-in-out infinite reverse' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Encabezado sesion={sesion} esAdmin={esAdmin} admin={admin} setAdmin={setAdmin} onVolver={cursoAbierto ? () => setCursoAbierto(null) : undefined} />
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 80px', animation: 'acFadeIn .4s ease both' }}>
          {admin && esAdmin ? (
            <AdminPanel onCambio={cargarCursos} />
          ) : cursoAbierto ? (
            <VistaCurso cursoId={cursoAbierto.id} />
          ) : (
            <Portal cursos={cursos} onAbrir={(c) => setCursoAbierto(c)} />
          )}
        </main>
      </div>
      <DialogHost />
    </div>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: C.ink, display: 'grid', placeItems: 'center', fontFamily: sans }}>{children}</div>;
}

function Encabezado({ sesion, esAdmin, admin, setAdmin, onVolver }: { sesion: Sesion; esAdmin: boolean; admin: boolean; setAdmin: (v: boolean) => void; onVolver?: () => void }) {
  return (
    <header style={{ borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, background: 'rgba(10,15,28,.75)', backdropFilter: 'blur(14px)', zIndex: 10 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 62, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ac-logo-badge" style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: `linear-gradient(140deg,${C.emerald},${C.sky})`, fontWeight: 900, color: '#052018' }}>A</span>
        <span style={{ fontWeight: 800, letterSpacing: '-.02em' }}>DealFlow <span style={{ background: `linear-gradient(90deg,${C.emerald},${C.sky})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Academy</span></span>
        {onVolver && !admin && <button className="ac-btn" onClick={onVolver} style={btnGhost}>← Volver</button>}
        <div style={{ flex: 1 }} />
        {esAdmin && (
          <button className="ac-btn" onClick={() => setAdmin(!admin)} style={admin ? btnPrimary : btnGhost}>
            {admin ? '👁️ Ver portal' : '⚙️ Administrar'}
          </button>
        )}
        <span style={{ color: C.muted, fontSize: 13 }}>{sesion.nombre}</span>
      </div>
    </header>
  );
}

const NIVEL_COLOR: Record<string, string> = { 'Básico': C.emerald, 'Intermedio': C.sky, 'Avanzado': C.pink };

// ── Portal (lectura) ──
function Portal({ cursos, onAbrir }: { cursos: Curso[]; onAbrir: (c: Curso) => void }) {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 850, letterSpacing: '-.03em', margin: '0 0 6px', animation: 'acFadeUp .5s ease both' }}>
        Aprende a sacarle todo a{' '}
        <span style={{ background: `linear-gradient(90deg,${C.emerald},${C.sky},${C.violet})`, backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'acShine 5s linear infinite' }}>DealFlow</span>
      </h1>
      <p style={{ color: C.muted, fontSize: 16, margin: '0 0 26px', animation: 'acFadeUp .5s .05s ease both' }}>Tutoriales y cursos: cómo crear automatizaciones, subir productos, atender por WhatsApp y mucho más.</p>
      {cursos.length === 0 ? (
        <div style={{ ...tarjeta, textAlign: 'center', color: C.muted, animation: 'acFadeUp .5s ease both' }}>Pronto habrá contenido nuevo por aquí. 📚</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
          {cursos.map((c, i) => {
            const nivelColor = NIVEL_COLOR[c.nivel] || C.emerald;
            return (
              <button key={c.id} className="ac-card" onClick={() => onAbrir(c)} style={{ ...tarjeta, padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', animationDelay: `${i * 0.06}s` }}>
                <div style={{ height: 148, overflow: 'hidden', position: 'relative' }}>
                  <div className="ac-cover" style={{ height: '100%', background: c.portada ? `center/cover no-repeat url(${c.portada})` : `linear-gradient(140deg,${nivelColor},${C.panel} 130%)` }} />
                  {/* Sin portada propia: un ícono decorativo para que la tarjeta no se vea vacía. */}
                  {!c.portada && (
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 52, opacity: 0.9, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,.35))', pointerEvents: 'none' }}>🎓</span>
                  )}
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, color: nivelColor, background: `${nivelColor}22`, borderRadius: 999, padding: '2px 9px', textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.nivel}</div>
                  <div style={{ fontWeight: 750, fontSize: 16, margin: '8px 0 6px' }}>{c.titulo}</div>
                  <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.descripcion}</div>
                  <div style={{ color: C.muted2, fontSize: 12.5, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>▶</span>{typeof c.lecciones === 'number' ? c.lecciones : (c.lecciones as Leccion[]).length} lección(es)
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function VistaCurso({ cursoId }: { cursoId: string }) {
  const [curso, setCurso] = useState<Curso | null>(null);
  const [activa, setActiva] = useState<Leccion | null>(null);
  const [completadas, setCompletadas] = useState<Set<string>>(new Set());
  const [expandida, setExpandida] = useState<Set<string>>(new Set());

  useEffect(() => {
    void aReq<{ curso: Curso }>(`/api/academy/cursos/${cursoId}`).then((r) => {
      if (!r.data) return;
      const c = r.data.curso;
      setCurso(c);
      setCompletadas(new Set(c.completadas || []));
      const secs = c.secciones || [];
      // Primera lección disponible y todas las secciones abiertas por defecto.
      const primera = secs.flatMap((s) => s.lecciones)[0] || null;
      setActiva(primera);
      setExpandida(new Set(secs.map((s) => s.id)));
    });
  }, [cursoId]);

  const marcar = useCallback(async (leccionId: string, valor: boolean) => {
    // Optimista: actualizamos la UI y luego confirmamos con el servidor.
    setCompletadas((prev) => { const n = new Set(prev); if (valor) n.add(leccionId); else n.delete(leccionId); return n; });
    await aReq(`/api/academy/progreso/${leccionId}`, 'POST', { completado: valor });
  }, []);

  if (!curso) return <div style={{ color: C.muted }}>Cargando…</div>;
  const secciones = curso.secciones || [];
  const todas = secciones.flatMap((s) => s.lecciones);
  const total = todas.length;
  const hechas = todas.filter((l) => completadas.has(l.id)).length;
  const pct = total ? Math.round((hechas / total) * 100) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }} className="ac-curso-grid">
      <div style={{ animation: 'acFadeUp .45s ease both' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 4px' }}>{curso.titulo}</h1>
        <p style={{ color: C.muted, margin: '0 0 18px' }}>{curso.descripcion}</p>
        {activa ? (
          <>
            <Reproductor leccion={activa} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                className="ac-btn"
                onClick={() => marcar(activa.id, !completadas.has(activa.id))}
                style={completadas.has(activa.id) ? { ...btnGhost, borderColor: C.emerald, color: C.emerald } : btnPrimary}
              >
                {completadas.has(activa.id) ? <span className="ac-check-pop" style={{ display: 'inline-block' }}>✓ Completada</span> : 'Marcar como completada'}
              </button>
              {(() => {
                const idx = todas.findIndex((l) => l.id === activa.id);
                const sig = todas[idx + 1];
                return sig ? <button className="ac-btn" onClick={() => setActiva(sig)} style={btnGhost}>Siguiente lección →</button> : null;
              })()}
            </div>
          </>
        ) : <div style={{ color: C.muted }}>Este curso aún no tiene lecciones.</div>}
      </div>
      <aside style={{ ...tarjeta, padding: 12, position: 'sticky', top: 78, animation: 'acFadeUp .45s .08s ease both' }} className="ac-temario">
        <div style={{ padding: '4px 8px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Contenido del curso</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'rgba(255,255,255,.1)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg,${C.emerald},${C.sky})`, transition: 'width .4s cubic-bezier(.2,.8,.2,1)', position: 'relative', overflow: 'hidden' }}>
                {pct > 0 && pct < 100 && <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)', backgroundSize: '200% 100%', animation: 'acShine 1.8s linear infinite' }} />}
              </div>
            </div>
            <span style={{ fontSize: 12, color: pct === 100 ? C.emerald : C.muted, fontWeight: 700, whiteSpace: 'nowrap' }}>{pct === 100 ? '🎉 100%' : `${pct}%`}</span>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 5 }}>{hechas} de {total} lecciones completadas</div>
        </div>
        {secciones.map((s) => {
          const abierta = expandida.has(s.id);
          const hechasSec = s.lecciones.filter((l) => completadas.has(l.id)).length;
          return (
            <div key={s.id} style={{ borderTop: `1px solid ${C.line}`, marginTop: 4 }}>
              <button
                onClick={() => setExpandida((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '11px 8px', cursor: 'pointer', color: C.text, alignItems: 'center' }}
              >
                <span style={{ color: C.muted, fontSize: 12, transition: 'transform .2s', display: 'inline-block', transform: abierta ? 'rotate(90deg)' : 'none' }}>▸</span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{s.titulo}</span>
                <span style={{ color: hechasSec === s.lecciones.length && s.lecciones.length ? C.emerald : C.muted2, fontSize: 11.5, fontWeight: 700 }}>{hechasSec}/{s.lecciones.length}</span>
              </button>
              {abierta && s.lecciones.map((l, i) => {
                const done = completadas.has(l.id);
                return (
                  <button key={l.id} onClick={() => setActiva(l)} className="ac-lec" style={{ display: 'flex', gap: 9, width: '100%', textAlign: 'left', background: activa?.id === l.id ? 'rgba(52,211,153,.14)' : 'transparent', border: 'none', borderRadius: 9, padding: '8px 10px 8px 22px', cursor: 'pointer', color: C.text, alignItems: 'center' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, border: `1.5px solid ${done ? C.emerald : C.line2}`, background: done ? C.emerald : 'transparent', color: '#052018', transition: 'background .2s,border-color .2s' }}>{done ? '✓' : ''}</span>
                    <span style={{ color: C.muted2, fontSize: 13 }}>{l.tipo === 'video' ? '▶' : '📄'}</span>
                    <span style={{ flex: 1, fontSize: 13, color: done ? C.muted : C.text }}>{i + 1}. {l.titulo}</span>
                    {l.duracion && <span style={{ color: C.muted2, fontSize: 11.5 }}>{l.duracion}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </aside>
    </div>
  );
}

function Reproductor({ leccion }: { leccion: Leccion }) {
  const emb = leccion.tipo === 'video' ? embedUrl(leccion.videoUrl) : null;
  const pasos = leccion.imagenes || [];
  return (
    <div>
      {emb && (
        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 14 }}>
          {emb.tipo === 'iframe'
            ? <iframe src={emb.src} title={leccion.titulo} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            : <video src={emb.src} controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
        </div>
      )}
      <h2 style={{ fontSize: 19, fontWeight: 750, margin: '0 0 8px' }}>{leccion.titulo}</h2>
      {leccion.contenido && <div style={{ color: '#D3DEE6', fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: pasos.length ? 20 : 0 }}>{leccion.contenido}</div>}
      {!!pasos.length && <GuiaPasos pasos={pasos} />}
    </div>
  );
}

/** Guía visual paso a paso: cada captura numerada con su descripción, con un
 * lightbox al hacer clic para verla en grande. */
function GuiaPasos({ pasos }: { pasos: PasoImagen[] }) {
  const [ampliada, setAmpliada] = useState<number | null>(null);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📸 Paso a paso</span><span style={{ height: 1, flex: 1, background: C.line }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {pasos.map((p, i) => (
          <div key={i} className="ac-card" style={{ display: 'flex', gap: 14, animationDelay: `${i * 0.08}s` }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(140deg,${C.emerald},${C.sky})`, color: '#052018', fontWeight: 900, fontSize: 13, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {p.caption && <div style={{ fontSize: 14.5, color: C.text, lineHeight: 1.55, marginBottom: 10 }}>{p.caption}</div>}
              {p.url && (
                <img
                  src={p.url} alt={p.caption || `Paso ${i + 1}`} onClick={() => setAmpliada(i)}
                  style={{ width: '100%', maxWidth: 640, borderRadius: 10, border: `1px solid ${C.line2}`, cursor: 'zoom-in', display: 'block' }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {ampliada !== null && pasos[ampliada] && (
        <div onClick={() => setAmpliada(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,18,.92)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 24, cursor: 'zoom-out', animation: 'acFadeIn .15s ease both' }}>
          <img src={pasos[ampliada].url} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }} />
        </div>
      )}
    </div>
  );
}

// ── Login mínimo (usa el mismo endpoint; cookie compartida) ──
function LoginAcademy({ onOk }: { onOk: () => void }) {
  const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState(''); const [cargando, setCargando] = useState(false);
  const entrar = async () => {
    setCargando(true); setErr('');
    const r = await aReq('/api/auth/login', 'POST', { email, password: pass });
    setCargando(false);
    if (r.error) { setErr(r.error); return; }
    onOk();
  };
  return (
    <div style={{ minHeight: '100vh', background: C.ink, color: C.text, fontFamily: sans, display: 'grid', placeItems: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
      <style>{`${GLOBAL_CSS}@media (max-width:760px){ .ac-login-hero{display:none !important;} .ac-login-card{grid-template-columns:1fr !important;} }`}</style>
      <div className="ac-blob" style={{ width: 480, height: 480, top: -140, left: -140, background: C.emerald, animation: 'acFloat1 20s ease-in-out infinite' }} />
      <div className="ac-blob" style={{ width: 420, height: 420, bottom: -160, right: -140, background: C.sky, animation: 'acFloat2 24s ease-in-out infinite' }} />
      <div className="ac-blob" style={{ width: 260, height: 260, top: '40%', right: '8%', background: C.violet, animation: 'acFloat1 28s ease-in-out infinite reverse', opacity: .22 }} />
      <div className="ac-login-card" style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', width: 820, maxWidth: '100%', background: 'rgba(17,31,50,.9)', backdropFilter: 'blur(8px)', border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.45)', animation: 'acFadeUp .5s cubic-bezier(.2,.8,.2,1) both' }}>
        {/* Panel de bienvenida (solo escritorio) */}
        <div className="ac-login-hero" style={{ padding: '40px 34px', background: `linear-gradient(160deg,${C.emeraldDeep},#062B22 70%)`, display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', overflow: 'hidden' }}>
          <span className="ac-logo-badge" style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.14)', fontWeight: 900, fontSize: 20, color: '#fff' }}>A</span>
          <div style={{ fontSize: 26, fontWeight: 850, letterSpacing: '-.03em', lineHeight: 1.15 }}>Aprende a vender más con DealFlow</div>
          <p style={{ color: 'rgba(255,255,255,.82)', fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>Cursos y tutoriales paso a paso: configurar tu asistente, subir productos, atender por WhatsApp y hacer crecer tu tienda.</p>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, color: 'rgba(255,255,255,.9)' }}>
            <div>✓ Temario organizado por módulos</div>
            <div>✓ Sigue tu progreso curso por curso</div>
            <div>✓ Con las mismas credenciales de DealFlow</div>
          </div>
        </div>
        {/* Formulario */}
        <div style={{ padding: '40px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontWeight: 850, fontSize: 22, letterSpacing: '-.02em' }}>DealFlow <span style={{ background: `linear-gradient(90deg,${C.emerald},${C.sky})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Academy</span></div>
          <p style={{ color: C.muted, fontSize: 14, margin: '6px 0 20px' }}>Inicia sesión para entrar al portal.</p>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Correo</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" style={inputA} />
          <label style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Contraseña</label>
          <input value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()} type="password" placeholder="••••••••" style={inputA} />
          {err && <div style={{ color: C.danger, fontSize: 13, marginBottom: 10, animation: 'acFadeUp .25s ease both' }}>{err}</div>}
          <button className="ac-btn" onClick={entrar} disabled={cargando} style={{ ...btnPrimary, width: '100%', padding: '12px', fontSize: 14.5, opacity: cargando ? 0.7 : 1 }}>{cargando ? 'Entrando…' : 'Entrar'}</button>
          <p style={{ color: C.muted2, fontSize: 12.5, marginTop: 16, textAlign: 'center' }}>Usa el mismo correo y contraseña de tu cuenta DealFlow.</p>
        </div>
      </div>
    </div>
  );
}

// ── Panel de administración ──
function AdminPanel({ onCambio }: { onCambio: () => void }) {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [msg, setMsg] = useState('');
  const [editCurso, setEditCurso] = useState<Partial<Curso> | null>(null);
  const cargar = useCallback(async () => {
    const r = await aReq<{ cursos: Curso[] }>('/api/admin/academy/cursos');
    if (r.data) setCursos(r.data.cursos);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const guardarCurso = async (c: Partial<Curso>) => {
    setMsg('Guardando…');
    const body = { titulo: c.titulo, descripcion: c.descripcion, portada: c.portada, nivel: c.nivel, orden: c.orden, publicado: c.publicado };
    const r = c.id ? await aReq(`/api/admin/academy/cursos/${c.id}`, 'PUT', body) : await aReq('/api/admin/academy/cursos', 'POST', body);
    if (r.error) { setMsg(r.error); return; }
    setMsg('✓ Guardado'); setEditCurso(null); await cargar(); onCambio();
  };
  const borrarCurso = async (id: string) => {
    if (!(await confirmar({ titulo: 'Eliminar curso', mensaje: '¿Eliminar el curso y todas sus lecciones?', aceptar: 'Eliminar', peligro: true }))) return;
    await aReq(`/api/admin/academy/cursos/${id}`, 'DELETE'); await cargar(); onCambio();
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Administrar Academy</h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditCurso({ nivel: 'Básico', publicado: true })} style={btnPrimary}>+ Nuevo curso</button>
      </div>
      {msg && <div style={{ color: msg.startsWith('✓') ? C.emerald : C.muted, fontSize: 13, marginBottom: 12 }}>{msg}</div>}
      {editCurso && <FormCurso curso={editCurso} onGuardar={guardarCurso} onCancelar={() => setEditCurso(null)} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cursos.map((c) => (
          <CursoAdmin key={c.id} curso={c} onEditar={() => setEditCurso(c)} onBorrar={() => borrarCurso(c.id)} onCambio={() => { void cargar(); onCambio(); }} />
        ))}
        {cursos.length === 0 && !editCurso && <div style={{ ...tarjeta, color: C.muted, textAlign: 'center' }}>Aún no hay cursos. Crea el primero con «+ Nuevo curso».</div>}
      </div>
    </>
  );
}

// Sube un archivo (imagen o video) a Academy y devuelve su URL pública, o null.
function subirArchivoAcademy(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      void aReq<{ url: string }>('/api/academy/media', 'POST', { dataUrl: reader.result, nombre: file.name }).then((r) => {
        if (r.data?.url) resolve(r.data.url);
        else { notificar(r.error || 'No pudimos subir el archivo.', 'error'); resolve(null); }
      });
    };
    reader.onerror = () => { notificar('No pudimos leer el archivo.', 'error'); resolve(null); };
    reader.readAsDataURL(file);
  });
}

function FormCurso({ curso, onGuardar, onCancelar }: { curso: Partial<Curso>; onGuardar: (c: Partial<Curso>) => void; onCancelar: () => void }) {
  const [f, setF] = useState<Partial<Curso>>(curso);
  const [subiendo, setSubiendo] = useState(false);
  const set = (k: keyof Curso, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const subirPortada = async (file: File) => { setSubiendo(true); const url = await subirArchivoAcademy(file); setSubiendo(false); if (url) set('portada', url); };
  return (
    <div style={{ ...tarjeta, marginBottom: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>{curso.id ? 'Editar curso' : 'Nuevo curso'}</div>
      <input value={f.titulo || ''} onChange={(e) => set('titulo', e.target.value)} placeholder="Título del curso" style={inputA} />
      <textarea value={f.descripcion || ''} onChange={(e) => set('descripcion', e.target.value)} placeholder="Descripción" style={{ ...inputA, minHeight: 70, resize: 'vertical' }} />
      {/* Portada: subir una imagen o pegar una URL. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {f.portada && <img src={f.portada} alt="" style={{ width: 96, height: 60, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line2}` }} />}
        <label style={{ ...btnGhost, display: 'inline-block', borderStyle: 'dashed', cursor: subiendo ? 'default' : 'pointer', opacity: subiendo ? 0.6 : 1 }}>
          {subiendo ? 'Subiendo…' : (f.portada ? '🖼️ Cambiar portada' : '🖼️ Subir portada')}
          <input type="file" accept="image/*" disabled={subiendo} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirPortada(file); e.target.value = ''; }} style={{ display: 'none' }} />
        </label>
        {f.portada && <button onClick={() => set('portada', '')} style={{ ...btnGhost, padding: '5px 10px', color: C.danger }}>Quitar</button>}
      </div>
      <input value={f.portada || ''} onChange={(e) => set('portada', e.target.value)} placeholder="…o pega la URL de la portada" style={inputA} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={f.nivel || 'Básico'} onChange={(e) => set('nivel', e.target.value)} style={{ ...inputA, width: 160, marginBottom: 0 }}>
          <option>Básico</option><option>Intermedio</option><option>Avanzado</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.muted, fontSize: 14 }}>
          <input type="checkbox" checked={!!f.publicado} onChange={(e) => set('publicado', e.target.checked)} /> Publicado (visible en el portal)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={() => onGuardar(f)} style={btnPrimary}>Guardar</button>
        <button onClick={onCancelar} style={btnGhost}>Cancelar</button>
      </div>
    </div>
  );
}

function CursoAdmin({ curso, onEditar, onBorrar, onCambio }: { curso: Curso; onEditar: () => void; onBorrar: () => void; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  // Lección en edición: guardamos también a qué sección pertenece / se agrega.
  const [editLec, setEditLec] = useState<{ seccionId: string; leccion: Partial<Leccion> } | null>(null);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const secciones = curso.secciones || [];
  const totalLec = secciones.reduce((n, s) => n + s.lecciones.length, 0);

  const guardarLec = async (seccionId: string, l: Partial<Leccion>) => {
    const body = { titulo: l.titulo, tipo: l.tipo, videoUrl: l.videoUrl, contenido: l.contenido, duracion: l.duracion, orden: l.orden, publicado: l.publicado, seccionId, imagenes: l.imagenes || [] };
    const r = l.id ? await aReq(`/api/admin/academy/lecciones/${l.id}`, 'PUT', body) : await aReq(`/api/admin/academy/cursos/${curso.id}/lecciones`, 'POST', body);
    if (r.error) { notificar(r.error, 'error'); return; }
    setEditLec(null); onCambio();
  };
  const borrarLec = async (id: string) => { if (await confirmar({ titulo: 'Eliminar lección', mensaje: '¿Eliminar la lección?', aceptar: 'Eliminar', peligro: true })) { await aReq(`/api/admin/academy/lecciones/${id}`, 'DELETE'); onCambio(); } };
  const agregarSeccion = async () => { await aReq(`/api/admin/academy/cursos/${curso.id}/secciones`, 'POST', { titulo: 'Nueva sección' }); onCambio(); };
  const renombrarSeccion = async (id: string, titulo: string) => { await aReq(`/api/admin/academy/secciones/${id}`, 'PUT', { titulo }); setRenombrando(null); onCambio(); };
  const borrarSeccion = async (id: string) => { if (await confirmar({ titulo: 'Eliminar sección', mensaje: '¿Eliminar la sección y todas sus lecciones?', aceptar: 'Eliminar', peligro: true })) { await aReq(`/api/admin/academy/secciones/${id}`, 'DELETE'); onCambio(); } };
  // Reordenar secciones y lecciones (▲▼): reindexa y guarda en lote.
  const reordenar = async (payload: unknown) => { await aReq(`/api/admin/academy/cursos/${curso.id}/orden`, 'PUT', payload); onCambio(); };
  const moverSeccion = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= secciones.length) return;
    const arr = [...secciones]; [arr[i], arr[j]] = [arr[j], arr[i]];
    void reordenar({ secciones: arr.map((s, idx) => ({ id: s.id, orden: idx })) });
  };
  const moverLeccion = (s: Seccion, i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= s.lecciones.length) return;
    const arr = [...s.lecciones]; [arr[i], arr[j]] = [arr[j], arr[i]];
    void reordenar({ lecciones: arr.map((l, idx) => ({ id: l.id, orden: idx, seccionId: s.id })) });
  };
  const flechita: React.CSSProperties = { ...btnGhost, padding: '2px 7px', fontSize: 12, lineHeight: 1 };

  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setAbierto(!abierto)} style={{ ...btnGhost, padding: '4px 8px' }}>{abierto ? '▾' : '▸'}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{curso.titulo} {!curso.publicado && <span style={{ color: C.muted2, fontSize: 12, fontWeight: 600 }}>· borrador</span>}</div>
          <div style={{ color: C.muted, fontSize: 12.5 }}>{curso.nivel} · {secciones.length} sección(es) · {totalLec} lección(es)</div>
        </div>
        <button onClick={onEditar} style={btnGhost}>Editar</button>
        <button onClick={onBorrar} style={{ ...btnGhost, color: C.danger }}>Eliminar</button>
      </div>
      {abierto && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          {secciones.map((s, si) => (
            <div key={s.id} style={{ marginBottom: 12, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => moverSeccion(si, -1)} disabled={si === 0} style={{ ...flechita, opacity: si === 0 ? 0.35 : 1 }} title="Subir sección">▲</button>
                  <button onClick={() => moverSeccion(si, 1)} disabled={si === secciones.length - 1} style={{ ...flechita, opacity: si === secciones.length - 1 ? 0.35 : 1 }} title="Bajar sección">▼</button>
                </div>
                {renombrando === s.id ? (
                  <input autoFocus defaultValue={s.titulo} onBlur={(e) => renombrarSeccion(s.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && renombrarSeccion(s.id, (e.target as HTMLInputElement).value)} style={{ ...inputA, marginBottom: 0, flex: 1 }} />
                ) : (
                  <div style={{ flex: 1, fontWeight: 750, fontSize: 14 }}>📁 {s.titulo}</div>
                )}
                <button onClick={() => setRenombrando(s.id)} style={{ ...btnGhost, padding: '3px 8px', fontSize: 12 }}>Renombrar</button>
                <button onClick={() => borrarSeccion(s.id)} style={{ ...btnGhost, padding: '3px 8px', fontSize: 12, color: C.danger }}>Eliminar</button>
              </div>
              {s.lecciones.map((l, li) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={() => moverLeccion(s, li, -1)} disabled={li === 0} style={{ ...flechita, opacity: li === 0 ? 0.35 : 1 }} title="Subir">▲</button>
                    <button onClick={() => moverLeccion(s, li, 1)} disabled={li === s.lecciones.length - 1} style={{ ...flechita, opacity: li === s.lecciones.length - 1 ? 0.35 : 1 }} title="Bajar">▼</button>
                  </div>
                  <span style={{ color: C.emerald }}>{l.tipo === 'video' ? '▶' : '📄'}</span>
                  <span style={{ flex: 1 }}>{l.titulo} {!l.publicado && <span style={{ color: C.muted2, fontSize: 11 }}>(oculta)</span>}</span>
                  <button onClick={() => setEditLec({ seccionId: s.id, leccion: l })} style={{ ...btnGhost, padding: '3px 8px' }}>Editar</button>
                  <button onClick={() => borrarLec(l.id)} style={{ ...btnGhost, padding: '3px 8px', color: C.danger }}>×</button>
                </div>
              ))}
              {editLec && editLec.seccionId === s.id ? (
                <FormLeccion leccion={editLec.leccion} onGuardar={(l) => guardarLec(s.id, l)} onCancelar={() => setEditLec(null)} />
              ) : (
                <button onClick={() => setEditLec({ seccionId: s.id, leccion: { tipo: 'video', publicado: true } })} style={{ ...btnGhost, marginTop: 6, borderStyle: 'dashed', fontSize: 12.5 }}>+ Agregar lección</button>
              )}
            </div>
          ))}
          <button onClick={agregarSeccion} style={{ ...btnGhost, borderStyle: 'dashed' }}>+ Agregar sección</button>
        </div>
      )}
    </div>
  );
}

function FormLeccion({ leccion, onGuardar, onCancelar }: { leccion: Partial<Leccion>; onGuardar: (l: Partial<Leccion>) => void; onCancelar: () => void }) {
  const [f, setF] = useState<Partial<Leccion>>(leccion);
  const [subiendo, setSubiendo] = useState(false);
  const [subVideo, setSubVideo] = useState(false);
  const set = (k: keyof Leccion, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const pasos = f.imagenes || [];
  const setPasos = (n: PasoImagen[]) => set('imagenes', n);

  const subirCaptura = async (file: File) => {
    setSubiendo(true);
    const url = await subirArchivoAcademy(file);
    setSubiendo(false);
    if (url) setPasos([...pasos, { url, caption: '' }]);
  };
  const subirVideo = async (file: File) => {
    setSubVideo(true);
    const url = await subirArchivoAcademy(file);
    setSubVideo(false);
    if (url) set('videoUrl', url);
  };

  return (
    <div style={{ ...tarjeta, background: 'rgba(255,255,255,.03)', marginTop: 10 }}>
      <input value={f.titulo || ''} onChange={(e) => set('titulo', e.target.value)} placeholder="Título de la lección" style={inputA} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select value={f.tipo || 'video'} onChange={(e) => set('tipo', e.target.value)} style={{ ...inputA, width: 140 }}>
          <option value="video">Video</option><option value="articulo">Artículo</option>
        </select>
        <input value={f.duracion || ''} onChange={(e) => set('duracion', e.target.value)} placeholder="Duración (ej. 5:30)" style={{ ...inputA, width: 150 }} />
      </div>
      {f.tipo !== 'articulo' && (
        <>
          <input value={f.videoUrl || ''} onChange={(e) => set('videoUrl', e.target.value)} placeholder="URL del video (YouTube, Vimeo o .mp4)" style={inputA} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <label style={{ ...btnGhost, display: 'inline-block', borderStyle: 'dashed', cursor: subVideo ? 'default' : 'pointer', opacity: subVideo ? 0.6 : 1 }}>
              {subVideo ? 'Subiendo video…' : '⬆️ Subir video (mp4)'}
              <input type="file" accept="video/*" disabled={subVideo} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirVideo(file); e.target.value = ''; }} style={{ display: 'none' }} />
            </label>
            <span style={{ fontSize: 11.5, color: C.muted2 }}>Máx. ~25 MB. Para videos largos usa mejor una URL de YouTube o Vimeo.</span>
          </div>
          {f.videoUrl && f.videoUrl.startsWith('/api/academy/media/') && (
            <video src={f.videoUrl} controls style={{ width: '100%', maxHeight: 200, borderRadius: 8, border: `1px solid ${C.line2}`, marginBottom: 10, background: '#000' }} />
          )}
        </>
      )}
      <textarea value={f.contenido || ''} onChange={(e) => set('contenido', e.target.value)} placeholder={f.tipo === 'articulo' ? 'Contenido del artículo…' : 'Descripción / notas (opcional)'} style={{ ...inputA, minHeight: f.tipo === 'articulo' ? 160 : 70, resize: 'vertical' }} />

      {/* Guía paso a paso: capturas de pantalla numeradas, cada una con su descripción. */}
      <div style={{ border: `1px dashed ${C.line2}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>📸 Paso a paso (capturas)</div>
        {pasos.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, background: 'rgba(255,255,255,.03)', borderRadius: 9, padding: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.emerald, color: '#052018', fontWeight: 800, fontSize: 11.5, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 4 }}>{i + 1}</span>
            {p.url && <img src={p.url} alt="" style={{ width: 88, height: 56, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.line2}`, flexShrink: 0 }} />}
            <textarea
              value={p.caption || ''} onChange={(e) => setPasos(pasos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
              placeholder="Qué hacer en este paso…" style={{ ...inputA, flex: 1, minHeight: 40, marginBottom: 0, fontSize: 13 }}
            />
            <button onClick={() => setPasos(pasos.filter((_, j) => j !== i))} style={{ ...btnGhost, padding: '5px 9px', color: C.danger, flexShrink: 0 }}>×</button>
          </div>
        ))}
        <label style={{ ...btnGhost, display: 'inline-block', borderStyle: 'dashed', cursor: subiendo ? 'default' : 'pointer', opacity: subiendo ? 0.6 : 1 }}>
          {subiendo ? 'Subiendo…' : '+ Subir captura de pantalla'}
          <input type="file" accept="image/*" disabled={subiendo} onChange={(e) => { const file = e.target.files?.[0]; if (file) void subirCaptura(file); e.target.value = ''; }} style={{ display: 'none' }} />
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.muted, fontSize: 14, marginBottom: 10 }}>
        <input type="checkbox" checked={f.publicado !== false} onChange={(e) => set('publicado', e.target.checked)} /> Publicada
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onGuardar(f)} style={btnPrimary}>Guardar lección</button>
        <button onClick={onCancelar} style={btnGhost}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Estilos ──
const tarjeta: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 };
const inputA: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0B1626', border: `1px solid ${C.line2}`, borderRadius: 9, padding: '10px 12px', fontFamily: sans, fontSize: 14, color: C.text, marginBottom: 10 };
const btnPrimary: React.CSSProperties = { background: C.emerald, color: '#052018', border: 'none', borderRadius: 9, padding: '8px 15px', fontFamily: sans, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: C.text, border: `1px solid ${C.line2}`, borderRadius: 9, padding: '7px 13px', fontFamily: sans, fontWeight: 600, fontSize: 13, cursor: 'pointer' };
