/**
 * Portal de proveedores (app.<dominio>/proveedores): el equipo de DealFlow crea, desde la
 * administración, una cuenta por proveedor y le vincula sus códigos de convenio de Effi.
 * Todos los pedidos de CUALQUIER tienda de DealFlow que salgan con esos convenios le quedan
 * al proveedor: estadísticas, datos del pedido, la guía y su recorrido. Las tiendas
 * (dropshippers) no tienen que hacer nada; es totalmente aparte de su operación.
 *
 * La sesión del proveedor es otra cookie (df_prov) y otro token: nunca da acceso al
 * panel ni a la API de DealFlow.
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { hashPassword, verifyPassword } from './auth.js';
import { conveniosConocidos } from './effiApi.js';
import { estadoLogistico } from './estadosPedido.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const pj = <T>(s: string, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

db.exec(`CREATE TABLE IF NOT EXISTS proveedor_cuentas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  convenios TEXT NOT NULL DEFAULT '[]',
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT NOT NULL DEFAULT ''
)`);
// La primera versión (cuentas por tienda) se pasa a cuentas globales y se retira.
try {
  const viejas = db.prepare('SELECT * FROM proveedores ORDER BY creado').all() as Fila[];
  const ins = db.prepare('INSERT OR IGNORE INTO proveedor_cuentas (id, nombre, email, pass_hash, convenios, activo, creado, ultimo_acceso) VALUES (?,?,?,?,?,?,?,?)');
  for (const r of viejas) ins.run(r.id, r.nombre, r.email, r.pass_hash, r.convenios, r.activo, r.creado, r.ultimo_acceso);
  db.exec('DROP TABLE proveedores');
} catch { /* no existe */ }

// orders.effi_convenio (lo crea effiApi): convenio con el que salió el pedido a Effi.
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_convenio ON orders(effi_convenio, created_at)');

// Una sola vez: los pedidos ya enviados a Effi toman el convenio de sus artículos
// (el que se aprendió de sus remisiones), si todos coinciden en uno.
if (!db.prepare("SELECT 1 FROM app_flags WHERE clave = 'orders_effi_convenio_v1'").get()) {
  try {
    const conv = db.prepare('SELECT convenio FROM effi_convenio_articulo WHERE store_id = ? AND articulo = ?');
    const upd = db.prepare('UPDATE orders SET effi_convenio = ? WHERE id = ?');
    const filas = db.prepare("SELECT id, store_id, effi_doc FROM orders WHERE effi_convenio = '' AND COALESCE(effi_remision,'') != ''").all() as { id: string; store_id: string; effi_doc: string }[];
    db.transaction(() => {
      for (const o of filas) {
        const arts = pj<{ conceptos?: { articulo?: unknown[] } }>(o.effi_doc, {}).conceptos?.articulo;
        if (!Array.isArray(arts) || !arts.length) continue;
        const set = new Set(arts.map((a) => (conv.get(o.store_id, String(a)) as { convenio: string } | undefined)?.convenio || ''));
        if (set.size === 1) { const c = [...set][0]; if (c) upd.run(c, o.id); }
      }
    })();
  } catch (e) { console.error('[proveedores] backfill de convenios:', e); }
  db.prepare("INSERT OR IGNORE INTO app_flags (clave) VALUES ('orders_effi_convenio_v1')").run();
}

// ── Cuentas (las maneja el equipo de DealFlow) ───────────────────────────────

export interface Proveedor { id: string; nombre: string; email: string; convenios: string[]; activo: boolean; creado: string; ultimoAcceso: string; pedidos30: number }
const limpiarConvenios = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)).filter(Boolean))].slice(0, 50) : []);
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const aProveedor = (r: Fila): Proveedor => {
  const convenios = pj<string[]>(txt(r.convenios), []);
  const pedidos30 = convenios.length
    ? (db.prepare(`SELECT COUNT(*) n FROM orders WHERE effi_convenio IN (${convenios.map(() => '?').join(',')}) AND created_at > datetime('now','-30 days')`).get(...convenios) as { n: number }).n
    : 0;
  return { id: txt(r.id), nombre: txt(r.nombre), email: txt(r.email), convenios, activo: Number(r.activo) === 1, creado: txt(r.creado), ultimoAcceso: txt(r.ultimo_acceso), pedidos30 };
};

/** Convenios que DealFlow conoce en todas las tiendas (para sugerirlos al crear la cuenta). */
function conveniosDeTodas(): { id: string; nombre: string; tiendas: string[]; pedidos: number }[] {
  const m = new Map<string, { nombre: string; tiendas: Set<string>; pedidos: number }>();
  const anotar = (id: string, tienda: string, nombre = '') => {
    if (!id || id === '-') return;
    const x = m.get(id) || { nombre: '', tiendas: new Set<string>(), pedidos: 0 };
    if (nombre && !/^Convenio /.test(nombre)) x.nombre = nombre;
    if (tienda) x.tiendas.add(tienda);
    m.set(id, x);
  };
  const tiendas = db.prepare('SELECT id, nombre FROM stores').all() as { id: string; nombre: string }[];
  for (const s of tiendas) { try { for (const c of conveniosConocidos(s.id)) anotar(c.id, s.nombre, c.nombre); } catch { /* sin Effi */ } }
  for (const r of db.prepare("SELECT o.effi_convenio c, s.nombre t, COUNT(*) n FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.effi_convenio NOT IN ('', '-') GROUP BY o.effi_convenio, s.nombre").all() as { c: string; t: string; n: number }[]) {
    anotar(r.c, r.t); m.get(r.c)!.pedidos += r.n;
  }
  return [...m].map(([id, x]) => ({ id, nombre: x.nombre || `Convenio ${id}`, tiendas: [...x.tiendas].sort(), pedidos: x.pedidos })).sort((a, b) => b.pedidos - a.pedidos || a.id.localeCompare(b.id));
}

export function listarProveedores() {
  const filas = db.prepare('SELECT * FROM proveedor_cuentas ORDER BY creado DESC').all() as Fila[];
  return { proveedores: filas.map(aProveedor), convenios: conveniosDeTodas() };
}

export function crearProveedor(b: Fila): { proveedor: Proveedor } | { error: string } {
  const email = txt(b.email).toLowerCase();
  const nombre = txt(b.nombre).slice(0, 80);
  const password = String(b.password ?? '');
  const convenios = limpiarConvenios(b.convenios);
  if (!nombre) return { error: 'Escribe el nombre del proveedor.' };
  if (!emailValido(email)) return { error: 'Escribe un correo válido.' };
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (!convenios.length) return { error: 'Agrega al menos un código de convenio.' };
  if (db.prepare('SELECT 1 FROM proveedor_cuentas WHERE email = ?').get(email)) return { error: 'Ya hay un proveedor con ese correo.' };
  const id = randomUUID();
  db.prepare('INSERT INTO proveedor_cuentas (id, nombre, email, pass_hash, convenios) VALUES (?,?,?,?,?)').run(id, nombre, email, hashPassword(password), JSON.stringify(convenios));
  return { proveedor: aProveedor(db.prepare('SELECT * FROM proveedor_cuentas WHERE id = ?').get(id) as Fila) };
}

export function editarProveedor(id: string, b: Fila): { proveedor: Proveedor } | { error: string } {
  if (!db.prepare('SELECT 1 FROM proveedor_cuentas WHERE id = ?').get(id)) return { error: 'Proveedor no encontrado.' };
  const sets: string[] = []; const vals: unknown[] = [];
  if ('nombre' in b) { const n = txt(b.nombre).slice(0, 80); if (!n) return { error: 'Escribe el nombre del proveedor.' }; sets.push('nombre = ?'); vals.push(n); }
  if ('email' in b) {
    const e = txt(b.email).toLowerCase();
    if (!emailValido(e)) return { error: 'Escribe un correo válido.' };
    if (db.prepare('SELECT 1 FROM proveedor_cuentas WHERE email = ? AND id != ?').get(e, id)) return { error: 'Ya hay un proveedor con ese correo.' };
    sets.push('email = ?'); vals.push(e);
  }
  if ('password' in b && String(b.password ?? '')) {
    if (String(b.password).length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
    sets.push('pass_hash = ?'); vals.push(hashPassword(String(b.password)));
  }
  if ('convenios' in b) { const c = limpiarConvenios(b.convenios); if (!c.length) return { error: 'Agrega al menos un código de convenio.' }; sets.push('convenios = ?'); vals.push(JSON.stringify(c)); }
  if ('activo' in b) { sets.push('activo = ?'); vals.push(b.activo ? 1 : 0); }
  if (sets.length) db.prepare(`UPDATE proveedor_cuentas SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return { proveedor: aProveedor(db.prepare('SELECT * FROM proveedor_cuentas WHERE id = ?').get(id) as Fila) };
}

export function borrarProveedor(id: string): boolean {
  return db.prepare('DELETE FROM proveedor_cuentas WHERE id = ?').run(id).changes > 0;
}

// ── Pedidos del proveedor ────────────────────────────────────────────────────

type Etapa = 'por_despachar' | 'por_recoger' | 'transito' | 'reparto' | 'novedad' | 'entregado' | 'devuelto' | 'cancelado';
function etapaDe(o: Fila, novedad: boolean): Etapa {
  if (txt(o.estado) === 'Cancelado') return 'cancelado';
  if (novedad) return 'novedad';
  let e = txt(o.estado);
  if (!['Guía generada', 'En tránsito', 'En reparto', 'Novedad', 'Entregado', 'Devuelto'].includes(e)) e = estadoLogistico(txt(o.estado_woo), !!txt(o.guia)) || e;
  switch (e) {
    case 'Devuelto': return 'devuelto';
    case 'Entregado': return 'entregado';
    case 'Novedad': return 'novedad';
    case 'En reparto': return 'reparto';
    case 'En tránsito': return 'transito';
    default: return txt(o.guia) ? 'por_recoger' : 'por_despachar';
  }
}

/** Convenio de cada producto de una tienda: el puesto a mano o el aprendido de Effi. */
function conveniosDeProductos(storeId: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of db.prepare('SELECT product_id, convenio FROM effi_convenio_producto WHERE store_id = ?').all(storeId) as { product_id: string; convenio: string }[]) m.set(r.product_id, r.convenio);
  for (const r of db.prepare("SELECT id, effi_convenio FROM products WHERE store_id = ? AND effi_convenio != ''").all(storeId) as { id: string; effi_convenio: string }[]) m.set(r.id, r.effi_convenio === 'propio' ? '-' : r.effi_convenio);
  return m;
}

const hoyCO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const fechaCO = (utc: string) => { const d = new Date(utc.replace(' ', 'T') + (utc.endsWith('Z') ? '' : 'Z')); return Number.isNaN(d.getTime()) ? utc.slice(0, 10) : new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 10); };
const enLista = (n: number) => Array.from({ length: n }, () => '?').join(',');

/**
 * Pedidos de todas las tiendas hechos con los convenios del proveedor, en [desde, hasta]
 * (fechas de Colombia). Un pedido que ya salió a Effi cuenta por el convenio con el que
 * salió; uno que aún no sale, por el de sus productos (así ve lo que viene en camino).
 */
function pedidosDe(convenios: string[], desde: string, hasta: string, soloId = '') {
  if (!convenios.length) return [];
  const set = new Set(convenios);
  const desdeUtc = `${desde} 05:00:00`;
  const hastaUtc = new Date(new Date(`${hasta}T05:00:00Z`).getTime() + 86400e3).toISOString().replace('T', ' ').slice(0, 19);
  const SEL = `SELECT o.*, s.nombre AS tienda, (SELECT COUNT(*) FROM novedades n WHERE n.order_id = o.id AND n.abierta = 1) AS novedad_activa
      FROM orders o JOIN stores s ON s.id = o.store_id`;
  const filtroId = soloId ? ' AND o.id = ?' : '';
  const extra = soloId ? [soloId] : [];
  // 1) Los que ya salieron a Effi con alguno de sus convenios.
  const filas = db.prepare(`${SEL} WHERE o.effi_convenio IN (${enLista(convenios.length)}) AND o.created_at >= ? AND o.created_at < ?${filtroId} LIMIT 20000`)
    .all(...convenios, desdeUtc, hastaUtc, ...extra) as Fila[];
  // 2) Los que aún no salen, en las tiendas que venden productos de esos convenios.
  const tiendas = (db.prepare(`SELECT store_id FROM effi_convenio_producto WHERE convenio IN (${enLista(convenios.length)})
      UNION SELECT store_id FROM products WHERE effi_convenio IN (${enLista(convenios.length)})`).all(...convenios, ...convenios) as { store_id: string }[]).map((r) => r.store_id);
  const itemsDe = db.prepare('SELECT qty, nombre, precio, product_id FROM order_items WHERE order_id = ?');
  const conv = new Map<string, string>();
  for (const sid of tiendas) {
    const porProducto = conveniosDeProductos(sid);
    const pend = db.prepare(`${SEL} WHERE o.store_id = ? AND o.effi_convenio = '' AND o.estado != 'Cancelado' AND o.created_at >= ? AND o.created_at < ?${filtroId} LIMIT 5000`)
      .all(sid, desdeUtc, hastaUtc, ...extra) as Fila[];
    for (const o of pend) {
      // Solo si TODOS sus productos son de un mismo convenio del proveedor.
      const cs = new Set((itemsDe.all(txt(o.id)) as Fila[]).map((i) => porProducto.get(txt(i.product_id)) || ''));
      const c = cs.size === 1 ? [...cs][0] : '';
      if (set.has(c)) { conv.set(txt(o.id), c); filas.push(o); }
    }
  }
  filas.sort((a, b) => txt(b.created_at).localeCompare(txt(a.created_at)));
  const ult = db.prepare('SELECT fecha, estado, observacion FROM guia_historial WHERE order_id = ? ORDER BY fecha DESC LIMIT 1');
  return filas.map((o) => {
    const items = itemsDe.all(txt(o.id)) as Fila[];
    const mov = ult.get(txt(o.id)) as Fila | undefined;
    return {
      id: txt(o.id), codigo: 'DF-' + txt(o.numero), numero: Number(o.numero), fecha: txt(o.created_at), dia: fechaCO(txt(o.created_at)), tienda: txt(o.tienda),
      cliente: txt(o.cliente), tel: txt(o.tel), ciudad: txt(o.ciudad), departamento: txt(o.departamento), direccion: txt(o.direccion),
      estado: txt(o.estado), estadoTransportadora: txt(o.estado_woo), etapa: etapaDe(o, Number(o.novedad_activa) > 0), convenio: conv.get(txt(o.id)) || txt(o.effi_convenio),
      guia: txt(o.guia), guiaUrl: txt(o.guia_url), transportadora: txt(o.guia) ? txt(o.transportadora) : '', remision: txt(o.effi_remision),
      total: Number(o.total) || 0,
      items: items.map((i) => ({ qty: Number(i.qty) || 0, nombre: txt(i.nombre) })),
      unidades: items.reduce((a, i) => a + (Number(i.qty) || 0), 0),
      ultimoMovimiento: mov ? { fecha: txt(mov.fecha), estado: txt(mov.estado), observacion: txt(mov.observacion) } : null,
    };
  });
}

const ETAPAS: { id: Etapa; label: string; color: string }[] = [
  { id: 'por_despachar', label: 'Por despachar', color: '#94A3B8' },
  { id: 'por_recoger', label: 'Guía generada', color: '#6366F1' },
  { id: 'transito', label: 'En tránsito', color: '#0EA5E9' },
  { id: 'reparto', label: 'En reparto', color: '#F59E0B' },
  { id: 'novedad', label: 'Novedad', color: '#EF4444' },
  { id: 'entregado', label: 'Entregado', color: '#10B981' },
  { id: 'devuelto', label: 'Devuelto', color: '#B45309' },
  { id: 'cancelado', label: 'Cancelado', color: '#64748B' },
];

export function tableroProveedor(convenios: string[], desde: string, hasta: string) {
  const pedidos = pedidosDe(convenios, desde, hasta);
  const cuenta = (e: Etapa) => pedidos.filter((p) => p.etapa === e).length;
  const entregados = cuenta('entregado'); const devueltos = cuenta('devuelto');
  const activos = pedidos.filter((p) => p.etapa !== 'cancelado');
  // Serie diaria completa (también los días sin pedidos).
  const dias: string[] = [];
  for (let t = new Date(`${desde}T12:00:00Z`).getTime(), fin = new Date(`${hasta}T12:00:00Z`).getTime(); t <= fin && dias.length < 400; t += 86400e3) dias.push(new Date(t).toISOString().slice(0, 10));
  const porDia = new Map(dias.map((d) => [d, 0]));
  for (const p of activos) if (porDia.has(p.dia)) porDia.set(p.dia, (porDia.get(p.dia) || 0) + 1);
  const contar = (clave: (p: (typeof activos)[number]) => string[], peso: (p: (typeof activos)[number], k: number) => number = () => 1) => {
    const m = new Map<string, number>();
    for (const p of activos) clave(p).forEach((k, i) => m.set(k, (m.get(k) || 0) + peso(p, i)));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, valor]) => ({ label, valor }));
  };
  return {
    desde, hasta, hoy: hoyCO(),
    resumen: {
      pedidos: activos.length,
      unidades: activos.reduce((a, p) => a + p.unidades, 0),
      valor: activos.reduce((a, p) => a + p.total, 0),
      porDespachar: cuenta('por_despachar'),
      enCamino: cuenta('por_recoger') + cuenta('transito') + cuenta('reparto'),
      novedades: cuenta('novedad'),
      entregados, devueltos,
      valorEntregado: pedidos.filter((p) => p.etapa === 'entregado').reduce((a, p) => a + p.total, 0),
      efectividad: entregados + devueltos ? Math.round((entregados / (entregados + devueltos)) * 1000) / 10 : null,
      tiendas: new Set(activos.map((p) => p.tienda)).size,
    },
    serie: [...porDia].map(([fecha, valor]) => ({ fecha, valor })),
    porEtapa: ETAPAS.map((e) => ({ ...e, valor: cuenta(e.id) })),
    topProductos: contar((p) => p.items.map((i) => i.nombre), (p, i) => p.items[i].qty),
    topCiudades: contar((p) => [p.ciudad || 'Sin ciudad']),
    topTiendas: contar((p) => [p.tienda]),
    pedidos: pedidos.slice(0, 3000),
  };
}

// Lo que el proveedor ve de la trazabilidad: los hitos del pedido y su envío, sin las
// llamadas a las APIs ni los detalles internos de la tienda.
const ETAPAS_TRAZA = ['pedido', 'estado', 'despacho', 'guia'];

export function pedidoProveedor(convenios: string[], orderId: string) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Fila | undefined;
  if (!o) return null;
  const dia = fechaCO(txt(o.created_at));
  const p = pedidosDe(convenios, dia, dia, orderId)[0];
  if (!p) return null;
  const recorrido = (db.prepare('SELECT fecha, estado, estado_global, observacion, foto FROM guia_historial WHERE order_id = ? ORDER BY fecha DESC').all(orderId) as Fila[])
    .map((h) => ({ fecha: txt(h.fecha), estado: txt(h.estado) || txt(h.estado_global), observacion: txt(h.observacion), foto: txt(h.foto) }));
  const novedades = (db.prepare('SELECT nombre, aclaracion, estado_txt, fecha_reporte, abierta, gestion_txt FROM novedades WHERE order_id = ? ORDER BY created_at DESC').all(orderId) as Fila[])
    .map((n) => ({ motivo: txt(n.nombre), detalle: txt(n.aclaracion), estado: txt(n.estado_txt), fecha: txt(n.fecha_reporte), abierta: Number(n.abierta) === 1, gestion: txt(n.gestion_txt) }));
  const traza = (db.prepare(`SELECT etapa, nivel, titulo, created_at FROM order_eventos WHERE order_id = ? AND etapa IN (${enLista(ETAPAS_TRAZA.length)}) AND nivel IN ('info','ok') ORDER BY id ASC LIMIT 200`).all(orderId, ...ETAPAS_TRAZA) as Fila[])
    .map((e) => ({ etapa: txt(e.etapa), titulo: txt(e.titulo), fecha: txt(e.created_at) }));
  const info = pj<Fila>(txt(o.effi_guia_info), {});
  const buscar = (patron: RegExp) => { for (const [k, v] of Object.entries(info)) if (patron.test(k) && v != null && typeof v !== 'object' && txt(v)) return txt(v); return ''; };
  return { ...p, entregaEstimada: buscar(/fecha.*(entrega|estimad)|(entrega|estimad).*fecha/i).slice(0, 10), recorrido, novedades, traza };
}

// ── Sesión del proveedor ─────────────────────────────────────────────────────

const SECRETO = (process.env.JWT_SECRET || 'cambia-esto-en-produccion') + ':proveedor';
const COOKIE = 'df_prov';
interface TokenProv { pid: string; adm?: 1 }
const opcionesCookie = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' };

/** Abre la sesión del portal para esa cuenta (también la usa el admin para "ver como proveedor"). */
export function abrirSesionProveedor(res: express.Response, id: string, comoAdmin = false): void {
  res.cookie(COOKIE, jwt.sign({ pid: id, ...(comoAdmin ? { adm: 1 as const } : {}) } satisfies TokenProv, SECRETO, { expiresIn: comoAdmin ? '2h' : '30d' }), {
    ...opcionesCookie, maxAge: (comoAdmin ? 2 * 3600 : 30 * 24 * 3600) * 1000,
  });
}

function cuentaDe(req: express.Request): (Fila & { _adm?: boolean }) | null {
  const t = req.cookies?.[COOKIE];
  if (!t) return null;
  try {
    const d = jwt.verify(String(t), SECRETO) as TokenProv;
    const r = db.prepare('SELECT * FROM proveedor_cuentas WHERE id = ?').get(d.pid) as Fila | undefined;
    // Una cuenta desactivada no entra; el admin sí puede verla.
    return r && (Number(r.activo) === 1 || d.adm) ? { ...r, _adm: !!d.adm } : null;
  } catch { return null; }
}

// Freno a la fuerza bruta: 8 intentos fallidos por IP cada 15 minutos.
const fallos = new Map<string, { n: number; hasta: number }>();
const frenado = (ip: string) => { const f = fallos.get(ip); return !!f && f.hasta > Date.now() && f.n >= 8; };
const fallo = (ip: string) => { const f = fallos.get(ip); const ahora = Date.now(); fallos.set(ip, f && f.hasta > ahora ? { n: f.n + 1, hasta: f.hasta } : { n: 1, hasta: ahora + 15 * 60e3 }); };

const fechaValida = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '');

export const proveedorApi = express.Router();
proveedorApi.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

proveedorApi.post('/login', (req, res) => {
  const ip = String(req.ip || '');
  if (frenado(ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });
  const email = txt(req.body?.email).toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'Escribe tu correo y tu contraseña.' });
  const r = db.prepare('SELECT id, pass_hash, activo FROM proveedor_cuentas WHERE email = ?').get(email) as Fila | undefined;
  if (!r || !verifyPassword(password, txt(r.pass_hash))) { fallo(ip); return res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); }
  if (Number(r.activo) !== 1) return res.status(403).json({ error: 'Tu acceso está desactivado. Escríbele a DealFlow para activarlo.' });
  db.prepare("UPDATE proveedor_cuentas SET ultimo_acceso = datetime('now') WHERE id = ?").run(txt(r.id));
  abrirSesionProveedor(res, txt(r.id));
  res.json({ ok: true });
});

proveedorApi.post('/logout', (_req, res) => { res.clearCookie(COOKIE, opcionesCookie); res.json({ ok: true }); });

proveedorApi.use((req, res, next) => {
  const c = cuentaDe(req);
  if (!c) return res.status(401).json({ error: 'Inicia sesión.' });
  res.locals.prov = c;
  next();
});

proveedorApi.get('/yo', (_req, res) => {
  const c = res.locals.prov as Fila & { _adm?: boolean };
  res.json({ nombre: txt(c.nombre), email: txt(c.email), convenios: pj<string[]>(txt(c.convenios), []), comoAdmin: !!c._adm });
});

proveedorApi.get('/tablero', (req, res) => {
  const c = res.locals.prov as Fila;
  const hasta = fechaValida(req.query.hasta) || hoyCO();
  let desde = fechaValida(req.query.desde) || new Date(new Date(`${hasta}T12:00:00Z`).getTime() - 29 * 86400e3).toISOString().slice(0, 10);
  if (desde > hasta) desde = hasta;
  // Máximo un año por consulta.
  const minimo = new Date(new Date(`${hasta}T12:00:00Z`).getTime() - 366 * 86400e3).toISOString().slice(0, 10);
  if (desde < minimo) desde = minimo;
  res.json(tableroProveedor(pj<string[]>(txt(c.convenios), []), desde, hasta));
});

proveedorApi.get('/pedido/:id', (req, res) => {
  const c = res.locals.prov as Fila;
  const p = pedidoProveedor(pj<string[]>(txt(c.convenios), []), String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pedido no encontrado.' });
  res.json(p);
});
