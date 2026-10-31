import type { ReactNode } from 'react';

export type EstadoInteg = 'on' | 'pendiente' | 'off';

/** Píldora de estado, igual para todas las integraciones (diseño "Noche"). */
export function EstadoPill({ estado, texto }: { estado: EstadoInteg; texto?: string }) {
  const on = estado === 'on'; const pend = estado === 'pendiente';
  return <span className={`pill ${on ? 'ok' : pend ? 'aviso' : 'neutro'}`}>{texto || (on ? 'Conectada' : pend ? 'Falta configurar' : 'Sin conectar')}</span>;
}

/** Cuadro del logo: mismo tamaño para todas. */
export function LogoInteg({ src, alt, children, fondo }: { src?: string; alt?: string; children?: ReactNode; fondo?: string }) {
  return (
    <span className="logo-i" style={{ background: fondo || 'var(--panel2)', overflow: 'hidden', padding: src ? 6 : 0, boxSizing: 'border-box', fontSize: 18 }}>
      {src ? <img src={src} alt={alt || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : children}
    </span>
  );
}

/**
 * Tarjeta de integración (diseño "Noche"): logo, nombre, descripción corta, estado y
 * botón. Lo que configura cada una se despliega debajo (.detalle), ocupando lo que necesite.
 */
export function IntegracionFila({ logo, nombre, desc, estado, estadoTexto, extra, abierta, onToggle, boton, botonPrimario, accion, children }: {
  logo: ReactNode; nombre: string; desc: ReactNode; estado: EstadoInteg; estadoTexto?: string; extra?: ReactNode;
  /** Botón directo (sin desplegable), p. ej. "Ir a WhatsApp". */
  accion?: { texto: string; onClick: () => void };
  abierta: boolean; onToggle: () => void; boton?: string; botonPrimario?: boolean; children?: ReactNode;
}) {
  const primario = botonPrimario ?? estado === 'off';
  return (
    <div className={`integ${abierta ? ' abierta' : ''}`}>
      {logo}
      <div className="txt">
        <b>{nombre}{extra}</b>
        <p>{desc}</p>
      </div>
      <EstadoPill estado={estado} texto={estadoTexto} />
      {accion && <button type="button" className="btn btn-sec btn-chico" onClick={accion.onClick}>{accion.texto}</button>}
      {children !== undefined && (
        <button type="button" className={`btn btn-chico ${primario && !abierta ? 'btn-pri' : 'btn-sec'}`} onClick={onToggle} aria-expanded={abierta}>
          {abierta ? 'Cerrar ▴' : `${boton || (estado === 'off' ? 'Conectar' : 'Configurar')} ▾`}
        </button>
      )}
      {abierta && children !== undefined && <div className="detalle">{children}</div>}
    </div>
  );
}
