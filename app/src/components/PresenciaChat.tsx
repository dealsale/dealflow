import { textoPresencia, usePresencia } from '../lib/presencia';

/** Aviso arriba de la caja de texto: quién más está en este chat o escribiendo. */
export function PresenciaChat({ chatId }: { chatId: string }) {
  const { aqui } = usePresencia(chatId);
  const t = textoPresencia(aqui);
  if (!t) return null;
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, borderRadius: 9, padding: '7px 11px', marginBottom: 8,
      background: t.escribiendo ? 'var(--df-warning-subtle)' : 'var(--df-indigo-subtle)', color: t.escribiendo ? 'var(--df-warning)' : 'var(--df-indigo)',
      border: `1px solid ${t.escribiendo ? 'var(--df-warning-border)' : 'var(--df-purple-border)'}` }}>
      <span aria-hidden>{t.escribiendo ? '✍️' : '👀'}</span>
      <span style={{ flex: 1 }}>{t.texto}{t.escribiendo ? ' Espera antes de responder para no repetirle al cliente.' : ''}</span>
    </div>
  );
}

/** Marca pequeña en la lista de chats: quién está dentro de ese chat. */
export function PresenciaEnLista({ chatId }: { chatId: string }) {
  const { chats } = usePresencia(undefined);
  const ps = chats[chatId] || [];
  if (!ps.length) return null;
  const escribe = ps.find((p) => p.escribiendo);
  return (
    <span title={ps.map((p) => `${p.nombre}${p.escribiendo ? ' (escribiendo)' : ''}`).join(', ')}
      style={{ fontSize: 11, fontWeight: 700, color: escribe ? 'var(--df-warning)' : 'var(--df-indigo)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
      {escribe ? `✍️ ${escribe.nombre}` : `👀 ${ps[0].nombre}${ps.length > 1 ? ` +${ps.length - 1}` : ''}`}
    </span>
  );
}
