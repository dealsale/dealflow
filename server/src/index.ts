import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { api, webhooks } from './routes.js';
import { db } from './db.js';
import { seed } from './seed.js';
import { seedPlantillas } from './seedPlantillas.js';
import { seedAcademy } from './seedAcademy.js';
import { restoreQrSessions } from './waqr.js';
import { congelarSiFalta } from './plantillas.js';
import { iniciarSincronizacionWoo } from './syncWoo.js';
import { iniciarSeguimiento } from './seguimiento.js';

seed();
seedPlantillas();
seedAcademy();
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

app.use('/api', api);
app.use('/webhooks', webhooks);
app.get('/salud', (_req, res) =>
  res.json({
    ok: true,
    // Marca de build para saber qué versión está en vivo (sube al desplegar).
    build: '2026-09-25-auditoria-rango',
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
  app.get(/^\/(?!api|webhooks).*/, (req, res) => {
    const host = (req.hostname || '').toLowerCase();
    if (LANDING_HOSTS.includes(host) && existsSync(LANDING)) return res.sendFile(LANDING);
    res.sendFile(path.join(APP_DIST, 'index.html'));
  });
  console.log('[web] Panel desde', APP_DIST, '· landing en', LANDING_HOSTS.join(', '));
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`DealFlow API escuchando en :${PORT}`));
