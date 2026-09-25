import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esto-en-produccion';
const COOKIE = 'df_token';

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  role: 'VENDEDOR' | 'ADMIN' | 'SUPERADMIN';
  storeId: string | null;
  /** Si el admin está "entrando" a una tienda (impersonando), aquí va su id para poder volver. */
  imp?: string;
  /** Foto de perfil (URL), opcional. */
  foto?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const hashPassword = (p: string) => bcrypt.hashSync(p, 10);
export const verifyPassword = (p: string, hash: string) => bcrypt.compareSync(p, hash);

/**
 * Dominio de la cookie de sesión. Para que las MISMAS credenciales sirvan en
 * todos los subdominios (ad.dealflow.sbs, academy.dealflow.sbs, …) la cookie se
 * emite en el dominio padre `.dealflow.sbs`. En la URL de Railway o en localhost
 * queda host-only (undefined), para no romper nada. Se puede forzar con COOKIE_DOMAIN.
 */
function cookieDomain(host?: string): string | undefined {
  // Solo se emite en un dominio padre si se pide EXPRESAMENTE con COOKIE_DOMAIN
  // (p. ej. ".dealflow.sbs" para compartir sesión con academy.*). Por defecto la
  // cookie es host-only (comportamiento de siempre), para no romper el login.
  const explicit = process.env.COOKIE_DOMAIN;
  if (!explicit) return undefined;
  const h = String(host || '').toLowerCase().split(':')[0];
  const base = explicit.replace(/^\./, '');
  // Solo aplica el dominio si el host actual pertenece a él (si no, host-only).
  return h === base || h.endsWith('.' + base) ? explicit : undefined;
}

export function setAuthCookie(res: Response, user: AuthUser, host?: string) {
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000,
    domain: cookieDomain(host),
  });
}

export function clearAuthCookie(res: Response, host?: string) {
  res.clearCookie(COOKIE, { domain: cookieDomain(host) });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return res.status(401).json({ error: 'Tu sesión venció. Vuelve a iniciar sesión.' });
  }
  if (req.user.role === 'VENDEDOR') {
    const store = db.prepare('SELECT activa FROM stores WHERE id = ?').get(req.user.storeId) as { activa: number } | undefined;
    if (!store) return res.status(401).json({ error: 'Tu cuenta ya no existe.' });
    if (!store.activa) return res.status(403).json({ error: 'Tu cuenta está desactivada. Escríbenos para reactivarla.' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // El superadmin también puede usar todo lo del admin.
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPERADMIN') return res.status(403).json({ error: 'Solo el equipo DealFlow puede entrar aquí.' });
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'SUPERADMIN') return res.status(403).json({ error: 'Solo el superadmin puede entrar aquí.' });
  next();
}

export function requireStore(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.storeId) return res.status(403).json({ error: 'Tu usuario no tiene tienda asignada.' });
  next();
}

/** El dueño de la tienda es el usuario cuyo correo coincide con el de la tienda. */
export function esDuenoDeTienda(user?: AuthUser): boolean {
  if (!user?.storeId || user.role !== 'VENDEDOR') return false;
  const s = db.prepare('SELECT correo FROM stores WHERE id = ?').get(user.storeId) as { correo: string } | undefined;
  return !!s && s.correo === user.email;
}

/** Solo el dueño de la tienda (no los agentes) puede pasar. */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!esDuenoDeTienda(req.user)) return res.status(403).json({ error: 'Solo el dueño de la tienda puede hacer esto.' });
  next();
}
