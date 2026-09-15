import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/**
 * Menú desplegable moderno (sin el <select> nativo del sistema): un botón que
 * abre un panel flotante con opciones redondeadas, marca la seleccionada con ✓
 * y se cierra al hacer clic fuera. Dos variantes:
 *  - 'pill'  → chip compacto para barras de filtros (con etiqueta al frente).
 *  - 'field' → campo de formulario del ancho de su contenedor.
 */
export function Dropdown({
  value, onChange, options, variant = 'field', label, placeholder, width, active, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  variant?: 'pill' | 'field';
  label?: string;
  placeholder?: string;
  width?: number | string;
  active?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [arriba, setArriba] = useState(false); // abrir hacia arriba si no cabe abajo
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number }>({ left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Coloca el panel flotante respecto al botón (posición fija, en un portal), para
  // que NUNCA lo recorte un contenedor con overflow:hidden (ej: la tarjeta de pedidos).
  const recalcular = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const haciaArriba = window.innerHeight - r.bottom < 280 && r.top > 280;
    setArriba(haciaArriba);
    setPos({
      left: r.left,
      width: r.width,
      top: haciaArriba ? undefined : r.bottom + 6,
      bottom: haciaArriba ? window.innerHeight - r.top + 6 : undefined,
    });
  };

  useEffect(() => {
    if (!open) return;
    const cerrar = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Al hacer scroll o cambiar el tamaño, reubicamos el panel (o lo cerramos si el botón desaparece).
    const reubicar = () => recalcular();
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', reubicar);
    window.addEventListener('scroll', reubicar, true);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', reubicar);
      window.removeEventListener('scroll', reubicar, true);
    };
  }, [open]);

  const abrir = () => {
    if (!open) recalcular();
    setOpen((o) => !o);
  };

  const sel = options.find((o) => o.value === value);
  const isActive = active ?? (variant === 'pill' && options.length > 0 && value !== options[0].value);
  const pill = variant === 'pill';

  const triggerStyle: CSSProperties = pill
    ? {
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, boxSizing: 'border-box',
        border: '1px solid ' + (isActive ? '#0F172A' : '#E2E8F0'), background: isActive ? '#0F172A' : '#fff',
        color: isActive ? '#fff' : '#475569', borderRadius: 999, padding: '0 11px 0 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }
    : {
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', minHeight: 40,
        border: '1px solid ' + (open ? '#0F172A' : '#E2E8F0'), background: '#fff', color: '#1E293B',
        borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: open ? '0 0 0 3px rgba(15,23,42,.06)' : 'none', transition: 'border-color .15s, box-shadow .15s', textAlign: 'left',
      };

  return (
    <div ref={ref} style={{ position: 'relative', display: pill ? 'inline-block' : 'block', width: pill ? undefined : (width ?? '100%') }}>
      <button type="button" onClick={abrir} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel || label} style={triggerStyle}>
        {label && <span style={{ color: pill ? (isActive ? 'rgba(255,255,255,.7)' : '#94A3B8') : '#94A3B8', whiteSpace: 'nowrap', fontWeight: 600 }}>{label}</span>}
        <span style={{ flex: pill ? undefined : 1, fontWeight: pill ? 700 : 600, color: sel ? 'inherit' : '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sel ? sel.label : (placeholder || 'Selecciona…')}
          {sel?.count != null ? ` (${sel.count})` : ''}
        </span>
        <span aria-hidden style={{ fontSize: 10, opacity: 0.6, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: pill ? -1 : 0 }}>▾</span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          role="listbox"
          style={{
            position: 'fixed', zIndex: 3000, left: pos.left, minWidth: pos.width,
            ...(arriba ? { bottom: pos.bottom } : { top: pos.top }),
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
            boxShadow: '0 10px 30px rgba(15,23,42,.14), 0 2px 6px rgba(15,23,42,.06)',
            padding: 5, maxHeight: 260, overflowY: 'auto',
          }}
        >
          {options.map((o) => {
            const activa = o.value === value;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={activa}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="df-dd-item"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: activa ? 700 : 500, color: activa ? '#047857' : '#334155',
                  background: activa ? '#ECFDF5' : 'transparent', whiteSpace: 'nowrap',
                }}
              >
                {o.icon && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{o.icon}</span>}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                {o.count != null && <span style={{ fontSize: 11, fontWeight: 700, color: activa ? '#059669' : '#94A3B8', background: activa ? '#D1FAE5' : '#F1F5F9', borderRadius: 999, padding: '0 7px' }}>{o.count}</span>}
                {activa && <span style={{ color: '#059669', fontWeight: 800, flexShrink: 0 }}>✓</span>}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
