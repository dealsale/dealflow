// DealFlow x Shopify — botón "Enviar a DealFlow" en la página de cada pedido de Shopify.
(() => {
  if (window.__dealflowX) return;
  window.__dealflowX = true;

  // /store/<tienda>/orders/<id>  (admin nuevo)  ·  /admin/orders/<id>  (dominio myshopify)
  const leerUrl = () => {
    const m = location.pathname.match(/^\/store\/([^/]+)\/orders\/(\d+)/) || location.pathname.match(/^\/admin\/orders\/(\d+)/);
    if (!m) return null;
    if (m.length === 3) return { shop: m[1] + '.myshopify.com', orderId: m[2] };
    return { shop: location.hostname, orderId: m[1] };
  };

  const estilo = document.createElement('style');
  estilo.textContent = `
    #dfx-btn{position:fixed;right:22px;bottom:22px;z-index:2147483646;display:flex;align-items:center;gap:8px;border:none;border-radius:999px;padding:12px 18px;
      font:700 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:linear-gradient(135deg,#7c3aed,#10b981);box-shadow:0 10px 30px -8px rgba(124,58,237,.6);cursor:pointer}
    #dfx-btn:hover{transform:translateY(-1px)} #dfx-btn[disabled]{opacity:.75;cursor:progress}
    #dfx-btn img{width:20px;height:20px;border-radius:5px;background:#fff}
    #dfx-toast{position:fixed;right:22px;bottom:80px;z-index:2147483646;max-width:340px;background:#111827;color:#fff;border-radius:12px;padding:12px 14px;
      font:500 13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 18px 40px -12px rgba(0,0,0,.45)}
    #dfx-toast a{color:#6ee7b7;font-weight:700} #dfx-toast.err{background:#7f1d1d}
    @keyframes dfx-giro{to{transform:rotate(360deg)}} .dfx-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:dfx-giro .8s linear infinite}`;
  document.documentElement.appendChild(estilo);

  let toastT = 0;
  const toast = (html, error) => {
    let t = document.getElementById('dfx-toast');
    if (!t) { t = document.createElement('div'); t.id = 'dfx-toast'; document.body.appendChild(t); }
    t.className = error ? 'err' : '';
    t.innerHTML = html;
    clearTimeout(toastT);
    toastT = setTimeout(() => t && t.remove(), error ? 9000 : 7000);
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Primero el pedido en JSON (si Shopify lo entrega en esta sesión); si no, el texto de la página.
  async function leerPedido(info) {
    try {
      const r = await fetch(location.origin + location.pathname.replace(/\/$/, '') + '.json', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        const j = await r.json();
        if (j && j.order && Array.isArray(j.order.line_items)) return { ...info, order: j.order };
      }
    } catch (e) { /* seguimos con el texto */ }
    const main = document.querySelector('main') || document.body;
    return { ...info, texto: main.innerText.slice(0, 20000) };
  }

  async function enviar(btn) {
    const info = leerUrl();
    if (!info) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="dfx-spin"></span> Enviando a DealFlow…';
    const datos = await leerPedido(info);
    chrome.runtime.sendMessage({ tipo: 'enviar', datos }, (r) => {
      btn.disabled = false;
      pintar(btn);
      if (!r || r.error) { toast('⚠️ ' + esc((r && r.error) || 'No se pudo enviar.'), true); return; }
      const link = r.servidor + '/pedidos?pedido=' + encodeURIComponent(r.id);
      toast((r.nuevo ? '✅ Pedido creado en DealFlow: ' : 'ℹ️ Este pedido ya estaba en DealFlow: ') + '<b>' + esc(r.id) + '</b> · <a href="' + link + '" target="_blank" rel="noopener">Abrir ↗</a>');
    });
  }

  const pintar = (btn) => { btn.innerHTML = '<img src="' + chrome.runtime.getURL('icons/icon-32.png') + '" alt=""> Enviar a DealFlow'; };

  // Shopify es una app de una sola página: se revisa la URL cada medio segundo.
  let ultima = '';
  setInterval(() => {
    if (location.href === ultima) return;
    ultima = location.href;
    const enPedido = !!leerUrl();
    let btn = document.getElementById('dfx-btn');
    if (enPedido && !btn) {
      btn = document.createElement('button');
      btn.id = 'dfx-btn';
      btn.type = 'button';
      pintar(btn);
      btn.addEventListener('click', () => enviar(btn));
      document.body.appendChild(btn);
    } else if (!enPedido && btn) btn.remove();
  }, 500);
})();
