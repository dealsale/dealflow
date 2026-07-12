import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { api, webhooks } from './routes.js';
import { seed } from './seed.js';
import { restoreQrSessions } from './waqr.js';
import { congelarSiFalta } from './plantillas.js';

seed();
congelarSiFalta();
restoreQrSessions();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' })); // fotos/videos viajan como data URLs
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5183'], credentials: true }));
}

app.use('/api', api);
app.use('/webhooks', webhooks);
app.get('/salud', (_req, res) =>
  res.json({
    ok: true,
    // Con el volumen de Railway montado en /srv/data, esto lo confirma.
    datosPersistentes: process.env.RAILWAY_VOLUME_MOUNT_PATH === '/srv/data' || undefined,
  }),
);

// En producción el mismo servidor sirve el panel (app/dist) y, en el dominio
// raíz configurado, la landing. La app vive en app.<dominio> (o en cualquier
// otro host, como la URL de Railway, para no romper nada).
const APP_DIST = process.env.APP_DIST || path.resolve(import.meta.dirname, '../../app/dist');
const LANDING = process.env.LANDING_PATH || path.resolve(APP_DIST, '..', 'landing.html');
const LANDING_HOSTS = (process.env.LANDING_HOSTS || 'zennku.sbs,www.zennku.sbs')
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
