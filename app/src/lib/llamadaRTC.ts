import { useSyncExternalStore } from 'react';
import { apiAdminLlamadaAccion, apiSoporteCancelarLlamada } from './api';
import { DEVOLVER_A, ES_APARTE, TAB, alCanal, avisarCanal, latidoAjeno, latir, soltarLatido } from './canalLlamada';
import { alQuitarControl, ejecutar, terminarEjecucion, vistaLocal, type AccionControl } from './controlRemoto';

/**
 * Llamada de soporte PROPIA (WebRTC), dentro de DealFlow: audio y pantalla compartida de
 * navegador a navegador. El servidor solo pasa las señales para conectarse (/api/soporte/…/senal).
 *  - En la llamada están la tienda y hasta 2 personas del equipo: todos se conectan con todos
 *    (una conexión por cada pareja). Cada persona tiene una CLAVE: «tienda» o «soporte:<id>».
 *  - Quién ofrece en cada pareja: el equipo a la tienda; entre dos del equipo, la clave mayor.
 *  - Al entrar, cada uno saluda («hola») a todos; quien debe ofrecer, ofrece. Si alguien
 *    recarga la página, vuelve a saludar y se reconecta solo.
 *  - Cada conexión lleva el micrófono y la pantalla (cuando se comparte, sin renegociar).
 */
export type RolLlamada = 'tienda' | 'soporte';
export type FaseLlamada = 'preparando' | 'esperando' | 'conectando' | 'conectada' | 'reconectando' | 'pausada' | 'terminada';
export interface Remoto { clave: string; nombre: string; stream: MediaStream; video: boolean; conectado: boolean }
export interface EstadoLlamada {
  id: string; rol: RolLlamada; titulo: string; fase: FaseLlamada; atendidoPor: string; inicio: number;
  mic: boolean; silenciado: boolean; compartiendo: boolean;
  /** Alguien comparte pantalla (y su video). */
  remotoVideo: boolean; remotoStream: MediaStream | null;
  /** Todas las personas conectadas conmigo (audio de cada una). */
  remotos: Remoto[];
  /** Personas del equipo en la llamada (según el servidor). */
  equipo: { clave: string; nombre: string }[];
  aviso: string; minimizada: boolean;
  /** Llamada saliente que todavía timbra en la tienda (nadie ha contestado). */
  timbrando?: boolean;
  /** La llamada la lleva OTRA pestaña o la ventana aparte (aquí solo se muestra la píldora). */
  enOtra?: boolean; otraEsVentana?: boolean;
  // ── Control remoto ──
  /** Tienda: alguien del equipo pide control / lo tiene. */
  control?: { pedido?: { de: string; nombre: string }; activo?: { de: string; nombre: string } };
  /** Equipo: hay canal de control con la tienda, y en qué va mi pedido. */
  controlListo?: boolean; miControl?: '' | 'pidiendo' | 'activo';
  controlAviso?: string;
  /** Equipo: ¿la tienda comparte la pestaña de DealFlow? (si no, los clics no caen donde son). */
  controlCoincide?: boolean | null;
}

// ── Estado global (la ventana de la llamada sigue abierta aunque cambies de sección) ──
let estado: EstadoLlamada | null = null;
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
let ultimoResumen = '';
function set(p: Partial<EstadoLlamada>) {
  if (!estado) return;
  estado = { ...estado, ...p }; emitir();
  // La dueña de la llamada cuenta a las otras pestañas cómo va (para su píldora).
  if (motor?.vivo) {
    const r = JSON.stringify({ fase: estado.fase, inicio: estado.inicio, titulo: estado.titulo, atendidoPor: estado.atendidoPor });
    if (r !== ultimoResumen) { ultimoResumen = r; avisarCanal({ t: 'estado', id: estado.id, ...JSON.parse(r) }); }
  }
}
export function useLlamada(): EstadoLlamada | null {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => estado, () => null);
}
const CLAVE = 'df:llamada-soporte';
const guardar = (v: { id: string; rol: RolLlamada; titulo: string } | null) => { try { if (v) localStorage.setItem(CLAVE, JSON.stringify(v)); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };

/** Al recargar la página: si la llamada sigue, se reconecta SOLA (sin tocar nada). */
export function retomarGuardada(): void {
  if (estado) return;
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null') as { id: string; rol: RolLlamada; titulo: string } | null;
    if (!g?.id) return;
    // Otra pestaña (o la ventana aparte) ya la lleva: aquí solo la píldora «Traer aquí».
    const otra = !ES_APARTE && latidoAjeno();
    if (otra) { estado = { ...base(g.id, g.rol, g.titulo), fase: 'conectada', enOtra: true, otraEsVentana: otra.aparte }; emitir(); avisarCanal({ t: 'pide-estado' }); return; }
    void fetch(`/api/soporte/llamadas/${g.id}/senal?desde=-1`, { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d || !['esperando', 'en_curso', 'llamando'].includes(d.estado)) { guardar(null); return; }
      iniciarLlamada(g.id, g.rol, g.titulo, d.atendidoPor || '');
      set({ aviso: 'Se recargó la página: reconectando la llamada…' });
    }).catch(() => {});
  } catch { /* nada */ }
}

const base = (id: string, rol: RolLlamada, titulo: string): EstadoLlamada => ({
  id, rol, titulo, fase: 'preparando', atendidoPor: '', inicio: 0, mic: false, silenciado: false, compartiendo: false,
  remotoVideo: false, remotoStream: null, remotos: [], equipo: [], aviso: '', minimizada: false,
});

const ICE_DEF: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

interface Par { clave: string; pc: RTCPeerConnection; gen: string; pendientes: RTCIceCandidateInit[]; stream: MediaStream; video: boolean; conectado: boolean; dc?: RTCDataChannel }
/** Mensajes del canal de control (además de las acciones). */
type MsgControl = AccionControl | { t: 'pedir' } | { t: 'soltar' } | { t: 'ok' } | { t: 'no'; motivo?: string } | { t: 'fin'; motivo?: string } | { t: 'info'; coincide: boolean | null };
type DatosSenal = { gen?: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit; on?: boolean; resp?: boolean } | null;

class Motor {
  pares = new Map<string, Par>();
  mic: MediaStream | null = null;
  pantalla: MediaStreamTrack | null = null;
  ice: RTCIceServer[] = ICE_DEF;
  desde = 0; vivo = true; yo = '';
  nombres = new Map<string, string>();
  huboConexion = false;
  latidoIv: ReturnType<typeof setInterval> | null = null;
  infoIv: ReturnType<typeof setInterval> | null = null;
  /** Con la ventana aparte: pestañas de DealFlow abiertas (dónde se ejecuta el control). */
  vistas = new Map<string, { w: number; h: number; visible: boolean; foco: boolean; t: number }>();
  id: string; rol: RolLlamada;
  constructor(id: string, rol: RolLlamada) { this.id = id; this.rol = rol; }

  /** ¿Me toca ofrecer a esta persona? */
  ofrezco(otra: string): boolean {
    if (otra === 'tienda') return this.yo !== 'tienda';
    if (this.yo === 'tienda') return false;
    return this.yo > otra;
  }

  async senal(tipo: string, data: unknown, para = '*') {
    try {
      const r = await fetch(`/api/soporte/llamadas/${this.id}/senal`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, data, para }) });
      if (r.ok && !this.yo) { const d = await r.json().catch(() => null) as { yo?: string } | null; if (d?.yo) this.yo = d.yo; }
    } catch { /* reintenta el otro lado */ }
  }

  async arrancar() {
    latir(); this.latidoIv = setInterval(latir, 1500);
    if (ES_APARTE && this.rol === 'tienda') avisarCanal({ t: 'quien-vista' });
    try { const r = await fetch('/api/soporte/ice', { credentials: 'same-origin' }); if (r.ok) this.ice = (await r.json()).iceServers || ICE_DEF; } catch { /* STUN por defecto */ }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      set({ aviso: 'No tenemos permiso para usar tu micrófono: toca el candado junto a la dirección de la página, permite el micrófono y vuelve a conectar. Igual puedes oír y compartir pantalla.' });
    }
    if (!this.vivo) { this.mic?.getTracks().forEach((t) => t.stop()); return; }
    set({ mic: !!this.mic, fase: this.rol === 'tienda' ? 'esperando' : 'conectando' });
    // Se empieza desde la última señal (lo viejo no sirve: todo arranca con el saludo).
    try {
      const r = await fetch(`/api/soporte/llamadas/${this.id}/senal?desde=999999999`, { credentials: 'same-origin' });
      if (r.ok) { const d = await r.json(); this.desde = d.ultimo || 0; }
    } catch { /* nada */ }
    await this.senal('hola', null); // me presento ante todos (y así sé mi clave)
    void this.bucle();
  }

  nuevoPar(clave: string): Par {
    const viejo = this.pares.get(clave);
    try { viejo?.pc.close(); } catch { /* nada */ }
    // Se rehízo la conexión con la tienda: el control anterior ya no vale.
    if (viejo && this.rol === 'soporte' && clave === 'tienda' && estado?.miControl) set({ miControl: '', controlListo: false, controlAviso: 'Se reconectó la llamada: vuelve a pedir el control si lo necesitas.' });
    if (viejo && this.rol === 'tienda' && (estado?.control?.activo?.de === clave || estado?.control?.pedido?.de === clave)) this.cerrarControl('', false);
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const par: Par = { clave, pc, gen: '', pendientes: [], stream: new MediaStream(), video: viejo?.video || false, conectado: false };
    pc.onicecandidate = (e) => { if (e.candidate) void this.senal('ice', { gen: par.gen, c: e.candidate.toJSON() }, clave); };
    pc.ontrack = (e) => { if (!par.stream.getTracks().includes(e.track)) par.stream.addTrack(e.track); this.publicar(); };
    pc.ondatachannel = (e) => { if (e.channel.label === 'control') { par.dc = e.channel; this.atarCanal(par); } };
    pc.onconnectionstatechange = () => {
      if (this.pares.get(clave) !== par) return;
      const s = pc.connectionState;
      par.conectado = s === 'connected';
      if (s === 'connected') this.huboConexion = true;
      if (s === 'failed') {
        // Quien ofrece vuelve a ofrecer; el otro pide que lo haga.
        if (this.ofrezco(clave)) void this.ofertar(clave); else void this.senal('hola', { resp: true }, clave);
      }
      this.publicar();
    };
    this.pares.set(clave, par);
    return par;
  }

  /** Pasa a la ventana quién está conectado, su audio y si alguien comparte pantalla. */
  publicar() {
    const remotos: Remoto[] = [...this.pares.values()].map((p) => ({ clave: p.clave, nombre: this.nombres.get(p.clave) || (p.clave === 'tienda' ? 'La tienda' : 'Equipo DealFlow'), stream: p.stream, video: p.video, conectado: p.conectado }));
    const conVideo = remotos.find((r) => r.video);
    const alguno = remotos.some((r) => r.conectado);
    let fase: FaseLlamada = estado?.fase || 'conectando';
    if (alguno) fase = 'conectada';
    else if (this.huboConexion && remotos.length) fase = 'reconectando';
    else if (this.rol === 'tienda') fase = remotos.length ? 'conectando' : 'esperando';
    else fase = 'conectando';
    set({
      remotos, remotoVideo: !!conVideo, remotoStream: (conVideo || remotos.find((r) => r.conectado) || remotos[0])?.stream || null,
      fase, inicio: alguno ? (estado?.inicio || Date.now()) : estado?.inicio || 0,
      aviso: alguno && estado?.aviso && !estado.aviso.startsWith('No tenemos') ? '' : estado?.aviso || '',
    });
  }

  /** Pone el micrófono y la pantalla (si se está compartiendo) en los canales de una conexión. */
  async ponerPistas(pc: RTCPeerConnection, ofertante: boolean) {
    let ta: RTCRtpTransceiver | undefined; let tv: RTCRtpTransceiver | undefined;
    if (ofertante) {
      ta = pc.addTransceiver('audio', { direction: 'sendrecv' });
      tv = pc.addTransceiver('video', { direction: 'sendrecv' });
    } else {
      for (const t of pc.getTransceivers()) {
        if (t.receiver.track.kind === 'audio' && !ta) ta = t;
        else if (t.receiver.track.kind === 'video' && !tv) tv = t;
      }
      if (ta) ta.direction = 'sendrecv';
      if (tv) tv.direction = 'sendrecv';
    }
    await ta?.sender.replaceTrack(this.mic?.getAudioTracks()[0] || null);
    await tv?.sender.replaceTrack(this.pantalla || null);
    if (this.mic) this.mic.getAudioTracks().forEach((t) => { t.enabled = !estado?.silenciado; });
  }

  async ofertar(clave: string) {
    const par = this.nuevoPar(clave);
    par.gen = Math.random().toString(36).slice(2, 10);
    // Canal de control remoto: lo abre el equipo hacia la tienda.
    if (this.rol === 'soporte' && clave === 'tienda') { par.dc = par.pc.createDataChannel('control', { ordered: true }); this.atarCanal(par); }
    await this.ponerPistas(par.pc, true);
    const o = await par.pc.createOffer();
    await par.pc.setLocalDescription(o);
    await this.senal('offer', { gen: par.gen, sdp: par.pc.localDescription }, clave);
    this.publicar();
  }

  async alRecibir(de: string, tipo: string, data: DatosSenal) {
    if (tipo === 'colgar') { this.fin('La llamada terminó.'); return; }
    if (tipo === 'bye') {
      const p = this.pares.get(de); try { p?.pc.close(); } catch { /* nada */ }
      this.pares.delete(de); this.publicar(); return;
    }
    if (tipo === 'pantalla') { const p = this.pares.get(de); if (p) { p.video = !!data?.on; this.publicar(); } return; }
    if (tipo === 'hola') {
      if (this.ofrezco(de)) await this.ofertar(de);
      else if (!data?.resp) await this.senal('hola', { resp: true }, de);
      return;
    }
    if (tipo === 'offer' && data?.sdp) {
      const par = this.nuevoPar(de);
      par.gen = data.gen || '';
      await par.pc.setRemoteDescription(data.sdp);
      await this.ponerPistas(par.pc, false);
      const a = await par.pc.createAnswer();
      await par.pc.setLocalDescription(a);
      await this.senal('answer', { gen: par.gen, sdp: par.pc.localDescription }, de);
      await this.vaciarPendientes(par);
      if (this.pantalla) void this.senal('pantalla', { on: true }, de);
      this.publicar();
      return;
    }
    const par = this.pares.get(de);
    if (tipo === 'answer' && par && data?.sdp && data.gen === par.gen && par.pc.signalingState === 'have-local-offer') {
      await par.pc.setRemoteDescription(data.sdp);
      await this.vaciarPendientes(par);
      if (this.pantalla) void this.senal('pantalla', { on: true }, de);
      return;
    }
    if (tipo === 'ice' && par && data?.c && data.gen === par.gen) {
      if (par.pc.remoteDescription) { try { await par.pc.addIceCandidate(data.c); } catch { /* candidato viejo */ } }
      else par.pendientes.push(data.c);
    }
  }
  async vaciarPendientes(par: Par) {
    const l = par.pendientes; par.pendientes = [];
    for (const c of l) { try { await par.pc.addIceCandidate(c); } catch { /* nada */ } }
  }

  async bucle() {
    while (this.vivo) {
      try {
        const r = await fetch(`/api/soporte/llamadas/${this.id}/senal?desde=${this.desde}`, { credentials: 'same-origin' });
        if (r.status === 404 || r.status === 401) { this.fin('La llamada ya no existe.'); break; }
        if (r.ok) {
          const d = await r.json() as { senales: { n: number; de: string; tipo: string; data: never }[]; ultimo: number; estado: string; atendidoPor: string; equipo: { clave: string; nombre: string }[] };
          this.desde = Math.max(this.desde, d.ultimo);
          for (const e of d.equipo || []) this.nombres.set(e.clave, e.nombre);
          if (JSON.stringify(d.equipo || []) !== JSON.stringify(estado?.equipo || [])) set({ equipo: d.equipo || [] });
          if (d.atendidoPor && d.atendidoPor !== estado?.atendidoPor) set({ atendidoPor: d.atendidoPor });
          if ((d.estado === 'llamando') !== !!estado?.timbrando) set({ timbrando: d.estado === 'llamando' });
          if (this.rol === 'tienda' && d.estado === 'en_curso' && estado?.fase === 'esperando') set({ fase: 'conectando' });
          for (const s of d.senales) { if (!this.vivo) break; try { await this.alRecibir(s.de || (this.rol === 'tienda' ? 'soporte' : 'tienda'), s.tipo, s.data); } catch (e) { console.warn('[llamada]', e); } }
          // Personas que se fueron sin avisar (cerraron la pestaña): se quita su conexión.
          const vivos = new Set((d.equipo || []).map((x) => x.clave));
          for (const [k, p] of this.pares) if (k !== 'tienda' && !vivos.has(k) && !p.conectado) { try { p.pc.close(); } catch { /* nada */ } this.pares.delete(k); this.publicar(); }
          if (['terminada', 'cancelada', 'sin_atender', 'rechazada', 'sin_respuesta'].includes(d.estado) && this.vivo) {
            this.fin(d.estado === 'sin_atender' ? 'Nadie alcanzó a atender. Inténtalo de nuevo en un rato.'
              : d.estado === 'rechazada' ? 'La tienda rechazó la llamada.'
              : d.estado === 'sin_respuesta' ? 'La tienda no contestó.' : 'La llamada terminó.');
          }
        }
      } catch { /* sin red: reintenta */ }
      await new Promise((ok) => setTimeout(ok, estado?.fase === 'conectada' ? 2000 : 1000));
    }
  }

  // ── Control remoto ──────────────────────────────────────────────────
  atarCanal(par: Par) {
    const dc = par.dc!;
    dc.onopen = () => { if (this.pares.get(par.clave) === par && this.rol === 'soporte') set({ controlListo: true }); };
    dc.onclose = () => {
      if (this.pares.get(par.clave) !== par) return;
      if (this.rol === 'soporte') set({ controlListo: false, miControl: '' });
      else if (estado?.control?.activo?.de === par.clave || estado?.control?.pedido?.de === par.clave) this.cerrarControl('Se cortó la conexión con el equipo.');
    };
    dc.onmessage = (e) => { let m: MsgControl; try { m = JSON.parse(String(e.data)); } catch { return; } this.alControl(par.clave, m); };
  }
  enviarControl(clave: string, m: MsgControl) {
    const dc = this.pares.get(clave)?.dc;
    if (dc?.readyState === 'open') { try { dc.send(JSON.stringify(m)); return true; } catch { /* nada */ } }
    return false;
  }
  alControl(de: string, m: MsgControl) {
    if (this.rol === 'soporte') {
      if (m.t === 'ok') set({ miControl: 'activo', controlAviso: '' });
      else if (m.t === 'no') set({ miControl: '', controlAviso: m.motivo || 'La tienda no aceptó el control.' });
      else if (m.t === 'fin') set({ miControl: '', controlAviso: m.motivo || 'La tienda quitó el control.' });
      else if (m.t === 'info') set({ controlCoincide: m.coincide });
      return;
    }
    const c = estado?.control || {};
    const nombre = this.nombres.get(de) || 'Soporte DealFlow';
    if (m.t === 'pedir') {
      if (!this.pantalla) { this.enviarControl(de, { t: 'no', motivo: 'Primero la tienda tiene que compartir la pantalla (la pestaña de DealFlow).' }); return; }
      if (c.activo && c.activo.de !== de) { this.enviarControl(de, { t: 'no', motivo: `${c.activo.nombre} ya tiene el control.` }); return; }
      if (c.activo?.de === de) { this.enviarControl(de, { t: 'ok' }); return; }
      set({ control: { ...c, pedido: { de, nombre } }, minimizada: false });
      return;
    }
    if (m.t === 'soltar') { if (c.activo?.de === de || c.pedido?.de === de) this.cerrarControl('', false); return; }
    if (!c.activo || c.activo.de !== de) return;
    if (m.t === 'm' || m.t === 'c' || m.t === 'w' || m.t === 'k' || m.t === 'txt') this.ejecutarAccion(m, c.activo.nombre);
  }
  /** Dónde se ejecuta: en esta pestaña, o (con la ventana aparte) en la pestaña de DealFlow. */
  pestanaEjecutora(): string {
    const ahora = Date.now();
    const l = [...this.vistas.entries()].filter(([, v]) => ahora - v.t < 120_000);
    const mejor = l.find(([, v]) => v.foco) || l.filter(([, v]) => v.visible).sort((a, b) => b[1].t - a[1].t)[0] || l.find(([k]) => k === DEVOLVER_A);
    return mejor?.[0] || DEVOLVER_A;
  }
  ejecutarAccion(m: AccionControl, nombre: string) {
    if (!ES_APARTE) { ejecutar(m, nombre); return; }
    avisarCanal({ t: 'ctl', para: this.pestanaEjecutora(), m, quien: nombre });
  }
  /** ¿Lo que comparte la tienda es la pestaña de DealFlow? (mismo tamaño) */
  coincide(): boolean | null {
    if (!this.pantalla) return null;
    const s = this.pantalla.getSettings() as MediaTrackSettings & { displaySurface?: string };
    if (s.displaySurface && s.displaySurface !== 'browser') return false;
    const v = ES_APARTE ? this.vistas.get(this.pestanaEjecutora()) : vistaLocal();
    if (!v || !s.width || !s.height || !v.w || !v.h) return null;
    return Math.abs(s.width / s.height - v.w / v.h) / (v.w / v.h) < 0.05;
  }
  responderControl(si: boolean) {
    const p = estado?.control?.pedido;
    if (!p) return;
    if (!si) { this.enviarControl(p.de, { t: 'no', motivo: 'La tienda no aceptó el control.' }); set({ control: { ...estado?.control, pedido: undefined } }); void this.registrar('rechazado', p.nombre); return; }
    if (!this.enviarControl(p.de, { t: 'ok' })) { set({ control: { ...estado?.control, pedido: undefined }, aviso: 'Se perdió la conexión con el equipo: no se pudo dar el control.' }); return; }
    set({ control: { activo: p } });
    alQuitarControl(() => quitarControl());
    const info = () => this.enviarControl(p.de, { t: 'info', coincide: this.coincide() });
    info(); if (this.infoIv) clearInterval(this.infoIv); this.infoIv = setInterval(info, 3000);
    void this.registrar('concedido', p.nombre);
  }
  cerrarControl(motivo: string, avisar = true) {
    const c = estado?.control;
    if (this.infoIv) { clearInterval(this.infoIv); this.infoIv = null; }
    if (c?.activo && avisar) this.enviarControl(c.activo.de, { t: 'fin', motivo: motivo || undefined });
    if (c?.activo) void this.registrar('retirado', c.activo.nombre);
    alQuitarControl(null);
    if (ES_APARTE) avisarCanal({ t: 'ctl-fin' }); else terminarEjecucion();
    if (c) set({ control: undefined });
  }
  async registrar(evento: 'concedido' | 'retirado' | 'rechazado', quien: string) {
    try { await fetch(`/api/soporte/llamadas/${this.id}/control`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evento, quien }) }); } catch { /* opcional */ }
  }
  /** Otra pestaña (o la ventana aparte) toma la llamada: esta la suelta SIN colgar. */
  soltar(otraEsVentana: boolean) {
    if (!this.vivo) return;
    if (estado?.control) this.cerrarControl('La llamada pasó a otra ventana.');
    this.vivo = false;
    for (const p of this.pares.values()) { try { p.pc.close(); } catch { /* nada */ } }
    this.pares.clear();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.pantalla?.stop(); this.pantalla = null;
    if (this.latidoIv) clearInterval(this.latidoIv);
    if (motor === this) motor = null;
    set({ enOtra: true, otraEsVentana, remotos: [], remotoVideo: false, remotoStream: null, compartiendo: false, controlListo: false, miControl: '', control: undefined, aviso: '' });
  }

  silenciar() {
    const s = !estado?.silenciado;
    this.mic?.getAudioTracks().forEach((t) => { t.enabled = !s; });
    set({ silenciado: s });
  }
  async compartir() {
    try {
      // En la pestaña de DealFlow se ofrece compartir ESTA pestaña (así el control remoto apunta bien);
      // en la ventana aparte, que no se ofrezca la ventanita misma.
      const op = { video: { frameRate: 15 }, audio: false, ...(ES_APARTE ? { selfBrowserSurface: 'exclude' } : { preferCurrentTab: true, selfBrowserSurface: 'include' }) } as DisplayMediaStreamOptions;
      const st = await navigator.mediaDevices.getDisplayMedia(op);
      const t = st.getVideoTracks()[0];
      if (!t) return;
      this.pantalla = t;
      t.onended = () => void this.dejarDeCompartir();
      for (const p of this.pares.values()) await p.pc.getTransceivers().find((x) => x.receiver.track.kind === 'video')?.sender.replaceTrack(t);
      set({ compartiendo: true });
      void this.senal('pantalla', { on: true });
    } catch { /* canceló el selector de pantalla */ }
  }
  async dejarDeCompartir() {
    if (estado?.control?.activo || estado?.control?.pedido) this.cerrarControl('La tienda dejó de compartir la pantalla.');
    for (const p of this.pares.values()) { try { await p.pc.getTransceivers().find((x) => x.receiver.track.kind === 'video')?.sender.replaceTrack(null); } catch { /* nada */ } }
    this.pantalla?.stop(); this.pantalla = null;
    set({ compartiendo: false });
    void this.senal('pantalla', { on: false });
  }
  fin(aviso: string) {
    if (!this.vivo) return;
    if (estado?.control) this.cerrarControl('La llamada terminó.');
    this.vivo = false;
    if (this.latidoIv) clearInterval(this.latidoIv);
    if (this.infoIv) clearInterval(this.infoIv);
    soltarLatido();
    avisarCanal({ t: 'fin', id: this.id, aviso });
    for (const p of this.pares.values()) { try { p.pc.close(); } catch { /* nada */ } }
    this.pares.clear();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.pantalla?.stop();
    guardar(null);
    set({ fase: 'terminada', aviso, compartiendo: false, remotoVideo: false, remotos: [], controlListo: false, miControl: '', control: undefined });
    if (motor === this) motor = null;
  }
}

let motor: Motor | null = null;

// Mientras hay una llamada, el navegador pregunta antes de recargar o cerrar la pestaña.
// (En la ventana aparte no: al cerrarla, la llamada vuelve sola a la pestaña de DealFlow.)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!ES_APARTE && estado && motor?.vivo && estado.fase !== 'terminada') { e.preventDefault(); e.returnValue = ''; }
  });
  // Al irse (recargar, cerrar), la dueña avisa: la ventana aparte devuelve la llamada a su pestaña.
  window.addEventListener('pagehide', () => {
    if (!motor?.vivo) return;
    if (estado?.control?.activo) { if (ES_APARTE) avisarCanal({ t: 'ctl-fin' }); else terminarEjecucion(); }
    soltarLatido();
    avisarCanal({ t: 'cerrada', id: motor.id, devolverA: DEVOLVER_A });
  });
  alCanal((m) => {
    const t = m.t;
    if (t === 'tomo' && motor?.vivo && m.desdeTab !== TAB) {
      motor.soltar(String(m.desdeTab || '').startsWith('v-'));
      if (ES_APARTE) setTimeout(() => window.close(), 300);
    } else if (t === 'estado' && !motor && estado?.enOtra && m.id === estado.id) {
      set({ fase: (m.fase as FaseLlamada) || estado.fase, inicio: Number(m.inicio) || 0, atendidoPor: String(m.atendidoPor || estado.atendidoPor), otraEsVentana: String(m.desdeTab || '').startsWith('v-') });
    } else if (t === 'pide-estado' && motor?.vivo && estado) {
      ultimoResumen = ''; set({});
    } else if (t === 'fin' && !motor && estado && m.id === estado.id) {
      set({ enOtra: false, fase: 'terminada', aviso: String(m.aviso || 'La llamada terminó.') });
    } else if (t === 'colgar-otra' && motor?.vivo) {
      void colgarLlamada();
    } else if (t === 'quitar-control' && motor?.vivo) {
      quitarControl();
    } else if (t === 'vista' && motor?.vivo) {
      motor.vistas.set(String(m.tab), { w: Number(m.w), h: Number(m.h), visible: !!m.visible, foco: !!m.foco, t: Date.now() });
    } else if (t === 'cerrada' && !motor && estado?.enOtra && m.id === estado.id) {
      // La ventana aparte se cerró: la pestaña que la abrió retoma la llamada; las demás quedan en pausa.
      const g = { id: estado.id, rol: estado.rol, titulo: estado.titulo };
      if (m.devolverA === TAB) setTimeout(() => { if (!motor && !latidoAjeno() && estado?.enOtra) { iniciarLlamada(g.id, g.rol, g.titulo, estado.atendidoPor); set({ aviso: 'La llamada volvió a esta pestaña.' }); } }, 1200);
      else setTimeout(() => { if (!motor && !latidoAjeno() && estado?.enOtra) set({ enOtra: false, fase: 'pausada' }); }, 2500);
    }
  });
}

/** Empieza (o retoma) la llamada. `titulo`: con quién se habla. */
export function iniciarLlamada(id: string, rol: RolLlamada, titulo: string, atendidoPor = ''): void {
  if (motor && motor.id === id && motor.vivo) { set({ minimizada: false }); return; }
  motor?.fin('');
  estado = { ...base(id, rol, titulo), atendidoPor: atendidoPor || (estado?.id === id ? estado.atendidoPor : '') };
  emitir();
  guardar({ id, rol, titulo });
  avisarCanal({ t: 'tomo', id }); // si otra pestaña la tenía, la suelta
  terminarEjecucion(); // un control remoto de antes no sigue en la llamada nueva
  motor = new Motor(id, rol);
  void motor.arrancar();
}
/**
 * Cuelga. La tienda termina la llamada para todos. Alguien del equipo: si hay otra persona
 * del equipo en la llamada, solo sale (la llamada sigue); si es la última, la termina.
 */
export async function colgarLlamada(): Promise<void> {
  const e = estado; if (!e) return;
  if (e.enOtra && !motor) { avisarCanal({ t: 'colgar-otra' }); return; }
  const m = motor;
  const otrosEquipo = (e.equipo || []).filter((x) => x.clave !== m?.yo).length;
  if (e.rol === 'soporte' && otrosEquipo > 0 && m) {
    await m.senal('bye', null);
    m.fin('Saliste de la llamada (sigue con el resto del equipo).');
    return;
  }
  m?.fin('Colgaste la llamada.');
  if (!m) { guardar(null); set({ fase: 'terminada', aviso: 'Colgaste la llamada.' }); }
  if (e.rol === 'tienda') await apiSoporteCancelarLlamada(e.id); else await apiAdminLlamadaAccion(e.id, 'terminar');
}
export function cerrarVentanaLlamada(): void { if (estado?.fase === 'terminada') { estado = null; emitir(); } }
export const silenciarLlamada = () => motor?.silenciar();
export const compartirPantalla = () => void motor?.compartir();
export const dejarDeCompartir = () => void motor?.dejarDeCompartir();
export const minimizarLlamada = (v: boolean) => set({ minimizada: v });
export const puedeCompartirPantalla = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;

// ── Ventana aparte ──────────────────────────────────────────────────────
export const esVentanaAparte = () => ES_APARTE;
/** Abre la llamada en una ventanita propia: así recargar DealFlow no la corta. */
export function abrirVentanaAparte(): void {
  if (!estado || ES_APARTE) return;
  const soporte = estado.rol === 'soporte';
  const w = window.open(`/llamada?de=${encodeURIComponent(TAB)}`, 'df-llamada', soporte ? 'popup,width=1120,height=780' : 'popup,width=420,height=680');
  if (!w) { set({ aviso: 'El navegador bloqueó la ventana: permite las ventanas emergentes para DealFlow (icono a la derecha de la dirección).' }); return; }
  // La ventana nueva avisa «tomo» al arrancar y esta pestaña suelta la llamada sola.
}
/** Lleva la llamada otra vez a esta pestaña (la otra ventana la suelta). */
export function traerLlamadaAqui(): void {
  if (!estado) return;
  iniciarLlamada(estado.id, estado.rol, estado.titulo, estado.atendidoPor);
}
/** Pone al frente la ventana aparte (si está abierta). */
export function irAVentanaAparte(): void {
  const l = latidoAjeno();
  if (!l?.aparte) return;
  try { window.open('', 'df-llamada')?.focus(); } catch { /* nada */ }
}
/** Desde la ventana aparte: devolver la llamada a la pestaña de DealFlow y cerrar. */
export function volverALaPestana(): void {
  if (!ES_APARTE) return;
  window.close(); // pagehide avisa «cerrada» y la pestaña que la abrió la retoma
}

// ── Control remoto: lado del equipo ─────────────────────────────────────
export function pedirControl(): void {
  if (!motor || estado?.rol !== 'soporte') return;
  if (!motor.enviarControl('tienda', { t: 'pedir' })) { set({ controlAviso: 'Aún no hay canal con la tienda: espera unos segundos.' }); return; }
  set({ miControl: 'pidiendo', controlAviso: '' });
}
export function soltarControl(): void {
  if (!motor || estado?.rol !== 'soporte') return;
  motor.enviarControl('tienda', { t: 'soltar' });
  set({ miControl: '', controlAviso: '', controlCoincide: null });
}
/** Una acción (mover, clic, tecla…) hacia la pantalla de la tienda. */
export function enviarAccion(a: AccionControl): void {
  if (motor && estado?.miControl === 'activo') motor.enviarControl('tienda', a);
}
// ── Control remoto: lado de la tienda ───────────────────────────────────
export function responderControl(si: boolean): void { motor?.responderControl(si); }
export function quitarControl(): void { motor?.cerrarControl('La tienda quitó el control.'); }
