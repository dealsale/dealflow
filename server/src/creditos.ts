import { db, uid } from './db.js';

/**
 * Sistema de créditos recargables para el Marketing IA (texto e imágenes con
 * OpenAI, que paga DealFlow como empresa). Las tiendas recargan créditos por
 * Wompi; cada generación descuenta créditos. El precio de venta deja ~4x sobre
 * el costo real de OpenAI.
 *
 * Costo real aprox. (dólar ≈ $4.000 COP):
 *   - Texto (lote de copys, gpt-4o-mini): ~$0.002  ≈ ~8 COP
 *   - Imagen (gpt-image-1 calidad media): ~$0.042  ≈ ~170 COP
 */

// Cuánto gasta cada acción.
export const COSTO = {
  texto: 2, // por lote de copys
  imagen: 20, // por imagen
};

// Créditos de regalo al registrarse (para que prueben el Marketing IA).
export const CREDITOS_BIENVENIDA = 40;

export interface Paquete {
  id: string;
  nombre: string;
  creditos: number;
  precio: number; // COP
}

// Paquetes de recarga (se pagan por Wompi). Precio/crédito baja con el volumen.
export const PAQUETES: Paquete[] = [
  { id: 'inicial', nombre: 'Inicial', creditos: 500, precio: 20000 },
  { id: 'pro', nombre: 'Pro', creditos: 1500, precio: 50000 },
  { id: 'max', nombre: 'Max', creditos: 4000, precio: 120000 },
];

export function paquete(id: string): Paquete | undefined {
  return PAQUETES.find((p) => p.id === id);
}

export function saldo(storeId: string): number {
  const s = db.prepare('SELECT creditos FROM stores WHERE id = ?').get(storeId) as { creditos: number } | undefined;
  return s?.creditos || 0;
}

/** Registra un movimiento en el historial y actualiza el saldo (delta con signo). */
function mover(storeId: string, delta: number, motivo: string, referencia = ''): void {
  db.prepare('INSERT INTO creditos_mov (id, store_id, delta, motivo, referencia) VALUES (?,?,?,?,?)')
    .run(uid(), storeId, delta, motivo, referencia);
  db.prepare('UPDATE stores SET creditos = MAX(0, COALESCE(creditos,0) + ?) WHERE id = ?').run(delta, storeId);
}

/** Suma créditos (recarga o regalo). */
export function abonar(storeId: string, cantidad: number, motivo: string, referencia = ''): void {
  if (cantidad > 0) mover(storeId, cantidad, motivo, referencia);
}

/** Descuenta créditos si alcanza. Devuelve false (sin cobrar) si no hay saldo. */
export function cobrar(storeId: string, cantidad: number, motivo: string): boolean {
  if (cantidad <= 0) return true;
  if (saldo(storeId) < cantidad) return false;
  mover(storeId, -cantidad, motivo);
  return true;
}

export function movimientos(storeId: string, limite = 30): { delta: number; motivo: string; fecha: string }[] {
  return (db.prepare('SELECT delta, motivo, created_at FROM creditos_mov WHERE store_id = ? ORDER BY created_at DESC LIMIT ?').all(storeId, limite) as { delta: number; motivo: string; created_at: string }[])
    .map((m) => ({ delta: m.delta, motivo: m.motivo, fecha: m.created_at }));
}
