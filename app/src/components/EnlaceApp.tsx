import type { CSSProperties, MouseEvent, ReactNode } from 'react';

/**
 * Enlace interno de DealFlow: un clic normal navega dentro de la app (sin recargar), y
 * Ctrl/⌘ + clic, Shift + clic o el clic de la rueda abren esa pantalla en otra pestaña,
 * para trabajar en dos cosas al tiempo. También deja "Abrir en una pestaña nueva" en el
 * menú del clic derecho.
 */
export const abreAparte = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;

export function EnlaceApp({ href, onAbrir, style, className, title, children }: { href: string; onAbrir: () => void; style?: CSSProperties; className?: string; title?: string; children: ReactNode }) {
  return (
    <a href={href} title={title} className={className}
      onClick={(e) => { if (abreAparte(e)) return; e.preventDefault(); onAbrir(); }}
      style={{ textDecoration: 'none', color: 'inherit', ...style }}>
      {children}
    </a>
  );
}

/**
 * Para filas que ya tienen botones adentro (pedidos, chats, productos): clic normal hace
 * lo de siempre; Ctrl/⌘ + clic o clic con la rueda abre la misma pantalla en otra pestaña.
 * Uso: <div {...clicAparte(url, abrir)}>
 */
export function clicAparte(url: string, normal: () => void) {
  return {
    onClick: (e: MouseEvent) => { if (abreAparte(e)) { e.preventDefault(); window.open(url, '_blank'); return; } normal(); },
    onAuxClick: (e: MouseEvent) => { if (e.button === 1) { e.preventDefault(); window.open(url, '_blank'); } },
    onMouseDown: (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); }, // sin el autoscroll de la rueda
  };
}
