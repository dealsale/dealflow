/**
 * Bold (pagos en línea, Colombia) — API Link de pagos.
 *
 * DealFlow cobra con UNA cuenta de Bold (la de DealFlow): por cada cobro se crea un link de
 * pago de monto cerrado y se manda a la tienda al checkout de Bold. El pago se confirma por
 * tres caminos (el que llegue primero; aplicarPagoAprobado es idempotente):
 *   1. Webhook de Bold (POST /webhooks/bold) firmado con la llave secreta.
 *   2. Al volver del checkout, la app pide verificar los links pendientes de la tienda.
 *   3. Cada 5 minutos se revisan los links pendientes de los últimos 3 días.
 * En los tres casos se le PREGUNTA a Bold el estado del link antes de activar nada.
 *
 * Variables de entorno (panel.bold.co → Integraciones → «API Link de pagos»):
 *   BOLD_API_KEY      llave de identidad (va en «Authorization: x-api-key …»)
 *   BOLD_SECRET_KEY   llave secreta (firma de los webhooks)
 *   BOLD_API_URL      opcional, por defecto https://integrations.api.bold.co
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

const API = (process.env.BOLD_API_URL || 'https://integrations.api.bold.co').replace(/\/$/, '');
const txt = (v: unknown) => (v == null ? '' : String(v));

export const boldListo = () => !!process.env.BOLD_API_KEY;

async function bold<T>(metodo: 'GET' | 'POST', ruta: string, body?: unknown): Promise<{ ok: boolean; http: number; body: T & { errors?: { message?: string }[]; message?: string } }> {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { Authorization: `x-api-key ${process.env.BOLD_API_KEY || ''}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { errors?: { message?: string }[]; message?: string };
  return { ok: r.ok, http: r.status, body: j };
}

const errorDe = (b: { errors?: { message?: string }[]; message?: string }, http: number) =>
  b.errors?.map((e) => e.message).filter(Boolean).join(' · ') || b.message || `Bold respondió ${http}`;

/** Crea un link de pago de monto cerrado y lo deja anotado en el pago (`externo`). */
export async function crearLinkBold(p: { referencia: string; monto: number; descripcion: string; correo?: string; vuelta: string }): Promise<{ url: string; link: string } | { error: string }> {
  if (!boldListo()) return { error: 'Bold no está configurado (falta BOLD_API_KEY en el servidor).' };
  try {
    const r = await bold<{ payload?: { payment_link?: string; url?: string } }>('POST', '/online/link/v1', {
      amount_type: 'CLOSE',
      amount: { currency: 'COP', total_amount: Math.round(p.monto), tip_amount: 0, taxes: [] },
      reference: p.referencia,
      description: p.descripcion.slice(0, 100),
      // Bold pide la expiración en nanosegundos: 2 días para pagar.
      expiration_date: (Date.now() + 2 * 86400_000) * 1_000_000,
      callback_url: p.vuelta,
      ...(p.correo ? { payer_email: p.correo } : {}),
    });
    const link = txt(r.body.payload?.payment_link);
    const url = txt(r.body.payload?.url) || (link ? `https://checkout.bold.co/payment/${link}` : '');
    if (!r.ok || !link || !url) {
      console.warn('[bold] no se pudo crear el link', r.http, JSON.stringify(r.body).slice(0, 400));
      return { error: `No pudimos abrir el pago con Bold: ${errorDe(r.body, r.http)}` };
    }
    db.prepare("UPDATE pagos SET gateway = 'bold', externo = ? WHERE referencia = ?").run(link, p.referencia);
    return { url, link };
  } catch (e) {
    console.error('[bold] crear link', e);
    return { error: 'No pudimos conectarnos con Bold. Intenta de nuevo en un momento.' };
  }
}

/** Estado del link en Bold: PAID | ACTIVE | PROCESSING | EXPIRED | CANCELLED … */
export async function estadoLinkBold(link: string): Promise<{ estado: string; transaccion: string; total: number; raw: Record<string, unknown> } | null> {
  if (!boldListo() || !link) return null;
  try {
    const r = await bold<Record<string, unknown> & { payload?: Record<string, unknown> }>('GET', `/online/link/v1/${encodeURIComponent(link)}`);
    if (!r.ok) return null;
    const d = (r.body.payload && typeof r.body.payload === 'object' ? r.body.payload : r.body) as Record<string, unknown>;
    return { estado: txt(d.status).toUpperCase(), transaccion: txt(d.transaction_id || d.payment_id), total: Number(d.total || (d.amount as { total_amount?: number } | undefined)?.total_amount || 0), raw: d };
  } catch (e) {
    console.warn('[bold] estado del link', link, e);
    return null;
  }
}

/** Revisa en Bold los links pendientes (de una tienda o de todas) y aplica los pagados. */
export async function verificarPendientesBold(storeId?: string): Promise<number> {
  if (!boldListo()) return 0;
  const filas = db.prepare(
    `SELECT referencia, externo, monto FROM pagos WHERE gateway = 'bold' AND estado = 'pendiente' AND COALESCE(externo,'') != ''
       AND created_at > datetime('now','-3 days') ${storeId ? 'AND store_id = ?' : ''} ORDER BY created_at DESC LIMIT 50`,
  ).all(...(storeId ? [storeId] : [])) as { referencia: string; externo: string; monto: number }[];
  let n = 0;
  const { aplicarPagoAprobado } = await import('./suscripcion.js');
  for (const f of filas) {
    const e = await estadoLinkBold(f.externo);
    if (!e) continue;
    if (e.estado === 'PAID' || e.estado === 'APPROVED') {
      // El monto pagado debe ser el del cobro (si Bold lo informa).
      if (e.total && Math.round(e.total) !== Math.round(f.monto)) { console.warn(`[bold] ${f.referencia}: Bold dice ${e.total} y el cobro era ${f.monto}; no se aplica`); continue; }
      if (aplicarPagoAprobado(f.referencia, e.transaccion || f.externo, { fuente: 'Consulta directa a Bold (API Link de pagos)', consultado: new Date().toISOString(), link: f.externo, respuesta: e.raw })) n++;
    } else if (['EXPIRED', 'CANCELLED', 'REJECTED'].includes(e.estado)) {
      db.prepare("UPDATE pagos SET estado = ? WHERE referencia = ? AND estado = 'pendiente'").run(e.estado === 'EXPIRED' ? 'vencido' : 'rechazado', f.referencia);
    }
  }
  return n;
}

/** Firma del webhook: HMAC-SHA256 (llave secreta) del cuerpo en base64, en hex (cabecera x-bold-signature). */
export function firmaBoldValida(raw: Buffer | undefined, firma: string): boolean {
  const secret = process.env.BOLD_SECRET_KEY;
  if (!secret || !raw || !firma) return false;
  const calc = createHmac('sha256', secret).update(raw.toString('base64')).digest('hex');
  const a = Buffer.from(calc), b = Buffer.from(firma.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Evento del webhook. Venga firmado o no, NO se activa nada solo con lo que diga el cuerpo:
 * se busca el pago (por la referencia o el link) y se confirma preguntándole a Bold.
 */
export async function procesarWebhookBold(evento: Record<string, unknown>): Promise<void> {
  const data = (evento.data || {}) as Record<string, unknown>;
  const meta = (data.metadata || {}) as Record<string, unknown>;
  const candidatos = [meta.reference, data.reference, evento.reference, data.payment_link, meta.payment_link, data.link_id].map(txt).filter(Boolean);
  const tipo = txt(evento.type).toUpperCase();
  console.log(`[bold] webhook ${tipo || 'sin tipo'} ${candidatos.join(' ') || '(sin referencia)'}`);
  for (const c of candidatos) {
    const p = db.prepare("SELECT store_id FROM pagos WHERE gateway = 'bold' AND (referencia = ? OR externo = ?)").get(c, c) as { store_id: string } | undefined;
    if (p) { await verificarPendientesBold(p.store_id); return; }
  }
  // Sin referencia reconocible: se revisan todos los pendientes.
  if (tipo.includes('APPROVED') || tipo.includes('SALE')) await verificarPendientesBold();
}

export function iniciarBold(): void {
  if (!boldListo()) { console.log('[bold] sin BOLD_API_KEY: los cobros siguen por Wompi'); return; }
  console.log('[bold] pagos con Bold activos (links de pago) · revisión de pendientes cada 5 min');
  setInterval(() => void verificarPendientesBold().catch((e) => console.warn('[bold] revisión', e)), 5 * 60_000).unref();
}
