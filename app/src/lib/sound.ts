let ctx: AudioContext | null = null;
let audio: HTMLAudioElement | null = null;

/**
 * Sonido de notificación (pedido nuevo): el sonido de DealFlow
 * (/sonidos/nueva-venta.mp3). Si el archivo no carga o el navegador aún no deja
 * reproducir audio, cae al timbre sintetizado de dos notas.
 */
export function playOrderChime() {
  try {
    audio = audio || new Audio('/sonidos/nueva-venta.mp3');
    audio.currentTime = 0;
    audio.volume = 0.8;
    void audio.play().catch(() => timbre());
  } catch { timbre(); }
}

/** Timbre de respaldo (La5 → Re6) sintetizado con Web Audio. */
function timbre() {
  try {
    ctx = ctx || new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const notas: [number, number][] = [
      [880, 0],
      [1174.66, 0.13],
    ];
    for (const [freq, dt] of notas) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + dt);
      gain.gain.linearRampToValueAtTime(0.16, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.6);
    }
  } catch {
    // Sin audio disponible: la notificación visual sigue funcionando.
  }
}
