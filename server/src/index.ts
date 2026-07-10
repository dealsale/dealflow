import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { api, webhooks } from './routes.js';
import { seed } from './seed.js';

seed();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' })); // las fotos viajan como data URLs
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5183'], credentials: true }));
}

app.use('/api', api);
app.use('/webhooks', webhooks);
app.get('/salud', (_req, res) => res.json({ ok: true }));

// En producción el mismo servidor sirve el panel (app/dist)
const APP_DIST = process.env.APP_DIST || path.resolve(import.meta.dirname, '../../app/dist');
if (existsSync(APP_DIST)) {
  app.use(express.static(APP_DIST));
  app.get(/^\/(?!api|webhooks).*/, (_req, res) => res.sendFile(path.join(APP_DIST, 'index.html')));
  console.log('[web] Sirviendo el panel desde', APP_DIST);
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`DealFlow API escuchando en :${PORT}`));
