import type { ReactNode } from 'react';

export type EstadoInteg = 'on' | 'pendiente' | 'off';

/** Punto + etiqueta de estado, igual para todas las integraciones. */
export function EstadoPill({ estado, texto }: { estado: EstadoInteg; texto?: string }) {
  const on = estado === 'on'; const pend = estado === 'pendiente';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', borderRadius: 999, padding: '4px 10px',
      color: on ? 'var(--df-brand-dark)' : pend ? 'var(--df-warning)' : 'var(--df-text-faint)',
      background: on ? 'var(--df-brand-subtle)' : pend ? 'var(--df-warning-subtle)' : 'var(--df-surface-2)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? 'var(--df-brand-mid)' : pend ? 'var(--df-warning)' : 'var(--df-border-strong)' }} />
      {texto || (on ? 'Conectada' : pend ? 'Falta configurar' : 'Sin conectar')}
    </span>
  );
}

/** Cuadro del logo: mismo tamaño para todas. */
export function LogoInteg({ src, alt, children, fondo }: { src?: string; alt?: string; children?: ReactNode; fondo?: string }) {
  return (
    <div style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, background: fondo || '#fff', border: '1px solid var(--df-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: src ? 6 : 0, boxSizing: 'border-box', fontSize: 20, fontWeight: 800, color: '#fff' }}>
      {src ? <img src={src} alt={alt || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : children}
    </div>
  );
}

/**
 * Fila de integración a lo ancho: todas comparten el mismo formato (logo, nombre,
 * descripción corta, estado y botón). Lo que configura cada una se despliega
 * debajo, ocupando lo que necesite.
 */
export function IntegracionFila({ logo, nombre, desc, estado, estadoTexto, extra, abierta, onToggle, boton, botonPrimario, accion, children }: {
  logo: ReactNode; nombre: string; desc: ReactNode; estado: EstadoInteg; estadoTexto?: string; extra?: ReactNode;
  /** Botón directo (sin desplegable), p. ej. "Ir a WhatsApp". */
  accion?: { texto: string; onClick: () => void };
  abierta: boolean; onToggle: () => void; boton?: string; botonPrimario?: boolean; children?: ReactNode;
}) {
  const primario = botonPrimario ?? estado === 'off';
  return (
    <div style={{ background: 'var(--df-surface)', border: `1px solid ${abierta ? 'var(--df-brand-border)' : 'var(--df-border)'}`, borderRadius: 14, boxShadow: abierta ? '0 10px 30px -18px rgba(15,23,42,.35)' : '0 1px 2px rgba(15,23,42,.04)', transition: 'border-color .2s, box-shadow .2s', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
        {logo}
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{nombre}</span>
            {extra}
          </div>
          <div style={{ color: 'var(--df-text-muted)', fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>{desc}</div>
        </div>
        <EstadoPill estado={estado} texto={estadoTexto} />
        {accion && (
          <button onClick={accion.onClick} style={{ background: 'var(--df-surface)', color: 'var(--df-text-strong)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 112 }}>{accion.texto}</button>
        )}
        {children !== undefined && (
          <button
            onClick={onToggle}
            aria-expanded={abierta}
            style={primario && !abierta
              ? { background: 'var(--df-brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 112 }
              : { background: 'var(--df-surface)', color: 'var(--df-text-strong)', border: '1px solid var(--df-border)', borderRadius: 9, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 112 }}
          >
            {abierta ? 'Cerrar ▴' : `${boton || (estado === 'off' ? 'Conectar' : 'Configurar')} ▾`}
          </button>
        )}
      </div>
      {abierta && children !== undefined && (
        <div className="df-expand" style={{ borderTop: '1px solid var(--df-border)', padding: '16px 18px', background: 'var(--df-bg)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
