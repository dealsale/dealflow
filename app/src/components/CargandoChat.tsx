/**
 * Aviso de progreso DEBAJO de la caja de escritura del chat (enviar flujo, plantilla…):
 * no tapa la pantalla, así se puede seguir leyendo y escribiendo mientras sale.
 * Si el texto termina en "…" se muestra animado; si empieza por ✓ en verde; si no, error.
 */
export function CargandoChat({ texto, centrado }: { texto: string; centrado?: boolean }) {
  if (!texto) return null;
  const cargando = texto.endsWith('…');
  const ok = texto.startsWith('✓');
  return (
    <div role="status" aria-live="polite" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, alignItems: centrado ? 'center' : 'stretch' }}>
      <style>{`@keyframes dfc-giro { to { transform: rotate(360deg) } } @keyframes dfc-barra { 0% { left: -35% } 100% { left: 100% } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: ok ? 'var(--df-brand-dark)' : cargando ? 'var(--df-text-muted)' : 'var(--df-danger-dark)' }}>
        {cargando && <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--df-border)', borderTopColor: 'var(--df-brand)', animation: 'dfc-giro .8s linear infinite', flexShrink: 0 }} />}
        <span>{texto}</span>
      </div>
      {cargando && (
        <div style={{ position: 'relative', height: 3, borderRadius: 3, background: 'var(--df-border)', overflow: 'hidden', width: centrado ? '70%' : '100%' }}>
          <span style={{ position: 'absolute', top: 0, bottom: 0, width: '35%', borderRadius: 3, background: 'var(--df-brand)', animation: 'dfc-barra 1.3s ease-in-out infinite' }} />
        </div>
      )}
    </div>
  );
}
