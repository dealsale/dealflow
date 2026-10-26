// Worker de Cloudflare para las landings (dflw.store y dominios propios de las tiendas).
// Recibe la visita (ej. layla.dflw.store/vestido) y la pide a DealFlow diciéndole en
// X-DF-Host qué dominio visitó el cliente. Funciona en el plan gratis de Cloudflare.
const DESTINO = 'https://app.dealflow.sbs';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('X-DF-Host', url.hostname);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) headers.set('X-Forwarded-For', ip);
    const sinCuerpo = request.method === 'GET' || request.method === 'HEAD';
    return fetch(DESTINO + url.pathname + url.search, {
      method: request.method,
      headers,
      body: sinCuerpo ? undefined : request.body,
      redirect: 'manual',
    });
  },
};
