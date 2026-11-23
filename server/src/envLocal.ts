/**
 * Solo en el PC (nunca en producción): carga server/.env.local si existe, para probar con las claves
 * reales de un servicio (p. ej. SEEDANCE_API_KEY) sin escribirlas en la terminal. Ese archivo no se sube a git.
 * Va como primer import de index.ts para que las claves estén antes de que carguen los demás módulos.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'production') {
  const archivo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
  if (existsSync(archivo)) {
    try { process.loadEnvFile(archivo); console.log('[env] claves locales cargadas de server/.env.local'); } catch (e) { console.warn('[env] no se pudo leer server/.env.local:', (e as Error).message); }
  }
}
