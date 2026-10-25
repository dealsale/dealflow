// DealFlow x Shopify — habla con DealFlow (con el código de conexión de la tienda).
const SERVIDOR = 'https://app.dealflow.sbs';

async function config() {
  const c = await chrome.storage.sync.get(['codigo', 'servidor']);
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

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg && msg.tipo === 'enviar') { llamar('/api/ext/shopify/pedido', 'POST', msg.datos).then(responder); return true; }
  if (msg && msg.tipo === 'yo') { llamar('/api/ext/yo', 'GET').then(responder); return true; }
  return false;
});
