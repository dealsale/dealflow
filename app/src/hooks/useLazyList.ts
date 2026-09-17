import { useEffect, useRef, useState } from 'react';

/**
 * Renderiza una lista larga POR TANDAS para no montar cientos de filas en el DOM
 * a la vez (eso es lo que pone lento el Inbox con muchos chats). Empieza mostrando
 * `base` elementos; al acercarse al final del scroll agrega otra tanda (`step`), y
 * al volver arriba vuelve a `base` para soltar la memoria de los que ya no se ven.
 *
 * Detecta solo el scroll: si el propio contenedor (rootRef) tiene scroll, lo usa;
 * si no, busca el ancestro con scroll (ej. el <main> en móvil); si no, la ventana.
 * Devuelve cuántos mostrar (`count`) y el ref que va en el contenedor de la lista.
 *
 * `resetKey` vuelve a la primera tanda cuando cambia (ej. al cambiar de filtro).
 */
export function useLazyList(total: number, resetKey: unknown, base = 15, step = 15) {
  const [count, setCount] = useState(base);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCount(base); }, [resetKey, base]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scrolleable = (n: HTMLElement) => n.scrollHeight > n.clientHeight && /(auto|scroll)/.test(getComputedStyle(n).overflowY);
    let scroller: HTMLElement | Window = window;
    if (scrolleable(root)) {
      scroller = root;
    } else {
      let n = root.parentElement;
      while (n) { if (scrolleable(n)) { scroller = n; break; } n = n.parentElement; }
    }
    const metrics = () => {
      if (scroller instanceof Window) {
        const d = document.scrollingElement || document.documentElement;
        return { top: d.scrollTop, view: window.innerHeight, full: d.scrollHeight };
      }
      return { top: scroller.scrollTop, view: scroller.clientHeight, full: scroller.scrollHeight };
    };
    const onScroll = () => {
      const { top, view, full } = metrics();
      if (top + view >= full - 260) setCount((c) => (c < total ? c + step : c));
      else if (top < 140) setCount((c) => (c > base ? base : c));
    };
    scroller.addEventListener('scroll', onScroll, { passive: true } as AddEventListenerOptions);
    return () => scroller.removeEventListener('scroll', onScroll as EventListener);
  }, [total, base, step]);

  return { count: Math.min(count, Math.max(total, base)), rootRef };
}
