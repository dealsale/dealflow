import { useEffect, useRef, useState } from 'react';
import {
  useLlamada, retomarGuardada, iniciarLlamada, colgarLlamada, cerrarVentanaLlamada, silenciarLlamada, compartirPantalla,
  dejarDeCompartir, minimizarLlamada, puedeCompartirPantalla, abrirVentanaAparte, traerLlamadaAqui, irAVentanaAparte, volverALaPestana,
  pedirControl, soltarControl, enviarAccion, responderControl, quitarControl,
  pedirAccesoComputador, enviarCodigoComputador, cerrarPedidoComputador, olvidarCodigoComputador, URL_ESCRITORIO_REMOTO,
} from '../lib/llamadaRTC';

/**
 * Ventana de la llamada de soporte (dentro de DealFlow). Flota sobre el panel y sigue abierta
 * aunque cambies de sección. La tienda la ve compacta; el equipo, grande (para ver la pantalla
 * que le comparten).
 */
const dur = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function VentanaLlamada({ mobile, aparte }: { mobile?: boolean; aparte?: boolean }) {
  const ll = useLlamada();
  const videoRef = useRef<HTMLVideoElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const [, tic] = useState(0);
  const [grande, setGrande] = useState(false);
  const [completa, setCompleta] = useState(false);
  useEffect(() => { retomarGuardada(); }, []);
  useEffect(() => { if (ll?.fase !== 'conectada') return; const t = setInterval(() => tic((x) => x + 1), 1000); return () => clearInterval(t); }, [ll?.fase]);
  useEffect(() => { const f = () => setCompleta(document.fullscreenElement === marcoRef.current && !!marcoRef.current); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  // Al tomar el control, la pantalla de la tienda se agranda sola.
  useEffect(() => { if (ll?.miControl === 'activo') setGrande(true); }, [ll?.miControl]);
  useEffect(() => {
    if (videoRef.current && ll?.remotoStream && videoRef.current.srcObject !== ll.remotoStream) { videoRef.current.srcObject = ll.remotoStream; void videoRef.current.play().catch(() => {}); }
  });
  if (!ll) return null;

  const soporte = ll.rol === 'soporte';
  const activa = ll.fase !== 'terminada' && ll.fase !== 'pausada';
  const conQuien = soporte ? ll.titulo : ll.atendidoPor ? (ll.atendidoPor.includes('DealFlow') ? ll.atendidoPor : `${ll.atendidoPor} (soporte DealFlow)`) : 'Soporte DealFlow';
  const estadoTxt: Record<string, string> = {
    preparando: 'Preparando el micrófono…',
    esperando: 'Esperando a que entre alguien de soporte… normalmente tarda unos minutos.',
    conectando: soporte ? (ll.timbrando ? 'Timbrando… esperando a que la tienda conteste.' : 'Conectando con la tienda…') : `${ll.atendidoPor || 'Soporte'} está entrando a la llamada…`,
    conectada: `En llamada con ${conQuien}`,
    reconectando: 'Se perdió la conexión: reconectando…',
    pausada: 'La llamada quedó en pausa (se recargó la página).',
    terminada: ll.aviso || 'La llamada terminó.',
  };
  const tiempo = ll.fase === 'conectada' && ll.inicio ? dur(Date.now() - ll.inicio) : '';

  // La llamada la lleva otra pestaña o la ventana aparte: aquí solo una píldora.
  if (ll.enOtra && !aparte) {
    const p: React.CSSProperties = { border: 0, borderRadius: 999, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
    return (
      <div data-df-no-remoto="" role="status" style={{ position: 'fixed', right: mobile ? 12 : 104, bottom: mobile ? 'calc(env(safe-area-inset-bottom,0px) + 84px)' : 32, zIndex: 58, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 'calc(100vw - 24px)', borderRadius: 999, padding: '6px 6px 6px 14px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, boxShadow: '0 12px 28px -10px rgba(4,120,87,.7)' }}>
        <span>📞 Llamada en {ll.otraEsVentana ? 'la ventana aparte' : 'otra pestaña'}{tiempo ? ` · ${tiempo}` : ''}</span>
        {ll.otraEsVentana && <button type="button" onClick={irAVentanaAparte} style={{ ...p, background: 'rgba(255,255,255,.18)', color: '#fff' }}>Ir a la ventana</button>}
        <button type="button" onClick={traerLlamadaAqui} style={{ ...p, background: '#fff', color: '#047857' }}>Traer aquí</button>
      </div>
    );
  }

  // Minimizada: una píldora con el tiempo (la llamada sigue).
  if (ll.minimizada && activa && !aparte) {
    return (
      <>
        <Audios ll={ll} />
        <button data-df-no-remoto="" onClick={() => minimizarLlamada(false)} style={{ position: 'fixed', right: mobile ? 12 : 104, bottom: mobile ? 'calc(env(safe-area-inset-bottom,0px) + 84px)' : 32, zIndex: 58, border: 0, borderRadius: 999, padding: '10px 16px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 12px 28px -10px rgba(4,120,87,.7)' }}>
          📞 {ll.fase === 'conectada' ? `En llamada ${tiempo}` : 'Llamada de soporte'}{ll.silenciado ? ' · 🔇' : ''}{ll.compartiendo ? ' · 🖥️' : ''}
        </button>
      </>
    );
  }

  const ancho = soporte ? (grande ? 'min(1100px, calc(100vw - 40px))' : 'min(560px, calc(100vw - 32px))') : (mobile ? 'calc(100vw - 16px)' : 340);
  const tiendaComparte = soporte && !!ll.remotos.find((r) => r.clave === 'tienda' && r.video);
  const superficieTienda = ll.remotos.find((r) => r.clave === 'tienda')?.superficie || '';
  const tiendaPantallaCompleta = tiendaComparte && !!superficieTienda && superficieTienda !== 'browser';
  const codigoVigente = soporte && ll.crdCodigo && Date.now() - ll.crdCodigo.t < 10 * 60_000 ? ll.crdCodigo.codigo : '';
  const controlando = soporte && ll.miControl === 'activo' && tiendaComparte;
  const altoVideo = completa ? '100vh' : aparte ? 'calc(100vh - 250px)' : soporte ? (grande ? 'calc(100vh - 340px)' : 320) : 220;
  const bChico: React.CSSProperties = { border: 0, borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
  const boton = (activo: boolean): React.CSSProperties => ({ flex: 1, minWidth: 0, border: 0, borderRadius: 10, padding: '10px 8px', fontFamily: 'inherit', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', background: activo ? '#FEF3C7' : 'rgba(255,255,255,.12)', color: activo ? '#92400E' : '#fff' });
  return (
    <div role="dialog" aria-label="Llamada de soporte" data-df-no-remoto="" style={aparte
      ? { position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0B1220', color: '#fff', overflow: 'hidden', fontFamily: 'inherit' }
      : { position: 'fixed', right: mobile ? 8 : 20, bottom: mobile ? 'calc(env(safe-area-inset-bottom,0px) + 84px)' : 100, zIndex: 58, width: ancho, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', background: '#0B1220', color: '#fff', borderRadius: 16, boxShadow: '0 30px 70px -20px rgba(2,6,23,.75)', overflow: 'hidden', fontFamily: 'inherit' }}>
      <Audios ll={ll} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'linear-gradient(135deg, #047857, #1D4ED8)' }}>
        <span style={{ fontSize: 18 }}>📞</span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{soporte ? ll.titulo : ll.atendidoPor.includes('DealFlow') ? ll.atendidoPor : 'Soporte DealFlow'}</div>
          <div style={{ fontSize: 11.5, opacity: 0.85 }}>{tiempo ? `En llamada · ${tiempo}` : ll.fase === 'terminada' ? 'Terminada' : 'Llamada de voz'}</div>
        </div>
        {aparte && activa && <button onClick={volverALaPestana} title="Volver a la pestaña de DealFlow (la llamada sigue allá)" style={{ ...cab, width: 'auto', padding: '0 10px', fontSize: 12 }}>↩ Volver a la pestaña</button>}
        {!aparte && !mobile && activa && <button onClick={abrirVentanaAparte} title="Abrir en ventana aparte: así puedes recargar DealFlow sin cortar la llamada" aria-label="Abrir en ventana aparte" style={cab}>⧉</button>}
        {soporte && activa && !aparte && <button onClick={() => setGrande((g) => !g)} title={grande ? 'Achicar' : 'Agrandar'} style={cab}>{grande ? '⤡' : '⤢'}</button>}
        {activa && !aparte && <button onClick={() => minimizarLlamada(true)} title="Minimizar (la llamada sigue)" style={cab}>—</button>}
        {!activa && <button onClick={() => { cerrarVentanaLlamada(); if (aparte) window.close(); }} aria-label="Cerrar" style={cab}>✕</button>}
      </div>

      {/* Pantalla que comparte el otro lado */}
      {activa && ll.remotoVideo && (
        <div ref={marcoRef} style={{ position: 'relative', background: '#000', ...(completa ? { height: '100vh' } : {}) }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: completa ? '100vh' : undefined, maxHeight: altoVideo, display: 'block', objectFit: 'contain', background: '#000' }} />
          {controlando && <CapaControl video={videoRef} />}
          <button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void marcoRef.current?.requestFullscreen?.(); }} title="Pantalla completa" style={{ ...cab, position: 'absolute', right: 8, top: 8, background: 'rgba(0,0,0,.55)', zIndex: 2 }}>⛶</button>
          <div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11, fontWeight: 700, background: controlando ? '#C2410C' : 'rgba(0,0,0,.55)', borderRadius: 6, padding: '2px 7px', zIndex: 2, pointerEvents: 'none' }}>{controlando ? '🖱 Tienes el control: clic aquí y escribe' : `🖥️ Pantalla de ${soporte ? 'la tienda' : (ll.atendidoPor || 'soporte')}`}</div>
          {controlando && <button onClick={soltarControl} style={{ ...bChico, position: 'absolute', right: 48, top: 8, background: '#fff', color: '#C2410C', zIndex: 2 }}>✋ Soltar control</button>}
        </div>
      )}
      {!(activa && ll.remotoVideo) && <video ref={videoRef} muted style={{ display: 'none' }} />}

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, lineHeight: 1.45, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {(ll.fase === 'esperando' || ll.fase === 'conectando' || ll.fase === 'reconectando' || ll.fase === 'preparando') && <span className="df-llamada-pulso" />}
          <span>{estadoTxt[ll.fase]}</span>
        </div>
        {ll.remotos.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ll.remotos.map((r) => (
              <span key={r.clave} title={r.conectado ? 'Conectado' : 'Conectando…'} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 9px', background: r.conectado ? 'rgba(16,185,129,.22)' : 'rgba(255,255,255,.1)', color: r.conectado ? '#6EE7B7' : 'rgba(255,255,255,.75)' }}>
                {r.conectado ? '●' : '○'} {soporte ? r.nombre : (r.nombre === 'La tienda' ? 'Tienda' : r.nombre)}
              </span>
            ))}
          </div>
        )}
        {soporte && ll.equipo.length > 1 && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>Si cuelgas, sales tú y la llamada sigue con {ll.equipo.length - 1 === 1 ? 'la otra persona' : 'las demás personas'} del equipo.</div>}
        {ll.compartiendo && <div style={{ fontSize: 12, fontWeight: 700, color: '#FDE68A' }}>🖥️ Estás compartiendo tu pantalla{soporte ? '' : ': soporte la está viendo'}.</div>}

        {/* Control remoto — equipo */}
        {soporte && activa && tiendaPantallaCompleta && ll.miControl !== 'activo' && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', lineHeight: 1.4 }}>La tienda comparte la pantalla completa: el control de DealFlow solo funciona compartiendo la pestaña. Para manejar todo su computador, usa «Pedir acceso a todo el computador».</div>}
        {soporte && activa && tiendaComparte && !(tiendaPantallaCompleta && ll.miControl !== 'activo') && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
            {!ll.controlListo ? <span style={{ color: 'rgba(255,255,255,.6)' }}>Control remoto: conectando con la tienda…</span>
              : ll.miControl === 'activo' ? <>
                <button onClick={soltarControl} style={{ ...bChico, background: '#FED7AA', color: '#7C2D12' }}>✋ Soltar control</button>
                <span style={{ color: 'rgba(255,255,255,.75)' }}>Clic, doble clic, clic derecho, rueda y teclado (pegar con Ctrl+V). Solo dentro de DealFlow; nunca contraseñas.</span>
              </>
              : ll.miControl === 'pidiendo' ? <>
                <span style={{ color: '#FDE68A', fontWeight: 700 }}>Esperando que la tienda acepte…</span>
                <button onClick={soltarControl} style={{ ...bChico, background: 'rgba(255,255,255,.14)', color: '#fff' }}>Cancelar</button>
              </>
              : <button onClick={pedirControl} style={{ ...bChico, background: '#F97316', color: '#fff' }}>🖱 Pedir control de DealFlow</button>}
          </div>
        )}
        {soporte && controlando && ll.controlCoincide === false && <div style={{ fontSize: 12, color: '#FDE68A', lineHeight: 1.4 }}>⚠ La tienda no está compartiendo la pestaña de DealFlow (o la pantalla entera): los clics pueden no caer donde son. Pídele que vuelva a compartir y elija <b>la pestaña de DealFlow</b>.</div>}
        {soporte && activa && ll.controlListo && !codigoVigente && <button onClick={pedirAccesoComputador} style={{ ...bChico, justifySelf: 'start', alignSelf: 'flex-start', background: 'rgba(255,255,255,.12)', color: '#fff' }}>💻 Pedir acceso a todo el computador</button>}
        {soporte && codigoVigente && (
          <div style={{ background: '#1E3A8A', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>💻 La tienda te dio acceso a todo su computador</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 800, letterSpacing: '.06em' }}>{codigoVigente.replace(/(\d{4})(?=\d)/g, '$1 ')}</span>
              <button onClick={() => void navigator.clipboard?.writeText(codigoVigente).catch(() => {})} style={{ ...bChico, background: 'rgba(255,255,255,.16)', color: '#fff' }}>Copiar</button>
              <a href={URL_ESCRITORIO_REMOTO} target="_blank" rel="noopener noreferrer" style={{ ...bChico, background: '#fff', color: '#1E3A8A', textDecoration: 'none' }}>Abrir Escritorio remoto ↗</a>
              <button onClick={olvidarCodigoComputador} aria-label="Quitar el código" style={{ ...bChico, background: 'transparent', color: 'rgba(255,255,255,.7)' }}>✕</button>
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85, lineHeight: 1.4 }}>En «Ofrecer asistencia» pega el código y toca <b>Conectar</b>; la tienda acepta en la ventana de Google. El código vence en pocos minutos y no se guarda.</div>
          </div>
        )}
        {soporte && ll.controlAviso && <div style={{ fontSize: 12, color: ll.controlAviso.startsWith('Le pedimos') ? '#BFDBFE' : '#FCA5A5' }}>{ll.controlAviso}</div>}

        {/* Compartir — tienda: pantalla completa (sin la barra que pone Chrome arriba de la pestaña) */}
        {!soporte && activa && ll.fase === 'conectada' && !ll.compartiendo && puedeCompartirPantalla() && (
          <button onClick={() => compartirPantalla(true)} style={{ ...bChico, background: 'transparent', color: 'rgba(255,255,255,.8)', padding: 0, textDecoration: 'underline', justifySelf: 'start', alignSelf: 'flex-start' }}>o compartir la pantalla completa (sin la barra de arriba)</button>
        )}
        {!soporte && ll.compartiendo && ll.superficie && ll.superficie !== 'browser' && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', lineHeight: 1.4 }}>Compartes la pantalla completa. Si soporte necesita manejar DealFlow por ti, comparte la pestaña de DealFlow; para todo el computador, usa «Dar acceso a todo mi computador».</div>}
        {!soporte && activa && ll.fase === 'conectada' && <AccesoComputador pedido={ll.crdPedido || ''} />}

        {/* Control remoto — tienda */}
        {!soporte && ll.control?.pedido && (
          <div role="alertdialog" aria-label="Permiso de control remoto" style={{ background: '#7C2D12', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>🖱 {ll.control.pedido.nombre} quiere controlar DealFlow para ayudarte</div>
            <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.92 }}>Podrá hacer clic, escribir y desplazarse <b>solo dentro de DealFlow</b>, en la pestaña que estás compartiendo. No puede ver ni escribir contraseñas, ni tocar el resto de tu computador. Lo quitas cuando quieras.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => responderControl(false)} style={{ ...boton(false), background: 'rgba(255,255,255,.16)' }}>No</button>
              <button onClick={() => responderControl(true)} style={{ ...boton(false), background: '#fff', color: '#7C2D12' }}>Permitir</button>
            </div>
          </div>
        )}
        {!soporte && ll.control?.activo && (
          <div style={{ background: '#7C2D12', borderRadius: 12, padding: '9px 10px 9px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>🖱 {ll.control.activo.nombre} está controlando DealFlow</span>
            <button onClick={quitarControl} style={{ ...bChico, background: '#fff', color: '#7C2D12' }}>Quitar control</button>
          </div>
        )}
        {!soporte && ll.fase === 'conectada' && !ll.compartiendo && puedeCompartirPantalla() && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>Para mostrarnos lo que ves, toca «Compartir pantalla».</div>}
        {ll.aviso && ll.fase !== 'terminada' && <div style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.4 }}>{ll.aviso}</div>}

        {ll.fase === 'pausada' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => iniciarLlamada(ll.id, ll.rol, ll.titulo)} style={{ ...boton(false), background: '#10B981' }}>🔄 Reconectar</button>
            <button onClick={() => void colgarLlamada()} style={{ ...boton(false), background: '#DC2626' }}>Colgar</button>
          </div>
        ) : activa ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {ll.mic && <button onClick={silenciarLlamada} style={boton(ll.silenciado)}>{ll.silenciado ? '🔇 Activar mic' : '🎤 Silenciar'}</button>}
            {puedeCompartirPantalla() && (ll.compartiendo
              ? <button onClick={dejarDeCompartir} style={boton(true)}>⏹ Dejar de compartir</button>
              : <button onClick={() => compartirPantalla()} disabled={ll.fase !== 'conectada'} style={{ ...boton(false), opacity: ll.fase === 'conectada' ? 1 : 0.45 }}>🖥️ Compartir pantalla</button>)}
            <button onClick={() => void colgarLlamada()} style={{ ...boton(false), background: '#DC2626' }}>Colgar</button>
          </div>
        ) : null}
      </div>
      <style>{`.df-llamada-pulso { flex: 0 0 auto; width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: #34D399; animation: dfLlPulso 1.2s ease-in-out infinite }
        @keyframes dfLlPulso { 0%,100% { opacity: .35; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.15) } }`}</style>
    </div>
  );
}

/** Tienda: dar acceso a TODO el computador con el Escritorio remoto de Chrome (Google). */
function AccesoComputador({ pedido }: { pedido: string }) {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  const b: React.CSSProperties = { border: 0, borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
  const [quien, setQuien] = useState('');
  // Si el equipo lo pide, se abre (y sigue abierto después de enviar el código, para ver el ✓).
  useEffect(() => { if (pedido) { setAbierto(true); setQuien(pedido); } }, [pedido]);
  if (!abierto && !pedido) return <button onClick={() => setAbierto(true)} style={{ ...b, background: 'transparent', color: 'rgba(255,255,255,.8)', padding: 0, textDecoration: 'underline', justifySelf: 'start', alignSelf: 'flex-start' }}>💻 Dar acceso a todo mi computador</button>;
  const digitos = codigo.replace(/\D/g, '');
  return (
    <div role="region" aria-label="Acceso a todo el computador" style={{ background: '#1E3A8A', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{quien ? `💻 ${quien} pide acceso a todo tu computador` : '💻 Acceso a todo tu computador'}</div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
        <li>Abre el <a href={URL_ESCRITORIO_REMOTO} target="_blank" rel="noopener noreferrer" style={{ color: '#BFDBFE', fontWeight: 800 }}>Escritorio remoto de Chrome ↗</a> (la primera vez te pide instalar un programa pequeño de Google).</li>
        <li>En «Compartir esta pantalla», toca <b>Generar código</b>.</li>
        <li>Escribe aquí los 12 números y toca <b>Enviar</b>. Después acepta en la ventana de Google.</li>
      </ol>
      <div style={{ display: 'flex', gap: 6 }}>
        <input inputMode="numeric" autoComplete="off" aria-label="Código de 12 números" value={codigo} onChange={(e) => { setCodigo(e.target.value.replace(/[^\d ]/g, '').slice(0, 16)); setMsg(''); }} placeholder="1234 5678 9012"
          style={{ flex: 1, minWidth: 0, border: 0, borderRadius: 8, padding: '8px 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 14, letterSpacing: '.05em' }} />
        <button disabled={digitos.length !== 12} onClick={() => { const ok = enviarCodigoComputador(digitos); setMsg(ok ? '✓ Enviado. Soporte se conecta y Google te pregunta si lo permites.' : 'No se pudo enviar: espera unos segundos e inténtalo de nuevo.'); if (ok) setCodigo(''); }}
          style={{ ...b, background: '#fff', color: '#1E3A8A', opacity: digitos.length === 12 ? 1 : 0.5 }}>Enviar</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 12, color: msg.startsWith('✓') ? '#BBF7D0' : '#FCA5A5' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 160, fontSize: 11, opacity: 0.8, lineHeight: 1.4 }}>Lo cortas cuando quieras con «Dejar de compartir» en la ventana de Google. El código no se guarda en DealFlow.</span>
        <button onClick={() => { setAbierto(false); setMsg(''); setQuien(''); cerrarPedidoComputador(); }} style={{ ...b, background: 'rgba(255,255,255,.14)', color: '#fff' }}>{msg.startsWith('✓') ? 'Cerrar' : 'Ahora no'}</button>
      </div>
    </div>
  );
}

/**
 * Capa invisible sobre la pantalla de la tienda: lo que hace el equipo (mover, clic, rueda,
 * teclado, pegar) viaja como coordenadas de 0 a 1 sobre la imagen compartida.
 */
function CapaControl({ video }: { video: React.RefObject<HTMLVideoElement | null> }) {
  const capa = useRef<HTMLDivElement>(null);
  const ultimoMov = useRef(0);
  const [foco, setFoco] = useState(false);
  const punto = (e: { clientX: number; clientY: number }) => {
    const v = video.current;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const r = v.getBoundingClientRect();
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const cw = v.videoWidth * s; const ch = v.videoHeight * s;
    const x = (e.clientX - (r.left + (r.width - cw) / 2)) / cw; const y = (e.clientY - (r.top + (r.height - ch) / 2)) / ch;
    return x < 0 || y < 0 || x > 1 || y > 1 ? null : { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
  };
  useEffect(() => {
    const el = capa.current; if (!el) return;
    el.focus();
    const acum = { dx: 0, dy: 0, x: 0, y: 0, t: 0 as ReturnType<typeof setTimeout> | 0 };
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const p = punto(e); if (!p) return;
      acum.dx += e.deltaX; acum.dy += e.deltaY; acum.x = p.x; acum.y = p.y;
      if (!acum.t) acum.t = setTimeout(() => { enviarAccion({ t: 'w', x: acum.x, y: acum.y, dx: Math.round(acum.dx), dy: Math.round(acum.dy) }); acum.dx = 0; acum.dy = 0; acum.t = 0; }, 60);
    };
    el.addEventListener('wheel', rueda, { passive: false });
    return () => el.removeEventListener('wheel', rueda);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={capa} tabIndex={0} role="application" aria-label="Pantalla de la tienda: tienes el control"
      onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
      onPointerMove={(e) => { const n = performance.now(); if (n - ultimoMov.current < 40) return; ultimoMov.current = n; const p = punto(e); if (p) enviarAccion({ t: 'm', ...p }); }}
      onPointerDown={() => capa.current?.focus()}
      onClick={(e) => { const p = punto(e); if (p) enviarAccion({ t: 'c', ...p, b: 0, n: e.detail >= 2 ? 2 : 1 }); }}
      onContextMenu={(e) => { e.preventDefault(); const p = punto(e); if (p) enviarAccion({ t: 'c', ...p, b: 2 }); }}
      onKeyDown={(e) => {
        if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
        if ((e.ctrlKey || e.metaKey) && ['v', 'c', 'x'].includes(e.key.toLowerCase())) return; // pegar llega por onPaste
        e.preventDefault();
        enviarAccion({ t: 'k', key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
      }}
      onPaste={(e) => { e.preventDefault(); const t = e.clipboardData.getData('text'); if (t) enviarAccion({ t: 'txt', s: t.slice(0, 2000) }); }}
      style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'crosshair', outline: foco ? '3px solid #F97316' : '2px dashed rgba(249,115,22,.6)', outlineOffset: -3 }} />
  );
}

const cab: React.CSSProperties = { width: 30, height: 30, borderRadius: 9, border: 0, background: 'rgba(255,255,255,.16)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, flex: '0 0 auto' };

/** Un audio por cada persona en la llamada. Si el navegador bloquea el sonido (pasa tras recargar), pide un toque. */
function Audios({ ll }: { ll: NonNullable<ReturnType<typeof useLlamada>> }) {
  const [bloqueado, setBloqueado] = useState(false);
  const refs = useRef(new Map<string, HTMLAudioElement>());
  useEffect(() => {
    for (const r of ll.remotos) {
      const el = refs.current.get(r.clave);
      if (el && el.srcObject !== r.stream) { el.srcObject = r.stream; void el.play().then(() => setBloqueado(false)).catch(() => setBloqueado(true)); }
    }
  });
  const activar = () => { for (const el of refs.current.values()) void el.play().catch(() => {}); setBloqueado(false); };
  return (
    <>
      {ll.remotos.map((r) => <audio key={r.clave} autoPlay ref={(el) => { if (el) refs.current.set(r.clave, el); else refs.current.delete(r.clave); }} />)}
      {bloqueado && (
        <button onClick={activar} style={{ position: 'fixed', left: '50%', top: 16, transform: 'translateX(-50%)', zIndex: 95, border: 0, borderRadius: 999, padding: '12px 20px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 14px 30px -10px rgba(4,120,87,.7)' }}>
          🔊 Toca aquí para escuchar la llamada
        </button>
      )}
    </>
  );
}
