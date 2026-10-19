import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Campo de texto con sugerencias (autocompletar). Deja escribir CUALQUIER valor
 * a mano y a la vez ofrece una lista filtrable de opciones predeterminadas.
 * Sirve para departamento/ciudad: evita errores de dedo pero no obliga a que el
 * valor esté en la lista (hay municipios que no incluimos).
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  inputStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  inputStyle?: React.CSSProperties;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resalte, setResalte] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // La lista se abre en un portal con posición fija: así ningún modal o tarjeta
  // con overflow la recorta ni queda tapada por lo que sigue debajo.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
  const recalcular = () => {
    const r = boxRef.current?.getBoundingClientRect(); if (!r) return;
    const arriba = window.innerHeight - r.bottom < 250 && r.top > 250;
    setPos({ left: r.left, width: r.width, top: arriba ? undefined : r.bottom + 4, bottom: arriba ? window.innerHeight - r.top + 4 : undefined });
  };

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);
  useEffect(() => {
    if (!abierto) return;
    recalcular();
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    return () => { window.removeEventListener('resize', recalcular); window.removeEventListener('scroll', recalcular, true); };
  }, [abierto]);

  const q = norm(value);
  // Si lo escrito coincide exactamente con una opción, mostramos todas (para
  // poder cambiar de idea); si no, filtramos por lo que se lleva escrito.
  const exacto = options.some((o) => norm(o) === q);
  const filtradas = !value || exacto ? options : options.filter((o) => norm(o).includes(q));
  const lista = filtradas.slice(0, 60);

  const elegir = (v: string) => {
    onChange(v);
    setAbierto(false);
    setResalte(-1);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setAbierto(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setResalte((r) => Math.min(lista.length - 1, r + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setResalte((r) => Math.max(0, r - 1)); }
    else if (e.key === 'Enter' && resalte >= 0 && lista[resalte]) { e.preventDefault(); elegir(lista[resalte]); }
    else if (e.key === 'Escape') { setAbierto(false); }
  };

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 10,
    padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, background: 'var(--df-surface)',
    color: 'var(--df-text-body)', ...inputStyle,
    ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : {}),
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setAbierto(true); setResalte(-1); }}
        onFocus={() => !disabled && setAbierto(true)}
        onKeyDown={onKey}
        style={inp}
        autoComplete="off"
      />
      {abierto && lista.length > 0 && createPortal(
        <div
          ref={popRef}
          className="df-pop"
          style={{
            position: 'fixed', left: pos.left, width: pos.width, zIndex: 3000,
            ...(pos.bottom != null ? { bottom: pos.bottom } : { top: pos.top }),
            background: 'var(--df-surface)', border: '1px solid var(--df-border)', borderRadius: 10,
            boxShadow: '0 12px 32px rgba(15,23,42,.18)', maxHeight: 240, overflowY: 'auto', padding: 4,
          }}
        >
          {lista.map((o, i) => (
            <div
              key={o}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }}
              onMouseEnter={() => setResalte(i)}
              style={{
                padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13.5,
                background: i === resalte ? 'var(--df-bg)' : 'transparent',
                color: 'var(--df-text-body)',
              }}
            >
              {o}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
