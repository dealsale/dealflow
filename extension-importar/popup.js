const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
const estado = (t, ok) => { $('estado').textContent = t; $('estado').className = ok ? 'ok' : 'err'; };
// Firefox (browser.*) responde con promesas; Chrome (chrome.*) con callback.
const enviar = (msg) => (globalThis.browser ? api.runtime.sendMessage(msg) : new Promise((ok) => api.runtime.sendMessage(msg, ok)));

api.storage.sync.get(['codigo', 'servidor']).then((c) => {
  $('codigo').value = c.codigo || '';
  $('servidor').value = c.servidor || '';
  if (c.codigo) probar();
});

async function probar() {
  estado('Probando…', true);
  const r = await enviar({ tipo: 'yo' });
  if (!r || r.error) estado('⚠️ ' + ((r && r.error) || 'No se pudo conectar.'), false);
  else estado('✅ Conectado a la tienda: ' + r.tienda, true);
}

$('guardar').addEventListener('click', async () => {
  await api.storage.sync.set({ codigo: $('codigo').value.trim(), servidor: $('servidor').value.trim() });
  probar();
});
