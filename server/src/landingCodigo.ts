/**
 * Modo código de las landings: la tienda puede reemplazar el diseño del editor por su
 * propio HTML (hecho a mano o con una IA como Claude o Astra) para la página del producto
 * y para la página de gracias (el embudo). El pedido sigue entrando a DealFlow: el
 * script de DealFlow (/l/sdk.js) se inyecta solo y conecta cualquier
 * <form data-dealflow="pedido">.
 *
 * Seguridad: el código propio es de la tienda y puede traer scripts de cualquier lado.
 * En su dominio (tutienda.com o <tienda>.dflw.store) corre normal, porque ahí no hay
 * sesión de DealFlow. En app.dealflow.sbs/l/… se sirve AISLADO (CSP sandbox, origen
 * opaco): no puede leer cookies ni usar la sesión del panel.
 */
import { db, pj } from './db.js';
import { limpiarDatos, configTienda, type LandingDatos } from './landings.js';
import { plantillaDe, renderPlantilla } from './plantillasTienda.js';

for (const col of ["codigo TEXT NOT NULL DEFAULT ''", "codigo_gracias TEXT NOT NULL DEFAULT ''", 'modo_codigo INTEGER NOT NULL DEFAULT 0']) {
  try { db.exec(`ALTER TABLE landings ADD COLUMN ${col}`); } catch { /* ya existe */ }
}

const MAX = 1_500_000; // 1,5 MB por página
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

export interface CodigoLanding { modo: boolean; codigo: string; gracias: string; avisos: string[] }

/** Lo que el formulario necesita para crear pedidos; si falta, se avisa. */
export function revisarCodigo(html: string, tipo: 'landing' | 'gracias'): string[] {
  const a: string[] = [];
  if (!html.trim()) return a;
  if (!/<html[\s>]|<body[\s>]/i.test(html)) a.push('No parece una página completa (falta <html> o <body>). Igual se muestra, pero revisa que sea el archivo .html entero.');
  if (tipo === 'landing' && !/data-dealflow\s*=\s*["']?pedido/i.test(html) && !/\/l\/api\//.test(html)) {
    a.push('Ningún formulario tiene data-dealflow="pedido": así la página NO crea pedidos en DealFlow. Agrégalo al <form> donde el cliente deja sus datos.');
  }
  if (tipo === 'landing' && /data-dealflow\s*=\s*["']?pedido/i.test(html)) {
    for (const campo of ['nombre', 'telefono|tel|celular|whatsapp', 'ciudad', 'departamento', 'direccion']) {
      if (!new RegExp(`name\\s*=\\s*["']?(${campo})["'\\s>]`, 'i').test(html)) a.push(`Falta un campo name="${campo.split('|')[0]}" en el formulario.`);
    }
  }
  return a;
}

export function verCodigo(storeId: string, id: string): CodigoLanding | null {
  const r = db.prepare('SELECT codigo, codigo_gracias, modo_codigo FROM landings WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!r) return null;
  return { modo: !!r.modo_codigo, codigo: txt(r.codigo), gracias: txt(r.codigo_gracias), avisos: [...revisarCodigo(txt(r.codigo), 'landing'), ...revisarCodigo(txt(r.codigo_gracias), 'gracias')] };
}

export function guardarCodigo(storeId: string, id: string, b: { modo?: unknown; codigo?: unknown; gracias?: unknown }): CodigoLanding | { error: string } {
  const r = db.prepare('SELECT id FROM landings WHERE id = ? AND store_id = ?').get(id, storeId);
  if (!r) return { error: 'Landing no encontrada.' };
  if (b.codigo !== undefined) {
    const c = txt(b.codigo);
    if (c.length > MAX) return { error: 'El código de la página pesa más de 1,5 MB. Sube las imágenes al editor y usa sus enlaces en vez de pegarlas dentro del HTML.' };
    db.prepare("UPDATE landings SET codigo = ?, updated_at = datetime('now') WHERE id = ?").run(c, id);
  }
  if (b.gracias !== undefined) {
    const g = txt(b.gracias);
    if (g.length > MAX) return { error: 'El código de la página de gracias pesa más de 1,5 MB.' };
    db.prepare("UPDATE landings SET codigo_gracias = ?, updated_at = datetime('now') WHERE id = ?").run(g, id);
  }
  if (b.modo !== undefined) {
    const on = b.modo === true;
    if (on && !txt((db.prepare('SELECT codigo FROM landings WHERE id = ?').get(id) as Fila).codigo).trim()) return { error: 'Primero pega o sube el código de la página.' };
    db.prepare("UPDATE landings SET modo_codigo = ?, updated_at = datetime('now') WHERE id = ?").run(on ? 1 : 0, id);
  }
  return verCodigo(storeId, id)!;
}

/** Datos públicos para el script de DealFlow (nada privado de la tienda). */
function configPublica(l: Fila, d: LandingDatos, base: string, vista: boolean): Record<string, unknown> {
  const tienda = configTienda(txt(l.store_id));
  const bundles = d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: '1 unidad', subtitulo: '', precio: d.precio, precioAntes: d.precioAntes, insignia: '', imagen: '' }];
  return {
    id: txt(l.id), slug: txt(l.slug), nombre: d.nombre, precio: d.precio, precioAntes: d.precioAntes,
    ofertas: bundles.map((b, i) => ({ indice: i, cantidad: b.cantidad, titulo: b.titulo, precio: b.precio, precioAntes: b.precioAntes })),
    opciones: d.opciones.map((o) => ({ nombre: o.nombre, valores: o.valores.map((v) => v.valor) })),
    pixel: vista ? '' : d.pixelMeta || tienda.pixelMeta || '', gracias: d.gracias,
    urlGracias: tieneGracias(l) ? `${base}${txt(l.slug)}/gracias` : '',
    tienda: d.nombreTienda || tienda.nombre, whatsapp: d.whatsapp || tienda.whatsapp, vista,
  };
}

/** ¿La landing tiene página de gracias propia (en su código o en su plantilla)? */
function tieneGracias(l: Fila): boolean {
  if (l.modo_codigo && txt(l.codigo).trim()) return !!txt(l.codigo_gracias).trim();
  const p = plantillaDe(txt(l.store_id), txt(l.plantilla_id));
  return !!(p && txt(p.gracias).trim());
}

/**
 * HTML público de una landing que NO usa el diseño del editor: su código propio (modo
 * código) o la plantilla de la tienda que tenga elegida, ya con el script de DealFlow.
 * null = se muestra con el diseño del editor.
 */
export function htmlPublico(l: Fila, tipo: 'landing' | 'gracias', base: string): string | null {
  if (l.modo_codigo && txt(l.codigo).trim()) {
    return paginaCodigo(l, tipo, base, false, tipo === 'gracias' && !txt(l.codigo_gracias).trim() ? graciasPorDefecto(l) : undefined);
  }
  const p = plantillaDe(txt(l.store_id), txt(l.plantilla_id));
  if (p && txt(p.html).trim()) {
    const fuente = tipo === 'gracias' ? (txt(p.gracias).trim() ? renderPlantilla(txt(p.gracias), l) : graciasPorDefecto(l)) : renderPlantilla(txt(p.html), l);
    return paginaCodigo(l, tipo, base, false, fuente);
  }
  return tipo === 'gracias' ? paginaCodigo(l, 'gracias', base, false, graciasPorDefecto(l)) : null;
}

const json = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');

/** El HTML de la tienda con el script de DealFlow inyectado al final del <body>. */
export function paginaCodigo(l: Fila, tipo: 'landing' | 'gracias', base: string, vista = false, codigoForzado?: string): string {
  const d = limpiarDatos(pj(txt(l.datos), {}));
  const html = codigoForzado ?? (tipo === 'gracias' ? txt(l.codigo_gracias) : txt(l.codigo));
  const inyectar = `\n<script>window.__DF=${json({ ...configPublica(l, d, base, vista), pagina: tipo })}</script>\n<script src="/l/sdk.js" defer></script>\n`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${inyectar}</body>`) : html + inyectar;
}

/** Cabeceras para servir código propio: aislado fuera del dominio de la tienda. */
export function cabecerasCodigo(aislado: boolean): Record<string, string> {
  const h: Record<string, string> = { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  if (aislado) h['Content-Security-Policy'] = 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-top-navigation-by-user-activation';
  return h;
}

/** Página de gracias por defecto (si la tienda no subió la suya). */
export function graciasPorDefecto(l: Fila): string {
  const d = limpiarDatos(pj(txt(l.datos), {}));
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>¡Gracias por tu compra!</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#111;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}main{background:#fff;border-radius:16px;padding:28px 22px;max-width:440px;text-align:center;box-shadow:0 10px 30px -18px rgba(0,0,0,.3)}h1{font-size:24px;margin:8px 0}p{color:#4b5563;line-height:1.5}</style></head>
<body><main><div style="font-size:46px">✅</div><h1>¡Pedido recibido!</h1><p>${esc(d.gracias || 'Te escribiremos por WhatsApp para confirmar tu pedido.')}</p><p style="font-size:13px;color:#6b7280">Pedido <b data-dealflow="numero"></b></p></main></body></html>`;
}

/** Script de DealFlow para las landings en modo código. */
export const SDK = String.raw`(function(){
"use strict";
var C=window.__DF||{};var D=window.DealFlow={config:C};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var norm=function(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'')};
var fmt=D.formatear=function(n){return '$'+Math.round(n||0).toLocaleString('es-CO')};
// Píxel de Meta (si la tienda lo configuró y el código no lo trae ya).
if(C.pixel&&!window.fbq){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',C.pixel);fbq('track','PageView');if(C.pagina==='landing')fbq('track','ViewContent',{content_name:C.nombre,value:C.precio,currency:'COP'})}
// Rellena lo que el código marque: precio, nombre, ofertas y opciones vacías.
function rellenar(){
  $$('[data-dealflow="precio"]').forEach(function(e){e.textContent=fmt(C.precio)});
  $$('[data-dealflow="precio-antes"]').forEach(function(e){if(C.precioAntes)e.textContent=fmt(C.precioAntes)});
  $$('[data-dealflow="producto"]').forEach(function(e){e.textContent=C.nombre||''});
  $$('select[name="oferta"]').forEach(function(s){if(s.options.length)return;(C.ofertas||[]).forEach(function(o){var op=document.createElement('option');op.value=o.indice;op.textContent=o.titulo+' - '+fmt(o.precio);s.appendChild(op)})});
  (C.opciones||[]).forEach(function(o){$$('select').forEach(function(s){if(norm(s.name)!==norm(o.nombre)||s.options.length)return;o.valores.forEach(function(v){var op=document.createElement('option');op.value=v;op.textContent=v;s.appendChild(op)})})});
  var q=new URLSearchParams(location.search);
  $$('[data-dealflow="numero"]').forEach(function(e){e.textContent=q.get('pedido')?'#'+q.get('pedido'):''});
  $$('[data-dealflow="total"]').forEach(function(e){if(q.get('total'))e.textContent=fmt(Number(q.get('total')))});
}
function campo(f,nombres){for(var i=0;i<nombres.length;i++){var x=f.elements[nombres[i]];if(x&&x.value!=null&&String(x.value).trim())return String(x.value).trim()}return ''}
function oferta(f){
  var o=C.ofertas||[];var v=campo(f,['oferta','bundle']);if(v!==''&&o[Number(v)])return Number(v);
  var c=Number(campo(f,['cantidad','unidades']));if(c){for(var i=0;i<o.length;i++)if(o[i].cantidad===c)return i}
  return 0;
}
/** Crea el pedido en DealFlow. datos: {nombre, apellido, telefono, departamento, ciudad, direccion, barrio, correo, oferta, variantes:{Talla:'M'}} */
D.pedido=function(x){
  x=x||{};var o=(C.ofertas||[])[x.oferta||0]||{cantidad:1,precio:C.precio};
  var vals=(C.opciones||[]).map(function(op){var pedido=(x.variantes||{})[op.nombre];for(var k in (x.variantes||{}))if(norm(k)===norm(op.nombre))pedido=x.variantes[k];var ok=op.valores.filter(function(v){return norm(v)===norm(pedido)})[0];return ok||op.valores[0]});
  var unidades=[];for(var u=0;u<((C.opciones||[]).length?o.cantidad:0);u++)unidades.push(vals);
  if(C.vista)return Promise.reject(new Error('Vista previa: los pedidos se reciben cuando la landing esté publicada.'));
  return fetch('/l/api/'+encodeURIComponent(C.id)+'/pedido',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bundle:x.oferta||0,unidades:unidades,nombre:x.nombre||'',apellido:x.apellido||'',tel:String(x.telefono||'').replace(/\D/g,'').replace(/^57(?=3\d{9}$)/,''),correo:x.correo||'',departamento:x.departamento||'',ciudad:x.ciudad||'',direccion:x.direccion||'',barrio:x.barrio||'',url:location.href})})
  .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'No pudimos recibir tu pedido.');
    if(window.fbq)fbq('track','Purchase',{value:o.precio,currency:'COP',content_name:C.nombre,num_items:o.cantidad},{eventID:j.eventId||''});
    var ev;try{ev=new CustomEvent('dealflow:pedido',{detail:{numero:j.numero,total:o.precio}})}catch(e){}if(ev)document.dispatchEvent(ev);
    return {numero:j.numero,total:o.precio}})});
};
function mostrarError(f,m){var e=f.querySelector('[data-dealflow="error"]');if(e){e.textContent=m;e.style.display=''}else alert(m)}
function atar(f){
  if(f.__df)return;f.__df=1;
  f.addEventListener('submit',function(ev){
    ev.preventDefault();
    var nombre=campo(f,['nombre','name','nombres']),tel=campo(f,['telefono','tel','celular','whatsapp','phone']).replace(/\D/g,'').replace(/^57(?=3\d{9}$)/,'');
    if(nombre.length<2)return mostrarError(f,'Escribe tu nombre.');
    if(!/^3\d{9}$/.test(tel))return mostrarError(f,'Escribe un celular de 10 dígitos (empieza por 3).');
    if(!campo(f,['departamento']))return mostrarError(f,'Escribe tu departamento.');
    if(!campo(f,['ciudad']))return mostrarError(f,'Escribe tu ciudad.');
    if(campo(f,['direccion','address']).length<5)return mostrarError(f,'Escribe la dirección completa.');
    var variantes={};(C.opciones||[]).forEach(function(op){for(var i=0;i<f.elements.length;i++){var el=f.elements[i];if(el.name&&norm(el.name)===norm(op.nombre)&&(el.type!=='radio'||el.checked))variantes[op.nombre]=el.value}});
    var btn=f.querySelector('[type="submit"],button:not([type])');var txtBtn=btn&&btn.innerHTML;if(btn){btn.disabled=true;btn.textContent='Enviando tu pedido…'}
    var e0=f.querySelector('[data-dealflow="error"]');if(e0)e0.textContent='';
    D.pedido({nombre:nombre,apellido:campo(f,['apellido','apellidos']),telefono:tel,departamento:campo(f,['departamento']),ciudad:campo(f,['ciudad']),direccion:campo(f,['direccion','address']),barrio:campo(f,['barrio','referencia']),correo:campo(f,['correo','email']),oferta:oferta(f),variantes:variantes})
    .then(function(r){
      if(C.urlGracias){location.href=C.urlGracias+'?pedido='+encodeURIComponent(r.numero)+'&total='+r.total;return}
      f.innerHTML='<div style="text-align:center;padding:18px"><div style="font-size:40px">✅</div><h3 style="margin:6px 0">¡Pedido recibido!</h3><p>'+String(C.gracias||'').replace(/</g,'&lt;')+'</p><p style="font-size:13px;opacity:.7">Pedido #'+r.numero+' · Total '+fmt(r.total)+'</p></div>';
    }).catch(function(x){if(btn){btn.disabled=false;btn.innerHTML=txtBtn}mostrarError(f,x.message)});
  });
}
function iniciar(){rellenar();$$('form[data-dealflow="pedido"]').forEach(atar);if(window.fbq&&C.pagina==='landing')$$('form[data-dealflow="pedido"] input').slice(0,1).forEach(function(i){i.addEventListener('focus',function(){if(!i.__ic){i.__ic=1;fbq('track','InitiateCheckout',{value:C.precio,currency:'COP'})}})})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();`;

/** Instrucciones para pegarle a una IA (Claude, Astra…) junto con el código. */
export function instruccionesIA(l: Fila): string {
  const d = limpiarDatos(pj(txt(l.datos), {}));
  const ops = d.opciones.map((o) => `${o.nombre}: ${o.valores.map((v) => v.valor).join(', ')}`).join(' | ') || 'sin variantes';
  const ofertas = (d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: '1 unidad', precio: d.precio }]).map((b, i) => `${i} = ${b.titulo} (${b.cantidad} und, $${b.precio})`).join(' | ');
  return `Estás editando una landing de DealFlow (venta contra entrega en Colombia). Reglas para que los pedidos sigan llegando:
1. Entrega SIEMPRE un archivo .html completo (<!doctype html> … </html>), con todo el CSS y el JS adentro. Las imágenes van por URL.
2. El formulario de compra debe ser <form data-dealflow="pedido"> con estos campos (atributo name): nombre, apellido, telefono, departamento, ciudad, direccion, barrio (opcional), correo (opcional).
3. La oferta elegida va en un campo name="oferta" con el número de la oferta (${ofertas}). Puede ser <select name="oferta"></select> vacío: DealFlow lo llena solo.
4. Las variantes van en campos con el nombre del grupo: ${ops}. Ej.: <select name="${d.opciones[0]?.nombre || 'Talla'}"></select> vacío (DealFlow lo llena) o radios con esos valores exactos.
5. Pon un <div data-dealflow="error"></div> dentro del formulario para los mensajes de error.
6. Puedes usar <span data-dealflow="precio"></span> y <span data-dealflow="producto"></span>: DealFlow pone el precio y el nombre.
7. NO agregues el script de DealFlow ni el píxel de Meta: DealFlow los pone solos al publicar. No envíes el formulario a otra URL.
8. Página de gracias (opcional, otro archivo): usa <b data-dealflow="numero"></b> y <span data-dealflow="total"></span> para mostrar el número y el total del pedido.
Producto: ${d.nombre}. Precio: $${d.precio}.`;
}
