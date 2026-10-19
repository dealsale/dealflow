import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent as KEv, ReactNode } from 'react';

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
  value, onChange, options, variant = 'field', label, placeholder, width, active, ariaLabel, buscar, compacto,
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
  /** Muestra un buscador arriba de la lista (por defecto, con más de 8 opciones). */
  buscar?: boolean;
  /** Pill más bajito (para barras finas, como la de modo soporte). */
  compacto?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [resalte, setResalte] = useState(-1);
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

  // Si el panel se sale por la derecha de la pantalla (opciones largas en un panel
  // lateral), se corre hacia la izquierda para que siempre se vea completo.
  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    const sobra = r.right - (window.innerWidth - 8);
    if (sobra > 0) setPos((p) => ({ ...p, left: Math.max(8, p.left - sobra) }));
  }, [open, pos.left, pos.width]);

  const abrir = () => {
    if (!open) { recalcular(); setQ(''); setResalte(-1); }
    setOpen((o) => !o);
  };
  const conBuscador = buscar ?? options.length > 8;
  const nq = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const visibles = nq ? options.filter((o) => o.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(nq)) : options;
  const elegir = (v: string) => { onChange(v); setOpen(false); };
  // Teclado: flechas para moverse, Enter para elegir, Escape para cerrar.
  const onKey = (e: KEv) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { abrir(); return; }
      const n = visibles.length; if (!n) return;
      setResalte((r) => (r + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' && open && visibles[resalte]) { e.preventDefault(); elegir(visibles[resalte].value); }
  };

  const sel = options.find((o) => o.value === value);
  const isActive = active ?? (variant === 'pill' && options.length > 0 && value !== options[0].value);
  const pill = variant === 'pill';

  const triggerStyle: CSSProperties = pill && compacto
    ? {
        display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, boxSizing: 'border-box', maxWidth: 240,
        border: '1px solid rgba(255,255,255,.28)', background: 'rgba(0,0,0,.18)', color: '#fff',
        borderRadius: 6, padding: '0 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }
    : pill
    ? {
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, boxSizing: 'border-box',
        border: '1px solid ' + (isActive ? '#0F172A' : 'var(--df-border)'), background: isActive ? '#0F172A' : 'var(--df-surface)',
        color: isActive ? '#fff' : 'var(--df-text-secondary)', borderRadius: 999, padding: '0 11px 0 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }
    : {
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', minHeight: 40,
        border: '1px solid ' + (open ? 'var(--df-accent, #2e8bff)' : 'var(--df-border)'), background: 'var(--df-surface)', color: 'var(--df-text-strong)',
        borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: open ? '0 0 0 4px rgba(46,139,255,.14), 0 0 26px -8px rgba(46,139,255,.6)' : 'none', transition: 'border-color .2s, box-shadow .25s', textAlign: 'left',
      };

  return (
    <div ref={ref} style={{ position: 'relative', display: pill ? 'inline-block' : 'block', width: pill ? undefined : (width ?? '100%') }}>
      <button type="button" onClick={abrir} onKeyDown={onKey} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel || label} style={triggerStyle} className={pill && isActive && !compacto ? 'df-dd-pill-on' : undefined}>
        {label && <span style={{ color: pill ? (isActive ? 'rgba(255,255,255,.7)' : 'var(--df-text-faint)') : 'var(--df-text-faint)', whiteSpace: 'nowrap', fontWeight: 600 }}>{label}</span>}
        <span style={{ flex: pill ? undefined : 1, fontWeight: pill ? 700 : 600, color: sel ? 'inherit' : 'var(--df-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sel ? sel.label : (placeholder || 'Selecciona…')}
          {sel?.count != null ? ` (${sel.count})` : ''}
        </span>
        <span aria-hidden style={{ fontSize: 10, opacity: open ? 1 : 0.6, color: open ? 'var(--df-accent, #2e8bff)' : undefined, transition: 'transform .3s cubic-bezier(.2,.7,.2,1)', transform: open ? 'rotate(180deg)' : 'none', marginLeft: pill ? -1 : 0 }}>▾</span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          role="listbox"
          className={'df-pop' + (arriba ? ' df-pop-up' : '')}
          style={{
            position: 'fixed', zIndex: 3000, left: pos.left, minWidth: pos.width,
            ...(arriba ? { bottom: pos.bottom } : { top: pos.top }),
            background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 12,
            boxShadow: '0 18px 44px -12px rgba(15,23,42,.35), 0 2px 6px rgba(15,23,42,.08)',
            padding: 5, maxHeight: 300, overflowY: 'auto', maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box',
          }}
        >
          {conBuscador && (
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setResalte(0); }}
              onKeyDown={onKey}
              placeholder="Buscar…"
              aria-label="Buscar opción"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 8, padding: '7px 10px', marginBottom: 5, fontFamily: 'inherit', fontSize: 12.5, background: 'var(--df-bg)', color: 'var(--df-text-body)', outline: 'none' }}
            />
          )}
          {conBuscador && !visibles.length && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--df-text-faint)' }}>Nada coincide.</div>}
          {visibles.map((o, k) => {
            const activa = o.value === value;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={activa}
                onClick={() => elegir(o.value)}
                onMouseEnter={() => setResalte(k)}
                className={'df-dd-item' + (k === resalte ? ' df-dd-act' : '')}
                style={{
                  animationDelay: `${Math.min(k, 12) * 18}ms`,
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: activa ? 700 : 500, color: activa ? 'var(--df-brand-dark)' : 'var(--df-text-body)',
                  background: activa ? 'var(--df-brand-subtle-2)' : 'transparent', whiteSpace: 'nowrap',
                }}
              >
                {o.icon && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{o.icon}</span>}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                {o.count != null && <span style={{ fontSize: 11, fontWeight: 700, color: activa ? 'var(--df-brand)' : 'var(--df-text-faint)', background: activa ? 'var(--df-brand-subtle)' : 'var(--df-surface-2)', borderRadius: 999, padding: '0 7px' }}>{o.count}</span>}
                {activa && <span className="df-dd-check" aria-hidden>✓</span>}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
