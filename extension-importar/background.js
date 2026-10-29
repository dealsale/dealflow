// DealFlow · Importar productos — habla con DealFlow (con el código de conexión de la tienda)
// y descarga los archivos del producto (fotos, videos, audios) para subirlos a DealFlow.
const api = globalThis.browser || globalThis.chrome;
const SERVIDOR = 'https://app.dealflow.sbs';
const MAX_MB = 20;

async function config() {
  const c = await api.storage.sync.get(['codigo', 'servidor']);
  return { codigo: c.codigo || '', servidor: (c.servidor || SERVIDOR).replace(/\/+$/, '') };
}

async function llamar(ruta, metodo, cuerpo) {
  const { codigo, servidor } = await config();
  if (!codigo) return { error: 'Falta el código de conexión: haz clic en el ícono de DealFlow (arriba a la derecha) y pégalo.' };
  try {
    const r = await fetch(servidor + ruta, {
      method: metodo,
      headers: { Authorization: 'Bearer ' + codigo, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || 'DealFlow respondió ' + r.status };
    return { ...j, servidor };
  } catch (e) {
    return { error: 'No pudimos hablar con DealFlow. Revisa tu conexión.' };
  }
}

// ArrayBuffer → base64 por tramos (en el service worker no hay FileReader).
function base64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Descarga un archivo del otro bot (con la sesión del navegador) y lo sube a DealFlow. */
async function subir(url, nombre, dataUrl) {
  try {
    let datos = dataUrl;
    if (!datos) {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return { error: 'No se pudo descargar (' + r.status + ')' };
      const buf = await r.arrayBuffer();
      if (buf.byteLength > MAX_MB * 1024 * 1024) return { error: 'Pesa más de ' + MAX_MB + ' MB' };
      const tipo = (r.headers.get('content-type') || 'application/octet-stream').split(';')[0];
      datos = 'data:' + tipo + ';base64,' + base64(buf);
    }
    return await llamar('/api/ext/importar/subir', 'POST', { dataUrl: datos, nombre: nombre || '' });
  } catch (e) {
    return { error: 'No se pudo descargar el archivo.' };
  }
}

api.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (!msg) return false;
  if (msg.tipo === 'yo') { llamar('/api/ext/yo', 'GET').then(responder); return true; }
  if (msg.tipo === 'subir') { subir(msg.url, msg.nombre, msg.dataUrl).then(responder); return true; }
  if (msg.tipo === 'producto') { llamar('/api/ext/importar/producto', 'POST', msg.datos).then(responder); return true; }
  return false;
});
