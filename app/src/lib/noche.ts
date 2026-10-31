/* Ayudas del rediseño "Noche": clases de píldoras por estado, formatos y colores. */
import type { DecoratedOrder } from '../hooks/useDealFlowState';

/** Clase de la píldora según el estado del pedido (ok / info / mal / neutro). */
export const claseEstado = (e: string): 'ok' | 'info' | 'mal' | 'neutro' | 'aviso' =>
  e === 'Confirmado' || e === 'Entregado' ? 'ok'
    : e === 'Guía generada' || e === 'En tránsito' || e === 'En reparto' ? 'info'
      : e === 'Novedad' || e === 'Devuelto' || e === 'Cancelado' ? 'mal'
        : 'neutro';

/** Color del estado (para barras y puntos). */
export const colorEstado = (e: string): string => ({
  Nuevo: '#9AA8C9', Confirmado: '#34D399', 'Guía generada': '#46D8FF', 'En tránsito': '#2E8BFF', 'En reparto': '#7658FF',
  Novedad: '#FF6B8A', Entregado: '#10B981', Devuelto: '#FFC65C', Cancelado: '#7D8DB5',
} as Record<string, string>)[e] || '#9AA8C9';

/** Qué dijo el cliente a la confirmación por WhatsApp (resumen + Sí / No). */
export function confirmacionDe(o: Pick<DecoratedOrder, 'confirmacion' | 'estado' | 'tel'>): { texto: string; clase: 'ok' | 'mal' | 'aviso' | 'neutro'; nota: string } {
  const c = o.confirmacion || '';
  if (c === 'si') return { texto: 'Confirmó', clase: 'ok', nota: 'Vio el resumen en el chat y respondió que sí.' };
  if (c === 'no') return { texto: 'Dijo No', clase: 'mal', nota: 'Respondió “No” al resumen. El chat quedó con tu equipo: escríbele desde el Inbox.' };
  if (c === 'esperando') return { texto: 'Esperando Sí', clase: 'aviso', nota: 'El resumen con todos los datos ya le llegó. El pedido sale cuando responda Sí; si cambia algo, le llega el resumen nuevo.' };
  if (c === 'fallo') return { texto: 'Sin resumen', clase: 'aviso', nota: 'No le llegó el resumen (WhatsApp no lo entregó). Se reintenta solo cada 15 min.' };
  if (!o.tel) return { texto: 'Sin celular', clase: 'neutro', nota: 'El pedido no tiene celular: no se le puede pedir confirmación por WhatsApp.' };
  if (o.estado === 'Nuevo') return { texto: 'Sin resumen', clase: 'aviso', nota: 'Al cliente no le ha llegado el resumen para confirmar.' };
  return { texto: 'Sin confirmar', clase: 'neutro', nota: 'Este pedido avanzó sin pasar por la confirmación por WhatsApp.' };
}

export const pesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CO');
/** Miles abreviados para las barras: 1.284.500 → "1.285k". */
export const miles = (n: number) => (n >= 1000 ? Math.round(n / 1000).toLocaleString('es-CO') + 'k' : String(Math.round(n)));

export const iniciales = (nombre: string) => {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  const s = ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
  return s || '?';
};

const DEGRADADOS = [
  'linear-gradient(135deg,#1F6F5B,#2E8BFF)', 'linear-gradient(135deg,#8B1E3F,#B75DFF)', 'linear-gradient(135deg,#B8541E,#FFC65C)', 'linear-gradient(135deg,#2E3F6B,#46D8FF)',
  'linear-gradient(135deg,#7A5A00,#FFC65C)', 'linear-gradient(135deg,#3A2E6B,#7658FF)', 'linear-gradient(135deg,#1C1F2E,#5B6788)', 'linear-gradient(135deg,#0F3B35,#10B981)',
];
/** Degradado estable por nombre (para portadas sin foto). */
export const degradadoDe = (texto: string) => {
  let h = 0;
  for (const ch of String(texto || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEGRADADOS[h % DEGRADADOS.length];
};

/** Día en Bogotá (YYYY-MM-DD) con desplazamiento en días. */
export const diaBogota = (offset = 0) => new Date(Date.now() - offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** "2026-10-30" → "Jue". */
export const diaCorto = (f: string) => { const d = new Date(f + 'T12:00:00Z'); return isNaN(+d) ? f : DIAS_CORTOS[d.getUTCDay()]; };
/** Fecha larga en español: "Jueves 30 de octubre · 10:42 a. m." */
export const fechaLarga = () => {
  const f = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' });
  const h = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' });
  return `${f.charAt(0).toUpperCase()}${f.slice(1)} · ${h}`;
};
/** Hace cuánto: "hace 8 min", "ayer", "3 oct". */
export const haceCuanto = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z')).getTime();
  if (isNaN(t)) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return new Date(t).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' });
};
