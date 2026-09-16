/** Filtros unificados y livianos para Pedidos, Leads y Chat. */
import { Dropdown } from './Dropdown';

export function SearchInput({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number | string }) {
  return (
    <div style={{ position: 'relative', width: width ?? 260, maxWidth: '100%' }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--df-text-faint)', pointerEvents: 'none' }}>🔍</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--df-border)', borderRadius: 999, padding: '8px 14px 8px 32px', fontFamily: 'inherit', fontSize: 13, background: 'var(--df-surface)', color: 'var(--df-text-strong)' }}
      />
    </div>
  );
}

/** Chip compacto y liviano. Activo = oscuro; inactivo = gris muy suave, sin borde pesado. */
export function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        background: active ? '#0F172A' : 'var(--df-surface-2)',
        color: active ? '#fff' : 'var(--df-text-secondary)',
        transition: 'background .15s, color .15s',
      }}
    >
      {children}
      {count != null && count > 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '0 6px', borderRadius: 999, background: active ? 'rgba(255,255,255,.22)' : 'var(--df-border)', color: active ? '#fff' : 'var(--df-text-muted)' }}>{count}</span>
      )}
    </span>
  );
}

/** Fila de filtros: chips que envuelven, con un pequeño gap. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
}

/**
 * Menú desplegable de filtro compacto: "Etiqueta ▾", "Fecha ▾", etc. Se pinta
 * oscuro cuando hay un filtro activo (valor distinto a la primera opción). Usa
 * el Dropdown moderno (panel flotante, no el <select> del sistema).
 */
export function FilterSelect({ label, value, onChange, options, active }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
  active?: boolean;
}) {
  return <Dropdown variant="pill" label={label} value={value} onChange={onChange} options={options} active={active} />;
}
