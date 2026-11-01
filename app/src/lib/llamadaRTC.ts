import { useSyncExternalStore } from 'react';
import { apiAdminLlamadaAccion, apiSoporteCancelarLlamada } from './api';

/**
 * Llamada de soporte PROPIA (WebRTC), dentro de DealFlow: audio y pantalla compartida de
 * navegador a navegador. El servidor solo pasa las señales para conectarse (/api/soporte/…/senal).
 *  - El equipo (soporte) hace la oferta; la tienda responde.
 *  - Cada lado tiene un canal de audio (micrófono) y uno de video (la pantalla, cuando se
 *    comparte: se cambia la pista sin renegociar).
 *  - Si alguien recarga la página, al volver manda "hola" y el equipo vuelve a ofertar.
 */
export type RolLlamada = 'tienda' | 'soporte';
export type FaseLlamada = 'preparando' | 'esperando' | 'conectando' | 'conectada' | 'reconectando' | 'pausada' | 'terminada';
export interface EstadoLlamada {
  id: string; rol: RolLlamada; titulo: string; fase: FaseLlamada; atendidoPor: string; inicio: number;
  mic: boolean; silenciado: boolean; compartiendo: boolean; remotoVideo: boolean; remotoStream: MediaStream | null;
  aviso: string; minimizada: boolean;
}

// ── Estado global (la ventana de la llamada sigue abierta aunque cambies de sección) ──
let estado: EstadoLlamada | null = null;
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
function set(p: Partial<EstadoLlamada>) { if (estado) { estado = { ...estado, ...p }; emitir(); } }
export function useLlamada(): EstadoLlamada | null {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => estado, () => null);
}
const CLAVE = 'df:llamada-soporte';
const guardar = (v: { id: string; rol: RolLlamada; titulo: string } | null) => { try { if (v) localStorage.setItem(CLAVE, JSON.stringify(v)); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };
/** Al recargar la página: la llamada que estaba abierta queda "en pausa" para reconectar con un toque. */
export function retomarGuardada(): void {
  if (estado) return;
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null') as { id: string; rol: RolLlamada; titulo: string } | null;
    if (!g?.id) return;
    void fetch(`/api/soporte/llamadas/${g.id}/senal?desde=999999999`, { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d || !['esperando', 'en_curso'].includes(d.estado)) { guardar(null); return; }
      estado = base(g.id, g.rol, g.titulo); estado.fase = 'pausada'; estado.atendidoPor = d.atendidoPor || ''; emitir();
    }).catch(() => {});
  } catch { /* nada */ }
}

const base = (id: string, rol: RolLlamada, titulo: string): EstadoLlamada => ({
  id, rol, titulo, fase: 'preparando', atendidoPor: '', inicio: 0, mic: false, silenciado: false, compartiendo: false,
  remotoVideo: false, remotoStream: null, aviso: '', minimizada: false,
});

const ICE_DEF: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

class Motor {
  pc: RTCPeerConnection | null = null;
  mic: MediaStream | null = null;
  pantalla: MediaStreamTrack | null = null;
  ice: RTCIceServer[] = ICE_DEF;
  desde = 0; gen = ''; vivo = true;
  pendientes: RTCIceCandidateInit[] = [];
  id: string; rol: RolLlamada;
  constructor(id: string, rol: RolLlamada) { this.id = id; this.rol = rol; }

  async senal(tipo: string, data: unknown) {
    try { await fetch(`/api/soporte/llamadas/${this.id}/senal`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, data }) }); } catch { /* reintenta el otro lado */ }
  }

  async arrancar() {
    try { const r = await fetch('/api/soporte/ice', { credentials: 'same-origin' }); if (r.ok) this.ice = (await r.json()).iceServers || ICE_DEF; } catch { /* STUN por defecto */ }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      set({ aviso: 'No tenemos permiso para usar tu micrófono: toca el candado junto a la dirección de la página, permite el micrófono y vuelve a conectar. Igual puedes oír y compartir pantalla.' });
    }
    if (!this.vivo) { this.mic?.getTracks().forEach((t) => t.stop()); return; }
    set({ mic: !!this.mic, fase: this.rol === 'tienda' ? 'esperando' : 'conectando' });
    if (this.rol === 'soporte') await this.ofertar(); else await this.senal('hola', null);
    void this.bucle();
  }

  nuevaPC(): RTCPeerConnection {
    try { this.pc?.close(); } catch { /* nada */ }
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const remoto = new MediaStream();
    set({ remotoStream: remoto });
    pc.onicecandidate = (e) => { if (e.candidate) void this.senal('ice', { gen: this.gen, c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { if (!remoto.getTracks().includes(e.track)) remoto.addTrack(e.track); set({ remotoStream: remoto }); };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      const s = pc.connectionState;
      if (s === 'connected') set({ fase: 'conectada', inicio: estado?.inicio || Date.now(), aviso: estado?.aviso.startsWith('No tenemos') ? estado.aviso : '' });
      else if (s === 'disconnected') set({ fase: 'reconectando' });
      else if (s === 'failed') {
        set({ fase: 'reconectando' });
        // El equipo vuelve a ofertar; la tienda pide que lo haga.
        if (this.rol === 'soporte') void this.ofertar(); else void this.senal('hola', null);
      }
    };
    this.pc = pc;
    this.pendientes = [];
    return pc;
  }

  /** Pone el micrófono y la pantalla (si se está compartiendo) en los canales de la conexión. */
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

  async ofertar() {
    this.gen = Math.random().toString(36).slice(2, 10);
    const pc = this.nuevaPC();
    await this.ponerPistas(pc, true);
    const o = await pc.createOffer();
    await pc.setLocalDescription(o);
    await this.senal('offer', { gen: this.gen, sdp: pc.localDescription });
  }

  async alRecibir(tipo: string, data: { gen?: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit; on?: boolean } | null) {
    if (tipo === 'colgar') { this.fin('La llamada terminó.'); return; }
    if (tipo === 'pantalla') { set({ remotoVideo: !!data?.on }); return; }
    if (tipo === 'hola' && this.rol === 'soporte') { await this.ofertar(); return; }
    if (tipo === 'offer' && this.rol === 'tienda' && data?.sdp) {
      this.gen = data.gen || '';
      const pc = this.nuevaPC();
      await pc.setRemoteDescription(data.sdp);
      await this.ponerPistas(pc, false);
      const a = await pc.createAnswer();
      await pc.setLocalDescription(a);
      await this.senal('answer', { gen: this.gen, sdp: pc.localDescription });
      await this.vaciarPendientes();
      if (estado?.fase !== 'conectada') set({ fase: 'conectando' });
      if (this.pantalla) void this.senal('pantalla', { on: true });
      return;
    }
    if (tipo === 'answer' && this.rol === 'soporte' && data?.sdp && data.gen === this.gen && this.pc?.signalingState === 'have-local-offer') {
      await this.pc.setRemoteDescription(data.sdp);
      await this.vaciarPendientes();
      if (this.pantalla) void this.senal('pantalla', { on: true });
      return;
    }
    if (tipo === 'ice' && data?.c && data.gen === this.gen) {
      if (this.pc?.remoteDescription) { try { await this.pc.addIceCandidate(data.c); } catch { /* candidato viejo */ } }
      else this.pendientes.push(data.c);
    }
  }
  async vaciarPendientes() {
    const l = this.pendientes; this.pendientes = [];
    for (const c of l) { try { await this.pc?.addIceCandidate(c); } catch { /* nada */ } }
  }

  async bucle() {
    while (this.vivo) {
      try {
        const r = await fetch(`/api/soporte/llamadas/${this.id}/senal?desde=${this.desde}`, { credentials: 'same-origin' });
        if (r.status === 404 || r.status === 401) { this.fin('La llamada ya no existe.'); break; }
        if (r.ok) {
          const d = await r.json() as { senales: { n: number; tipo: string; data: never }[]; ultimo: number; estado: string; atendidoPor: string };
          this.desde = Math.max(this.desde, d.ultimo);
          if (d.atendidoPor && d.atendidoPor !== estado?.atendidoPor) set({ atendidoPor: d.atendidoPor });
          if (this.rol === 'tienda' && d.estado === 'en_curso' && estado?.fase === 'esperando') set({ fase: 'conectando' });
          for (const s of d.senales) { if (!this.vivo) break; try { await this.alRecibir(s.tipo, s.data); } catch (e) { console.warn('[llamada]', e); } }
          if (['terminada', 'cancelada', 'sin_atender'].includes(d.estado) && this.vivo) this.fin(d.estado === 'sin_atender' ? 'Nadie alcanzó a atender. Inténtalo de nuevo en un rato.' : 'La llamada terminó.');
        }
      } catch { /* sin red: reintenta */ }
      await new Promise((ok) => setTimeout(ok, estado?.fase === 'conectada' ? 2500 : 1000));
    }
  }

  silenciar() {
    const s = !estado?.silenciado;
    this.mic?.getAudioTracks().forEach((t) => { t.enabled = !s; });
    set({ silenciado: s });
  }
  async compartir() {
    try {
      const st = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const t = st.getVideoTracks()[0];
      if (!t) return;
      this.pantalla = t;
      t.onended = () => void this.dejarDeCompartir();
      const tv = this.pc?.getTransceivers().find((x) => x.receiver.track.kind === 'video');
      await tv?.sender.replaceTrack(t);
      set({ compartiendo: true });
      void this.senal('pantalla', { on: true });
    } catch { /* canceló el selector de pantalla */ }
  }
  async dejarDeCompartir() {
    const tv = this.pc?.getTransceivers().find((x) => x.receiver.track.kind === 'video');
    try { await tv?.sender.replaceTrack(null); } catch { /* nada */ }
    this.pantalla?.stop(); this.pantalla = null;
    set({ compartiendo: false });
    void this.senal('pantalla', { on: false });
  }
  fin(aviso: string) {
    if (!this.vivo) return;
    this.vivo = false;
    try { this.pc?.close(); } catch { /* nada */ }
    this.mic?.getTracks().forEach((t) => t.stop());
    this.pantalla?.stop();
    guardar(null);
    set({ fase: 'terminada', aviso, compartiendo: false, remotoVideo: false });
    if (motor === this) motor = null;
  }
}

let motor: Motor | null = null;

/** Empieza (o retoma) la llamada. `titulo`: con quién se habla. */
export function iniciarLlamada(id: string, rol: RolLlamada, titulo: string): void {
  if (motor && motor.id === id && motor.vivo) { set({ minimizada: false }); return; }
  motor?.fin('');
  estado = { ...base(id, rol, titulo), atendidoPor: estado?.id === id ? estado.atendidoPor : '' };
  emitir();
  guardar({ id, rol, titulo });
  motor = new Motor(id, rol);
  void motor.arrancar();
}
/** Cuelga: avisa al otro lado y cierra la llamada en el servidor. */
export async function colgarLlamada(): Promise<void> {
  const e = estado; if (!e) return;
  motor?.fin('Colgaste la llamada.');
  if (!motor) { guardar(null); set({ fase: 'terminada', aviso: 'Colgaste la llamada.' }); }
  if (e.rol === 'tienda') await apiSoporteCancelarLlamada(e.id); else await apiAdminLlamadaAccion(e.id, 'terminar');
}
export function cerrarVentanaLlamada(): void { if (estado?.fase === 'terminada') { estado = null; emitir(); } }
export const silenciarLlamada = () => motor?.silenciar();
export const compartirPantalla = () => void motor?.compartir();
export const dejarDeCompartir = () => void motor?.dejarDeCompartir();
export const minimizarLlamada = (v: boolean) => set({ minimizada: v });
export const puedeCompartirPantalla = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;
