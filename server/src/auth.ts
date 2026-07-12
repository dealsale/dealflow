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
  role: 'VENDEDOR' | 'ADMIN';
  storeId: string | null;
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

export function setAuthCookie(res: Response, user: AuthUser) {
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE);
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
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Solo el equipo DealFlow puede entrar aquí.' });
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
