/**
 * Importar productos desde otros bots (por ahora LucidSales / Lucid Bot) con la extensión de
 * navegador "DealFlow · Importar productos". La extensión abre cada sección del producto en el
 * panel del otro bot, lee sus campos, bundles, variantes, mensaje inicial y multimedia, sube los
 * archivos a DealFlow y manda todo aquí. Lo que viene con etiqueta conocida se copia directo;
 * lo demás (bundles, opciones, reglas, preguntas, guion del mensaje inicial) lo ordena la IA.
 * El producto queda creado con la estructura completa de DealFlow, listo para revisar.
 */
import { db, uid, j, registrarLog } from './db.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v)).trim();
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** "69.900", "$ 139,900.00" o 139900 → pesos enteros (los centavos de 2 cifras al final se quitan). */
const pesos = (v: unknown) => Number(String(v ?? '').trim().replace(/[.,]\d{2}$/, '').replace(/[^\d]/g, '')) || 0;

export interface CampoExt { etiqueta: string; valor: string; seccion: string }
export interface MediaExt { url: string; tipo: 'imagen' | 'video' | 'audio' | 'archivo'; seccion: string; orden: number; contexto?: string }
export interface BloqueExt { tipo: 'texto' | 'imagen' | 'video' | 'audio'; valor: string }
export interface ImportacionExt {
  fuente: string; urlOrigen: string; titulo: string;
  campos: CampoExt[];
  secciones: { titulo: string; texto: string }[];
  bundles: { titulo: string; campos: CampoExt[]; texto: string }[];
  media: MediaExt[];
  /** El mensaje inicial en el orden en que aparece (texto y piezas ya subidas a DealFlow). */
  mensaje: BloqueExt[];
}

/** Valor del primer campo cuya etiqueta contenga alguna de las palabras. */
function campo(campos: CampoExt[], ...claves: string[]): string {
  for (const k of claves) {
    const f = campos.find((c) => norm(c.etiqueta).includes(norm(k)) && txt(c.valor));
    if (f) return txt(f.valor);
  }
  return '';
}

interface Estructura {
  combos: { cantidad: number; precio: number; etiqueta?: string }[];
  opciones: { nombre: string; valores: string[] }[];
  reglas: string[];
  faqs: { pregunta: string; respuesta: string }[];
  disparador: string;
  precioPromo: number;
}

/** La IA ordena lo que no trae etiqueta exacta (bundles, variantes, reglas, preguntas…). */
async function estructurarConIA(storeId: string, imp: ImportacionExt, precio: number): Promise<Partial<Estructura>> {
  const { resolverTexto } = await import('./ai.js');
  const ia = resolverTexto(storeId);
  if (!ia) return {};
  const material = [
    `Producto: ${imp.titulo}`,
    `Precio de 1 unidad: ${precio}`,
    ...imp.bundles.map((b, i) => `BUNDLE ${i + 1}: ${b.titulo}\n${b.campos.map((c) => `${c.etiqueta}: ${c.valor}`).join('\n')}\n${b.texto}`),
    ...imp.secciones.filter((s) => /variante|regla|pregunta|upsell|bundle|mensaje/i.test(s.titulo)).map((s) => `SECCIÓN «${s.titulo}»:\n${s.texto}`),
    ...imp.campos.filter((c) => /variante|regla|pregunta|respuesta|upsell|disparador|palabra|bundle|color|talla|opci/i.test(`${c.seccion} ${c.etiqueta}`)).map((c) => `[${c.seccion}] ${c.etiqueta}: ${c.valor}`),
  ].join('\n\n').slice(0, 24000);
  const system = `Te doy lo que se leyó del panel de otro bot de ventas por WhatsApp (LucidSales) para UN producto. Devuelve SOLO un JSON válido, sin explicaciones, con esta forma:
{"combos":[{"cantidad":2,"precio":99900,"etiqueta":"Paga 1 lleva 2"}],"opciones":[{"nombre":"Talla","valores":["S","M"]},{"nombre":"Color","valores":["Negro"]}],"reglas":["…"],"faqs":[{"pregunta":"…","respuesta":"…"}],"disparador":"","precioPromo":0}
Reglas:
- "combos": cada bundle o promoción de VARIAS unidades con su precio TOTAL en pesos (número sin puntos). No incluyas el de 1 unidad al precio normal. "etiqueta" es el nombre del bundle (ej. "PAGA 2 LLEVAS 3"). Si un bundle dice "paga 2 lleva 3", cantidad = 3.
- "precioPromo": solo si hay un precio de 1 unidad con descuento distinto al precio normal; si no, 0.
- "opciones": los grupos de variantes (Talla, Color, Sabor…) con sus valores tal cual.
- "reglas": instrucciones para el asistente de ventas que estén escritas en el panel (no inventes).
- "faqs": preguntas frecuentes con su respuesta exacta.
- "disparador": la frase o palabra clave que activa el mensaje inicial, si aparece.
- Usa SOLO lo que está en el texto. Si algo no aparece, déjalo vacío.`;
  try {
    const r = await fetch(ia.url, {
      method: 'POST', headers: { Authorization: `Bearer ${ia.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ia.model, messages: [{ role: 'system', content: system }, { role: 'user', content: material }], max_tokens: 2500, temperature: 0 }),
      signal: AbortSignal.timeout(60_000),
    });
    const b = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
    const crudo = String(b.choices?.[0]?.message?.content || '');
    const m = crudo.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Partial<Estructura>) : {};
  } catch { return {}; }
}

/** Sin IA: lo mínimo de los bundles ("PAGA 2 LLEVAS 3", "LLEVA 2" + su precio). */
function combosBasicos(imp: ImportacionExt, precio: number): Estructura['combos'] {
  const out: Estructura['combos'] = [];
  for (const b of imp.bundles) {
    const t = `${b.titulo} ${b.texto} ${b.campos.map((c) => `${c.etiqueta} ${c.valor}`).join(' ')}`;
    const lleva = /llev\w*\s*(\d+)/i.exec(t) || /(\d+)\s*unidad/i.exec(t);
    const cantidad = Number(lleva?.[1]) || 0;
    const precioCampo = pesos(campo(b.campos, 'precio total', 'precio', 'valor'));
    if (cantidad > 1 && precioCampo > 0 && precioCampo !== precio) out.push({ cantidad, precio: precioCampo, etiqueta: b.titulo.replace(/^#\d+\s*/, '').trim() });
  }
  return out;
}

/** Sin IA: líneas "Talla: S, M, L" de la sección de variantes. */
function opcionesBasicas(imp: ImportacionExt): Estructura['opciones'] {
  const out: Estructura['opciones'] = [];
  for (const s of imp.secciones.filter((x) => /variante/i.test(x.titulo))) {
    for (const l of s.texto.split('\n')) {
      const m = /^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]{2,30}):\s*(.+)$/.exec(l);
      const valores = m ? m[2].split(/\s*[,/|]\s*/).filter(Boolean) : [];
      if (m && valores.length > 1 && !out.some((o) => norm(o.nombre) === norm(m[1]))) out.push({ nombre: m[1].trim(), valores });
    }
  }
  return out;
}

export async function importarProducto(storeId: string, imp: ImportacionExt): Promise<{ id: string; nombre: string; resumen: string[] } | { error: string }> {
  const campos = Array.isArray(imp.campos) ? imp.campos.map((c) => ({ etiqueta: txt(c.etiqueta), valor: txt(c.valor), seccion: txt(c.seccion) })) : [];
  const media = Array.isArray(imp.media) ? imp.media.filter((m) => /^\/api\/media\//.test(txt(m.url))) : [];
  const nombre = campo(campos, 'nombre del producto', 'nombre') || txt(imp.titulo).replace(/^#\d+\s*/, '');
  if (!nombre) return { error: 'No encontramos el nombre del producto en la página. Abre el producto en Lucid y vuelve a intentar.' };
  const precio = pesos(campo(campos, 'precio'));
  const descripcion = campo(campos, 'descripcion');
  const modoUso = campo(campos, 'modo de uso', 'como usar');
  const caracteristicas = campo(campos, 'caracteristicas');
  const contenido = campo(campos, 'contenido del paquete', 'contenido');

  const ia = await estructurarConIA(storeId, { ...imp, campos }, precio);
  const combos = (Array.isArray(ia.combos) && ia.combos.length ? ia.combos : combosBasicos({ ...imp, campos }, precio))
    .map((c) => ({ cantidad: Math.max(1, Math.round(Number(c.cantidad) || 0)), precio: pesos(c.precio), ...(c.etiqueta ? { etiqueta: txt(c.etiqueta).slice(0, 60) } : {}) }))
    .filter((c) => c.cantidad > 1 && c.precio > 0).slice(0, 10);
  const opciones = (Array.isArray(ia.opciones) && ia.opciones.length ? ia.opciones : opcionesBasicas(imp))
    .map((o) => ({ nombre: txt(o.nombre).slice(0, 40), valores: [...new Set((Array.isArray(o.valores) ? o.valores : []).map((v) => txt(v).slice(0, 40)).filter(Boolean))].slice(0, 30).map((valor) => ({ valor })) }))
    .filter((o) => o.nombre && o.valores.length).slice(0, 4);
  const reglas = (Array.isArray(ia.reglas) ? ia.reglas : []).map((r) => txt(r).slice(0, 500)).filter(Boolean).slice(0, 40);
  const faqs = (Array.isArray(ia.faqs) ? ia.faqs : []).map((f) => ({ pregunta: txt(f.pregunta).slice(0, 300), respuesta: txt(f.respuesta).slice(0, 1500) })).filter((f) => f.pregunta && f.respuesta).slice(0, 40);

  // Multimedia: fotos del producto, testimonios y videos (por la sección donde estaban).
  const esTestimonio = (m: MediaExt) => /testimon|opinion|resena|review|cliente/i.test(norm(`${m.contexto || ''} ${m.seccion}`));
  const multimedia = [...new Map(media.filter((m) => !/mensaje/i.test(m.seccion) && (/multimedia|galer|foto|imagen/i.test(m.seccion) || esTestimonio(m))).map((m) => [m.url, m])).values()];
  const fotos = multimedia.filter((m) => m.tipo === 'imagen' && !esTestimonio(m)).map((m) => m.url).slice(0, 20);
  const testimonios = multimedia.filter((m) => m.tipo === 'imagen' && esTestimonio(m)).map((m) => m.url).slice(0, 20);
  const videos = multimedia.filter((m) => m.tipo === 'video').map((m) => m.url).slice(0, 10);

  // Mensaje inicial: los bloques tal cual el orden del otro bot (imágenes seguidas en un solo bloque).
  const bloques: { tipo: string; valor?: string; valores?: string[] }[] = [];
  for (const b of Array.isArray(imp.mensaje) ? imp.mensaje : []) {
    const valor = txt(b.valor);
    if (!valor) continue;
    if (b.tipo === 'texto') bloques.push({ tipo: 'texto', valor: valor.slice(0, 4000) });
    else if (/^\/api\/media\//.test(valor) && ['imagen', 'video', 'audio'].includes(b.tipo)) {
      const ult = bloques[bloques.length - 1];
      if (ult && ult.tipo === b.tipo && b.tipo !== 'audio') ult.valores = [...(ult.valores || []), valor];
      else bloques.push({ tipo: b.tipo, valores: [valor] });
    }
  }
  if (!bloques.length && fotos.length) bloques.push({ tipo: 'imagen', valores: fotos.slice(0, 3) });

  const id = uid();
  db.transaction(() => {
    db.prepare(`INSERT INTO products (id, store_id, nombre, precio, descripcion, caracteristicas, modos_uso, contenido_paquete, bundles, opciones, reglas, faqs,
      fotos_subidas, testimonios, videos, mensaje_bloques, mensajes_iniciales, disparador, precio_promo, mensaje_inicial_activo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
      id, storeId, nombre.slice(0, 120), precio, descripcion, caracteristicas, modoUso, contenido, j(combos), j(opciones), j(reglas), j(faqs),
      j(fotos), j(testimonios), j(videos), j(bloques), j([{ id: 'm1', nombre: 'Mensaje 1', activo: true, bloques }]),
      txt(ia.disparador).slice(0, 200), Math.max(0, pesos(ia.precioPromo)),
    );
    // Variantes: una por combinación de opciones (o "Única" si no hay opciones).
    let combs: string[][] = [[]];
    for (const o of opciones) combs = combs.flatMap((c) => o.valores.map((v) => [...c, v.valor]));
    const labels = opciones.length ? combs.map((c) => c.join(' · ')).slice(0, 300) : ['Única'];
    const ins = db.prepare('INSERT INTO variants (id, product_id, label, stock, fotos, orden) VALUES (?,?,?,0,0,?)');
    labels.forEach((l, i) => ins.run(uid(), id, l, i + 1));
  })();

  const resumen = [
    precio ? `Precio ${precio.toLocaleString('es-CO')}` : 'Sin precio (revísalo)',
    `${combos.length} combo${combos.length === 1 ? '' : 's'}`,
    `${opciones.length ? opciones.map((o) => `${o.nombre} (${o.valores.length})`).join(' × ') : 'sin variantes'}`,
    `${fotos.length} foto${fotos.length === 1 ? '' : 's'}${videos.length ? ` · ${videos.length} video${videos.length === 1 ? '' : 's'}` : ''}${testimonios.length ? ` · ${testimonios.length} testimonio${testimonios.length === 1 ? '' : 's'}` : ''}`,
    `mensaje inicial de ${bloques.length} bloque${bloques.length === 1 ? '' : 's'}`,
    `${reglas.length} regla${reglas.length === 1 ? '' : 's'} · ${faqs.length} pregunta${faqs.length === 1 ? '' : 's'}`,
  ];
  registrarLog(storeId, 'info', 'producto', `Producto «${nombre}» importado desde ${imp.fuente || 'otro bot'}: ${resumen.join(' · ')}.`);
  return { id, nombre, resumen };
}

export const datosImportacion = (b: Fila): ImportacionExt => ({
  fuente: txt(b.fuente) || 'lucid', urlOrigen: txt(b.urlOrigen).slice(0, 300), titulo: txt(b.titulo).slice(0, 200),
  campos: (Array.isArray(b.campos) ? b.campos : []).slice(0, 400) as CampoExt[],
  secciones: (Array.isArray(b.secciones) ? b.secciones : []).slice(0, 40) as ImportacionExt['secciones'],
  bundles: (Array.isArray(b.bundles) ? b.bundles : []).slice(0, 20) as ImportacionExt['bundles'],
  media: (Array.isArray(b.media) ? b.media : []).slice(0, 120) as MediaExt[],
  mensaje: (Array.isArray(b.mensaje) ? b.mensaje : []).slice(0, 80) as BloqueExt[],
});
