// Prepara el HTML del Artifact: incrusta las fuentes de Google como data URIs
// (el CSP del Artifact bloquea CDNs) y quita el esqueleto doctype/html/head/body,
// que el publicador agrega por su cuenta.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , distHtmlPath, fontsCssPath, outPath] = process.argv;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function embedFonts(css) {
  // El CSS de Google trae un bloque @font-face por subconjunto, precedido por
  // un comentario como /* latin */ — conservamos solo los subconjuntos latinos.
  const blocks = css.split(/(?=\/\* [a-z-]+(?: \[\d+\])? \*\/)/g).filter((b) => b.includes('@font-face'));
  const latin = blocks.filter((b) => /^\/\* latin(?:-ext)? \*\//.test(b.trim()));
  const out = [];
  for (const block of latin) {
    const urlMatch = block.match(/url\((https:[^)]+\.woff2)\)/);
    if (!urlMatch) continue;
    const res = await fetch(urlMatch[1], { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error('No se pudo descargar la fuente: ' + urlMatch[1]);
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    out.push(block.replace(urlMatch[1], `data:font/woff2;base64,${b64}`));
  }
  return out.join('\n');
}

let html = readFileSync(distHtmlPath, 'utf8');
const fontsCss = readFileSync(fontsCssPath, 'utf8');
const fontFaces = await embedFonts(fontsCss);

// Quitar el esqueleto y los enlaces a CDNs de fuentes
html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>/i, '')
  .replace(/<\/html>/i, '')
  .replace(/<head>/i, '')
  .replace(/<\/head>/i, '')
  .replace(/<body>/i, '')
  .replace(/<\/body>/i, '')
  .replace(/<meta[^>]*>/gi, '')
  .replace(/<link[^>]*fonts\.g[^>]*>/gi, '');

const content = `<title>DealFlow · Panel del vendedor</title>\n<style>\n${fontFaces}\n</style>\n${html.trim()}\n`;
writeFileSync(outPath, content);
console.log('Artifact listo:', outPath, (content.length / 1024).toFixed(0) + ' KB');
