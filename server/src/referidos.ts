/**
 * Programa de referidos (solo para las cuentas que el superadmin elige).
 *
 *  - Cada cuenta del programa tiene un código y un link: app.dealflow.sbs/?ref=CODIGO.
 *  - Quien se registra por ese link queda en la "red" de esa cuenta. El superadmin también puede
 *    meter a mano cuentas que ya existen (o pasarlas de una red a otra).
 *  - Cada vez que una cuenta de la red paga su activación o una mensualidad (aunque sea con un cupón
 *    gratis), a la cuenta que la refirió se le abona su valor (por defecto $50.000) en la billetera,
 *    de donde lo puede retirar cuando quiera. Los días que se dan a mano no cuentan: solo pagos.
 *  - Es idempotente por la referencia del pago: un mismo pago nunca abona dos veces.
 */
import type { Router } from 'express';
import { db, uid, registrarLog } from './db.js';
import { requireAuth, requireOwner, requireStore, requireSuperAdmin } from './auth.js';
import { moverBilletera } from './bodegaDF.js';

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export const MONTO_REFERIDO = 50000;

// ── Esquema ─────────────────────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS referidos_cuentas (
  store_id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  monto INTEGER NOT NULL DEFAULT ${MONTO_REFERIDO},
  activo INTEGER NOT NULL DEFAULT 1,
  quien TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
// Una cuenta pertenece a una sola red (la de quien la refirió).
db.exec(`CREATE TABLE IF NOT EXISTS referidos_red (
  referida_store_id TEXT PRIMARY KEY,
  referidor_store_id TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'link',
  quien TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_referidos_red_ref ON referidos_red(referidor_store_id)');
db.exec(`CREATE TABLE IF NOT EXISTS referidos_abonos (
  id TEXT PRIMARY KEY,
  referidor_store_id TEXT NOT NULL,
  referida_store_id TEXT NOT NULL,
  referencia_pago TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'mensualidad',
  monto INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_referidos_abonos_ref ON referidos_abonos(referidor_store_id, created_at)');

// ── Utilidades ──────────────────────────────────────────────────────────────
const limpiarCodigo = (s: string) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 20);
const nombreTienda = (storeId: string) => txt((db.prepare('SELECT nombre FROM stores WHERE id = ?').get(storeId) as Fila | undefined)?.nombre);

/** Código libre a partir del nombre de la tienda (MODAPRUEBA, MODAPRUEBA2…). */
function codigoLibre(nombre: string): string {
  const base = limpiarCodigo(nombre).slice(0, 14) || 'DEALFLOW';
  const usado = db.prepare('SELECT 1 FROM referidos_cuentas WHERE codigo = ?');
  if (!usado.get(base)) return base;
  for (let i = 2; i < 1000; i++) if (!usado.get(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now().toString(36).toUpperCase()}`;
}

/** Estado del plan de una cuenta, en palabras simples. */
function estadoPlan(s: Fila): 'sin_activar' | 'activa' | 'vencida' {
  if (!num(s.inicial_pagado)) return 'sin_activar';
  const vence = txt(s.plan_vence).slice(0, 10);
  return vence && vence < hoyCO() ? 'vencida' : 'activa';
}

// ── Cuentas del programa (superadmin) ───────────────────────────────────────
export function activarReferidor(storeId: string, monto: number, quien: string): { ok: true; codigo: string } | { error: string } {
  const nombre = nombreTienda(storeId);
  if (!nombre) return { error: 'No encontramos esa cuenta.' };
  const m = Math.round(num(monto)) || MONTO_REFERIDO;
  if (m < 0) return { error: 'El valor por referido no puede ser negativo.' };
  const ya = db.prepare('SELECT codigo FROM referidos_cuentas WHERE store_id = ?').get(storeId) as Fila | undefined;
  if (ya) {
    db.prepare("UPDATE referidos_cuentas SET activo = 1, monto = ?, quien = ?, updated_at = datetime('now') WHERE store_id = ?").run(m, quien.slice(0, 80), storeId);
    return { ok: true, codigo: txt(ya.codigo) };
  }
  const codigo = codigoLibre(nombre);
  db.prepare('INSERT INTO referidos_cuentas (store_id, codigo, monto, quien) VALUES (?,?,?,?)').run(storeId, codigo, m, quien.slice(0, 80));
  registrarLog(storeId, 'info', 'referidos', `DealFlow activó tu programa de referidos: ganas ${pesos(m)} por cada activación y cada mensualidad de las cuentas que lleguen por tu link.`);
  return { ok: true, codigo };
}

export function editarReferidor(storeId: string, c: { monto?: unknown; activo?: unknown; codigo?: unknown }, quien: string): { ok: true } | { error: string } {
  const r = db.prepare('SELECT * FROM referidos_cuentas WHERE store_id = ?').get(storeId) as Fila | undefined;
  if (!r) return { error: 'Esa cuenta no está en el programa de referidos.' };
  let monto = num(r.monto), activo = num(r.activo), codigo = txt(r.codigo);
  if (c.monto !== undefined) { monto = Math.round(num(c.monto)); if (monto < 0) return { error: 'El valor por referido no puede ser negativo.' }; }
  if (c.activo !== undefined) activo = c.activo ? 1 : 0;
  if (c.codigo !== undefined) {
    const nuevo = limpiarCodigo(txt(c.codigo));
    if (nuevo.length < 3) return { error: 'El código debe tener al menos 3 letras o números (sin espacios ni símbolos).' };
    if (nuevo !== codigo && db.prepare('SELECT 1 FROM referidos_cuentas WHERE codigo = ?').get(nuevo)) return { error: `El código ${nuevo} ya lo tiene otra cuenta.` };
    codigo = nuevo;
  }
  db.prepare("UPDATE referidos_cuentas SET monto = ?, activo = ?, codigo = ?, quien = ?, updated_at = datetime('now') WHERE store_id = ?").run(monto, activo, codigo, quien.slice(0, 80), storeId);
  return { ok: true };
}

/** Cuenta del programa (activa) dueña de un código, o null. */
export function referidorPorCodigo(codigoRaw: string): { storeId: string; nombre: string } | null {
  const codigo = limpiarCodigo(codigoRaw);
  if (!codigo) return null;
  const r = db.prepare('SELECT r.store_id, s.nombre FROM referidos_cuentas r JOIN stores s ON s.id = r.store_id WHERE r.codigo = ? AND r.activo = 1').get(codigo) as Fila | undefined;
  return r ? { storeId: txt(r.store_id), nombre: txt(r.nombre) } : null;
}

// ── Red ─────────────────────────────────────────────────────────────────────
/** Al registrarse por un link: queda en la red de esa cuenta (si el código es válido). */
export function vincularPorLink(referidaId: string, codigo: string): boolean {
  const ref = referidorPorCodigo(codigo);
  if (!ref || ref.storeId === referidaId) return false;
  const r = db.prepare("INSERT OR IGNORE INTO referidos_red (referida_store_id, referidor_store_id, origen, quien) VALUES (?,?, 'link', '')").run(referidaId, ref.storeId);
  if (r.changes) registrarLog(ref.storeId, 'info', 'referidos', `${nombreTienda(referidaId) || 'Una cuenta nueva'} se registró con tu link. Cuando pague su activación te abonamos tu parte.`);
  return r.changes > 0;
}

/** El superadmin mete una cuenta en la red de otra (o la cambia de red). Desde ya, sus próximos pagos abonan. */
export function agregarARed(referidorId: string, referidaId: string, quien: string): { ok: true; movida: string } | { error: string } {
  if (!referidorId || !referidaId) return { error: 'Elige la cuenta que se agrega a la red.' };
  if (referidorId === referidaId) return { error: 'Una cuenta no puede estar en su propia red.' };
  if (!db.prepare('SELECT 1 FROM referidos_cuentas WHERE store_id = ?').get(referidorId)) return { error: 'Esa cuenta no está en el programa de referidos.' };
  const nombre = nombreTienda(referidaId);
  if (!nombre) return { error: 'No encontramos la cuenta que quieres agregar.' };
  const antes = db.prepare('SELECT referidor_store_id FROM referidos_red WHERE referida_store_id = ?').get(referidaId) as Fila | undefined;
  if (antes && txt(antes.referidor_store_id) === referidorId) return { error: `${nombre} ya está en esta red.` };
  db.prepare(`INSERT INTO referidos_red (referida_store_id, referidor_store_id, origen, quien) VALUES (?,?, 'manual', ?)
    ON CONFLICT(referida_store_id) DO UPDATE SET referidor_store_id = excluded.referidor_store_id, origen = 'manual', quien = excluded.quien, created_at = datetime('now')`)
    .run(referidaId, referidorId, quien.slice(0, 80));
  registrarLog(referidorId, 'info', 'referidos', `DealFlow agregó a ${nombre} a tu red de referidos: desde su próxima mensualidad te abonamos tu parte.`);
  return { ok: true, movida: antes ? nombreTienda(txt(antes.referidor_store_id)) : '' };
}

export function quitarDeRed(referidaId: string): { ok: true } | { error: string } {
  const r = db.prepare('DELETE FROM referidos_red WHERE referida_store_id = ?').run(referidaId);
  return r.changes ? { ok: true } : { error: 'Esa cuenta no estaba en ninguna red.' };
}

// ── Abono por cada pago ─────────────────────────────────────────────────────
/**
 * Se llama cuando se aprueba un pago de activación ('inicial') o mensualidad ('renta') de una
 * cuenta. Si la cuenta está en la red de alguien con el programa activo, le abona su parte.
 */
export function abonarPorPago(referidaId: string, referenciaPago: string, tipoPago: string): boolean {
  if (tipoPago !== 'inicial' && tipoPago !== 'renta') return false;
  const red = db.prepare(`SELECT r.referidor_store_id, c.monto FROM referidos_red r JOIN referidos_cuentas c ON c.store_id = r.referidor_store_id
    WHERE r.referida_store_id = ? AND c.activo = 1`).get(referidaId) as Fila | undefined;
  if (!red) return false;
  const referidor = txt(red.referidor_store_id), monto = Math.round(num(red.monto));
  if (!referidor || referidor === referidaId || monto <= 0) return false;
  const tipo = tipoPago === 'inicial' ? 'activacion' : 'mensualidad';
  const nombre = nombreTienda(referidaId) || 'Una cuenta de tu red';
  const que = tipo === 'activacion' ? 'activó su bot' : 'pagó su mensualidad';
  const hecho = db.transaction(() => {
    const r = db.prepare('INSERT OR IGNORE INTO referidos_abonos (id, referidor_store_id, referida_store_id, referencia_pago, tipo, monto) VALUES (?,?,?,?,?,?)')
      .run(uid(), referidor, referidaId, referenciaPago, tipo, monto);
    if (!r.changes) return false;
    moverBilletera(referidor, 'referido', monto, { detalle: `Referido: ${nombre} ${que}`, quien: 'Referidos DealFlow', referencia: `referido:${referenciaPago}` });
    return true;
  })();
  if (!hecho) return false;
  console.log(`[referidos] ${referenciaPago}: ${pesos(monto)} → tienda ${referidor} (${tipo} de ${referidaId})`);
  registrarLog(referidor, 'info', 'referidos', `Ganaste ${pesos(monto)}: ${nombre} ${que}. Ya está en tu billetera.`);
  void import('./push.js').then((p) => p.enviarPush(referidor, 'dueno', `Ganaste ${pesos(monto)} 🎉`, `${nombre} ${que}. Ya está en tu billetera.`, { url: '/billetera' })).catch(() => {});
  return true;
}

// ── Lecturas ────────────────────────────────────────────────────────────────
function redDe(referidorId: string, conCorreo: boolean) {
  const filas = db.prepare(`SELECT r.referida_store_id id, r.origen, r.created_at, s.nombre, s.correo, s.inicial_pagado, s.plan_vence, s.plan,
      (SELECT COALESCE(SUM(a.monto),0) FROM referidos_abonos a WHERE a.referida_store_id = r.referida_store_id AND a.referidor_store_id = r.referidor_store_id) ganado,
      (SELECT COUNT(*) FROM referidos_abonos a WHERE a.referida_store_id = r.referida_store_id AND a.referidor_store_id = r.referidor_store_id) pagos
    FROM referidos_red r JOIN stores s ON s.id = r.referida_store_id WHERE r.referidor_store_id = ? ORDER BY r.created_at DESC`).all(referidorId) as Fila[];
  return filas.map((f) => ({
    id: txt(f.id), nombre: txt(f.nombre), ...(conCorreo ? { correo: txt(f.correo) } : {}), origen: txt(f.origen) as 'link' | 'manual',
    desde: txt(f.created_at), estado: estadoPlan(f), vence: txt(f.plan_vence).slice(0, 10), plan: txt(f.plan), ganado: num(f.ganado), pagos: num(f.pagos),
  }));
}
function totales(referidorId: string) {
  const t = db.prepare(`SELECT COALESCE(SUM(monto),0) total, COALESCE(SUM(CASE WHEN created_at > datetime('now','-30 days') THEN monto ELSE 0 END),0) mes
    FROM referidos_abonos WHERE referidor_store_id = ?`).get(referidorId) as Fila;
  return { ganado: num(t.total), ganadoMes: num(t.mes) };
}

/** Lo que ve la cuenta del programa en su billetera (null si no está en el programa). */
export function resumenTienda(storeId: string) {
  const c = db.prepare('SELECT * FROM referidos_cuentas WHERE store_id = ?').get(storeId) as Fila | undefined;
  if (!c) return null;
  const abonos = (db.prepare(`SELECT a.*, s.nombre FROM referidos_abonos a LEFT JOIN stores s ON s.id = a.referida_store_id WHERE a.referidor_store_id = ? ORDER BY a.created_at DESC LIMIT 50`).all(storeId) as Fila[])
    .map((a) => ({ id: txt(a.id), cuenta: txt(a.nombre), tipo: txt(a.tipo), monto: num(a.monto), fecha: txt(a.created_at) }));
  return { activo: !!num(c.activo), codigo: txt(c.codigo), monto: num(c.monto), ...totales(storeId), red: redDe(storeId, false), abonos };
}

/** Panel del superadmin: todas las cuentas del programa con su red, y la lista de tiendas para elegir. */
export function resumenAdmin() {
  const cuentas = (db.prepare(`SELECT c.*, s.nombre, s.correo FROM referidos_cuentas c JOIN stores s ON s.id = c.store_id ORDER BY c.activo DESC, c.created_at DESC`).all() as Fila[])
    .map((c) => ({ storeId: txt(c.store_id), nombre: txt(c.nombre), correo: txt(c.correo), codigo: txt(c.codigo), monto: num(c.monto), activo: !!num(c.activo), desde: txt(c.created_at), ...totales(txt(c.store_id)), red: redDe(txt(c.store_id), true) }));
  const tiendas = (db.prepare(`SELECT s.id, s.nombre, s.correo, r.referidor_store_id red FROM stores s LEFT JOIN referidos_red r ON r.referida_store_id = s.id ORDER BY s.nombre COLLATE NOCASE`).all() as Fila[])
    .map((t) => ({ id: txt(t.id), nombre: txt(t.nombre), correo: txt(t.correo), red: txt(t.red) }));
  const t = db.prepare(`SELECT COALESCE(SUM(monto),0) total, COALESCE(SUM(CASE WHEN created_at > datetime('now','-30 days') THEN monto ELSE 0 END),0) mes FROM referidos_abonos`).get() as Fila;
  return { cuentas, tiendas, totalAbonado: num(t.total), abonadoMes: num(t.mes), montoPorDefecto: MONTO_REFERIDO };
}

// ── Rutas ───────────────────────────────────────────────────────────────────
export function rutasReferidos(api: Router) {
  const quien = (req: { user?: { nombre?: string; email?: string } }) => req.user?.nombre || req.user?.email || 'superadmin';
  const responder = (res: { status: (n: number) => { json: (b: unknown) => void }; json: (b: unknown) => void }, r: object) => ('error' in r ? res.status(400).json(r) : res.json(r));

  // Público: quién invita (para mostrar «Te invitó …» en el registro).
  api.get('/referidos/codigo/:codigo', (req, res) => {
    const r = referidorPorCodigo(String(req.params.codigo || ''));
    if (!r) return res.status(404).json({ error: 'Ese link de invitación no es válido.' });
    res.json({ nombre: r.nombre });
  });

  // La tienda: su link, su red y lo que ha ganado (solo el dueño, porque es dinero).
  api.get('/referidos', requireAuth, requireStore, requireOwner, (req, res) => {
    res.json({ programa: resumenTienda(req.user!.storeId!) });
  });

  // Superadmin: todo lo del programa (es dinero, así que solo el superadmin).
  api.get('/superadmin/referidos', requireAuth, requireSuperAdmin, (_req, res) => { res.json(resumenAdmin()); });
  api.post('/superadmin/referidos', requireAuth, requireSuperAdmin, (req, res) => {
    responder(res, activarReferidor(String(req.body?.storeId || ''), Number(req.body?.monto) || MONTO_REFERIDO, quien(req)));
  });
  api.patch('/superadmin/referidos/:storeId', requireAuth, requireSuperAdmin, (req, res) => {
    responder(res, editarReferidor(String(req.params.storeId), req.body || {}, quien(req)));
  });
  api.post('/superadmin/referidos/:storeId/red', requireAuth, requireSuperAdmin, (req, res) => {
    responder(res, agregarARed(String(req.params.storeId), String(req.body?.storeId || ''), quien(req)));
  });
  api.delete('/superadmin/referidos/red/:storeId', requireAuth, requireSuperAdmin, (req, res) => {
    responder(res, quitarDeRed(String(req.params.storeId)));
  });
}
