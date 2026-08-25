/** Filtros unificados y livianos para Pedidos, Leads y Chat. */

export function SearchInput({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number | string }) {
  return (
    <div style={{ position: 'relative', width: width ?? 260, maxWidth: '100%' }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94A3B8', pointerEvents: 'none' }}>🔍</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 999, padding: '8px 14px 8px 32px', fontFamily: 'inherit', fontSize: 13, background: '#fff', color: '#1E293B' }}
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
        background: active ? '#0F172A' : '#F1F5F9',
        color: active ? '#fff' : '#475569',
        transition: 'background .15s, color .15s',
      }}
    >
      {children}
      {count != null && count > 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '0 6px', borderRadius: 999, background: active ? 'rgba(255,255,255,.22)' : '#E2E8F0', color: active ? '#fff' : '#64748B' }}>{count}</span>
      )}
    </span>
  );
}

/** Fila de filtros: chips que envuelven, con un pequeño gap. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
}
