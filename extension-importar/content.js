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

  // Lucid pliega cada sección en un .slide-section-card; al abrir una puede cerrarse otra (acordeón),
  // por eso cada sección se lee justo después de abrirla.
  const tarjeta = (h) => h.closest('.slide-section-card') || h.parentElement || document.body;
  const abierta = (h) => { const c = tarjeta(h); return !!c.querySelector('input,textarea,select,img,video,audio,[contenteditable="true"]') || (c.innerText || '').trim().length > (h.innerText || '').trim().length + 3; };

  /** Abre una sección (si está cerrada) y espera a que cargue su contenido y sus imágenes. */
  async function abrir(nombre) {
    const h = encabezado(nombre);
    if (!h) return null;
    if (h.getAttribute('aria-expanded') !== 'true' && !abierta(h)) {
      const c = clicable(h);
      c.scrollIntoView({ block: 'center' });
      c.click();
      for (let i = 0; i < 16 && !abierta(h); i++) await espera(250);
    }
    await cargarMedia(tarjeta(h));
    return h;
  }

  /** Recorre la sección para que carguen las imágenes perezosas y espera (máx. 5 s). */
  async function cargarMedia(caja) {
    for (const el of caja.querySelectorAll('img,video')) { try { el.scrollIntoView({ block: 'center' }); } catch { /* nada */ } await espera(40); }
    const t0 = Date.now();
    while (Date.now() - t0 < 5000 && [...caja.querySelectorAll('img')].some((i) => !i.complete)) await espera(200);
    await espera(400);
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

  const chica = (el) => Math.max(el.naturalWidth || 0, el.width || 0, el.offsetWidth || 0) < 50 && el.complete && el.naturalWidth > 0;
  const urlFondo = (el) => { const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style?.backgroundImage || ''); return m ? new URL(m[1], location.href).href : ''; };
  const srcDe = (el) => el.currentSrc || el.src || el.getAttribute('data-src') || el.querySelector?.('source')?.src || '';
  const tipoDe = (el, url) => (el.tagName === 'IMG' ? 'imagen' : el.tagName === 'AUDIO' || (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'AUDIO') || /\.(mp3|ogg|m4a|opus|wav)(\?|$)/i.test(url) ? 'audio'
    : el.tagName === 'VIDEO' || el.tagName === 'SOURCE' || /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'imagen');

  /** Fotos, videos y audios dentro de una sección, en orden (con el texto que los rodea). */
  function leerMediaEn(raiz, seccion, out, vistos) {
    for (const el of raiz.querySelectorAll('img,video,audio,source,a[href],[style*="background-image"]')) {
      if (el.closest('header,nav,aside,#dfi-panel,#dfi-btn')) continue;
      let url = '';
      if (el.tagName === 'IMG') { if (chica(el)) continue; url = srcDe(el); }
      else if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.tagName === 'SOURCE') url = srcDe(el);
      else if (el.tagName === 'A') { if (!/\.(jpe?g|png|webp|gif|mp4|mov|webm|mp3|ogg|m4a|opus)(\?|$)/i.test(el.href)) continue; url = el.href; }
      else { if ((el.offsetWidth || 0) < 50) continue; url = urlFondo(el); }
      if (!esMediaUtil(url) || vistos.has(url)) continue;
      vistos.add(url);
      // Contexto: el alt y el texto corto más cercano (p. ej. "Testimonios"), sin tomar toda la sección.
      let caja = el.parentElement; let cerca = '';
      for (let i = 0; i < 3 && caja && caja !== raiz; i++, caja = caja.parentElement) { const t = (caja.innerText || '').trim(); if (t) { if (t.length < 80) cerca = t; break; } }
      out.push({ url, tipo: tipoDe(el, url), seccion, orden: out.length, contexto: `${el.getAttribute('alt') || ''} ${cerca}`.trim().slice(0, 160) });
    }
  }

  /** Mensaje inicial en orden: textos y piezas (imagen/video/audio) como aparecen en la sección. */
  function leerMensajeEn(raiz) {
    const out = []; const vistos = new Set();
    for (const el of raiz.querySelectorAll('textarea,[contenteditable="true"],img,video,audio,source,[style*="background-image"]')) {
      if (el.tagName === 'TEXTAREA' || el.isContentEditable) { const t = String(valorDe(el) || '').trim(); if (t && !vistos.has(t)) { vistos.add(t); out.push({ tipo: 'texto', valor: t }); } continue; }
      if (el.tagName === 'IMG' && chica(el)) continue;
      const src = el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.tagName === 'SOURCE' ? srcDe(el) : urlFondo(el);
      if (!esMediaUtil(src) || vistos.has(src)) continue;
      vistos.add(src);
      const tipo = tipoDe(el, src);
      if (tipo !== 'audio' || out.every((b) => b.valor !== src)) out.push({ tipo, valor: src });
    }
    return out;
  }

  /** Copia de la sección con los valores escritos (para el archivo de diagnóstico). */
  function copiaSeccion(caja) {
    const c = caja.cloneNode(true);
    const orig = caja.querySelectorAll('input,textarea,select'); const dup = c.querySelectorAll('input,textarea,select');
    orig.forEach((el, i) => { const d = dup[i]; if (!d) return; if (el.tagName === 'TEXTAREA') d.textContent = el.value; else if (el.tagName === 'SELECT') d.setAttribute('data-valor', el.selectedOptions[0]?.text || el.value); else d.setAttribute('value', el.type === 'checkbox' ? String(el.checked) : el.value); });
    c.querySelectorAll('svg').forEach((x) => x.replaceWith(document.createTextNode('[icono]')));
    c.querySelectorAll('img,video,audio,source').forEach((x) => { const u = srcDe(x); if (u) x.setAttribute('data-url', u.startsWith('data:') ? u.slice(0, 60) + '…' : u); if ((x.getAttribute('src') || '').startsWith('data:')) x.removeAttribute('src'); });
    return c.outerHTML;
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

  let ultimoDiagnostico = '';
  /** Descarga lo que se leyó de cada sección, para revisar qué no se pudo leer. */
  function guardarDiagnostico() {
    const html = ultimoDiagnostico || `<!doctype html><meta charset="utf-8"><p>${esc(location.href)}</p>${copiaSeccion(document.body)}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `diagnostico-dealflow-${Date.now()}.html`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function botonesFinal() {
    document.getElementById('dfi-cerrar').onclick = () => document.getElementById('dfi-panel')?.remove();
    const d = document.getElementById('dfi-diag'); if (d) d.onclick = guardarDiagnostico;
  }

  async function importar(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    document.addEventListener('click', frenarEnlaces, true);
    const paso = (t) => panel(`<b>Importando a DealFlow…</b><div style="margin-top:6px">${t}</div>`);
    try {
      const titulo = ((document.body.innerText || '').match(/#\d+\s+[^\n]+/) || [''])[0].trim();
      const campos = []; const media = []; const vistosMedia = new Set(); const secciones = []; const diag = [];
      let mensaje = []; let bundles = [];
      const clave = new Set();
      const sumarCampos = (lista, seccion) => { for (const c of lista) { const k = `${c.etiqueta}|${c.valor}`; if (!clave.has(k)) { clave.add(k); campos.push({ ...c, seccion }); } } };
      // Lo que está fuera de las secciones (p. ej. "Activo").
      for (const el of document.querySelectorAll('input,textarea,select')) {
        if (el.closest('.slide-section-card,#dfi-panel,nav,aside,header')) continue;
        const v = String(valorDe(el) || '').trim(); if (v && el.type !== 'hidden' && el.type !== 'password' && el.type !== 'file') sumarCampos([{ etiqueta: etiquetaDe(el).slice(0, 120), valor: v.slice(0, 8000) }], '');
      }
      for (const nombre of SECCIONES) {
        paso(`Leyendo «${esc(nombre)}»…`);
        let h = null;
        try { h = await abrir(nombre); } catch { /* sigue */ }
        if (!h) continue;
        const caja = tarjeta(h);
        sumarCampos(leerCampos(caja, null), nombre);
        leerMediaEn(caja, nombre, media, vistosMedia);
        if (nombre === 'Mensaje Inicial') mensaje = leerMensajeEn(caja);
        const texto = (caja.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
        secciones.push({ titulo: nombre, texto: texto.slice(0, 12000) });
        if (!bundles.length && encabezado('Bundles')) { paso('Leyendo los bundles…'); bundles = await leerBundles().catch(() => []); }
        diag.push(`<section data-seccion="${esc(nombre)}"><h2>${esc(nombre)}</h2>${copiaSeccion(caja)}</section>`);
      }
      if (!bundles.length) bundles = await leerBundles().catch(() => []);
      ultimoDiagnostico = `<!doctype html><meta charset="utf-8"><title>Diagnóstico ${esc(titulo)}</title><p>${esc(location.href)} · ${new Date().toISOString()}</p>`
        + `<pre>${esc(JSON.stringify({ campos: campos.length, media: media.map((m) => [m.seccion, m.tipo, m.url.slice(0, 120)]), mensaje: mensaje.map((b) => [b.tipo, String(b.valor).slice(0, 120)]), bundles }, null, 1))}</pre>` + diag.join('\n');
      const leido = `Leí ${campos.length} campos, ${media.length} fotos/videos, ${mensaje.length} bloques del mensaje inicial y ${bundles.length} bundles.`;

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
        <div style="margin-top:4px;opacity:.8">${esc(leido)}</div>
        <ul style="margin:8px 0 0;padding-left:18px">${(r.resumen || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${fallos.length ? `<div class="err" style="margin-top:6px">${fallos.length} archivo(s) no se pudieron traer (${esc(fallos[0])}). Súbelos a mano en DealFlow.</div>` : ''}
        <div style="margin-top:8px">Revísalo antes de vender: <a href="${link}" target="_blank" rel="noopener">Abrir en DealFlow ↗</a></div>
        <button id="dfi-cerrar">Cerrar</button> <button id="dfi-diag">⬇ Guardar diagnóstico</button>`);
      botonesFinal();
    } catch (e) {
      panel(`<b class="err">⚠️ No se pudo importar</b><div style="margin-top:6px">${esc(e && e.message ? e.message : e)}</div><button id="dfi-cerrar">Cerrar</button> <button id="dfi-diag">⬇ Guardar diagnóstico</button>`);
      botonesFinal();
    } finally {
      document.removeEventListener('click', frenarEnlaces, true);
      btn.disabled = false;
    }
  }
})();
