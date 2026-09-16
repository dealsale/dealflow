import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

/**
 * Textarea que crece SOLO con su contenido (no toca estirarla a mano). Se ajusta
 * al escribir y al cambiar el valor; con un tope opcional (maxHeight) hace scroll
 * interno para textos gigantes. Ideal para reglas, FAQs y bloques de texto largos.
 */
export function AutoTextarea({
  value, onChange, placeholder, style, minRows = 1, maxHeight = 320, onBlur, onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  minRows?: number;
  maxHeight?: number;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ajustar = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };
  // Reajusta cuando cambia el valor (ej: al cargar el producto o pegar texto).
  useLayoutEffect(ajustar, [value, maxHeight]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => { onChange(e.target.value); ajustar(); }}
      onInput={ajustar}
      onBlur={onBlur}
      onFocus={onFocus}
      style={{ resize: 'none', overflowY: 'hidden', ...style }}
    />
  );
}
