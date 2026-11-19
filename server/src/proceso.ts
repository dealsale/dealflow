import { spawn } from 'node:child_process';

/**
 * Corre un programa externo (ffmpeg, ffprobe…) SIN bloquear el servidor.
 *
 * `spawnSync` congelaba todo el proceso de Node mientras ffmpeg codificaba: WhatsApp, los
 * webhooks y el panel de todas las tiendas se quedaban esperando. Esto devuelve lo mismo que
 * usábamos de `spawnSync` (status, stdout, stderr) pero como promesa.
 */
export interface Resultado { status: number | null; stdout: string; stderr: string }

const MAX_SALIDA = 1024 * 1024; // lo que se guarda de stdout/stderr (ffmpeg puede ser muy hablador)

export function correr(cmd: string, args: string[], timeout = 180_000): Promise<Resultado> {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', listo = false;
    const fin = (status: number | null) => { if (listo) return; listo = true; clearTimeout(reloj); resolve({ status, stdout, stderr }); };
    let hijo: ReturnType<typeof spawn>;
    try {
      hijo = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ status: null, stdout: '', stderr: String((e as Error)?.message || e) });
      return;
    }
    const reloj = setTimeout(() => { try { hijo.kill('SIGKILL'); } catch { /* ya terminó */ } fin(null); }, timeout);
    hijo.stdout?.on('data', (d: Buffer) => { if (stdout.length < MAX_SALIDA) stdout += d.toString('utf8'); });
    hijo.stderr?.on('data', (d: Buffer) => { if (stderr.length < MAX_SALIDA) stderr += d.toString('utf8'); });
    hijo.on('error', (e) => { stderr += String(e?.message || e); fin(null); });
    hijo.on('close', (code) => fin(code));
  });
}

/** ffmpeg con las opciones de siempre (sin banner, solo errores, sobrescribir). */
export const ffmpeg = (args: string[], timeout = 180_000) => correr('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], timeout);

/** Duración en segundos con ffprobe (0 si no se pudo leer). */
export async function duracionMedia(archivo: string): Promise<number> {
  const r = await correr('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo], 20_000);
  return Number(r.stdout.trim()) || 0;
}

/** ¿El archivo tiene pista de audio? */
export async function tieneAudioMedia(archivo: string): Promise<boolean> {
  const r = await correr('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', archivo], 20_000);
  return r.stdout.trim().length > 0;
}
