import type { CSSProperties } from 'react';
import { OrigenBadge } from './OrigenPedido';

/**
 * Canales de los chats del Inbox (WhatsApp, Instagram, Messenger y chat web): el logo del
 * canal sobre el avatar de cada chat y los botones para filtrar por canal.
 */
export const CANALES_CHAT: { id: string; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'web', label: 'Chat web' },
];
/** Canal de un chat (los viejos sin canal son de WhatsApp). */
export const canalDe = (c: { canal?: string }) => (CANALES_CHAT.some((x) => x.id === c.canal) ? c.canal! : 'whatsapp');
export const nombreCanal = (id: string) => CANALES_CHAT.find((x) => x.id === id)?.label || 'WhatsApp';

/** Avatar del chat con el logo de su canal en la esquina. */
export function AvatarCanal({ avatarStyle, iniciales, canal }: { avatarStyle: CSSProperties; iniciales: string; canal: string }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-start' }} title={`Chat de ${nombreCanal(canal)}`}>
      <div style={avatarStyle}>{iniciales}</div>
      <span style={{ position: 'absolute', right: -3, bottom: -3, borderRadius: '50%', boxShadow: '0 0 0 2px var(--df-surface)', lineHeight: 0 }}>
        <OrigenBadge origen={canal} size={17} />
      </span>
    </div>
  );
}

/** Botones "Todos · WhatsApp · Instagram · Messenger · Chat web" con cuántos chats hay en cada uno. */
export function ChipsCanal({ conteo, valor, onChange, compacto }: { conteo: Record<string, number>; valor: string; onChange: (v: string) => void; compacto?: boolean }) {
  const total = Object.values(conteo).reduce((a, n) => a + n, 0);
  const chip = (on: boolean, vacio = false): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid ' + (on ? 'var(--df-text-strong)' : 'var(--df-border)'),
    background: on ? 'var(--df-text-strong)' : 'var(--df-surface)', color: on ? 'var(--df-surface)' : 'var(--df-text-secondary)',
    borderRadius: 999, padding: compacto ? '5px 10px' : '6px 12px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
    whiteSpace: 'nowrap', opacity: vacio && !on ? 0.55 : 1, flexShrink: 0,
  });
  const num = (n: number, on: boolean) => <span style={{ fontSize: 11, fontWeight: 800, opacity: on ? 0.85 : 0.65 }}>{n}</span>;
  return (
    <div role="group" aria-label="Filtrar por canal" style={{ display: 'flex', gap: 6, flexWrap: compacto ? 'nowrap' : 'wrap', overflowX: compacto ? 'auto' : undefined, paddingBottom: compacto ? 2 : 0 }}>
      <button type="button" aria-pressed={!valor} onClick={() => onChange('')} style={chip(!valor)}>Todos los canales {num(total, !valor)}</button>
      {CANALES_CHAT.map((c) => {
        const on = valor === c.id;
        const n = conteo[c.id] || 0;
        return (
          <button key={c.id} type="button" aria-pressed={on} onClick={() => onChange(on ? '' : c.id)} style={chip(on, !n)}>
            <OrigenBadge origen={c.id} size={16} /> {c.label} {num(n, on)}
          </button>
        );
      })}
    </div>
  );
}
