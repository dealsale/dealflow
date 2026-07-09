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
  Nuevo: { color: '#1D4ED8', bg: '#DBEAFE', next: 'Confirmar', nextEstado: 'Confirmado' },
  Confirmado: { color: '#6D28D9', bg: '#EDE9FE', next: 'Empacar', nextEstado: 'Empacado' },
  Empacado: { color: '#B45309', bg: '#FEF3C7', next: 'Despachar', nextEstado: 'Despachado' },
  Despachado: { color: '#0E7490', bg: '#CFFAFE', next: 'Marcar entregado', nextEstado: 'Entregado' },
  Entregado: { color: '#047857', bg: '#D1FAE5', next: null, nextEstado: null },
};

export const ESTADO_ORDER: EstadoPedido[] = ['Nuevo', 'Confirmado', 'Empacado', 'Despachado', 'Entregado'];

export function swatch(label: string, fallback: string): string {
  const l = label.toLowerCase();
  if (l.includes('verde')) return '#34D399';
  if (l.includes('negr')) return '#334155';
  if (l.includes('blanco')) return '#E2E8F0';
  if (l.includes('azul claro')) return '#93C5FD';
  if (l.includes('azul')) return '#1D4ED8';
  if (l.includes('camel')) return '#D6A45C';
  if (l.includes('beige')) return '#E7D8BF';
  if (l.includes('dorado')) return '#FBBF24';
  return fallback;
}

export function stockPillCfg(st: number): PillColor {
  if (st === 0) return { color: '#B91C1C', bg: '#FEE2E2' };
  if (st <= 5) return { color: '#B45309', bg: '#FEF3C7' };
  return { color: '#047857', bg: '#D1FAE5' };
}

export const ETAPA_CFG: Record<Etapa, PillColor> = {
  Explorando: { color: '#475569', bg: '#F1F5F9' },
  Cotizando: { color: '#1D4ED8', bg: '#DBEAFE' },
  'Listo para comprar': { color: '#047857', bg: '#D1FAE5' },
  Postventa: { color: '#0E7490', bg: '#CFFAFE' },
};

export const AVATAR_COLORS: [string, string][] = [
  ['#E0E7FF', '#4338CA'],
  ['#FCE7F3', '#BE185D'],
  ['#DCFCE7', '#15803D'],
  ['#FEF3C7', '#B45309'],
  ['#CFFAFE', '#0E7490'],
];

export function initials(nombre: string): string {
  return nombre.split(' ').map((w) => w[0]).slice(0, 2).join('');
}
