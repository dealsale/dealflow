// DealFlow · Importar productos — botón "Importar a DealFlow" en la página de cada producto de
// LucidSales (panel.lucidsales.co/producto). Abre las secciones cerradas del producto, lee sus
// campos, bundles, variantes, mensaje inicial y multimedia, sube los archivos a DealFlow y crea
// el producto allá. No cambia nada en LucidSales: solo abre y cierra secciones para leerlas.
(() => {
  if (window.__dealflowImportar) return;
  window.__dealflowImportar = true;
  const api = globalThis.browser || globalThis.chrome;
  const enviar = (msg) => (globalThis.browser ? api.runtime.sendMessage(msg) : new Promise((ok) => api.runtime.sendMessage(msg, ok)));
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));

  // Secciones del editor de producto de Lucid (en el orden en que aparecen).
  const SECCIONES = ['Información del producto', 'Multimedia', 'Integraciones', 'Campañas de Meta', 'Landing', 'Mensaje Inicial', 'UpSell', 'Reglas y Preguntas Frecuentes', 'Variantes'];
  const A_ABRIR = ['Multimedia', 'Mensaje Inicial', 'UpSell', 'Reglas y Preguntas Frecuentes', 'Variantes'];

  // ── Interfaz: botón flotante y panel de progreso ──
  const estilo = document.createElement('style');
  estilo.textContent = `
    #dfi-btn{position:fixed;right:22px;bottom:22px;z-index:2147483646;display:flex;align-items:center;gap:8px;border:none;border-radius:999px;padding:12px 18px;
      font:700 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:linear-gradient(135deg,#7c3aed,#10b981);box-shadow:0 10px 30px -8px rgba(124,58,237,.6);cursor:pointer}
    #dfi-btn[disabled]{opacity:.75;cursor:progress} #dfi-btn img{width:20px;height:20px;border-radius:5px;background:#fff}
    #dfi-panel{position:fixed;right:22px;bottom:80px;z-index:2147483646;width:340px;max-height:60vh;overflow:auto;background:#111827;color:#fff;border-radius:14px;padding:14px 16px;
      font:500 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 18px 40px -12px rgba(0,0,0,.5)}
    #dfi-panel b{font-weight:800} #dfi-panel a{color:#6ee7b7;font-weight:800} #dfi-panel .err{color:#fca5a5} #dfi-panel li{margin:2px 0}
    #dfi-panel button{margin-top:10px;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer}`;
  document.documentElement.appendChild(estilo);
  const panel = (html) => {
    let p = document.getElementById('dfi-panel');
    if (!p) { p = document.createElement('div'); p.id = 'dfi-panel'; document.body.appendChild(p); }
    p.innerHTML = html;
    return p;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function enProducto() { return /^\/producto/i.test(location.pathname) && /editar producto/i.test(document.body.innerText || ''); }
  function pintarBoton() {
    let b = document.getElementById('dfi-btn');
    if (!enProducto()) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('button');
    b.id = 'dfi-btn';
    b.innerHTML = `<img src="${api.runtime.getURL('icons/icon-32.png')}" alt=""> Importar a DealFlow`;
    b.addEventListener('click', () => void importar(b));
    document.body.appendChild(b);
  }
  setInterval(pintarBoton, 1500);
  pintarBoton();

  // ── Lectura de la página ──
  /** El encabezado de una sección (el elemento más pequeño cuyo texto empieza por su nombre). */
  function encabezado(nombre) {
    const n = norm(nombre);
    // Las secciones plegables de Lucid: .slide-section-header > .slide-section-title
    const t = [...document.querySelectorAll('.slide-section-title')].find((x) => norm(x.innerText) === n);
    if (t) return t.closest('.slide-section-header') || t;
    let mejor = null;
    for (const el of document.querySelectorAll('button,[role="button"],summary,h1,h2,h3,h4,h5,div,span,p')) {
      // Nunca el menú lateral ni enlaces: tocarlos sacaría al usuario del producto.
      if (el.closest('#dfi-panel,#dfi-btn,a[href],nav,aside,.menuItem') || !visible(el)) continue;
      const primera = norm((el.innerText || '').split('\n')[0]);
      if (primera !== n && !(primera.startsWith(n) && primera.length < n.length + 14)) continue;
      if (!mejor || mejor.contains(el)) mejor = el;
    }
    return mejor;
  }
  const clicable = (el) => el.closest('button,[role="button"],summary,[aria-expanded]') || el;

  /** Abre una sección cerrada. Si al tocarla se encogió la página, estaba abierta: se vuelve a abrir. */
  async function abrir(nombre) {
    const h = encabezado(nombre);
    if (!h) return false;
    const c = clicable(h);
    const exp = c.getAttribute('aria-expanded');
    if (exp === 'true') return true;
    const antes = (document.body.innerText || '').length;
    c.scrollIntoView({ block: 'center' });
    c.click();
    await espera(900);
    if ((document.body.innerText || '').length < antes - 20) { c.click(); await espera(900); }
    return true;
  }

  /** Texto de la etiqueta de un campo (label, aria-label, placeholder o el texto de al lado). */
  function etiquetaDe(el) {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && l.innerText.trim()) return l.innerText.trim(); }
    const l = el.closest('label'); if (l && l.innerText.trim() && l.innerText.trim() !== (el.value || '').trim()) return l.innerText.replace(el.value || '', '').trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    let n = el;
    for (let i = 0; i < 4 && n; i++) {
      let p = n.previousElementSibling;
      while (p) { const t = (p.innerText || '').trim(); if (t && t.length < 80 && !p.querySelector('input,textarea,select')) return t; p = p.previousElementSibling; }
      n = n.parentElement;
    }
    return el.getAttribute('placeholder') || el.getAttribute('name') || '';
  }

  /** Sección a la que pertenece un elemento: el último encabezado que aparece antes en la página. */
  function seccionDe(el, heads) {
    let s = '';
    for (const [nombre, h] of heads) if (h && (h === el || (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))) s = nombre;
    return s;
  }

  const valorDe = (el) => (el.isContentEditable ? el.innerText : el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? 'sí' : 'no') : el.tagName === 'SELECT' ? (el.selectedOptions[0]?.text || el.value) : el.value);

  function leerCampos(raiz, heads) {
    const out = [];
    for (const el of raiz.querySelectorAll('input,textarea,select,[contenteditable="true"]')) {
      if (el.closest('#dfi-panel') || el.type === 'hidden' || el.type === 'file' || el.type === 'password') continue;
      const valor = String(valorDe(el) || '').trim();
      if (!valor) continue;
      out.push({ etiqueta: etiquetaDe(el).slice(0, 120), valor: valor.slice(0, 8000), seccion: heads ? seccionDe(el, heads) : '' });
    }
    return out;
  }

  const esMediaUtil = (src) => /^(https?:|blob:|data:)/.test(src || '') && !/\.svg(\?|$)/i.test(src) && !/(logo|favicon|flag|avatar|lucidsales-v2|\/co\.png)/i.test(src);

  /** Fotos, videos y audios de la página (con su sección y el texto que los rodea). */
  function leerMedia(heads) {
    const out = []; const vistos = new Set(); let orden = 0;
    const add = (url, tipo, el) => {
      if (!esMediaUtil(url) || vistos.has(url)) return;
      vistos.add(url);
      const caja = el.closest('div');
      out.push({ url, tipo, seccion: seccionDe(el, heads), orden: orden++, contexto: ((el.getAttribute('alt') || '') + ' ' + ((caja && caja.innerText) || '')).trim().slice(0, 160) });
    };
    for (const el of document.querySelectorAll('img,video,audio,source,a[href]')) {
      if (el.closest('header,nav,aside,#dfi-panel,#dfi-btn')) continue;
      if (el.tagName === 'IMG') { if ((el.naturalWidth || el.width) >= 50) add(el.currentSrc || el.src, 'imagen', el); }
      else if (el.tagName === 'VIDEO') add(el.currentSrc || el.src || el.querySelector('source')?.src, 'video', el);
      else if (el.tagName === 'AUDIO') add(el.currentSrc || el.src || el.querySelector('source')?.src, 'audio', el);
      else if (el.tagName === 'SOURCE') add(el.src, /audio/i.test(el.type) || el.parentElement?.tagName === 'AUDIO' ? 'audio' : 'video', el);
      else if (/\.(jpe?g|png|webp|gif|mp4|mov|webm|mp3|ogg|m4a|opus)(\?|$)/i.test(el.href)) add(el.href, /\.(mp4|mov|webm)/i.test(el.href) ? 'video' : /\.(mp3|ogg|m4a|opus)/i.test(el.href) ? 'audio' : 'imagen', el);
    }
    return out;
  }

  /** Texto de cada sección (lo que hay entre su encabezado y el siguiente). */
  function textosSecciones(heads) {
    const out = [];
    const lista = heads.filter(([, h]) => h);
    for (let i = 0; i < lista.length; i++) {
      const [nombre, h] = lista[i];
      const r = document.createRange();
      r.setStartBefore(h);
      if (lista[i + 1]) r.setEndBefore(lista[i + 1][1]); else r.setEndAfter(document.body.lastChild);
      const t = (r.toString() || '').replace(/\n{3,}/g, '\n\n').trim();
      out.push({ titulo: nombre, texto: t.slice(0, 12000) });
    }
    return out;
  }

  /** Mensaje inicial en orden: textos y piezas (imagen/video/audio) como aparecen en la sección. */
  function leerMensaje(heads) {
    const i = heads.findIndex(([n]) => n === 'Mensaje Inicial');
    if (i < 0 || !heads[i][1]) return [];
    const ini = heads[i][1]; const fin = heads.slice(i + 1).find(([, h]) => h)?.[1];
    const dentro = (el) => (ini.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && (!fin || (fin.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING));
    const out = []; const vistos = new Set();
    for (const el of document.querySelectorAll('textarea,[contenteditable="true"],img,video,audio,source')) {
      if (!dentro(el)) continue;
      if (el.tagName === 'TEXTAREA' || el.isContentEditable) { const t = String(valorDe(el) || '').trim(); if (t && !vistos.has(t)) { vistos.add(t); out.push({ tipo: 'texto', valor: t }); } continue; }
      const src = el.currentSrc || el.src || el.querySelector?.('source')?.src;
      if (!esMediaUtil(src) || vistos.has(src)) continue;
      if (el.tagName === 'IMG' && (el.naturalWidth || el.width) < 50) continue;
      vistos.add(src);
      out.push({ tipo: el.tagName === 'IMG' ? 'imagen' : el.tagName === 'AUDIO' || (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'AUDIO') ? 'audio' : 'video', valor: src });
    }
    return out;
  }

  /** Bundles: abre "Editar" de cada uno, lee el formulario y lo cierra sin guardar. */
  async function leerBundles() {
    const h = encabezado('Bundles');
    if (!h) return [];
    const zona = h.parentElement?.parentElement || h.parentElement;
    // Texto de la fila con espacios entre sus piezas (el "#1" y el nombre vienen en elementos aparte).
    const textoFila = (el) => [...el.childNodes].map((n) => (n.nodeType === 1 && n.matches('button,[role="button"],a') ? '' : n.textContent || '')).join(' ').replace(/\s+/g, ' ').trim();
    const tieneEditar = (el) => [...el.querySelectorAll('button,[role="button"],a')].some((b) => /editar/i.test(b.textContent || ''));
    let unicas = [...(zona || document).querySelectorAll('.cardList')].filter(tieneEditar);
    if (!unicas.length) {
      const filas = [...(zona || document).querySelectorAll('div,li,tr')].filter((el) => /^#\d+/.test(textoFila(el)) && textoFila(el).length < 120 && tieneEditar(el));
      unicas = filas.filter((f) => !filas.some((o) => o !== f && f.contains(o)));
    }
    const out = [];
    for (const f of unicas.slice(0, 12)) {
      const titulo = textoFila(f).replace(/editar|borrar/gi, '').replace(/\s+/g, ' ').trim();
      const btn = [...f.querySelectorAll('button,[role="button"],a')].find((b) => /editar/i.test(b.textContent || ''));
      const antes = new Set(document.querySelectorAll('[role="dialog"],[class*="modal" i],[class*="dialog" i]'));
      btn.click();
      await espera(900);
      const dialogo = [...document.querySelectorAll('[role="dialog"],[class*="modal" i],[class*="dialog" i]')].reverse().find((d) => visible(d) && !antes.has(d) && d.querySelector('input,textarea'))
        || [...document.querySelectorAll('[role="dialog"]')].reverse().find(visible);
      if (dialogo) {
        out.push({ titulo, campos: leerCampos(dialogo, null), texto: (dialogo.innerText || '').slice(0, 3000) });
        const cerrar = [...dialogo.querySelectorAll('button,[role="button"]')].find((b) => /cancelar|cerrar|close|^×$|^x$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await espera(300);
        if (visible(dialogo) && cerrar) cerrar.click();
        await espera(500);
      } else out.push({ titulo, campos: [], texto: titulo });
    }
    return out;
  }

  /** Sube un archivo a DealFlow (blob: y data: los lee esta página; lo demás, el fondo de la extensión). */
  async function subir(m) {
    let dataUrl = '';
    if (/^(blob:|data:)/.test(m.url)) {
      try { const b = await (await fetch(m.url)).blob(); dataUrl = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); } catch { return { error: 'No se pudo leer' }; }
    }
    return enviar({ tipo: 'subir', url: m.url, nombre: (m.url.split('/').pop() || '').split('?')[0].slice(0, 80), dataUrl });
  }

  // ── Importar ──
  // Mientras se importa, ningún clic puede navegar fuera del producto.
  const frenarEnlaces = (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (a && !a.closest('#dfi-panel')) { e.preventDefault(); e.stopPropagation(); } };

  async function importar(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    document.addEventListener('click', frenarEnlaces, true);
    const paso = (t) => panel(`<b>Importando a DealFlow…</b><div style="margin-top:6px">${t}</div>`);
    try {
      paso('Abriendo las secciones del producto…');
      for (const s of A_ABRIR) { try { await abrir(s); } catch { /* sigue */ } }
      await espera(600);
      paso('Leyendo los bundles…');
      const bundles = await leerBundles().catch(() => []);
      paso('Leyendo los datos del producto…');
      const heads = SECCIONES.map((n) => [n, encabezado(n)]);
      const titulo = ((document.body.innerText || '').match(/#\d+\s+[^\n]+/) || [''])[0].trim();
      const campos = leerCampos(document.body, heads);
      const media = leerMedia(heads);
      const mensaje = leerMensaje(heads);
      const secciones = textosSecciones(heads);

      // Archivos: cada uno se sube una sola vez y se reemplaza por su enlace de DealFlow.
      const piezas = [...new Set([...media.map((m) => m.url), ...mensaje.filter((b) => b.tipo !== 'texto').map((b) => b.valor)])];
      const enlace = new Map(); const fallos = [];
      for (let i = 0; i < piezas.length; i++) {
        paso(`Subiendo archivos a DealFlow… ${i + 1} de ${piezas.length}`);
        const r = await subir({ url: piezas[i] });
        if (r && r.url) enlace.set(piezas[i], r.url); else fallos.push(r && r.error ? r.error : 'error');
      }
      const mediaFinal = media.filter((m) => enlace.has(m.url)).map((m) => ({ ...m, url: enlace.get(m.url) }));
      const mensajeFinal = mensaje.map((b) => (b.tipo === 'texto' ? b : enlace.has(b.valor) ? { ...b, valor: enlace.get(b.valor) } : null)).filter(Boolean);

      paso('Creando el producto en DealFlow (la IA ordena combos, variantes y reglas)…');
      const r = await enviar({ tipo: 'producto', datos: { fuente: 'lucid', urlOrigen: location.href, titulo, campos, secciones, bundles, media: mediaFinal, mensaje: mensajeFinal } });
      if (!r || r.error) throw new Error((r && r.error) || 'DealFlow no respondió.');
      const link = `${r.servidor}/productos?producto=${encodeURIComponent(r.id)}`;
      panel(`<b>✅ «${esc(r.nombre)}» quedó en ${esc(r.tienda || 'DealFlow')}</b>
        <ul style="margin:8px 0 0;padding-left:18px">${(r.resumen || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${fallos.length ? `<div class="err" style="margin-top:6px">${fallos.length} archivo(s) no se pudieron traer (${esc(fallos[0])}). Súbelos a mano en DealFlow.</div>` : ''}
        <div style="margin-top:8px">Revísalo antes de vender: <a href="${link}" target="_blank" rel="noopener">Abrir en DealFlow ↗</a></div>
        <button id="dfi-cerrar">Cerrar</button>`);
      document.getElementById('dfi-cerrar').onclick = () => document.getElementById('dfi-panel')?.remove();
    } catch (e) {
      panel(`<b class="err">⚠️ No se pudo importar</b><div style="margin-top:6px">${esc(e && e.message ? e.message : e)}</div><button id="dfi-cerrar">Cerrar</button>`);
      document.getElementById('dfi-cerrar').onclick = () => document.getElementById('dfi-panel')?.remove();
    } finally {
      document.removeEventListener('click', frenarEnlaces, true);
      btn.disabled = false;
    }
  }
})();
