/**
 * Plantillas de las landings. Cada plantilla recibe los mismos datos (LandingDatos) y
 * devuelve la página completa; así una tienda cambia de diseño sin rehacer su contenido.
 *
 * "premium": la de las tiendas de dropshipping en Shopify (tema Shrine + formulario
 * contra entrega): barra de anuncios en movimiento, galería con miniaturas, ofertas por
 * cantidad con cinta animada y variantes por unidad, botón con animación, formulario
 * emergente con resumen (subtotal, descuento, envío, total), imágenes largas y
 * testimonios estilo Facebook.
 */
import type { LandingDatos, BundleL, TiendaConfig, ProductoCatalogo } from './landings.js';
import { BASE_TIENDA } from './tiendaPublica.js';
import { COLOMBIA } from './colombiaGeo.js';

const txt = (v: unknown) => (v == null ? '' : String(v));
const esc = (s: unknown) => txt(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');

export interface OpcionesRender {
  id: string; vista?: boolean; titulo?: string; urlBase?: string;
  /** Enlace a la página de inicio de la tienda (catálogo). */ inicio?: string;
  /** Datos de la tienda (favicon y nombre del sitio para el SEO). */ tienda?: TiendaConfig;
  /** Dirección pública completa de esta página (canonical, og:url). */ url?: string;
}

/** Ícono por defecto: la inicial de la tienda en su color (si no subió favicon ni logo). */
const faviconInicial = (nombre: string, color: string) =>
  'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" font-family="Arial,sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#fff">${(nombre.trim()[0] || 'T').toUpperCase().replace(/[<&>]/g, '')}</text></svg>`);

/**
 * Cabecera común: favicon, título, descripción, canonical, Open Graph (WhatsApp, Facebook),
 * Twitter y datos estructurados para Google. `abs` vuelve absolutas las rutas /l/media/….
 */
function cabeceraSeo(c: { titulo: string; descripcion: string; imagen: string; url?: string; favicon: string; sitio: string; color: string; tipo: 'website' | 'product'; precio?: number; jsonld?: unknown; vista?: boolean }): string {
  const origen = c.url ? (/^https?:\/\/[^/]+/.exec(c.url)?.[0] || BASE_TIENDA) : BASE_TIENDA;
  const abs = (u: string) => (!u ? '' : u.startsWith('/') ? origen + u : u);
  const img = abs(c.imagen);
  const fav = c.favicon ? abs(c.favicon) : faviconInicial(c.sitio, c.color);
  const desc = c.descripcion.replace(/\s+/g, ' ').trim().slice(0, 165);
  return [
    `<title>${esc(c.titulo)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    c.vista ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow,max-image-preview:large">',
    c.url ? `<link rel="canonical" href="${esc(c.url)}">` : '',
    `<link rel="icon" href="${esc(fav)}">`,
    `<link rel="apple-touch-icon" href="${esc(fav)}">`,
    `<meta name="theme-color" content="${esc(c.color)}">`,
    `<meta property="og:type" content="${c.tipo}">`,
    `<meta property="og:site_name" content="${esc(c.sitio)}">`,
    `<meta property="og:locale" content="es_CO">`,
    `<meta property="og:title" content="${esc(c.titulo)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    c.url ? `<meta property="og:url" content="${esc(c.url)}">` : '',
    img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:alt" content="${esc(c.titulo)}">` : '',
    c.precio ? `<meta property="product:price:amount" content="${Math.round(c.precio)}"><meta property="product:price:currency" content="COP">` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(c.titulo)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    img ? `<meta name="twitter:image" content="${esc(img)}">` : '',
    c.jsonld ? `<script type="application/ld+json">${json(c.jsonld)}</script>` : '',
  ].filter(Boolean).join('\n');
}

export function renderLanding(d: LandingDatos, o: OpcionesRender): string {
  return premium(d, o);
}

/**
 * En la vista previa del editor ningún enlace navega (si no, el recuadro terminaría
 * cargando DealFlow): se muestra un aviso corto en su lugar.
 */
const GUARDA_VISTA = `<script>(function(){var t;document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;e.preventDefault();e.stopPropagation();var d=document.getElementById('df-aviso');if(!d){d=document.createElement('div');d.id='df-aviso';d.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111;color:#fff;font:600 12.5px Poppins,system-ui,sans-serif;padding:9px 14px;border-radius:20px;z-index:99;box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:90%;text-align:center';document.body.appendChild(d)}d.textContent='Vista previa: en tu tienda publicada este enlace sí abre.';d.style.display='block';clearTimeout(t);t=setTimeout(function(){d.style.display='none'},2200)},true)})();</script>`;

/** Descripción con formato sencillo: párrafos, listas (- o ✓) y **negrita**. */
function formatoTexto(t: string): string {
  const neg = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return t.split(/\n{2,}/).map((bloque) => {
    const lineas = bloque.split('\n').filter((l) => l.trim());
    if (lineas.length && lineas.every((l) => /^\s*([-•*✓✔✅]|\d+[.)])\s+/.test(l))) {
      return `<ul>${lineas.map((l) => `<li>${neg(l.replace(/^\s*([-•*✓✔✅]|\d+[.)])\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lineas.map(neg).join('<br>')}</p>`;
  }).join('');
}

const estrellas = (n: number) => {
  let h = '';
  for (let i = 1; i <= 5; i++) {
    const lleno = Math.max(0, Math.min(1, n - i + 1));
    h += `<span class="st"><span style="width:${Math.round(lleno * 100)}%">★</span>★</span>`;
  }
  return h;
};

// Íconos (trazos sencillos, heredan el color del texto).
const I = {
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/></svg>',
  camion: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/></svg>',
  carrito: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 2h2.2l.9 2H21a1 1 0 0 1 .96 1.27l-2.2 8A1 1 0 0 1 18.8 14H8.1l-.9 2H19v2H5.6a1 1 0 0 1-.9-1.45L6.1 13.7 3.6 4H3z"/></svg>',
  arriba: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  wa: '<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>',
  megusta: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.2 2.6L12.6 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>',
  comentar: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  compartir: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 5l7 7-7 7v-4c-5 0-8 1.5-10 5 .5-6 3.5-10 10-11z"/></svg>',
};

function premium(d: LandingDatos, o: OpcionesRender): string {
  const bundles: BundleL[] = d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: 'Lleva 1', subtitulo: '', precio: d.precio, precioAntes: d.precioAntes, insignia: '', imagen: '' }];
  const inicial = Math.min(d.bundleInicial, bundles.length - 1);
  const conOfertas = d.bundles.length > 0;
  const sel = bundles[inicial];
  // El píxel del producto; si no tiene, el de Mi tienda (así ningún producto queda sin medir).
  const pixel = o.vista ? '' : d.pixelMeta || o.tienda?.pixelMeta || '';
  const cfg = {
    id: o.id, vista: !!o.vista, nombre: d.nombre, opciones: d.opciones, bundles, inicial, foto: d.galeria[0] || '',
    pedirCorreo: d.pedirCorreo, tituloForm: d.tituloForm, botonForm: d.botonForm,
    gracias: d.gracias || '¡Gracias por tu compra! Te escribiremos por WhatsApp para confirmar tu pedido.',
    pixel, geo: COLOMBIA,
  };
  // Fechas de entrega estilo "Miércoles, 28. Octubre" (hora de Colombia).
  const hoy = new Date(Date.now() - 5 * 3600e3);
  const dia = (n: number) => {
    const x = new Date(hoy); x.setUTCDate(x.getUTCDate() + n);
    const sem = x.toLocaleDateString('es-CO', { weekday: 'long', timeZone: 'UTC' });
    const mes = x.toLocaleDateString('es-CO', { month: 'long', timeZone: 'UTC' });
    const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${may(sem)}, ${x.getUTCDate()}. ${may(mes)}`;
  };
  const sitio = o.tienda?.nombre || d.nombreTienda || d.nombre;
  const tituloSeo = d.seoTitulo || o.titulo || `${d.nombre}${sitio && sitio !== d.nombre ? ' | ' + sitio : ''}`;
  const descSeo = d.seoDescripcion || [d.destacado, d.descripcion.replace(/\*\*/g, '')].filter(Boolean).join('. ') || `${d.nombre}. Pago contra entrega y envío a toda Colombia.`;
  const imagenSeo = d.seoImagen || d.galeria[0] || '';
  const abs = (u: string) => (u.startsWith('/') ? ((o.url && /^https?:\/\/[^/]+/.exec(o.url)?.[0]) || BASE_TIENDA) + u : u);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: d.nombre, description: descSeo.slice(0, 500),
    image: d.galeria.slice(0, 6).map(abs), brand: { '@type': 'Brand', name: sitio },
    offers: { '@type': 'Offer', priceCurrency: 'COP', price: Math.round(sel.precio), availability: 'https://schema.org/InStock', url: o.url || undefined, seller: { '@type': 'Organization', name: sitio } },
  };
  const anuncios = d.anuncios.length ? d.anuncios : [];
  // La barra se repite lo suficiente para llenar pantallas anchas y se mueve en bucle.
  const tira = anuncios.length ? Array.from({ length: Math.max(4, Math.ceil(8 / anuncios.length)) }, () => anuncios).flat() : [];
  const ahorro = sel.precioAntes > sel.precio && sel.precio > 0 ? Math.round((1 - sel.precio / sel.precioAntes) * 100) : 0;

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${cabeceraSeo({ titulo: tituloSeo, descripcion: descSeo, imagen: imagenSeo, url: o.url, favicon: o.tienda?.favicon || o.tienda?.logo || d.logo, sitio, color: d.colorPrincipal, tipo: 'product', precio: sel.precio, jsonld, vista: o.vista })}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${d.galeria[0] ? `<link rel="preload" as="image" href="${esc(d.galeria[0])}">` : ''}
${pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');fbq('track','ViewContent',{content_name:${json(d.nombre)},value:${sel.precio},currency:'COP'});</script>` : ''}
<style>
:root{--p:${d.colorPrincipal};--b:${d.colorBoton};--a:${d.colorAcento};--t:#121212;--m:#6b7280;--bd:#e5e7eb;--g:#f3f3f3}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:#fff;color:var(--t);font:14px/1.5 Poppins,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}button,input,select{font-family:inherit}
s{color:#777}
/* Barra de anuncios en movimiento */
.ticker{background:var(--p);color:#fff;overflow:hidden;white-space:nowrap;position:relative;z-index:5}
.ticker .pista{display:inline-flex;animation:correr ${Math.max(18, tira.length * 3)}s linear infinite;will-change:transform}
.ticker:hover .pista{animation-play-state:paused}
.ticker span{font:600 13.5px/1 Poppins,sans-serif;letter-spacing:.6px;text-transform:uppercase;padding:13px 0;margin:0 34px}
@media(min-width:900px){.ticker span{font-size:15px;margin:0 46px}}
@keyframes correr{from{transform:translateX(0)}to{transform:translateX(-50%)}}
header{display:flex;justify-content:center;padding:12px 16px;border-bottom:1px solid var(--bd)}
header img{max-height:48px;width:auto}header b{font:800 20px Poppins,sans-serif;text-transform:uppercase;letter-spacing:2px}
.banner img{width:100%}
.wrap{max-width:1200px;margin:0 auto;padding:0 14px}
/* Producto: en computador la info a la izquierda y la galería a la derecha (como el tema) */
.prod{display:grid;grid-template-columns:1fr;gap:18px;padding:16px 0 10px}
.media{order:-1}
@media(min-width:900px){.prod{grid-template-columns:minmax(320px,.78fr) 1.22fr;gap:34px;padding:26px 0}.media{order:0}.info{position:sticky;top:14px;align-self:start}}
.principal{position:relative;border-radius:12px;overflow:hidden;background:var(--g)}
.slides{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.slides::-webkit-scrollbar{display:none}
.slides{align-items:center}
.slides img{flex:0 0 100%;width:100%;height:auto;object-fit:contain;scroll-snap-align:center}
.puntos{position:absolute;left:0;right:0;bottom:10px;display:flex;justify-content:center;gap:6px}
.puntos i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.55);transition:all .25s}
.puntos i.on{width:20px;border-radius:5px;background:#fff}
@media(min-width:900px){.puntos{display:none}}
.flecha{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.92);box-shadow:0 3px 12px rgba(0,0,0,.18);font-size:20px;cursor:pointer;display:none;color:#111}
@media(min-width:900px){.flecha{display:grid;place-items:center}}
.flecha.izq{left:12px}.flecha.der{right:12px}
.miniaturas{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:9px}
@media(min-width:900px){.miniaturas{grid-template-columns:repeat(6,1fr)}}
.miniaturas img{width:100%;aspect-ratio:3/4;object-fit:contain;background:var(--g);border-radius:7px;cursor:pointer;border:2px solid transparent;opacity:.82;transition:all .2s}
.miniaturas img:hover{opacity:1;transform:translateY(-2px)}
.miniaturas img.on{border-color:var(--t);opacity:1}
.rating{display:flex;align-items:center;gap:8px;font-size:13px;color:#333;margin-bottom:8px}
.st{position:relative;display:inline-block;color:#e5e5e5;font-size:15px;line-height:1}
.st span{position:absolute;left:0;top:0;overflow:hidden;color:#ffb400;white-space:nowrap}
h1{font:700 24px/1.2 Poppins,sans-serif;margin:4px 0 10px}
@media(min-width:900px){h1{font-size:28px}}
.precio{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.precio b{font:800 24px Poppins,sans-serif}.precio s{font-size:16px}
.precio .ah{background:var(--b);color:#fff;font:700 11.5px Poppins,sans-serif;padding:4px 9px;border-radius:5px;text-transform:uppercase}
.dest{display:flex;gap:8px;align-items:center;justify-content:center;font-size:13.5px;margin:6px 0 16px;text-align:center}
.dest svg{flex:0 0 auto}
/* Ofertas por cantidad */
.ofertas h3{display:flex;align-items:center;gap:10px;font:700 15px Poppins,sans-serif;margin:0 0 14px}
.ofertas h3:before,.ofertas h3:after{content:"";flex:1;height:2px;background:var(--bd)}
.of{position:relative;border:1.5px solid #d1d1d1;border-radius:8px;padding:13px 12px;margin-bottom:14px;cursor:pointer;background:#fff;transition:border-color .2s,background .2s,box-shadow .2s}
.of:hover{border-color:#a3a3a3}
.of.on{background:color-mix(in srgb,var(--a) 9%,#fff);border-color:color-mix(in srgb,var(--a) 60%,#fff);box-shadow:0 4px 14px -8px color-mix(in srgb,var(--a) 60%,transparent)}
.of .fila{display:flex;align-items:center;gap:10px}
.of .rad{width:18px;height:18px;border-radius:50%;border:1.5px solid #9ca3af;flex:0 0 auto;display:grid;place-items:center;background:#fff}
.of.on .rad{border-color:var(--a)}.of.on .rad:after{content:"";width:10px;height:10px;border-radius:50%;background:color-mix(in srgb,var(--a) 75%,#fff)}
.of .tt{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:5px 8px}
.of .tt b{font:800 15.5px Poppins,sans-serif}
.of .verde{position:relative;overflow:hidden;background:var(--b);color:#fff;font:700 12.5px/1.25 Poppins,sans-serif;padding:3px 7px;border-radius:3px}
.of .verde:after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);animation:brillo 3.2s ease-in-out infinite}
@keyframes brillo{0%,55%{left:-60%}100%{left:130%}}
.of .pp{text-align:right;white-space:nowrap}.of .pp b{display:block;font:800 17px Poppins,sans-serif}.of .pp s{font-size:13px}
.of img.mini{width:46px;height:46px;border-radius:6px;object-fit:contain;background:#fff}
.cinta{position:absolute;top:-12px;right:10px;background:var(--a);color:#fff;font:700 12.5px/1 Poppins,sans-serif;padding:5px 10px 5px;border-radius:3px 3px 0 0;white-space:nowrap}
.cinta:before,.cinta:after{content:"";position:absolute;bottom:-5px;border-style:solid;border-color:transparent}
.cinta:before{left:0;border-width:5px 0 0 6px;border-top-color:color-mix(in srgb,var(--a) 55%,#000)}
.cinta:after{right:0;border-width:5px 6px 0 0;border-top-color:color-mix(in srgb,var(--a) 55%,#000)}
.cinta i{display:inline-block;font-style:normal;animation:latido 1.4s ease-in-out infinite;transform-origin:50% 80%}
@keyframes latido{0%,100%{transform:scale(1) rotate(0)}25%{transform:scale(1.28) rotate(-10deg)}50%{transform:scale(1) rotate(0)}75%{transform:scale(1.18) rotate(8deg)}}
.vars{margin-top:12px;animation:abrir .25s ease-out}
@keyframes abrir{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.vars .cab,.vars .u{display:grid;grid-template-columns:24px repeat(var(--n),1fr);gap:8px;align-items:center}
.vars .cab span{font:700 11.5px Poppins,sans-serif;color:#222}
.vars .u{margin-top:5px}.vars .u em{font:700 12.5px Poppins,sans-serif;font-style:normal}
.vars select{width:100%;min-width:0;border:1px solid #b8b8b8;border-radius:5px;padding:5px 6px;font-size:13px;background:#fff;color:#111}
/* Botón principal con animación */
.cta{position:relative;width:100%;display:flex;align-items:center;justify-content:center;gap:12px;border:0;border-radius:9px;color:#fff;cursor:pointer;padding:12px 14px;margin:4px 0 14px;
  background:linear-gradient(95deg,color-mix(in srgb,var(--b) 82%,#0ea5a4),var(--b) 55%,color-mix(in srgb,var(--b) 80%,#a3e635));box-shadow:0 8px 20px -8px color-mix(in srgb,var(--b) 75%,transparent);animation:tada 3.2s ease-in-out infinite}
.cta .tx{display:flex;flex-direction:column;align-items:center;text-align:center}
.cta .t1{font:800 15px/1.2 Poppins,sans-serif;text-transform:uppercase;letter-spacing:.3px}
.cta .t2{font:500 12.5px/1.3 Poppins,sans-serif;text-transform:uppercase;opacity:.95;margin-top:2px}
@keyframes tada{0%,62%,100%{transform:scale(1) rotate(0)}65%,68%{transform:scale(.96) rotate(-2deg)}71%,77%,83%,89%{transform:scale(1.04) rotate(2deg)}74%,80%,86%{transform:scale(1.04) rotate(-2deg)}92%{transform:scale(1) rotate(0)}}
.envio{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:#222;margin:4px 0 14px}
.envio svg{flex:0 0 auto;margin-top:1px}
.benef{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:6px 0 14px}
.benef span{background:var(--g);border-radius:8px;padding:9px 8px;text-align:center;font-size:12.5px;font-weight:600}
.desc{font-size:14px;color:#333;margin:10px 0}.desc ul{padding-left:20px;margin:6px 0}.desc li{margin:3px 0}.desc p{margin:0 0 10px}
/* Imágenes largas */
.largas{max-width:1000px;margin:6px auto 0}.largas img{width:100%}
.otra{max-width:520px;margin:14px auto 0;padding:0 14px}
/* Testimonios estilo Facebook */
.testi{background:var(--g);padding:44px 0 50px;margin-top:22px}
.testi h2{text-align:center;font:700 26px/1.25 Poppins,sans-serif;margin:0 0 26px;padding:0 16px}
@media(min-width:900px){.testi h2{font-size:32px}}
.posts{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 16px 14px;scrollbar-width:none;align-items:flex-start}
.posts::-webkit-scrollbar{display:none}
@media(min-width:900px){.posts{display:grid;grid-template-columns:repeat(4,1fr);max-width:1200px;margin:0 auto;overflow:visible}}
.post{flex:0 0 84%;scroll-snap-align:center;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12);padding:12px 12px 10px;font:14px/1.4 Poppins,sans-serif}
.post .cab{display:flex;gap:9px;align-items:center;margin-bottom:8px}
.post .av{width:38px;height:38px;border-radius:50%;object-fit:cover;display:grid;place-items:center;color:#fff;font-weight:700;flex:0 0 auto}
.post .nm{font-weight:700;font-size:14px}.post .tm{font-size:12px;color:#65676b}.post .mas{margin-left:auto;color:#333;letter-spacing:1px;font-weight:800}
.post .tx{font-size:14px;margin-bottom:8px}
.post .img{margin:0 -12px;width:calc(100% + 24px);max-width:none}
.post .rx{display:flex;align-items:center;gap:6px;color:#444;font-size:13px;padding:9px 0;border-bottom:1px solid #e4e6eb}
.post .rx .em{display:inline-flex}.post .rx .em i{font-style:normal;font-size:13px;margin-right:-3px}
.post .rx .cm{margin-left:auto}
.post .ac{display:flex;justify-content:space-between;color:#444;font-size:12.5px;padding:7px 2px;gap:4px}
.post .ac span{display:flex;align-items:center;gap:4px}
.post .rep{display:flex;gap:8px;padding-top:8px;border-top:1px solid #e4e6eb}
.post .rep .av{width:30px;height:30px;font-size:12px}
.post .rep .bur{background:#f0f2f5;border-radius:14px;padding:7px 11px;font-size:13px}
.post .rep .bur b{display:block;font-size:13px}
.post .rep .pie{font-size:11px;color:#65676b;margin:3px 0 0 10px;display:flex;gap:10px}
footer{background:#121212;color:#d4d4d4;text-align:center;font-size:12px;padding:26px 16px calc(96px + env(safe-area-inset-bottom))}
@media(min-width:900px){footer{padding-bottom:28px}}
footer b{color:#fff;font-weight:600}
/* Botones flotantes */
.subir{position:fixed;right:16px;bottom:96px;width:42px;height:42px;border-radius:50%;border:0;background:#121212;color:#fff;display:grid;place-items:center;cursor:pointer;opacity:0;pointer-events:none;transform:translateY(10px);transition:all .25s;z-index:41;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.subir.on{opacity:1;pointer-events:auto;transform:none}
@media(min-width:900px){.subir{bottom:24px}}
.wa{position:fixed;left:16px;bottom:96px;width:52px;height:52px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:41;animation:flota 2.6s ease-in-out infinite}
@media(min-width:900px){.wa{bottom:24px}}
@keyframes flota{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.pegado{position:fixed;left:0;right:0;bottom:0;padding:9px 12px calc(9px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);backdrop-filter:blur(6px);box-shadow:0 -6px 18px -8px rgba(0,0,0,.3);transform:translateY(110%);transition:transform .3s;z-index:40}
.pegado.on{transform:none}.pegado .cta{margin:0}
@media(min-width:900px){.pegado{display:none}}
/* Aparecer al bajar */
[data-rev]{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s ease}
[data-rev].vis{opacity:1;transform:none}
/* Formulario emergente */
.modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-start;justify-content:center;z-index:60;overflow-y:auto;padding:16px 10px}
.modal.on{display:flex;animation:fondo .2s ease-out}
@keyframes fondo{from{background:rgba(0,0,0,0)}}
.caja{background:#fff;width:100%;max-width:410px;border-radius:10px;padding:16px 14px 18px;box-shadow:0 24px 60px rgba(0,0,0,.35);animation:entra .28s cubic-bezier(.2,.9,.3,1.2);margin:auto 0}
@keyframes entra{from{transform:translateY(24px) scale(.97);opacity:0}to{transform:none;opacity:1}}
.caja .top{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}
.caja .top h3{flex:1;margin:0;font:700 15px/1.35 Poppins,sans-serif}
.cerrar{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#333;padding:0 2px}
.caja .of{margin-bottom:12px;padding:11px 10px}.caja .of .tt b{font-size:14px}.caja .of .pp b{font-size:15.5px}
.resumen{background:#f7f7f7;border:1px solid var(--bd);border-radius:6px;padding:10px 8px;margin:4px 0 12px;font-size:13px}
.resumen div{display:flex;justify-content:space-between;padding:3px 0}
.resumen .rojo{color:#e11d48;font-weight:700}.resumen .tot{border-top:1px solid #ddd;margin-top:5px;padding-top:7px;font-weight:800;font-size:15px}
.campo{display:grid;grid-template-columns:96px 1fr;gap:8px;align-items:center;margin-bottom:10px}
.campo>label{font:700 12.5px/1.25 Poppins,sans-serif}.campo>label i{color:#e11d48;font-style:normal}
.grupo{display:flex;border:1px solid #c9c9c9;border-radius:5px;overflow:hidden;background:#fff;transition:border-color .15s,box-shadow .15s}
.grupo:focus-within{border-color:var(--b);box-shadow:0 0 0 3px color-mix(in srgb,var(--b) 18%,transparent)}
.grupo .ic{width:32px;display:grid;place-items:center;background:#e9ecef;border-right:1px solid #c9c9c9;color:#333;flex:0 0 auto}
.grupo input,.grupo select{flex:1;min-width:0;border:0;outline:0;padding:9px 9px;font-size:13.5px;background:#fff;color:#111}
.campo.mal .grupo{border-color:#e11d48;box-shadow:0 0 0 3px rgba(225,29,72,.12)}
.err{color:#e11d48;font-size:12.5px;min-height:1px;margin:2px 0 6px;text-align:center}
@media(max-width:420px){.campo{grid-template-columns:1fr;gap:4px}}
.comprar{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:6px;background:var(--b);color:#fff;font:800 13.5px/1.3 Poppins,sans-serif;padding:13px 10px;cursor:pointer;text-transform:uppercase;box-shadow:0 6px 16px -6px color-mix(in srgb,var(--b) 80%,transparent);animation:tada 4s ease-in-out infinite}
.comprar[disabled]{opacity:.7;animation:none;cursor:progress}
.seguro{display:flex;justify-content:center;gap:14px;font-size:11.5px;color:var(--m);margin-top:9px}
.ok{text-align:center;padding:12px 4px 6px}
.ok svg{width:74px;height:74px}
.ok circle{stroke:var(--b);stroke-width:3;fill:none;stroke-dasharray:200;stroke-dashoffset:200;animation:trazo .6s ease-out forwards}
.ok path{stroke:var(--b);stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:trazo .4s .5s ease-out forwards}
@keyframes trazo{to{stroke-dashoffset:0}}
.ok h3{font:800 22px Poppins,sans-serif;margin:10px 0 6px}.ok p{margin:0 0 10px;color:#333}
.confeti{position:fixed;inset:0;pointer-events:none;z-index:70;overflow:hidden}
.confeti i{position:absolute;top:-12px;width:8px;height:14px;border-radius:2px;animation:caer 2.6s ease-in forwards}
@keyframes caer{to{transform:translateY(105vh) rotate(720deg);opacity:.2}}
</style></head><body>
${tira.length ? `<div class="ticker" aria-label="${esc(anuncios.join(' · '))}"><div class="pista">${[...tira, ...tira].map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>` : ''}
${d.logo ? `<header><img src="${esc(d.logo)}" alt="${esc(d.nombreTienda)}"></header>` : ''}
${d.bannerSuperior ? `<div class="banner"><img src="${esc(d.bannerSuperior)}" alt=""></div>` : ''}
<main class="wrap"><section class="prod">
  <div class="info">
    ${d.calificacion > 0 ? `<div class="rating"><span>${estrellas(d.calificacion)}</span><span>${esc(d.calificacion.toFixed(1))}${d.resenas ? ` (${esc(d.resenas)})` : ''}</span></div>` : ''}
    ${d.mostrarTitulo ? `<h1>${esc(d.nombre)}</h1>` : `<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${esc(d.nombre)}</h1>`}
    ${!conOfertas && sel.precio ? `<div class="precio"><b>${pesos(sel.precio)}</b>${sel.precioAntes > sel.precio ? `<s>${pesos(sel.precioAntes)}</s>` : ''}${ahorro ? `<span class="ah">Ahorra ${ahorro}%</span>` : ''}</div>` : ''}
    ${d.destacado ? `<div class="dest">${I.check}<span>${esc(d.destacado)}</span></div>` : ''}
    <div class="ofertas" id="ofertas">${d.tituloOfertas ? `<h3>${esc(d.tituloOfertas)}</h3>` : ''}<div data-ofertas></div></div>
    <button class="cta" type="button" data-abrir>${I.carrito}<span class="tx"><span class="t1">${esc(d.boton)}</span>${d.botonSub ? `<span class="t2">${esc(d.botonSub)}</span>` : ''}</span></button>
    ${d.envioMax > 0 ? `<div class="envio">${I.camion}<div>Recibe tu pedido entre el <b>${esc(dia(d.envioMin))}</b> y <b>${esc(dia(d.envioMax))}</b>.</div></div>` : ''}
    ${d.beneficios.length ? `<div class="benef">${d.beneficios.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
    ${d.descripcion.trim() ? `<div class="desc">${formatoTexto(d.descripcion)}</div>` : ''}
  </div>
  <div class="media">
    <div class="principal">
      <div class="slides" id="slides">${(d.galeria.length ? d.galeria : ['']).map((g, i) => g ? `<img src="${esc(g)}" alt="${esc(d.nombre)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>` : '<div style="flex:0 0 100%;aspect-ratio:4/5;display:grid;place-items:center;color:#999">Agrega fotos del producto</div>').join('')}</div>
      ${d.galeria.length > 1 ? `<button class="flecha izq" data-dir="-1" aria-label="Anterior">‹</button><button class="flecha der" data-dir="1" aria-label="Siguiente">›</button><div class="puntos">${d.galeria.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    </div>
    ${d.galeria.length > 1 ? `<div class="miniaturas" id="miniaturas">${d.galeria.map((g, i) => `<img src="${esc(g)}" data-i="${i}" class="${i ? '' : 'on'}" alt="" loading="lazy">`).join('')}</div>` : ''}
  </div>
</section></main>
${d.imagenes.length ? `<section class="largas">${d.imagenes.map((g) => `<img src="${esc(g)}" alt="" loading="lazy" data-rev>`).join('')}</section>
<div class="otra" data-rev><button class="cta" type="button" data-abrir>${I.carrito}<span class="tx"><span class="t1">${esc(d.boton)}</span>${d.botonSub ? `<span class="t2">${esc(d.botonSub)}</span>` : ''}</span></button></div>` : ''}
${d.testimonios.length ? `<section class="testi">${d.tituloTestimonios ? `<h2 data-rev>${esc(d.tituloTestimonios)}</h2>` : ''}<div class="posts">${d.testimonios.map((t) => {
    const av = (src: string, n: string) => src ? `<img class="av" src="${esc(src)}" alt="" loading="lazy">` : `<span class="av" style="background:hsl(${(n.charCodeAt(0) || 0) * 37 % 360} 45% 52%)">${esc(n.slice(0, 1).toUpperCase())}</span>`;
    return `<article class="post" data-rev><div class="cab">${av(t.avatar, t.autor)}<div><div class="nm">${esc(t.autor)}</div><div class="tm">${esc(t.tiempo || 'Hace 1 día')}</div></div><span class="mas">···</span></div>${t.texto ? `<div class="tx">${esc(t.texto).replace(/\n/g, '<br>')}</div>` : ''}${t.imagen ? `<img class="img" src="${esc(t.imagen)}" alt="" loading="lazy">` : ''}<div class="rx"><span class="em"><i>👍</i><i>❤️</i><i>🥰</i></span><span>${esc(t.reacciones || '12')}</span>${t.comentarioTexto ? '<span class="cm">1 Comentario</span>' : ''}</div><div class="ac"><span>${I.megusta}Me gusta</span><span>${I.comentar}Comentar</span><span>${I.compartir}Compartir</span></div>${t.comentarioTexto ? `<div class="rep">${av(t.comentarioAvatar, t.comentarioAutor || 'A')}<div><div class="bur"><b>${esc(t.comentarioAutor || 'Cliente')}</b>${esc(t.comentarioTexto)}</div><div class="pie"><span>Hace 1 día</span><span>Me gusta</span><span>Responder</span></div></div></div>` : ''}</article>`;
  }).join('')}</div></section>` : ''}
<footer>${o.inicio ? `<a href="${esc(o.inicio)}" style="display:inline-block;color:#fff;font-weight:600;border:1px solid #444;border-radius:20px;padding:7px 16px;margin-bottom:12px;text-decoration:none">← Ver todos los productos</a><br>` : ''}© ${new Date().getFullYear()}, <b>${esc(d.nombreTienda || d.nombre)}</b> · Pago contra entrega en toda Colombia</footer>
<div class="pegado" id="pegado"><button class="cta" type="button" data-abrir>${I.carrito}<span class="tx"><span class="t1">${esc(d.boton)}</span>${d.botonSub ? `<span class="t2">${esc(d.botonSub)}</span>` : ''}</span></button></div>
<button class="subir" id="subir" type="button" aria-label="Volver arriba">${I.arriba}</button>
${d.whatsapp ? `<a class="wa" href="https://wa.me/${esc(d.whatsapp)}?text=${encodeURIComponent('Hola, quiero información de ' + d.nombre)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ''}
<div class="modal" id="modal" aria-hidden="true"><div class="caja" role="dialog" aria-modal="true" id="caja"></div></div>
<script>
(function(){
var C=${json(cfg)};
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var fmt=function(n){return '$'+Math.round(n).toLocaleString('es-CO')};
var escH=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var bi=C.inicial;
// Variante elegida para cada unidad (índices por opción). Se conserva al cambiar de oferta.
var uni=[];
function asegurar(n){while(uni.length<n)uni.push(C.opciones.map(function(){return 0}))}
asegurar(Math.max.apply(null,C.bundles.map(function(b){return b.cantidad})));
// Emoji de las cintas con animación propia
function cinta(t){return escH(t).replace(/(\\p{Extended_Pictographic}\\uFE0F?)/gu,'<i>$1</i>')}
function oferta(b,i){
  var on=i===bi;
  var h='<div class="of'+(on?' on':'')+'" data-b="'+i+'" role="radio" tabindex="0" aria-checked="'+on+'">'+(b.insignia?'<span class="cinta">'+cinta(b.insignia)+'</span>':'')+
    '<div class="fila"><span class="rad"></span>'+(b.imagen?'<img class="mini" src="'+escH(b.imagen)+'" alt="">':'')+'<div class="tt"><b>'+escH(b.titulo||(b.cantidad+' unidad'+(b.cantidad>1?'es':'')))+'</b>'+(b.subtitulo?'<span class="verde">'+escH(b.subtitulo)+'</span>':'')+'</div>'+
    '<div class="pp"><b>'+fmt(b.precio)+'</b>'+(b.precioAntes>b.precio?'<s>'+fmt(b.precioAntes)+'</s>':'')+'</div></div>';
  if(on&&C.opciones.length){
    h+='<div class="vars" style="--n:'+C.opciones.length+'"><div class="cab"><span></span>'+C.opciones.map(function(o){return '<span>'+escH(o.nombre)+'</span>'}).join('')+'</div>';
    for(var u=0;u<b.cantidad;u++){h+='<div class="u"><em>#'+(u+1)+'</em>'+C.opciones.map(function(o,oi){return '<select data-u="'+u+'" data-o="'+oi+'" aria-label="'+escH(o.nombre)+' unidad '+(u+1)+'">'+o.valores.map(function(v,vi){return '<option value="'+vi+'"'+(vi===uni[u][oi]?' selected':'')+'>'+escH(v.valor)+'</option>'}).join('')+'</select>'}).join('')+'</div>'}
    h+='</div>';
  }
  return h+'</div>';
}
function pintar(){
  $$('[data-ofertas]').forEach(function(c){c.innerHTML=C.bundles.map(oferta).join('');atar(c)});
  var r=$('#resumen');if(r)r.innerHTML=resumen();
  var bt=$('#comprar');if(bt&&!bt.disabled)bt.innerHTML=textoComprar();
}
function atar(c){
  $$('.of',c).forEach(function(el){
    var f=function(e){if(e&&e.target&&e.target.closest&&e.target.closest('select'))return;var n=+el.dataset.b;if(n===bi)return;bi=n;pintar()};
    el.onclick=f;el.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){if(e.target.tagName==='SELECT')return;e.preventDefault();f()}};
  });
  $$('select[data-u]',c).forEach(function(s){s.onchange=function(){uni[+s.dataset.u][+s.dataset.o]=+s.value;
    var f=C.opciones[+s.dataset.o].valores[+s.value].foto;if(f)verFoto(f);
    $$('select[data-u="'+s.dataset.u+'"][data-o="'+s.dataset.o+'"]').forEach(function(x){if(x!==s)x.value=s.value})}});
}
// Galería
var sl=$('#slides');
function irA(i){if(!sl)return;var n=sl.children.length;i=(i+n)%n;sl.scrollTo({left:i*sl.clientWidth,behavior:'smooth'})}
function verFoto(src){if(!sl)return;var k=$$('img',sl).findIndex(function(im){return im.getAttribute('src')===src});if(k>=0)irA(k)}
if(sl){sl.addEventListener('scroll',function(){var i=Math.round(sl.scrollLeft/sl.clientWidth);$$('#miniaturas img').forEach(function(t,k){t.classList.toggle('on',k===i)});$$('.puntos i').forEach(function(t,k){t.classList.toggle('on',k===i)})},{passive:true})}
$$('#miniaturas img').forEach(function(t){t.onclick=function(){irA(+t.dataset.i)}});
$$('.flecha').forEach(function(b){b.onclick=function(){irA(Math.round(sl.scrollLeft/sl.clientWidth)+(+b.dataset.dir))}});
// Aparecer al bajar, barra fija y botón de subir
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('vis');io.unobserve(e.target)}})},{rootMargin:'0px 0px -40px 0px'});
  $$('[data-rev]').forEach(function(el){io.observe(el)});
  var cta=$('.info .cta'),peg=$('#pegado');
  if(cta&&peg)new IntersectionObserver(function(e){peg.classList.toggle('on',!e[0].isIntersecting&&e[0].boundingClientRect.top<0)}).observe(cta);
}else $$('[data-rev]').forEach(function(el){el.classList.add('vis')});
var sub=$('#subir');window.addEventListener('scroll',function(){sub.classList.toggle('on',window.scrollY>700)},{passive:true});sub.onclick=function(){window.scrollTo({top:0,behavior:'smooth'})};
// Formulario contra entrega
var modal=$('#modal'),caja=$('#caja');
function cerrar(){modal.classList.remove('on');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';pintar()}
modal.addEventListener('mousedown',function(e){if(e.target===modal)cerrar()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal.classList.contains('on'))cerrar()});
function resumen(){var b=C.bundles[bi],sub=Math.max(b.precioAntes||0,b.precio),des=sub-b.precio;
  return '<div><span>Subtotal</span><b>'+fmt(sub)+'</b></div>'+(des>0?'<div><span>🏷️ Descuento</span><span class="rojo">-'+fmt(des)+'</span></div>':'')+'<div><span>Envío</span><b>Gratis</b></div><div class="tot"><span>Total</span><span>'+fmt(b.precio)+'</span></div>'}
function textoComprar(){return '${I.carrito.replace(/'/g, "\\'")}<span>'+escH(C.botonForm)+' - '+fmt(C.bundles[bi].precio)+'</span>'}
var ICO={persona:'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6z"/></svg>',tel:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',pin:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>',mail:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v14H3zm9 7 8-5H4z"/></svg>'};
function campo(nombre,label,ic,input,obl){return '<div class="campo" data-c="'+nombre+'"><label>'+label+(obl?' <i>*</i>':'')+'</label><div class="grupo">'+(ic?'<span class="ic">'+ICO[ic]+'</span>':'')+input+'</div></div>'}
function abrir(){
  var b=C.bundles[bi];
  if(window.fbq)fbq('track','InitiateCheckout',{value:b.precio,currency:'COP',num_items:b.cantidad});
  var deps=Object.keys(C.geo);
  caja.innerHTML='<div class="top"><h3>'+escH(C.tituloForm)+'</h3><button class="cerrar" type="button" aria-label="Cerrar">×</button></div><div data-ofertas></div>'+
  '<div class="resumen" id="resumen"></div><form id="f" novalidate>'+
  campo('nombre','Nombre completo','persona','<input name="nombre" autocomplete="given-name" placeholder="Ej: Camila Andrea">',1)+
  campo('apellido','Apellido completo','persona','<input name="apellido" autocomplete="family-name" placeholder="Ej: Rodríguez Lerma">',1)+
  campo('tel','Celular con WhatsApp','tel','<input name="tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="Ej: 3045675789">',1)+
  (C.pedirCorreo?campo('correo','Correo','mail','<input name="correo" type="email" autocomplete="email" placeholder="Opcional">',0):'')+
  campo('departamento','Departamento','','<select name="departamento"><option value="">Selecciona tu departamento</option>'+deps.map(function(d){return '<option>'+escH(d)+'</option>'}).join('')+'</select>',1)+
  campo('ciudad','Ciudad','','<select name="ciudad" disabled><option value="">Selecciona tu ciudad</option></select>',1)+
  campo('direccion','Dirección exacta','pin','<input name="direccion" autocomplete="street-address" placeholder="Ej: Calle 45 # 13-25">',1)+
  campo('barrio','Barrio / Referencia','pin','<input name="barrio" placeholder="#Casa / Torre / Apto / Barrio o referencia">',1)+
  '<div class="err" id="err"></div><button class="comprar" id="comprar" type="submit"></button><div class="seguro"><span>🔒 Compra segura</span><span>🚚 Envío gratis</span><span>💵 Pagas al recibir</span></div></form>';
  modal.classList.add('on');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';modal.scrollTop=0;
  pintar();
  $('.cerrar',caja).onclick=cerrar;
  var f=$('#f');f.onsubmit=enviar;
  f.elements.departamento.onchange=function(){var c=f.elements.ciudad,l=C.geo[this.value]||[];c.innerHTML='<option value="">Selecciona tu ciudad</option>'+l.map(function(x){return '<option>'+escH(x)+'</option>'}).join('');c.disabled=!l.length;if(l.length===1)c.value=l[0]};
  $$('input,select',f).forEach(function(x){x.addEventListener('input',function(){var c=x.closest('.campo');if(c)c.classList.remove('mal')})});
}
$$('[data-abrir]').forEach(function(b){b.onclick=abrir});
function confeti(){var c=document.createElement('div');c.className='confeti';var col=['#f43f5e','#f59e0b','#10b981','#3b82f6','#a855f7'];for(var i=0;i<70;i++){var p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.background=col[i%5];p.style.animationDelay=Math.random()*.6+'s';p.style.animationDuration=2+Math.random()*1.6+'s';c.appendChild(p)}document.body.appendChild(c);setTimeout(function(){c.remove()},4200)}
function enviar(e){
  e.preventDefault();var f=e.target,err=$('#err'),btn=$('#comprar'),b=C.bundles[bi];
  var v=function(n){var x=f.elements[n];return x?String(x.value||'').trim():''};
  var tel=v('tel').replace(/\\D/g,'').replace(/^57(?=3\\d{9}$)/,'');
  var malos=[];
  if(v('nombre').length<2)malos.push(['nombre','Escribe tu nombre.']);
  if(v('apellido').length<2)malos.push(['apellido','Escribe tu apellido.']);
  if(!/^3\\d{9}$/.test(tel))malos.push(['tel','Escribe un celular de 10 dígitos (empieza por 3).']);
  if(!v('departamento'))malos.push(['departamento','Elige tu departamento.']);
  if(!v('ciudad'))malos.push(['ciudad','Elige tu ciudad.']);
  if(v('direccion').length<5)malos.push(['direccion','Escribe la dirección completa.']);
  if(v('barrio').length<2)malos.push(['barrio','Escribe el barrio o una referencia.']);
  $$('.campo',f).forEach(function(c){c.classList.toggle('mal',malos.some(function(m){return m[0]===c.dataset.c}))});
  if(malos.length){err.textContent=malos[0][1];var x=f.elements[malos[0][0]];if(x)x.focus();return}
  var unidades=[];for(var u=0;u<(C.opciones.length?b.cantidad:0);u++)unidades.push(C.opciones.map(function(o,oi){return o.valores[uni[u][oi]].valor}));
  err.textContent='';
  if(C.vista){err.textContent='Vista previa: los pedidos se reciben cuando la landing esté publicada.';return}
  btn.disabled=true;btn.textContent='Enviando tu pedido…';
  fetch('/l/api/'+encodeURIComponent(C.id)+'/pedido',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bundle:bi,unidades:unidades,nombre:v('nombre'),apellido:v('apellido'),tel:tel,correo:v('correo'),departamento:v('departamento'),ciudad:v('ciudad'),direccion:v('direccion'),barrio:v('barrio'),url:location.href})})
  .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
  .then(function(r){
    if(!r.ok)throw new Error(r.j.error||'No pudimos recibir tu pedido.');
    if(window.fbq)fbq('track','Purchase',{value:b.precio,currency:'COP',content_name:C.nombre,num_items:b.cantidad},{eventID:r.j.eventId||''});
    caja.innerHTML='<div class="ok"><svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="32"/><path d="M23 38l9 9 19-20"/></svg><h3>¡Pedido recibido!</h3><p>'+escH(C.gracias)+'</p><p style="color:#6b7280;font-size:13px">Pedido #'+escH(r.j.numero)+' · Total '+fmt(b.precio)+'</p><button class="comprar" type="button" style="animation:none" id="listo">Listo</button></div>';
    $('#listo').onclick=cerrar;confeti();
  }).catch(function(x){btn.disabled=false;btn.innerHTML=textoComprar();err.textContent=x.message});
}
pintar();
})();
</script>
${o.vista ? GUARDA_VISTA : ''}
</body></html>`;
}

/** Página de inicio de la tienda: todos sus productos publicados (cada uno lleva a su landing). */
export function renderCatalogo(t: TiendaConfig, productos: ProductoCatalogo[], base: string, vista = false, origen = ''): string {
  const tira = t.anuncios.length ? Array.from({ length: Math.max(4, Math.ceil(8 / t.anuncios.length)) }, () => t.anuncios).flat() : [];
  const titulo = esc(t.nombre || 'Tienda');
  const url = origen ? origen + base : '';
  const abs = (u: string) => (u.startsWith('/') ? (origen || BASE_TIENDA) + u : u);
  const tituloSeo = t.seoTitulo || `${t.nombre || 'Tienda'}${t.titulo ? ' | ' + t.titulo : ''}`;
  const descSeo = t.seoDescripcion || t.descripcion || `${t.nombre}: ${productos.slice(0, 4).map((p) => p.nombre).join(', ')}. Pago contra entrega y envío a toda Colombia.`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: t.nombre, url: url || undefined, logo: t.logo ? abs(t.logo) : undefined },
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: productos.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: origen ? origen + base + p.slug : undefined, name: p.nombre })) },
  ];
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${cabeceraSeo({ titulo: tituloSeo, descripcion: descSeo, imagen: t.seoImagen || t.banner || productos[0]?.foto || t.logo, url, favicon: t.favicon || t.logo, sitio: t.nombre, color: t.colorPrincipal, tipo: 'website', jsonld, vista })}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${t.pixelMeta ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${t.pixelMeta}');fbq('track','PageView');</script>` : ''}
<style>
:root{--p:${t.colorPrincipal};--b:${t.colorBoton};--a:${t.colorAcento};--t:#121212;--m:#6b7280;--g:#f3f3f3}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--t);font:14px/1.5 Poppins,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}a{color:inherit}
.ticker{background:var(--p);color:#fff;overflow:hidden;white-space:nowrap}
.ticker .pista{display:inline-flex;animation:correr ${Math.max(18, tira.length * 3)}s linear infinite}
.ticker span{font:600 13.5px/1 Poppins,sans-serif;letter-spacing:.6px;text-transform:uppercase;padding:13px 0;margin:0 34px}
@keyframes correr{from{transform:translateX(0)}to{transform:translateX(-50%)}}
header{display:flex;justify-content:center;align-items:center;padding:16px;border-bottom:1px solid #eee}
header img{max-height:54px;width:auto}header b{font:800 22px Poppins,sans-serif;text-transform:uppercase;letter-spacing:2px}
.banner img{width:100%}
.hero{text-align:center;padding:30px 16px 6px;max-width:760px;margin:0 auto}
.hero h1{font:800 26px/1.2 Poppins,sans-serif;margin:0 0 8px}@media(min-width:900px){.hero h1{font-size:34px}}
.hero p{color:#444;margin:0}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;max-width:1200px;margin:0 auto;padding:22px 14px 40px}
@media(min-width:900px){.grid{grid-template-columns:repeat(4,1fr);gap:22px}}
.card{text-decoration:none;display:flex;flex-direction:column;opacity:0;transform:translateY(16px);animation:sube .6s ease forwards}
@keyframes sube{to{opacity:1;transform:none}}
.foto{position:relative;border-radius:12px;overflow:hidden;background:var(--g);aspect-ratio:4/5}
.foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transition:opacity .4s,transform .6s}
.foto img.dos{opacity:0}.card:hover .foto img.uno{transform:scale(1.04)}.card:hover .foto img.dos{opacity:1}
.desc{position:absolute;top:10px;left:10px;background:var(--b);color:#fff;font:700 11.5px Poppins,sans-serif;padding:4px 8px;border-radius:5px}
.st{color:#ffb400;font-size:12.5px;letter-spacing:1px;margin-top:9px}.st span{color:var(--m);letter-spacing:0;margin-left:4px}
.nm{font:600 14.5px/1.3 Poppins,sans-serif;margin:3px 0 4px}
.pr{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.pr b{font:800 16px Poppins,sans-serif}.pr s{color:#888;font-size:13px}
.ver{margin-top:9px;text-align:center;background:var(--b);color:#fff;border-radius:7px;padding:9px;font:700 13px Poppins,sans-serif;text-transform:uppercase;transition:transform .2s}
.card:hover .ver{transform:translateY(-2px)}
.vacio{text-align:center;color:var(--m);padding:60px 16px}
footer{background:#121212;color:#d4d4d4;text-align:center;font-size:12px;padding:26px 16px}footer b{color:#fff}
.wa{position:fixed;right:16px;bottom:20px;width:54px;height:54px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 6px 18px rgba(0,0,0,.25);animation:flota 2.6s ease-in-out infinite}
@keyframes flota{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
</style></head><body>
${tira.length ? `<div class="ticker"><div class="pista">${[...tira, ...tira].map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>` : ''}
<header>${t.logo ? `<img src="${esc(t.logo)}" alt="${titulo}">` : `<b>${titulo}</b>`}</header>
${t.banner ? `<div class="banner"><img src="${esc(t.banner)}" alt=""></div>` : ''}
${t.titulo || t.descripcion ? `<section class="hero">${t.titulo ? `<h1>${esc(t.titulo)}</h1>` : ''}${t.descripcion ? `<p>${esc(t.descripcion)}</p>` : ''}</section>` : ''}
${productos.length ? `<main class="grid">${productos.map((p, i) => {
    const off = p.precioAntes > p.precio ? Math.round((1 - p.precio / p.precioAntes) * 100) : 0;
    return `<a class="card" href="${esc(base + p.slug)}" style="animation-delay:${Math.min(i, 12) * 0.06}s"><div class="foto">${p.foto ? `<img class="uno" src="${esc(p.foto)}" alt="${esc(p.nombre)}" loading="${i < 4 ? 'eager' : 'lazy'}">` : ''}${p.foto2 ? `<img class="dos" src="${esc(p.foto2)}" alt="" loading="lazy">` : ''}${off ? `<span class="desc">-${off}%</span>` : ''}</div>${p.calificacion > 0 ? `<div class="st">${'★'.repeat(Math.round(p.calificacion))}<span>${esc(p.calificacion.toFixed(1))}</span></div>` : ''}<div class="nm">${esc(p.nombre)}</div><div class="pr"><b>${pesos(p.precio)}</b>${p.precioAntes > p.precio ? `<s>${pesos(p.precioAntes)}</s>` : ''}</div><div class="ver">Ver producto</div></a>`;
  }).join('')}</main>` : '<div class="vacio">Pronto tendremos productos disponibles.</div>'}
<footer>© ${new Date().getFullYear()}, <b>${titulo}</b> · Pago contra entrega en toda Colombia</footer>
${t.whatsapp ? `<a class="wa" href="https://wa.me/${esc(t.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ''}
${vista ? GUARDA_VISTA : ''}
</body></html>`;
}

/**
 * Página amable para cuando la tienda está pausada (sin membresía) o el producto ya no
 * existe: con el nombre y el logo de la tienda, en vez de una línea suelta en blanco.
 */
export function paginaNoDisponible(t: TiendaConfig | null, titulo: string, texto: string, enlace?: { href: string; texto: string }): string {
  const nombre = t?.nombre || 'Tienda';
  const color = t?.colorBoton || '#16a34a';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(titulo)} · ${esc(nombre)}</title>${t?.favicon ? `<link rel="icon" href="${esc(t.favicon)}">` : ''}
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;color:#111827;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px}
.c{max-width:420px;width:100%;background:#fff;border-radius:20px;padding:34px 26px;text-align:center;box-shadow:0 20px 50px -30px rgba(0,0,0,.35)}
.l{max-height:56px;max-width:180px;object-fit:contain;margin:0 auto 14px;display:block}.n{font-weight:800;font-size:20px;letter-spacing:.04em;margin-bottom:14px}
h1{font-size:21px;margin:0 0 8px}p{margin:0;color:#6b7280;line-height:1.55}a{display:inline-block;margin-top:20px;background:${esc(color)};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px}</style></head>
<body><div class="c">${t?.logo ? `<img class="l" src="${esc(t.logo)}" alt="${esc(nombre)}">` : `<div class="n">${esc(nombre.toUpperCase())}</div>`}
<h1>${esc(titulo)}</h1><p>${esc(texto)}</p>${enlace ? `<a href="${esc(enlace.href)}">${esc(enlace.texto)}</a>` : ''}</div></body></html>`;
}
