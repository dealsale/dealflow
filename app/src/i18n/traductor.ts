/**
 * Idioma de la interfaz (Español / English).
 *
 * La app está escrita en español. En inglés, esta capa traduce en vivo lo que se
 * pinta en pantalla: textos, placeholder, title y aria-label, usando el
 * diccionario en.json (frases exactas + plantillas con partes variables, como
 * "Vence en {0} días"). Un MutationObserver traduce también lo que aparece
 * después (modales, menús, avisos). Solo cambia el texto visible: React sigue
 * funcionando igual y, si vuelve a pintar el texto en español, se retraduce.
 *
 * No toca contenido del usuario (chats, nombres, lo que escribe): se excluye todo
 * lo que esté dentro de [translate="no"], los campos de texto y lo que no esté
 * en el diccionario.
 */
import dic from './en.json';

export type IdiomaUI = 'es' | 'en';
const CLAVE = 'dealflow:lang';

export function idiomaUI(): IdiomaUI {
  try { return localStorage.getItem(CLAVE) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

export function cambiarIdiomaUI(idioma: IdiomaUI): void {
  try { localStorage.setItem(CLAVE, idioma); } catch { /* modo privado */ }
  // Al volver a español se recarga (lo más simple y seguro para restaurar todo).
  if (idioma === 'es') { window.location.reload(); return; }
  iniciarTraduccion();
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const exactos = new Map<string, string>(Object.entries((dic as unknown as { exactos: Record<string, string> }).exactos));
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plantillas = ((dic as unknown as { plantillas: [string, string][] }).plantillas)
  .map(([es, en]) => {
    // "Vence en {0} día{1}" → /^Vence en (.+?) día(.*?)$/
    const partes = es.split(/\{(\d+)\}/);
    let re = '^';
    for (let i = 0; i < partes.length; i++) re += i % 2 === 0 ? escapar(partes[i]) : '(.*?)';
    return { re: new RegExp(re + '$'), es, en, orden: (es.match(/\{(\d+)\}/g) || []).map((m) => Number(m.slice(1, -1))) };
  })
  // Las más largas (más específicas) primero.
  .sort((a, b) => b.es.length - a.es.length);

/** Traduce un texto (o lo devuelve igual si no está en el diccionario). */
export function t(texto: string): string {
  if (idiomaUI() !== 'en' || !texto) return texto;
  return traducir(texto) ?? texto;
}

// Fechas que arma el navegador en español ("lunes, 19 de octubre", "13 de oct, 07:20 a. m.").
const DIAS: Record<string, string> = { lunes: 'Monday', martes: 'Tuesday', miércoles: 'Wednesday', miercoles: 'Wednesday', jueves: 'Thursday', viernes: 'Friday', sábado: 'Saturday', sabado: 'Saturday', domingo: 'Sunday' };
const MESES: Record<string, string> = { enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', septiembre: 'September', setiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December',
  ene: 'Jan', feb: 'Feb', mar: 'Mar', abr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', sept: 'Sep', sep: 'Sep', oct: 'Oct', nov: 'Nov', dic: 'Dec' };
const RE_FECHA = new RegExp(`^(?:(${Object.keys(DIAS).join('|')}),?\\s+)?(\\d{1,2})\\s+de\\s+(${Object.keys(MESES).join('|')})\\.?(?:\\s+de\\s+(\\d{4}))?(.*)$`, 'i');
function traducirFecha(clave: string): string | null {
  const m = clave.match(RE_FECHA);
  if (!m) {
    if (MESES[clave.toLowerCase()] && clave.length > 3) return MESES[clave.toLowerCase()];
    const d = clave.match(/^(\d+)\s+(días|día)$/i);
    return d ? `${d[1]} ${d[1] === '1' ? 'day' : 'days'}` : null;
  }
  const [, dia, num, mes, anio, resto] = m;
  const r = (resto || '').replace(/\ba\.\s?m\./gi, 'AM').replace(/\bp\.\s?m\./gi, 'PM');
  if (r && !/^[\s,:\d·APM]*$/.test(r)) return null;
  return `${dia ? DIAS[dia.toLowerCase()] + ', ' : ''}${MESES[mes.toLowerCase()]} ${num}${anio ? ', ' + anio : ''}${r}`;
}

function traducir(original: string): string | null {
  const clave = norm(original);
  if (!clave || clave.length < 2 || !/[a-záéíóúñ]/i.test(clave)) return null;
  const directo = exactos.get(clave) ?? traducirFecha(clave);
  let en: string | null = directo ?? null;
  if (en == null) {
    for (const p of plantillas) {
      const m = clave.match(p.re);
      if (!m) continue;
      en = p.en.replace(/\{(\d+)\}/g, (_, n) => {
        const idx = p.orden.indexOf(Number(n));
        const valor = idx >= 0 ? m[idx + 1] : '';
        return traducir(valor) ?? valor; // las partes variables también pueden ser textos del diccionario
      });
      break;
    }
  }
  if (en == null) return null;
  // Conserva los espacios de los bordes (en JSX son separadores entre textos).
  const ini = original.match(/^\s*/)?.[0] || '';
  const fin = original.match(/\s*$/)?.[0] || '';
  return ini + en + fin;
}

const EXCLUIR = '[translate="no"], script, style, textarea, code, pre, [contenteditable="true"]';
const ATRIBUTOS = ['placeholder', 'title', 'aria-label'];
// Último valor que pusimos en cada nodo: si React no lo cambió, no lo tocamos otra vez.
const puestos = new WeakMap<Node, string>();

function traducirTexto(n: Text) {
  const v = n.nodeValue;
  if (!v || puestos.get(n) === v) return;
  const p = n.parentElement;
  if (!p) return;
  // translate="yes" dentro de una zona excluida (p. ej. el texto de ayuda de un chat vacío) sí se traduce.
  const ex = p.closest(EXCLUIR); const si = p.closest('[translate="yes"]');
  if (ex && !(si && ex.contains(si))) return;
  const en = traducir(v);
  if (en != null && en !== v) { n.nodeValue = en; puestos.set(n, en); }
}

function traducirAtributos(el: Element) {
  if (el.closest('[translate="no"]')) return;
  for (const a of ATRIBUTOS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const marca = `__t_${a}`;
    if ((el as unknown as Record<string, string>)[marca] === v) continue;
    const en = traducir(v);
    if (en != null && en !== v) { el.setAttribute(a, en); (el as unknown as Record<string, string>)[marca] = en; }
  }
}

function recorrer(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) { traducirTexto(raiz as Text); return; }
  if (raiz.nodeType !== Node.ELEMENT_NODE) return;
  const el = raiz as Element;
  if (el.matches?.(EXCLUIR)) return;
  traducirAtributos(el);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) traducirTexto(n as Text);
    else traducirAtributos(n as Element);
  }
}

let observador: MutationObserver | null = null;
export function iniciarTraduccion(): void {
  if (idiomaUI() !== 'en' || observador || typeof document === 'undefined') return;
  document.documentElement.lang = 'en';
  recorrer(document.body);
  observador = new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === 'characterData') traducirTexto(c.target as Text);
      else if (c.type === 'attributes') traducirAtributos(c.target as Element);
      else c.addedNodes.forEach(recorrer);
    }
  });
  observador.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  // Ventanas nativas del navegador (confirmar / avisar).
  const conf = window.confirm.bind(window); window.confirm = (m?: string) => conf(m ? t(m) : m);
  const al = window.alert.bind(window); window.alert = (m?: string) => al(m ? t(m) : m);
  document.title = t(document.title);
}
