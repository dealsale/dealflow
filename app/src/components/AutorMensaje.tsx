import type { CSSProperties } from 'react';

/**
 * Círculo con la inicial de quien escribió un mensaje (o de quien está en el chat).
 * Al pasar el puntero (o mantener presionado en el celular) dice el nombre completo.
 * El color sale del nombre: cada persona del equipo siempre tiene el mismo.
 */
const COLORES = ['#7C3AED', '#DB2777', '#EA580C', '#0891B2', '#4F46E5', '#059669', '#B45309', '#BE123C', '#0D9488', '#9333EA'];
const colorDe = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length]; };
export const iniciales = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

export function CirculoPersona({ nombre, size = 22, titulo, style }: { nombre: string; size?: number; titulo?: string; style?: CSSProperties }) {
  const conocido = !!nombre.trim();
  const t = titulo || (conocido ? nombre : 'Equipo');
  return (
    <span role="img" aria-label={t} title={t}
      style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: conocido ? colorDe(nombre) : 'var(--df-border)', color: conocido ? '#fff' : 'var(--df-text-muted)', fontSize: Math.round(size * 0.42), fontWeight: 800,
        boxShadow: '0 0 0 2px var(--df-bg)', cursor: 'default', userSelect: 'none', ...style }}>
      {conocido ? iniciales(nombre) : 'E'}
    </span>
  );
}

/** Junto a cada mensaje enviado por alguien de la tienda. */
export function AutorMensaje({ autor }: { autor?: string }) {
  const nombre = (autor || '').trim();
  return <CirculoPersona nombre={nombre} titulo={nombre ? `Enviado por ${nombre}` : 'Enviado por el equipo (en mensajes anteriores no se guardaba quién lo envió)'} />;
}
