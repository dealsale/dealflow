/**
 * Conexión WebRTC del escritorio remoto (la usan la app de la tienda y el visor del equipo).
 * El EQUIPO DE DEALFLOW ofrece (abre el canal de control); el COMPUTADOR responde con su pantalla.
 */
import type { AccionEntrada } from './puente';

const ICE_DEF: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
async function servidoresIce(): Promise<RTCIceServer[]> {
  try { const r = await fetch('/api/soporte/ice', { credentials: 'same-origin' }); if (r.ok) return (await r.json()).iceServers || ICE_DEF; } catch { /* STUN por defecto */ }
  return ICE_DEF;
}
async function senal(id: string, tipo: string, data: unknown) {
  try { await fetch(`/api/escritorio/sesion/${id}/senal`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, data }) }); } catch { /* reintenta el otro lado */ }
}
type Datos = { sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit; gen?: string; motivo?: string } | null;
export type EstadoConexion = 'esperando' | 'conectando' | 'conectada' | 'reconectando' | 'terminada';

abstract class Base {
  pc: RTCPeerConnection | null = null; gen = ''; vivo = true; desde = 0; ice: RTCIceServer[] = ICE_DEF;
  pendientes: RTCIceCandidateInit[] = [];
  id: string; alEstado: (e: EstadoConexion, detalle?: string) => void;
  constructor(id: string, alEstado: (e: EstadoConexion, detalle?: string) => void) { this.id = id; this.alEstado = alEstado; }
  nuevaPc() {
    try { this.pc?.close(); } catch { /* nada */ }
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    pc.onicecandidate = (e) => { if (e.candidate) void senal(this.id, 'ice', { gen: this.gen, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || !this.vivo) return;
      const s = pc.connectionState;
      if (s === 'connected') this.alEstado('conectada');
      else if (s === 'disconnected' || s === 'failed') { this.alEstado('reconectando'); if (s === 'failed') this.alFallar(); }
    };
    this.pc = pc; this.pendientes = [];
    return pc;
  }
  alFallar() { /* el que ofrece vuelve a ofrecer */ }
  async ponerIce(d: Datos) {
    if (!d?.c || d.gen !== this.gen || !this.pc) return;
    if (this.pc.remoteDescription) { try { await this.pc.addIceCandidate(d.c); } catch { /* viejo */ } } else this.pendientes.push(d.c);
  }
  async vaciar() { const l = this.pendientes; this.pendientes = []; for (const c of l) { try { await this.pc?.addIceCandidate(c); } catch { /* nada */ } } }
  abstract alRecibir(tipo: string, data: Datos): Promise<void>;
  async bucle() {
    let ultVivo = Date.now();
    while (this.vivo) {
      try {
        const r = await fetch(`/api/escritorio/sesion/${this.id}/senal?desde=${this.desde}`, { credentials: 'same-origin' });
        if (r.status === 404 || r.status === 401) { this.terminar('La sesión ya no existe.'); break; }
        if (r.ok) {
          const d = await r.json() as { senales: { n: number; tipo: string; data: Datos }[]; ultimo: number; estado: string };
          this.desde = Math.max(this.desde, d.ultimo);
          for (const s of d.senales) { if (!this.vivo) break; if (s.tipo === 'fin') { this.terminar(s.data?.motivo || 'La otra parte terminó la sesión.'); break; } try { await this.alRecibir(s.tipo, s.data); } catch (e) { console.warn('[escritorio]', e); } }
          if (this.vivo && ['terminada', 'rechazada'].includes(d.estado)) this.terminar(d.estado === 'rechazada' ? 'La tienda no permitió la conexión.' : 'La sesión terminó.');
        }
      } catch { /* sin red: reintenta */ }
      if (Date.now() - ultVivo > 30_000) { ultVivo = Date.now(); void senal(this.id, 'vivo', null); }
      await new Promise((ok) => setTimeout(ok, 1000));
    }
  }
  terminar(motivo = '') {
    if (!this.vivo) return;
    this.vivo = false;
    try { this.pc?.close(); } catch { /* nada */ }
    this.alTerminar();
    this.alEstado('terminada', motivo);
  }
  alTerminar() { /* cada lado limpia lo suyo */ }
}

/** Lado del COMPUTADOR (app de la tienda): comparte la pantalla y recibe ratón y teclado. */
export class SesionComputador extends Base {
  pantalla: MediaStream | null = null;
  ofertaEnEspera: Datos = null;
  alEntrada: (a: AccionEntrada) => void;
  constructor(id: string, alEstado: (e: EstadoConexion, d?: string) => void, alEntrada: (a: AccionEntrada) => void) { super(id, alEstado); this.alEntrada = alEntrada; }
  async iniciar() {
    this.alEstado('conectando');
    this.ice = await servidoresIce();
    // Dentro de la app, la pantalla principal se elige sola (la tienda ya dio el permiso).
    this.pantalla = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    const t = this.pantalla.getVideoTracks()[0];
    if (t && 'contentHint' in t) t.contentHint = 'detail';
    t.onended = () => this.terminar('Se dejó de compartir la pantalla.');
    // Señales viejas no sirven: se arranca desde la última y se avisa «listo» para que ofrezcan.
    try { const r = await fetch(`/api/escritorio/sesion/${this.id}/senal?desde=999999999`, { credentials: 'same-origin' }); if (r.ok) this.desde = (await r.json()).ultimo || 0; } catch { /* nada */ }
    await senal(this.id, 'listo', null);
    void this.bucle();
  }
  async alRecibir(tipo: string, data: Datos) {
    if (tipo === 'offer' && data?.sdp) {
      this.gen = data.gen || '';
      const pc = this.nuevaPc();
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dc.onmessage = (m) => { try { this.alEntrada(JSON.parse(String(m.data))); } catch { /* mensaje raro */ } };
      };
      for (const t of this.pantalla?.getTracks() || []) pc.addTrack(t, this.pantalla!);
      await pc.setRemoteDescription(data.sdp);
      // Mejor nitidez del texto: más bits para la pantalla.
      for (const s of pc.getSenders()) { try { const p = s.getParameters(); p.encodings = (p.encodings?.length ? p.encodings : [{}]).map((e) => ({ ...e, maxBitrate: 2_500_000 })); await s.setParameters(p); } catch { /* no soportado */ } }
      await pc.setLocalDescription(await pc.createAnswer());
      await senal(this.id, 'answer', { gen: this.gen, sdp: pc.localDescription });
      await this.vaciar();
    } else if (tipo === 'ice') await this.ponerIce(data);
  }
  alTerminar() { this.pantalla?.getTracks().forEach((t) => t.stop()); this.pantalla = null; }
}

/** Lado del EQUIPO DE DEALFLOW: ve la pantalla y manda ratón y teclado. */
export class SesionVisor extends Base {
  dc: RTCDataChannel | null = null;
  alVideo: (s: MediaStream) => void;
  constructor(id: string, alEstado: (e: EstadoConexion, d?: string) => void, alVideo: (s: MediaStream) => void) { super(id, alEstado); this.alVideo = alVideo; }
  async iniciar() {
    this.alEstado('esperando');
    this.ice = await servidoresIce();
    void this.bucle();
  }
  async ofrecer() {
    this.gen = Math.random().toString(36).slice(2, 10);
    const pc = this.nuevaPc();
    this.dc = pc.createDataChannel('control', { ordered: true });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = (e) => this.alVideo(e.streams[0] || new MediaStream([e.track]));
    await pc.setLocalDescription(await pc.createOffer());
    await senal(this.id, 'offer', { gen: this.gen, sdp: pc.localDescription });
    this.alEstado('conectando');
  }
  alFallar() { void this.ofrecer(); }
  async alRecibir(tipo: string, data: Datos) {
    if (tipo === 'listo') await this.ofrecer();
    else if (tipo === 'answer' && data?.sdp && data.gen === this.gen && this.pc?.signalingState === 'have-local-offer') { await this.pc.setRemoteDescription(data.sdp); await this.vaciar(); }
    else if (tipo === 'ice') await this.ponerIce(data);
  }
  enviar(a: AccionEntrada) { if (this.dc?.readyState === 'open') { try { this.dc.send(JSON.stringify(a)); } catch { /* nada */ } } }
}
