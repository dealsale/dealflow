/**
 * Extensión de Chrome "DealFlow x Shopify": desde el panel de pedidos de Shopify, un botón
 * "Enviar a DealFlow" crea el pedido en DealFlow SIN necesitar la app aprobada por Shopify
 * (se usa la sesión del dueño en su propio panel).
 *
 * - Conexión: un CÓDIGO por tienda (generado en Integraciones → Shopify). Se guarda solo
 *   su huella (sha256); el código completo se muestra una vez.
 * - Datos: la extensión manda el pedido en JSON (si Shopify lo entrega) o el TEXTO de la
 *   página; con el texto, la IA arma el pedido. En ambos casos entra por importarPedido
 *   (mismo control de duplicados, emparejado de variantes y confirmación por WhatsApp).
 */
import { createHash, randomBytes } from 'node:crypto';
import { db, uid, registrarLog } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS ext_tokens (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL DEFAULT '',
  ultimo_uso TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const huella = (t: string) => createHash('sha256').update(t).digest('hex');

export function crearCodigo(storeId: string, nombre: string): { id: string; codigo: string } {
  const codigo = `dfx_${randomBytes(24).toString('base64url')}`;
  const id = uid();
  db.prepare('INSERT INTO ext_tokens (id, store_id, hash, nombre) VALUES (?,?,?,?)').run(id, storeId, huella(codigo), nombre.slice(0, 60) || 'Extensión Shopify');
  return { id, codigo };
}
export function listarCodigos(storeId: string) {
  return db.prepare('SELECT id, nombre, ultimo_uso, created_at FROM ext_tokens WHERE store_id = ? ORDER BY created_at DESC').all(storeId);
}
export function borrarCodigo(storeId: string, id: string): boolean {
  return db.prepare('DELETE FROM ext_tokens WHERE id = ? AND store_id = ?').run(id, storeId).changes > 0;
}
/** Tienda dueña de un código (o null). Marca el último uso. */
export function tiendaDeCodigo(codigo: string): { storeId: string; nombre: string } | null {
  if (!/^dfx_[\w-]{20,}$/.test(codigo)) return null;
  const r = db.prepare('SELECT t.id, t.store_id, s.nombre FROM ext_tokens t JOIN stores s ON s.id = t.store_id WHERE t.hash = ? AND s.activa = 1').get(huella(codigo)) as { id: string; store_id: string; nombre: string } | undefined;
  if (!r) return null;
  db.prepare("UPDATE ext_tokens SET ultimo_uso = datetime('now') WHERE id = ?").run(r.id);
  return { storeId: r.store_id, nombre: r.nombre };
}

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));

/** Con el texto de la página del pedido, la IA arma un pedido con la forma del de Shopify. */
async function pedidoDesdeTexto(storeId: string, orderId: string, texto: string): Promise<Fila> {
  const { resolverTexto } = await import('./ai.js');
  const ia = resolverTexto(storeId);
  if (!ia) return { error: 'Conecta una IA (DeepSeek u OpenAI) en Integraciones para leer el pedido.' };
  const system = `Te doy el TEXTO de la página de un pedido del panel de Shopify (Colombia). Devuelve SOLO un JSON válido, sin explicaciones, con esta forma:
{"name":"#1234","cliente":"Nombre Apellido","telefono":"3001234567","direccion":"Calle…","ciudad":"…","departamento":"…","total":129900,"envio":0,"pagado":false,"nota":"","items":[{"titulo":"Nombre del producto","variante":"M / Negro","cantidad":1,"precio":64950,"sku":""}]}
Reglas: usa SOLO lo que está en el texto; teléfono con 10 dígitos si aparece; "variante" tal cual la muestra Shopify (talla / color); precios en números sin puntos; "cantidad" y "precio" tal como los muestra Shopify en esa línea; si es un pack o combo ("Pack x6", "Combo 4 unidades"), deja esa frase en "variante" (DealFlow lo convierte en unidades); "pagado" true solo si dice Pagado/Paid. Si un dato no está, déjalo vacío.`;
  try {
    const r = await fetch(ia.url, {
      method: 'POST', headers: { Authorization: `Bearer ${ia.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ia.model, messages: [{ role: 'system', content: system }, { role: 'user', content: texto.slice(0, 15000) }], max_tokens: 900, temperature: 0 }),
      signal: AbortSignal.timeout(45_000),
    });
    const b = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
    const crudo = String(b.choices?.[0]?.message?.content || '').replace(/^```(?:json)?|```$/gm, '').trim();
    const j = JSON.parse(crudo.slice(crudo.indexOf('{'), crudo.lastIndexOf('}') + 1)) as Fila;
    const items = (Array.isArray(j.items) ? j.items : []) as Fila[];
    if (!items.length) return { error: 'No encontramos productos en la página del pedido.' };
    const tel = txt(j.telefono).replace(/\D/g, '');
    return {
      id: orderId, name: txt(j.name), total_price: Number(j.total) || 0, financial_status: j.pagado ? 'paid' : 'pending', note: txt(j.nota),
      shipping_address: { name: txt(j.cliente), phone: tel, address1: txt(j.direccion), city: txt(j.ciudad), province: txt(j.departamento) },
      shipping_lines: Number(j.envio) > 0 ? [{ price: Number(j.envio) }] : [],
      line_items: items.map((i) => ({ title: txt(i.titulo), variant_title: txt(i.variante), quantity: Number(i.cantidad) || 1, price: Number(i.precio) || 0, sku: txt(i.sku) })),
    };
  } catch {
    return { error: 'La IA no pudo leer el pedido. Intenta de nuevo.' };
  }
}

/** Crea el pedido que mandó la extensión. Devuelve el número DF y si ya existía. */
export async function recibirPedido(storeId: string, b: { shop?: string; orderId?: string; order?: Fila; texto?: string }): Promise<{ ok: true; numero: number; nuevo: boolean } | { error: string }> {
  const orderId = txt(b.orderId || (b.order as Fila | undefined)?.id).replace(/\D/g, '');
  if (!orderId) return { error: 'No encontramos el número del pedido en la página de Shopify.' };
  const shop = txt(b.shop).toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 120);
  const ya = db.prepare('SELECT numero FROM orders WHERE store_id = ? AND shopify_id = ?').get(storeId, orderId) as { numero: number } | undefined;
  if (ya) return { ok: true, numero: ya.numero, nuevo: false };
  let o: Fila;
  if (b.order && typeof b.order === 'object' && Array.isArray((b.order as Fila).line_items)) o = { ...(b.order as Fila), id: orderId };
  else if (b.texto && b.texto.length > 40) {
    const r = await pedidoDesdeTexto(storeId, orderId, b.texto);
    if (typeof r.error === 'string') return { error: r.error };
    o = r;
  } else return { error: 'La extensión no pudo leer el pedido de la página.' };
  const { importarPedido } = await import('./shopifyPedidos.js');
  // Lo importas tú a mano desde el pedido: la confirmación por WhatsApp sale siempre (es
  // una plantilla, no depende de la ventana de 24 h), aunque el pedido sea de días atrás.
  const oid = await importarPedido(storeId, shop || 'shopify', o, true);
  if (!oid) return { error: 'No se pudo crear el pedido en DealFlow.' };
  const n = (db.prepare('SELECT numero FROM orders WHERE id = ?').get(oid) as { numero: number }).numero;
  registrarLog(storeId, 'info', 'pedido', `DF-${n} creado desde la extensión DealFlow x Shopify (${txt(o.name) || orderId}).`);
  return { ok: true, numero: n, nuevo: true };
}
