import { useEffect, useRef, useState } from 'react';
import { apiAdminLlamadas, apiAdminLlamadaAccion, apiAdminLlamar, apiAdminTiendasLlamar, type CfgLlamadas, type LlamadaEquipo, type ServicioLlamadas, type TiendaLlamable } from '../../lib/api';
import { notificar } from '../../components/dialogs';
import { fmtCO } from '../../lib/fechaCO';
import { useLlamada, iniciarLlamada, colgarLlamada } from '../../lib/llamadaRTC';
import { HorarioSoporte, PausaSoporte } from './HorarioSoporte';

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
const ESTADO: Record<string, [string, string]> = {
  esperando: ['⏳ Esperando', '#B45309'], en_curso: ['🟢 En llamada', '#047857'], terminada: ['✓ Terminada', 'var(--df-text-muted)'],
  cancelada: ['Cancelada', 'var(--df-text-muted)'], sin_atender: ['✗ Nadie la atendió', '#B91C1C'],
  llamando: ['📳 Timbrando en la tienda', '#1D4ED8'], rechazada: ['✗ La tienda rechazó', '#B91C1C'], sin_respuesta: ['✗ La tienda no contestó', '#B91C1C'],
};

/** Solo el superadmin: llamar a una tienda (le aparece el aviso grande «El administrador de DealFlow te está llamando»). */
function LlamarTienda({ alLlamar }: { alLlamar: () => void }) {
  const [tiendas, setTiendas] = useState<TiendaLlamable[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<TiendaLlamable | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cargar = () => void apiAdminTiendasLlamar().then((r) => { if (r.data) setTiendas(r.data.tiendas); });
  useEffect(() => { cargar(); const t = setInterval(cargar, 8000); return () => clearInterval(t); }, []);
  const n = q.trim().toLowerCase();
  const lista = (tiendas || []).filter((t) => !n || t.nombre.toLowerCase().includes(n) || t.correo.toLowerCase().includes(n))
    .sort((a, b) => Number(b.conectada) - Number(a.conectada)).slice(0, 8);
  const llamar = async () => {
    if (!sel) return;
    setOcupado(true);
    const r = await apiAdminLlamar(sel.id, motivo.trim());
    setOcupado(false);
    if (!r.data) { notificar(r.error || 'No se pudo llamar.', 'error'); return; }
    iniciarLlamada(r.data.id, 'soporte', `${r.data.tienda} · llamada saliente`);
    setSel(null); setMotivo(''); setQ('');
    alLlamar();
  };
  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>📲 Llamar a una tienda</div>
      <div style={{ fontSize: 12.5, color: 'var(--df-text-muted)', margin: '4px 0 10px' }}>A la tienda le aparece en grande «El administrador de DealFlow te está llamando» con timbre. Solo le llega si tiene DealFlow abierto (🟢). Timbra 1 minuto.</div>
      {sel ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{sel.nombre}</b>
            <span style={{ fontSize: 12, color: sel.conectada ? '#047857' : 'var(--df-text-muted)', fontWeight: 700 }}>{sel.conectada ? '🟢 Tiene DealFlow abierto' : '⚪ No tiene DealFlow abierto ahora'}</span>
            <button type="button" onClick={() => setSel(null)} style={{ ...btnS, marginLeft: 'auto' }}>Cambiar</button>
          </div>
          <input id="sop-llamar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo (opcional): lo ve la tienda en el aviso"
            style={{ font: 'inherit', fontSize: 13.5, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--df-border)', background: 'var(--df-bg)', color: 'var(--df-text)' }} />
          <button type="button" onClick={() => void llamar()} disabled={ocupado} style={{ ...btn, justifySelf: 'start', padding: '10px 18px' }}>{ocupado ? 'Llamando…' : `📞 Llamar a ${sel.nombre}`}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <input id="sop-llamar-buscar" value={q} onFocus={cargar} onChange={(e) => setQ(e.target.value)} placeholder="Busca la tienda por nombre o correo…" aria-label="Buscar tienda para llamar"
            style={{ font: 'inherit', fontSize: 13.5, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--df-border)', background: 'var(--df-bg)', color: 'var(--df-text)' }} />
          {!tiendas && <div style={{ fontSize: 13, color: 'var(--df-text-faint)' }}>Cargando tiendas…</div>}
          {lista.map((t) => (
            <button key={t.id} type="button" onClick={() => setSel(t)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', border: '1px solid var(--df-border)', borderRadius: 9, padding: '8px 11px', background: 'var(--df-surface)', color: 'var(--df-text)', fontFamily: 'inherit', fontSize: 13.5, cursor: 'pointer' }}>
              <span aria-hidden>{t.conectada ? '🟢' : '⚪'}</span>
              <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nombre}{t.oculta ? ' · oculta' : ''}</span>
              <span style={{ fontSize: 12, color: 'var(--df-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45%' }}>{t.correo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const ll = useLlamada();
  const [atendiendo, setAtendiendo] = useState(false);
  const pendientes = esperando.filter((l) => !(ll && ll.id === l.id && ll.fase !== 'terminada'));
  if (!pendientes.length) return null;
  const atenderYa = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const l = pendientes[0];
    setAtendiendo(true);
    const r = await apiAdminLlamadaAccion(l.id, 'atender');
    setAtendiendo(false);
    if (r.error) { notificar(r.error, 'error'); return; }
    iniciarLlamada(l.id, 'soporte', `${l.tienda} · ${l.usuario}`);
  };
  return (
    <div onClick={irA} role="alert" style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 60, cursor: 'pointer', background: '#047857', color: '#fff', borderRadius: 999, padding: '10px 18px', fontWeight: 800, fontSize: 13.5, boxShadow: '0 14px 30px -10px rgba(4,120,87,.6)', display: 'flex', gap: 10, alignItems: 'center', maxWidth: 'calc(100vw - 32px)' }}>
      <span style={{ animation: 'dfTimbre 1s ease-in-out infinite' }}>📞</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendientes.length === 1 ? `${pendientes[0].tienda} está esperando en soporte` : `${pendientes.length} tiendas esperando en soporte`}</span>
      <button type="button" onClick={(e) => void atenderYa(e)} disabled={atendiendo} title={`Contestar a ${pendientes[0].tienda} ahora`}
        style={{ border: 0, background: '#fff', color: '#047857', borderRadius: 999, padding: '4px 12px', fontFamily: 'inherit', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>{atendiendo ? 'Conectando…' : '📞 Contestar'}</button>
      <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 999, padding: '2px 10px', fontSize: 12 }}>Ver</span>
      <style>{'@keyframes dfTimbre { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-15deg) } 75% { transform: rotate(15deg) } }'}</style>
    </div>
  );
}

export function SoporteEnVivo({ puedeConfigurar = true, puedeLlamar = false }: { puedeConfigurar?: boolean; puedeLlamar?: boolean }) {
  const [lista, setLista] = useState<LlamadaEquipo[] | null>(null);
  const [cfg, setCfg] = useState<CfgLlamadas | null>(null);
  const [servicio, setServicio] = useState<ServicioLlamadas | null>(null);
  const [permiso, setPermiso] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
  const [maxEquipo, setMaxEquipo] = useState(2);
  const [yo, setYo] = useState('');
  const cargar = () => void apiAdminLlamadas().then((r) => { if (r.data) { setLista(r.data.llamadas); setCfg(r.data.cfg); setServicio(r.data.servicio); setMaxEquipo(r.data.maxEquipo || 2); setYo(r.data.yo || ''); } });
  useEffect(() => { cargar(); const t = setInterval(cargar, 6000); return () => clearInterval(t); }, []);

  const llamada = useLlamada();
  const atender = async (l: LlamadaEquipo) => {
    // Queda registrado quién atendió y la llamada se abre aquí mismo (ventana flotante).
    const r = await apiAdminLlamadaAccion(l.id, 'atender');
    if (r.error) { notificar(r.error, 'error'); return; }
    iniciarLlamada(l.id, 'soporte', `${l.tienda} · ${l.usuario}`);
    cargar();
  };
  const terminar = async (l: LlamadaEquipo) => {
    if (llamada?.id === l.id && llamada.fase !== 'terminada') await colgarLlamada();
    else await apiAdminLlamadaAccion(l.id, 'terminar');
    cargar();
  };
  const cambio = (c: CfgLlamadas, s: ServicioLlamadas) => { setCfg(c); setServicio(s); };
  const activas = (lista || []).filter((l) => l.estado === 'esperando' || l.estado === 'en_curso' || l.estado === 'llamando');
  const historial = (lista || []).filter((l) => l.estado !== 'esperando' && l.estado !== 'en_curso' && l.estado !== 'llamando');

  return (
    <section data-screen-label="Soporte en vivo" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Soporte en vivo</h1>
        <p style={{ color: 'var(--df-text-muted)', fontSize: 14, margin: '4px 0 0' }}>Las tiendas tocan «Llamar a soporte» en SKY y la llamada (audio y pantalla compartida) ocurre aquí mismo. Toca «Atender» y quedas conectado.</p>
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
        {lista && !activas.length && <div style={{ fontSize: 13, color: 'var(--df-text-muted)' }}>Nadie está esperando. {servicio && (servicio.abierto ? 'El botón está disponible para las tiendas.' : `Fuera de horario.${servicio.pausa ? ` ${servicio.pausa}` : ''}${servicio.siguiente ? ` ${servicio.siguiente}` : ''}`)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activas.map((l) => (
            <div key={l.id} style={{ border: `1.5px solid ${l.estado === 'esperando' ? '#F59E0B' : '#10B981'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{l.direccion === 'saliente' && <span title="La llamaste tú" style={{ fontSize: 11.5, fontWeight: 800, color: '#1D4ED8', background: 'rgba(29,78,216,.1)', borderRadius: 6, padding: '1px 6px', marginRight: 6 }}>↗ Saliente</span>}{l.tienda} {l.usuario && <span style={{ fontWeight: 600, color: 'var(--df-text-muted)', fontSize: 12.5 }}>· {l.usuario}</span>}</div>
                <div style={{ fontSize: 12.5, color: 'var(--df-text-body)', marginTop: 2 }}>{l.motivo || <i style={{ color: 'var(--df-text-faint)' }}>Sin motivo</i>}{l.seccion ? <span style={{ color: 'var(--df-text-faint)' }}> · estaba en {l.seccion}</span> : ''}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: ESTADO[l.estado]?.[1] }}>{ESTADO[l.estado]?.[0]} · {l.estado === 'esperando' || l.estado === 'llamando' ? hace(l.creado) : `${l.atendidoPor} desde ${hace(l.atendidoAt)}`}</div>
                {l.estado === 'en_curso' && (l.equipo || []).length > 0 && <div style={{ fontSize: 11.5, color: 'var(--df-text-muted)', marginTop: 2 }}>En la llamada ahora: {(l.equipo || []).map((e) => e.nombre).join(', ')}</div>}
              </div>
              {llamada?.id === l.id && llamada.fase !== 'terminada'
                ? <span style={{ fontSize: 12.5, fontWeight: 800, color: '#047857' }}>📞 Estás en esta llamada</span>
                : l.estado === 'llamando' ? null
                : l.estado === 'en_curso' && (l.equipo || []).length >= maxEquipo && !(l.equipo || []).some((e) => e.id === yo)
                  ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--df-text-muted)' }}>Llena ({maxEquipo} del equipo)</span>
                  : <button onClick={() => void atender(l)} style={btn}>{l.estado === 'esperando' ? 'Atender' : (l.equipo || []).some((e) => e.id === yo) ? 'Volver a entrar' : `Unirme (${(l.equipo || []).length}/${maxEquipo})`}</button>}
              <button onClick={() => void terminar(l)} style={btnS}>Terminar</button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--df-text-faint)', marginTop: 10, lineHeight: 1.5 }}>La llamada es aquí mismo, dentro de DealFlow (audio y pantalla compartida, sin otra plataforma). La primera vez el navegador te pide permiso para el micrófono.</div>
      </div>

      {puedeLlamar && <LlamarTienda alLlamar={cargar} />}

      <PausaSoporte servicio={servicio} onCambio={cambio} />
      {!puedeConfigurar && servicio && <div style={{ ...card, padding: '10px 14px', fontSize: 13, color: 'var(--df-text-muted)' }}>🕐 Horario de atención: {servicio.horario}. {servicio.abierto ? `🟢 Ahora está disponible.${servicio.hasta ? ` ${servicio.hasta}` : ''}` : `⚪ Ahora no está disponible.${servicio.siguiente ? ` ${servicio.siguiente}` : ''}`}</div>}
      {cfg && puedeConfigurar && <HorarioSoporte cfg={cfg} servicio={servicio} onCambio={cambio} />}

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
