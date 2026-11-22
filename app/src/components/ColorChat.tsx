/**
 * Color del chat por producto: los chats que vienen de un producto (por su mensaje
 * inicial o su anuncio) se marcan en el Inbox con el color que se elige aquí.
 */
export const COLORES_CHAT: { color: string; nombre: string }[] = [
  { color: '#EF4444', nombre: 'Rojo' },
  { color: '#F97316', nombre: 'Naranja' },
  { color: '#EAB308', nombre: 'Amarillo' },
  { color: '#22C55E', nombre: 'Verde' },
  { color: '#14B8A6', nombre: 'Turquesa' },
  { color: '#3B82F6', nombre: 'Azul' },
  { color: '#8B5CF6', nombre: 'Morado' },
  { color: '#EC4899', nombre: 'Rosado' },
  { color: '#A16207', nombre: 'Café' },
  { color: '#64748B', nombre: 'Gris' },
];

export const nombreColorChat = (c: string) => COLORES_CHAT.find((x) => x.color.toUpperCase() === String(c || '').toUpperCase())?.nombre || 'Color';

/** Botones de colores (más «Sin color») para elegir el del producto. */
export function SelectorColorChat({ valor, onCambio }: { valor: string; onCambio: (c: string) => void }) {
  const actual = String(valor || '').toUpperCase();
  const bola = (on: boolean, fondo: string, borde?: string) => ({
    width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', background: fondo, flexShrink: 0,
    border: borde || 'none', boxShadow: on ? '0 0 0 2px var(--df-surface), 0 0 0 4px var(--df-text-strong)' : '0 1px 2px rgba(15,23,42,.2)',
    display: 'grid', placeItems: 'center', color: '#fff', fontSize: 14, fontWeight: 800, padding: 0, transition: 'box-shadow .15s',
  } as const);
  return (
    <div role="radiogroup" aria-label="Color del chat" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <button type="button" role="radio" aria-checked={!actual} title="Sin color" onClick={() => onCambio('')}
        style={{ ...bola(!actual, 'var(--df-surface)', '2px dashed var(--df-border-strong)'), color: 'var(--df-text-faint)' }}>∅</button>
      {COLORES_CHAT.map((c) => {
        const on = actual === c.color;
        return <button key={c.color} type="button" role="radio" aria-checked={on} title={c.nombre} aria-label={c.nombre} onClick={() => onCambio(c.color)} style={bola(on, c.color)}>{on ? '✓' : ''}</button>;
      })}
      {actual && <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--df-text-secondary)' }}>{nombreColorChat(actual)}</span>}
    </div>
  );
}

/** Etiqueta pequeña con el color y el nombre del producto del que vino el chat. */
export function EtiquetaProductoChat({ color, nombre, compacta }: { color: string; nombre: string; compacta?: boolean }) {
  return (
    <span title={`Vino por el producto: ${nombre}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: compacta ? 130 : 220, fontSize: 11, fontWeight: 700,
      color, background: `color-mix(in srgb, ${color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      borderRadius: 999, padding: '1px 8px 1px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</span>
    </span>
  );
}

/** Franja lateral gruesa del color del producto, con un degradado suave hacia adentro (fila del chat en el Inbox). */
export function franjaColorChat(color: string): { borderLeft: string; background: string } {
  return {
    borderLeft: `6px solid ${color}`,
    background: `linear-gradient(90deg, color-mix(in srgb, ${color} 20%, var(--df-surface)) 0%, color-mix(in srgb, ${color} 7%, var(--df-surface)) 45%, var(--df-surface) 100%)`,
  };
}
