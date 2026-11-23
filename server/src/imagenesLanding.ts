/**
 * Fotos livianas para las landings (lo que hace Shopify con su CDN): cada foto subida se
 * entrega en WebP y al ancho que de verdad se ve (miniatura, celular, computador), en vez
 * del archivo original de varios MB. La versión achicada se guarda en disco la primera vez
 * y después sale directo. Aplica a todas las landings, también a las que ya existían, porque
 * el original no se toca: solo cambia lo que se le manda al navegador.
 */
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { imageSize } from 'image-size';
import { DATA_DIR } from './db.js';

/** Anchos que se generan (se redondea hacia arriba al más cercano). */
export const ANCHOS = [160, 320, 480, 640, 828, 1080, 1440] as const;
const anchoValido = (w: number) => ANCHOS.find((a) => a >= w) || ANCHOS[ANCHOS.length - 1];

const dirCache = (storeId: string) => {
  const d = path.resolve(DATA_DIR, 'landings-media-opt', storeId.replace(/[^a-zA-Z0-9_-]/g, ''));
  mkdirSync(d, { recursive: true });
  return d;
};

type SharpFn = typeof import('sharp').default;
let sharpMod: SharpFn | null | undefined;
async function cargarSharp(): Promise<SharpFn | null> {
  if (sharpMod !== undefined) return sharpMod;
  try { sharpMod = (await import('sharp')).default; } catch (e) { console.warn('[imagenes] sin sharp: las landings usan la foto original', e); sharpMod = null; }
  return sharpMod;
}

const enCurso = new Map<string, Promise<string | null>>();
// Máximo 2 fotos achicándose a la vez: así el servidor nunca se frena por esto.
let activos = 0;
const espera: (() => void)[] = [];
async function turno<T>(fn: () => Promise<T>): Promise<T> {
  if (activos >= 2) await new Promise<void>((r) => espera.push(r));
  activos++;
  try { return await fn(); } finally { activos--; espera.shift()?.(); }
}

/**
 * Devuelve la ruta de la versión liviana (WebP, máximo `ancho` px) de una foto pública de
 * landing; null si no se pudo (entonces se manda la original).
 */
export async function fotoOptimizada(storeId: string, original: string, ancho: number): Promise<string | null> {
  const w = anchoValido(ancho);
  const base = path.basename(original).replace(/\.[a-z0-9]+$/i, '');
  const destino = path.join(dirCache(storeId), `${base}-${w}.webp`);
  if (existsSync(destino)) return destino;
  const clave = destino;
  const ya = enCurso.get(clave);
  if (ya) return ya;
  const tarea = turno(async () => {
    const sharp = await cargarSharp();
    if (!sharp) return null;
    try {
      const animada = /\.gif$/i.test(original);
      await sharp(original, { animated: animada, limitInputPixels: 150_000_000 })
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: animada ? 70 : 76, effort: 4 })
        .toFile(destino);
      return destino;
    } catch (e) {
      console.warn('[imagenes] no se pudo achicar', path.basename(original), e instanceof Error ? e.message : e);
      return null;
    } finally {
      enCurso.delete(clave);
    }
  });
  enCurso.set(clave, tarea);
  return tarea;
}

// ── Medidas de cada foto (ancho/alto) para que la página no "salte" al cargar ──
const medidas = new Map<string, { w: number; h: number } | null>();
const rutaMedia = (u: string): { storeId: string; file: string } | null => {
  const m = /^\/l\/media\/([A-Za-z0-9_-]+)\/([a-z0-9_-]+\.(?:jpg|png|webp|gif))$/i.exec(u);
  return m ? { storeId: m[1], file: m[2] } : null;
};

/** Ancho y alto de una foto pública de landing (lee solo la cabecera del archivo; se recuerda). */
export function medidaFoto(u: string): { w: number; h: number } | null {
  if (medidas.has(u)) return medidas.get(u)!;
  let r: { w: number; h: number } | null = null;
  const m = rutaMedia(u);
  if (m) {
    try {
      const p = path.resolve(DATA_DIR, 'landings-media', m.storeId, m.file);
      if (existsSync(p)) {
        const d = imageSize(readFileSync(p));
        let w = d.width || 0, h = d.height || 0;
        if (d.orientation && d.orientation >= 5) [w, h] = [h, w];
        if (w > 0 && h > 0) r = { w, h };
      }
    } catch { /* foto rara: sin medidas */ }
  }
  if (medidas.size > 5000) medidas.clear();
  medidas.set(u, r);
  return r;
}

/**
 * Atributos de una <img> de landing: src liviano + srcset (varios anchos) + sizes y, si se
 * conocen, width/height. `tam` es el ancho con que se ve en pantalla (atributo sizes).
 * Las fotos externas (https://…) quedan como están.
 */
export function atributosFoto(u: string, tam: string, maxAncho = 1440): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  if (!rutaMedia(u)) return `src="${e(u)}"`;
  const md = medidaFoto(u);
  const tope = Math.min(maxAncho, md?.w || maxAncho);
  const unicos = [...new Set([...ANCHOS.filter((a) => a < tope), anchoValido(tope)])].filter((a) => a <= Math.max(maxAncho, 160));
  const medio = unicos.find((a) => a >= 640) || unicos[unicos.length - 1];
  const dim = md ? ` width="${md.w}" height="${md.h}"` : '';
  return `src="${e(u)}?w=${medio}" srcset="${unicos.map((a) => `${e(u)}?w=${a} ${a}w`).join(', ')}" sizes="${e(tam)}"${dim}`;
}

/** <link rel="preload"> de la primera foto con el mismo srcset que la <img> (no se baja dos veces). */
export function precargaFoto(u: string, tam: string): string {
  const a = atributosFoto(u, tam);
  const src = /src="([^"]*)"/.exec(a)?.[1] || '';
  const set = /srcset="([^"]*)"/.exec(a)?.[1];
  return set
    ? `<link rel="preload" as="image" href="${src}" imagesrcset="${set}" imagesizes="${tam.replace(/"/g, '&quot;')}" fetchpriority="high">`
    : `<link rel="preload" as="image" href="${src}" fetchpriority="high">`;
}

/** Solo el src liviano (sin srcset), para logos: el tamaño en pantalla lo manda el CSS de siempre. */
export function fotoSimple(u: string, ancho: number): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return rutaMedia(u) ? `src="${e(u)}?w=${anchoValido(ancho)}"` : `src="${e(u)}"`;
}

/**
 * Landings que ya existían: al arrancar se dejan listas (una por una, sin afanar al servidor)
 * las versiones livianas de sus fotos, así la primera visita ya carga rápido. Las que ya
 * están hechas se saltan, entonces repetirlo en cada arranque casi no cuesta.
 */
export async function prepararFotosExistentes(filas: { store_id: string; datos: string }[]): Promise<number> {
  let hechas = 0;
  const vistos = new Set<string>();
  for (const f of filas) {
    let d: Record<string, unknown> = {};
    try { d = JSON.parse(f.datos || '{}'); } catch { continue; }
    const lista = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).map(String) : []);
    const trabajos: [string, number[]][] = [
      ...lista('galeria').slice(0, 1).map((u) => [u, [480, 640, 828, 1080]] as [string, number[]]),
      ...lista('galeria').slice(1).map((u) => [u, [828]] as [string, number[]]),
      ...lista('galeria').map((u) => [u, [320]] as [string, number[]]),
      ...lista('imagenes').map((u) => [u, [828]] as [string, number[]]),
    ];
    for (const [u, anchos] of trabajos) {
      const m = rutaMedia(u);
      if (!m || m.storeId !== f.store_id) continue;
      const p = path.resolve(DATA_DIR, 'landings-media', m.storeId, m.file);
      if (!existsSync(p)) continue;
      for (const w of anchos) {
        const k = `${u}|${w}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        const destino = path.join(dirCache(m.storeId), `${m.file.replace(/\.[a-z0-9]+$/i, '')}-${anchoValido(w)}.webp`);
        if (existsSync(destino)) continue;
        if (await fotoOptimizada(m.storeId, p, w)) hechas++;
        await new Promise((r) => setTimeout(r, 40));
      }
    }
  }
  return hechas;
}
