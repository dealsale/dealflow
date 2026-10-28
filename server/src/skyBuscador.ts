/**
 * Buscador de la base de conocimiento de SKY (assets/sky/*.md). Cada artículo empieza con
 * "## Título" y puede traer "Sección:" y "Claves:". Para cada pregunta se eligen los artículos
 * más parecidos (pregunta + mensaje anterior + sección del panel donde está la persona), así el
 * prompt lleva solo lo que aplica y no toda la base.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface Articulo { titulo: string; secciones: string[]; claves: string; cuerpo: string; texto: string }

const DIR = path.resolve(import.meta.dirname, '../assets/sky');

const VACIAS = new Set(('de la el los las un una unos unas y o a en con por para que se mi tu su sus mis tus es son al del lo le les me te nos como hago hacer puedo puede quiero necesito donde cual cuales cuando porque por que esto esta este eso esa ese hay ya no si mas muy tambien pero sin sobre entre todo todos toda cada otro otra hola buenas gracias favor ayuda ayudame dealflow sale dice tengo tiene tienen')
  .split(' '));

// Minúsculas, sin tildes ni signos; raíz corta para que "anulo", "anular" y "anulada" coincidan.
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]+/g, ' ');
const FINALES = /(aciones|iciones|acion|icion|ciones|cion|amente|mente|ando|iendo|adas|idas|ados|idos|ada|ida|ado|ido|ar|er|ir|as|es|os|a|e|o|s)$/;
const raiz = (w: string) => {
  if (/^\d+$/.test(w)) return w;
  const r = w.replace(FINALES, '');
  return (r.length >= 3 ? r : w).slice(0, 5);
};
export const palabras = (s: string) => normal(s).split(' ').filter((w) => w.length >= 3 && !VACIAS.has(w)).map(raiz);

/** Sección del panel (id de la ruta) → etiqueta usada en "Sección:" de los artículos. */
const SECCION: Record<string, string> = { crm: 'inbox', landings: 'tienda-en-linea' };

let cache: { articulos: Articulo[]; df: Map<string, number>; idx: { t: Set<string>; c: Set<string>; b: Map<string, number> }[] } | null = null;

export function articulos(): Articulo[] { return cargar().articulos; }

function cargar() {
  if (cache) return cache;
  const lista: Articulo[] = [];
  let archivos: string[] = [];
  try { archivos = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort(); } catch { archivos = []; }
  for (const f of archivos) {
    const txt = readFileSync(path.join(DIR, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const bloque of txt.split(/^## /m).slice(1)) {
      const [primera, ...resto] = bloque.split('\n');
      let secciones: string[] = []; let claves = '';
      const cuerpo = resto.filter((l) => {
        const s = /^Sección:\s*(.*)$/.exec(l); if (s) { secciones = s[1].split(',').map((x) => x.trim()).filter(Boolean); return false; }
        const c = /^Claves:\s*(.*)$/.exec(l); if (c) { claves = c[1]; return false; }
        return true;
      }).join('\n').trim();
      const titulo = primera.trim();
      lista.push({ titulo, secciones, claves, cuerpo, texto: `## ${titulo}\n${cuerpo}` });
    }
  }
  const idx = lista.map((a) => {
    const b = new Map<string, number>();
    for (const w of palabras(a.cuerpo)) b.set(w, (b.get(w) || 0) + 1);
    return { t: new Set(palabras(a.titulo)), c: new Set(palabras(a.claves)), b };
  });
  const df = new Map<string, number>();
  for (const i of idx) for (const w of new Set([...i.t, ...i.c, ...i.b.keys()])) df.set(w, (df.get(w) || 0) + 1);
  cache = { articulos: lista, df, idx };
  return cache;
}

/** Artículos más relevantes para la pregunta (con su puntaje), sin pasar de `maxChars`. */
export function buscarArticulos(pregunta: string, opts: { anterior?: string; seccion?: string; max?: number; maxChars?: number } = {}): { articulo: Articulo; puntaje: number }[] {
  const { articulos: lista, df, idx } = cargar();
  if (!lista.length) return [];
  const N = lista.length;
  const pesos = new Map<string, number>();
  for (const w of palabras(pregunta)) pesos.set(w, Math.max(pesos.get(w) || 0, 1));
  for (const w of palabras(opts.anterior || '')) if (!pesos.has(w)) pesos.set(w, 0.4);
  const sec = (opts.seccion || '').split('/').pop() || '';
  const seccion = SECCION[sec] || sec;
  const res = lista.map((articulo, i) => {
    let p = 0;
    for (const [w, peso] of pesos) {
      const d = df.get(w); if (!d) continue;
      const idf = Math.log(1 + N / d);
      const tf = idx[i].b.get(w) || 0;
      p += peso * idf * ((idx[i].t.has(w) ? 3 : 0) + (idx[i].c.has(w) ? 2.5 : 0) + Math.min(tf, 4) * 0.6);
    }
    if (p > 0 && seccion && articulo.secciones.includes(seccion)) p *= 1.25;
    return { articulo, puntaje: p };
  }).filter((r) => r.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje);
  if (!res.length) return [];
  const tope = res[0].puntaje;
  const out: typeof res = [];
  let chars = 0;
  for (const r of res) {
    if (out.length >= (opts.max ?? 6) || r.puntaje < tope * 0.3) break;
    if (chars + r.articulo.texto.length > (opts.maxChars ?? 16000) && out.length) continue;
    out.push(r); chars += r.articulo.texto.length;
  }
  return out;
}

/** Texto para el prompt: los artículos elegidos y, aparte, la lista de todos los temas. */
export function contextoSky(pregunta: string, anterior: string, seccion: string): string {
  const elegidos = buscarArticulos(pregunta, { anterior, seccion });
  const temas = articulos().map((a) => a.titulo).join(' · ');
  return [
    elegidos.length ? elegidos.map((r) => r.articulo.texto).join('\n\n') : '(No hay artículos que coincidan con esta pregunta.)',
    `\nTemas que cubre la base (para orientar si la pregunta no coincide): ${temas}`,
  ].join('\n');
}
