/**
 * Embedded Signup de Meta: abre el popup de Facebook para que el dueño de la
 * tienda elija su cuenta de WhatsApp Business y su número. Meta nos devuelve,
 * por dos vías distintas, las dos piezas que necesita el servidor:
 *   · el `code` de autorización (callback de FB.login)
 *   · el waba_id y phone_number_id (evento postMessage WA_EMBEDDED_SIGNUP)
 * Esta función espera a que lleguen ambas y las entrega juntas.
 */

interface AuthResponse { code?: string }
interface FbSdk {
  init(o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: { authResponse?: AuthResponse }) => void, o: Record<string, unknown>): void;
}
declare global {
  interface Window { FB?: FbSdk; fbAsyncInit?: () => void }
}

const SDK_URL = 'https://connect.facebook.net/es_LA/sdk.js';
const VERSION = 'v20.0';

let cargando: Promise<FbSdk> | null = null;

function cargarSdk(appId: string): Promise<FbSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  if (cargando) return cargando;
  cargando = new Promise<FbSdk>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Facebook tardó demasiado en responder. Revisa tu conexión e intenta de nuevo.')), 15000);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: true, version: VERSION });
      clearTimeout(t);
      resolve(window.FB!);
    };
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => { clearTimeout(t); cargando = null; reject(new Error('No pudimos cargar Facebook. Si tienes un bloqueador de anuncios, desactívalo e intenta de nuevo.')); };
    document.body.appendChild(s);
  });
  return cargando;
}

/**
 * Login normal con Facebook pidiendo permisos concretos (lo usa el
 * Administrador de anuncios). Devuelve el código para que el servidor lo
 * canjee por el token del negocio.
 */
export async function abrirLoginMeta(appId: string, permisos: string[]): Promise<string> {
  const FB = await cargarSdk(appId);
  return new Promise<string>((resolve, reject) => {
    FB.login(
      (r) => {
        const code = r.authResponse?.code;
        if (!code) return reject(new Error('No autorizaste la conexión con Facebook.'));
        resolve(code);
      },
      { scope: permisos.join(','), response_type: 'code', override_default_response_type: true },
    );
  });
}

export interface DatosSignup { code: string; wabaId: string; phoneNumberId: string }

export async function abrirSignupMeta(appId: string, configId: string): Promise<DatosSignup> {
  const FB = await cargarSdk(appId);

  return new Promise<DatosSignup>((resolve, reject) => {
    let code = '';
    let wabaId = '';
    let phoneNumberId = '';
    let listo = false;

    const terminar = () => {
      // Solo cuando tenemos las dos piezas (llegan en orden impredecible).
      if (listo || !code || !phoneNumberId) return;
      listo = true;
      window.removeEventListener('message', onMessage);
      resolve({ code, wabaId, phoneNumberId });
    };
    const fallar = (msg: string) => {
      if (listo) return;
      listo = true;
      window.removeEventListener('message', onMessage);
      reject(new Error(msg));
    };

    function onMessage(ev: MessageEvent) {
      if (typeof ev.origin !== 'string' || !/(^|\.)facebook\.com$/.test(new URL(ev.origin).hostname)) return;
      let data: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string } };
      try { data = JSON.parse(String(ev.data)); } catch { return; }
      if (data.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
        wabaId = data.data?.waba_id || '';
        phoneNumberId = data.data?.phone_number_id || '';
        terminar();
      } else if (data.event === 'CANCEL') {
        fallar('Cerraste la ventana de Facebook antes de terminar.');
      } else if (data.event === 'ERROR') {
        fallar('Facebook reportó un error durante la conexión. Intenta de nuevo.');
      }
    }
    window.addEventListener('message', onMessage);

    FB.login(
      (r) => {
        if (!r.authResponse?.code) return fallar('No autorizaste la conexión con Facebook.');
        code = r.authResponse.code;
        terminar();
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      },
    );
  });
}
