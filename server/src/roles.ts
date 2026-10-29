/**
 * Roles y permisos del equipo de una tienda.
 *
 * El dueño tiene todo. Cada colaborador tiene un ROL de la tienda (Agente de chat,
 * Despachador, Supervisor… o los que el dueño cree) y el rol dice qué puede hacer.
 * Las secciones de la app y las rutas del servidor se abren según esos permisos;
 * lo sensible (WhatsApp, Asistente, Integraciones, pagos, Equipo) sigue siendo del dueño.
 */
import type { Request, Response, NextFunction } from 'express';
import { db, uid, pj } from './db.js';
import { esDuenoDeTienda, type AuthUser } from './auth.js';

export const PERMISOS = [
  { id: 'chats', nombre: 'Responder chats', desc: 'Entra al Inbox y responde a los clientes.' },
  { id: 'iniciar_conversacion', nombre: 'Iniciar conversaciones', desc: 'Escribe primero a contactos nuevos con plantilla.' },
  { id: 'leads', nombre: 'Ver leads', desc: 'Ve la lista de leads y su embudo.' },
  { id: 'pedidos', nombre: 'Ver pedidos', desc: 'Ve los pedidos y su estado.' },
  { id: 'pedidos_editar', nombre: 'Crear y editar pedidos', desc: 'Crea pedidos, los edita, cambia su estado y los elimina.' },
  { id: 'despachar', nombre: 'Despachar', desc: 'Crea remisiones y guías en Effi o Dropi, y ve Logística.' },
  { id: 'productos', nombre: 'Ver productos', desc: 'Ve el catálogo.' },
  { id: 'productos_editar', nombre: 'Editar productos', desc: 'Crea y edita productos, precios, fotos y variantes.' },
  { id: 'estadisticas', nombre: 'Ver estadísticas', desc: 'Entra al Resumen y a Estadísticas (ventas y números).' },
] as const;
export type Permiso = (typeof PERMISOS)[number]['id'];
const VALIDOS = new Set<string>(PERMISOS.map((p) => p.id));

db.exec(`CREATE TABLE IF NOT EXISTS store_roles (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  permisos TEXT NOT NULL DEFAULT '[]',
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
try { db.exec("ALTER TABLE users ADD COLUMN role_id TEXT NOT NULL DEFAULT ''"); } catch { /* ya existe */ }

/** Lo que podía hacer un agente antes de los roles (se mantiene para quien no tiene rol). */
const PREDETERMINADO: Permiso[] = ['chats', 'leads', 'pedidos', 'pedidos_editar', 'productos', 'productos_editar'];
const INICIALES: { nombre: string; permisos: Permiso[] }[] = [
  { nombre: 'Agente de chat', permisos: ['chats', 'leads', 'productos'] },
  { nombre: 'Vendedor', permisos: ['chats', 'iniciar_conversacion', 'leads', 'pedidos', 'pedidos_editar', 'productos'] },
  { nombre: 'Despachador', permisos: ['pedidos', 'pedidos_editar', 'despachar', 'productos'] },
  { nombre: 'Supervisor', permisos: PERMISOS.map((p) => p.id) },
];

export interface Rol { id: string; nombre: string; permisos: Permiso[]; miembros: number }
const limpiar = (x: unknown): Permiso[] => [...new Set((Array.isArray(x) ? x : []).map(String).filter((p) => VALIDOS.has(p)))] as Permiso[];

/** Roles de la tienda (la primera vez se crean los iniciales). */
export function rolesTienda(storeId: string): Rol[] {
  let filas = db.prepare('SELECT id, nombre, permisos FROM store_roles WHERE store_id = ? ORDER BY orden, created_at').all(storeId) as { id: string; nombre: string; permisos: string }[];
  if (!filas.length) {
    const ins = db.prepare('INSERT INTO store_roles (id, store_id, nombre, permisos, orden) VALUES (?,?,?,?,?)');
    INICIALES.forEach((r, i) => ins.run(uid(), storeId, r.nombre, JSON.stringify(r.permisos), i));
    filas = db.prepare('SELECT id, nombre, permisos FROM store_roles WHERE store_id = ? ORDER BY orden, created_at').all(storeId) as typeof filas;
  }
  const cuenta = db.prepare('SELECT COUNT(*) n FROM users WHERE store_id = ? AND role_id = ?');
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, permisos: limpiar(pj(f.permisos, [])), miembros: (cuenta.get(storeId, f.id) as { n: number }).n }));
}

export function guardarRol(storeId: string, id: string | null, nombre: string, permisos: unknown): Rol | { error: string } {
  const n = String(nombre || '').trim().slice(0, 40);
  if (!n) return { error: 'Ponle un nombre al rol.' };
  const p = limpiar(permisos);
  if (id) {
    const r = db.prepare('UPDATE store_roles SET nombre = ?, permisos = ? WHERE id = ? AND store_id = ?').run(n, JSON.stringify(p), id, storeId);
    if (!r.changes) return { error: 'Rol no encontrado.' };
  } else {
    id = uid();
    const orden = (db.prepare('SELECT COALESCE(MAX(orden),0)+1 o FROM store_roles WHERE store_id = ?').get(storeId) as { o: number }).o;
    db.prepare('INSERT INTO store_roles (id, store_id, nombre, permisos, orden) VALUES (?,?,?,?,?)').run(id, storeId, n, JSON.stringify(p), orden);
  }
  return rolesTienda(storeId).find((r) => r.id === id)!;
}

export function borrarRol(storeId: string, id: string): { ok: true } | { error: string } {
  const n = (db.prepare('SELECT COUNT(*) n FROM users WHERE store_id = ? AND role_id = ?').get(storeId, id) as { n: number }).n;
  if (n) return { error: `Este rol lo tienen ${n} persona${n === 1 ? '' : 's'}: cámbiales el rol primero.` };
  db.prepare('DELETE FROM store_roles WHERE id = ? AND store_id = ?').run(id, storeId);
  return { ok: true };
}

/** Permisos del usuario en su tienda. El dueño (y el equipo DealFlow en soporte) tienen todos. */
export function permisosDe(user?: AuthUser): Permiso[] {
  if (!user?.storeId) return [];
  if (user.imp || user.role !== 'VENDEDOR' || esDuenoDeTienda(user)) return PERMISOS.map((p) => p.id);
  const u = db.prepare('SELECT role_id FROM users WHERE id = ?').get(user.id) as { role_id: string } | undefined;
  if (!u?.role_id) return PREDETERMINADO;
  const r = db.prepare('SELECT permisos FROM store_roles WHERE id = ? AND store_id = ?').get(u.role_id, user.storeId) as { permisos: string } | undefined;
  return r ? limpiar(pj(r.permisos, [])) : PREDETERMINADO;
}

export const tienePermiso = (user: AuthUser | undefined, p: Permiso) => permisosDe(user).includes(p);

/** Middleware: deja pasar al dueño o a quien tenga ese permiso. */
export const requirePermiso = (p: Permiso) => (req: Request, res: Response, next: NextFunction) => {
  if (tienePermiso(req.user, p)) return next();
  const nombre = PERMISOS.find((x) => x.id === p)?.nombre || p;
  res.status(403).json({ error: `Tu rol no tiene permiso para esto (${nombre}). Pídeselo al dueño de la tienda en Equipo.` });
};

export function nombreRol(storeId: string, roleId: string): string {
  if (!roleId) return '';
  return (db.prepare('SELECT nombre FROM store_roles WHERE id = ? AND store_id = ?').get(roleId, storeId) as { nombre: string } | undefined)?.nombre || '';
}
