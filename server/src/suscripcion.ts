import { createHash } from 'node:crypto';
import { db, uid } from './db.js';

/**
 * Suscripciones de las tiendas a DealFlow. Modelo: link de pago mensual con
 * Wompi (Bancolombia). Las llaves de Wompi son de DealFlow (una sola cuenta
 * que recibe todos los pagos), por eso van en variables de entorno:
 *   WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY (integrity secret), WOMPI_EVENTS_SECRET
 *   WOMPI_CHECKOUT_URL (opcional, por defecto el checkout web de Wompi)
 */
const CHECKOUT = process.env.WOMPI_CHECKOUT_URL || 'https://checkout.wompi.co/p/';
const DIAS_PERIODO = 30;

export interface EstadoSuscripcion {
  plan: string;
  precio: number;
  estado: 'prueba' | 'activa' | 'vencida';
  vence: string | null;
  diasRestantes: number | null;
  alDia: boolean;
}

function precioPlan(nombrePlan: string): number {
  const p = db.prepare('SELECT precio FROM plans WHERE nombre = ?').get(nombrePlan) as { precio: number } | undefined;
  return p?.precio || 0;
}

/** Estado actual de la suscripción de una tienda (recalcula "vencida" por fecha). */
export function estadoSuscripcion(storeId: string): EstadoSuscripcion | null {
  const s = db.prepare('SELECT plan, plan_estado, plan_vence FROM stores WHERE id = ?').get(storeId) as
    | { plan: string; plan_estado: string; plan_vence: string | null }
    | undefined;
  if (!s) return null;
  const precio = precioPlan(s.plan);
  let estado = (s.plan_estado || 'prueba') as EstadoSuscripcion['estado'];
  let diasRestantes: number | null = null;
  if (s.plan_vence) {
    const ms = new Date(s.plan_vence + 'T23:59:59Z').getTime() - Date.now();
    diasRestantes = Math.ceil(ms / 86400000);
    if (diasRestantes < 0 && estado === 'activa') estado = 'vencida';
  }
  return { plan: s.plan, precio, estado, vence: s.plan_vence, diasRestantes, alDia: estado === 'activa' || estado === 'prueba' };
}

/** Firma de integridad que exige el checkout de Wompi: SHA256(referencia+monto+moneda+secreto). */
function firmaIntegridad(referencia: string, montoCents: number, secret: string): string {
  return createHash('sha256').update(`${referencia}${montoCents}COP${secret}`).digest('hex');
}

/**
 * Crea un pago pendiente y devuelve la URL del checkout de Wompi para que la
 * tienda pague su mensualidad. La confirmación llega por el webhook.
 */
export function crearCheckout(storeId: string, correo: string, redirectBase: string): { url?: string; error?: string } {
  const pub = process.env.WOMPI_PUBLIC_KEY;
  const integrity = process.env.WOMPI_INTEGRITY;
  if (!pub || !integrity) return { error: 'La pasarela de pagos no está configurada todavía. (Faltan las llaves de Wompi en el servidor.)' };
  const sus = estadoSuscripcion(storeId);
  if (!sus) return { error: 'Tienda no encontrada.' };
  if (sus.precio <= 0) return { error: 'Tu plan no tiene un precio configurado. Contacta al equipo DealFlow.' };

  const referencia = `DF-SUB-${storeId.slice(0, 8)}-${Date.now()}`;
  const montoCents = sus.precio * 100;
  db.prepare('INSERT INTO pagos (id, store_id, plan, monto, referencia, estado, gateway) VALUES (?,?,?,?,?,?,?)')
    .run(uid(), storeId, sus.plan, sus.precio, referencia, 'pendiente', 'wompi');

  const params = new URLSearchParams({
    'public-key': pub,
    currency: 'COP',
    'amount-in-cents': String(montoCents),
    reference: referencia,
    'redirect-url': `${redirectBase}/?pago=ok`,
    'signature:integrity': firmaIntegridad(referencia, montoCents, integrity),
  });
  if (correo) params.set('customer-data:email', correo);
  return { url: `${CHECKOUT}?${params.toString()}` };
}

/** Marca un pago como aprobado y extiende la suscripción de la tienda +30 días. */
export function aplicarPagoAprobado(referencia: string, transaccion?: string): boolean {
  const pago = db.prepare('SELECT id, store_id, estado FROM pagos WHERE referencia = ?').get(referencia) as
    | { id: string; store_id: string; estado: string }
    | undefined;
  if (!pago) return false;
  if (pago.estado === 'aprobado') return true; // idempotente (Wompi puede reintentar el webhook)
  db.prepare('UPDATE pagos SET estado = ?, transaccion = ? WHERE id = ?').run('aprobado', transaccion || null, pago.id);
  // Extiende desde hoy o desde la fecha de vencimiento futura (si aún no vence, acumula).
  const s = db.prepare('SELECT plan_vence FROM stores WHERE id = ?').get(pago.store_id) as { plan_vence: string | null } | undefined;
  const base = s?.plan_vence && new Date(s.plan_vence).getTime() > Date.now() ? new Date(s.plan_vence) : new Date();
  base.setDate(base.getDate() + DIAS_PERIODO);
  const nuevaFecha = base.toISOString().slice(0, 10);
  db.prepare("UPDATE stores SET plan_estado = 'activa', plan_vence = ?, activa = 1 WHERE id = ?").run(nuevaFecha, pago.store_id);
  console.log(`[suscripcion] pago aprobado ${referencia} → tienda ${pago.store_id} activa hasta ${nuevaFecha}`);
  return true;
}

/** Extiende manualmente la suscripción (admin), sin pasar por la pasarela. */
export function extenderManual(storeId: string, dias: number): void {
  const s = db.prepare('SELECT plan_vence FROM stores WHERE id = ?').get(storeId) as { plan_vence: string | null } | undefined;
  const base = s?.plan_vence && new Date(s.plan_vence).getTime() > Date.now() ? new Date(s.plan_vence) : new Date();
  base.setDate(base.getDate() + dias);
  db.prepare("UPDATE stores SET plan_estado = 'activa', plan_vence = ? WHERE id = ?").run(base.toISOString().slice(0, 10), storeId);
}
