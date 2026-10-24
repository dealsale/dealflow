/**
 * Canje del acceso que entrega la ventana de Facebook (Login for Business) por un
 * token de usuario de LARGA duración (~60 días).
 *
 * - Lo normal: el SDK entrega un `accessToken` corto y aquí se cambia por uno largo con
 *   `fb_exchange_token` (solo funciona con tokens de NUESTRA app: sirve de validación).
 * - Si llega un `code` (flujo viejo), se canjea; Meta a veces exige el mismo redirect_uri
 *   del diálogo, que con el SDK de JavaScript es interno: se reintenta con redirect_uri vacío.
 */
const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

export interface AccesoMeta { code?: string; accessToken?: string }

async function pedir(url: string): Promise<{ token?: string; error?: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const b = (await r.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
    return b.access_token ? { token: b.access_token } : { error: b.error?.message || `Meta respondió ${r.status}.` };
  } catch {
    return { error: 'No pudimos hablar con Meta.' };
  }
}

export async function canjearAcceso(a: AccesoMeta): Promise<{ token: string } | { error: string }> {
  const appId = process.env.META_APP_ID || '';
  const secret = process.env.META_APP_SECRET || '';
  if (!appId || !secret) return { error: 'Falta configurar META_APP_ID / META_APP_SECRET en el servidor.' };
  const base = `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(secret)}`;
  if (a.accessToken) {
    const r = await pedir(`${base}&grant_type=fb_exchange_token&fb_exchange_token=${encodeURIComponent(a.accessToken)}`);
    return r.token ? { token: r.token } : { error: r.error || 'Meta no validó el acceso. Intenta conectar de nuevo.' };
  }
  if (a.code) {
    const c = `&code=${encodeURIComponent(a.code)}`;
    let r = await pedir(base + c);
    if (!r.token && /redirect_uri/i.test(r.error || '')) r = await pedir(`${base}&redirect_uri=${c}`);
    if (!r.token) return { error: /redirect_uri/i.test(r.error || '') ? 'Meta no aceptó el código de la ventana de Facebook. Recarga la página (Ctrl+F5) y vuelve a conectar.' : r.error || 'No pudimos validar el acceso con Meta.' };
    // El token del code también se alarga, por si vino corto.
    const largo = await pedir(`${base}&grant_type=fb_exchange_token&fb_exchange_token=${encodeURIComponent(r.token)}`);
    return { token: largo.token || r.token };
  }
  return { error: 'Falta la autorización de Facebook.' };
}
