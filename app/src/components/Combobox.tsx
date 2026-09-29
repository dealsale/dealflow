import { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

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
      {abierto && lista.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
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
        </div>
      )}
    </div>
  );
}
