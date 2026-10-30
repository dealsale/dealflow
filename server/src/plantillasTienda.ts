/**
 * Plantillas de landing de la tienda (como los temas de Shopify).
 *
 * La tienda sube una plantilla HTML una sola vez (hecha a mano o con una IA) con marcas
 * como {{producto.nombre}}, {{precio}} o {{#fotos}}…{{/fotos}}, y cualquier landing la usa:
 * al mostrarse se llena con los datos de esa landing (nombre, precio, fotos, variantes,
 * ofertas, testimonios…). {{formulario}} pone el formulario contra entrega de DealFlow
 * ya listo; si la plantilla trae el suyo, basta con <form data-dealflow="pedido">.
 *
 * Lenguaje (tipo Mustache):
 *   {{x}}        texto (escapado)          {{{x}}}  HTML tal cual (p. ej. descripcion_html)
 *   {{#lista}}…{{/lista}}  repite por cada elemento (o muestra si es verdadero)
 *   {{^x}}…{{/x}} muestra si está vacío/falso      {{.}} el elemento actual
 */
import { db, uid, pj } from './db.js';
import { limpiarDatos, configTienda, type LandingDatos } from './landings.js';
import { formatoTexto } from './landingPlantillas.js';

db.exec(`CREATE TABLE IF NOT EXISTS landing_plantillas (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  html TEXT NOT NULL DEFAULT '',
  gracias TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
try { db.exec("ALTER TABLE landings ADD COLUMN plantilla_id TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

const MAX = 1_500_000;
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');

// ── Motor de plantillas ─────────────────────────────────────────────────
type Ctx = Record<string, unknown>;
function buscar(pila: unknown[], ruta: string): unknown {
  if (ruta === '.') return pila[pila.length - 1];
  const partes = ruta.split('.');
  for (let i = pila.length - 1; i >= 0; i--) {
    let v: unknown = pila[i];
    if (v && typeof v === 'object' && partes[0] in (v as Ctx)) {
      for (const p of partes) v = v && typeof v === 'object' ? (v as Ctx)[p] : undefined;
      return v;
    }
  }
  return undefined;
}
const vacio = (v: unknown) => v == null || v === false || v === '' || v === 0 || (Array.isArray(v) && !v.length);

/** Llena la plantilla con el contexto. Secciones anidadas, sin funciones ni código: seguro. */
export function llenar(plantilla: string, ctx: Ctx): string {
  const correr = (t: string, pila: unknown[], prof: number): string => {
    if (prof > 12) return '';
    let out = ''; let i = 0;
    const re = /\{\{(\{?)\s*([#^/]?)\s*([\w.]+|\.)\s*\}?\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      out += t.slice(i, m.index); i = re.lastIndex;
      const [, triple, tipo, nombre] = m;
      if (tipo === '#' || tipo === '^') {
        // Busca su cierre (respetando secciones con el mismo nombre adentro).
        const abre = new RegExp(`\\{\\{\\s*[#^]\\s*${nombre.replace(/\./g, '\\.')}\\s*\\}\\}`, 'g');
        const cierra = new RegExp(`\\{\\{\\s*/\\s*${nombre.replace(/\./g, '\\.')}\\s*\\}\\}`, 'g');
        let nivel = 1; let fin = -1; let finLargo = 0; let pos = i;
        while (nivel > 0) {
          abre.lastIndex = pos; cierra.lastIndex = pos;
          const a = abre.exec(t); const c = cierra.exec(t);
          if (!c) break;
          if (a && a.index < c.index) { nivel++; pos = a.index + a[0].length; } else { nivel--; pos = c.index + c[0].length; if (!nivel) { fin = c.index; finLargo = c[0].length; } }
        }
        if (fin < 0) continue; // sección sin cerrar: se ignora la marca
        const cuerpo = t.slice(i, fin);
        const v = buscar(pila, nombre);
        if (tipo === '^') { if (vacio(v)) out += correr(cuerpo, pila, prof + 1); }
        else if (Array.isArray(v)) out += v.map((x) => correr(cuerpo, [...pila, x], prof + 1)).join('');
        else if (!vacio(v)) out += correr(cuerpo, typeof v === 'object' ? [...pila, v] : pila, prof + 1);
        i = fin + finLargo; re.lastIndex = i;
        continue;
      }
      if (tipo === '/') continue;
      const v = buscar(pila, nombre);
      const s = v == null || typeof v === 'object' ? '' : String(v);
      out += triple ? s : esc(s);
    }
    return out + t.slice(i);
  };
  return correr(plantilla, [ctx], 0);
}

// ── Datos de la landing para la plantilla ──────────────────────────────
/** Formulario contra entrega de DealFlow para {{formulario}} (ofertas y variantes incluidas). */
function formularioDealFlow(d: LandingDatos): string {
  const ofertas = d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: '1 unidad', precio: d.precio }];
  const campo = (name: string, label: string, extra = '') => `<label class="df-campo"><span>${label}</span><input name="${name}" ${extra}></label>`;
  return `<form data-dealflow="pedido" class="df-form">
<style>.df-form{display:grid;gap:10px;font-family:inherit}.df-form .df-campo{display:grid;gap:4px;font-size:14px}.df-form input,.df-form select{padding:12px;border:1px solid #d1d5db;border-radius:10px;font:inherit;font-size:16px}.df-form .df-ofertas{display:grid;gap:8px}.df-form .df-oferta{display:flex;gap:10px;align-items:center;border:2px solid #e5e7eb;border-radius:12px;padding:12px;cursor:pointer}.df-form .df-oferta:has(input:checked){border-color:${d.colorBoton || '#16a34a'};background:#f0fdf4}.df-form .df-oferta b{margin-left:auto}.df-form button{padding:15px;border:0;border-radius:12px;background:${d.colorBoton || '#16a34a'};color:#fff;font:inherit;font-size:17px;font-weight:800;cursor:pointer}.df-form [data-dealflow=error]{color:#dc2626;font-size:14px}</style>
${ofertas.length > 1 ? `<div class="df-ofertas">${ofertas.map((b, i) => `<label class="df-oferta"><input type="radio" name="oferta" value="${i}"${i === (d.bundleInicial || 0) ? ' checked' : ''}><span>${esc(b.titulo)}</span><b>${pesos(b.precio)}</b></label>`).join('')}</div>` : ''}
${d.opciones.map((o) => `<label class="df-campo"><span>${esc(o.nombre)}</span><select name="${esc(o.nombre)}">${o.valores.map((v) => `<option>${esc(v.valor)}</option>`).join('')}</select></label>`).join('\n')}
${campo('nombre', 'Nombre', 'autocomplete="given-name" required')}${campo('apellido', 'Apellido', 'autocomplete="family-name" required')}
${campo('telefono', 'Celular (WhatsApp)', 'inputmode="tel" autocomplete="tel" required')}
${campo('departamento', 'Departamento', 'required')}${campo('ciudad', 'Ciudad', 'required')}
${campo('direccion', 'Dirección', 'autocomplete="street-address" required')}${campo('barrio', 'Barrio o referencia')}
${d.pedirCorreo ? campo('correo', 'Correo (opcional)', 'type="email"') : ''}
<div data-dealflow="error"></div>
<button type="submit">${esc(d.botonForm || "Hacer pedido · Pago contra entrega")}</button>
</form>`;
}

export function contextoLanding(l: Fila): Ctx {
  const d = limpiarDatos(pj(txt(l.datos), {}));
  const t = configTienda(txt(l.store_id));
  const ofertas = (d.bundles.length ? d.bundles : [{ cantidad: 1, titulo: '1 unidad', subtitulo: '', precio: d.precio, precioAntes: d.precioAntes, insignia: '', imagen: '' }])
    .map((b, i) => ({ indice: i, cantidad: b.cantidad, titulo: b.titulo, subtitulo: b.subtitulo, precio: pesos(b.precio), precio_numero: b.precio, precio_antes: b.precioAntes ? pesos(b.precioAntes) : '', insignia: b.insignia, imagen: b.imagen, elegida: i === (d.bundleInicial || 0) }));
  return {
    producto: { nombre: d.nombre, descripcion: d.descripcion, descripcion_html: formatoTexto(d.descripcion), destacado: d.destacado, calificacion: d.calificacion, resenas: d.resenas },
    nombre: d.nombre, precio: pesos(d.precio), precio_numero: d.precio, precio_antes: d.precioAntes ? pesos(d.precioAntes) : '',
    descuento: d.precioAntes > d.precio ? `${Math.round((1 - d.precio / d.precioAntes) * 100)}%` : '',
    descripcion_html: formatoTexto(d.descripcion),
    foto_principal: d.galeria[0] || '', fotos: d.galeria.map((url, i) => ({ url, i, primera: i === 0 })),
    imagenes: d.imagenes.map((url) => ({ url })), banner: d.bannerSuperior,
    ofertas, opciones: d.opciones.map((o) => ({ nombre: o.nombre, valores: o.valores.map((v) => ({ valor: v.valor, foto: v.foto })) })),
    testimonios: d.testimonios.map((x) => ({ autor: x.autor, texto: x.texto, imagen: x.imagen, avatar: x.avatar, tiempo: x.tiempo, reacciones: x.reacciones })),
    beneficios: d.beneficios.map((texto) => ({ texto })), anuncios: d.anuncios.map((texto) => ({ texto })),
    boton: d.boton, boton_sub: d.botonSub, titulo_ofertas: d.tituloOfertas, titulo_testimonios: d.tituloTestimonios, gracias: d.gracias,
    envio: { desde: d.envioMin, hasta: d.envioMax },
    tienda: { nombre: d.nombreTienda || t.nombre, logo: d.logo || t.logo, whatsapp: d.whatsapp || t.whatsapp },
    colores: { principal: d.colorPrincipal, boton: d.colorBoton, acento: d.colorAcento },
    seo: { titulo: d.seoTitulo || `${d.nombre}${d.nombreTienda ? ' | ' + d.nombreTienda : ''}`, descripcion: d.seoDescripcion, imagen: d.seoImagen || d.galeria[0] || '' },
    formulario: formularioDealFlow(d),
  };
}

/** HTML de la plantilla llena con una landing (antes de inyectar el script de DealFlow). */
export function renderPlantilla(html: string, l: Fila): string {
  // {{formulario}} es HTML: se pone sin escapar aunque lo escriban con dos llaves.
  return llenar(html.replace(/\{\{\s*formulario\s*\}\}/g, '{{{formulario}}}'), contextoLanding(l));
}

// ── CRUD ─────────────────────────────────────────────────────────────────
export interface PlantillaTienda { id: string; nombre: string; html: string; gracias: string; usos: number; updatedAt: string }
const aPlantilla = (r: Fila, storeId: string): PlantillaTienda => ({
  id: txt(r.id), nombre: txt(r.nombre), html: txt(r.html), gracias: txt(r.gracias), updatedAt: txt(r.updated_at),
  usos: (db.prepare('SELECT COUNT(*) n FROM landings WHERE store_id = ? AND plantilla_id = ?').get(storeId, r.id) as { n: number }).n,
});
export function listarPlantillas(storeId: string): PlantillaTienda[] {
  return (db.prepare('SELECT * FROM landing_plantillas WHERE store_id = ? ORDER BY updated_at DESC').all(storeId) as Fila[]).map((r) => aPlantilla(r, storeId));
}
export function plantillaDe(storeId: string, id: string): Fila | undefined {
  return id ? db.prepare('SELECT * FROM landing_plantillas WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined : undefined;
}
export function guardarPlantilla(storeId: string, id: string | null, b: { nombre?: unknown; html?: unknown; gracias?: unknown }): PlantillaTienda | { error: string } {
  const nombre = txt(b.nombre).trim().slice(0, 80);
  const html = b.html === undefined ? undefined : txt(b.html);
  const gracias = b.gracias === undefined ? undefined : txt(b.gracias);
  if ((html?.length || 0) > MAX || (gracias?.length || 0) > MAX) return { error: 'La plantilla pesa más de 1,5 MB. Deja las imágenes por URL en vez de pegarlas dentro del HTML.' };
  if (!id) {
    if (!nombre) return { error: 'Ponle un nombre a la plantilla.' };
    id = uid();
    db.prepare('INSERT INTO landing_plantillas (id, store_id, nombre, html, gracias) VALUES (?,?,?,?,?)').run(id, storeId, nombre, html || '', gracias || '');
  } else {
    if (!plantillaDe(storeId, id)) return { error: 'Plantilla no encontrada.' };
    if (nombre) db.prepare("UPDATE landing_plantillas SET nombre = ?, updated_at = datetime('now') WHERE id = ?").run(nombre, id);
    if (html !== undefined) db.prepare("UPDATE landing_plantillas SET html = ?, updated_at = datetime('now') WHERE id = ?").run(html, id);
    if (gracias !== undefined) db.prepare("UPDATE landing_plantillas SET gracias = ?, updated_at = datetime('now') WHERE id = ?").run(gracias, id);
  }
  return aPlantilla(plantillaDe(storeId, id)!, storeId);
}
export function borrarPlantilla(storeId: string, id: string): { ok: true } | { error: string } {
  const n = (db.prepare('SELECT COUNT(*) n FROM landings WHERE store_id = ? AND plantilla_id = ?').get(storeId, id) as { n: number }).n;
  if (n) return { error: `Esta plantilla la usan ${n} landing${n === 1 ? '' : 's'}: cámbiales el diseño primero.` };
  db.prepare('DELETE FROM landing_plantillas WHERE id = ? AND store_id = ?').run(id, storeId);
  return { ok: true };
}
/** Pone (o quita, con '') la plantilla de una landing. */
export function usarPlantilla(storeId: string, landingId: string, plantillaId: string): { ok: true } | { error: string } {
  if (plantillaId && !plantillaDe(storeId, plantillaId)) return { error: 'Plantilla no encontrada.' };
  const r = db.prepare("UPDATE landings SET plantilla_id = ?, modo_codigo = CASE WHEN ? != '' THEN 0 ELSE modo_codigo END, updated_at = datetime('now') WHERE id = ? AND store_id = ?").run(plantillaId, plantillaId, landingId, storeId);
  return r.changes ? { ok: true } : { error: 'Landing no encontrada.' };
}

/** Plantilla de ejemplo para empezar: muestra todas las marcas. */
export const EJEMPLO = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{seo.titulo}}</title>
<meta name="description" content="{{seo.descripcion}}">
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fff}
  .anuncio{background:{{colores.principal}};color:#fff;text-align:center;font-size:13px;font-weight:700;padding:8px}
  main{max-width:560px;margin:0 auto;padding:16px}
  .galeria img{width:100%;border-radius:14px;display:block;margin-bottom:8px}
  h1{font-size:26px;margin:12px 0 4px}
  .precio{font-size:28px;font-weight:900;color:{{colores.boton}}}
  .antes{text-decoration:line-through;color:#9ca3af;margin-left:8px}
  .testimonio{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:8px 0}
  .largas img{width:100%;display:block}
</style>
</head>
<body>
{{#anuncios}}<div class="anuncio">{{texto}}</div>{{/anuncios}}
<main>
  <div class="galeria">{{#fotos}}<img src="{{url}}" alt="{{nombre}}">{{/fotos}}</div>
  <h1>{{producto.nombre}}</h1>
  <div><span class="precio">{{precio}}</span>{{#precio_antes}}<span class="antes">{{precio_antes}}</span>{{/precio_antes}}</div>
  <ul>{{#beneficios}}<li>{{texto}}</li>{{/beneficios}}</ul>

  <h2>Haz tu pedido · Pago contra entrega</h2>
  {{formulario}}

  <div>{{{descripcion_html}}}</div>
  <div class="largas">{{#imagenes}}<img src="{{url}}" alt="">{{/imagenes}}</div>

  {{#testimonios}}<div class="testimonio"><b>{{autor}}</b><p>{{texto}}</p>{{#imagen}}<img src="{{imagen}}" alt="" style="width:100%;border-radius:8px">{{/imagen}}</div>{{/testimonios}}
</main>
</body>
</html>`;

/** Guía de las marcas para pegarle a una IA. */
export const GUIA_IA = `Vas a crear una PLANTILLA de landing para DealFlow (venta contra entrega en Colombia). Es un archivo .html completo que se llena solo con los datos de cada producto usando marcas tipo Mustache:
- {{x}} pone un texto. {{{x}}} pone HTML (solo para descripcion_html y formulario).
- {{#lista}} … {{/lista}} repite por cada elemento. {{^x}} … {{/x}} se muestra si x está vacío.
Datos disponibles:
- {{producto.nombre}} {{precio}} {{precio_antes}} {{descuento}} {{{descripcion_html}}} {{producto.destacado}} {{producto.calificacion}} {{producto.resenas}}
- {{foto_principal}} y {{#fotos}}<img src="{{url}}">{{/fotos}} (galería) · {{#imagenes}}{{url}}{{/imagenes}} (imágenes largas de abajo) · {{banner}}
- {{#ofertas}} {{titulo}} {{precio}} {{precio_antes}} {{cantidad}} {{insignia}} {{indice}} {{/ofertas}}
- {{#opciones}} {{nombre}} {{#valores}}{{valor}}{{/valores}} {{/opciones}} (tallas, colores…)
- {{#testimonios}} {{autor}} {{texto}} {{imagen}} {{avatar}} {{tiempo}} {{/testimonios}} · {{#beneficios}}{{texto}}{{/beneficios}} · {{#anuncios}}{{texto}}{{/anuncios}}
- {{tienda.nombre}} {{tienda.logo}} {{tienda.whatsapp}} · {{colores.principal}} {{colores.boton}} {{colores.acento}} · {{seo.titulo}} {{seo.descripcion}} {{seo.imagen}} · {{boton}} {{boton_sub}}
Formulario de compra:
- Lo más fácil: escribe {{formulario}} donde va el formulario y DealFlow pone uno completo (ofertas, variantes, datos de envío).
- Si haces el tuyo: <form data-dealflow="pedido"> con campos name="nombre", "apellido", "telefono", "departamento", "ciudad", "direccion", "barrio"; la oferta en name="oferta" con el {{indice}} de la oferta; cada variante en un campo con el nombre del grupo (name="{{nombre}}" dentro de {{#opciones}}); y <div data-dealflow="error"></div>.
- No agregues el script de DealFlow ni el píxel de Meta: se ponen solos. No envíes el formulario a otra URL.
- Todo el CSS y JS va dentro del archivo; las imágenes por URL. Debe verse perfecto en celular.`;
