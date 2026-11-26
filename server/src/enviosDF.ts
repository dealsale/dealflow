/**
 * Envíos DealFlow: la integración de envíos de DealFlow para las tiendas.
 *
 * La tienda acepta los términos y la activa (no pone claves: usa la cuenta de envíos de DealFlow).
 * Con eso:
 *  - Los productos de DealShop salen solos de la bodega del proveedor al confirmarse (bodegaDF.ts).
 *  - Sus productos PROPIOS los puede despachar desde su bodega: cotiza, elige transportadora
 *    (Servientrega, Coordinadora, Interrapidísimo…) y se genera la guía a nombre de DealFlow.
 * DealFlow recauda el contraentrega y lo abona a la billetera de la tienda al entregarse. Se cobra
 * el envío + el servicio de guía (ajuste del superadmin). Nunca se muestra «Skydropx».
 */
import { db, pj, registrarLog } from './db.js';
import { trazar } from './trazabilidad.js';
import { ajustesDF, saldoBilletera, moverBilletera, analizarPedidoDF, despacharDF } from './bodegaDF.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

db.exec(`CREATE TABLE IF NOT EXISTS envios_df (
  store_id TEXT PRIMARY KEY,
  activo INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL DEFAULT '',
  aceptado_por TEXT NOT NULL DEFAULT '',
  aceptado_at TEXT NOT NULL DEFAULT '',
  origen TEXT NOT NULL DEFAULT '{}',
  paquete TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// ── Términos ──────────────────────────────────────────────────────────────
export const TERMINOS_VERSION = '2026-11';
export function terminosEnviosDF(): string[] {
  const a = ajustesDF();
  return [
    'DealFlow genera las guías de tus pedidos con su propia cuenta de envíos y con las transportadoras disponibles para cada destino (Servientrega, Coordinadora, Interrapidísimo y otras).',
    `Por cada guía se descuenta de tu billetera el valor del envío más un servicio de guía de ${pesos(a.tarifaPropia)} (productos propios) o ${pesos(a.tarifaTienda)} (productos de DealShop). En DealShop también se descuenta el costo del producto.`,
    'El saldo se descuenta antes de generar la guía. Si no te alcanza, el pedido espera hasta que recargues.',
    'Cuando el pedido es contraentrega, DealFlow recauda lo que paga el cliente y te lo abona a la billetera cuando la transportadora lo marca como entregado.',
    `Si el pedido se devuelve, se te cobra el flete del regreso (${a.fleteDevolucionPct}% del envío). En DealShop se te reintegra el costo del producto.`,
    'Si se cancela un envío antes de que lo recoja la transportadora, te devolvemos lo que se descontó.',
    'Los datos del cliente (nombre, celular y dirección) se comparten solo con la transportadora y, en DealShop, con el proveedor que despacha.',
    'Puedes retirar el saldo de tu billetera cuando quieras (mínimo ' + pesos(a.retiroMin) + '). Los retiros se pagan en los días hábiles siguientes.',
    'Las demoras o novedades de la transportadora se gestionan desde DealFlow; DealFlow te avisa y te ayuda a resolverlas.',
    'Puedes desactivar Envíos DealFlow cuando quieras; las guías que ya salieron se terminan de liquidar normalmente.',
  ];
}

// ── Configuración de la tienda ────────────────────────────────────────────
export interface OrigenTienda { nombre: string; empresa: string; telefono: string; email: string; direccion: string; referencia: string; departamento: string; ciudad: string; nit: string }
export interface PaqueteTienda { largo: number; ancho: number; alto: number; peso: number; contenido: string }
const ORIGEN_BASE: OrigenTienda = { nombre: '', empresa: '', telefono: '', email: '', direccion: '', referencia: '', departamento: '', ciudad: '', nit: '' };
const PAQUETE_BASE: PaqueteTienda = { largo: 20, ancho: 15, alto: 10, peso: 1, contenido: 'Productos de la tienda' };

function fila(storeId: string): Fila | undefined { return db.prepare('SELECT * FROM envios_df WHERE store_id = ?').get(storeId) as Fila | undefined; }
export function enviosDFActivo(storeId: string): boolean { return !!num(fila(storeId)?.activo); }
function origenDe(r?: Fila): OrigenTienda { return { ...ORIGEN_BASE, ...pj<Partial<OrigenTienda>>(txt(r?.origen), {}) }; }
function paqueteDe(r?: Fila): PaqueteTienda { return { ...PAQUETE_BASE, ...pj<Partial<PaqueteTienda>>(txt(r?.paquete), {}) }; }
export function faltaOrigenTienda(o: OrigenTienda): string[] {
  const f: string[] = [];
  if (!o.nombre) f.push('nombre de quien envía'); if (!o.email) f.push('correo'); if (o.telefono.replace(/\D/g, '').length < 7) f.push('celular');
  if (!o.direccion) f.push('dirección'); if (!o.ciudad) f.push('ciudad'); if (!o.departamento) f.push('departamento');
  return f;
}

export async function estadoEnviosDF(storeId: string) {
  const r = fila(storeId);
  const sk = await import('./skydropxApi.js');
  const a = ajustesDF();
  const origen = origenDe(r);
  return {
    activo: !!num(r?.activo),
    aceptado: r && txt(r.aceptado_at) ? { por: txt(r.aceptado_por), at: txt(r.aceptado_at), version: txt(r.version) } : null,
    terminos: { version: TERMINOS_VERSION, texto: terminosEnviosDF() },
    terminosNuevos: !!r && !!txt(r.version) && txt(r.version) !== TERMINOS_VERSION,
    disponible: !!sk.cfgSkydropxDF(),
    origen, paquete: paqueteDe(r), faltaOrigen: faltaOrigenTienda(origen),
    saldo: saldoBilletera(storeId),
    tarifas: { propio: a.tarifaPropia, dealshop: a.tarifaTienda, recargaMin: a.recargaMin },
  };
}

export function activarEnviosDF(storeId: string, acepto: boolean, quien: string): { ok: true } | { error: string } {
  if (!acepto) return { error: 'Para activar Envíos DealFlow tienes que aceptar los términos.' };
  db.prepare(`INSERT INTO envios_df (store_id, activo, version, aceptado_por, aceptado_at) VALUES (?, 1, ?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET activo = 1, version = excluded.version, aceptado_por = excluded.aceptado_por, aceptado_at = excluded.aceptado_at, updated_at = datetime('now')`)
    .run(storeId, TERMINOS_VERSION, quien.slice(0, 120));
  registrarLog(storeId, 'info', 'envios', `Envíos DealFlow activado por ${quien} (términos ${TERMINOS_VERSION}).`);
  return { ok: true };
}
export function desactivarEnviosDF(storeId: string, quien: string): void {
  db.prepare("UPDATE envios_df SET activo = 0, updated_at = datetime('now') WHERE store_id = ?").run(storeId);
  registrarLog(storeId, 'warn', 'envios', `Envíos DealFlow desactivado por ${quien}.`);
}
export function guardarOrigenTienda(storeId: string, o: Partial<OrigenTienda>, p: Partial<PaqueteTienda>): { ok: true } | { error: string } {
  const r = fila(storeId);
  const origen = Object.fromEntries(Object.entries({ ...origenDe(r), ...(o || {}) }).filter(([k]) => k in ORIGEN_BASE).map(([k, v]) => [k, String(v ?? '').trim().slice(0, 120)])) as unknown as OrigenTienda;
  const paq0 = { ...paqueteDe(r), ...(p || {}) };
  const paquete: PaqueteTienda = { largo: Math.min(200, Math.max(1, num(paq0.largo) || 20)), ancho: Math.min(200, Math.max(1, num(paq0.ancho) || 15)), alto: Math.min(200, Math.max(1, num(paq0.alto) || 10)), peso: Math.min(70, Math.max(0.1, num(paq0.peso) || 1)), contenido: String(paq0.contenido || '').slice(0, 60) || PAQUETE_BASE.contenido };
  db.prepare(`INSERT INTO envios_df (store_id, origen, paquete) VALUES (?,?,?)
    ON CONFLICT(store_id) DO UPDATE SET origen = excluded.origen, paquete = excluded.paquete, updated_at = datetime('now')`).run(storeId, JSON.stringify(origen), JSON.stringify(paquete));
  return { ok: true };
}

// ── Productos propios: cotizar y despachar ────────────────────────────────
interface TarifaDF { id: string; transportadora: string; servicio: string; precio: number; dias: number | null }
const cotizaciones = new Map<string, { at: number; tarifas: TarifaDF[] }>();
const pagadoPorCliente = (o: Fila) => /\bPagado\b/.test(txt(o.nota));

function revisarPedido(storeId: string, orderId: string): { o: Fila } | { error: string; dealshop?: true } {
  if (!enviosDFActivo(storeId)) return { error: 'Activa Envíos DealFlow en Integraciones para despachar con DealFlow.' };
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  if (txt(o.guia) || txt(o.skydropx_envio) || txt(o.effi_remision) || txt(o.dropi_order_id)) return { error: 'Este pedido ya tiene guía.' };
  if (['Cancelado', 'Entregado', 'Devuelto'].includes(txt(o.estado))) return { error: `El pedido está ${txt(o.estado).toLowerCase()}.` };
  const a = analizarPedidoDF(storeId, orderId);
  if (a.tipo === 'mixto') return { error: a.detalle };
  if (a.tipo === 'df') return { error: 'Este pedido es de DealShop: sale solo desde la bodega del proveedor.', dealshop: true };
  return { o };
}

export async function cotizarPropio(storeId: string, orderId: string): Promise<{ ciudad: string; tarifas: (TarifaDF & { servicio_df: number; total: number })[]; noDisponibles: { nombre: string; motivo: string }[]; saldo: number; cod: boolean } | { error: string }> {
  const rv = revisarPedido(storeId, orderId);
  if ('error' in rv) return { error: rv.error };
  const r = fila(storeId);
  const origen = origenDe(r);
  const falta = faltaOrigenTienda(origen);
  if (falta.length) return { error: `Completa la dirección de recogida de tu bodega en Integraciones → Envíos DealFlow (falta: ${falta.join(', ')}).` };
  const sk = await import('./skydropxApi.js');
  if (!sk.cfgSkydropxDF()) return { error: 'Envíos DealFlow todavía no está disponible. Escríbenos a soporte.' };
  const cod = !pagadoPorCliente(rv.o);
  const q = await sk.cotizarSkydropx(storeId, orderId, { recaudo: cod, df: { origen, paquete: paqueteDe(r) } });
  if ('error' in q) return { error: sk.sinMarca(q.error) };
  const tarifas = q.disponibles.map((t) => ({ id: t.id, transportadora: t.transportadora, servicio: t.servicio, precio: Math.round(t.precio), dias: t.dias }));
  cotizaciones.set(`${storeId}:${orderId}`, { at: Date.now(), tarifas });
  const serv = ajustesDF().tarifaPropia;
  return { ciudad: q.ciudad, tarifas: tarifas.map((t) => ({ ...t, servicio_df: serv, total: t.precio + serv })), noDisponibles: q.noDisponibles, saldo: saldoBilletera(storeId), cod };
}

const enCurso = new Set<string>();
export async function despacharPropio(storeId: string, orderId: string, tarifaId: string, quien: string): Promise<{ ok: true; guia: string } | { error: string }> {
  if (enCurso.has(orderId)) return { error: 'Ese pedido ya se está despachando.' };
  enCurso.add(orderId);
  try {
    const rv = revisarPedido(storeId, orderId);
    if ('error' in rv) {
      // Un pedido de DealShop se despacha con su flujo (bodega del proveedor).
      if (rv.dealshop) return despacharDF(storeId, orderId, { manual: true });
      return { error: rv.error };
    }
    const o = rv.o;
    const cot = cotizaciones.get(`${storeId}:${orderId}`);
    const tarifa = cot && Date.now() - cot.at < 20 * 60_000 ? cot.tarifas.find((t) => t.id === tarifaId) : undefined;
    if (!tarifa) return { error: 'La cotización venció. Vuelve a cotizar y elige la transportadora.' };
    const r = fila(storeId);
    const origen = origenDe(r);
    const sk = await import('./skydropxApi.js');
    const servicio = ajustesDF().tarifaPropia;
    const cargo = tarifa.precio + servicio;
    const num_ = `DF-${txt(o.numero)}`;
    const ref = `propio:${orderId}:${Date.now()}`;
    const cobrado = db.transaction(() => {
      const saldo = saldoBilletera(storeId);
      if (saldo < cargo) return saldo;
      moverBilletera(storeId, 'despacho', -tarifa.precio, { orderId, detalle: `Envío ${pesos(tarifa.precio)} (${tarifa.transportadora})`, quien: 'DealFlow Envíos', referencia: ref });
      if (servicio > 0) moverBilletera(storeId, 'servicio', -servicio, { orderId, detalle: 'Generación de la guía', quien: 'DealFlow Envíos', referencia: `${ref}:serv` });
      return -1;
    })();
    if (cobrado >= 0) return { error: `Saldo insuficiente: esta guía cuesta ${pesos(cargo)} y tienes ${pesos(cobrado)}. Recarga tu billetera en DealShop.` };
    const cod = !pagadoPorCliente(o);
    const res = await sk.crearEnvioSkydropx(storeId, orderId, { id: tarifa.id, transportadora: tarifa.transportadora }, '', { origen, paquete: paqueteDe(r) });
    if ('error' in res) {
      moverBilletera(storeId, 'reintegro', cargo, { orderId, detalle: 'No se pudo generar la guía: te devolvimos el cobro', quien: 'DealFlow Envíos', referencia: `${ref}:rev` });
      trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'DealFlow Envíos: no se generó la guía', detalle: sk.sinMarca(res.error) });
      return { error: sk.sinMarca(res.error) };
    }
    const cobro = { producto: 0, envio: tarifa.precio, recaudo: cod ? Math.round(num(o.total)) : 0, cod, transportadora: tarifa.transportadora, proveedorId: '', servicioTienda: servicio, servicioProveedor: 0, propio: true };
    db.prepare("UPDATE orders SET df_estado = 'despachado', df_detalle = '', df_proveedor = '', df_cobro = ?, df_recogido_at = '', df_escalado = '', df_aviso_prov = 1 WHERE id = ?").run(JSON.stringify(cobro), orderId);
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: `DealFlow Envíos: guía generada con ${tarifa.transportadora}`, detalle: `Por ${quien}. Se descontaron ${pesos(cargo)} de tu billetera (envío ${pesos(tarifa.precio)}${servicio ? ` + servicio de guía ${pesos(servicio)}` : ''}).${cod ? ' Al entregarse se te abona lo que pague el cliente.' : ''}` });
    registrarLog(storeId, 'info', 'despacho', `${num_} despachado con DealFlow Envíos (${tarifa.transportadora}${res.guia ? ` · guía ${res.guia}` : ''}).`);
    cotizaciones.delete(`${storeId}:${orderId}`);
    return { ok: true, guia: res.guia };
  } catch (e) {
    console.error('[envios-df] despacho', orderId, e);
    return { error: 'No se pudo despachar el pedido. Intenta de nuevo en un momento.' };
  } finally { enCurso.delete(orderId); }
}
