import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Drive de DealFlow (drive.dealflow.sbs): la nube del equipo. Los archivos viven en el Google
 * Drive de DealFlow; aquí se entra con la cuenta de DealFlow (admin, soporte o marketing).
 */

interface Item { id: string; nombre: string; carpeta: boolean; mime: string; tamano: number; modificado: string; miniatura: boolean; por: string }
interface Estado {
  configurado: boolean; conectado: boolean; puedeConectar: boolean; email?: string; raiz?: string; aviso?: string;
  uso?: { usado: number; limite: number }; usuario: { nombre: string; email: string; role: string };
}
interface Subida { id: string; nombre: string; tamano: number; avance: number; estado: 'subiendo' | 'listo' | 'error'; error?: string }

async function api<T>(ruta: string, init: RequestInit = {}): Promise<{ data?: T; error?: string; status: number }> {
  try {
    const r = await fetch(`/api/drive${ruta}`, { credentials: 'same-origin', ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (d as { error?: string }).error || `Error ${r.status}`, status: r.status };
    return { data: d as T, status: r.status };
  } catch { return { error: 'Sin conexión con el servidor.', status: 0 }; }
}

const fmtTam = (n: number) => (n <= 0 ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${(n / 1073741824).toFixed(2).replace('.', ',')} GB`);
const fmtFecha = (s: string) => {
  const t = new Date(s).getTime(); if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'ahora'; if (m < 60) return `hace ${m} min`; if (m < 1440) return `hace ${Math.round(m / 60)} h`; if (m < 10080) return `hace ${Math.round(m / 1440)} d`;
  return new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};
const ext = (n: string) => (n.includes('.') ? n.split('.').pop()!.toUpperCase().slice(0, 4) : '');
const tipo = (it: Item) => it.carpeta ? 'carpeta' : it.mime.startsWith('image/') ? 'imagen' : it.mime.startsWith('video/') ? 'video' : it.mime.startsWith('audio/') ? 'audio' : it.mime === 'application/pdf' ? 'pdf'
  : /sheet|excel|csv/.test(it.mime) ? 'hoja' : /word|document|text\//.test(it.mime) ? 'doc' : /presentation|powerpoint/.test(it.mime) ? 'slides' : /zip|rar|7z|compressed|tar/.test(it.mime) ? 'zip' : 'otro';
const COLOR: Record<string, string> = { imagen: '#0EA5E9', video: '#8B5CF6', audio: '#EC4899', pdf: '#EF4444', hoja: '#10B981', doc: '#3B82F6', slides: '#F59E0B', zip: '#64748B', otro: '#64748B' };

function IconoCarpeta({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M4 12a4 4 0 0 1 4-4h11l4 5h17a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#F5B942" />
      <path d="M4 18h40v18a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#FCD34D" />
    </svg>
  );
}
function IconoArchivo({ it, size = 40 }: { it: Item; size?: number }) {
  if (it.carpeta) return <IconoCarpeta size={size} />;
  const c = COLOR[tipo(it)] || '#64748B';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 4h17l11 11v25a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill="var(--df-surface)" stroke={c} strokeWidth="2.5" />
      <path d="M29 4v8a3 3 0 0 0 3 3h8" fill="none" stroke={c} strokeWidth="2.5" />
      <rect x="6" y="27" width="30" height="12" rx="3" fill={c} />
      <text x="21" y="36" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="system-ui,sans-serif">{ext(it.nombre) || '•'}</text>
    </svg>
  );
}

const urlArchivo = (id: string, descargar = false) => `/api/drive/archivo/${encodeURIComponent(id)}${descargar ? '?descargar=1' : ''}`;

/** Sube un archivo: directo a Google (rápido, no pasa por el servidor); si no se puede, por el puente. */
function subirArchivo(f: File, padre: string, alAvanzar: (p: number) => void): Promise<void> {
  const put = (url: string, tipoCont: string, conCookies: boolean) => new Promise<void>((ok, mal) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.withCredentials = conCookies;
    x.setRequestHeader('Content-Type', tipoCont);
    x.upload.onprogress = (e) => { if (e.lengthComputable) alAvanzar(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : mal(Object.assign(new Error((() => { try { return JSON.parse(x.responseText).error || `Error ${x.status}`; } catch { return `Error ${x.status}`; } })()), { red: false })));
    x.onerror = () => mal(Object.assign(new Error('Se cortó la conexión.'), { red: true }));
    x.send(f);
  });
  return (async () => {
    const r = await api<{ url: string }>('/subir/iniciar', { method: 'POST', body: JSON.stringify({ padre, nombre: f.name, mime: f.type || 'application/octet-stream', tamano: f.size }) });
    if (!r.data) throw new Error(r.error || 'No se pudo empezar la subida.');
    try { await put(r.data.url, f.type || 'application/octet-stream', false); }
    catch (e) {
      if (!(e as { red?: boolean }).red) throw e;
      // El navegador no pudo hablar directo con Google: se sube por el servidor (sin guardarlo).
      alAvanzar(0);
      await put(`/api/drive/subir/puente?${new URLSearchParams({ padre, nombre: f.name, mime: f.type || 'application/octet-stream' })}`, 'application/octet-stream', true);
    }
  })();
}

export function Drive() {
  const [sesion, setSesion] = useState<'cargando' | 'sin' | 'si'>('cargando');
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorEstado, setErrorEstado] = useState('');
  const cargarEstado = useCallback(async () => {
    const r = await api<Estado>('/estado');
    if (r.status === 401) { setSesion('sin'); return; }
    setSesion('si');
    if (r.data) { setEstado(r.data); setErrorEstado(''); } else setErrorEstado(r.error || 'No pudimos abrir el Drive.');
  }, []);
  useEffect(() => { void cargarEstado(); }, [cargarEstado]);
  useEffect(() => { document.title = 'Drive · DealFlow'; }, []);

  if (sesion === 'cargando') return <Pantalla><div style={{ color: 'var(--df-text-muted)' }}>Abriendo el Drive…</div></Pantalla>;
  if (sesion === 'sin') return <Login alEntrar={() => void cargarEstado()} />;
  if (!estado) return <Pantalla><Tarjeta titulo="Drive de DealFlow"><p style={{ margin: 0, color: 'var(--df-text-muted)' }}>{errorEstado}</p></Tarjeta></Pantalla>;
  if (!estado.conectado) return <SinConectar estado={estado} />;
  return <Explorador estado={estado} recargarEstado={() => void cargarEstado()} />;
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--df-bg)', color: 'var(--df-text)', padding: '24px max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left))', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>{children}</div>;
}
function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 'min(440px, 100%)', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 18, padding: 26, boxShadow: '0 24px 60px -30px rgba(2,6,23,.35)' }}>
      <Marca />
      <h1 style={{ fontSize: 20, margin: '18px 0 8px', letterSpacing: '-0.01em' }}>{titulo}</h1>
      {children}
    </div>
  );
}
function Marca() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <img src="/logo.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
      <b style={{ fontSize: 17, letterSpacing: '-0.02em' }}>DealFlow <span style={{ color: 'var(--df-brand, #10B981)' }}>Drive</span></b>
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10, padding: '11px 12px', fontFamily: 'inherit', fontSize: 14, background: 'var(--df-bg)', color: 'var(--df-text)' };
const btnP: React.CSSProperties = { border: 0, borderRadius: 10, padding: '11px 16px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer' };
const btnS: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 10, padding: '9px 14px', background: 'var(--df-surface)', color: 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' };

function Login({ alEntrar }: { alEntrar: () => void }) {
  const [email, setEmail] = useState(''); const [clave, setClave] = useState(''); const [msg, setMsg] = useState(''); const [ocupado, setOcupado] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true); setMsg('');
    const r = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: clave }) });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg(d.error || 'No pudimos entrar.'); return; }
    alEntrar();
  };
  return (
    <Pantalla>
      <Tarjeta titulo="Entra al Drive del equipo">
        <p style={{ margin: '0 0 16px', color: 'var(--df-text-muted)', fontSize: 14 }}>Usa tu cuenta del equipo DealFlow (administración, soporte o marketing).</p>
        <form onSubmit={(e) => void entrar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input id="drive-email" type="email" autoComplete="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} required />
          <input id="drive-clave" type="password" autoComplete="current-password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} style={inp} required />
          {msg && <div style={{ color: 'var(--df-danger-dark, #B91C1C)', fontSize: 13, fontWeight: 600 }}>{msg}</div>}
          <button type="submit" disabled={ocupado} style={{ ...btnP, opacity: ocupado ? 0.6 : 1 }}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </Tarjeta>
    </Pantalla>
  );
}

function SinConectar({ estado }: { estado: Estado }) {
  const q = new URLSearchParams(location.search);
  const [msg, setMsg] = useState(q.get('google') === 'error' ? `Google no conectó: ${q.get('detalle') || ''}` : q.get('google') === 'cancelado' ? 'Cancelaste la conexión con Google.' : estado.aviso || '');
  const conectar = async () => {
    const r = await api<{ url: string }>(`/google/conectar?volver=${encodeURIComponent(location.origin + location.pathname)}`);
    if (r.data) location.href = r.data.url; else setMsg(r.error || 'No se pudo.');
  };
  return (
    <Pantalla>
      <Tarjeta titulo={estado.puedeConectar ? 'Conecta el Google Drive de DealFlow' : 'El Drive aún no está conectado'}>
        {estado.puedeConectar ? (
          <>
            <p style={{ margin: '0 0 12px', color: 'var(--df-text-muted)', fontSize: 14, lineHeight: 1.55 }}>
              Los archivos del equipo se guardan en el Google Drive de DealFlow, no en el servidor. Entra con la cuenta de Gmail de DealFlow y acepta el permiso. DealFlow solo ve la carpeta «DealFlow Drive» que crea ahí.
            </p>
            {!estado.configurado && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--df-warning, #B45309)', fontWeight: 600 }}>Antes falta poner GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Railway.</p>}
            <button type="button" onClick={() => void conectar()} disabled={!estado.configurado} style={{ ...btnP, width: '100%', opacity: estado.configurado ? 1 : 0.5 }}>Conectar Google Drive</button>
          </>
        ) : <p style={{ margin: 0, color: 'var(--df-text-muted)', fontSize: 14 }}>Pídele a un administrador de DealFlow que lo conecte. En cuanto lo haga, aquí verás las carpetas del equipo.</p>}
        {msg && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--df-danger-dark, #B91C1C)' }}>{msg}</p>}
      </Tarjeta>
    </Pantalla>
  );
}

type Dialogo = { tipo: 'carpeta' } | { tipo: 'renombrar'; it: Item } | { tipo: 'eliminar'; it: Item } | { tipo: 'compartir'; it: Item } | { tipo: 'mover'; it: Item } | null;

function Explorador({ estado, recargarEstado }: { estado: Estado; recargarEstado: () => void }) {
  const raiz = estado.raiz || '';
  const leerCarpeta = () => new URLSearchParams(location.search).get('c') || raiz;
  const [carpeta, setCarpeta] = useState(leerCarpeta);
  const [items, setItems] = useState<Item[] | null>(null);
  const [rutaN, setRutaN] = useState<{ id: string; nombre: string }[]>([]);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState('');
  const [vistaLista, setVistaLista] = useState(() => { try { return localStorage.getItem('df-drive-vista') === 'lista'; } catch { return false; } });
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [vistaPrevia, setVistaPrevia] = useState<Item | null>(null);
  const [menu, setMenu] = useState<{ it: Item; x: number; y: number } | null>(null);
  const [aviso, setAviso] = useState('');
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async (c = carpeta, q = buscando) => {
    setError('');
    const r = await api<{ items: Item[]; ruta: { id: string; nombre: string }[] }>(`/lista?${new URLSearchParams(q ? { q } : { carpeta: c })}`);
    if (r.data) { setItems(r.data.items); setRutaN(r.data.ruta); } else { setError(r.error || 'No se pudo leer la carpeta.'); setItems([]); }
  }, [carpeta, buscando]);
  useEffect(() => { setItems(null); void cargar(); }, [cargar]);
  useEffect(() => { const f = () => { setBuscando(''); setBusqueda(''); setCarpeta(leerCarpeta()); }; window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 3500); return () => clearTimeout(t); }, [aviso]);
  useEffect(() => { try { localStorage.setItem('df-drive-vista', vistaLista ? 'lista' : 'cuadros'); } catch { /* sin storage */ } }, [vistaLista]);

  const abrirCarpeta = (id: string) => {
    setBuscando(''); setBusqueda(''); setCarpeta(id);
    const u = new URL(location.href); if (id === raiz) u.searchParams.delete('c'); else u.searchParams.set('c', id);
    history.pushState(null, '', u.pathname + u.search);
  };
  const abrir = (it: Item) => (it.carpeta ? abrirCarpeta(it.id) : setVistaPrevia(it));

  const subir = (archivos: FileList | File[]) => {
    const destino = buscando ? raiz : carpeta;
    for (const f of Array.from(archivos)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setSubidas((s) => [...s, { id, nombre: f.name, tamano: f.size, avance: 0, estado: 'subiendo' }]);
      const act = (p: Partial<Subida>) => setSubidas((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));
      subirArchivo(f, destino, (p) => act({ avance: p }))
        .then(() => { act({ estado: 'listo', avance: 1 }); void cargar(); recargarEstado(); })
        .catch((e) => act({ estado: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setArrastrando(false); if (e.dataTransfer.files.length) subir(e.dataTransfer.files); };
  const pct = estado.uso && estado.uso.limite ? Math.min(100, (estado.uso.usado / estado.uso.limite) * 100) : 0;
  const ordenados = useMemo(() => items || [], [items]);
  const enCurso = subidas.filter((s) => s.estado === 'subiendo').length;

  return (
    <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastrando(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastrando(false); }} onDrop={onDrop}
      onClick={() => setMenu(null)}
      style={{ minHeight: '100vh', background: 'var(--df-bg)', color: 'var(--df-text)', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--df-surface)', borderBottom: '1px solid var(--df-border)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))' }}>
          <a href="/" onClick={(e) => { e.preventDefault(); abrirCarpeta(raiz); }} style={{ textDecoration: 'none', color: 'inherit' }}><Marca /></a>
          <form onSubmit={(e) => { e.preventDefault(); setBuscando(busqueda.trim()); }} style={{ flex: '1 1 260px', minWidth: 0, display: 'flex' }}>
            <input id="drive-buscar" type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); if (!e.target.value) setBuscando(''); }} placeholder="Buscar en el Drive…" aria-label="Buscar archivos" style={{ ...inp, padding: '9px 14px', borderRadius: 999 }} />
          </form>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--df-text-muted)' }}>
            <span title={estado.usuario.email}><b style={{ color: 'var(--df-text-strong)' }}>{estado.usuario.nombre || estado.usuario.email}</b></span>
            <button type="button" onClick={() => void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(() => location.reload())} style={{ ...btnS, padding: '6px 10px', fontSize: 12 }}>Salir</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))', gap: 18, padding: '18px max(16px, env(safe-area-inset-right)) 120px max(16px, env(safe-area-inset-left))' }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Lateral */}
          <aside style={{ flex: '0 0 230px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" onClick={() => entrada.current?.click()} style={{ ...btnP, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 12px 26px -14px rgba(4,120,87,.7)' }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>⬆</span> Subir archivos
            </button>
            <button type="button" onClick={() => setDialogo({ tipo: 'carpeta' })} style={{ ...btnS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IconoCarpeta size={18} /> Nueva carpeta</button>
            <input ref={entrada} id="drive-archivos" type="file" multiple hidden onChange={(e) => { if (e.target.files) subir(e.target.files); e.target.value = ''; }} />
            <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 12, fontSize: 12.5 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Espacio en Google Drive</div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--df-border)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? '#DC2626' : pct > 75 ? '#F59E0B' : '#10B981' }} /></div>
              <div style={{ color: 'var(--df-text-muted)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{estado.uso ? `${fmtTam(estado.uso.usado)} de ${estado.uso.limite ? fmtTam(estado.uso.limite) : 'ilimitado'}` : '—'}</div>
              <div style={{ color: 'var(--df-text-faint, var(--df-text-muted))', marginTop: 4, overflowWrap: 'anywhere' }}>{estado.email}</div>
            </div>
          </aside>

          {/* Contenido */}
          <main style={{ flex: '1 1 480px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <nav aria-label="Ruta" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 15, fontWeight: 800, flex: 1, minWidth: 0 }}>
                {buscando ? <span>Resultados para «{buscando}»</span> : (
                  <>
                    <button type="button" onClick={() => abrirCarpeta(raiz)} style={{ ...migas, color: rutaN.length ? 'var(--df-text-muted)' : 'var(--df-text-strong)' }}>DealFlow Drive</button>
                    {rutaN.map((r, i) => (
                      <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--df-text-faint, var(--df-text-muted))' }}>›</span>
                        <button type="button" onClick={() => abrirCarpeta(r.id)} style={{ ...migas, color: i === rutaN.length - 1 ? 'var(--df-text-strong)' : 'var(--df-text-muted)' }}>{r.nombre}</button>
                      </span>
                    ))}
                  </>
                )}
              </nav>
              <div role="group" aria-label="Vista" style={{ display: 'flex', border: '1px solid var(--df-border)', borderRadius: 9, overflow: 'hidden' }}>
                {[false, true].map((l) => (
                  <button key={String(l)} type="button" onClick={() => setVistaLista(l)} aria-pressed={vistaLista === l} style={{ border: 0, padding: '6px 11px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: vistaLista === l ? 'var(--df-text-strong)' : 'var(--df-surface)', color: vistaLista === l ? 'var(--df-surface)' : 'var(--df-text-body)' }}>{l ? 'Lista' : 'Cuadros'}</button>
                ))}
              </div>
            </div>

            {error && <div style={{ background: 'var(--df-danger-subtle, #FEF2F2)', color: 'var(--df-danger-dark, #B91C1C)', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            {items === null ? <div style={{ color: 'var(--df-text-muted)', fontSize: 14, padding: 20 }}>Cargando…</div>
              : !ordenados.length ? (
                <div style={{ border: '2px dashed var(--df-border)', borderRadius: 16, padding: '48px 20px', textAlign: 'center', color: 'var(--df-text-muted)' }}>
                  <IconoCarpeta size={56} />
                  <div style={{ fontWeight: 800, color: 'var(--df-text-strong)', margin: '10px 0 4px' }}>{buscando ? 'No encontramos nada con ese nombre' : 'Esta carpeta está vacía'}</div>
                  {!buscando && <div style={{ fontSize: 13.5 }}>Arrastra archivos aquí o usa «Subir archivos».</div>}
                </div>
              ) : vistaLista ? (
                <div style={{ background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden' }}>
                  {ordenados.map((it) => (
                    <div key={it.id} onDoubleClick={() => abrir(it)} onClick={() => abrir(it)} onContextMenu={(e) => { e.preventDefault(); setMenu({ it, x: e.clientX, y: e.clientY }); }}
                      style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '9px 12px', borderTop: '1px solid var(--df-border)', cursor: 'pointer', fontSize: 13.5 }}>
                      <IconoArchivo it={it} size={26} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre}</div>
                        <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>{it.carpeta ? 'Carpeta' : fmtTam(it.tamano)} · {fmtFecha(it.modificado)}{it.por ? ` · ${it.por}` : ''}</div>
                      </div>
                      <BotonMenu alAbrir={(x, y) => setMenu({ it, x, y })} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(170px, 100%), 1fr))', gap: 12 }}>
                  {ordenados.map((it) => (
                    <div key={it.id} onClick={() => abrir(it)} onContextMenu={(e) => { e.preventDefault(); setMenu({ it, x: e.clientX, y: e.clientY }); }} className="df-drive-tarjeta"
                      style={{ position: 'relative', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ aspectRatio: it.carpeta ? '3 / 1.4' : '4 / 3', display: 'grid', placeItems: 'center', background: it.carpeta ? 'transparent' : 'var(--df-bg)', overflow: 'hidden' }}>
                        {it.miniatura && !it.carpeta ? <img src={`/api/drive/miniatura/${encodeURIComponent(it.id)}`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <IconoArchivo it={it} size={it.carpeta ? 44 : 52} />}
                      </div>
                      <div style={{ padding: '8px 10px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.nombre}>{it.nombre}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.carpeta ? fmtFecha(it.modificado) : `${fmtTam(it.tamano)} · ${fmtFecha(it.modificado)}`}</div>
                        </div>
                        <BotonMenu alAbrir={(x, y) => setMenu({ it, x, y })} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </main>
        </div>
      </div>

      {arrastrando && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(4,120,87,.12)', border: '3px dashed #047857', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#047857', color: '#fff', borderRadius: 14, padding: '14px 22px', fontWeight: 800 }}>Suelta para subir aquí</div>
        </div>
      )}

      {menu && <MenuItem pos={menu} alCerrar={() => setMenu(null)} acciones={{
        abrir: () => abrir(menu.it),
        descargar: menu.it.carpeta ? undefined : () => { location.href = urlArchivo(menu.it.id, true); },
        compartir: menu.it.carpeta ? undefined : () => setDialogo({ tipo: 'compartir', it: menu.it }),
        renombrar: () => setDialogo({ tipo: 'renombrar', it: menu.it }),
        mover: () => setDialogo({ tipo: 'mover', it: menu.it }),
        eliminar: () => setDialogo({ tipo: 'eliminar', it: menu.it }),
      }} />}

      {vistaPrevia && <VistaPrevia it={vistaPrevia} alCerrar={() => setVistaPrevia(null)} alCompartir={() => setDialogo({ tipo: 'compartir', it: vistaPrevia })} />}
      {dialogo && <Dialogos d={dialogo} raiz={raiz} carpeta={buscando ? raiz : carpeta} alCerrar={() => setDialogo(null)} alListo={(m) => { setDialogo(null); if (m) setAviso(m); void cargar(); }} />}

      {subidas.length > 0 && (
        <div style={{ position: 'fixed', right: 'max(16px, env(safe-area-inset-right))', bottom: 'max(16px, env(safe-area-inset-bottom))', zIndex: 30, width: 'min(340px, calc(100vw - 32px))', background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 14, boxShadow: '0 24px 50px -20px rgba(2,6,23,.45)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', background: 'var(--df-bg)', fontWeight: 800, fontSize: 13 }}>
            <span style={{ flex: 1 }}>{enCurso ? `Subiendo ${enCurso} archivo${enCurso === 1 ? '' : 's'}…` : 'Subidas listas'}</span>
            {!enCurso && <button type="button" onClick={() => setSubidas([])} aria-label="Cerrar" style={{ ...btnS, padding: '3px 8px', fontSize: 12 }}>✕</button>}
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {subidas.map((s) => (
              <div key={s.id} style={{ padding: '8px 12px', borderTop: '1px solid var(--df-border)', fontSize: 12.5 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{s.nombre}</span>
                  <span style={{ color: s.estado === 'error' ? 'var(--df-danger-dark, #B91C1C)' : s.estado === 'listo' ? '#047857' : 'var(--df-text-muted)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.estado === 'listo' ? '✓' : s.estado === 'error' ? 'Error' : `${Math.round(s.avance * 100)}%`}</span>
                </div>
                {s.estado === 'subiendo' && <div style={{ height: 4, borderRadius: 99, background: 'var(--df-border)', marginTop: 5, overflow: 'hidden' }}><div style={{ width: `${s.avance * 100}%`, height: '100%', background: '#10B981', transition: 'width .2s' }} /></div>}
                {s.error && <div style={{ color: 'var(--df-danger-dark, #B91C1C)', marginTop: 3 }}>{s.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {aviso && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 50, background: 'var(--df-text-strong)', color: 'var(--df-surface)', borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, maxWidth: 'calc(100vw - 32px)' }}>{aviso}</div>}
      <style>{'.df-drive-tarjeta{transition:box-shadow .15s,transform .15s}.df-drive-tarjeta:hover{box-shadow:0 14px 30px -18px rgba(2,6,23,.45);transform:translateY(-1px)}@media (prefers-reduced-motion: reduce){.df-drive-tarjeta{transition:none}.df-drive-tarjeta:hover{transform:none}}'}</style>
    </div>
  );
}
const migas: React.CSSProperties = { background: 'none', border: 0, padding: '2px 4px', borderRadius: 6, fontFamily: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer' };

function BotonMenu({ alAbrir }: { alAbrir: (x: number, y: number) => void }) {
  return (
    <button type="button" aria-label="Más opciones" onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); alAbrir(r.right, r.bottom); }}
      style={{ border: 0, background: 'transparent', color: 'var(--df-text-muted)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 18, lineHeight: 1, flex: '0 0 auto' }}>⋮</button>
  );
}

function MenuItem({ pos, alCerrar, acciones }: { pos: { x: number; y: number }; alCerrar: () => void; acciones: Record<string, (() => void) | undefined> }) {
  const etiquetas: [string, string][] = [['abrir', 'Abrir'], ['descargar', 'Descargar'], ['compartir', 'Copiar enlace para compartir'], ['renombrar', 'Cambiar nombre'], ['mover', 'Mover a…'], ['eliminar', 'Eliminar']];
  const w = 230;
  const left = Math.min(pos.x - w, window.innerWidth - w - 12);
  return (
    <div role="menu" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', zIndex: 45, left: Math.max(12, left), top: Math.min(pos.y + 4, window.innerHeight - 250), width: w, background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, boxShadow: '0 20px 44px -18px rgba(2,6,23,.5)', padding: 5 }}>
      {etiquetas.filter(([k]) => acciones[k]).map(([k, t]) => (
        <button key={k} type="button" role="menuitem" onClick={() => { alCerrar(); acciones[k]!(); }}
          style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '9px 11px', borderRadius: 8, fontFamily: 'inherit', fontSize: 13.5, cursor: 'pointer', color: k === 'eliminar' ? 'var(--df-danger-dark, #B91C1C)' : 'var(--df-text-body)', fontWeight: 600 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--df-bg)'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>{t}</button>
      ))}
    </div>
  );
}

function VistaPrevia({ it, alCerrar, alCompartir }: { it: Item; alCerrar: () => void; alCompartir: () => void }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [alCerrar]);
  const t = tipo(it);
  const url = urlArchivo(it.id);
  return (
    <div onClick={alCerrar} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(2,6,23,.86)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))', color: '#fff' }}>
        <IconoArchivo it={it} size={26} />
        <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre}</b>
        <button type="button" onClick={alCompartir} style={{ ...btnS, background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'transparent' }}>Compartir</button>
        <a href={urlArchivo(it.id, true)} style={{ ...btnS, background: '#047857', color: '#fff', borderColor: '#047857', textDecoration: 'none' }}>Descargar</a>
        <button type="button" onClick={alCerrar} aria-label="Cerrar" style={{ ...btnS, background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'transparent' }}>✕</button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: '0 16px 16px' }}>
        {t === 'imagen' ? <img src={url} alt={it.nombre} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          : t === 'video' ? <video src={url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, background: '#000' }} />
          : t === 'audio' ? <audio src={url} controls autoPlay />
          : t === 'pdf' ? <iframe src={url} title={it.nombre} style={{ width: 'min(960px, 100%)', height: '100%', border: 0, borderRadius: 8, background: '#fff' }} />
          : (
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <IconoArchivo it={it} size={80} />
              <p style={{ opacity: 0.8 }}>{fmtTam(it.tamano)} · Este tipo de archivo se abre descargándolo.</p>
              <a href={urlArchivo(it.id, true)} style={{ ...btnP, textDecoration: 'none', display: 'inline-block' }}>Descargar</a>
            </div>
          )}
      </div>
    </div>
  );
}

function Modal({ titulo, children, alCerrar }: { titulo: string; children: React.ReactNode; alCerrar: () => void }) {
  return (
    <div onClick={alCerrar} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(2,6,23,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', background: 'var(--df-surface)', borderRadius: 16, padding: 20, boxShadow: '0 30px 70px -20px rgba(2,6,23,.5)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <b style={{ fontSize: 16 }}>{titulo}</b>
        {children}
      </div>
    </div>
  );
}

function Dialogos({ d, raiz, carpeta, alCerrar, alListo }: { d: NonNullable<Dialogo>; raiz: string; carpeta: string; alCerrar: () => void; alListo: (m?: string) => void }) {
  const [texto, setTexto] = useState(d.tipo === 'renombrar' ? d.it.nombre : '');
  const [msg, setMsg] = useState(''); const [ocupado, setOcupado] = useState(false);
  const [dias, setDias] = useState(0); const [enlace, setEnlace] = useState('');
  const correr = async (p: Promise<{ error?: string }>, ok?: string) => { setOcupado(true); setMsg(''); const r = await p; setOcupado(false); if (r.error) setMsg(r.error); else alListo(ok); };
  const pie = (accion: string, alHacer: () => void, peligro = false) => (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button type="button" onClick={alCerrar} style={btnS}>Cancelar</button>
      <button type="button" onClick={alHacer} disabled={ocupado} style={{ ...btnP, background: peligro ? '#DC2626' : '#047857', opacity: ocupado ? 0.6 : 1 }}>{ocupado ? 'Un momento…' : accion}</button>
    </div>
  );
  const error = msg && <div style={{ color: 'var(--df-danger-dark, #B91C1C)', fontSize: 13 }}>{msg}</div>;
  if (d.tipo === 'carpeta') return (
    <Modal titulo="Nueva carpeta" alCerrar={alCerrar}>
      <input id="drive-nueva-carpeta" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) void correr(api('/carpeta', { method: 'POST', body: JSON.stringify({ padre: carpeta, nombre: texto }) }), 'Carpeta creada.'); }} placeholder="Nombre de la carpeta" style={inp} />
      {error}{pie('Crear', () => void correr(api('/carpeta', { method: 'POST', body: JSON.stringify({ padre: carpeta, nombre: texto }) }), 'Carpeta creada.'))}
    </Modal>
  );
  if (d.tipo === 'renombrar') return (
    <Modal titulo="Cambiar nombre" alCerrar={alCerrar}>
      <input id="drive-renombrar" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onFocus={(e) => { const i = e.target.value.lastIndexOf('.'); e.target.setSelectionRange(0, i > 0 && !d.it.carpeta ? i : e.target.value.length); }} style={inp} />
      {error}{pie('Guardar', () => void correr(api(`/item/${encodeURIComponent(d.it.id)}`, { method: 'PATCH', body: JSON.stringify({ nombre: texto }) }), 'Nombre cambiado.'))}
    </Modal>
  );
  if (d.tipo === 'eliminar') return (
    <Modal titulo={`¿Eliminar ${d.it.carpeta ? 'la carpeta' : 'el archivo'}?`} alCerrar={alCerrar}>
      <div style={{ fontSize: 14, color: 'var(--df-text-body)', lineHeight: 1.5 }}><b>{d.it.nombre}</b> va a la papelera del Google Drive de DealFlow{d.it.carpeta ? ' con todo lo que tiene adentro' : ''}. Se puede recuperar desde Google Drive durante 30 días. Sus enlaces compartidos dejan de funcionar.</div>
      {error}{pie('Eliminar', () => void correr(api(`/item/${encodeURIComponent(d.it.id)}`, { method: 'DELETE' }), 'Enviado a la papelera.'), true)}
    </Modal>
  );
  if (d.tipo === 'compartir') return (
    <Modal titulo="Enlace para compartir" alCerrar={alCerrar}>
      <div style={{ fontSize: 13.5, color: 'var(--df-text-muted)', lineHeight: 1.5 }}>Cualquiera con el enlace puede ver y descargar <b style={{ color: 'var(--df-text-body)' }}>{d.it.nombre}</b>, sin cuenta.</div>
      {!enlace ? (
        <>
          <label htmlFor="drive-dias" style={{ fontSize: 13, fontWeight: 700 }}>Vence</label>
          <select id="drive-dias" value={dias} onChange={(e) => setDias(Number(e.target.value))} style={inp}>
            <option value={0}>Nunca</option><option value={1}>En 1 día</option><option value={7}>En 7 días</option><option value={30}>En 30 días</option>
          </select>
          {error}{pie('Crear enlace', async () => { setOcupado(true); const r = await api<{ url: string }>(`/compartir/${encodeURIComponent(d.it.id)}`, { method: 'POST', body: JSON.stringify({ dias }) }); setOcupado(false); if (r.data) { setEnlace(r.data.url); try { await navigator.clipboard.writeText(r.data.url); setMsg('✓ Copiado al portapapeles.'); } catch { setMsg(''); } } else setMsg(r.error || 'No se pudo.'); })}
        </>
      ) : (
        <>
          <input id="drive-enlace" readOnly value={enlace} onFocus={(e) => e.target.select()} style={inp} />
          {msg && <div style={{ color: '#047857', fontSize: 13, fontWeight: 700 }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(enlace).then(() => setMsg('✓ Copiado al portapapeles.')).catch(() => setMsg('Selecciona el enlace y cópialo.')); }} style={btnS}>Copiar</button>
            <button type="button" onClick={() => alListo()} style={btnP}>Listo</button>
          </div>
        </>
      )}
    </Modal>
  );
  return <Mover it={d.it} raiz={raiz} alCerrar={alCerrar} alListo={alListo} />;
}

/** Elegir la carpeta destino (navegando por las carpetas). */
function Mover({ it, raiz, alCerrar, alListo }: { it: Item; raiz: string; alCerrar: () => void; alListo: (m?: string) => void }) {
  const [en, setEn] = useState(raiz);
  const [ruta, setRuta] = useState<{ id: string; nombre: string }[]>([]);
  const [carpetas, setCarpetas] = useState<Item[] | null>(null);
  const [msg, setMsg] = useState(''); const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setCarpetas(null); void api<{ items: Item[]; ruta: { id: string; nombre: string }[] }>(`/lista?carpeta=${encodeURIComponent(en)}`).then((r) => { setCarpetas((r.data?.items || []).filter((x) => x.carpeta && x.id !== it.id)); setRuta(r.data?.ruta || []); }); }, [en, it.id]);
  const mover = async () => { setOcupado(true); const r = await api(`/item/${encodeURIComponent(it.id)}`, { method: 'PATCH', body: JSON.stringify({ mover: en }) }); setOcupado(false); if (r.error) setMsg(r.error); else alListo('Movido.'); };
  return (
    <Modal titulo={`Mover «${it.nombre}»`} alCerrar={alCerrar}>
      <div style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <button type="button" onClick={() => setEn(raiz)} style={{ ...migas, fontSize: 13 }}>DealFlow Drive</button>
        {ruta.map((r) => <span key={r.id}>› <button type="button" onClick={() => setEn(r.id)} style={{ ...migas, fontSize: 13 }}>{r.nombre}</button></span>)}
      </div>
      <div style={{ border: '1px solid var(--df-border)', borderRadius: 10, maxHeight: 260, overflowY: 'auto' }}>
        {carpetas === null ? <div style={{ padding: 12, fontSize: 13, color: 'var(--df-text-muted)' }}>Cargando…</div>
          : !carpetas.length ? <div style={{ padding: 12, fontSize: 13, color: 'var(--df-text-muted)' }}>No hay subcarpetas aquí.</div>
          : carpetas.map((c) => (
            <button key={c.id} type="button" onClick={() => setEn(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 0, borderTop: '1px solid var(--df-border)', background: 'transparent', padding: '8px 10px', fontFamily: 'inherit', fontSize: 13.5, cursor: 'pointer', color: 'var(--df-text-body)', textAlign: 'left' }}><IconoCarpeta size={20} /> {c.nombre}</button>
          ))}
      </div>
      {msg && <div style={{ color: 'var(--df-danger-dark, #B91C1C)', fontSize: 13 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={alCerrar} style={btnS}>Cancelar</button>
        <button type="button" onClick={() => void mover()} disabled={ocupado} style={{ ...btnP, opacity: ocupado ? 0.6 : 1 }}>{ocupado ? 'Moviendo…' : 'Mover aquí'}</button>
      </div>
    </Modal>
  );
}
