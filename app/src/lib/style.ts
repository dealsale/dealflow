import type { CSSProperties } from 'react';
import type { EstadoPedido, Etapa } from '../types';

export interface PillColor {
  color: string;
  bg: string;
}

export function pill(cfg: PillColor): CSSProperties {
  return {
    display: 'inline-block',
    background: cfg.bg,
    color: cfg.color,
    borderRadius: '999px',
    padding: '3px 10px',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

export interface EstadoCfg extends PillColor {
  next: string | null;
  nextEstado: EstadoPedido | null;
}

export const ESTADOS: Record<EstadoPedido, EstadoCfg> = {
  Nuevo: { color: 'var(--df-info)', bg: 'var(--df-info-subtle)', next: 'Confirmar', nextEstado: 'Confirmado' },
  Confirmado: { color: 'var(--df-purple)', bg: 'var(--df-purple-subtle)', next: 'Empacar', nextEstado: 'Empacado' },
  Empacado: { color: 'var(--df-warning)', bg: 'var(--df-warning-subtle)', next: 'Despachar', nextEstado: 'Despachado' },
  Despachado: { color: '#0E7490', bg: '#CFFAFE', next: 'Marcar entregado', nextEstado: 'Entregado' },
  Entregado: { color: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)', next: null, nextEstado: null },
  Cancelado: { color: 'var(--df-danger-dark)', bg: 'var(--df-danger-subtle-2)', next: null, nextEstado: null },
};

// Progresión "normal" (para la línea de tiempo). Cancelado va aparte: no es un paso.
export const ESTADO_ORDER: EstadoPedido[] = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado'];
// Todos los estados que el dueño puede elegir a mano (incluye Cancelado).
export const ESTADOS_TODOS: EstadoPedido[] = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado', 'Cancelado'];

export function swatch(label: string, fallback: string): string {
  const l = label.toLowerCase();
  if (l.includes('verde')) return 'var(--df-brand-light)';
  if (l.includes('negr')) return 'var(--df-text-body)';
  if (l.includes('blanco')) return 'var(--df-border)';
  if (l.includes('azul claro')) return '#93C5FD';
  if (l.includes('azul')) return 'var(--df-info)';
  if (l.includes('camel')) return '#D6A45C';
  if (l.includes('beige')) return '#E7D8BF';
  if (l.includes('dorado')) return 'var(--df-warning-light)';
  return fallback;
}

export function stockPillCfg(st: number): PillColor {
  if (st === 0) return { color: 'var(--df-danger-dark)', bg: 'var(--df-danger-subtle-2)' };
  if (st <= 5) return { color: 'var(--df-warning)', bg: 'var(--df-warning-subtle)' };
  return { color: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)' };
}

export const ETAPA_CFG: Record<Etapa, PillColor> = {
  Explorando: { color: 'var(--df-text-secondary)', bg: 'var(--df-surface-2)' },
  Cotizando: { color: 'var(--df-info)', bg: 'var(--df-info-subtle)' },
  'Listo para comprar': { color: 'var(--df-brand-dark)', bg: 'var(--df-brand-subtle)' },
  Postventa: { color: '#0E7490', bg: '#CFFAFE' },
};

export const AVATAR_COLORS: [string, string][] = [
  ['var(--df-indigo-subtle)', 'var(--df-indigo)'],
  ['#FCE7F3', '#BE185D'],
  ['var(--df-green-subtle)', 'var(--df-green-700)'],
  ['var(--df-warning-subtle)', 'var(--df-warning)'],
  ['#CFFAFE', '#0E7490'],
];

export function initials(nombre: string): string {
  return nombre.split(' ').map((w) => w[0]).slice(0, 2).join('');
}
