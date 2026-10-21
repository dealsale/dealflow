/**
 * Seguridad del equipo de DealFlow (lo que Shopify pide para dar acceso a datos
 * protegidos de compradores):
 *  - Registro de accesos del equipo: cada vez que un administrador/superadmin (o
 *    alguien entrando a una tienda en modo soporte) consulta o cambia datos, queda
 *    quién, qué, de qué tienda, desde qué IP y cuándo. Se guarda 1 año.
 *  - Contraseñas: el equipo (ADMIN/SUPERADMIN) necesita 12+ caracteres con letras y
 *    números; los comercios, 8+.
 *  - Estado de los secretos del servidor, para el panel del superadmin.
 */
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS accesos_equipo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT '',
  soporte INTEGER NOT NULL DEFAULT 0,  -- 1 = entró a una tienda como soporte
  store_id TEXT NOT NULL DEFAULT '',
  metodo TEXT NOT NULL DEFAULT '',
  ruta TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_accesos_equipo_at ON accesos_equipo(at)');

interface UsuarioReq { id?: string; email?: string; role?: string; storeId?: string | null; imp?: string }
const ultimo = new Map<string, number>(); // no repetir el mismo acceso cada segundo (paneles que se refrescan)

/** Middleware: registra los accesos del equipo (al terminar la petición, ya con el usuario). */
export function registrarAccesosEquipo(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    try {
      const u = (req as { user?: UsuarioReq }).user;
      if (!u?.email) return;
      const equipo = u.role === 'ADMIN' || u.role === 'SUPERADMIN';
      if (!equipo && !u.imp) return;
      // Ruta "plantilla": los ids se reemplazan para agrupar ("/orders/:id/…").
      const ruta = req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d{2,}(?=\/|$)/g, '/:n').slice(0, 160);
      const clave = `${u.email}|${u.storeId || ''}|${req.method}|${ruta}`;
      const ahora = Date.now();
      if (req.method === 'GET' && (ultimo.get(clave) || 0) > ahora - 10 * 60_000) return;
      ultimo.set(clave, ahora);
      if (ultimo.size > 5000) ultimo.clear();
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 60);
      // En soporte, el usuario del token es el dueño de la tienda: se registra quién del equipo entró.
      let quien = u.email;
      if (u.imp) {
        const s = db.prepare('SELECT email FROM users WHERE id = ?').get(u.imp) as { email: string } | undefined;
        quien = s?.email || `equipo:${u.imp}`;
      }
      db.prepare('INSERT INTO accesos_equipo (usuario, rol, soporte, store_id, metodo, ruta, ip) VALUES (?,?,?,?,?,?,?)')
        .run(quien, u.imp ? 'soporte' : String(u.role || ''), u.imp ? 1 : 0, String(u.storeId || ''), req.method, ruta, ip);
    } catch { /* el registro nunca debe tumbar una petición */ }
  });
  next();
}

/** Registro explícito de una acción sensible del equipo (descargar copias, restaurar…). */
export function registrarAccionEquipo(usuario: string, accion: string, storeId = ''): void {
  try { db.prepare("INSERT INTO accesos_equipo (usuario, rol, store_id, metodo, ruta) VALUES (?, 'accion', ?, 'ACCION', ?)").run(usuario, storeId, accion.slice(0, 160)); } catch { /* */ }
}

export function listarAccesos(limite = 200): Record<string, unknown>[] {
  db.prepare("DELETE FROM accesos_equipo WHERE at < datetime('now','-365 days')").run();
  return db.prepare(`SELECT a.usuario, a.rol, a.soporte, a.metodo, a.ruta, a.ip, a.at, COALESCE(s.nombre,'') tienda
    FROM accesos_equipo a LEFT JOIN stores s ON s.id = a.store_id ORDER BY a.id DESC LIMIT ?`).all(limite) as Record<string, unknown>[];
}

/** Valida una contraseña nueva. El equipo necesita más fuerza que un comercio. */
export function claveInvalida(clave: string, equipo: boolean): string {
  const c = String(clave || '');
  if (equipo) {
    if (c.length < 12 || !/[a-zA-Z]/.test(c) || !/\d/.test(c)) return 'La contraseña del equipo debe tener al menos 12 caracteres, con letras y números.';
  } else if (c.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  return '';
}

/** Secretos del servidor que no pueden quedar con su valor por defecto. */
export function estadoSeguridad(): { punto: string; ok: boolean; detalle: string }[] {
  const env = process.env;
  const demo = db.prepare("SELECT 1 FROM users WHERE email = 'karla@lunaaccesorios.co'").get();
  const admins = (db.prepare("SELECT COUNT(*) n FROM users WHERE role IN ('ADMIN','SUPERADMIN')").get() as { n: number }).n;
  return [
    { punto: 'JWT_SECRET', ok: !!env.JWT_SECRET && env.JWT_SECRET !== 'cambia-esto-en-produccion' && env.JWT_SECRET.length >= 32, detalle: 'Firma las sesiones. Debe ser un valor largo y secreto (32+ caracteres).' },
    { punto: 'SUPERADMIN_PASSWORD', ok: !!env.SUPERADMIN_PASSWORD && !claveInvalida(env.SUPERADMIN_PASSWORD, true), detalle: 'Contraseña del superadmin: 12+ caracteres con letras y números (si no está, la contraseña es la de fábrica).' },
    { punto: 'ADMIN_PASSWORD', ok: !!env.ADMIN_PASSWORD && !claveInvalida(env.ADMIN_PASSWORD, true), detalle: 'Contraseña del usuario administrador del equipo (si no está, es la de fábrica).' },
    { punto: 'SKY_PASSWORD', ok: !!env.SKY_PASSWORD && env.SKY_PASSWORD !== 'sky-cambia-esto', detalle: 'Contraseña de la cuenta interna "Sky".' },
    { punto: 'DATA_ENCRYPTION_KEY', ok: /^[0-9a-f]{64}$/i.test(env.DATA_ENCRYPTION_KEY || '') || Buffer.from(env.DATA_ENCRYPTION_KEY || '', 'base64').length === 32, detalle: 'Cifra copias, papelera y tokens de Shopify.' },
    { punto: 'Tienda demo', ok: !demo, detalle: 'La tienda de demostración (karla@lunaaccesorios.co / demo123) no debe existir en producción: pon SEED_DEMO=0.' },
    { punto: 'Usuarios del equipo', ok: admins <= 5, detalle: `${admins} usuario(s) con rol de administrador. Revisa que solo sean personas de tu equipo.` },
  ];
}
