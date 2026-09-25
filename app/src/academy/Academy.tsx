import { useEffect, useState, useCallback } from 'react';

/**
 * DealFlow Academy — portal educativo (academy.dealflow.sbs).
 * Independiente del panel: hace su propio fetch y usa la sesión compartida
 * (cookie en .dealflow.sbs). Cualquier usuario logueado ve los cursos; el
 * admin/superadmin puede administrarlos desde el mismo portal.
 */

// ── Tema (autocontenido, look de marca) ──
const C = {
  ink: '#0C1422', panel: '#111F32', line: 'rgba(255,255,255,.10)', line2: 'rgba(255,255,255,.16)',
  emerald: '#34D399', emeraldDeep: '#059669', text: '#E8EFEA', muted: '#9DB0BD', muted2: '#6F8494',
  danger: '#F87171',
};
const sans = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

// ── Tipos ──
interface Leccion { id: string; cursoId: string; seccionId: string; titulo: string; tipo: 'video' | 'articulo'; videoUrl: string; contenido: string; duracion: string; orden: number; publicado: boolean }
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
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return { tipo: 'video', src: url };
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
    <div style={{ minHeight: '100vh', background: C.ink, color: C.text, fontFamily: sans }}>
      <style>{`@media (max-width: 820px){
        .ac-curso-grid{grid-template-columns:1fr !important;}
        .ac-temario{position:static !important;order:-1;}
      }`}</style>
      <Encabezado sesion={sesion} esAdmin={esAdmin} admin={admin} setAdmin={setAdmin} onVolver={cursoAbierto ? () => setCursoAbierto(null) : undefined} />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 80px' }}>
        {admin && esAdmin ? (
          <AdminPanel onCambio={cargarCursos} />
        ) : cursoAbierto ? (
          <VistaCurso cursoId={cursoAbierto.id} />
        ) : (
          <Portal cursos={cursos} onAbrir={(c) => setCursoAbierto(c)} />
        )}
      </main>
    </div>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: C.ink, display: 'grid', placeItems: 'center', fontFamily: sans }}>{children}</div>;
}

function Encabezado({ sesion, esAdmin, admin, setAdmin, onVolver }: { sesion: Sesion; esAdmin: boolean; admin: boolean; setAdmin: (v: boolean) => void; onVolver?: () => void }) {
  return (
    <header style={{ borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, background: 'rgba(12,20,34,.85)', backdropFilter: 'blur(12px)', zIndex: 10 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 62, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: `linear-gradient(140deg,${C.emerald},${C.emeraldDeep})`, fontWeight: 900, color: '#052018' }}>A</span>
        <span style={{ fontWeight: 800, letterSpacing: '-.02em' }}>DealFlow <span style={{ color: C.emerald }}>Academy</span></span>
        {onVolver && !admin && <button onClick={onVolver} style={btnGhost}>← Volver</button>}
        <div style={{ flex: 1 }} />
        {esAdmin && (
          <button onClick={() => setAdmin(!admin)} style={admin ? btnPrimary : btnGhost}>
            {admin ? '👁️ Ver portal' : '⚙️ Administrar'}
          </button>
        )}
        <span style={{ color: C.muted, fontSize: 13 }}>{sesion.nombre}</span>
      </div>
    </header>
  );
}

// ── Portal (lectura) ──
function Portal({ cursos, onAbrir }: { cursos: Curso[]; onAbrir: (c: Curso) => void }) {
  return (
    <>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 6px' }}>Aprende a sacarle todo a DealFlow</h1>
      <p style={{ color: C.muted, fontSize: 16, margin: '0 0 26px' }}>Tutoriales y cursos: cómo crear automatizaciones, subir productos, atender por WhatsApp y mucho más.</p>
      {cursos.length === 0 ? (
        <div style={{ ...tarjeta, textAlign: 'center', color: C.muted }}>Pronto habrá contenido nuevo por aquí. 📚</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {cursos.map((c) => (
            <button key={c.id} onClick={() => onAbrir(c)} style={{ ...tarjeta, padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ height: 148, background: c.portada ? `center/cover no-repeat url(${c.portada})` : `linear-gradient(140deg,${C.emeraldDeep},${C.panel})` }} />
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.emerald, textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.nivel}</div>
                <div style={{ fontWeight: 750, fontSize: 16, margin: '4px 0 6px' }}>{c.titulo}</div>
                <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.descripcion}</div>
                <div style={{ color: C.muted2, fontSize: 12.5, marginTop: 10 }}>{typeof c.lecciones === 'number' ? c.lecciones : (c.lecciones as Leccion[]).length} lección(es)</div>
              </div>
            </button>
          ))}
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
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 4px' }}>{curso.titulo}</h1>
        <p style={{ color: C.muted, margin: '0 0 18px' }}>{curso.descripcion}</p>
        {activa ? (
          <>
            <Reproductor leccion={activa} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => marcar(activa.id, !completadas.has(activa.id))}
                style={completadas.has(activa.id) ? { ...btnGhost, borderColor: C.emerald, color: C.emerald } : btnPrimary}
              >
                {completadas.has(activa.id) ? '✓ Completada' : 'Marcar como completada'}
              </button>
              {(() => {
                const idx = todas.findIndex((l) => l.id === activa.id);
                const sig = todas[idx + 1];
                return sig ? <button onClick={() => setActiva(sig)} style={btnGhost}>Siguiente lección →</button> : null;
              })()}
            </div>
          </>
        ) : <div style={{ color: C.muted }}>Este curso aún no tiene lecciones.</div>}
      </div>
      <aside style={{ ...tarjeta, padding: 12, position: 'sticky', top: 78 }} className="ac-temario">
        <div style={{ padding: '4px 8px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Contenido del curso</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, height: 7, borderRadius: 99, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${C.emerald},${C.emeraldDeep})`, transition: 'width .3s' }} />
            </div>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 700, whiteSpace: 'nowrap' }}>{pct}%</span>
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
                <span style={{ color: C.muted, fontSize: 12 }}>{abierta ? '▾' : '▸'}</span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{s.titulo}</span>
                <span style={{ color: C.muted2, fontSize: 11.5 }}>{hechasSec}/{s.lecciones.length}</span>
              </button>
              {abierta && s.lecciones.map((l, i) => {
                const done = completadas.has(l.id);
                return (
                  <button key={l.id} onClick={() => setActiva(l)} style={{ display: 'flex', gap: 9, width: '100%', textAlign: 'left', background: activa?.id === l.id ? 'rgba(52,211,153,.12)' : 'transparent', border: 'none', borderRadius: 9, padding: '8px 10px 8px 22px', cursor: 'pointer', color: C.text, alignItems: 'center' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, border: `1.5px solid ${done ? C.emerald : C.line2}`, background: done ? C.emerald : 'transparent', color: '#052018' }}>{done ? '✓' : ''}</span>
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
      {leccion.contenido && <div style={{ color: '#D3DEE6', fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{leccion.contenido}</div>}
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
    <Centro>
      <div style={{ ...tarjeta, width: 360, maxWidth: '90vw' }}>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>DealFlow <span style={{ color: C.emerald }}>Academy</span></div>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>Inicia sesión con tus credenciales de DealFlow.</p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" style={inputA} />
        <input value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()} type="password" placeholder="Contraseña" style={inputA} />
        {err && <div style={{ color: C.danger, fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <button onClick={entrar} disabled={cargando} style={{ ...btnPrimary, width: '100%', padding: '11px' }}>{cargando ? 'Entrando…' : 'Entrar'}</button>
      </div>
    </Centro>
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
    if (!confirm('¿Eliminar el curso y todas sus lecciones?')) return;
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

function FormCurso({ curso, onGuardar, onCancelar }: { curso: Partial<Curso>; onGuardar: (c: Partial<Curso>) => void; onCancelar: () => void }) {
  const [f, setF] = useState<Partial<Curso>>(curso);
  const set = (k: keyof Curso, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ ...tarjeta, marginBottom: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>{curso.id ? 'Editar curso' : 'Nuevo curso'}</div>
      <input value={f.titulo || ''} onChange={(e) => set('titulo', e.target.value)} placeholder="Título del curso" style={inputA} />
      <textarea value={f.descripcion || ''} onChange={(e) => set('descripcion', e.target.value)} placeholder="Descripción" style={{ ...inputA, minHeight: 70, resize: 'vertical' }} />
      <input value={f.portada || ''} onChange={(e) => set('portada', e.target.value)} placeholder="URL de la imagen de portada (opcional)" style={inputA} />
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
    const body = { titulo: l.titulo, tipo: l.tipo, videoUrl: l.videoUrl, contenido: l.contenido, duracion: l.duracion, orden: l.orden, publicado: l.publicado, seccionId };
    const r = l.id ? await aReq(`/api/admin/academy/lecciones/${l.id}`, 'PUT', body) : await aReq(`/api/admin/academy/cursos/${curso.id}/lecciones`, 'POST', body);
    if (r.error) { alert(r.error); return; }
    setEditLec(null); onCambio();
  };
  const borrarLec = async (id: string) => { if (confirm('¿Eliminar la lección?')) { await aReq(`/api/admin/academy/lecciones/${id}`, 'DELETE'); onCambio(); } };
  const agregarSeccion = async () => { await aReq(`/api/admin/academy/cursos/${curso.id}/secciones`, 'POST', { titulo: 'Nueva sección' }); onCambio(); };
  const renombrarSeccion = async (id: string, titulo: string) => { await aReq(`/api/admin/academy/secciones/${id}`, 'PUT', { titulo }); setRenombrando(null); onCambio(); };
  const borrarSeccion = async (id: string) => { if (confirm('¿Eliminar la sección y todas sus lecciones?')) { await aReq(`/api/admin/academy/secciones/${id}`, 'DELETE'); onCambio(); } };

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
          {secciones.map((s) => (
            <div key={s.id} style={{ marginBottom: 12, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {renombrando === s.id ? (
                  <input autoFocus defaultValue={s.titulo} onBlur={(e) => renombrarSeccion(s.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && renombrarSeccion(s.id, (e.target as HTMLInputElement).value)} style={{ ...inputA, marginBottom: 0, flex: 1 }} />
                ) : (
                  <div style={{ flex: 1, fontWeight: 750, fontSize: 14 }}>📁 {s.titulo}</div>
                )}
                <button onClick={() => setRenombrando(s.id)} style={{ ...btnGhost, padding: '3px 8px', fontSize: 12 }}>Renombrar</button>
                <button onClick={() => borrarSeccion(s.id)} style={{ ...btnGhost, padding: '3px 8px', fontSize: 12, color: C.danger }}>Eliminar</button>
              </div>
              {s.lecciones.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
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
  const set = (k: keyof Leccion, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ ...tarjeta, background: 'rgba(255,255,255,.03)', marginTop: 10 }}>
      <input value={f.titulo || ''} onChange={(e) => set('titulo', e.target.value)} placeholder="Título de la lección" style={inputA} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select value={f.tipo || 'video'} onChange={(e) => set('tipo', e.target.value)} style={{ ...inputA, width: 140 }}>
          <option value="video">Video</option><option value="articulo">Artículo</option>
        </select>
        <input value={f.duracion || ''} onChange={(e) => set('duracion', e.target.value)} placeholder="Duración (ej. 5:30)" style={{ ...inputA, width: 150 }} />
      </div>
      {f.tipo !== 'articulo' && <input value={f.videoUrl || ''} onChange={(e) => set('videoUrl', e.target.value)} placeholder="URL del video (YouTube, Vimeo o .mp4)" style={inputA} />}
      <textarea value={f.contenido || ''} onChange={(e) => set('contenido', e.target.value)} placeholder={f.tipo === 'articulo' ? 'Contenido del artículo…' : 'Descripción / notas (opcional)'} style={{ ...inputA, minHeight: f.tipo === 'articulo' ? 160 : 70, resize: 'vertical' }} />
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
