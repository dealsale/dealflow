/**
 * Red de seguridad del servidor: Express 4 no atrapa los errores de las rutas `async`;
 * una consulta fallida dejaba una promesa rechazada y Node cerraba TODO el servidor
 * (todas las tiendas sin servicio hasta que Railway lo reiniciaba). Aquí cada ruta
 * responde 500 con un mensaje claro y el servidor sigue arriba.
 */
import type { Router, Request, Response, NextFunction } from 'express';

type Manejador = (req: Request, res: Response, next: NextFunction) => unknown;

function fallo(e: unknown, req: Request, res: Response, next: NextFunction) {
  console.error(`[ruta] ${req.method} ${req.originalUrl}:`, e);
  if (res.headersSent) return next(e);
  res.status(500).json({ error: 'Algo falló en el servidor con esta acción. Intenta de nuevo; si sigue pasando, escríbenos.' });
}

function envolver(h: unknown): unknown {
  // Los manejadores de error (4 argumentos) y los que no son funciones se dejan igual.
  if (typeof h !== 'function' || h.length > 3) return Array.isArray(h) ? h.map(envolver) : h;
  const fn = h as Manejador;
  return function protegido(req: Request, res: Response, next: NextFunction) {
    try {
      const r = fn(req, res, next) as Promise<unknown> | undefined;
      if (r && typeof (r as Promise<unknown>).then === 'function') (r as Promise<unknown>).catch((e) => fallo(e, req, res, next));
    } catch (e) { fallo(e, req, res, next); }
  };
}

/** Envuelve todas las rutas que se registren desde ahora en este router. */
export function proteger(router: Router): Router {
  const r = router as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all', 'use']) {
    const orig = r[m].bind(router);
    r[m] = (...args: unknown[]) => orig(...args.map((a, i) => (i === 0 && (typeof a === 'string' || a instanceof RegExp || Array.isArray(a) && typeof a[0] === 'string') ? a : envolver(a))));
  }
  return router;
}

/** Último recurso: una promesa rechazada en tareas de fondo se registra, pero no tumba el servidor. */
export function noCaerPorPromesas(): void {
  process.on('unhandledRejection', (e) => { console.error('[servidor] promesa rechazada sin manejar (el servidor sigue):', e); });
}
