/**
 * Portal de proveedores (proveedores.<dominio> o /proveedores): cada tienda crea accesos
 * para sus proveedores de dropshipping y les asigna uno o varios convenios de Effi. El
 * proveedor entra con su correo y contraseña y ve SOLO los pedidos de esa tienda hechos
 * con sus convenios: estadísticas, datos del pedido, la guía y su recorrido.
 *
 * La sesión del proveedor es otra cookie (df_prov) y otro token: nunca da acceso al
 * panel de la tienda ni a la API de DealFlow.
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

db.exec(`CREATE TABLE IF NOT EXISTS proveedores (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  convenios TEXT NOT NULL DEFAULT '[]',
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT NOT NULL DEFAULT '',
  UNIQUE (store_id, email)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_proveedores_email ON proveedores(email)');

// orders.effi_convenio (lo crea effiApi): convenio con el que salió el pedido a Effi.
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_store_convenio ON orders(store_id, effi_convenio)');

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

// ── Cuentas (las maneja el dueño de la tienda) ───────────────────────────────

export interface Proveedor { id: string; nombre: string; email: string; convenios: string[]; activo: boolean; creado: string; ultimoAcceso: string }
const aProveedor = (r: Fila): Proveedor => ({
  id: txt(r.id), nombre: txt(r.nombre), email: txt(r.email), convenios: pj<string[]>(txt(r.convenios), []),
  activo: Number(r.activo) === 1, creado: txt(r.creado), ultimoAcceso: txt(r.ultimo_acceso),
});
const limpiarConvenios = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)).filter(Boolean))].slice(0, 30) : []);
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export function listarProveedores(storeId: string) {
  const filas = db.prepare('SELECT * FROM proveedores WHERE store_id = ? ORDER BY creado DESC').all(storeId) as Fila[];
  return { proveedores: filas.map(aProveedor), convenios: conveniosConocidos(storeId) };
}

export function crearProveedor(storeId: string, b: Fila): { proveedor: Proveedor } | { error: string } {
  const email = txt(b.email).toLowerCase();
  const nombre = txt(b.nombre).slice(0, 80);
  const password = String(b.password ?? '');
  const convenios = limpiarConvenios(b.convenios);
  if (!nombre) return { error: 'Escribe el nombre del proveedor.' };
  if (!emailValido(email)) return { error: 'Escribe un correo válido.' };
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (!convenios.length) return { error: 'Elige al menos un convenio.' };
  if (db.prepare('SELECT 1 FROM proveedores WHERE store_id = ? AND email = ?').get(storeId, email)) return { error: 'Ya hay un proveedor con ese correo.' };
  const id = randomUUID();
  db.prepare('INSERT INTO proveedores (id, store_id, nombre, email, pass_hash, convenios) VALUES (?,?,?,?,?,?)').run(id, storeId, nombre, email, hashPassword(password), JSON.stringify(convenios));
  return { proveedor: aProveedor(db.prepare('SELECT * FROM proveedores WHERE id = ?').get(id) as Fila) };
}

export function editarProveedor(storeId: string, id: string, b: Fila): { proveedor: Proveedor } | { error: string } {
  const actual = db.prepare('SELECT * FROM proveedores WHERE id = ? AND store_id = ?').get(id, storeId) as Fila | undefined;
  if (!actual) return { error: 'Proveedor no encontrado.' };
  const sets: string[] = []; const vals: unknown[] = [];
  if ('nombre' in b) { const n = txt(b.nombre).slice(0, 80); if (!n) return { error: 'Escribe el nombre del proveedor.' }; sets.push('nombre = ?'); vals.push(n); }
  if ('email' in b) {
    const e = txt(b.email).toLowerCase();
    if (!emailValido(e)) return { error: 'Escribe un correo válido.' };
    if (db.prepare('SELECT 1 FROM proveedores WHERE store_id = ? AND email = ? AND id != ?').get(storeId, e, id)) return { error: 'Ya hay un proveedor con ese correo.' };
    sets.push('email = ?'); vals.push(e);
  }
  if ('password' in b && String(b.password ?? '')) {
    if (String(b.password).length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
    sets.push('pass_hash = ?'); vals.push(hashPassword(String(b.password)));
  }
  if ('convenios' in b) { const c = limpiarConvenios(b.convenios); if (!c.length) return { error: 'Elige al menos un convenio.' }; sets.push('convenios = ?'); vals.push(JSON.stringify(c)); }
  if ('activo' in b) { sets.push('activo = ?'); vals.push(b.activo ? 1 : 0); }
  if (sets.length) db.prepare(`UPDATE proveedores SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return { proveedor: aProveedor(db.prepare('SELECT * FROM proveedores WHERE id = ?').get(id) as Fila) };
}

export function borrarProveedor(storeId: string, id: string): boolean {
  return db.prepare('DELETE FROM proveedores WHERE id = ? AND store_id = ?').run(id, storeId).changes > 0;
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

/** Convenio de cada producto de la tienda: el puesto a mano o el aprendido de Effi. */
function conveniosDeProductos(storeId: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of db.prepare('SELECT product_id, convenio FROM effi_convenio_producto WHERE store_id = ?').all(storeId) as { product_id: string; convenio: string }[]) m.set(r.product_id, r.convenio);
  for (const r of db.prepare("SELECT id, effi_convenio FROM products WHERE store_id = ? AND effi_convenio != ''").all(storeId) as { id: string; effi_convenio: string }[]) m.set(r.id, r.effi_convenio === 'propio' ? '-' : r.effi_convenio);
  return m;
}

const hoyCO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const fechaCO = (utc: string) => { const d = new Date(utc.replace(' ', 'T') + (utc.endsWith('Z') ? '' : 'Z')); return Number.isNaN(d.getTime()) ? utc.slice(0, 10) : new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 10); };

/**
 * Pedidos de la tienda hechos con los convenios del proveedor, en el rango [desde, hasta]
 * (fechas de Colombia). Un pedido que ya salió a Effi usa el convenio con el que salió; uno
 * que aún no sale usa el de sus productos (así el proveedor ve lo que viene en camino).
 */
function pedidosDe(storeId: string, convenios: string[], desde: string, hasta: string) {
  const set = new Set(convenios);
  const desdeUtc = `${desde} 05:00:00`;
  const hastaUtc = new Date(new Date(`${hasta}T05:00:00Z`).getTime() + 86400e3).toISOString().replace('T', ' ').slice(0, 19);
  const filas = db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM novedades n WHERE n.order_id = o.id AND n.abierta = 1) AS novedad_activa
      FROM orders o WHERE o.store_id = ? AND o.created_at >= ? AND o.created_at < ? ORDER BY o.created_at DESC LIMIT 20000`).all(storeId, desdeUtc, hastaUtc) as Fila[];
  if (!filas.length) return [];
  const porProducto = conveniosDeProductos(storeId);
  const itemsDe = db.prepare('SELECT qty, nombre, precio, product_id FROM order_items WHERE order_id = ?');
  const ult = db.prepare('SELECT fecha, estado, observacion FROM guia_historial WHERE order_id = ? ORDER BY fecha DESC LIMIT 1');
  const out = [];
  for (const o of filas) {
    let conv = txt(o.effi_convenio);
    const items = itemsDe.all(txt(o.id)) as Fila[];
    if (!conv) {
      // Aún no sale a Effi: solo cuenta si TODOS sus productos son de convenios del proveedor
      // (un pedido cancelado antes de despacharse no le interesa).
      if (txt(o.estado) === 'Cancelado') continue;
      const cs = new Set(items.map((i) => porProducto.get(txt(i.product_id)) || ''));
      if (cs.size !== 1) continue;
      conv = [...cs][0];
    }
    if (!set.has(conv)) continue;
    const mov = ult.get(txt(o.id)) as Fila | undefined;
    const etapa = etapaDe(o, Number(o.novedad_activa) > 0);
    out.push({
      id: txt(o.id), codigo: 'DF-' + txt(o.numero), numero: Number(o.numero), fecha: txt(o.created_at), dia: fechaCO(txt(o.created_at)),
      cliente: txt(o.cliente), tel: txt(o.tel), ciudad: txt(o.ciudad), departamento: txt(o.departamento), direccion: txt(o.direccion),
      estado: txt(o.estado), estadoTransportadora: txt(o.estado_woo), etapa, convenio: conv,
      guia: txt(o.guia), guiaUrl: txt(o.guia_url), transportadora: txt(o.guia) ? txt(o.transportadora) : '', remision: txt(o.effi_remision),
      total: Number(o.total) || 0,
      items: items.map((i) => ({ qty: Number(i.qty) || 0, nombre: txt(i.nombre) })),
      unidades: items.reduce((a, i) => a + (Number(i.qty) || 0), 0),
      ultimoMovimiento: mov ? { fecha: txt(mov.fecha), estado: txt(mov.estado), observacion: txt(mov.observacion) } : null,
    });
  }
  return out;
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

export function tableroProveedor(storeId: string, convenios: string[], desde: string, hasta: string) {
  const pedidos = pedidosDe(storeId, convenios, desde, hasta);
  const cuenta = (e: Etapa) => pedidos.filter((p) => p.etapa === e).length;
  const entregados = cuenta('entregado'); const devueltos = cuenta('devuelto');
  const activos = pedidos.filter((p) => p.etapa !== 'cancelado');
  // Serie diaria completa (también los días sin pedidos).
  const dias: string[] = [];
  for (let t = new Date(`${desde}T12:00:00Z`).getTime(), fin = new Date(`${hasta}T12:00:00Z`).getTime(); t <= fin && dias.length < 400; t += 86400e3) dias.push(new Date(t).toISOString().slice(0, 10));
  const porDia = new Map(dias.map((d) => [d, 0]));
  for (const p of activos) if (porDia.has(p.dia)) porDia.set(p.dia, (porDia.get(p.dia) || 0) + 1);
  const productos = new Map<string, number>();
  for (const p of activos) for (const i of p.items) productos.set(i.nombre, (productos.get(i.nombre) || 0) + i.qty);
  const ciudades = new Map<string, number>();
  for (const p of activos) { const c = p.ciudad || 'Sin ciudad'; ciudades.set(c, (ciudades.get(c) || 0) + 1); }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, valor]) => ({ label, valor }));
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
    },
    serie: [...porDia].map(([fecha, valor]) => ({ fecha, valor })),
    porEtapa: ETAPAS.map((e) => ({ ...e, valor: cuenta(e.id) })),
    topProductos: top(productos),
    topCiudades: top(ciudades),
    pedidos: pedidos.slice(0, 3000),
  };
}

// Lo que el proveedor ve de la trazabilidad: los hitos del pedido y su envío, sin las
// llamadas a las APIs ni los detalles internos de la tienda.
const ETAPAS_TRAZA = ['pedido', 'estado', 'despacho', 'guia'];

export function pedidoProveedor(storeId: string, convenios: string[], orderId: string) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as Fila | undefined;
  if (!o) return null;
  const dia = fechaCO(txt(o.created_at));
  const p = pedidosDe(storeId, convenios, dia, dia).find((x) => x.id === orderId);
  if (!p) return null;
  const recorrido = (db.prepare('SELECT fecha, estado, estado_global, observacion, foto FROM guia_historial WHERE order_id = ? ORDER BY fecha DESC').all(orderId) as Fila[])
    .map((h) => ({ fecha: txt(h.fecha), estado: txt(h.estado) || txt(h.estado_global), observacion: txt(h.observacion), foto: txt(h.foto) }));
  const novedades = (db.prepare('SELECT nombre, aclaracion, estado_txt, fecha_reporte, abierta, gestion_txt FROM novedades WHERE order_id = ? ORDER BY created_at DESC').all(orderId) as Fila[])
    .map((n) => ({ motivo: txt(n.nombre), detalle: txt(n.aclaracion), estado: txt(n.estado_txt), fecha: txt(n.fecha_reporte), abierta: Number(n.abierta) === 1, gestion: txt(n.gestion_txt) }));
  const traza = (db.prepare(`SELECT etapa, nivel, titulo, created_at FROM order_eventos WHERE order_id = ? AND etapa IN (${ETAPAS_TRAZA.map(() => '?').join(',')}) AND nivel IN ('info','ok') ORDER BY id ASC LIMIT 200`).all(orderId, ...ETAPAS_TRAZA) as Fila[])
    .map((e) => ({ etapa: txt(e.etapa), titulo: txt(e.titulo), fecha: txt(e.created_at) }));
  const info = pj<Fila>(txt(o.effi_guia_info), {});
  const buscar = (patron: RegExp) => { for (const [k, v] of Object.entries(info)) if (patron.test(k) && v != null && typeof v !== 'object' && txt(v)) return txt(v); return ''; };
  return { ...p, entregaEstimada: buscar(/fecha.*(entrega|estimad)|(entrega|estimad).*fecha/i).slice(0, 10), recorrido, novedades, traza };
}

// ── Sesión del proveedor ─────────────────────────────────────────────────────

const SECRETO = (process.env.JWT_SECRET || 'cambia-esto-en-produccion') + ':proveedor';
const COOKIE = 'df_prov';
interface TokenProv { pid: string }

function cuentaDe(req: express.Request): Fila | null {
  const t = req.cookies?.[COOKIE];
  if (!t) return null;
  try {
    const d = jwt.verify(String(t), SECRETO) as TokenProv;
    const r = db.prepare('SELECT p.*, s.nombre AS tienda, s.activa AS tienda_activa FROM proveedores p JOIN stores s ON s.id = p.store_id WHERE p.id = ?').get(d.pid) as Fila | undefined;
    return r && Number(r.activo) === 1 && Number(r.tienda_activa) !== 0 ? r : null;
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
  const cuenta = txt(req.body?.cuenta);
  if (!email || !password) return res.status(400).json({ error: 'Escribe tu correo y tu contraseña.' });
  const filas = (db.prepare('SELECT p.id, p.pass_hash, p.activo, s.nombre AS tienda, s.activa FROM proveedores p JOIN stores s ON s.id = p.store_id WHERE p.email = ?').all(email) as Fila[])
    .filter((r) => verifyPassword(password, txt(r.pass_hash)));
  if (!filas.length) { fallo(ip); return res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); }
  const validas = filas.filter((r) => Number(r.activo) === 1 && Number(r.activa) !== 0);
  if (!validas.length) return res.status(403).json({ error: 'Tu acceso está desactivado. Pídele a la tienda que lo active.' });
  // El mismo correo puede ser proveedor de varias tiendas: se elige con cuál entrar.
  const elegida = cuenta ? validas.find((r) => txt(r.id) === cuenta) : validas.length === 1 ? validas[0] : null;
  if (!elegida) return res.json({ elegir: validas.map((r) => ({ id: txt(r.id), tienda: txt(r.tienda) })) });
  db.prepare("UPDATE proveedores SET ultimo_acceso = datetime('now') WHERE id = ?").run(txt(elegida.id));
  res.cookie(COOKIE, jwt.sign({ pid: txt(elegida.id) } satisfies TokenProv, SECRETO, { expiresIn: '30d' }), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

proveedorApi.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }); res.json({ ok: true }); });

proveedorApi.use((req, res, next) => {
  const c = cuentaDe(req);
  if (!c) return res.status(401).json({ error: 'Inicia sesión.' });
  res.locals.prov = c;
  next();
});

proveedorApi.get('/yo', (_req, res) => {
  const c = res.locals.prov as Fila;
  const nombres = new Map(conveniosConocidos(txt(c.store_id)).map((x) => [x.id, x.nombre]));
  res.json({ nombre: txt(c.nombre), email: txt(c.email), tienda: txt(c.tienda), convenios: pj<string[]>(txt(c.convenios), []).map((id) => ({ id, nombre: nombres.get(id) || `Convenio ${id}` })) });
});

proveedorApi.get('/tablero', (req, res) => {
  const c = res.locals.prov as Fila;
  const hasta = fechaValida(req.query.hasta) || hoyCO();
  let desde = fechaValida(req.query.desde) || new Date(new Date(`${hasta}T12:00:00Z`).getTime() - 29 * 86400e3).toISOString().slice(0, 10);
  if (desde > hasta) desde = hasta;
  // Máximo un año por consulta.
  const minimo = new Date(new Date(`${hasta}T12:00:00Z`).getTime() - 366 * 86400e3).toISOString().slice(0, 10);
  if (desde < minimo) desde = minimo;
  res.json(tableroProveedor(txt(c.store_id), pj<string[]>(txt(c.convenios), []), desde, hasta));
});

proveedorApi.get('/pedido/:id', (req, res) => {
  const c = res.locals.prov as Fila;
  const p = pedidoProveedor(txt(c.store_id), pj<string[]>(txt(c.convenios), []), String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pedido no encontrado.' });
  res.json(p);
});
