import type { CSSProperties } from 'react';

/**
 * Iconos propios de DealFlow: el dibujo con el degradado de marca (morado → azul → verde) sobre fondo
 * transparente, para que se vean bien en tema claro y oscuro. Archivos: app/public/iconos-df/<nombre>.webp (128 × 128).
 */
export type IconoDFNombre =
  // Editor de productos
  | 'producto' | 'servicio' | 'despacho' | 'bodega' | 'convenio' | 'promo'
  | 'informacion' | 'mensaje' | 'combos' | 'multimedia' | 'variantes' | 'reglas'
  | 'encendido' | 'apagado' | 'cargando' | 'guardado'
  // Menú del perfil y acciones comunes
  | 'camara' | 'claro' | 'oscuro' | 'premium' | 'idioma' | 'candado' | 'menu-flotante' | 'instalar-app'
  | 'cerrar-sesion' | 'editar' | 'advertencia' | 'rapido' | 'llamar' | 'tienda' | 'eliminar' | 'buscar';

/** `blanco`: el dibujo en blanco, para botones activos con fondo de color (ahí el degradado no se ve). */
export function IconoDF({ n, size = 20, title, blanco, style }: { n: IconoDFNombre; size?: number; title?: string; blanco?: boolean; style?: CSSProperties }) {
  return (
    <img src={`/iconos-df/${n}.webp`} width={size} height={size} alt={title || ''} title={title} draggable={false}
      className={n === 'cargando' ? 'df-icono-gira' : undefined}
      style={{ width: size, height: size, flexShrink: 0, verticalAlign: 'middle', display: 'inline-block', filter: blanco ? 'brightness(0) invert(1)' : undefined, ...style }} />
  );
}
