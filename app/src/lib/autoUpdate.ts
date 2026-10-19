/**
 * Actualización automática: nadie debería tener que hundir Ctrl+Shift+R.
 *
 * Cada pocos minutos (y al volver a la pestaña) pedimos el index.html sin caché
 * y comparamos el archivo principal (/assets/index-<huella>.js) con el que está
 * corriendo. Si cambió, hay versión nueva: se recarga sola en un momento seguro
 * (al volver a la pestaña, o tras un rato sin escribir) y mientras tanto se
 * muestra un aviso con "Actualizar ahora".
 */
const INTERVALO = 4 * 60 * 1000;
const scriptActual = () => (document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null)?.getAttribute('src') || '';

let hayNueva = false;
let ultimaActividad = Date.now();

function recargar() {
  try { sessionStorage.setItem('df-actualizado', '1'); } catch { /* modo privado */ }
  location.reload();
}
function escribiendo(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}
function aviso() {
  if (document.getElementById('df-update')) return;
  const el = document.createElement('div');
  el.id = 'df-update';
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:14px;background:#0b1024;color:#eef3ff;border:1px solid rgba(110,140,255,.45);box-shadow:0 18px 44px rgba(0,0,0,.45);font:600 13px Inter,system-ui,sans-serif';
  el.innerHTML = '<span>✨ Hay una versión nueva de DealFlow</span><button type="button" style="border:none;border-radius:999px;padding:8px 14px;font:700 12.5px Inter,system-ui,sans-serif;color:#fff;cursor:pointer;background:linear-gradient(120deg,#10b981,#2e8bff 50%,#7658ff)">Actualizar ahora</button>';
  el.querySelector('button')!.addEventListener('click', recargar);
  document.body.appendChild(el);
}
async function revisar() {
  const actual = scriptActual();
  if (!actual || hayNueva) return;
  try {
    const r = await fetch('/entrar', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return;
    const html = await r.text();
    const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/);
    if (m && m[1] !== actual) { hayNueva = true; aviso(); }
  } catch { /* sin red: se reintenta luego */ }
}

export function iniciarAutoActualizacion() {
  if (import.meta.env.DEV) return;
  // Si un archivo de la versión vieja ya no existe (tras un despliegue), recargamos.
  window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recargar(); });
  ['keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, () => { ultimaActividad = Date.now(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (hayNueva) recargar(); else void revisar();
  });
  setInterval(() => {
    if (hayNueva) { if (!escribiendo() && Date.now() - ultimaActividad > 90_000) recargar(); return; }
    void revisar();
  }, INTERVALO);
  setTimeout(() => void revisar(), 30_000);
}
