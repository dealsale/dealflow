import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { api, webhooks } from './routes.js';
import { db } from './db.js';
import { seed } from './seed.js';
import { seedPlantillas } from './seedPlantillas.js';
import { seedAcademy, seedAcademyCursoVisual } from './seedAcademy.js';
import { restoreQrSessions } from './waqr.js';
import { congelarSiFalta } from './plantillas.js';
import { iniciarSincronizacionWoo } from './syncWoo.js';
import { iniciarSeguimiento } from './seguimiento.js';
import { montarEffiWoo } from './effiWoo.js';

seed();
seedPlantillas();
seedAcademy();
seedAcademyCursoVisual();
congelarSiFalta();
restoreQrSessions();
iniciarSincronizacionWoo();
iniciarSeguimiento();

const app = express();
app.disable('x-powered-by');
// Guardamos el cuerpo crudo de los webhooks para poder validar su firma HMAC
// (Meta y Wompi firman el JSON tal cual llegó; reserializarlo cambiaría la firma).
app.use(
  express.json({
    limit: '25mb', // fotos/videos viajan como data URLs
    verify: (req, _res, buf) => {
      if ((req.url || '').startsWith('/webhooks/')) (req as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
// Los callbacks de Meta (eliminación de datos, desautorización) llegan como
// application/x-www-form-urlencoded con el campo `signed_request`. El parser de
// JSON no los toca, así que agregamos también el de formularios (coexisten: cada
// uno solo actúa sobre su propio Content-Type).
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5183'], credentials: true }));
}

// Storefront de Effi: si el Host es un subdominio de tienda (<slug>.dealflow.sbs),
// DealFlow responde como una tienda WooCommerce. Debe ir ANTES de /api y del SPA.
montarEffiWoo(app);

app.use('/api', api);
app.use('/webhooks', webhooks);
app.get('/salud', (_req, res) =>
  res.json({
    ok: true,
    // Marca de build para saber qué versión está en vivo (sube al desplegar).
    build: '2026-10-02-shopify-error-detalle',
    // Con el volumen de Railway montado en /srv/data, esto lo confirma.
    datosPersistentes: process.env.RAILWAY_VOLUME_MOUNT_PATH === '/srv/data' || undefined,
    // Diagnóstico de almacenamiento: si dataDir NO apunta al volumen, la base es
    // EFÍMERA y se reinicia en cada deploy (aparecen tiendas demo, no deja entrar).
    almacenamiento: {
      dataDir: process.env.DATA_DIR || './data (EFÍMERO — sin persistencia)',
      volumenMontado: process.env.RAILWAY_VOLUME_MOUNT_PATH || '(sin volumen)',
      persistente: !!process.env.DATA_DIR && !!process.env.RAILWAY_VOLUME_MOUNT_PATH
        && process.env.DATA_DIR.startsWith(process.env.RAILWAY_VOLUME_MOUNT_PATH),
    },
    // Conteo real de la base (sin datos sensibles). Sirve para saber si la base
    // tiene TUS tiendas o arrancó vacía (solo la demo). Si tiendas <= 1, la base
    // que está leyendo la app es nueva/vacía aunque el volumen sea persistente.
    contenido: (() => {
      try {
        return {
          tiendas: (db.prepare('SELECT COUNT(*) n FROM stores').get() as { n: number }).n,
          usuarios: (db.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n,
          pedidos: (db.prepare('SELECT COUNT(*) n FROM orders').get() as { n: number }).n,
        };
      } catch { return { tiendas: -1, usuarios: -1, pedidos: -1 }; }
    })(),
    // Diagnóstico de la conexión en un clic: SOLO dice si las variables están
    // puestas (true/false), nunca su valor. Las tres deben estar en true para
    // que aparezca el botón "Conexión automática".
    metaSignup: {
      appId: !!process.env.META_APP_ID,
      appSecret: !!process.env.META_APP_SECRET,
      configId: !!process.env.META_CONFIG_ID,
      listo: !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID),
      // El App ID y el Config ID NO son secretos (se envían al navegador en cada
      // sesión). Los mostramos para poder identificar cuál configuración usa esta
      // instancia. El App Secret nunca se muestra.
      appIdValor: process.env.META_APP_ID || '',
      configIdValor: process.env.META_CONFIG_ID || '',
      // Config usada para Messenger/Instagram + Ads. Si no hay una específica,
      // cae en la de WhatsApp. Debe traer los permisos de páginas y anuncios.
      messagingConfigId: !!(process.env.META_MESSAGING_CONFIG_ID || process.env.META_CONFIG_ID),
      messagingConfigIdValor: process.env.META_MESSAGING_CONFIG_ID || process.env.META_CONFIG_ID || '',
    },
    verifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
    // Web Push listo cuando ambas llaves VAPID están puestas (nunca muestra su valor).
    webPush: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  }),
);

// En producción el mismo servidor sirve el panel (app/dist) y, en el dominio
// raíz configurado, la landing. La app vive en app.<dominio> (o en cualquier
// otro host, como la URL de Railway, para no romper nada).
const APP_DIST = process.env.APP_DIST || path.resolve(import.meta.dirname, '../../app/dist');
const LANDING = process.env.LANDING_PATH || path.resolve(APP_DIST, '..', 'landing.html');
const LANDING_HOSTS = (process.env.LANDING_HOSTS || 'dealflow.sbs,www.dealflow.sbs,zennku.sbs,www.zennku.sbs')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
if (existsSync(APP_DIST)) {
  app.use(express.static(APP_DIST, { index: false })); // sirve /logo.png y /assets/* en cualquier host
  // "Un solo programa": en el MISMO host conviven la landing (para visitantes) y la
  // app (para quien ya inició sesión). Reglas:
  //  - /academy*  → siempre la app (React) — el portal educativo.
  //  - /entrar, /registro, /login, /panel, /app → siempre la app (login/registro),
  //    aunque no haya sesión: son las puertas de entrada desde la landing.
  //  - resto de rutas → si NO hay cookie de sesión mostramos la landing; si la hay,
  //    la app. Así app.<dominio>/ enseña la landing al visitante y el panel al dueño.
  // LANDING_HOSTS se mantiene como hosts que SIEMPRE muestran landing al visitante
  // (compatibilidad con el dominio raíz), pero ya no es necesario para que funcione.
  const ENTRADAS_APP = /^\/(entrar|registro|login|panel|app)(\/|$)/i;
  app.get(/^\/(?!api|webhooks).*/, (req, res) => {
    const host = (req.hostname || '').toLowerCase();
    const esAcademy = /^\/academy(\/|$)/i.test(req.path);
    if (esAcademy) return res.sendFile(path.join(APP_DIST, 'index.html'));
    const esEntradaApp = ENTRADAS_APP.test(req.path);
    const tieneSesion = !!(req.cookies && req.cookies['df_token']);
    // Muestra la landing a los visitantes (sin sesión) que no van a una puerta de
    // entrada de la app. En hosts de solo-landing, siempre (aunque tengan cookie).
    const mostrarLanding = existsSync(LANDING) && !esEntradaApp &&
      (LANDING_HOSTS.includes(host) || !tieneSesion);
    if (mostrarLanding) return res.sendFile(LANDING);
    res.sendFile(path.join(APP_DIST, 'index.html'));
  });
  console.log('[web] App + landing en el mismo host · landing hosts fijos:', LANDING_HOSTS.join(', '));
}

// Red de seguridad: cualquier error no capturado en una ruta se registra con su
// mensaje y stack REAL (no solo el fragmento de Express) y devuelve JSON limpio,
// para no dejar caer un 500 opaco.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err instanceof Error ? err.stack || err.message : err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Ocurrió un error en el servidor. Intenta de nuevo.' });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`DealFlow API escuchando en :${PORT}`));
