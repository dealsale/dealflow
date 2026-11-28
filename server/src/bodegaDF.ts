/**
 * Bodega DealFlow: dropshipping propio de DealFlow.
 *
 *  - El superadmin marca productos de la Biblioteca como «Despacha DealFlow», con su proveedor
 *    real (cuenta del Portal de proveedores + bodega de recogida), su costo por unidad (por
 *    variante si cambia) y el tamaño del paquete.
 *  - La tienda importa el producto y lo vende. Cuando un pedido con SOLO productos de la bodega
 *    queda confirmado, DealFlow lo despacha con SU cuenta de Skydropx (variables SKYDROPX_DF_*):
 *    cotiza, elige la transportadora más barata, activa el contra entrega y genera la guía con
 *    recogida en la bodega del proveedor.
 *  - Billetera de la tienda (pesos): recarga con Bold; al despachar se descuenta producto + envío;
 *    entregado con contra entrega → se le abona lo que pagó el cliente (menos la comisión de
 *    recaudo); devuelto → se le reintegra el producto y se cobra el flete de devolución; envío
 *    cancelado → se le reintegra todo. Retiros: la tienda los pide y el superadmin los paga por
 *    fuera y los marca pagados (DealFlow nunca mueve plata a cuentas bancarias solo).
 *  - El proveedor ve sus pedidos en el portal: imprime las guías, marca lo que entregó a la
 *    transportadora y escala las novedades a la tienda.
 */
import './proveedores.js'; // crea proveedor_cuentas antes de agregarle columnas
import { db, uid, pj, registrarLog } from './db.js';
import { trazar } from './trazabilidad.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const alter = (sql: string) => { try { db.exec(sql); } catch { /* ya existe */ } };

// ── Esquema ─────────────────────────────────────────────────────────────────
alter("ALTER TABLE proveedor_cuentas ADD COLUMN bodega TEXT NOT NULL DEFAULT '{}'");
for (const c of ["df_activo INTEGER NOT NULL DEFAULT 0", "df_proveedor TEXT NOT NULL DEFAULT ''", "df_costo INTEGER NOT NULL DEFAULT 0",
  "df_costos TEXT NOT NULL DEFAULT '{}'", "df_paquete TEXT NOT NULL DEFAULT '{}'"]) alter(`ALTER TABLE library_products ADD COLUMN ${c}`);
// df_estado: '' (sin revisar) | no | mixto | pendiente | sin_saldo | error | despachado | liquidado | cancelado
for (const c of ["df_estado TEXT NOT NULL DEFAULT ''", "df_proveedor TEXT NOT NULL DEFAULT ''", "df_cobro TEXT NOT NULL DEFAULT ''", "df_detalle TEXT NOT NULL DEFAULT ''",
  "df_intento_at TEXT NOT NULL DEFAULT ''", "df_intentos INTEGER NOT NULL DEFAULT 0", "df_recogido_at TEXT NOT NULL DEFAULT ''", "df_escalado TEXT NOT NULL DEFAULT ''",
  "df_aviso_prov INTEGER NOT NULL DEFAULT 0"]) alter(`ALTER TABLE orders ADD COLUMN ${c}`);
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_df_estado ON orders(df_estado, created_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_df_prov ON orders(df_proveedor, created_at)");
db.exec(`CREATE TABLE IF NOT EXISTS billetera_mov (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  monto INTEGER NOT NULL,
  order_id TEXT NOT NULL DEFAULT '',
  detalle TEXT NOT NULL DEFAULT '',
  quien TEXT NOT NULL DEFAULT '',
  referencia TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_billetera_store ON billetera_mov(store_id, created_at)');
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_billetera_ref ON billetera_mov(referencia) WHERE referencia != ''");
db.exec(`CREATE TABLE IF NOT EXISTS billetera_retiros (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  monto INTEGER NOT NULL,
  datos TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  nota TEXT NOT NULL DEFAULT '',
  quien TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto_at TEXT NOT NULL DEFAULT ''
)`);
db.exec(`CREATE TABLE IF NOT EXISTS bodega_df_cfg (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')`);

// ── Ajustes de la bodega (los cambia el superadmin) ─────────────────────────
// tarifaTienda + tarifaProveedor = lo que gana DealFlow por cada guía que genera la bodega ($400 + $400).
export interface AjustesDF { comisionPct: number; comisionFija: number; fleteDevolucionPct: number; recargaMin: number; retiroMin: number; tarifaTienda: number; tarifaProveedor: number; tarifaPropia: number }
const AJUSTES_BASE: AjustesDF = { comisionPct: 0, comisionFija: 0, fleteDevolucionPct: 100, recargaMin: 20000, retiroMin: 20000, tarifaTienda: 400, tarifaProveedor: 400, tarifaPropia: 400 };
export function ajustesDF(): AjustesDF {
  const r = db.prepare("SELECT valor FROM bodega_df_cfg WHERE clave = 'ajustes'").get() as { valor: string } | undefined;
  return { ...AJUSTES_BASE, ...pj<Partial<AjustesDF>>(r?.valor || '', {}) };
}
export function guardarAjustesDF(p: Partial<AjustesDF>): AjustesDF {
  const a = ajustesDF();
  const lim = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const nuevo: AjustesDF = {
    comisionPct: lim(p.comisionPct, 0, 30, a.comisionPct), comisionFija: Math.round(lim(p.comisionFija, 0, 100000, a.comisionFija)),
    fleteDevolucionPct: lim(p.fleteDevolucionPct, 0, 200, a.fleteDevolucionPct), recargaMin: Math.round(lim(p.recargaMin, 1000, 5_000_000, a.recargaMin)),
    retiroMin: Math.round(lim(p.retiroMin, 1000, 5_000_000, a.retiroMin)),
    tarifaTienda: Math.round(lim(p.tarifaTienda, 0, 50000, a.tarifaTienda)), tarifaProveedor: Math.round(lim(p.tarifaProveedor, 0, 50000, a.tarifaProveedor)),
    tarifaPropia: Math.round(lim(p.tarifaPropia, 0, 50000, a.tarifaPropia)),
  };
  db.prepare("INSERT INTO bodega_df_cfg (clave, valor) VALUES ('ajustes', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(nuevo));
  return nuevo;
}

// ── Bodegas de los proveedores (dirección de recogida) ─────────────────────
export interface BodegaProv { empresa: string; telefono: string; email: string; direccion: string; referencia: string; departamento: string; ciudad: string; nit: string }
const BODEGA_BASE: BodegaProv = { empresa: '', telefono: '', email: '', direccion: '', referencia: '', departamento: '', ciudad: '', nit: '' };
export function proveedorDF(id: string): { id: string; nombre: string; email: string; activo: boolean; bodega: BodegaProv } | null {
  const r = db.prepare('SELECT id, nombre, email, activo, bodega FROM proveedor_cuentas WHERE id = ?').get(id) as Fila | undefined;
  if (!r) return null;
  return { id: txt(r.id), nombre: txt(r.nombre), email: txt(r.email), activo: Number(r.activo) === 1, bodega: { ...BODEGA_BASE, ...pj<Partial<BodegaProv>>(txt(r.bodega), {}) } };
}
export function faltanDatosBodega(b: BodegaProv): string[] {
  return [!b.telefono && 'celular', !b.direccion && 'dirección', !b.ciudad && 'ciudad', !b.departamento && 'departamento'].filter(Boolean) as string[];
}
export function guardarBodegaProveedor(id: string, b: Partial<BodegaProv>): { ok: true } | { error: string } {
  const p = proveedorDF(id);
  if (!p) return { error: 'Proveedor no encontrado.' };
  const limpio = Object.fromEntries(Object.keys(BODEGA_BASE).map((k) => [k, txt((b as Fila)[k] ?? (p.bodega as unknown as Fila)[k]).slice(0, 120)])) as unknown as BodegaProv;
  limpio.telefono = limpio.telefono.replace(/[^\d+]/g, '');
  db.prepare('UPDATE proveedor_cuentas SET bodega = ? WHERE id = ?').run(JSON.stringify(limpio), id);
  return { ok: true };
}
export function listarBodegasAdmin() {
  return (db.prepare('SELECT id FROM proveedor_cuentas ORDER BY nombre').all() as { id: string }[]).map((r) => {
    const p = proveedorDF(r.id)!;
    const productos = (db.prepare('SELECT COUNT(*) n FROM library_products WHERE df_activo = 1 AND df_proveedor = ?').get(r.id) as { n: number }).n;
    // Cuentas del proveedor: costo de lo entregado menos las tarifas de guía (todo y últimos 30 días).
    const cuentas = { entregados: 0, debemos: 0, guias: 0, mesEntregados: 0, mesDebemos: 0 };
    for (const o of db.prepare("SELECT estado, df_estado, df_cobro, created_at > datetime('now','-30 days') mes FROM orders WHERE df_proveedor = ? AND df_estado IN ('despachado','liquidado')").all(r.id) as Fila[]) {
      const c = pj<Partial<Cobro>>(txt(o.df_cobro), {});
      const tarifa = num(c.servicioProveedor);
      cuentas.guias++;
      cuentas.debemos -= tarifa; if (num(o.mes)) cuentas.mesDebemos -= tarifa;
      if (txt(o.estado) === 'Entregado') {
        cuentas.entregados++; cuentas.debemos += num(c.producto);
        if (num(o.mes)) { cuentas.mesEntregados++; cuentas.mesDebemos += num(c.producto); }
      }
    }
    return { ...p, faltan: faltanDatosBodega(p.bodega), productos, cuentas };
  });
}

// ── Productos de la bodega (configuración en la Biblioteca) ─────────────────
export interface PaqueteDF { largo: number; ancho: number; alto: number; peso: number; contenido: string }
const PAQUETE_BASE: PaqueteDF = { largo: 20, ancho: 15, alto: 10, peso: 1, contenido: '' };
interface CfgProd { libId: string; nombre: string; proveedorId: string; costo: number; costos: Record<string, number>; paquete: PaqueteDF }
const aCfg = (r: Fila): CfgProd => ({
  libId: txt(r.id), nombre: txt(r.nombre), proveedorId: txt(r.df_proveedor), costo: num(r.df_costo),
  costos: pj<Record<string, number>>(txt(r.df_costos), {}), paquete: { ...PAQUETE_BASE, ...pj<Partial<PaqueteDF>>(txt(r.df_paquete), {}) },
});

/** Variantes (talla/color) de un producto de la biblioteca, del snapshot. */
function variantesLib(snapshot: string): string[] {
  const s = pj<{ variants?: { label?: string }[] }>(snapshot, {});
  return [...new Set((s.variants || []).map((v) => txt(v.label)).filter(Boolean))];
}
export function listarProductosDFAdmin() {
  const filas = db.prepare('SELECT id, nombre, precio, activo, snapshot, df_activo, df_proveedor, df_costo, df_costos, df_paquete FROM library_products ORDER BY orden, created_at').all() as Fila[];
  return filas.map((r) => {
    const c = aCfg(r);
    const importos = (db.prepare('SELECT COUNT(*) n FROM library_imports WHERE library_product_id = ?').get(txt(r.id)) as { n: number }).n;
    return {
      id: c.libId, nombre: c.nombre, precio: num(r.precio), visible: Number(r.activo) === 1, activo: Number(r.df_activo) === 1,
      proveedorId: c.proveedorId, costo: c.costo, costos: c.costos, paquete: c.paquete, variantes: variantesLib(txt(r.snapshot)), importos,
    };
  });
}
export function guardarProductoDF(libId: string, b: Fila): { ok: true } | { error: string } {
  const r = db.prepare('SELECT * FROM library_products WHERE id = ?').get(libId) as Fila | undefined;
  if (!r) return { error: 'Producto no encontrado.' };
  const c = aCfg(r);
  const activo = b.activo === undefined ? Number(r.df_activo) === 1 : !!b.activo;
  const proveedorId = b.proveedorId === undefined ? c.proveedorId : txt(b.proveedorId);
  const costo = b.costo === undefined ? c.costo : Math.max(0, Math.round(num(b.costo)));
  if (activo) {
    if (!proveedorId || !proveedorDF(proveedorId)) return { error: 'Elige el proveedor que despacha este producto.' };
    if (costo <= 0) return { error: 'Pon el costo por unidad del producto.' };
  }
  let costos = c.costos;
  if (b.costos && typeof b.costos === 'object') {
    costos = {};
    for (const [k, v] of Object.entries(b.costos as Fila)) { const n = Math.round(num(v)); if (txt(k) && n > 0) costos[txt(k).slice(0, 80)] = n; }
  }
  let paquete = c.paquete;
  if (b.paquete && typeof b.paquete === 'object') {
    const p = b.paquete as Fila;
    const pos = (v: unknown, d: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(max, n) : d; };
    paquete = { largo: pos(p.largo, c.paquete.largo, 200), ancho: pos(p.ancho, c.paquete.ancho, 200), alto: pos(p.alto, c.paquete.alto, 200), peso: pos(p.peso, c.paquete.peso, 70), contenido: txt(p.contenido ?? c.paquete.contenido).slice(0, 60) };
  }
  db.prepare('UPDATE library_products SET df_activo = ?, df_proveedor = ?, df_costo = ?, df_costos = ?, df_paquete = ? WHERE id = ?')
    .run(activo ? 1 : 0, proveedorId, costo, JSON.stringify(costos), JSON.stringify(paquete), libId);
  return { ok: true };
}

/** Productos de la bodega para la tienda (catálogo de la Biblioteca): costo por unidad y desde dónde sale. */
export function infoBibliotecaDF(): Map<string, { costo: number; costoMax: number; ciudad: string }> {
  const m = new Map<string, { costo: number; costoMax: number; ciudad: string }>();
  for (const r of db.prepare('SELECT * FROM library_products WHERE df_activo = 1').all() as Fila[]) {
    const c = aCfg(r);
    const vals = [c.costo, ...Object.values(c.costos)].filter((n) => n > 0);
    m.set(c.libId, { costo: Math.min(...vals), costoMax: Math.max(...vals), ciudad: proveedorDF(c.proveedorId)?.bodega.ciudad || '' });
  }
  return m;
}

/** El producto de la tienda viene de la bodega? (por la importación de la Biblioteca). */
function cfgDeProducto(storeId: string, productId: string): CfgProd | null {
  if (!productId) return null;
  const r = db.prepare(`SELECT lp.* FROM library_imports li JOIN library_products lp ON lp.id = li.library_product_id
    WHERE li.store_id = ? AND li.product_id = ? AND lp.df_activo = 1`).get(storeId, productId) as Fila | undefined;
  return r ? aCfg(r) : null;
}
/** Ids de los productos de la tienda que despacha la bodega (para marcarlos en el panel). */
export function productosDFDeTienda(storeId: string): Map<string, { costo: number }> {
  const m = new Map<string, { costo: number }>();
  for (const r of db.prepare(`SELECT li.product_id, lp.df_costo FROM library_imports li JOIN library_products lp ON lp.id = li.library_product_id
      WHERE li.store_id = ? AND lp.df_activo = 1 AND li.product_id != ''`).all(storeId) as Fila[]) m.set(txt(r.product_id), { costo: num(r.df_costo) });
  return m;
}

/** Costo de un ítem: el de su variante (talla/color) si tiene uno propio; si no, el general. */
function costoItem(c: CfgProd, it: { nombre: string; variant_id: string }): number {
  const claves = Object.keys(c.costos);
  if (claves.length) {
    let label = '';
    if (it.variant_id) label = txt((db.prepare('SELECT label FROM variants WHERE id = ?').get(it.variant_id) as { label: string } | undefined)?.label);
    const n = ` ${norm(label || it.nombre)} `;
    const hit = claves.filter((k) => n.includes(` ${norm(k)} `)).sort((a, b) => b.length - a.length)[0];
    if (hit) return c.costos[hit];
  }
  return c.costo;
}

type Analisis =
  | { tipo: 'no' }
  | { tipo: 'mixto'; detalle: string }
  | { tipo: 'df'; proveedorId: string; costoProducto: number; paquete: PaqueteDF; unidades: number };
/** ¿El pedido sale por la bodega? Solo si TODOS sus productos son de la bodega y del mismo proveedor. */
export function analizarPedidoDF(storeId: string, orderId: string): Analisis {
  const items = db.prepare("SELECT nombre, qty, COALESCE(product_id,'') product_id, COALESCE(variant_id,'') variant_id FROM order_items WHERE order_id = ? AND qty > 0").all(orderId) as { nombre: string; qty: number; product_id: string; variant_id: string }[];
  if (!items.length) return { tipo: 'no' };
  const cfgs = items.map((i) => cfgDeProducto(storeId, i.product_id));
  const df = cfgs.filter(Boolean) as CfgProd[];
  if (!df.length) return { tipo: 'no' };
  if (df.length < items.length) return { tipo: 'mixto', detalle: 'El pedido mezcla productos de DealShop con productos propios: sepáralo en dos pedidos para que la bodega despache los suyos.' };
  const provs = new Set(df.map((c) => c.proveedorId));
  if (provs.size > 1) return { tipo: 'mixto', detalle: 'El pedido tiene productos de DealShop que salen de bodegas distintas: sepáralo en un pedido por producto.' };
  let costo = 0; let unidades = 0;
  const paq: PaqueteDF = { largo: 0, ancho: 0, alto: 0, peso: 0, contenido: '' };
  items.forEach((it, i) => {
    const c = cfgs[i]!;
    const q = Math.max(1, Math.round(it.qty));
    costo += costoItem(c, it) * q; unidades += q;
    paq.largo = Math.max(paq.largo, c.paquete.largo); paq.ancho = Math.max(paq.ancho, c.paquete.ancho);
    // Varias unidades: se apilan (alto) y se suman los pesos.
    paq.alto = Math.min(200, Math.max(paq.alto, c.paquete.alto * Math.min(q, 4)));
    paq.peso += c.paquete.peso * q;
    if (!paq.contenido) paq.contenido = c.paquete.contenido || c.nombre;
  });
  paq.peso = Math.max(1, Math.round(paq.peso * 10) / 10);
  return { tipo: 'df', proveedorId: df[0].proveedorId, costoProducto: costo, paquete: paq, unidades };
}
/** Atajo para otros módulos: ¿este pedido es de la bodega (completo)? */
export function esPedidoDF(storeId: string, orderId: string): boolean {
  return analizarPedidoDF(storeId, orderId).tipo === 'df';
}

// ── Billetera ───────────────────────────────────────────────────────────────
export type TipoMov = 'recarga' | 'despacho' | 'servicio' | 'reintegro' | 'recaudo' | 'devolucion' | 'retiro' | 'retiro_reverso' | 'ajuste' | 'referido';
export const NOMBRE_MOV: Record<TipoMov, string> = {
  recarga: 'Recarga', despacho: 'Despacho', servicio: 'Servicio de guía DealFlow', reintegro: 'Reintegro', recaudo: 'Pago del cliente (contra entrega)', devolucion: 'Flete de devolución',
  retiro: 'Retiro', retiro_reverso: 'Retiro rechazado (devuelto)', ajuste: 'Ajuste de DealFlow', referido: 'Ganancia por referido',
};
export function saldoBilletera(storeId: string): number {
  return num((db.prepare('SELECT COALESCE(SUM(monto),0) s FROM billetera_mov WHERE store_id = ?').get(storeId) as { s: number }).s);
}
/** Anota un movimiento. Con `referencia` es idempotente (no se anota dos veces). */
export function moverBilletera(storeId: string, tipo: TipoMov, monto: number, o: { orderId?: string; detalle?: string; quien?: string; referencia?: string } = {}): boolean {
  const m = Math.round(monto);
  if (!m) return false;
  const r = db.prepare('INSERT OR IGNORE INTO billetera_mov (id, store_id, tipo, monto, order_id, detalle, quien, referencia) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid(), storeId, tipo, m, o.orderId || '', (o.detalle || '').slice(0, 300), (o.quien || '').slice(0, 80), o.referencia || '');
  return r.changes > 0;
}
export function resumenBilletera(storeId: string) {
  const movimientos = (db.prepare(`SELECT m.*, o.numero FROM billetera_mov m LEFT JOIN orders o ON o.id = m.order_id WHERE m.store_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT 200`).all(storeId) as Fila[])
    .map((m) => ({ id: txt(m.id), tipo: txt(m.tipo), nombre: NOMBRE_MOV[txt(m.tipo) as TipoMov] || txt(m.tipo), monto: num(m.monto), detalle: txt(m.detalle), pedido: m.numero ? `DF-${txt(m.numero)}` : '', fecha: txt(m.created_at) }));
  const retiros = (db.prepare('SELECT * FROM billetera_retiros WHERE store_id = ? ORDER BY created_at DESC LIMIT 50').all(storeId) as Fila[])
    .map((r) => ({ id: txt(r.id), monto: num(r.monto), estado: txt(r.estado), nota: txt(r.nota), fecha: txt(r.created_at), resuelto: txt(r.resuelto_at) }));
  const mes = db.prepare(`SELECT tipo, COALESCE(SUM(monto),0) s FROM billetera_mov WHERE store_id = ? AND created_at > datetime('now','-30 days') GROUP BY tipo`).all(storeId) as { tipo: string; s: number }[];
  const t = (k: string) => num(mes.find((x) => x.tipo === k)?.s);
  const a = ajustesDF();
  return {
    saldo: saldoBilletera(storeId), movimientos, retiros,
    mes: { recargas: t('recarga'), despachos: -t('despacho') - t('servicio') - t('devolucion') + t('reintegro'), cobrado: t('recaudo') },
    ajustes: { recargaMin: a.recargaMin, retiroMin: a.retiroMin, comisionPct: a.comisionPct, comisionFija: a.comisionFija, fleteDevolucionPct: a.fleteDevolucionPct, tarifaTienda: a.tarifaTienda },
    listo: !!(process.env.SKYDROPX_DF_CLIENT_ID && process.env.SKYDROPX_DF_CLIENT_SECRET),
  };
}
export function pedirRetiro(storeId: string, monto: number, datos: string, quien: string): { ok: true } | { error: string } {
  const m = Math.round(num(monto));
  const a = ajustesDF();
  if (m < a.retiroMin) return { error: `El retiro mínimo es ${pesos(a.retiroMin)}.` };
  if (txt(datos).length < 8) return { error: 'Escribe a qué cuenta te pagamos: banco, tipo de cuenta, número y titular.' };
  return db.transaction(() => {
    const saldo = saldoBilletera(storeId);
    if (m > saldo) return { error: `No tienes saldo suficiente (tienes ${pesos(saldo)}).` };
    const id = uid();
    db.prepare('INSERT INTO billetera_retiros (id, store_id, monto, datos, quien) VALUES (?,?,?,?,?)').run(id, storeId, m, txt(datos).slice(0, 400), quien.slice(0, 80));
    moverBilletera(storeId, 'retiro', -m, { detalle: 'Retiro solicitado: DealFlow te lo paga por transferencia', quien, referencia: `retiro:${id}` });
    return { ok: true as const };
  })();
}
export function resolverRetiro(id: string, estado: 'pagado' | 'rechazado', nota: string, quien: string): { ok: true } | { error: string } {
  return db.transaction(() => {
    const r = db.prepare("SELECT * FROM billetera_retiros WHERE id = ? AND estado = 'pendiente'").get(id) as Fila | undefined;
    if (!r) return { error: 'Ese retiro ya no está pendiente.' };
    db.prepare("UPDATE billetera_retiros SET estado = ?, nota = ?, resuelto_at = datetime('now') WHERE id = ?").run(estado, txt(nota).slice(0, 300), id);
    if (estado === 'rechazado') moverBilletera(txt(r.store_id), 'retiro_reverso', num(r.monto), { detalle: nota ? `Retiro rechazado: ${nota}` : 'Retiro rechazado', quien, referencia: `retiro_rev:${id}` });
    registrarLog(txt(r.store_id), 'info', 'billetera', estado === 'pagado' ? `DealFlow pagó tu retiro de ${pesos(num(r.monto))}.${nota ? ` ${nota}` : ''}` : `Tu retiro de ${pesos(num(r.monto))} fue rechazado y el dinero volvió a tu saldo.${nota ? ` Motivo: ${nota}` : ''}`);
    return { ok: true as const };
  })();
}
export function ajusteBilletera(storeId: string, monto: number, motivo: string, quien: string): { ok: true; saldo: number } | { error: string } {
  const m = Math.round(num(monto));
  if (!m) return { error: 'Indica el valor (negativo para descontar).' };
  if (txt(motivo).length < 4) return { error: 'Escribe el motivo del ajuste.' };
  if (!db.prepare('SELECT 1 FROM stores WHERE id = ?').get(storeId)) return { error: 'Tienda no encontrada.' };
  moverBilletera(storeId, 'ajuste', m, { detalle: txt(motivo), quien });
  return { ok: true, saldo: saldoBilletera(storeId) };
}
export function billeterasAdmin() {
  const tiendas = (db.prepare(`SELECT m.store_id, s.nombre, COALESCE(SUM(m.monto),0) saldo, MAX(m.created_at) ultimo FROM billetera_mov m JOIN stores s ON s.id = m.store_id GROUP BY m.store_id ORDER BY saldo DESC`).all() as Fila[])
    .map((r) => ({ storeId: txt(r.store_id), tienda: txt(r.nombre), saldo: num(r.saldo), ultimo: txt(r.ultimo) }));
  const retiros = (db.prepare(`SELECT r.*, s.nombre tienda FROM billetera_retiros r JOIN stores s ON s.id = r.store_id ORDER BY CASE r.estado WHEN 'pendiente' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`).all() as Fila[])
    .map((r) => ({ id: txt(r.id), storeId: txt(r.store_id), tienda: txt(r.tienda), monto: num(r.monto), datos: txt(r.datos), estado: txt(r.estado), nota: txt(r.nota), fecha: txt(r.created_at), resuelto: txt(r.resuelto_at) }));
  return { tiendas, retiros, enCustodia: tiendas.reduce((a, t) => a + t.saldo, 0), todasLasTiendas: db.prepare("SELECT id, nombre FROM stores WHERE COALESCE(oculta,0) = 0 ORDER BY nombre").all() };
}

// ── Despacho ────────────────────────────────────────────────────────────────
interface Cobro { producto: number; envio: number; recaudo: number; cod: boolean; transportadora: string; proveedorId: string; servicioTienda?: number; servicioProveedor?: number; propio?: boolean }
const enCurso = new Set<string>();
const pagadoPorCliente = (o: Fila) => /\bPagado\b/.test(txt(o.nota));

function marcar(orderId: string, estado: string, detalle: string) {
  db.prepare("UPDATE orders SET df_estado = ?, df_detalle = ?, df_intento_at = datetime('now'), df_intentos = df_intentos + 1 WHERE id = ?").run(estado, detalle.slice(0, 400), orderId);
}

/**
 * Despacha un pedido de la bodega: revisa el saldo, cotiza con la cuenta de DealFlow, descuenta
 * producto + envío y genera la guía (si Skydropx falla, el dinero vuelve a la billetera).
 */
export async function despacharDF(storeId: string, orderId: string, opts: { manual?: boolean } = {}): Promise<{ ok: true; guia: string } | { error: string }> {
  if (enCurso.has(orderId)) return { error: 'Ese pedido ya se está despachando.' };
  enCurso.add(orderId);
  try {
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
    if (!o) return { error: 'Pedido no encontrado.' };
    if (txt(o.guia) || txt(o.skydropx_envio) || txt(o.effi_remision) || txt(o.dropi_order_id)) return { error: 'Este pedido ya tiene guía.' };
    if (['Cancelado', 'Entregado', 'Devuelto'].includes(txt(o.estado))) return { error: `El pedido está ${txt(o.estado).toLowerCase()}.` };
    if (!opts.manual && !(txt(o.estado) === 'Confirmado' || txt(o.confirmacion) === 'si')) return { error: 'El pedido aún no está confirmado.' };
    const num_ = `DF-${txt(o.numero)}`;
    const a = analizarPedidoDF(storeId, orderId);
    if (a.tipo === 'no') { marcar(orderId, 'no', ''); return { error: 'Este pedido no tiene productos de la Bodega DealFlow.' }; }
    if (a.tipo === 'mixto') {
      if (txt(o.df_estado) !== 'mixto') { registrarLog(storeId, 'warn', 'despacho', `${num_}: ${a.detalle}`); trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'DealShop: el pedido no puede salir así', detalle: a.detalle }); }
      marcar(orderId, 'mixto', a.detalle); return { error: a.detalle };
    }
    if (!(await import('./enviosDF.js')).enviosDFActivo(storeId)) {
      const d = 'Activa Envíos DealFlow (Integraciones) y acepta los términos para que DealShop despache este pedido.';
      if (txt(o.df_estado) !== 'sin_activar') { registrarLog(storeId, 'warn', 'despacho', `${num_} espera: ${d}`); trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'DealShop: falta activar Envíos DealFlow', detalle: d }); }
      marcar(orderId, 'sin_activar', d); return { error: d };
    }
    const sk = await import('./skydropxApi.js');
    if (!sk.cfgSkydropxDF()) { marcar(orderId, 'error', 'La cuenta de Skydropx de DealFlow todavía no está configurada.'); return { error: 'La Bodega DealFlow todavía no está activa. Escríbenos a soporte.' }; }
    const prov = proveedorDF(a.proveedorId);
    if (!prov) { marcar(orderId, 'error', 'El proveedor del producto ya no existe.'); return { error: 'El proveedor de este producto ya no está disponible.' }; }
    const faltan = faltanDatosBodega(prov.bodega);
    if (faltan.length) { marcar(orderId, 'error', `La bodega del proveedor no tiene ${faltan.join(', ')}.`); return { error: 'La bodega de este producto está incompleta. DealFlow ya fue avisado.' }; }
    const origen = { nombre: prov.nombre, empresa: prov.bodega.empresa || prov.nombre, telefono: prov.bodega.telefono, email: prov.bodega.email || prov.email, direccion: prov.bodega.direccion, referencia: prov.bodega.referencia, departamento: prov.bodega.departamento, ciudad: prov.bodega.ciudad, nit: prov.bodega.nit };
    const df = { origen, paquete: { ...a.paquete, contenido: (a.paquete.contenido || 'Mercancía').slice(0, 60) } };
    const cod = !pagadoPorCliente(o);
    const q = await sk.cotizarSkydropx(storeId, orderId, { recaudo: cod, df });
    if ('error' in q) { const e = sk.sinMarca(q.error); marcar(orderId, 'error', e); trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'DealShop: no se pudo cotizar el envío', detalle: e }); return { error: e }; }
    const tarifa = q.disponibles[0];
    if (!tarifa) { const d = 'Ninguna transportadora lleva este envío a esa ciudad' + (q.noDisponibles.length ? ` (${q.noDisponibles.map((x) => `${x.nombre}: ${x.motivo}`).join('; ').slice(0, 200)})` : '') + '.'; marcar(orderId, 'error', d); return { error: d }; }
    const aj = ajustesDF();
    const servicio = aj.tarifaTienda;
    const cargo = a.costoProducto + Math.round(tarifa.precio) + servicio;
    // Saldo: se descuenta ANTES de crear la guía (en una transacción, para que dos pedidos no gasten el mismo saldo).
    const ref = `despacho:${orderId}:${num(o.df_intentos) + 1}:${Date.now()}`;
    const cobrado = db.transaction(() => {
      const saldo = saldoBilletera(storeId);
      if (saldo < cargo) return saldo;
      moverBilletera(storeId, 'despacho', -(cargo - servicio), { orderId, detalle: `Producto ${pesos(a.costoProducto)} + envío ${pesos(tarifa.precio)} (${tarifa.transportadora})`, quien: 'DealFlow Envíos', referencia: ref });
      if (servicio > 0) moverBilletera(storeId, 'servicio', -servicio, { orderId, detalle: 'Generación de la guía', quien: 'DealFlow Envíos', referencia: `${ref}:serv` });
      return -1;
    })();
    if (cobrado >= 0) {
      const d = `Saldo insuficiente: este despacho cuesta ${pesos(cargo)} y tienes ${pesos(cobrado)}. Recarga tu billetera y sale solo.`;
      if (txt(o.df_estado) !== 'sin_saldo') {
        registrarLog(storeId, 'warn', 'billetera', `${num_} no salió: ${d}`);
        trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'DealShop: falta saldo en la billetera', detalle: d });
        void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `${num_} espera saldo 💳`, `Recarga ${pesos(cargo - cobrado)} o más en tu billetera para despacharlo.`, { url: '/billetera' })).catch(() => {});
      }
      marcar(orderId, 'sin_saldo', d); return { error: d };
    }
    const r = await sk.crearEnvioSkydropx(storeId, orderId, { id: tarifa.id, transportadora: tarifa.transportadora }, '', df);
    if ('error' in r) {
      moverBilletera(storeId, 'reintegro', cargo, { orderId, detalle: 'No se pudo generar la guía: te devolvimos el cobro', quien: 'DealFlow Envíos', referencia: `${ref}:rev` });
      const e = sk.sinMarca(r.error);
      marcar(orderId, 'error', e);
      trazar(storeId, orderId, { etapa: 'despacho', nivel: 'error', titulo: 'DealShop: no se generó la guía', detalle: e });
      return { error: e };
    }
    const cobro: Cobro = { producto: a.costoProducto, envio: Math.round(tarifa.precio), recaudo: cod ? Math.round(num(o.total)) : 0, cod, transportadora: tarifa.transportadora, proveedorId: a.proveedorId, servicioTienda: servicio, servicioProveedor: aj.tarifaProveedor };
    db.prepare("UPDATE orders SET df_estado = 'despachado', df_detalle = '', df_proveedor = ?, df_cobro = ?, df_recogido_at = '', df_escalado = '', df_aviso_prov = 0 WHERE id = ?")
      .run(a.proveedorId, JSON.stringify(cobro), orderId);
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: `DealShop: guía generada con ${tarifa.transportadora}`, detalle: `Se descontaron ${pesos(cargo)} de tu billetera (producto ${pesos(a.costoProducto)} + envío ${pesos(tarifa.precio)}${servicio ? ` + servicio de guía ${pesos(servicio)}` : ''}).${cod ? ` Al entregarse se te abona lo que pague el cliente.` : ''} El proveedor ${prov.nombre} ya la tiene para imprimir.` });
    registrarLog(storeId, 'info', 'despacho', `${num_} despachado por DealShop (${tarifa.transportadora}${r.guia ? ` · guía ${r.guia}` : ''}).`);
    return { ok: true, guia: r.guia };
  } catch (e) {
    console.error('[bodega-df] despacho', orderId, e);
    return { error: 'No se pudo despachar el pedido. Intenta de nuevo en un momento.' };
  } finally { enCurso.delete(orderId); }
}

/** El cliente confirmó: si es de la bodega, sale de una (no espera el ciclo). true = era de la bodega. */
export function alConfirmarPedido(storeId: string, orderId: string): boolean {
  if (!esPedidoDF(storeId, orderId)) return false;
  db.prepare("UPDATE orders SET df_estado = 'pendiente' WHERE id = ? AND df_estado IN ('', 'no')").run(orderId);
  void despacharDF(storeId, orderId);
  return true;
}

// ── Liquidación ─────────────────────────────────────────────────────────────
export function alCambiarEstadoDF(storeId: string, orderId: string, destino: string, status: string): void {
  const o = db.prepare('SELECT numero, df_estado, df_cobro FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o || txt(o.df_estado) !== 'despachado') return;
  const c = pj<Cobro>(txt(o.df_cobro), { producto: 0, envio: 0, recaudo: 0, cod: false, transportadora: '', proveedorId: '' });
  const a = ajustesDF();
  const num_ = `DF-${txt(o.numero)}`;
  if (destino === 'Entregado') {
    db.transaction(() => {
      if (!db.prepare("UPDATE orders SET df_estado = 'liquidado' WHERE id = ? AND df_estado = 'despachado'").run(orderId).changes) return;
      if (c.cod && c.recaudo > 0) {
        const comision = Math.round(c.recaudo * a.comisionPct / 100) + a.comisionFija;
        moverBilletera(storeId, 'recaudo', c.recaudo - comision, { orderId, detalle: `Entregado: el cliente pagó ${pesos(c.recaudo)}${comision ? ` (comisión de recaudo ${pesos(comision)})` : ''}`, quien: 'DealFlow Envíos', referencia: `recaudo:${orderId}` });
      }
    })();
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: 'DealShop: pedido entregado y liquidado', detalle: c.cod ? 'Lo que pagó el cliente ya está en tu billetera.' : 'Pedido pagado por adelantado: no hay recaudo.' });
    registrarLog(storeId, 'info', 'billetera', `${num_} entregado${c.cod ? `: se abonó lo que pagó el cliente a tu billetera` : ''}.`);
    return;
  }
  if (destino === 'Devuelto') {
    const flete = Math.round(c.envio * a.fleteDevolucionPct / 100);
    db.transaction(() => {
      if (!db.prepare("UPDATE orders SET df_estado = 'liquidado' WHERE id = ? AND df_estado = 'despachado'").run(orderId).changes) return;
      moverBilletera(storeId, 'reintegro', c.producto, { orderId, detalle: 'Devuelto: el producto volvió a la bodega y te reintegramos su costo', quien: 'DealFlow Envíos', referencia: `dev_prod:${orderId}` });
      if (flete > 0) moverBilletera(storeId, 'devolucion', -flete, { orderId, detalle: 'Flete del regreso del paquete a la bodega', quien: 'DealFlow Envíos', referencia: `dev_flete:${orderId}` });
    })();
    trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: c.propio ? 'DealFlow Envíos: pedido devuelto' : 'DealShop: pedido devuelto', detalle: `${c.producto ? `Se reintegró el producto (${pesos(c.producto)})` : 'El paquete vuelve a tu bodega'}${flete ? ` y se cobró el flete de devolución (${pesos(flete)})` : ''}.` });
    registrarLog(storeId, 'warn', 'billetera', `${num_} devuelto${c.producto ? ': reintegro del producto' : ''}${flete ? `${c.producto ? ' y' : ':'} flete de devolución ${pesos(flete)}` : ''}.`);
    return;
  }
  if (status === 'canceled') alCancelarEnvioDF(storeId, orderId, 'Envío cancelado en Skydropx');
}

/** El envío se canceló antes de salir: se devuelve todo lo cobrado (producto + envío). */
export function alCancelarEnvioDF(storeId: string, orderId: string, motivo: string): void {
  const o = db.prepare('SELECT numero, df_estado, df_cobro FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o || txt(o.df_estado) !== 'despachado') return;
  const c = pj<Cobro>(txt(o.df_cobro), { producto: 0, envio: 0, recaudo: 0, cod: false, transportadora: '', proveedorId: '' });
  db.transaction(() => {
    if (!db.prepare("UPDATE orders SET df_estado = 'cancelado', df_detalle = ? WHERE id = ? AND df_estado = 'despachado'").run(motivo.slice(0, 300), orderId).changes) return;
    moverBilletera(storeId, 'reintegro', c.producto + c.envio + (c.servicioTienda || 0), { orderId, detalle: `Envío cancelado: te devolvimos producto, envío y servicio de guía (${motivo})`, quien: 'DealFlow Envíos', referencia: `cancel:${orderId}:${Date.now()}` });
  })();
  trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'DealShop: envío cancelado y cobro devuelto', detalle: motivo });
}

// ── Novedades: el proveedor las escala a la tienda ─────────────────────────
export function escalarNovedadDF(provId: string, orderId: string, nota: string, quien: string): { ok: true } | { error: string } {
  const o = db.prepare('SELECT id, store_id, numero, lead_id, cliente FROM orders WHERE id = ? AND df_proveedor = ?').get(orderId, provId) as Fila | undefined;
  if (!o) return { error: 'Pedido no encontrado.' };
  const n = txt(nota);
  if (n.length < 4) return { error: 'Escribe qué pasa con el pedido.' };
  const storeId = txt(o.store_id); const num_ = `DF-${txt(o.numero)}`;
  db.prepare('UPDATE orders SET df_escalado = ? WHERE id = ?').run(JSON.stringify({ nota: n.slice(0, 500), at: new Date().toISOString(), por: quien.slice(0, 80), respuesta: '', resuelto: '' }), orderId);
  trazar(storeId, orderId, { etapa: 'despacho', nivel: 'warn', titulo: 'El proveedor escaló una novedad', detalle: n });
  registrarLog(storeId, 'warn', 'novedad', `${num_}: el proveedor de la Bodega DealFlow reporta: ${n}`, txt(o.lead_id) || null);
  void import('./push.js').then((p) => p.enviarPush(storeId, 'pedidos', `Novedad en ${num_} ⚠️`, n.slice(0, 120), { url: '/billetera' })).catch(() => {});
  if (txt(o.lead_id)) void import('./pasoHumano.js').then((h) => h.pasarAHumano(storeId, txt(o.lead_id), `Novedad del pedido ${num_} reportada por el proveedor: ${n}`, { titulo: `Novedad en ${num_} ⚠️`, cuerpo: `Habla con ${txt(o.cliente).split(' ')[0] || 'el cliente'} y resuélvela desde el Inbox.` })).catch(() => {});
  return { ok: true };
}
export function resolverEscaladoDF(storeId: string, orderId: string, respuesta: string, quien: string): { ok: true } | { error: string } {
  const o = db.prepare('SELECT df_escalado FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o || !txt(o.df_escalado)) return { error: 'Ese pedido no tiene una novedad escalada.' };
  const e = pj<Fila>(txt(o.df_escalado), {});
  db.prepare('UPDATE orders SET df_escalado = ? WHERE id = ?').run(JSON.stringify({ ...e, respuesta: txt(respuesta).slice(0, 500), resuelto: new Date().toISOString(), resueltoPor: quien.slice(0, 80) }), orderId);
  trazar(storeId, orderId, { etapa: 'despacho', nivel: 'ok', titulo: 'La tienda respondió la novedad del proveedor', detalle: txt(respuesta) });
  return { ok: true };
}
export function marcarRecogidosDF(provId: string, ids: string[]): number {
  let n = 0;
  for (const id of ids.slice(0, 200)) {
    const o = db.prepare("SELECT store_id FROM orders WHERE id = ? AND df_proveedor = ? AND COALESCE(guia,'') != '' AND df_recogido_at = ''").get(id, provId) as Fila | undefined;
    if (!o) continue;
    db.prepare("UPDATE orders SET df_recogido_at = datetime('now') WHERE id = ?").run(id);
    trazar(txt(o.store_id), id, { etapa: 'despacho', nivel: 'info', titulo: 'El proveedor entregó el paquete a la transportadora' });
    n++;
  }
  return n;
}

// ── Pedidos de la bodega (vista de la tienda y del superadmin) ─────────────
const ESTADO_DF: Record<string, string> = {
  pendiente: 'Despachando…', sin_saldo: 'Esperando saldo', sin_activar: 'Falta activar Envíos DealFlow', error: 'No pudo salir', mixto: 'Separar pedido', despachado: 'En camino', liquidado: 'Liquidado', cancelado: 'Envío cancelado',
};
function aPedidoDF(o: Fila) {
  const c = pj<Partial<Cobro>>(txt(o.df_cobro), {});
  const servicio = num(c.servicioTienda) + num(c.servicioProveedor);
  const esc = txt(o.df_escalado) ? pj<Fila>(txt(o.df_escalado), {}) : null;
  return {
    id: txt(o.id), codigo: `DF-${txt(o.numero)}`, tienda: txt(o.tienda), storeId: txt(o.store_id), cliente: txt(o.cliente), ciudad: txt(o.ciudad), total: num(o.total),
    estado: txt(o.estado), dfEstado: txt(o.df_estado), dfEstadoTexto: ESTADO_DF[txt(o.df_estado)] || txt(o.df_estado), detalle: txt(o.df_detalle),
    guia: txt(o.guia), guiaUrl: txt(o.guia_url), transportadora: txt(o.transportadora), estadoTransportadora: txt(o.estado_woo),
    producto: num(c.producto), envio: num(c.envio), recaudo: num(c.recaudo), cod: !!c.cod, servicioTienda: num(c.servicioTienda), servicio, propio: !!c.propio, recogido: txt(o.df_recogido_at), fecha: txt(o.created_at),
    escalado: esc ? { nota: txt(esc.nota), at: txt(esc.at), respuesta: txt(esc.respuesta), resuelto: txt(esc.resuelto) } : null,
  };
}
export function pedidosDFDeTienda(storeId: string) {
  return (db.prepare(`SELECT o.*, s.nombre tienda FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.store_id = ? AND o.df_estado NOT IN ('', 'no')
    ORDER BY o.created_at DESC LIMIT 300`).all(storeId) as Fila[]).map(aPedidoDF);
}
/** Lo que gana DealFlow con las guías de la bodega (tienda + proveedor), en total y en los últimos 30 días. */
export function gananciaGuiasDF() {
  const filas = db.prepare("SELECT df_cobro, created_at > datetime('now','-30 days') reciente FROM orders WHERE df_estado IN ('despachado','liquidado') AND df_cobro != ''").all() as { df_cobro: string; reciente: number }[];
  let total = 0; let mes = 0; let guias = 0; let guiasMes = 0;
  for (const f of filas) { const c = pj<Partial<Cobro>>(f.df_cobro, {}); const v = num(c.servicioTienda) + num(c.servicioProveedor); total += v; guias++; if (f.reciente) { mes += v; guiasMes++; } }
  return { total, mes, guias, guiasMes };
}
export function despachosAdmin() {
  return (db.prepare(`SELECT o.*, s.nombre tienda FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.df_estado NOT IN ('', 'no')
    ORDER BY o.created_at DESC LIMIT 400`).all() as Fila[]).map(aPedidoDF);
}

// ── Estado de la cuenta de Skydropx de DealFlow ─────────────────────────────
export async function estadoCuentaDF(verificar = false) {
  const sk = await import('./skydropxApi.js');
  const c = sk.cfgSkydropxDF();
  const base = (process.env.PUBLIC_APP_URL || 'https://app.dealflow.sbs').replace(/\/+$/, '');
  const token = sk.tokenWebhookDF();
  let verificacion: { ok: boolean; error?: string } | null = null;
  if (c && verificar) { const v = await sk.verificarSkydropx(sk.CUENTA_DF); verificacion = v.ok ? { ok: true } : { ok: false, error: v.error }; }
  return { configurada: !!c, ambiente: c?.ambiente || '', clientId: c ? c.clientId.slice(0, 6) + '…' : '', webhook: token ? `${base}/webhooks/skydropx/${token}` : '', verificacion };
}

// ── Ciclo: despacha los confirmados, reintenta, cancela los cancelados y avisa a proveedores ──
async function ciclo(): Promise<void> {
  // 1) Pedidos confirmados que aún no se han revisado: ¿son de la bodega?
  const nuevos = db.prepare(`SELECT id, store_id FROM orders WHERE df_estado = '' AND (estado = 'Confirmado' OR confirmacion = 'si') AND estado NOT IN ('Cancelado','Entregado','Devuelto')
      AND COALESCE(guia,'') = '' AND COALESCE(skydropx_envio,'') = '' AND COALESCE(effi_remision,'') = '' AND COALESCE(dropi_order_id,'') = ''
      AND created_at > datetime('now','-10 days') LIMIT 200`).all() as { id: string; store_id: string }[];
  for (const f of nuevos) {
    const a = analizarPedidoDF(f.store_id, f.id);
    if (a.tipo === 'no') db.prepare("UPDATE orders SET df_estado = 'no' WHERE id = ?").run(f.id);
    else await despacharDF(f.store_id, f.id);
  }
  // 2) Reintentos: esperando saldo (cada 5 min, por si recargó) o con error (cada 30 min, máx. 6 veces).
  const pend = db.prepare(`SELECT id, store_id FROM orders WHERE estado NOT IN ('Cancelado','Entregado','Devuelto') AND COALESCE(guia,'') = '' AND created_at > datetime('now','-15 days') AND (
      df_estado = 'pendiente'
      OR (df_estado IN ('sin_saldo','sin_activar') AND df_intento_at < datetime('now','-5 minutes'))
      OR (df_estado = 'error' AND df_intentos < 6 AND df_intento_at < datetime('now','-30 minutes'))) LIMIT 60`).all() as { id: string; store_id: string }[];
  for (const f of pend) await despacharDF(f.store_id, f.id);
  // 3) La tienda canceló un pedido ya despachado que el proveedor no ha entregado: se cancela el envío (y se reintegra).
  const cancel = db.prepare(`SELECT id, store_id FROM orders WHERE df_estado = 'despachado' AND estado = 'Cancelado' AND df_recogido_at = '' AND COALESCE(skydropx_envio,'') != '' LIMIT 20`).all() as { id: string; store_id: string }[];
  if (cancel.length) {
    const sk = await import('./skydropxApi.js');
    for (const f of cancel) {
      const r = await sk.cancelarEnvioSkydropx(f.store_id, f.id, 'La tienda canceló el pedido');
      if ('error' in r) { db.prepare("UPDATE orders SET df_recogido_at = 'no-cancelable' WHERE id = ?").run(f.id); trazar(f.store_id, f.id, { etapa: 'despacho', nivel: 'warn', titulo: 'DealShop: no se pudo cancelar el envío', detalle: r.error }); }
    }
  }
  // 4) Aviso por correo a cada proveedor con sus guías nuevas para imprimir (uno por proveedor).
  const nuevasGuias = db.prepare(`SELECT df_proveedor, COUNT(*) n FROM orders WHERE df_estado = 'despachado' AND df_aviso_prov = 0 AND COALESCE(guia,'') != '' AND COALESCE(guia_url,'') != '' GROUP BY df_proveedor`).all() as { df_proveedor: string; n: number }[];
  for (const g of nuevasGuias) {
    const p = proveedorDF(g.df_proveedor);
    db.prepare("UPDATE orders SET df_aviso_prov = 1 WHERE df_proveedor = ? AND df_estado = 'despachado' AND df_aviso_prov = 0 AND COALESCE(guia,'') != '' AND COALESCE(guia_url,'') != ''").run(g.df_proveedor);
    if (!p?.email) continue;
    const c = await import('./correo.js');
    void c.enviarCorreo({
      para: p.email, tipo: 'bodega_df', asunto: `Tienes ${g.n} guía${g.n === 1 ? '' : 's'} nueva${g.n === 1 ? '' : 's'} para despachar`,
      html: c.plantillaCorreo(`${g.n} guía${g.n === 1 ? '' : 's'} para imprimir`, [`Hola ${p.nombre.split(' ')[0]}, la Bodega DealFlow generó ${g.n} guía${g.n === 1 ? '' : 's'} nueva${g.n === 1 ? '' : 's'} con recogida en tu bodega.`, 'Entra al portal, imprímelas, pégalas a los paquetes y márcalos como entregados cuando pase la transportadora.'], { texto: 'Abrir el portal', url: `${c.APP_URL}/proveedores` }),
    }).catch(() => {});
  }
}
let corriendo = false;
export function iniciarBodegaDF(): void {
  const correr = () => { if (corriendo) return; corriendo = true; ciclo().catch((e) => console.error('[bodega-df] ciclo', e)).finally(() => { corriendo = false; }); };
  setTimeout(correr, 20_000).unref?.();
  setInterval(correr, 2 * 60_000).unref?.();
}
