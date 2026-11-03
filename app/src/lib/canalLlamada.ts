/**
 * Comunicación entre las pestañas de DealFlow (y la ventana aparte de la llamada).
 *  - Solo UNA pestaña lleva la llamada (la «dueña»): escribe un latido en localStorage.
 *  - Las demás muestran «Llamada en otra ventana · Traer aquí».
 *  - Con la ventana aparte, el control remoto se ejecuta en la pestaña de DealFlow (la que
 *    la tienda comparte), no en la ventanita: los clics viajan por este canal.
 */
const rnd = () => Math.random().toString(36).slice(2, 10);
export const ES_APARTE = typeof window !== 'undefined' && /^\/llamada(\/|$)/.test(window.location.pathname);

/** Identidad de esta pestaña (sobrevive a recargas: sessionStorage es por pestaña). */
export const TAB: string = (() => {
  if (typeof window === 'undefined') return '';
  if (ES_APARTE) return 'v-' + rnd();
  try {
    let t = sessionStorage.getItem('df-tab');
    if (!t || t.startsWith('v-')) { t = 't-' + rnd(); sessionStorage.setItem('df-tab', t); }
    return t;
  } catch { return 't-' + rnd(); }
})();
/** En la ventana aparte: la pestaña que la abrió (a la que vuelve la llamada al cerrarla). */
export const DEVOLVER_A = ES_APARTE && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('de') || '' : '';

export const canal: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('df-llamada') : null;
const oyentes = new Set<(m: Record<string, unknown>) => void>();
if (canal) canal.onmessage = (e) => { const m = e.data as Record<string, unknown>; if (m && typeof m === 'object') oyentes.forEach((f) => { try { f(m); } catch (err) { console.warn('[canal]', err); } }); };
export function alCanal(f: (m: Record<string, unknown>) => void): () => void { oyentes.add(f); return () => oyentes.delete(f); }
export function avisarCanal(m: Record<string, unknown>): void { try { canal?.postMessage({ ...m, desdeTab: TAB }); } catch { /* sin canal */ } }

const LATIDO = 'df:llamada-latido';
export interface Latido { tab: string; t: number; aparte: boolean }
export function latir(): void { try { localStorage.setItem(LATIDO, JSON.stringify({ tab: TAB, t: Date.now(), aparte: ES_APARTE } satisfies Latido)); } catch { /* sin almacenamiento */ } }
export function soltarLatido(): void { try { const g = JSON.parse(localStorage.getItem(LATIDO) || 'null') as Latido | null; if (g?.tab === TAB) localStorage.removeItem(LATIDO); } catch { /* nada */ } }
/** Otra pestaña (o la ventana aparte) lleva la llamada ahora mismo. */
export function latidoAjeno(): Latido | null {
  try {
    const g = JSON.parse(localStorage.getItem(LATIDO) || 'null') as Latido | null;
    return g && g.tab !== TAB && Date.now() - g.t < 4500 ? g : null;
  } catch { return null; }
}
