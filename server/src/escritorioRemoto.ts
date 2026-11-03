/**
 * App de escritorio «DealFlow Soporte» (Windows): acceso a TODO el computador de la tienda.
 *
 * - La tienda instala la app y entra con su cuenta. La app abre la página /escritorio de
 *   DealFlow y manda un latido cada pocos segundos: así el equipo ve «Computador de X · en línea».
 * - Alguien del equipo toca «Conectar al computador» → se crea una SESIÓN «pedida».
 * - En el computador sale el permiso («Jose de DealFlow quiere ver y controlar tu computador»).
 *   La tienda permite o no. Sin permiso no hay pantalla ni control.
 * - La conexión es WebRTC (la misma de las llamadas, con el TURN configurado): el servidor solo
 *   pasa las señales. Pantalla del computador → equipo; ratón y teclado del equipo → computador
 *   (por un canal de datos).
 * - La tienda la corta cuando quiera («Detener»). Todo queda en el registro.
 */
import { db, uid, registrarLog } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS equipos_remotos (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL, user_id TEXT NOT NULL DEFAULT '', nombre TEXT NOT NULL DEFAULT '',
  so TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', pantalla TEXT NOT NULL DEFAULT '',
  visto TEXT NOT NULL DEFAULT (datetime('now')), creado TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS sesiones_remotas (
  id TEXT PRIMARY KEY, equipo_id TEXT NOT NULL, store_id TEXT NOT NULL, admin_id TEXT NOT NULL, admin_nombre TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'pedida', motivo TEXT NOT NULL DEFAULT '', creada TEXT NOT NULL DEFAULT (datetime('now')),
  aceptada TEXT, fin TEXT
)`);

const EN_LINEA_MS = 35_000;
type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? '' : String(v));
const fecha = (s: string) => new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).getTime();

// ── Equipos (lado de la tienda) ─────────────────────────────────────────
export function registrarEquipo(storeId: string, userId: string, d: { equipoId?: string; nombre?: string; so?: string; version?: string; pantalla?: string }): { equipoId: string } {
  const id = txt(d.equipoId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  const ya = id ? db.prepare('SELECT id, store_id FROM equipos_remotos WHERE id = ?').get(id) as { id: string; store_id: string } | undefined : undefined;
  const campos = [txt(d.nombre).slice(0, 80) || 'Computador', txt(d.so).slice(0, 60), txt(d.version).slice(0, 20), txt(d.pantalla).slice(0, 30)];
  if (ya && ya.store_id === storeId) {
    db.prepare("UPDATE equipos_remotos SET user_id = ?, nombre = ?, so = ?, version = ?, pantalla = ?, visto = datetime('now') WHERE id = ?").run(userId, ...campos, ya.id);
    return { equipoId: ya.id };
  }
  const nuevo = uid();
  db.prepare('INSERT INTO equipos_remotos (id, store_id, user_id, nombre, so, version, pantalla) VALUES (?,?,?,?,?,?,?)').run(nuevo, storeId, userId, ...campos);
  registrarLog(storeId, 'info', 'soporte', `Se instaló la app «DealFlow Soporte» en el computador «${campos[0]}».`);
  return { equipoId: nuevo };
}

/** Latido de la app: queda «en línea» y recibe el pedido de conexión (si lo hay). */
export function latido(storeId: string, equipoId: string): { ok: boolean; pedido: { sesionId: string; quien: string } | null; activa: { sesionId: string; quien: string; estado: string } | null } {
  const e = db.prepare('SELECT id FROM equipos_remotos WHERE id = ? AND store_id = ?').get(equipoId, storeId);
  if (!e) return { ok: false, pedido: null, activa: null };
  db.prepare("UPDATE equipos_remotos SET visto = datetime('now') WHERE id = ?").run(equipoId);
  vencerSesiones();
  const s = db.prepare("SELECT id, admin_nombre, estado FROM sesiones_remotas WHERE equipo_id = ? AND estado IN ('pedida','aceptada') ORDER BY creada DESC LIMIT 1").get(equipoId) as { id: string; admin_nombre: string; estado: string } | undefined;
  if (!s) return { ok: true, pedido: null, activa: null };
  return s.estado === 'pedida'
    ? { ok: true, pedido: { sesionId: s.id, quien: s.admin_nombre }, activa: null }
    : { ok: true, pedido: null, activa: { sesionId: s.id, quien: s.admin_nombre, estado: s.estado } };
}

export interface EquipoVista { id: string; nombre: string; so: string; version: string; pantalla: string; enLinea: boolean; visto: string; ocupado: string }
/** Equipos de una tienda (para el equipo de DealFlow). */
export function equiposDeTienda(storeId: string): EquipoVista[] {
  vencerSesiones();
  const filas = db.prepare('SELECT * FROM equipos_remotos WHERE store_id = ? ORDER BY visto DESC').all(storeId) as Fila[];
  return filas.map((f) => {
    const ocupada = db.prepare("SELECT admin_nombre FROM sesiones_remotas WHERE equipo_id = ? AND estado IN ('pedida','aceptada') LIMIT 1").get(txt(f.id)) as { admin_nombre: string } | undefined;
    return { id: txt(f.id), nombre: txt(f.nombre), so: txt(f.so), version: txt(f.version), pantalla: txt(f.pantalla), enLinea: Date.now() - fecha(txt(f.visto)) < EN_LINEA_MS, visto: txt(f.visto), ocupado: ocupada?.admin_nombre || '' };
  });
}

// ── Sesiones ────────────────────────────────────────────────────────────
interface Senal { n: number; de: 'admin' | 'equipo'; tipo: string; data: unknown; t: number }
const senales = new Map<string, { n: number; lista: Senal[] }>();

export function pedirSesion(equipoId: string, admin: { id: string; nombre: string; email: string }): { sesionId: string } | { error: string } {
  const e = db.prepare('SELECT * FROM equipos_remotos WHERE id = ?').get(equipoId) as Fila | undefined;
  if (!e) return { error: 'Ese computador no existe.' };
  if (Date.now() - fecha(txt(e.visto)) > EN_LINEA_MS) return { error: 'El computador no está en línea: la app «DealFlow Soporte» tiene que estar abierta.' };
  vencerSesiones();
  const ocupada = db.prepare("SELECT admin_id, admin_nombre FROM sesiones_remotas WHERE equipo_id = ? AND estado IN ('pedida','aceptada') LIMIT 1").get(equipoId) as { admin_id: string; admin_nombre: string } | undefined;
  if (ocupada && ocupada.admin_id !== admin.id) return { error: `${ocupada.admin_nombre} ya está conectado (o pidiendo conexión) a ese computador.` };
  if (ocupada) db.prepare("UPDATE sesiones_remotas SET estado = 'terminada', motivo = 'Se pidió de nuevo', fin = datetime('now') WHERE equipo_id = ? AND estado IN ('pedida','aceptada')").run(equipoId);
  const id = uid();
  db.prepare('INSERT INTO sesiones_remotas (id, equipo_id, store_id, admin_id, admin_nombre) VALUES (?,?,?,?,?)').run(id, equipoId, txt(e.store_id), admin.id, admin.nombre);
  registrarLog(txt(e.store_id), 'info', 'soporte', `${admin.nombre} pidió conectarse al computador «${txt(e.nombre)}» (app DealFlow Soporte).`);
  return { sesionId: id };
}

export function sesion(id: string): Fila | undefined { return db.prepare('SELECT * FROM sesiones_remotas WHERE id = ?').get(id) as Fila | undefined; }

/** ¿Quién es esta persona en la sesión? (la tienda dueña del equipo o el admin que la pidió). */
export function ladoEnSesion(id: string, u: { id: string; role: string; storeId?: string | null }): 'admin' | 'equipo' | null {
  const s = sesion(id);
  if (!s) return null;
  if (txt(s.admin_id) === u.id) return 'admin';
  if (u.storeId && txt(s.store_id) === u.storeId && !['ADMIN', 'SUPERADMIN', 'SOPORTE'].includes(u.role)) return 'equipo';
  return null;
}

export function responder(id: string, storeId: string, acepta: boolean): boolean {
  const s = sesion(id);
  if (!s || txt(s.store_id) !== storeId || txt(s.estado) !== 'pedida') return false;
  db.prepare(`UPDATE sesiones_remotas SET estado = ?, ${acepta ? "aceptada = datetime('now')" : "fin = datetime('now'), motivo = 'La tienda no lo permitió'"} WHERE id = ?`).run(acepta ? 'aceptada' : 'rechazada', id);
  const eq = db.prepare('SELECT nombre FROM equipos_remotos WHERE id = ?').get(txt(s.equipo_id)) as { nombre: string } | undefined;
  registrarLog(storeId, acepta ? 'warn' : 'info', 'soporte', acepta
    ? `Se le dio a ${txt(s.admin_nombre)} el control del computador «${eq?.nombre || ''}» (app DealFlow Soporte).`
    : `No se permitió que ${txt(s.admin_nombre)} controlara el computador «${eq?.nombre || ''}».`);
  return true;
}

export function terminar(id: string, quien: 'admin' | 'equipo', motivo = ''): boolean {
  const s = sesion(id);
  if (!s || !['pedida', 'aceptada'].includes(txt(s.estado))) return false;
  const m = motivo || (quien === 'equipo' ? 'La tienda detuvo la sesión.' : 'El equipo de DealFlow cerró la sesión.');
  db.prepare("UPDATE sesiones_remotas SET estado = 'terminada', fin = datetime('now'), motivo = ? WHERE id = ?").run(m, id);
  enviarSenal(id, quien, 'fin', { motivo: m.slice(0, 160) });
  const dur = txt(s.aceptada) ? Math.round((Date.now() - fecha(txt(s.aceptada))) / 60000) : 0;
  registrarLog(txt(s.store_id), 'info', 'soporte', `Terminó el control remoto de ${txt(s.admin_nombre)}${dur ? ` (${dur} min)` : ''}: ${quien === 'equipo' ? 'lo detuvo la tienda' : 'lo cerró el equipo de DealFlow'}.`);
  return true;
}

export function enviarSenal(id: string, de: 'admin' | 'equipo', tipo: string, data: unknown): void {
  const c = senales.get(id) || { n: 0, lista: [] };
  c.n++; c.lista.push({ n: c.n, de, tipo, data, t: Date.now() });
  if (c.lista.length > 400) c.lista.splice(0, c.lista.length - 400);
  senales.set(id, c);
}
export function leerSenales(id: string, lado: 'admin' | 'equipo', desde: number): { senales: { n: number; tipo: string; data: unknown }[]; ultimo: number; estado: string; quien: string } {
  const c = senales.get(id) || { n: 0, lista: [] };
  const s = sesion(id);
  return {
    senales: c.lista.filter((x) => x.n > desde && x.de !== lado).map((x) => ({ n: x.n, tipo: x.tipo, data: x.data })),
    ultimo: c.n, estado: txt(s?.estado), quien: txt(s?.admin_nombre),
  };
}

/** Pedidas que nadie respondió en 2 min, o aceptadas sin señales en 3 min: se cierran. */
function vencerSesiones() {
  db.prepare("UPDATE sesiones_remotas SET estado = 'terminada', fin = datetime('now'), motivo = 'Nadie respondió' WHERE estado = 'pedida' AND creada < datetime('now','-2 minutes')").run();
  for (const s of db.prepare("SELECT id FROM sesiones_remotas WHERE estado = 'aceptada'").all() as { id: string }[]) {
    const c = senales.get(s.id);
    const ult = c?.lista.at(-1)?.t || 0;
    if (!ult || Date.now() - ult > 3 * 60_000) {
      // Sin señales desde hace rato (pestaña cerrada, servidor reiniciado): se da por terminada.
      const fila = sesion(s.id);
      if (fila && Date.now() - fecha(txt(fila.aceptada) || txt(fila.creada)) > 3 * 60_000) {
        db.prepare("UPDATE sesiones_remotas SET estado = 'terminada', fin = datetime('now'), motivo = 'Se perdió la conexión' WHERE id = ?").run(s.id);
      }
    }
  }
  for (const [k, c] of senales) if (Date.now() - (c.lista.at(-1)?.t || 0) > 30 * 60_000) senales.delete(k);
}
/** Las dos partes mandan un «sigo aquí» mientras dura la sesión (para no vencerla). */
export function sigoAqui(id: string, lado: 'admin' | 'equipo') { enviarSenal(id, lado, 'vivo', null); }
