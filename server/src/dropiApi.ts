import { db, pj } from './db.js';

/**
 * Integración DIRECTA con la API de Dropi (no por WooCommerce/Dropify).
 *
 * Con el token de integración de la tienda (Dropi → Mis Integraciones, tipo
 * WooCommerce) podemos, sin usar la web de Dropi:
 *  - resolver el departamento y la ciudad con los nombres exactos de Dropi,
 *  - COTIZAR el envío con todas las transportadoras para ese destino,
 *  - CREAR la orden diciéndole a Dropi qué transportadora usar y a qué precio,
 *  - y consultar estado, guía y PDF.
 *
 * Auth: cada petición lleva el token en el encabezado `dropi-integration-key` y
 * un User-Agent tipo WordPress (`WordPress/6.8.3; <integration_url>`). Sin ese
 * User-Agent Dropi responde 401 aunque el token sea válido.
 * Base: https://api.dropi.co/integrations
 */

const BASE = 'https://api.dropi.co/integrations';
const WP_UA = 'WordPress/6.8.3';

export interface DropiCred { token: string; integrationUrl: string; preferencia: string }

/** Config de la integración Dropi API de una tienda (tipo 'dropi_api'). */
export function credDropi(storeId: string): DropiCred | null {
  const row = db.prepare("SELECT config FROM store_integrations WHERE store_id = ? AND tipo = 'dropi_api'").get(storeId) as { config: string } | undefined;
  if (!row) return null;
  const cfg = pj<Record<string, string>>(row.config, {});
  const token = String(cfg.token || '').trim();
  const integrationUrl = String(cfg.integrationUrl || '').trim().replace(/\/+$/, '');
  if (!token || !integrationUrl) return null;
  return { token, integrationUrl, preferencia: String(cfg.preferencia || 'operador') };
}

interface DropiResp<T> { isSuccess?: boolean; status?: number | string; message?: string; objects?: T }

async function dropi<T>(cred: DropiCred, method: string, path: string, body?: unknown): Promise<{ ok: boolean; body: DropiResp<T>; http: number }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'dropi-integration-key': cred.token,
      // Dropi valida que la petición "venga de WordPress"; sin este UA da 401.
      'User-Agent': `${WP_UA}; ${cred.integrationUrl}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as DropiResp<T>;
  return { ok: res.ok && parsed.isSuccess !== false, body: parsed, http: res.status };
}

/**
 * Saca la lista de resultados sin importar cómo la envuelva Dropi: puede venir en
 * `objects` (array), como array pelado, en `objects.data`, en `data`, o como el
 * primer array que aparezca dentro del objeto. Así no dependemos de una sola forma.
 */
function sacarArray(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.objects)) return b.objects as Record<string, unknown>[];
    if (b.objects && typeof b.objects === 'object') {
      const o = b.objects as Record<string, unknown>;
      if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
      const dentro = Object.values(o).find((v) => Array.isArray(v));
      if (dentro) return dentro as Record<string, unknown>[];
    }
    if (Array.isArray(b.data)) return b.data as Record<string, unknown>[];
    const arr = Object.values(b).find((v) => Array.isArray(v));
    if (arr) return arr as Record<string, unknown>[];
  }
  return [];
}

/** Verifica el token: pide los departamentos (llamada barata que exige auth). */
export async function verificarDropi(storeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = credDropi(storeId);
  if (!c) return { ok: false, error: 'Faltan el token y la URL de integración de Dropi.' };
  try {
    const r = await dropi<unknown[]>(c, 'GET', '/department');
    if (r.http === 401) return { ok: false, error: 'Dropi rechazó el token (401). Revisa el token y que la URL de integración sea la misma que registraste en Dropi.' };
    if (!r.ok) return { ok: false, error: r.body.message || `Dropi respondió ${r.http}.` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos conectar con Dropi. Intenta de nuevo.' };
  }
}

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Bogotá no es departamento en Dropi (es CUNDINAMARCA / BOGOTA); "Valle del Cauca" = VALLE.
function aliasDepto(nombre: string): string {
  const n = norm(nombre);
  if (n === 'bogota' || n === 'bogotadc' || n === 'distritocapital' || n === 'bogotadistritocapital') return 'cundinamarca';
  if (n === 'valledelcauca') return 'valle';
  return n;
}

interface Depto { id: number; name: string }
interface Ciudad { id: number; name: string; cod_dane: string; department_id: number; recaudo: boolean }

/**
 * Resuelve el destino: encuentra el departamento y la ciudad con los nombres
 * EXACTOS del catálogo de Dropi (comparando sin tildes/mayúsculas/espacios) y
 * devuelve el cod_dane (obligatorio para cotizar) y si acepta recaudo.
 */
export async function resolverDestino(
  cred: DropiCred, departamento: string, ciudad: string, conRecaudo: boolean,
): Promise<{ ciudad: Ciudad; depto: Depto } | { error: string; opciones?: string[] }> {
  let deptos: Depto[] = [];
  let deptosRaw: Record<string, unknown>[] = [];
  try {
    const r = await dropi<Record<string, unknown>[]>(cred, 'GET', '/department');
    deptosRaw = sacarArray(r.body);
    if (!deptosRaw.length) { console.warn('[dropi] department vacío · http', r.http, '· body:', JSON.stringify(r.body).slice(0, 400)); return { error: r.body.message || 'No pudimos leer los departamentos de Dropi.' }; }
  } catch { return { error: 'No pudimos conectar con Dropi (departamentos).' }; }

  // Dropi puede llamar al nombre `name`, `nombre`, `description`… lo leemos de todas.
  const nombreDe = (o: Record<string, unknown>) => String(o.name ?? o.nombre ?? o.description ?? o.descripcion ?? o.text ?? '');
  const codDaneDe = (o: Record<string, unknown>) => String(o.cod_dane ?? o.codigo_dane ?? o.dane ?? o.daneCode ?? o.codDane ?? '').trim();
  deptos = deptosRaw.map((d) => ({ id: Number(d.id), name: nombreDe(d) }));

  const dObjetivo = aliasDepto(departamento);
  const depto = deptos.find((d) => norm(d.name) === dObjetivo) || deptos.find((d) => d.name && (norm(d.name).includes(dObjetivo) || dObjetivo.includes(norm(d.name))));
  if (!depto) {
    console.warn('[dropi] departamento no casó:', departamento, '· llaves ejemplo:', deptosRaw[0] ? Object.keys(deptosRaw[0]) : 'sin datos', '· muestra:', JSON.stringify(deptosRaw[0] || {}).slice(0, 300));
    return { error: `Dropi no reconoce el departamento "${departamento}". Escríbelo como en Dropi.`, opciones: deptos.map((d) => d.name).filter(Boolean).slice(0, 40) };
  }

  const rateType = conRecaudo ? 'CON RECAUDO' : 'SIN RECAUDO';
  let ciudades: Record<string, unknown>[] = [];
  try {
    const r = await dropi<Record<string, unknown>[]>(cred, 'POST', '/trajectory/bycity', { department_id: depto.id, rate_type: rateType });
    ciudades = sacarArray(r.body);
    if (!ciudades.length) { console.warn('[dropi] bycity vacío · dep', depto.id, depto.name, '· http', r.http, '· body:', JSON.stringify(r.body).slice(0, 500)); return { error: r.body.message || 'No pudimos leer las ciudades de Dropi.' }; }
  } catch { return { error: 'No pudimos conectar con Dropi (ciudades).' }; }

  const cObjetivo = norm(ciudad);
  const found = ciudades.find((c) => norm(nombreDe(c)) === cObjetivo) || ciudades.find((c) => { const n = norm(nombreDe(c)); return n && (n.includes(cObjetivo) || cObjetivo.includes(n)); });
  if (!found) {
    console.warn('[dropi] ciudad no casó:', ciudad, 'en', depto.name, '· llaves ejemplo:', ciudades[0] ? Object.keys(ciudades[0]) : 'sin datos', '· muestra:', JSON.stringify(ciudades[0] || {}).slice(0, 300));
    return { error: `Dropi no reconoce la ciudad "${ciudad}" en ${depto.name}. Escríbela como en Dropi.`, opciones: ciudades.map(nombreDe).filter(Boolean).slice(0, 80) };
  }

  const cod = codDaneDe(found);
  if (!cod) return { error: `La ciudad "${nombreDe(found)}" no trae código DANE en Dropi; no se puede cotizar.` };
  const aceptaRecaudo = found.recaudo ?? found.collection_service ?? found.acepta_recaudo ?? found.con_recaudo;
  const recaudoOk = aceptaRecaudo === undefined ? true : !!aceptaRecaudo;
  if (conRecaudo && !recaudoOk) return { error: `La ciudad "${nombreDe(found)}" no acepta pago contra entrega (recaudo) en Dropi.` };

  return { ciudad: { id: Number(found.id), name: nombreDe(found), cod_dane: cod, department_id: depto.id, recaudo: recaudoOk }, depto };
}

export interface DropiVariacion { id: number; atributos: string; sku: string }
export interface DropiProducto { id: number; name: string; tipo: 'SIMPLE' | 'VARIABLE'; userId: number; variaciones: DropiVariacion[] }

/** Trae un producto de Dropi por su id, con sus variaciones y el proveedor (user_id). */
export async function productoDropi(cred: DropiCred, id: number | string): Promise<DropiProducto | { error: string }> {
  try {
    const r = await dropi<Record<string, unknown>>(cred, 'GET', `/products/v2/${encodeURIComponent(String(id))}`);
    if (!r.ok || !r.body.objects) return { error: r.body.message || `Dropi no encontró el producto ${id}.` };
    const o = r.body.objects as Record<string, unknown>;
    const varsRaw = (Array.isArray(o.variations) ? o.variations : (Array.isArray(o.variaciones) ? o.variaciones : [])) as Record<string, unknown>[];
    // Los atributos de la variación pueden venir de varias formas; los juntamos todos
    // como texto para poder emparejar por talla/color al despachar.
    const attrTexto = (v: Record<string, unknown>): string => {
      const partes: string[] = [];
      const av = v.attribute_values ?? v.attributes ?? v.atributos;
      if (Array.isArray(av)) for (const a of av as Record<string, unknown>[]) partes.push(String(a?.value ?? a?.option ?? a?.name ?? a ?? ''));
      else if (av) partes.push(String(av));
      partes.push(String(v.name ?? v.nombre ?? ''), String(v.sku ?? ''));
      return partes.filter(Boolean).join(' ');
    };
    const variaciones: DropiVariacion[] = varsRaw.map((v) => ({
      id: Number(v.id),
      atributos: attrTexto(v) || String(v.id),
      sku: String(v.sku || ''),
    }));
    return {
      id: Number(o.id),
      name: String(o.name ?? o.nombre ?? ''),
      tipo: String(o.type ?? o.tipo ?? 'SIMPLE').toUpperCase() === 'VARIABLE' || varsRaw.length > 0 ? 'VARIABLE' : 'SIMPLE',
      userId: Number(o.user_id || o.userId || 0),
      variaciones,
    };
  } catch {
    return { error: 'No pudimos consultar el producto en Dropi.' };
  }
}

export interface CotProducto { id: number; quantity: number; type: 'SIMPLE' | 'VARIABLE'; variation_id?: number }
export interface Transportadora { id: number; nombre: string; service: string; precio: number }
export interface CotResultado { disponibles: Transportadora[]; noDisponibles: { nombre: string; motivo: string }[] }

/** Cotiza el envío: precio de cada transportadora al destino. No crea nada. */
export async function cotizar(
  cred: DropiCred,
  ciudad: Ciudad,
  productos: CotProducto[],
  monto: number,
  conRecaudo: boolean,
): Promise<CotResultado | { error: string }> {
  const body = {
    peso: 1, largo: 1, ancho: 1, alto: 1,
    ValorDeclarado: monto, amount: monto,
    EnvioConCobro: conRecaudo, insurance: false,
    ciudad_destino: { id: ciudad.id, name: ciudad.name, cod_dane: ciudad.cod_dane, department_id: ciudad.department_id },
    products: productos,
  };
  try {
    const r = await dropi<Record<string, unknown>[]>(cred, 'POST', '/orders/cotizaEnvioTransportadoraV2', body);
    const lista = sacarArray(r.body);
    if (!lista.length) { console.warn('[dropi] cotiza vacío · http', r.http, '· body:', JSON.stringify(r.body).slice(0, 500)); return { error: r.body.message || 'Dropi no devolvió transportadoras para este destino.' }; }
    const disponibles: Transportadora[] = [];
    const noDisponibles: { nombre: string; motivo: string }[] = [];
    for (const t of lista) {
      const nombre = String(t.transportadora || t.name || '');
      const obj = (t.objects || {}) as Record<string, unknown>;
      const precio = Number(obj.precioEnvio ?? obj.precio ?? 0);
      if (t.error || !precio) noDisponibles.push({ nombre, motivo: String(t.error || 'Sin cobertura') });
      else disponibles.push({ id: Number(t.transportadora_id || t.id), nombre, service: String(t.transportadora_service || 'normal'), precio });
    }
    disponibles.sort((a, b) => a.precio - b.precio);
    return { disponibles, noDisponibles };
  } catch {
    return { error: 'No pudimos cotizar el envío en Dropi.' };
  }
}

export interface CrearOrdenInput {
  total: number; notas: string; nombre: string; apellido: string; direccion: string;
  departamento: string; ciudad: string; telefono: string; email?: string;
  conRecaudo: boolean; shopOrderId: string;
  productos: { id: number; name: string; type: 'SIMPLE' | 'VARIABLE'; variation_id?: number; quantity: number; price: number }[];
  transportadora?: Transportadora; // la elegida (si hay)
  borrador?: boolean; // true = "PENDIENTE CONFIRMACION"
  ciudadDropi: Ciudad;
}

/** Crea la orden en Dropi, incluyendo la transportadora elegida (si se pasó). */
export async function crearOrden(cred: DropiCred, inp: CrearOrdenInput): Promise<{ id: string } | { error: string }> {
  const payload: Record<string, unknown> = {
    total_order: inp.total,
    notes: inp.notas,
    name: inp.nombre, surname: inp.apellido,
    dir: inp.direccion, country: 'CO',
    state: inp.departamento, city: inp.ciudad,
    phone: inp.telefono, client_email: inp.email || '',
    payment_method_id: 1,
    status: inp.borrador ? 'PENDIENTE CONFIRMACION' : 'PENDIENTE',
    type: 'FINAL_ORDER',
    rate_type: inp.conRecaudo ? 'CON RECAUDO' : 'SIN RECAUDO',
    products: inp.productos,
    calculate_costs_and_shiping: true,
    shop_order_id: inp.shopOrderId,
    create_product_if_not_exist: false,
  };
  if (inp.transportadora) {
    payload.distributionCompany = { id: inp.transportadora.id, name: inp.transportadora.nombre };
    payload.type_service = inp.transportadora.service;
    payload.shipping_amount = inp.transportadora.precio;
  }
  try {
    const r = await dropi<Record<string, unknown>>(cred, 'POST', '/orders/myorders', payload);
    const obj = (r.body.objects || {}) as Record<string, unknown>;
    const id = String(obj.id || obj.order_id || '');
    if (!r.ok || !id) return { error: r.body.message || 'Dropi no aceptó la orden.' };
    return { id };
  } catch {
    return { error: 'No pudimos crear la orden en Dropi.' };
  }
}

const PDF_BASE = 'https://d39ru7awumhhs2.cloudfront.net/';

/** Estado, guía, transportadora asignada y PDF de una orden de Dropi. */
export async function estadoOrden(cred: DropiCred, id: string): Promise<{ estado: string; guia: string; transportadora: string; guiaUrl: string } | { error: string }> {
  try {
    const r = await dropi<Record<string, unknown>>(cred, 'GET', `/orders/myorders/${encodeURIComponent(id)}`);
    if (!r.ok || !r.body.objects) return { error: r.body.message || 'No pudimos consultar la orden en Dropi.' };
    const o = r.body.objects as Record<string, unknown>;
    const guiaS3 = String(o.guia_urls3 || o.guia_url || '');
    return {
      estado: String(o.status || o.estado || ''),
      guia: String(o.tracking_number || o.guia || o.numero_guia || ''),
      transportadora: String((o.distributionCompany as Record<string, unknown> | undefined)?.name || o.transportadora || ''),
      guiaUrl: guiaS3 ? (guiaS3.startsWith('http') ? guiaS3 : PDF_BASE + guiaS3.replace(/^\/+/, '')) : '',
    };
  } catch {
    return { error: 'No pudimos consultar la orden en Dropi.' };
  }
}
