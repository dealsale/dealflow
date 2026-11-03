/**
 * Puente con la app de escritorio «DealFlow Soporte» (lo pone su preload). Solo existe dentro
 * de la app: en un navegador normal es undefined.
 */
export interface AccionEntrada {
  t: 'm' | 'c' | 'w' | 'k' | 'txt';
  x?: number; y?: number; b?: number; n?: number; dx?: number; dy?: number;
  key?: string; code?: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; s?: string;
}
export interface PuenteSoporte {
  version: string;
  so: string;
  equipo: string;
  /** Tamaño real de la pantalla principal (la que se comparte). */
  pantalla(): Promise<{ w: number; h: number; escala: number }>;
  /** Ratón y teclado en el computador (coordenadas de 0 a 1 sobre la pantalla compartida). */
  entrada(a: AccionEntrada): void;
  /** Durante la sesión: ventana pequeña, siempre encima, con «Detener». */
  modoSesion(activo: boolean, quien?: string): void;
  /** Trae la ventana al frente (para el permiso). */
  mostrar(): void;
  /** Notificación de Windows. */
  avisar(titulo: string, cuerpo: string): void;
  /** ¿La app arranca sola con Windows? */
  inicioAutomatico?(activo?: boolean): Promise<boolean>;
}
export const puente = (): PuenteSoporte | undefined => (typeof window !== 'undefined' ? (window as unknown as { dealflowSoporte?: PuenteSoporte }).dealflowSoporte : undefined);
