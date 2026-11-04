/**
 * «Pestaña de otra tienda».
 *
 * La sesión (la cookie) es una sola para todas las pestañas del navegador. Si en una pestaña
 * se entra a la tienda B, otra pestaña que sigue mostrando la tienda A guardaría sus cambios
 * en B sin darse cuenta (así se encendieron opciones en tiendas equivocadas).
 *
 * Cada pestaña recuerda la tienda con la que cargó y la manda en cada petición (X-DF-Tienda).
 * El servidor no guarda nada si no coincide con la de la sesión (409), y cualquier respuesta
 * que diga que la sesión ya es de otra tienda muestra el aviso de recargar.
 * Entrar, salir o cambiar de tienda DESDE esta pestaña la pasa a la nueva tienda.
 */
let tienda: string | null = null; // null = todavía no sabemos (primera respuesta)
let aviso: HTMLDivElement | null = null;

const esApi = (url: string) => {
  try { const u = new URL(url, location.href); return u.origin === location.origin && u.pathname.startsWith('/api/'); } catch { return false; }
};

function mostrarAviso() {
  if (aviso || typeof document === 'undefined') return;
  aviso = document.createElement('div');
  aviso.setAttribute('role', 'alertdialog');
  aviso.setAttribute('aria-label', 'Esta pestaña es de otra tienda');
  aviso.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(10,15,30,.55);display:grid;place-items:center;padding:16px;font-family:inherit';
  aviso.innerHTML = '<div style="background:#fff;color:#0f172a;max-width:420px;border-radius:16px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:grid;gap:12px">'
    + '<div style="font-size:18px;font-weight:800">Esta pestaña es de otra tienda</div>'
    + '<div style="font-size:14.5px;line-height:1.5;color:#334155">En otra pestaña entraste a una tienda distinta. Para no guardar cambios en la tienda equivocada, recarga esta página: quedará en la tienda que tienes abierta ahora.</div>'
    + '<button type="button" style="border:0;border-radius:10px;padding:11px 14px;font:inherit;font-weight:800;background:#0f9b6c;color:#fff;cursor:pointer">Recargar</button></div>';
  aviso.querySelector('button')!.addEventListener('click', () => location.reload());
  document.body.appendChild(aviso);
}

export function instalarPestanaTienda() {
  if (typeof window === 'undefined' || (window as unknown as { __dfPestana?: boolean }).__dfPestana) return;
  (window as unknown as { __dfPestana?: boolean }).__dfPestana = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!esApi(url)) return original(input, init);
    let init2 = init;
    if (tienda !== null) {
      const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      h.set('X-DF-Tienda', tienda);
      init2 = { ...init, headers: h };
    }
    const r = await original(input, init2);
    const cambio = r.headers.get('X-DF-Tienda-Cambio');
    const sesion = r.headers.get('X-DF-Sesion-Tienda');
    if (cambio !== null) { tienda = cambio; }                    // esta pestaña entró/salió/cambió de tienda
    else if (sesion !== null) {
      if (tienda === null) tienda = sesion;                       // primera respuesta: la tienda de esta pestaña
      else if (sesion !== tienda) mostrarAviso();                 // la sesión ya es de otra tienda
    }
    if (r.status === 409 && !r.bodyUsed) {
      void r.clone().json().then((b: { otraTienda?: boolean }) => { if (b?.otraTienda) mostrarAviso(); }).catch(() => {});
    }
    return r;
  };
}
