import { useEffect, useState } from 'react';

/**
 * Ventana de "procesando" que tapa la pantalla mientras se guarda o se despacha algo:
 * así nadie le da clic a otra cosa a mitad del proceso (y no se daña la remisión,
 * la guía o el guardado). Un solo estado global; cualquier componente lo enciende con
 * `enProceso(texto, fn)` y cambia el texto del paso con `set`.
 */
type Estado = { texto: string; icono: string } | null;
let estado: Estado = null;
let activos = 0;
const oyentes = new Set<(e: Estado) => void>();
const emitir = () => oyentes.forEach((f) => f(estado));

/** Icono según lo que se está haciendo. */
function iconoDe(texto: string): string {
  if (/gu[ií]a|transport/i.test(texto)) return '🚚';
  if (/remisi[oó]n|effi|dropi|despach/i.test(texto)) return '📦';
  if (/whatsapp|envi/i.test(texto)) return '💬';
  if (/consult|busc|revis|prepar|cotiz/i.test(texto)) return '🔎';
  return '💾';
}

export function procesoActivo() { return activos > 0; }

/** Abre la ventana con `texto`, corre `fn` y la cierra al terminar (aunque falle). */
export async function enProceso<T>(texto: string, fn: (set: (texto: string) => void) => Promise<T>): Promise<T> {
  activos++;
  const set = (t: string) => { estado = { texto: t, icono: iconoDe(t) }; emitir(); };
  set(texto);
  try { return await fn(set); } finally {
    activos--;
    if (!activos) { estado = null; emitir(); }
  }
}

/**
 * Para los guardados normales (req de api.ts): la ventana sale solo si tarda más de
 * un instante, así los guardados rápidos no parpadean. Si ya hay un proceso abierto,
 * no lo toca (ese ya muestra su propio paso).
 */
export function conEspera<T>(texto: string, p: Promise<T>): Promise<T> {
  if (activos) return p;
  let abierto = false;
  const t = setTimeout(() => {
    abierto = true; activos++;
    estado = { texto, icono: iconoDe(texto) }; emitir();
  }, 350);
  return p.finally(() => {
    clearTimeout(t);
    if (abierto) { activos--; if (!activos) { estado = null; emitir(); } }
  });
}

/** Texto amable según el endpoint. */
export function textoDeUrl(url: string, method: string): string | null {
  const u = url.split('?')[0];
  // Lo que se hace mientras chateas o en segundo plano no bloquea la pantalla.
  if (/\/(messages|media|webchat|push|logs|calidad|optin|auth|suscripcion|whatsapp\/qr)\b/.test(u)) return null;
  if (/\/leads\/[^/]+$/.test(u) && method === 'PATCH') return null;
  if (method === 'DELETE') return 'Eliminando…';
  if (/effi\/despachar/.test(u)) return 'Creando la remisión en Effi…';
  if (/effi\/guia|guia-manual/.test(u)) return 'Generando la guía de transporte…';
  if (/guia-enviar/.test(u)) return 'Enviándole la guía al cliente por WhatsApp…';
  if (/guia-documento|upload/.test(u)) return 'Subiendo el archivo…';
  if (/dropi\/cotizar/.test(u)) return 'Cotizando transportadoras en Dropi…';
  if (/dropi\/crear/.test(u)) return 'Creando la orden en Dropi…';
  if (/despachar\/sync|actualizar|sync|traer/.test(u)) return 'Consultando y actualizando…';
  if (/enviar-plantilla|avisar|reenviar/.test(u)) return 'Enviando por WhatsApp…';
  if (/autoconfigurar|conectar|vincular/.test(u)) return 'Conectando…';
  return 'Guardando los cambios…';
}

export function ProcesoOverlay() {
  const [e, setE] = useState<Estado>(estado);
  useEffect(() => { oyentes.add(setE); return () => { oyentes.delete(setE); }; }, []);
  // Mientras se procesa, avisa si intentan cerrar o recargar la pestaña.
  useEffect(() => {
    if (!e) return;
    const antes = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', antes);
    return () => window.removeEventListener('beforeunload', antes);
  }, [!!e]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!e) return null;
  return (
    <div role="alertdialog" aria-live="assertive" aria-busy="true"
      onClickCapture={(ev) => { ev.stopPropagation(); ev.preventDefault(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16, cursor: 'progress' }}>
      <style>{`
        @keyframes dfp-bote { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes dfp-giro { to { transform: rotate(360deg) } }
        @keyframes dfp-barra { 0% { left: -40% } 100% { left: 100% } }
        @keyframes dfp-entra { from { opacity: 0; transform: scale(.94) } to { opacity: 1; transform: none } }
      `}</style>
      <div style={{ width: 'min(360px, 100%)', background: 'var(--df-surface)', borderRadius: 18, padding: '26px 22px 20px', boxShadow: '0 24px 60px -20px rgba(15,23,42,.55)', textAlign: 'center', animation: 'dfp-entra .18s ease-out' }}>
        <div style={{ position: 'relative', width: 74, height: 74, margin: '0 auto 14px' }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid var(--df-purple-subtle, #ede9fe)', borderTopColor: 'var(--df-purple, #7c3aed)', animation: 'dfp-giro .9s linear infinite' }} />
          <span key={e.icono} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 30, animation: 'dfp-bote 1.1s ease-in-out infinite' }}>{e.icono}</span>
        </div>
        <div key={e.texto} style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--df-text-strong)', lineHeight: 1.35, animation: 'dfp-entra .2s ease-out' }}>{e.texto}</div>
        <div style={{ position: 'relative', height: 4, borderRadius: 4, background: 'var(--df-border)', overflow: 'hidden', margin: '14px 0 10px' }}>
          <span style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 4, background: 'var(--df-purple, #7c3aed)', animation: 'dfp-barra 1.2s ease-in-out infinite' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--df-text-muted)' }}>No cierres ni toques nada, ya casi termina.</div>
      </div>
    </div>
  );
}
