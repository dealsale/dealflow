import { useEffect, useRef, useState } from 'react';
import { apiAdminLlamadas, apiAdminLlamadaAccion, apiAdminSoporteConfig, type CfgLlamadas, type LlamadaEquipo, type ServicioLlamadas } from '../../lib/api';
import { notificar } from '../../components/dialogs';
import { fmtCO } from '../../lib/fechaCO';

/**
 * Soporte en vivo (equipo DealFlow): las tiendas que tocaron "Llamar a soporte". Al atender se
 * abre la misma sala de llamada (audio + pantalla compartida) y queda registrado quién atendió.
 */
const card: React.CSSProperties = { background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12, padding: 16 };
const btn: React.CSSProperties = { border: 0, borderRadius: 9, padding: '8px 14px', background: '#047857', color: '#fff', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnS: React.CSSProperties = { border: '1px solid var(--df-border)', borderRadius: 8, padding: '6px 11px', background: 'var(--df-surface)', color: 'var(--df-text-body)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' };
const ms = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');
const hace = (s: string) => { const m = Math.max(0, Math.round((Date.now() - ms(s)) / 60000)); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60} min`; };
const fecha = (s: string) => (s ? fmtCO('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(ms(s)) : '');
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ESTADO: Record<string, [string, string]> = {
  esperando: ['⏳ Esperando', '#B45309'], en_curso: ['🟢 En llamada', '#047857'], terminada: ['✓ Terminada', 'var(--df-text-muted)'],
  cancelada: ['Cancelada por la tienda', 'var(--df-text-muted)'], sin_atender: ['✗ Nadie la atendió', '#B91C1C'],
};

/** Sonido corto de aviso (sin archivos). */
function timbre() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25].forEach((t, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = i ? 988 : 784; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch { /* sin audio */ }
}

/** Aviso flotante en todo el panel del equipo cuando una tienda está esperando (con sonido). */
export function AvisoLlamadas({ irA }: { irA: () => void }) {
  const [esperando, setEsperando] = useState<LlamadaEquipo[]>([]);
  const vistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    let vivo = true;
    const ver = () => void apiAdminLlamadas().then((r) => {
      if (!vivo || !r.data) return;
      const e = r.data.llamadas.filter((l) => l.estado === 'esperando');
      const nuevas = vistas.current ? e.filter((l) => !vistas.current!.has(l.id)) : [];
      vistas.current = new Set(e.map((l) => l.id));
      if (nuevas.length) {
        timbre();
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('📞 Llamada de soporte', { body: `${nuevas[0].tienda}: ${nuevas[0].usuario} está esperando.` }); } catch { /* sin notificaciones */ }
      }
      setEsperando(e);
    });
    ver();
    const t = setInterval(ver, 8000); // también con la pestaña oculta: así suena el aviso
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (!esperando.length) return null;
  return (
    <div onClick={irA} role="alert" style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 60, cursor: 'pointer', background: '#047857', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800, fontSize: 13.5, boxShadow: '0 14px 30px -10px rgba(4,120,87,.6)', display: 'flex', gap: 10, alignItems: 'center', maxWidth: 'calc(100vw - 32px)' }}>
      <span style={{ animation: 'dfTimbre 1s ease-in-out infinite' }}>📞</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esperando.length === 1 ? `${esperando[0].tienda} está esperando en soporte` : `${esperando.length} tiendas esperando en soporte`}</span>
      <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 999, padding: '2px 10px', fontSize: 12 }}>Atender</span>
      <style>{'@keyframes dfTimbre { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-15deg) } 75% { transform: rotate(15deg) } }'}</style>
    </div>
  );
}

export function SoporteEnVivo({ puedeConfigurar = true }: { puedeConfigurar?: boolean }) {
  const [lista, setLista] = useState<LlamadaEquipo[] | null>(null);
  const [cfg, setCfg] = useState<CfgLlamadas | null>(null);
  const [servicio, setServicio] = useState<ServicioLlamadas | null>(null);
  const [permiso, setPermiso] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
  const cargar = () => void apiAdminLlamadas().then((r) => { if (r.data) { setLista(r.data.llamadas); setCfg((c) => c || r.data!.cfg); setServicio(r.data.servicio); } });
  useEffect(() => { cargar(); const t = setInterval(cargar, 6000); return () => clearInterval(t); }, []);

  const atender = async (l: LlamadaEquipo) => {
    // La pestaña se abre con el clic (el navegador no la bloquea) y se registra quién atendió.
    window.open(l.url, '_blank');
    const r = await apiAdminLlamadaAccion(l.id, 'atender');
    if (r.error) notificar(r.error, 'error');
    cargar();
  };
  const terminar = async (l: LlamadaEquipo) => { await apiAdminLlamadaAccion(l.id, 'terminar'); cargar(); };
  const guardar = async (p: Partial<CfgLlamadas>) => {
    const nuevo = { ...cfg!, ...p }; setCfg(nuevo);
    const r = await apiAdminSoporteConfig(p);
    if (r.error) notificar(r.error, 'error'); else { setCfg(r.data!.cfg); cargar(); }
  };
  const activas = (lista || []).filter((l) => l.estado === 'esperando' || l.estado === 'en_curso');
  const historial = (lista || []).filter((l) => l.estado !== 'esperando' && l.estado !== 'en_curso');

  return (
    <section data-screen-label="Soporte en vivo" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Soporte en vivo</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>Las tiendas tocan «Llamar a soporte» en SKY y se abre una llamada con audio y pantalla compartida. Al atender entras a la misma sala.</p>
      </div>

      {permiso !== 'granted' && 'Notification' in window && (
        <div style={{ ...card, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          🔔 <span style={{ flex: 1, minWidth: 200 }}>Activa los avisos del navegador para enterarte de una llamada aunque estés en otra pestaña (con DealFlow abierto).</span>
          <button onClick={() => void Notification.requestPermission().then(setPermiso)} style={btnS}>Activar avisos</button>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>📞 Ahora {activas.length > 0 && <span style={{ color: '#047857' }}>({activas.length})</span>}</div>
        {!lista && <div style={{ fontSize: 13, color: 'var(--df-text-faint)' }}>Cargando…</div>}
        {lista && !activas.length && <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Nadie está esperando. {servicio && (servicio.abierto ? 'El botón está disponible para las tiendas.' : `Fuera de horario: las tiendas ven «${servicio.horario}».`)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activas.map((l) => (
            <div key={l.id} style={{ border: `1.5px solid ${l.estado === 'esperando' ? '#F59E0B' : '#10B981'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{l.tienda} <span style={{ fontWeight: 600, color: 'var(--df-text-muted)', fontSize: 12.5 }}>· {l.usuario}</span></div>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-body)', marginTop: 2 }}>{l.motivo || <i style={{ color: 'var(--df-text-faint)' }}>Sin motivo</i>}{l.seccion ? <span style={{ color: 'var(--df-text-faint)' }}> · estaba en {l.seccion}</span> : ''}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: ESTADO[l.estado]?.[1] }}>{ESTADO[l.estado]?.[0]} · {l.estado === 'esperando' ? hace(l.creado) : `${l.atendidoPor} desde ${hace(l.atendidoAt)}`}</div>
              </div>
              <button onClick={() => void atender(l)} style={btn}>{l.estado === 'esperando' ? 'Atender' : 'Volver a entrar'}</button>
              <button onClick={() => void terminar(l)} style={btnS}>Terminar</button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 10, lineHeight: 1.5 }}>La sala se abre en Jitsi Meet. La primera vez te pide entrar con Google o GitHub para iniciarla como moderador; el cliente espera en la sala hasta que entras.</div>
      </div>

      {!puedeConfigurar && servicio && <div style={{ ...card, padding: '10px 14px', fontSize: 13, color: 'var(--df-text-muted)' }}>🕐 Horario de atención: {servicio.horario}. {servicio.abierto ? '🟢 Ahora está disponible.' : '⚪ Ahora está fuera de horario.'}</div>}
      {cfg && puedeConfigurar && (
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>🕐 Horario de atención</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.activo} onChange={(e) => void guardar({ activo: e.target.checked })} /> Mostrar el botón «Llamar a soporte» a las tiendas
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {DIAS.map((d, i) => {
              const on = cfg.dias.includes(i);
              return <button key={d} onClick={() => void guardar({ dias: on ? cfg.dias.filter((x) => x !== i) : [...cfg.dias, i] })} style={{ ...btnS, background: on ? '#047857' : 'var(--df-surface)', color: on ? '#fff' : 'var(--df-text-body)', borderColor: on ? '#047857' : 'var(--df-border)' }}>{d}</button>;
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            De <select value={cfg.desde} onChange={(e) => void guardar({ desde: Number(e.target.value) })} style={{ ...btnS, padding: '6px 8px' }}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}</select>
            a <select value={cfg.hasta} onChange={(e) => void guardar({ hasta: Number(e.target.value) })} style={{ ...btnS, padding: '6px 8px' }}>{Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
            <span style={{ color: 'var(--df-text-muted)' }}>(hora Colombia)</span>
          </div>
          <input defaultValue={cfg.aviso} onBlur={(e) => { if (e.target.value !== cfg.aviso) void guardar({ aviso: e.target.value }); }} maxLength={300} placeholder="Aviso opcional fuera de horario (ej. «Escríbenos por WhatsApp al …»)"
            style={{ marginTop: 10, width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text)' }} />
          {servicio && <div style={{ fontSize: 12, color: 'var(--df-text-muted)', marginTop: 8 }}>Las tiendas ven: «Soporte por llamada: {servicio.horario}». {servicio.abierto ? '🟢 Ahora está disponible.' : '⚪ Ahora está fuera de horario.'}</div>}
        </div>
      )}

      {historial.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>📋 Últimos 7 días</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {historial.map((l) => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, padding: '8px 0', borderTop: '1px solid var(--df-border)', fontSize: 12.5 }}>
                <span><b>{l.tienda}</b> · {l.usuario}</span>
                <span style={{ color: 'var(--df-text-muted)' }}>{fecha(l.creado)}{l.motivo ? ` · ${l.motivo}` : ''}</span>
                <span style={{ fontWeight: 700, color: ESTADO[l.estado]?.[1] }}>{ESTADO[l.estado]?.[0] || l.estado}{l.atendidoPor ? ` · ${l.atendidoPor}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
