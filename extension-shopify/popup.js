const $ = (id) => document.getElementById(id);
const estado = (t, ok) => { $('estado').textContent = t; $('estado').className = ok ? 'ok' : 'err'; };

chrome.storage.sync.get(['codigo', 'servidor']).then((c) => {
  $('codigo').value = c.codigo || '';
  $('servidor').value = c.servidor || '';
  if (c.codigo) probar();
});

function probar() {
  estado('Probando…', true);
  chrome.runtime.sendMessage({ tipo: 'yo' }, (r) => {
    if (!r || r.error) estado('⚠️ ' + ((r && r.error) || 'No se pudo conectar.'), false);
    else estado('✅ Conectado a la tienda: ' + r.tienda, true);
  });
}

$('guardar').addEventListener('click', async () => {
  await chrome.storage.sync.set({ codigo: $('codigo').value.trim(), servidor: $('servidor').value.trim() });
  probar();
});
