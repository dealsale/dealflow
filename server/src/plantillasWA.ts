/**
 * Plantillas de WhatsApp POR TIENDA (todo se enciende por tienda desde el panel del equipo):
 *
 *  1. Interruptores: constructor de plantillas, plantilla propia por automatización y
 *     plantillas con documento (PDF) adjunto. Apagados por defecto.
 *  2. Revisión de riesgo antes de mandar a Meta: lo que suena a promoción en una plantilla
 *     de "Utilidad" hace que Meta la pase a Marketing (o la rechace) y castiga la cuenta.
 *  3. Bases de DealFlow que la tienda personaliza (ya escritas como Utilidad).
 *  4. Por automatización (confirmación, guía, estado del envío, novedad) la tienda elige UNA
 *     de sus plantillas aprobadas como Utilidad y qué dato va en cada {{n}}.
 *  5. Encabezado con documento: el PDF de la guía (automático) o un archivo fijo de la tienda.
 *  6. Vigilancia: si Meta la pasa a Marketing, la pausa, la rechaza o su calidad cae a roja,
 *     la automatización deja de usarla (vuelve a la de DealFlow) y queda el aviso.
 */
import { existsSync, readFileSync } from 'node:fs';
import { db, pj, registrarLog, uid } from './db.js';
import { mediaPath } from './media.js';
import { plantillaPropia, plantillasPropias, sincronizarPlantillasTienda, componentesEnvio, type PlantillaPropia } from './plantillasMeta.js';
import type { Campo } from './llenarPlantilla.js';

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

// ── 1. Interruptores por tienda ─────────────────────────────────────────
for (const col of ['wa_tpl_constructor', 'wa_tpl_auto', 'wa_tpl_doc']) {
  try { db.exec(`ALTER TABLE stores ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`); } catch { /* ya existe */ }
}
try { db.exec("ALTER TABLE wa_plantillas_meta ADD COLUMN calidad TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }
try { db.exec("ALTER TABLE meta_template_pub ADD COLUMN categoria_meta TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

db.exec(`CREATE TABLE IF NOT EXISTS wa_tpl_creadas (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, nombre TEXT NOT NULL, idioma TEXT NOT NULL DEFAULT 'es',
  categoria_pedida TEXT NOT NULL DEFAULT 'UTILITY', campos TEXT NOT NULL DEFAULT '[]', base TEXT NOT NULL DEFAULT '',
  meta_id TEXT NOT NULL DEFAULT '', riesgo TEXT NOT NULL DEFAULT '', creada_por TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS wa_tpl_auto (
  store_id TEXT NOT NULL, clave TEXT NOT NULL, meta_id TEXT NOT NULL, mapa TEXT NOT NULL DEFAULT '[]',
  doc TEXT NOT NULL DEFAULT '{}', estado TEXT NOT NULL DEFAULT 'activa', motivo TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (store_id, clave)
)`);

export interface PermisosPlantillas { crear: boolean; automatizaciones: boolean; documentos: boolean }
export function permisosPlantillas(storeId: string): PermisosPlantillas {
  const s = db.prepare('SELECT wa_tpl_constructor c, wa_tpl_auto a, wa_tpl_doc d FROM stores WHERE id = ?').get(storeId) as { c: number; a: number; d: number } | undefined;
  return { crear: !!s?.c, automatizaciones: !!s?.a, documentos: !!s?.d };
}
export function guardarPermisos(storeId: string, p: Partial<PermisosPlantillas>): string[] {
  const hecho: string[] = [];
  const col: Record<keyof PermisosPlantillas, [string, string]> = {
    crear: ['wa_tpl_constructor', 'constructor de plantillas'], automatizaciones: ['wa_tpl_auto', 'plantillas por automatización'], documentos: ['wa_tpl_doc', 'plantillas con documento'],
  };
  for (const k of Object.keys(col) as (keyof PermisosPlantillas)[]) {
    if (typeof p[k] !== 'boolean') continue;
    db.prepare(`UPDATE stores SET ${col[k][0]} = ? WHERE id = ?`).run(p[k] ? 1 : 0, storeId);
    hecho.push(`${col[k][1]} ${p[k] ? 'encendido' : 'apagado'}`);
  }
  return hecho;
}

// ── Datos que pueden ir en una variable ─────────────────────────────────
export type CampoTpl = Exclude<Campo, ''> | 'estado';
export const CAMPOS: Record<CampoTpl, { nombre: string; ejemplo: string }> = {
  nombre: { nombre: 'Nombre del cliente', ejemplo: 'Ana' },
  nombre_completo: { nombre: 'Nombre completo', ejemplo: 'Ana Gómez' },
  tienda: { nombre: 'Nombre de la tienda', ejemplo: 'Tu Tienda' },
  pedido: { nombre: 'Número del pedido', ejemplo: 'DF-1049' },
  productos: { nombre: 'Productos del pedido', ejemplo: '1× Gorra bordada (Negra)' },
  total: { nombre: 'Total del pedido', ejemplo: '$89.900' },
  celular: { nombre: 'Celular', ejemplo: '3001234567' },
  direccion: { nombre: 'Dirección', ejemplo: 'Cl 45 #12-30' },
  ciudad: { nombre: 'Ciudad', ejemplo: 'Medellín' },
  departamento: { nombre: 'Departamento', ejemplo: 'Antioquia' },
  transportadora: { nombre: 'Transportadora', ejemplo: 'Servientrega' },
  guia: { nombre: 'Número de guía', ejemplo: '240012345678' },
  novedad: { nombre: 'Novedad del envío', ejemplo: 'dirección incompleta' },
  estado: { nombre: 'Estado del envío', ejemplo: 'tu pedido va en camino con Servientrega' },
};
const esCampo = (c: unknown): c is CampoTpl => typeof c === 'string' && c in CAMPOS;

// ── 4. Automatizaciones que pueden usar una plantilla propia ─────────────
// `maestras`: las plantillas de DealFlow que reemplaza y el ORDEN de los datos que les manda
// el código de esa automatización (así se traduce a las variables de la plantilla propia).
export interface Automatizacion { clave: string; titulo: string; descripcion: string; maestras: Record<string, CampoTpl[]>; doc: ('guia' | 'archivo')[] }
export const AUTOMATIZACIONES: Automatizacion[] = [
  {
    clave: 'confirmacion', titulo: 'Confirmación del pedido', descripcion: 'Resumen del pedido para que el cliente responda Sí / No.',
    maestras: {
      confirmacion_pedido_completa: ['nombre', 'tienda', 'pedido', 'productos', 'total', 'nombre_completo', 'celular', 'direccion', 'ciudad', 'departamento'],
      confirmacion_pedido_tienda: ['nombre', 'tienda', 'productos', 'total'],
    },
    doc: ['archivo'],
  },
  {
    clave: 'guia', titulo: 'Aviso de la guía', descripcion: 'Cuando el pedido sale: transportadora y número de guía.',
    maestras: { guia_envio_pedido: ['nombre', 'tienda', 'pedido', 'transportadora', 'guia'], guia_envio_imagen: ['nombre', 'tienda', 'pedido', 'transportadora', 'guia'] },
    doc: ['guia', 'archivo'],
  },
  {
    clave: 'estado', titulo: 'Estado del envío y seguimiento', descripcion: 'Cambios de estado (en tránsito, en reparto, entregado…).',
    maestras: { estado_envio_pedido: ['nombre', 'tienda', 'pedido', 'estado', 'guia'] },
    doc: ['archivo'],
  },
  {
    clave: 'novedad', titulo: 'Novedad en la entrega', descripcion: 'La transportadora reporta una novedad y hay que resolverla.',
    maestras: { novedad_envio_pedido: ['nombre', 'tienda', 'pedido', 'transportadora', 'novedad'] },
    doc: ['archivo'],
  },
];
const autoDeMaestra = (nombre: string) => AUTOMATIZACIONES.find((a) => nombre in a.maestras);
const camposDeAuto = (a: Automatizacion): CampoTpl[] => [...new Set(Object.values(a.maestras).flat())];

interface DocAuto { fuente?: 'guia' | 'archivo' | ''; archivo?: string; nombre?: string }
interface FilaAuto { clave: string; meta_id: string; mapa: string; doc: string; estado: string; motivo: string; updated_at: string }

/**
 * La plantilla propia que la tienda eligió para la automatización de esta plantilla de DealFlow
 * (o null: se usa la de DealFlow). Solo si el interruptor está encendido, la selección está
 * activa y la plantilla sigue aprobada como Utilidad.
 */
export function plantillaDeAutomatizacion(storeId: string, maestra: string): { nombre: string; idioma: string; encabezado: string; cuerpo: string; auto: { clave: string; maestra: string } } | null {
  const a = autoDeMaestra(maestra);
  if (!a) return null;
  try {
    if (!permisosPlantillas(storeId).automatizaciones) return null;
    const f = db.prepare("SELECT meta_id FROM wa_tpl_auto WHERE store_id = ? AND clave = ? AND estado = 'activa'").get(storeId, a.clave) as { meta_id: string } | undefined;
    if (!f) return null;
    const p = plantillaPropia(storeId, f.meta_id);
    if (!p || p.categoria.toUpperCase() !== 'UTILITY') return null;
    return { nombre: p.nombre, idioma: p.idioma, encabezado: p.encabezado, cuerpo: p.cuerpo, auto: { clave: a.clave, maestra } };
  } catch { return null; }
}

export interface AdjuntoGuia { ruta?: string; archivo?: string; url?: string }
type PlantillaEnvio = { nombre: string; idioma: string; encabezado?: string; cuerpo?: string; componentes?: Record<string, unknown>[]; auto?: { clave: string; maestra: string }; adjuntoGuia?: AdjuntoGuia };

/** Archivo local de la tienda (/api/media/<tienda>/<archivo>) → media ID en la Cloud API. */
export async function subirArchivoLocal(storeId: string, url: string): Promise<{ id: string; nombre: string; mime: string } | { error: string }> {
  const archivo = String(url || '').split('?')[0].split('/').pop() || '';
  if (!archivo || !String(url).includes(`/api/media/${storeId}/`)) return { error: 'Ese archivo no es de esta tienda.' };
  const ruta = mediaPath(storeId, archivo);
  if (!existsSync(ruta)) return { error: 'No encontramos el archivo: vuelve a subirlo.' };
  const ext = archivo.split('.').pop()!.toLowerCase();
  const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : /^jpe?g$/.test(ext) ? 'image/jpeg' : ext === 'mp4' ? 'video/mp4' : 'application/octet-stream';
  const { subirMediaCloud } = await import('./wa.js');
  const up = await subirMediaCloud(storeId, readFileSync(ruta), mime, archivo);
  return 'id' in up ? { id: up.id, nombre: archivo, mime } : up;
}

/**
 * Antes de enviar: si la plantilla es la propia de una automatización, se traducen los datos
 * (del orden de DealFlow a las variables de la tienda) y se arma el encabezado (documento,
 * foto de la guía o texto). Si algo falta, se devuelve el error y el que llama usa la de DealFlow.
 */
export async function adaptarEnvio(storeId: string, plantilla: PlantillaEnvio, params: string[]): Promise<{ plantilla: PlantillaEnvio; params: string[] } | { error: string }> {
  const a = plantilla.auto && AUTOMATIZACIONES.find((x) => x.clave === plantilla.auto!.clave);
  if (!a || !plantilla.auto) return { plantilla, params };
  const f = db.prepare('SELECT meta_id, mapa, doc FROM wa_tpl_auto WHERE store_id = ? AND clave = ?').get(storeId, a.clave) as Pick<FilaAuto, 'meta_id' | 'mapa' | 'doc'> | undefined;
  const p = f ? plantillaPropia(storeId, f.meta_id) : null;
  if (!f || !p) return { error: 'La plantilla elegida para esta automatización ya no está aprobada.' };
  const orden = a.maestras[plantilla.auto.maestra] || [];
  const valores: Partial<Record<CampoTpl, string>> = {};
  orden.forEach((c, i) => { if (String(params[i] ?? '').trim()) valores[c] = String(params[i]); });
  const mapa = pj<string[]>(f.mapa, []);
  const nuevos = Array.from({ length: p.variables }, (_, i) => (esCampo(mapa[i]) ? valores[mapa[i] as CampoTpl] || '' : ''));
  const falta = nuevos.findIndex((v) => !v.trim());
  if (falta >= 0) return { error: `La variable {{${falta + 1}}} de "${p.nombre}" no tiene dato en esta automatización (${esCampo(mapa[falta]) ? CAMPOS[mapa[falta] as CampoTpl].nombre : 'sin elegir'}).` };
  const extra: { encabezado?: string; media?: string; boton?: string } = {};
  if (p.varsEncabezado) {
    const c = mapa[p.variables];
    extra.encabezado = esCampo(c) ? valores[c] || '' : '';
  }
  if (p.botones.some((b) => b.variable)) extra.boton = valores.guia || valores.pedido || '';
  let mediaComp: Record<string, unknown> | null = null;
  if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(p.encabezadoTipo)) {
    const doc = pj<DocAuto>(f.doc, {});
    const k = p.encabezadoTipo.toLowerCase();
    const g = plantilla.adjuntoGuia;
    if (doc.fuente === 'guia' && g) {
      const local = g.ruta && existsSync(g.ruta) ? g.ruta : '';
      const esPdf = /\.pdf$/i.test(g.archivo || '');
      if (k === 'document' && local && esPdf) {
        const { subirMediaCloud } = await import('./wa.js');
        const up = await subirMediaCloud(storeId, readFileSync(local), 'application/pdf', 'guia.pdf');
        if ('id' in up) mediaComp = { type: 'header', parameters: [{ type: 'document', document: { id: up.id, filename: `Guia-${valores.pedido || valores.guia || ''}.pdf` } }] };
      } else if (k === 'document' && /^https?:\/\//i.test(g.url || '')) {
        mediaComp = { type: 'header', parameters: [{ type: 'document', document: { link: g.url, filename: `Guia-${valores.pedido || valores.guia || ''}.pdf` } }] };
      } else if (k === 'image' && local && /\.(png|jpe?g)$/i.test(g.archivo || local)) {
        const { subirMediaCloud } = await import('./wa.js');
        const mime = /\.png$/i.test(local) ? 'image/png' : 'image/jpeg';
        const up = await subirMediaCloud(storeId, readFileSync(local), mime, `guia.${mime === 'image/png' ? 'png' : 'jpg'}`);
        if ('id' in up) mediaComp = { type: 'header', parameters: [{ type: 'image', image: { id: up.id } }] };
      }
      if (!mediaComp) return { error: `La plantilla "${p.nombre}" lleva ${k === 'document' ? 'el PDF' : 'la foto'} de la guía y este pedido todavía no lo tiene.` };
    } else if (doc.fuente === 'archivo' && doc.archivo) {
      const up = await subirArchivoLocal(storeId, doc.archivo);
      if ('error' in up) return { error: `Documento de "${p.nombre}": ${up.error}` };
      mediaComp = { type: 'header', parameters: [{ type: k, [k]: { id: up.id, ...(k === 'document' ? { filename: doc.nombre || up.nombre } : {}) } }] };
    } else if (p.mediaEjemplo) {
      extra.media = p.mediaEjemplo;
    } else return { error: `La plantilla "${p.nombre}" lleva un archivo arriba y no se eligió cuál.` };
  }
  const pSin: PlantillaPropia = mediaComp ? { ...p, encabezadoTipo: '' } : p;
  const c = componentesEnvio(pSin, nuevos, extra);
  if ('error' in c) return c;
  const componentes = mediaComp ? [mediaComp, ...c.components] : c.components;
  return { plantilla: { nombre: p.nombre, idioma: p.idioma, encabezado: p.encabezado, cuerpo: p.cuerpo, componentes }, params: nuevos };
}

// ── 2. Riesgo de que Meta la tome como Marketing ────────────────────────
export interface Riesgo { nivel: 'bajo' | 'medio' | 'alto'; motivos: string[]; sugerencias: string[] }
const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const FUERTES: [RegExp, string][] = [
  [/\bdescuento|\bdcto\b|\brebaja|\bliquidacion|\bpromo(cion)?\b|\boferta|\b2x1\b|\b3x2\b|black ?friday|cyber/, 'habla de descuentos, ofertas o promociones'],
  [/\bgratis\b|\bregalo|\bobsequio|\bsorteo|\bcupon|\bcodigo de descuento|\bbono\b/, 'ofrece algo gratis, regalos, sorteos o cupones'],
  [/compra (ya|ahora|aqui)|aprovecha|no te lo pierdas|ultimas unidades|por tiempo limitado|solo (por )?hoy|antes de que se acabe|corre\b|date prisa/, 'invita a comprar con urgencia'],
  [/nuevos? productos?|nueva coleccion|catalogo|novedades de la tienda|lanzamiento|conoce (nuestros|nuestra|todo)|visita nuestra|siguenos|te va a encantar|te encantara|recomendamos/, 'promociona productos o la tienda'],
  [/precio especial|mejor precio|ahorra|ahorro|\d+ ?%/, 'menciona precios especiales, ahorro o porcentajes'],
  [/te gustaria (comprar|llevar|pedir)|quieres (comprar|llevar|pedir)|vuelve a comprar|completa tu compra|carrito/, 'busca una venta nueva (no es sobre una compra que ya existe)'],
];
const DEBILES: [RegExp, string][] = [
  [/https?:\/\/(?!.*\{\{)/, 'trae un enlace fijo (a Meta le parece publicidad si lleva a la tienda o catálogo)'],
  [/!{2,}|¡{2,}/, 'usa varios signos de exclamación seguidos'],
];

/** ¿Suena a promoción? Alto = no se manda como Utilidad. */
export function riesgoMarketing(def: { categoria: string; encabezado?: string; cuerpo: string; pie?: string; botones?: { tipo: string; texto: string; url?: string }[]; campos?: string[] }): Riesgo {
  const motivos: string[] = []; const sugerencias: string[] = [];
  const todo = sinTildes([def.encabezado, def.cuerpo, def.pie, ...(def.botones || []).map((b) => `${b.texto} ${b.url || ''}`)].filter(Boolean).join('\n'));
  let alto = false; let medio = 0;
  for (const [re, m] of FUERTES) if (re.test(todo)) { motivos.push(`El texto ${m}.`); alto = true; }
  for (const [re, m] of DEBILES) if (re.test(todo)) { motivos.push(`El texto ${m}.`); medio++; }
  const emojis = (def.cuerpo.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emojis > 4) { motivos.push(`Tiene ${emojis} emojis: muchos emojis se ven como publicidad.`); medio++; }
  const transaccional = /pedido|orden|compra|guia|envio|entrega|transportadora|factura|pago|confirm|direccion|novedad|rastreo|despach/.test(todo)
    || (def.campos || []).some((c) => ['pedido', 'guia', 'productos', 'total', 'transportadora', 'novedad', 'estado', 'direccion'].includes(c));
  if (def.categoria === 'UTILITY') {
    if (!transaccional) { motivos.push('No habla de un pedido, pago, envío o guía concretos: una plantilla de Utilidad tiene que ser sobre algo que el cliente ya hizo.'); alto = true; }
    if (!(def.campos || []).some((c) => ['pedido', 'guia', 'total', 'productos'].includes(c))) { motivos.push('No incluye el número del pedido, la guía, los productos ni el total.'); medio++; sugerencias.push('Agrega el número del pedido (DF-…) o la guía: Meta aprueba como Utilidad lo que se refiere a una compra concreta.'); }
    if (alto) sugerencias.push('Quita lo promocional o crea la plantilla como Marketing (se cobra distinto y no se puede usar en las automatizaciones).');
  }
  if (def.cuerpo.length > 700) { motivos.push('El mensaje es muy largo.'); medio++; }
  return { nivel: alto ? 'alto' : medio ? 'medio' : 'bajo', motivos, sugerencias };
}

// ── 3. Bases de DealFlow ───────────────────────────────────────────────
// Escritas con {{campo}}: el constructor las convierte en {{1}}, {{2}}… al enviarlas a Meta.
export interface Base { id: string; titulo: string; uso: string; categoria: 'UTILITY'; encabezadoTipo: '' | 'TEXT' | 'DOCUMENT' | 'IMAGE'; encabezado: string; cuerpo: string; pie: string; botones: { tipo: 'QUICK_REPLY'; texto: string }[]; documento?: boolean }
export const BASES: Base[] = [
  { id: 'confirmacion', titulo: 'Confirmación del pedido', uso: 'confirmacion', categoria: 'UTILITY', encabezadoTipo: 'TEXT', encabezado: 'Confirma tu pedido',
    cuerpo: 'Hola {{nombre}}, recibimos tu pedido {{pedido}} en la tienda {{tienda}}.\nProductos: {{productos}}\nTotal a pagar contra entrega: {{total}}\nSe envía a la dirección {{direccion}} en {{ciudad}}.\n¿Los datos están correctos?',
    pie: 'Responde Sí o No', botones: [{ tipo: 'QUICK_REPLY', texto: 'Sí, confirmo' }, { tipo: 'QUICK_REPLY', texto: 'No, cambiar datos' }] },
  { id: 'guia', titulo: 'Aviso de la guía', uso: 'guia', categoria: 'UTILITY', encabezadoTipo: '', encabezado: '',
    cuerpo: 'Hola {{nombre}}, tu pedido {{pedido}} de {{tienda}} ya fue despachado con la transportadora {{transportadora}}.\nEl número de guía es {{guia}} y con él puedes seguir el envío.',
    pie: '', botones: [] },
  { id: 'guia_pdf', titulo: 'Guía con el PDF adjunto', uso: 'guia', categoria: 'UTILITY', encabezadoTipo: 'DOCUMENT', encabezado: '', documento: true,
    cuerpo: 'Hola {{nombre}}, adjuntamos la guía de envío de tu pedido {{pedido}} de la tienda {{tienda}}.\nLa transportadora es {{transportadora}} y el número de guía es {{guia}}, por si quieres seguir el envío.',
    pie: '', botones: [] },
  { id: 'estado', titulo: 'Estado del envío', uso: 'estado', categoria: 'UTILITY', encabezadoTipo: '', encabezado: '',
    cuerpo: 'Hola {{nombre}}, te contamos cómo va tu pedido {{pedido}} de la tienda {{tienda}}: {{estado}}.\nEl número de guía es {{guia}}, por si quieres revisarlo.',
    pie: '', botones: [] },
  { id: 'novedad', titulo: 'Novedad en la entrega', uso: 'novedad', categoria: 'UTILITY', encabezadoTipo: '', encabezado: '',
    cuerpo: 'Hola {{nombre}}, la transportadora {{transportadora}} reportó una novedad con tu pedido {{pedido}} de la tienda {{tienda}}: {{novedad}}.\nResponde este mensaje para ayudarte a recibirlo.',
    pie: '', botones: [{ tipo: 'QUICK_REPLY', texto: 'Quiero recibirlo' }] },
  { id: 'pago', titulo: 'Pago recibido', uso: '', categoria: 'UTILITY', encabezadoTipo: '', encabezado: '',
    cuerpo: 'Hola {{nombre}}, confirmamos el pago de tu pedido {{pedido}} en la tienda {{tienda}} por un valor de {{total}}. Te avisaremos cuando salga.',
    pie: '', botones: [] },
];

// ── Constructor: {{campo}} → {{1}}, {{2}}… ─────────────────────────────
export interface DefPlantilla {
  nombre: string; categoria: 'UTILITY' | 'MARKETING'; idioma?: string; base?: string;
  encabezadoTipo: '' | 'TEXT' | 'IMAGE' | 'DOCUMENT'; encabezado?: string; archivoEjemplo?: string;
  cuerpo: string; pie?: string; botones?: { tipo: 'QUICK_REPLY' | 'URL'; texto: string; url?: string }[];
}
export function normalizarNombre(n: string): string {
  return sinTildes(String(n || '')).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}
/** Convierte el texto con {{campo}} al formato de Meta y devuelve qué campo es cada número. */
export function compilar(texto: string): { texto: string; campos: CampoTpl[]; desconocidos: string[] } {
  const campos: CampoTpl[] = []; const desconocidos: string[] = [];
  const out = String(texto || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => {
    const c = k.toLowerCase();
    if (!esCampo(c)) { desconocidos.push(k); return m; }
    let i = campos.indexOf(c);
    if (i < 0) { campos.push(c); i = campos.length - 1; }
    return `{{${i + 1}}}`;
  });
  return { texto: out, campos, desconocidos };
}

/** Problemas de formato que Meta rechaza sí o sí. */
export function erroresFormato(def: DefPlantilla, docsPermitidos: boolean): string[] {
  const e: string[] = [];
  const nombre = normalizarNombre(def.nombre);
  if (!nombre || nombre.length < 3) e.push('Ponle un nombre (mínimo 3 letras).');
  const c = compilar(def.cuerpo);
  if (!c.texto.trim()) e.push('Escribe el mensaje.');
  if (c.desconocidos.length) e.push(`No conocemos estos datos: ${c.desconocidos.map((d) => `{{${d}}}`).join(', ')}.`);
  if (/^\s*\{\{\d+\}\}/.test(c.texto) || /\{\{\d+\}\}[\s.!?]*$/.test(c.texto)) e.push('El mensaje no puede empezar ni terminar con un dato variable: agrega texto antes y después.');
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(c.texto)) e.push('Hay dos datos variables pegados: sepáralos con texto.');
  const palabras = c.texto.replace(/\{\{\d+\}\}/g, ' ').split(/\s+/).filter(Boolean).length;
  if (c.campos.length && palabras < c.campos.length * 2) e.push('Hay demasiados datos variables para lo corto del mensaje: Meta lo rechaza. Agrega más texto.');
  if (c.texto.length > 1024) e.push('El mensaje pasa de 1.024 caracteres.');
  if (def.encabezadoTipo === 'TEXT' && /\{\{/.test(def.encabezado || '')) e.push('El encabezado de texto no puede llevar datos variables en el constructor.');
  if (def.encabezadoTipo === 'TEXT' && String(def.encabezado || '').length > 60) e.push('El encabezado pasa de 60 caracteres.');
  if (def.encabezadoTipo === 'DOCUMENT' && !docsPermitidos) e.push('Las plantillas con documento no están habilitadas para tu tienda.');
  if (String(def.pie || '').length > 60) e.push('El pie pasa de 60 caracteres.');
  const bts = def.botones || [];
  if (bts.length > 3) e.push('Máximo 3 botones.');
  if (bts.some((b) => !String(b.texto || '').trim() || String(b.texto).length > 25)) e.push('Cada botón necesita un texto de máximo 25 caracteres.');
  if (bts.some((b) => b.tipo === 'URL' && !/^https:\/\/[^\s{}]+$/i.test(String(b.url || '')))) e.push('El botón con enlace necesita una dirección https:// completa.');
  return e;
}

/** PDF mínimo de ejemplo (Meta exige un archivo de muestra para el encabezado con documento). */
function pdfEjemplo(): Buffer {
  const cont = 'BT /F1 18 Tf 72 720 Td (Guia de envio - ejemplo) Tj ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let s = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(s, 'latin1');
}

/** Sube el archivo de muestra con la carga reanudable de la app y devuelve el "handle" de Meta. */
async function subirEjemplo(token: string, buf: Buffer, mime: string, nombre: string): Promise<{ handle: string } | { error: string }> {
  const appId = process.env.META_APP_ID || '';
  if (!appId) return { error: 'Falta META_APP_ID en el servidor para subir el archivo de ejemplo.' };
  try {
    const ini = await fetch(`${GRAPH}/${appId}/uploads?file_name=${encodeURIComponent(nombre)}&file_length=${buf.length}&file_type=${encodeURIComponent(mime)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const ij = (await ini.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!ini.ok || !ij.id) return { error: ij.error?.message || 'Meta no abrió la carga del archivo de ejemplo.' };
    const up = await fetch(`${GRAPH}/${ij.id}`, { method: 'POST', headers: { Authorization: `OAuth ${token}`, file_offset: '0' }, body: new Uint8Array(buf) });
    const uj = (await up.json().catch(() => ({}))) as { h?: string; error?: { message?: string } };
    return up.ok && uj.h ? { handle: uj.h } : { error: uj.error?.message || 'Meta no recibió el archivo de ejemplo.' };
  } catch { return { error: 'No pudimos subir el archivo de ejemplo a Meta.' }; }
}

/** Arma lo que se le manda a Meta (con ejemplos sacados de cada campo, nunca datos reales). */
export function armarParaMeta(def: DefPlantilla, tiendaNombre: string, handle = ''): { name: string; language: string; category: string; components: Record<string, unknown>[]; campos: CampoTpl[] } {
  const c = compilar(def.cuerpo);
  const ej = (k: CampoTpl) => (k === 'tienda' ? tiendaNombre || CAMPOS.tienda.ejemplo : CAMPOS[k].ejemplo);
  const components: Record<string, unknown>[] = [];
  if (def.encabezadoTipo === 'TEXT' && String(def.encabezado || '').trim()) components.push({ type: 'HEADER', format: 'TEXT', text: String(def.encabezado).trim() });
  if (def.encabezadoTipo === 'IMAGE' || def.encabezadoTipo === 'DOCUMENT') components.push({ type: 'HEADER', format: def.encabezadoTipo, ...(handle ? { example: { header_handle: [handle] } } : {}) });
  components.push({ type: 'BODY', text: c.texto, ...(c.campos.length ? { example: { body_text: [c.campos.map(ej)] } } : {}) });
  if (String(def.pie || '').trim()) components.push({ type: 'FOOTER', text: String(def.pie).trim() });
  const bts = (def.botones || []).filter((b) => String(b.texto || '').trim()).slice(0, 3);
  if (bts.length) components.push({ type: 'BUTTONS', buttons: bts.map((b) => (b.tipo === 'URL' ? { type: 'URL', text: b.texto.trim(), url: String(b.url) } : { type: 'QUICK_REPLY', text: b.texto.trim() })) });
  return { name: normalizarNombre(def.nombre), language: def.idioma || 'es', category: def.categoria, components, campos: c.campos };
}

/** Crea la plantilla en la cuenta de WhatsApp (WABA) de la tienda y la manda a revisión. */
export async function crearEnMeta(storeId: string, def: DefPlantilla, quien: string): Promise<{ ok: true; nombre: string; estado: string; riesgo: Riesgo } | { error: string; riesgo?: Riesgo }> {
  const perm = permisosPlantillas(storeId);
  if (!perm.crear) return { error: 'El constructor de plantillas no está habilitado para tu tienda.' };
  const errores = erroresFormato(def, perm.documentos);
  if (errores.length) return { error: errores.join(' ') };
  const comp = compilar(def.cuerpo);
  const riesgo = riesgoMarketing({ ...def, campos: comp.campos });
  // Lo que más castiga una cuenta: mandar como Utilidad algo que Meta ve como Marketing.
  if (def.categoria === 'UTILITY' && riesgo.nivel === 'alto') return { error: 'Esta plantilla suena a promoción y Meta la pasaría a Marketing (o la rechazaría). Corrígela o créala como Marketing.', riesgo };
  const w = db.prepare('SELECT waba_id, access_token, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as { waba_id: string; access_token: string; conectado: number; modo: string } | undefined;
  if (!w?.conectado || w.modo !== 'cloud' || !w.waba_id || !w.access_token) return { error: 'Las plantillas se crean en la conexión oficial de WhatsApp (Cloud API). Conéctala primero.' };
  const nombre = normalizarNombre(def.nombre);
  if (db.prepare('SELECT 1 FROM wa_plantillas_meta WHERE store_id = ? AND nombre = ?').get(storeId, nombre)) return { error: `Ya tienes una plantilla llamada "${nombre}". Usa otro nombre.` };
  let handle = '';
  if (def.encabezadoTipo === 'IMAGE' || def.encabezadoTipo === 'DOCUMENT') {
    let buf: Buffer | null = null; let mime = def.encabezadoTipo === 'DOCUMENT' ? 'application/pdf' : 'image/png'; let archivo = def.encabezadoTipo === 'DOCUMENT' ? 'ejemplo.pdf' : 'ejemplo.png';
    const a = String(def.archivoEjemplo || '');
    if (a.includes(`/api/media/${storeId}/`)) {
      const f = a.split('?')[0].split('/').pop()!; const ruta = mediaPath(storeId, f);
      if (existsSync(ruta)) { buf = readFileSync(ruta); archivo = f; mime = /\.pdf$/i.test(f) ? 'application/pdf' : /\.png$/i.test(f) ? 'image/png' : 'image/jpeg'; }
    }
    if (!buf && def.encabezadoTipo === 'DOCUMENT') buf = pdfEjemplo();
    if (!buf) return { error: 'Sube una foto de ejemplo para el encabezado.' };
    const h = await subirEjemplo(w.access_token, buf, mime, archivo);
    if ('error' in h) return { error: h.error };
    handle = h.handle;
  }
  const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as { nombre: string } | undefined)?.nombre || '';
  const cuerpoMeta = armarParaMeta(def, tienda, handle);
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(w.waba_id)}/message_templates`, {
      method: 'POST', headers: { Authorization: `Bearer ${w.access_token}`, 'Content-Type': 'application/json' },
      // Sin allow_category_change: si Meta no está de acuerdo con "Utilidad", que la rechace en vez de cambiarla en silencio.
      body: JSON.stringify({ name: cuerpoMeta.name, language: cuerpoMeta.language, category: cuerpoMeta.category, components: cuerpoMeta.components }),
    });
    const b = (await res.json().catch(() => ({}))) as { id?: string; status?: string; category?: string; error?: { message?: string; error_user_msg?: string; error_user_title?: string } };
    if (!res.ok || !b.id) return { error: `Meta no aceptó la plantilla: ${b.error?.error_user_msg || b.error?.message || `error ${res.status}`}`, riesgo };
    db.prepare('INSERT INTO wa_tpl_creadas (id, store_id, nombre, idioma, categoria_pedida, campos, base, meta_id, riesgo, creada_por) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(uid(), storeId, cuerpoMeta.name, cuerpoMeta.language, def.categoria, JSON.stringify(cuerpoMeta.campos), String(def.base || ''), String(b.id), riesgo.nivel, quien);
    registrarLog(storeId, 'info', 'plantillas', `Plantilla "${cuerpoMeta.name}" (${def.categoria === 'UTILITY' ? 'Utilidad' : 'Marketing'}) enviada a revisión de Meta por ${quien}.`);
    // Meta suele responder en segundos o minutos: se consulta pronto.
    setTimeout(() => void sincronizarPlantillasTienda(storeId).catch(() => {}), 15_000).unref?.();
    return { ok: true, nombre: cuerpoMeta.name, estado: String(b.status || 'PENDING'), riesgo };
  } catch { return { error: 'No pudimos conectar con Meta.', riesgo }; }
}

// ── Selección por automatización ───────────────────────────────────────
export function guardarAutomatizacion(storeId: string, clave: string, b: { metaId?: string; mapa?: unknown[]; doc?: DocAuto }): { ok: true } | { error: string } {
  const a = AUTOMATIZACIONES.find((x) => x.clave === clave);
  if (!a) return { error: 'Automatización desconocida.' };
  const perm = permisosPlantillas(storeId);
  if (!perm.automatizaciones) return { error: 'Elegir plantillas para las automatizaciones no está habilitado para tu tienda.' };
  const metaId = String(b.metaId || '').replace(/^meta:/, '');
  if (!metaId) { db.prepare('DELETE FROM wa_tpl_auto WHERE store_id = ? AND clave = ?').run(storeId, clave); return { ok: true }; }
  const p = plantillaPropia(storeId, metaId);
  if (!p) return { error: 'Esa plantilla no está aprobada en tu cuenta de WhatsApp.' };
  if (p.categoria.toUpperCase() !== 'UTILITY') return { error: `"${p.nombre}" está como ${p.categoria === 'MARKETING' ? 'Marketing' : p.categoria}: en las automatizaciones solo van plantillas de Utilidad.` };
  const permitidos = camposDeAuto(a);
  const total = p.variables + (p.varsEncabezado ? 1 : 0);
  const mapa = Array.from({ length: total }, (_, i) => String((b.mapa || [])[i] ?? ''));
  const malo = mapa.findIndex((c) => !permitidos.includes(c as CampoTpl));
  if (malo >= 0) return { error: `Elige qué dato va en ${malo < p.variables ? `{{${malo + 1}}}` : 'el encabezado'}. En "${a.titulo}" se puede usar: ${permitidos.map((c) => CAMPOS[c].nombre.toLowerCase()).join(', ')}.` };
  let doc: DocAuto = {};
  if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(p.encabezadoTipo)) {
    if (p.encabezadoTipo === 'DOCUMENT' && !perm.documentos) return { error: 'Las plantillas con documento no están habilitadas para tu tienda.' };
    const fuente = b.doc?.fuente === 'guia' && a.doc.includes('guia') ? 'guia' : b.doc?.fuente === 'archivo' ? 'archivo' : '';
    if (fuente === 'guia' && p.encabezadoTipo === 'VIDEO') return { error: 'La guía no es un video.' };
    if (fuente === 'archivo' && !String(b.doc?.archivo || '').includes(`/api/media/${storeId}/`)) return { error: 'Sube el archivo que va arriba del mensaje.' };
    if (!fuente && !p.mediaEjemplo) return { error: 'Elige qué archivo va arriba del mensaje.' };
    doc = { fuente, archivo: fuente === 'archivo' ? String(b.doc?.archivo) : '', nombre: String(b.doc?.nombre || '').slice(0, 80) };
  }
  db.prepare(`INSERT INTO wa_tpl_auto (store_id, clave, meta_id, mapa, doc, estado, motivo, updated_at) VALUES (?,?,?,?,?,'activa','',datetime('now'))
    ON CONFLICT(store_id, clave) DO UPDATE SET meta_id = excluded.meta_id, mapa = excluded.mapa, doc = excluded.doc, estado = 'activa', motivo = '', updated_at = datetime('now')`)
    .run(storeId, clave, metaId, JSON.stringify(mapa), JSON.stringify(doc));
  return { ok: true };
}

/** Todo lo que necesita el panel de plantillas de la tienda. */
export function estadoPlantillasTienda(storeId: string) {
  const permisos = permisosPlantillas(storeId);
  const creadas = new Map((db.prepare('SELECT meta_id, categoria_pedida, campos, base FROM wa_tpl_creadas WHERE store_id = ?').all(storeId) as { meta_id: string; categoria_pedida: string; campos: string; base: string }[]).map((r) => [r.meta_id, r]));
  const calidad = new Map((db.prepare('SELECT meta_id, calidad FROM wa_plantillas_meta WHERE store_id = ?').all(storeId) as { meta_id: string; calidad: string }[]).map((r) => [r.meta_id, r.calidad]));
  const propias = plantillasPropias(storeId, false).map((p) => {
    const c = creadas.get(p.metaId);
    return {
      id: p.id, metaId: p.metaId, nombre: p.nombre, idioma: p.idioma, categoria: p.categoria, estado: p.estado, motivo: p.motivo, calidad: calidad.get(p.metaId) || '',
      encabezadoTipo: p.encabezadoTipo, encabezado: p.encabezado, varsEncabezado: p.varsEncabezado, cuerpo: p.cuerpo, pie: p.pie, variables: p.variables,
      botones: p.botones.map((b) => ({ tipo: b.tipo, texto: b.texto })), mediaEjemplo: !!p.mediaEjemplo,
      creadaAqui: !!c, categoriaPedida: c?.categoria_pedida || '', campos: c ? pj<string[]>(c.campos, []) : [],
      reclasificada: !!c && c.categoria_pedida === 'UTILITY' && p.categoria.toUpperCase() === 'MARKETING',
    };
  });
  const filas = new Map((db.prepare('SELECT clave, meta_id, mapa, doc, estado, motivo, updated_at FROM wa_tpl_auto WHERE store_id = ?').all(storeId) as FilaAuto[]).map((r) => [r.clave, r]));
  const automatizaciones = AUTOMATIZACIONES.map((a) => {
    const f = filas.get(a.clave);
    return {
      clave: a.clave, titulo: a.titulo, descripcion: a.descripcion, campos: camposDeAuto(a), doc: a.doc, deDealflow: Object.keys(a.maestras),
      seleccion: f ? { metaId: f.meta_id, nombre: propias.find((p) => p.metaId === f.meta_id)?.nombre || '(ya no existe en Meta)', mapa: pj<string[]>(f.mapa, []), doc: pj<DocAuto>(f.doc, {}), estado: f.estado, motivo: f.motivo, desde: f.updated_at } : null,
    };
  });
  return {
    permisos, propias, automatizaciones,
    campos: Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, v.nombre])),
    bases: BASES.filter((b) => permisos.documentos || !b.documento),
  };
}

// ── 6. Vigilancia: categoría, estado y calidad ─────────────────────────
interface Antes { categoria: string; estado: string; calidad: string }
/**
 * Se llama después de cada sincronización con Meta. Compara con lo que había y, si una
 * plantilla que usa una automatización cambió a Marketing, quedó pausada/rechazada o su
 * calidad cayó a roja, la automatización deja de usarla (vuelve a la de DealFlow).
 */
export function vigilarCambios(storeId: string, antes: Map<string, Antes>): void {
  const ahora = db.prepare('SELECT meta_id, nombre, categoria, estado, calidad FROM wa_plantillas_meta WHERE store_id = ?').all(storeId) as { meta_id: string; nombre: string; categoria: string; estado: string; calidad: string }[];
  const porId = new Map(ahora.map((r) => [r.meta_id, r]));
  const pedidas = new Map((db.prepare('SELECT meta_id, categoria_pedida FROM wa_tpl_creadas WHERE store_id = ?').all(storeId) as { meta_id: string; categoria_pedida: string }[]).map((r) => [r.meta_id, r.categoria_pedida]));
  // Avisos de plantillas creadas aquí como Utilidad que Meta pasó a Marketing (aunque ninguna automatización las use).
  for (const r of ahora) {
    const prev = antes.get(r.meta_id);
    const cat = r.categoria.toUpperCase();
    if (pedidas.get(r.meta_id) === 'UTILITY' && cat === 'MARKETING' && prev?.categoria.toUpperCase() !== 'MARKETING') {
      registrarLog(storeId, 'warn', 'plantillas', `Meta pasó la plantilla "${r.nombre}" de Utilidad a Marketing. Se cobra como Marketing y no se puede usar en las automatizaciones. Revisa el texto (sin promociones) y crea una nueva.`);
    }
  }
  const usadas = db.prepare("SELECT clave, meta_id FROM wa_tpl_auto WHERE store_id = ? AND estado = 'activa'").all(storeId) as { clave: string; meta_id: string }[];
  for (const u of usadas) {
    const r = porId.get(u.meta_id);
    const a = AUTOMATIZACIONES.find((x) => x.clave === u.clave);
    let motivo = '';
    if (!r) motivo = 'La plantilla ya no existe en tu cuenta de WhatsApp.';
    else if (r.categoria.toUpperCase() !== 'UTILITY') motivo = `Meta pasó "${r.nombre}" a ${r.categoria.toUpperCase() === 'MARKETING' ? 'Marketing' : r.categoria}.`;
    else if (r.estado === 'pausada') motivo = `Meta pausó "${r.nombre}" por baja calidad (los clientes la bloquean o reportan).`;
    else if (r.estado === 'rechazada') motivo = `Meta desactivó o rechazó "${r.nombre}".`;
    else if (r.calidad === 'RED') motivo = `La calidad de "${r.nombre}" cayó a roja en Meta.`;
    if (!motivo) continue;
    db.prepare("UPDATE wa_tpl_auto SET estado = 'pausada', motivo = ?, updated_at = datetime('now') WHERE store_id = ? AND clave = ?").run(motivo, storeId, u.clave);
    registrarLog(storeId, 'warn', 'plantillas', `${a?.titulo || u.clave}: ${motivo} Mientras tanto se usa la plantilla de DealFlow.`);
    void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', 'Plantilla de WhatsApp pausada', `${a?.titulo || u.clave}: ${motivo}`)).catch(() => {});
  }
}
