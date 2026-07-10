let ctx: AudioContext | null = null;

/**
 * Timbre de dos notas (La5 → Re6) para el pedido nuevo, sintetizado con
 * Web Audio: no depende de archivos externos. Si el navegador aún no
 * permite audio (falta interacción del usuario), falla en silencio.
 */
export function playOrderChime() {
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
