import { useEffect, useState } from 'react';
import { cambiarIdiomaUI, idiomaUI } from '../i18n/traductor';
import type { DealFlowState } from '../hooks/useDealFlowState';
import { apiOlvide, apiRestablecer, apiValidarRestablecer } from '../lib/api';
import iconoApp from '../assets/icono-app.png';

/*
 * Pantalla de acceso del rediseño (artifact "Acceso a DealFlow"): a la izquierda la
 * marca con el mensaje de la landing; a la derecha el formulario para entrar o crear
 * la tienda, y la recuperación de contraseña.
 */
function Recuperar({ modo, token, correoInicial, onListo }: { modo: 'pedir' | 'nueva'; token: string; correoInicial: string; onListo: (aviso: string) => void }) {
  const [correo, setCorreo] = useState(correoInicial);
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [cuenta, setCuenta] = useState('');
  useEffect(() => {
    if (modo === 'nueva') void apiValidarRestablecer(token).then((r) => { if (r.error) setError(r.error); else setCuenta(r.data?.correo || ''); });
  }, [modo, token]);
  const enviar = async () => {
    if (enviando) return;
    setError('');
    if (modo === 'nueva' && clave !== clave2) { setError('Las dos contraseñas no coinciden.'); return; }
    setEnviando(true);
    const r = modo === 'pedir' ? await apiOlvide(correo.trim()) : await apiRestablecer(token, clave);
    setEnviando(false);
    if (r.error) { setError(r.error); return; }
    if (modo === 'pedir') setListo(true);
    else onListo('✓ Contraseña cambiada. Ya puedes entrar con la nueva.');
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ fontSize: 26 }}>{modo === 'pedir' ? 'Recupera tu cuenta' : 'Contraseña nueva'}</h2>
        <p className="suave-t">{modo === 'pedir' ? 'Escribe el correo de tu cuenta y te enviamos un enlace para cambiar la contraseña.' : cuenta ? <>Para la cuenta <b>{cuenta}</b>.</> : 'Revisando el enlace…'}</p>
      </div>
      {listo ? (
        <div className="aviso-caja ok">📬 Si <b>{correo}</b> tiene una cuenta, te llegará un correo en unos minutos. Revisa también spam. El enlace vence en 1 hora.</div>
      ) : modo === 'pedir' ? (
        <div className="campo"><label htmlFor="rec-correo">Correo</label><input id="rec-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@tienda.co" autoComplete="username" /></div>
      ) : (
        <>
          <div className="campo"><label htmlFor="rec-c1">Contraseña nueva</label><input id="rec-c1" type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" /></div>
          <div className="campo"><label htmlFor="rec-c2">Repítela</label><input id="rec-c2" type="password" value={clave2} onChange={(e) => setClave2(e.target.value)} autoComplete="new-password" /></div>
        </>
      )}
      {error && <div className="aviso-caja mal">⚠️ {error}</div>}
      {!listo && <button type="submit" className="btn btn-pri" disabled={enviando || (modo === 'nueva' && !cuenta)} style={{ width: '100%' }}>{enviando ? (modo === 'pedir' ? 'Enviando…' : 'Guardando…') : modo === 'pedir' ? 'Enviarme el enlace →' : 'Guardar contraseña →'}</button>}
      <button type="button" className="btn btn-fant" onClick={() => onListo('')}>← Volver a iniciar sesión</button>
    </form>
  );
}

export function Login({ df }: { df: DealFlowState }) {
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [nombre, setNombre] = useState('');
  const [negocio, setNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Recuperar contraseña: "pedir" el enlace, o "nueva" si se abrió el enlace del correo.
  const [token, setToken] = useState(() => new URLSearchParams(location.search).get('restablecer') || '');
  const [recuperar, setRecuperar] = useState<null | 'pedir' | 'nueva'>(() => (new URLSearchParams(location.search).get('restablecer') ? 'nueva' : null));
  const [aviso, setAviso] = useState('');

  const esRegistro = modo === 'registro';
  const entrar = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      await (esRegistro ? df.registrar(nombre, negocio, email, password) : df.login(email, password));
    } finally {
      window.setTimeout(() => setEnviando(false), 400);
    }
  };
  const cambiarModo = (m: 'login' | 'registro') => { if (m !== modo) { setModo(m); df.clearLoginError(); } };
  const limpiar = () => df.clearLoginError();

  return (
    <div className="acceso">
      <section className="acceso-marca">
        <div className="fila" style={{ justifyContent: 'space-between' }}>
          <a className="marca" href="/inicio" title="Ir a la página de inicio de DealFlow" style={{ padding: 0, fontSize: 22 }}>
            <img src={iconoApp} alt="" style={{ width: 40, height: 40, borderRadius: 11 }} />
            <span>DealFlow<small>Vende por WhatsApp con IA</small></span>
          </a>
          <div translate="no" style={{ display: 'inline-flex', border: '1px solid var(--linea2)', borderRadius: 999, overflow: 'hidden' }}>
            {(['es', 'en'] as const).map((l) => (
              <button key={l} type="button" onClick={() => cambiarIdiomaUI(l)} aria-label={l === 'es' ? 'Español' : 'English'}
                style={{ border: 'none', padding: '5px 11px', fontFamily: 'inherit', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', background: idiomaUI() === l ? 'var(--tinta)' : 'transparent', color: idiomaUI() === l ? 'var(--noche)' : 'var(--niebla)' }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>
          <span className="eti">Panel de ventas</span>
          <h1 style={{ fontSize: 54, lineHeight: 1.02, letterSpacing: '-.045em', textWrap: 'balance' }}>Tu tienda atiende, <span className="grad-txt">cierra y despacha</span> mientras tú descansas.</h1>
          <p className="sub" style={{ fontSize: 16 }}>Un asistente que responde en WhatsApp, Messenger e Instagram, confirma cada pedido con el cliente y lo manda a Effi o Dropi con la guía lista.</p>
          <div className="fila" style={{ gap: 8 }}>
            <span className="chip">Asistente con IA</span><span className="chip">Confirmación Sí / No</span><span className="chip">Effi · Dropi · Shopify</span><span className="chip">Tienda en línea</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <div><span className="mono" style={{ fontSize: 26, fontWeight: 700, display: 'block' }}>24/7</span><span className="suave-t" style={{ fontSize: 12.5 }}>atención sin que tengas que estar pendiente</span></div>
          <div><span className="mono" style={{ fontSize: 26, fontWeight: 700, display: 'block' }}>seg.</span><span className="suave-t" style={{ fontSize: 12.5 }}>en responder cada chat con tu catálogo</span></div>
          <div><span className="mono" style={{ fontSize: 26, fontWeight: 700, display: 'block' }}>Sí / No</span><span className="suave-t" style={{ fontSize: 12.5 }}>cada pedido confirmado por el cliente antes de salir</span></div>
        </div>
      </section>

      <section className="acceso-form">
        {recuperar ? (
          <Recuperar modo={recuperar} token={token} correoInicial={email} onListo={(m) => { setRecuperar(null); setAviso(m); if (token) { setToken(''); history.replaceState(null, '', location.pathname); } }} />
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void entrar(); }} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <a className="marca acceso-marca-movil" href="/inicio" style={{ padding: 0 }}>
              <img src={iconoApp} alt="" />
              <span>DealFlow<small>Vende por WhatsApp con IA</small></span>
            </a>
            <div className="fila" role="tablist" style={{ gap: 6 }}>
              <button type="button" role="tab" aria-selected={!esRegistro} className={`chip${!esRegistro ? ' activa' : ''}`} onClick={() => cambiarModo('login')}>Entrar</button>
              <button type="button" role="tab" aria-selected={esRegistro} className={`chip${esRegistro ? ' activa' : ''}`} onClick={() => cambiarModo('registro')}>Crear mi tienda</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 style={{ fontSize: 26 }}>{esRegistro ? <>Activa tu <span className="grad-txt">asistente</span></> : 'Entrar'}</h2>
              <p className="suave-t">{esRegistro ? 'Crea tu tienda y deja que la IA empiece a vender por ti.' : 'Usa el correo con el que creaste tu tienda.'}</p>
            </div>
            {esRegistro && (
              <>
                <div className="campo"><label htmlFor="ac-nombre">Tu nombre</label><input id="ac-nombre" value={nombre} onChange={(e) => { setNombre(e.target.value); limpiar(); }} placeholder="Ej: Camila Torres" autoComplete="name" /></div>
                <div className="campo"><label htmlFor="ac-negocio">Nombre de tu tienda</label><input id="ac-negocio" value={negocio} onChange={(e) => { setNegocio(e.target.value); limpiar(); }} placeholder="Ej: Luna Accesorios" /></div>
              </>
            )}
            <div className="campo"><label htmlFor="ac-correo">Correo</label><input id="ac-correo" type="email" value={email} onChange={(e) => { setEmail(e.target.value); limpiar(); }} placeholder="tucorreo@tienda.co" autoComplete="username" /></div>
            <div className="campo">
              <label htmlFor="ac-clave">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input id="ac-clave" type={verClave ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); limpiar(); }} placeholder={esRegistro ? 'Mínimo 8 caracteres' : '••••••••'} autoComplete={esRegistro ? 'new-password' : 'current-password'} style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setVerClave((v) => !v)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="btn btn-fant btn-chico" style={{ position: 'absolute', right: 4, top: 4, minHeight: 32, padding: '0 8px' }}>
                  {verClave ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            {df.loginError && <div className="aviso-caja mal">⚠️ {df.loginError}</div>}
            {!esRegistro && (
              <div className="fila" style={{ justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { df.clearLoginError(); setRecuperar('pedir'); }} style={{ background: 'none', border: 0, padding: 0, color: 'var(--cian)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Olvidé mi contraseña</button>
              </div>
            )}
            <button type="submit" className="btn btn-pri" disabled={enviando} style={{ width: '100%' }}>
              {enviando ? (esRegistro ? 'Creando tu tienda…' : 'Entrando…') : esRegistro ? 'Crear mi tienda →' : 'Entrar al panel'}
            </button>
            {aviso && <p className="ok" style={{ fontSize: 13, textAlign: 'center' }}>{aviso}</p>}
            <p className="tenue" style={{ fontSize: 12.5, textAlign: 'center' }}>
              {esRegistro ? <>¿Ya tienes tienda? <a href="#entrar" onClick={(e) => { e.preventDefault(); cambiarModo('login'); }} style={{ fontWeight: 700 }}>Entra aquí</a></> : <>¿Aún no tienes tienda? <a href="#crear" onClick={(e) => { e.preventDefault(); cambiarModo('registro'); }} style={{ fontWeight: 700 }}>Crea una gratis</a></>}
            </p>
            {!df.apiMode && (
              <div className="aviso-caja ok" style={{ fontSize: 12.5 }}>
                <b>Cuentas de la demo</b>
                <span className="mono">karla@lunaaccesorios.co · demo123</span>
                <span className="mono">admin@dealflow.co · admin123</span>
              </div>
            )}
            <p className="tenue" style={{ fontSize: 12, textAlign: 'center' }}>
              <a href="/legal/privacidad.html" target="_blank" rel="noopener" style={{ color: 'var(--niebla)' }}>Privacidad</a> · <a href="/legal/terminos.html" target="_blank" rel="noopener" style={{ color: 'var(--niebla)' }}>Términos</a>
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
