import { db, pj } from './db.js';

/**
 * Cliente de la API de integraciones de Dropi (Colombia).
 * El token lo guarda cada tienda en Integraciones → Dropi (campo "token").
 * La URL base se puede ajustar con DROPI_API_URL si Dropi indica otra.
 */
const BASE = process.env.DROPI_API_URL || 'https://api.dropi.co/api';

function tokenDeTienda(storeId: string): string {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'dropi'").get(storeId) as { config: string } | undefined;
  if (!row) return '';
  const cfg = pj<Record<string, string>>(row.config, {});
  return (cfg.token || cfg.apiKey || '').trim();
}

interface OrdenDealflow {
  numero: number;
  cliente: string;
  tel: string;
  departamento: string;
  ciudad: string;
  direccion: string;
  total: number;
  items: { qty: number; nombre: string; dropiId: string }[];
}

/** Crea la orden en Dropi. Devuelve el id/guía de Dropi o el error TAL CUAL lo dio su API. */
export async function crearOrdenDropi(storeId: string, orden: OrdenDealflow): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = tokenDeTienda(storeId);
  if (!token) return { ok: false, error: 'Conecta Dropi en Integraciones (pega el token que te generó Dropi).' };

  const sinId = orden.items.filter((i) => !i.dropiId);
  if (sinId.length) {
    return { ok: false, error: `Falta el "ID en Dropi" de: ${sinId.map((i) => i.nombre.split('(')[0].trim()).join(', ')}. Agrégalo en Productos.` };
  }

  const partesNombre = orden.cliente.trim().split(/\s+/);
  const name = partesNombre[0] || 'Cliente';
  const surname = partesNombre.slice(1).join(' ') || '.';
  const payload = {
    name,
    surname,
    phone: orden.tel.replace(/[^0-9]/g, ''),
    dir: orden.direccion,
    department_name: orden.departamento,
    city_name: orden.ciudad,
    country: 'COLOMBIA',
    type: 'CONTRAENTREGA',
    rate_type: 'CON RECAUDO',
    total_order: orden.total,
    notes: orden.items.map((i) => `${i.qty}x ${i.nombre}`).join(' + ') + ` · Pedido DF-${orden.numero} vía DealFlow`,
    products: orden.items.map((i) => ({ id: Number(i.dropiId) || i.dropiId, quantity: i.qty })),
  };

  try {
    const res = await fetch(`${BASE}/orders/myorders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Dropi usa esta cabecera en sus integraciones; enviamos también Bearer por compatibilidad.
        'dropi-integration-key': token,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const texto = await res.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(texto); } catch { /* respuesta no JSON */ }
    console.log(`[dropi] tienda ${storeId} · pedido DF-${orden.numero} → HTTP ${res.status} · respuesta:`, texto.slice(0, 600));

    if (!res.ok || body.isSuccess === false || body.status === 'error') {
      const msg = (body.message as string) || (body.error as string) || `Dropi respondió HTTP ${res.status}.`;
      return { ok: false, error: `Dropi: ${msg}` };
    }
    // El id de la orden puede venir en distintas formas según la versión de su API.
    const objeto = (body.objects || body.data || body.order || body) as Record<string, unknown>;
    const id = String(objeto?.id || objeto?.order_id || (objeto as { order?: { id?: unknown } })?.order?.id || '') || 'creada';
    return { ok: true, id };
  } catch (e) {
    console.error('[dropi] error de red', e);
    return { ok: false, error: 'No pudimos hablar con Dropi. Revisa la conexión del servidor.' };
  }
}
