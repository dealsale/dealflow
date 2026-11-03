import { useEffect, useRef, useState } from 'react';
import { puente, type AccionEntrada } from './puente';
import { SesionComputador, type EstadoConexion } from './conexion';

/**
 * /escritorio — lo que se ve DENTRO de la app «DealFlow Soporte» (Windows).
 * Entrar con la cuenta de la tienda → el computador queda «en línea» para el equipo de DealFlow
 * → cuando alguien pide conectarse, aparece el permiso → con «Permitir», se comparte la pantalla
 * y el equipo maneja el ratón y el teclado hasta que la tienda toque «Detener».
 */
const CLAVE_EQUIPO = 'df-escritorio-equipo';
const fondo: React.CSSProperties = { minHeight: '100vh', background: '#0B1220', color: '#fff', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", display: 'grid', placeItems: 'center', padding: 20, boxSizing: 'border-box' };
const tarjeta: React.CSSProperties = { width: '100%', maxWidth: 380, display: 'grid', gap: 14, textAlign: 'center' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 10, padding: '11px 12px', fontFamily: 'inherit', fontSize: 14 };
const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({ border: 0, borderRadius: 12, padding: '12px 16px', background: bg, color: fg, fontFamily: 'inherit', fontWeight: 800, fontSize: 15, cursor: 'pointer' });

type Fase = 'cargando' | 'login' | 'listo' | 'pedido' | 'sesion';

export function PaginaEscritorio() {
  const p = puente();
  const [fase, setFase] = useState<Fase>('cargando');
  const [usuario, setUsuario] = useState({ tienda: '', nombre: '' });
  const [pedido, setPedido] = useState<{ sesionId: string; quien: string } | null>(null);
  const [estado, setEstado] = useState<EstadoConexion | ''>('');
  const [aviso, setAviso] = useState('');
  const [enLinea, setEnLinea] = useState(false);
  const sesion = useRef<SesionComputador | null>(null);
  const quienRef = useRef('');
  const rechazados = useRef(new Set<string>());
  const equipoId = useRef<string>((() => { try { return localStorage.getItem(CLAVE_EQUIPO) || ''; } catch { return ''; } })());

  useEffect(() => { document.title = 'DealFlow Soporte'; document.body.style.background = '#0B1220'; }, []);

  // ¿Ya entró? Si sí, se registra el computador.
  const comprobar = async () => {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' }).catch(() => null);
    if (!r?.ok) { setFase('login'); return; }
    const u = (await r.json()).user as { storeId?: string; role?: string; nombre?: string };
    if (!u?.storeId || ['ADMIN', 'SUPERADMIN', 'SOPORTE', 'MARKETING'].includes(u.role || '')) { setAviso('Entra con la cuenta de tu TIENDA (no con una cuenta del equipo de DealFlow).'); setFase('login'); return; }
    const pant = await p?.pantalla().catch(() => null);
    const reg = await fetch('/api/escritorio/registrar', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipoId: equipoId.current, nombre: p?.equipo || 'Computador', so: p?.so || navigator.platform, version: p?.version || '', pantalla: pant ? `${pant.w}×${pant.h}` : '' }) }).then((x) => x.json()).catch(() => null) as { equipoId?: string } | null;
    if (reg?.equipoId) { equipoId.current = reg.equipoId; try { localStorage.setItem(CLAVE_EQUIPO, reg.equipoId); } catch { /* nada */ } }
    setUsuario((x) => ({ ...x, nombre: u.nombre || '' }));
    setFase((f) => (f === 'sesion' || f === 'pedido' ? f : 'listo'));
  };
  useEffect(() => { void comprobar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Latido: «en línea» para el equipo, y aquí llega el pedido de conexión.
  useEffect(() => {
    if (fase === 'login' || fase === 'cargando') return;
    let vivo = true;
    const latir = async () => {
      const r = await fetch('/api/escritorio/latido', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipoId: equipoId.current }) }).catch(() => null);
      if (!vivo) return;
      if (!r) { setEnLinea(false); return; }
      if (r.status === 401) { setFase('login'); return; }
      if (r.status === 404) { void comprobar(); return; }
      const d = await r.json() as { pedido: { sesionId: string; quien: string } | null; tienda: string; usuario: string };
      setEnLinea(true);
      setUsuario({ tienda: d.tienda, nombre: d.usuario });
      if (d.pedido && !rechazados.current.has(d.pedido.sesionId) && !sesion.current) {
        setPedido((x) => { if (!x || x.sesionId !== d.pedido!.sesionId) { p?.mostrar(); p?.avisar('DealFlow Soporte', `${d.pedido!.quien} quiere conectarse a tu computador.`); } return d.pedido; });
        setFase((f) => (f === 'sesion' ? f : 'pedido'));
      } else if (!d.pedido) { setPedido(null); setFase((f) => (f === 'pedido' ? 'listo' : f)); }
    };
    void latir();
    const t = setInterval(latir, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [fase === 'login' || fase === 'cargando']); // eslint-disable-line react-hooks/exhaustive-deps

  const responder = async (acepta: boolean) => {
    if (!pedido) return;
    const id = pedido.sesionId; const quien = pedido.quien;
    const r = await fetch(`/api/escritorio/sesion/${id}/responder`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acepta }) }).catch(() => null);
    setPedido(null);
    if (!acepta || !r?.ok) { rechazados.current.add(id); setFase('listo'); if (acepta) setAviso('Ese pedido ya no estaba vigente.'); return; }
    quienRef.current = quien;
    setFase('sesion'); setAviso('');
    p?.modoSesion(true, quien);
    const s = new SesionComputador(id, (e, det) => {
      setEstado(e);
      if (e === 'terminada') { sesion.current = null; p?.modoSesion(false); setFase('listo'); setAviso(det || 'La sesión terminó.'); }
    }, (a: AccionEntrada) => p?.entrada(a));
    sesion.current = s;
    try { await s.iniciar(); } catch (e) {
      // Que el equipo de DealFlow sepa por qué (si no, se queda «Esperando…»).
      const motivo = `En el computador no se pudo compartir la pantalla (${e instanceof Error ? e.message : String(e)}).`;
      await fetch(`/api/escritorio/sesion/${id}/terminar`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) }).catch(() => null);
      s.terminar('No se pudo compartir la pantalla. Cierra la app desde el ícono junto al reloj, ábrela de nuevo e inténtalo otra vez.');
    }
  };
  const detener = async () => {
    const s = sesion.current;
    if (!s) return;
    await fetch(`/api/escritorio/sesion/${s.id}/terminar`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    s.terminar('Detuviste la sesión.');
  };

  if (!p) return (
    <div style={fondo}>
      <div style={tarjeta}>
        <img src="/logo.png" alt="" style={{ width: 56, height: 56, justifySelf: 'center' }} />
        <div style={{ fontWeight: 800, fontSize: 18 }}>DealFlow Soporte</div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Esta página es para la app de escritorio. Descárgala, instálala y entra con tu cuenta: así el equipo de DealFlow te puede ayudar en todo tu computador (siempre con tu permiso).</div>
        <a href="/api/escritorio/descargar" style={{ ...btn('#10B981', '#052e1f'), textDecoration: 'none' }}>⬇ Descargar para Windows</a>
      </div>
    </div>
  );

  if (fase === 'cargando') return <div style={fondo}><div style={{ opacity: 0.7 }}>Cargando…</div></div>;
  if (fase === 'login') return <Login aviso={aviso} onListo={() => { setAviso(''); void comprobar(); }} />;

  if (fase === 'sesion') return (
    <div style={{ ...fondo, placeItems: 'stretch', padding: 12 }}>
      <div style={{ display: 'grid', gap: 10, alignContent: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>🖱 {quienRef.current || 'Soporte DealFlow'} {estado === 'conectada' ? 'está controlando tu computador' : estado === 'reconectando' ? '· reconectando…' : '· conectando…'}</div>
        <button onClick={() => void detener()} style={btn('#DC2626')}>⏹ Detener</button>
      </div>
    </div>
  );

  return (
    <div style={fondo}>
      <div style={tarjeta}>
        <img src="/logo.png" alt="" style={{ width: 56, height: 56, justifySelf: 'center' }} />
        <div style={{ fontWeight: 800, fontSize: 18 }}>DealFlow Soporte</div>
        <div style={{ fontSize: 13.5, opacity: 0.85 }}>{usuario.tienda ? <>Conectado como <b>{usuario.tienda}</b></> : 'Conectado'}</div>
        <div style={{ display: 'inline-flex', justifySelf: 'center', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 999, background: enLinea ? 'rgba(16,185,129,.18)' : 'rgba(255,255,255,.08)', color: enLinea ? '#6EE7B7' : 'rgba(255,255,255,.7)' }}>
          {enLinea ? '● Listo: el equipo de DealFlow puede pedirte conexión' : '○ Sin conexión con DealFlow…'}
        </div>
        {aviso && <div role="status" style={{ fontSize: 13, color: '#FDE68A' }}>{aviso}</div>}
        <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>Nadie puede ver ni manejar tu computador sin que tú lo permitas cada vez. Puedes cerrar esta ventana: la app sigue en la bandeja (junto al reloj).</div>
        <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null); setFase('login'); }} style={{ ...btn('transparent', 'rgba(255,255,255,.7)'), fontSize: 12.5, textDecoration: 'underline', padding: 4 }}>Cerrar sesión</button>
      </div>

      {fase === 'pedido' && pedido && (
        <div role="alertdialog" aria-label="Permiso de conexión" style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,.85)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ ...tarjeta, background: '#111A2E', borderRadius: 18, padding: 22, boxShadow: '0 30px 70px -20px rgba(0,0,0,.8)' }}>
            <div style={{ fontSize: 40 }}>💻</div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{pedido.quien} quiere conectarse a tu computador</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, opacity: 0.88 }}>Podrá <b>ver tu pantalla</b> y <b>manejar el ratón y el teclado</b> para ayudarte. Lo detienes cuando quieras con «Detener».</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => void responder(false)} style={{ ...btn('rgba(255,255,255,.12)'), flex: 1 }}>No</button>
              <button onClick={() => void responder(true)} style={{ ...btn('#10B981', '#052e1f'), flex: 1.4 }} autoFocus>Permitir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Login({ aviso, onListo }: { aviso: string; onListo: () => void }) {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true); setError('');
    const r = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: clave }) }).catch(() => null);
    setOcupado(false);
    if (!r?.ok) { const d = await r?.json().catch(() => null) as { error?: string } | null; setError(d?.error || 'No pudimos entrar. Revisa tu conexión.'); return; }
    onListo();
  };
  return (
    <div style={fondo}>
      <form onSubmit={(e) => void entrar(e)} style={tarjeta}>
        <img src="/logo.png" alt="" style={{ width: 56, height: 56, justifySelf: 'center' }} />
        <div style={{ fontWeight: 800, fontSize: 18 }}>DealFlow Soporte</div>
        <div style={{ fontSize: 13.5, opacity: 0.8 }}>Entra con la cuenta de tu tienda en DealFlow.</div>
        <input type="email" autoComplete="username" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} required />
        <input type="password" autoComplete="current-password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} style={inp} required />
        {(error || aviso) && <div role="alert" style={{ fontSize: 13, color: '#FCA5A5' }}>{error || aviso}</div>}
        <button type="submit" disabled={ocupado} style={btn('#10B981', '#052e1f')}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
