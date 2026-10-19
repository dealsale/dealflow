/**
 * Trazabilidad de pedidos: una línea de tiempo por pedido con TODO lo que le
 * pasó (creación, cambios de estado, revisión y envío a Effi/Dropi, cada llamada
 * a la API con lo que se mandó y lo que respondió, guías, avisos de webhooks y
 * mensajes al cliente). Sirve para que el equipo DealFlow vea desde el admin por
 * qué un despacho falló sin tener que reproducirlo.
 *
 * Las llamadas a APIs externas se registran solas: quien trabaja sobre un pedido
 * envuelve su trabajo en `conPedido(...)` y los clientes HTTP (effi, dropi) usan
 * `pedidoActual()` para saber a qué pedido pertenece cada petición.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS order_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  etapa TEXT NOT NULL DEFAULT '',
  nivel TEXT NOT NULL DEFAULT 'info',
  titulo TEXT NOT NULL DEFAULT '',
  detalle TEXT NOT NULL DEFAULT '',
  datos TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_order_eventos_order ON order_eventos(order_id, id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_order_eventos_store ON order_eventos(store_id, id)');

export type Nivel = 'info' | 'ok' | 'warn' | 'error';
/** Etapas: pedido, estado, despacho, api, guia, webhook, aviso. */
export interface Evento { etapa: string; nivel?: Nivel; titulo: string; detalle?: string; datos?: unknown }

const ctx = new AsyncLocalStorage<{ storeId: string; orderId: string }>();

/** Ejecuta `fn` asociando a este pedido todo lo que se registre dentro (incluidas las llamadas a APIs). */
export function conPedido<T>(storeId: string, orderId: string, fn: () => Promise<T>): Promise<T> {
  return ctx.run({ storeId, orderId }, fn);
}
export function pedidoActual(): { storeId: string; orderId: string } | undefined {
  return ctx.getStore();
}

// Nunca guardamos credenciales aunque vengan en un cuerpo.
const SECRETO = /(api_?key|token|secret|password|clave|authorization)/i;
function limpiar(v: unknown, prof = 0): unknown {
  if (v == null || prof > 6) return v;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => limpiar(x, prof + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = SECRETO.test(k) ? '••••' : limpiar(x, prof + 1);
    return out;
  }
  if (typeof v === 'string' && v.length > 2000) return v.slice(0, 2000) + '…';
  return v;
}

/** Registra un evento en la línea de tiempo del pedido. Nunca lanza. */
export function trazar(storeId: string, orderId: string, e: Evento): void {
  if (!storeId || !orderId) return;
  try {
    let datos = '';
    if (e.datos !== undefined) {
      datos = JSON.stringify(limpiar(e.datos));
      if (datos.length > 24000) datos = datos.slice(0, 24000) + '…';
    }
    db.prepare('INSERT INTO order_eventos (store_id, order_id, etapa, nivel, titulo, detalle, datos) VALUES (?,?,?,?,?,?,?)')
      .run(storeId, orderId, e.etapa, e.nivel || 'info', e.titulo.slice(0, 300), String(e.detalle || '').slice(0, 4000), datos);
  } catch { /* la trazabilidad nunca debe tumbar un despacho */ }
}

/** Igual que trazar, pero para el pedido del contexto actual (si hay uno). */
export function trazarActual(e: Evento): void {
  const p = pedidoActual();
  if (p) trazar(p.storeId, p.orderId, e);
}

/** Registra una llamada HTTP a una integración, con petición y respuesta. */
export function trazarApi(servicio: string, metodo: string, ruta: string, http: number, ok: boolean, ms: number, peticion: unknown, respuesta: unknown, mensaje?: string): void {
  trazarActual({
    etapa: 'api',
    nivel: ok ? 'info' : 'error',
    titulo: `${servicio} ${metodo} ${ruta} → ${http || 'sin conexión'}${ok ? '' : ' (falló)'}`,
    detalle: `${ms} ms${mensaje ? ` · ${mensaje}` : ''}`,
    datos: { peticion, respuesta },
  });
}

// Se guardan 120 días de historia.
try { db.prepare("DELETE FROM order_eventos WHERE created_at < datetime('now','-120 days')").run(); } catch { /* opcional */ }
