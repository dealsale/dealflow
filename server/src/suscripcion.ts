import { createHash } from 'node:crypto';
import { db, uid } from './db.js';

/**
 * Suscripción de las tiendas a DealFlow. Modelo de dos fases:
 *   1) VALOR INICIAL (una sola vez): activa la cuenta. Básico $2.000.000 / Premium $2.500.000.
 *   2) RENTA MENSUAL recurrente ($250.000): mantiene la cuenta al día mes a mes.
 * Se cobra con Wompi (Web Checkout). Las llaves son de DealFlow (una sola cuenta
 * que recibe todos los pagos) y van en variables de entorno:
 *   WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY (integrity secret), WOMPI_EVENTS_SECRET
 *   WOMPI_CHECKOUT_URL (opcional, por defecto el checkout web de Wompi)
 */
const CHECKOUT = process.env.WOMPI_CHECKOUT_URL || 'https://checkout.wompi.co/p/';
const DIAS_PERIODO = 30;

export interface PlanInfo {
  nombre: string;
  precio: number; // valor inicial (una vez)
  mensual: number; // renta mensual
  features: string[];
}

export interface EstadoSuscripcion {
  plan: string;
  precioInicial: number;
  mensual: number;
  estado: 'sin_plan' | 'activa' | 'vencida';
  inicialPagado: boolean;
  vence: string | null;
  diasRestantes: number | null;
  /** true si la tienda NO puede usar la plataforma (falta pagar el inicial o venció la renta). */
  bloqueado: boolean;
}

function planInfo(nombrePlan: string): { precio: number; mensual: number } {
  const p = db.prepare('SELECT precio, mensual FROM plans WHERE nombre = ?').get(nombrePlan) as { precio: number; mensual: number } | undefined;
  return { precio: p?.precio || 0, mensual: p?.mensual || 0 };
}

export function listarPlanes(): PlanInfo[] {
  const rows = db.prepare('SELECT nombre, precio, mensual, features FROM plans ORDER BY precio').all() as { nombre: string; precio: number; mensual: number; features: string }[];
  return rows.map((r) => {
    let features: string[] = [];
    try { features = JSON.parse(r.features); } catch { features = []; }
    return { nombre: r.nombre, precio: r.precio, mensual: r.mensual, features };
  });
}

/** Estado actual de la suscripción de una tienda (recalcula "vencida" por fecha). */
export function estadoSuscripcion(storeId: string): EstadoSuscripcion | null {
  const s = db.prepare('SELECT plan, plan_estado, plan_vence, inicial_pagado FROM stores WHERE id = ?').get(storeId) as
    | { plan: string; plan_estado: string; plan_vence: string | null; inicial_pagado: number }
    | undefined;
  if (!s) return null;
  const { precio, mensual } = planInfo(s.plan);
  const inicialPagado = !!s.inicial_pagado;
  let estado: EstadoSuscripcion['estado'] = inicialPagado ? 'activa' : 'sin_plan';
  let diasRestantes: number | null = null;
  if (inicialPagado && s.plan_vence) {
    const ms = new Date(s.plan_vence + 'T23:59:59Z').getTime() - Date.now();
    diasRestantes = Math.ceil(ms / 86400000);
    if (diasRestantes < 0) estado = 'vencida';
  }
  const bloqueado = !inicialPagado || estado === 'vencida';
  return { plan: s.plan, precioInicial: precio, mensual, estado, inicialPagado, vence: s.plan_vence, diasRestantes, bloqueado };
}

/** Firma de integridad que exige el checkout de Wompi: SHA256(referencia+monto+moneda+secreto). */
function firmaIntegridad(referencia: string, montoCents: number, secret: string): string {
  return createHash('sha256').update(`${referencia}${montoCents}COP${secret}`).digest('hex');
}

/**
 * Crea un pago pendiente y devuelve la URL del checkout de Wompi.
 * - Si la tienda aún no ha pagado el valor inicial: cobra el INICIAL del plan elegido
 *   (hay que pasar `planElegido`). Al aprobarse, activa la cuenta.
 * - Si ya pagó el inicial: cobra la RENTA mensual del plan actual (renovación).
 */
export function crearCheckout(storeId: string, correo: string, redirectBase: string, planElegido?: string): { url?: string; error?: string } {
  const pub = process.env.WOMPI_PUBLIC_KEY;
  const integrity = process.env.WOMPI_INTEGRITY;
  if (!pub || !integrity) return { error: 'La pasarela de pagos no está configurada todavía. (Faltan las llaves de Wompi en el servidor.)' };
  const sus = estadoSuscripcion(storeId);
  if (!sus) return { error: 'Tienda no encontrada.' };

  let tipo: 'inicial' | 'renta';
  let plan: string;
  let monto: number;
  if (!sus.inicialPagado) {
    // Fase 1: activación. Debe elegir un plan.
    plan = (planElegido || '').trim();
    const info = plan ? planInfo(plan) : null;
    if (!plan || !info || info.precio <= 0) return { error: 'Elige un plan válido para activar tu cuenta.' };
    tipo = 'inicial';
    monto = info.precio;
  } else {
    // Fase 2: renovación de la renta mensual.
    plan = sus.plan;
    tipo = 'renta';
    monto = sus.mensual;
    if (monto <= 0) return { error: 'Tu plan no tiene renta mensual configurada. Contacta al equipo DealFlow.' };
  }

  const referencia = `DF-${tipo === 'inicial' ? 'INI' : 'REN'}-${storeId.slice(0, 8)}-${Date.now()}`;
  const montoCents = monto * 100;
  db.prepare('INSERT INTO pagos (id, store_id, plan, monto, referencia, estado, gateway, tipo) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid(), storeId, plan, monto, referencia, 'pendiente', 'wompi', tipo);

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

/** Marca un pago como aprobado: activa la cuenta (inicial) y/o extiende la renta +30 días. */
export function aplicarPagoAprobado(referencia: string, transaccion?: string): boolean {
  const pago = db.prepare('SELECT id, store_id, estado, tipo, plan FROM pagos WHERE referencia = ?').get(referencia) as
    | { id: string; store_id: string; estado: string; tipo: string; plan: string }
    | undefined;
  if (!pago) return false;
  if (pago.estado === 'aprobado') return true; // idempotente (Wompi puede reintentar el webhook)
  db.prepare('UPDATE pagos SET estado = ?, transaccion = ? WHERE id = ?').run('aprobado', transaccion || null, pago.id);

  const s = db.prepare('SELECT plan_vence FROM stores WHERE id = ?').get(pago.store_id) as { plan_vence: string | null } | undefined;
  // Extiende desde hoy o desde el vencimiento futuro (si aún no vence, acumula).
  const base = s?.plan_vence && new Date(s.plan_vence).getTime() > Date.now() ? new Date(s.plan_vence) : new Date();
  base.setDate(base.getDate() + DIAS_PERIODO);
  const nuevaFecha = base.toISOString().slice(0, 10);

  if (pago.tipo === 'inicial') {
    // Activación: fija el plan elegido, marca inicial pagado y arranca la renta.
    db.prepare("UPDATE stores SET plan = ?, inicial_pagado = 1, plan_estado = 'activa', plan_vence = ?, activa = 1 WHERE id = ?")
      .run(pago.plan, nuevaFecha, pago.store_id);
    console.log(`[suscripcion] INICIAL aprobado ${referencia} → tienda ${pago.store_id} activada (plan ${pago.plan}) hasta ${nuevaFecha}`);
  } else {
    db.prepare("UPDATE stores SET plan_estado = 'activa', plan_vence = ?, activa = 1 WHERE id = ?").run(nuevaFecha, pago.store_id);
    console.log(`[suscripcion] RENTA aprobada ${referencia} → tienda ${pago.store_id} al día hasta ${nuevaFecha}`);
  }
  return true;
}

/** Extiende manualmente la renta (admin), sin pasar por la pasarela. Marca la cuenta activa. */
export function extenderManual(storeId: string, dias: number): void {
  const s = db.prepare('SELECT plan_vence FROM stores WHERE id = ?').get(storeId) as { plan_vence: string | null } | undefined;
  const base = s?.plan_vence && new Date(s.plan_vence).getTime() > Date.now() ? new Date(s.plan_vence) : new Date();
  base.setDate(base.getDate() + dias);
  db.prepare("UPDATE stores SET inicial_pagado = 1, plan_estado = 'activa', plan_vence = ? WHERE id = ?").run(base.toISOString().slice(0, 10), storeId);
}
