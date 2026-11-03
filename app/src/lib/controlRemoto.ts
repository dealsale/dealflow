/**
 * Control remoto (opción A): el equipo de DealFlow hace clic, escribe y se desplaza DENTRO
 * de DealFlow en la pantalla de la tienda, con su permiso.
 *
 * Aquí está el lado de la TIENDA: recibe las acciones (coordenadas de 0 a 1 sobre la pestaña
 * compartida) y las ejecuta en la página. Muestra el puntero de quien controla y un aviso fijo
 * con «Quitar control». Nunca toca: campos de contraseña, archivos, ni nada marcado con
 * data-df-no-remoto (la ventana de la llamada, este aviso, el permiso).
 */
import { ES_APARTE, TAB, alCanal, avisarCanal } from './canalLlamada';

export type AccionControl =
  | { t: 'm'; x: number; y: number }
  | { t: 'c'; x: number; y: number; b?: number; n?: number }
  | { t: 'w'; x: number; y: number; dx: number; dy: number }
  | { t: 'k'; key: string; code?: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }
  | { t: 'txt'; s: string };

let quien = '';
let quitarLocal: (() => void) | null = null;
/** El motor de la llamada (si está en esta pestaña) registra cómo se quita el control. */
export function alQuitarControl(f: (() => void) | null) { quitarLocal = f; }

// ── Puntero y aviso en pantalla ─────────────────────────────────────────
let puntero: HTMLDivElement | null = null;
let aviso: HTMLDivElement | null = null;
function montar() {
  if (typeof document === 'undefined') return;
  if (!puntero) {
    puntero = document.createElement('div');
    puntero.setAttribute('data-df-no-remoto', '');
    puntero.setAttribute('aria-hidden', 'true');
    puntero.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;transform:translate(-100px,-100px);transition:transform 60ms linear';
    puntero.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#F97316" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span style="position:absolute;left:18px;top:18px;white-space:nowrap;background:#F97316;color:#fff;font:700 11px system-ui,sans-serif;padding:2px 7px;border-radius:6px"></span>';
    document.body.appendChild(puntero);
  }
  (puntero.querySelector('span') as HTMLSpanElement).textContent = quien || 'Soporte DealFlow';
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.setAttribute('data-df-no-remoto', '');
    aviso.setAttribute('role', 'status');
    aviso.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:8px 8px 8px 14px;border-radius:999px;background:#7C2D12;color:#fff;font:700 13px system-ui,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.6)';
    aviso.innerHTML = '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span><button type="button" style="flex:0 0 auto;border:0;border-radius:999px;padding:7px 12px;background:#fff;color:#7C2D12;font:800 12.5px system-ui,sans-serif;cursor:pointer">Quitar control</button>';
    aviso.querySelector('button')!.addEventListener('click', () => { if (quitarLocal) quitarLocal(); else avisarCanal({ t: 'quitar-control' }); terminarEjecucion(); });
    document.body.appendChild(aviso);
  }
  (aviso.querySelector('span') as HTMLSpanElement).textContent = `🖱 ${quien || 'Soporte DealFlow'} está controlando DealFlow`;
}
export function terminarEjecucion() {
  puntero?.remove(); puntero = null;
  aviso?.remove(); aviso = null;
  quien = '';
}
function marca(x: number, y: number, bien: boolean) {
  const d = document.createElement('div');
  d.setAttribute('data-df-no-remoto', '');
  d.style.cssText = `position:fixed;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;border:3px solid ${bien ? '#F97316' : '#DC2626'};z-index:2147483646;pointer-events:none;opacity:.9;transition:transform .35s ease-out,opacity .35s ease-out`;
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.transform = 'scale(1.8)'; d.style.opacity = '0'; });
  setTimeout(() => d.remove(), 420);
}

// ── Qué se puede tocar ──────────────────────────────────────────────────
const bloqueado = (el: Element | null): boolean => {
  if (!el) return true;
  if (el.closest('[data-df-no-remoto]')) return true;
  if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'file')) return true;
  return false;
};
const esCampo = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden'].includes(el.type))) && !el.disabled && !el.readOnly;
const enfocable = (el: Element): HTMLElement | null => el.closest('input,textarea,select,button,a[href],[tabindex]:not([tabindex="-1"]),[contenteditable="true"],[contenteditable=""]') as HTMLElement | null;
const enPantalla = (x: number, y: number) => ({ px: Math.max(0, Math.min(window.innerWidth - 1, x * window.innerWidth)), py: Math.max(0, Math.min(window.innerHeight - 1, y * window.innerHeight)) });

let ultimoEncima: Element | null = null;
function mover(x: number, y: number) {
  const { px, py } = enPantalla(x, y);
  if (puntero) puntero.style.transform = `translate(${px}px,${py}px)`;
  const el = document.elementFromPoint(px, py);
  if (!el || bloqueado(el)) return;
  const o = { bubbles: true, cancelable: true, composed: true, clientX: px, clientY: py, view: window };
  if (el !== ultimoEncima) { ultimoEncima?.dispatchEvent(new MouseEvent('mouseout', o)); el.dispatchEvent(new MouseEvent('mouseover', o)); ultimoEncima = el; }
  el.dispatchEvent(new PointerEvent('pointermove', { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousemove', o));
}

function clic(x: number, y: number, boton = 0, veces = 1) {
  const { px, py } = enPantalla(x, y);
  if (puntero) puntero.style.transform = `translate(${px}px,${py}px)`;
  const el = document.elementFromPoint(px, py);
  if (!el || bloqueado(el)) { marca(px, py, false); return; }
  marca(px, py, true);
  const o = { bubbles: true, cancelable: true, composed: true, clientX: px, clientY: py, button: boton, buttons: boton === 2 ? 2 : 1, view: window, detail: veces };
  const pe = { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', pe));
  el.dispatchEvent(new MouseEvent('mousedown', o));
  const f = enfocable(el);
  if (f && !bloqueado(f)) {
    f.focus({ preventScroll: true });
    if (esCampo(f) && document.activeElement === f) { try { const n = f.value.length; f.setSelectionRange(n, n); } catch { /* tipo sin selección */ } }
  } else (document.activeElement as HTMLElement | null)?.blur?.();
  el.dispatchEvent(new PointerEvent('pointerup', { ...pe, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
  if (boton === 2) { el.dispatchEvent(new MouseEvent('contextmenu', o)); return; }
  el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
  if (veces >= 2) {
    el.dispatchEvent(new MouseEvent('dblclick', { ...o, buttons: 0, detail: 2 }));
    if (esCampo(f)) { try { f.select(); } catch { /* nada */ } }
  }
}

function rueda(x: number, y: number, dx: number, dy: number) {
  const { px, py } = enPantalla(x, y);
  let el = document.elementFromPoint(px, py) as HTMLElement | null;
  if (el && bloqueado(el)) return;
  while (el && el !== document.body && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    const yOk = dy && /(auto|scroll|overlay)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const xOk = dx && /(auto|scroll|overlay)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (yOk || xOk) { el.scrollBy({ left: xOk ? dx : 0, top: yOk ? dy : 0 }); return; }
    el = el.parentElement;
  }
  (document.scrollingElement || document.documentElement).scrollBy({ left: dx, top: dy });
}

/** Escribe en un campo como si fuera el teclado (React se entera del cambio). */
function insertar(el: Element, texto: string) {
  if (esCampo(el)) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    let ini = el.value.length; let fin = ini;
    try { ini = el.selectionStart ?? ini; fin = el.selectionEnd ?? ini; } catch { /* sin selección (email, número) */ }
    const max = el.maxLength > 0 ? el.maxLength : Infinity;
    const nuevo = (el.value.slice(0, ini) + texto + el.value.slice(fin)).slice(0, max);
    setter?.call(el, nuevo);
    try { el.setSelectionRange(ini + texto.length, ini + texto.length); } catch { /* nada */ }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto, inputType: 'insertText' }));
    return;
  }
  if ((el as HTMLElement).isContentEditable) document.execCommand('insertText', false, texto);
}
function borrar(el: Element, hacia: -1 | 1, palabra = false) {
  if (!esCampo(el)) { if ((el as HTMLElement).isContentEditable) document.execCommand(hacia < 0 ? 'delete' : 'forwardDelete'); return; }
  const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set;
  let ini = el.value.length; let fin = ini;
  try { ini = el.selectionStart ?? ini; fin = el.selectionEnd ?? ini; } catch { /* nada */ }
  if (ini === fin) {
    if (hacia < 0) { if (!ini) return; ini = palabra ? el.value.slice(0, ini).replace(/\S+\s*$/, '').length : ini - 1; }
    else { if (fin >= el.value.length) return; fin += 1; }
  }
  setter?.call(el, el.value.slice(0, ini) + el.value.slice(fin));
  try { el.setSelectionRange(ini, ini); } catch { /* nada */ }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: hacia < 0 ? 'deleteContentBackward' : 'deleteContentForward' }));
}
function moverCursor(el: HTMLInputElement | HTMLTextAreaElement, d: number, extremo?: 'ini' | 'fin') {
  try {
    const p = extremo === 'ini' ? 0 : extremo === 'fin' ? el.value.length : Math.max(0, Math.min(el.value.length, (el.selectionStart ?? 0) + d));
    el.setSelectionRange(p, p);
  } catch { /* nada */ }
}
function siguienteFoco(atras: boolean) {
  const todos = [...document.querySelectorAll<HTMLElement>('input,textarea,select,button,a[href],[tabindex]:not([tabindex="-1"])')]
    .filter((e) => !(e as HTMLInputElement).disabled && e.offsetParent !== null && !bloqueado(e));
  if (!todos.length) return;
  const i = todos.indexOf(document.activeElement as HTMLElement);
  const j = i < 0 ? 0 : (i + (atras ? -1 : 1) + todos.length) % todos.length;
  todos[j].focus();
}

function tecla(k: Extract<AccionControl, { t: 'k' }>) {
  const a = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  if (bloqueado(a) && a !== document.body) return;
  const init = { key: k.key, code: k.code || '', ctrlKey: !!k.ctrl, shiftKey: !!k.shift, altKey: !!k.alt, metaKey: !!k.meta, bubbles: true, cancelable: true, composed: true };
  const sigue = a.dispatchEvent(new KeyboardEvent('keydown', init));
  if (sigue) {
    const mod = k.ctrl || k.meta;
    if (esCampo(a) || (a as HTMLElement).isContentEditable) {
      if (mod && k.key.toLowerCase() === 'a' && esCampo(a)) a.select();
      else if (mod && k.key === 'Backspace') borrar(a, -1, true);
      else if (!mod && !k.alt && k.key.length === 1) insertar(a, k.key);
      else if (k.key === 'Backspace') borrar(a, -1);
      else if (k.key === 'Delete') borrar(a, 1);
      else if (k.key === 'Enter') {
        if (a instanceof HTMLTextAreaElement || (a as HTMLElement).isContentEditable) insertar(a, '\n');
        else (a as HTMLInputElement).form?.requestSubmit();
      }
      else if (esCampo(a) && k.key === 'ArrowLeft') moverCursor(a, -1);
      else if (esCampo(a) && k.key === 'ArrowRight') moverCursor(a, 1);
      else if (esCampo(a) && k.key === 'Home') moverCursor(a, 0, 'ini');
      else if (esCampo(a) && k.key === 'End') moverCursor(a, 0, 'fin');
      else if (k.key === 'Tab') siguienteFoco(!!k.shift);
    } else if (a instanceof HTMLSelectElement && (k.key === 'ArrowDown' || k.key === 'ArrowUp')) {
      const i = Math.max(0, Math.min(a.options.length - 1, a.selectedIndex + (k.key === 'ArrowDown' ? 1 : -1)));
      if (i !== a.selectedIndex) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(a, a.options[i].value);
        a.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (k.key === 'Tab') siguienteFoco(!!k.shift);
    else if ((k.key === 'Enter' || k.key === ' ') && (a instanceof HTMLButtonElement || a instanceof HTMLAnchorElement || (a instanceof HTMLInputElement && ['checkbox', 'radio', 'button', 'submit'].includes(a.type)))) (a as HTMLElement).click();
    else if (k.key === 'PageDown' || k.key === 'PageUp' || k.key === 'ArrowDown' || k.key === 'ArrowUp') {
      const d = k.key === 'PageDown' ? window.innerHeight * 0.85 : k.key === 'PageUp' ? -window.innerHeight * 0.85 : k.key === 'ArrowDown' ? 60 : -60;
      rueda(0.5, 0.5, 0, d);
    }
  }
  a.dispatchEvent(new KeyboardEvent('keyup', init));
}

/** Ejecuta una acción del equipo en esta página. */
export function ejecutar(m: AccionControl, nombre: string) {
  if (typeof document === 'undefined') return;
  if (quien !== nombre || !aviso) { quien = nombre; montar(); }
  try {
    if (m.t === 'm') mover(m.x, m.y);
    else if (m.t === 'c') clic(m.x, m.y, m.b || 0, m.n || 1);
    else if (m.t === 'w') rueda(m.x, m.y, m.dx, m.dy);
    else if (m.t === 'k') tecla(m);
    else if (m.t === 'txt') {
      const a = document.activeElement;
      if (a && !bloqueado(a)) insertar(a, String(m.s || '').slice(0, 2000));
    }
  } catch (e) { console.warn('[control remoto]', e); }
}

/** Tamaño de esta pestaña (para saber si lo que se comparte es esta pestaña y apuntar bien). */
export const vistaLocal = () => ({ w: window.innerWidth, h: window.innerHeight });

// En las pestañas normales: recibe las acciones que llegan por la ventana aparte de la llamada.
if (typeof window !== 'undefined' && !ES_APARTE) {
  const contarVista = () => avisarCanal({ t: 'vista', tab: TAB, ...vistaLocal(), visible: document.visibilityState === 'visible', foco: document.hasFocus() });
  alCanal((m) => {
    if (m.t === 'ctl' && m.para === TAB) ejecutar(m.m as AccionControl, String(m.quien || ''));
    else if (m.t === 'ctl-fin' && (m.para === TAB || !m.para)) terminarEjecucion();
    else if (m.t === 'quien-vista') contarVista();
  });
  window.addEventListener('resize', contarVista);
  document.addEventListener('visibilitychange', contarVista);
  window.addEventListener('focus', contarVista);
  setTimeout(contarVista, 500);
}
