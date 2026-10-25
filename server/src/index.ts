import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { api, webhooks } from './routes.js';
import { db } from './db.js';
import { paginaTienda } from './tiendaPublica.js';
import { paginaApp, cspIncrustada } from './shopifyApp.js';
import { seed } from './seed.js';
import { seedPlantillas } from './seedPlantillas.js';
import { seedAcademy, seedAcademyCursoVisual, limpiarAcademyRemarketing } from './seedAcademy.js';
import { restoreQrSessions } from './waqr.js';
import { congelarSiFalta } from './plantillas.js';
import { iniciarSincronizacionDespachos } from './despachos.js';
import { iniciarSeguimiento } from './seguimiento.js';

seed();
seedPlantillas();
seedAcademy();
seedAcademyCursoVisual();
limpiarAcademyRemarketing();
congelarSiFalta();
restoreQrSessions();
iniciarSincronizacionDespachos();
import('./metaTemplates.js').then((m) => m.iniciarRevisionPlantillas()).catch(() => {});
import('./effiApi.js').then((m) => m.iniciarAutoVinculoEffi()).catch(() => {});
import('./papelera.js').then((m) => m.iniciarRespaldos()).catch((e) => console.error('[respaldos]', e));
import('./dropiSync.js').then((m) => m.iniciarSyncDropi()).catch((e) => console.error('[dropi-sync]', e));
import('./shopifyPedidos.js').then((m) => m.iniciarEnviosShopify()).catch((e) => console.error('[shopify]', e));
import('./logistica.js').then((m) => m.iniciarGuiasEffi()).catch((e) => console.error('[logistica]', e));
import('./correo.js').then((m) => m.iniciarCorreos()).catch((e) => console.error('[correo]', e));
import('./metaInsights.js').then((m) => m.iniciarInsights()).catch((e) => console.error('[ads]', e));
import('./metaCapi.js').then((m) => m.iniciarCapi()).catch((e) => console.error('[capi]', e));
setTimeout(() => { void import('./media.js').then((m) => m.reconvertirGuias()).catch(() => {}); }, 30_000);
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
    build: 'rutas-f5-proceso-local',
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
const LANDING = process.env.LANDING_PATH || [path.resolve(APP_DIST, '..', 'landing.html'), path.resolve(import.meta.dirname, '../../landing.html')].find((p) => existsSync(p)) || path.resolve(APP_DIST, '..', 'landing.html');
const LANDING_HOSTS = (process.env.LANDING_HOSTS || 'dealflow.sbs,www.dealflow.sbs,zennku.sbs,www.zennku.sbs')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
// Dominios: la landing vive en el dominio raíz (dealflow.sbs) y la app en
// app.<dominio>. Se navega entre ambos en la MISMA pestaña. El comodín
// *.dealflow.sbs ya no se usa para tiendas: cualquier otro subdominio vuelve a
// la landing (salvo academy.<dominio>, el portal educativo).
const raizDe = (host: string) => host.replace(/^(www|app|academy)\./, '');
const esHostLanding = (host: string) => LANDING_HOSTS.includes(host);
const esHostApp = (host: string) => LANDING_HOSTS.some((h) => host === 'app.' + raizDe(h));
const raizDeSub = (host: string) => LANDING_HOSTS.map(raizDe).find((r) => host.endsWith('.' + r)) || '';
// Caché: el HTML NUNCA se guarda (así nadie tiene que hundir Ctrl+Shift+R tras un
// despliegue); los archivos con huella de versión (/assets/*) sí, por un año.
const SIN_CACHE = 'no-cache, no-store, must-revalidate';
const enviarHtml = (res: express.Response, archivo: string) => { res.setHeader('Cache-Control', SIN_CACHE); res.sendFile(archivo); };
if (existsSync(APP_DIST)) {
  app.use(express.static(APP_DIST, {
    index: false, // sirve /logo.png y /assets/* en cualquier host
    setHeaders: (res, ruta) => {
      if (/[\\/]assets[\\/]/.test(ruta)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  // Landing de campañas (dropshipping con IA) para pautar: /dropshipping y /ads.
  // El número de WhatsApp del CTA sale de LANDING_WA (solo dígitos, ej. 573001234567).
  const ADS_CANDIDATOS = [
    process.env.LANDING_ADS_PATH,
    path.resolve(APP_DIST, '..', 'dropshipping.html'),
    path.resolve(import.meta.dirname, '../../dropshipping.html'),
  ].filter(Boolean) as string[];
  const ADS_FILE = ADS_CANDIDATOS.find((p) => existsSync(p));
  let adsHtml = '';
  if (ADS_FILE) {
    const waNum = (process.env.LANDING_WA || '').replace(/\D/g, '');
    const waLink = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent('Hola, quiero más información sobre el dropshipping con IA de DealFlow');
    adsHtml = readFileSync(ADS_FILE, 'utf8').replace(/__WA_LINK__/g, waLink);
  }
  const ENTRADAS_APP = /^\/(entrar|registro|login|panel|app|academy)(\/|$)/i;
  const urlEn = (req: express.Request, host: string) => `${req.protocol === 'http' && !/^localhost/.test(host) ? 'https' : req.protocol}://${host}${req.originalUrl}`;

  app.get(/^\/(?!api|webhooks).*/, (req, res) => {
    const host = (req.hostname || '').toLowerCase();
    const esLanding = existsSync(LANDING);
    const esAds = /^\/(dropshipping|ads|dropshipping-ia)\/?$/i.test(req.path);
    const esInicio = /^\/(inicio|home)\/?$/i.test(req.path);
    // Tutoriales en vivo (página propia, en cualquier host).
    if (/^\/tutoriales\/?$/i.test(req.path)) return enviarHtml(res, path.join(APP_DIST, 'tutoriales.html'));
    // App de Shopify incrustada en el panel de Shopify (solo se deja enmarcar por Shopify).
    if (/^\/shopify\/app\/?$/i.test(req.path)) {
      res.setHeader('Content-Security-Policy', cspIncrustada(String(req.query.shop || '').toLowerCase()));
      res.setHeader('Cache-Control', SIN_CACHE);
      return res.type('html').send(paginaApp());
    }
    // Página pública de cada tienda (la "URL de la tienda" que pide Dropi), en cualquier host.
    const mTienda = req.path.match(/^\/tienda\/([a-z0-9-]{1,60})\/?$/i);
    if (mTienda) {
      const html = paginaTienda(mTienda[1]);
      return html ? res.type('html').send(html) : res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Tienda no encontrada</title><p style="font-family:system-ui;padding:24px">Tienda no encontrada.</p>');
    }

    // 1) Dominio raíz (dealflow.sbs / www): solo la landing. Las puertas de la app
    //    llevan a app.<dominio> en la misma pestaña.
    if (esHostLanding(host)) {
      if (ENTRADAS_APP.test(req.path)) return res.redirect(302, urlEn(req, 'app.' + raizDe(host)));
      if (esAds) return adsHtml ? (res.setHeader('Cache-Control', SIN_CACHE), res.type('html').send(adsHtml)) : res.status(404).send('Landing no disponible.');
      return esLanding ? enviarHtml(res, LANDING) : res.status(404).send('Landing no disponible.');
    }
    // 2) app.<dominio>: siempre la app (sin sesión, el inicio de sesión). El logo
    //    (/inicio) y la landing de campañas viven en el dominio raíz.
    if (esHostApp(host)) {
      if (esInicio) return res.redirect(302, `https://${raizDe(host)}/`);
      if (esAds) return res.redirect(302, `https://${raizDe(host)}${req.path}`);
      return enviarHtml(res, path.join(APP_DIST, 'index.html'));
    }
    // 3) academy.<dominio>: el portal educativo (lo resuelve la app). Cualquier
    //    otro subdominio del comodín vuelve a la landing.
    const raiz = raizDeSub(host);
    if (raiz) {
      if (/^academy\./.test(host) && !esInicio) return enviarHtml(res, path.join(APP_DIST, 'index.html'));
      return res.redirect(302, `https://${raiz}/`);
    }
    // 4) Otros hosts (URL de Railway, localhost): como siempre, la landing para el
    //    visitante sin sesión y la app para quien ya entró.
    if (esAds) return adsHtml ? (res.setHeader('Cache-Control', SIN_CACHE), res.type('html').send(adsHtml)) : res.status(404).send('Landing no disponible.');
    if (esInicio) return esLanding ? enviarHtml(res, LANDING) : res.redirect('/');
    if (/^\/academy(\/|$)/i.test(req.path)) return enviarHtml(res, path.join(APP_DIST, 'index.html'));
    const tieneSesion = !!(req.cookies && req.cookies['df_token']);
    if (esLanding && !ENTRADAS_APP.test(req.path) && !tieneSesion) return enviarHtml(res, LANDING);
    enviarHtml(res, path.join(APP_DIST, 'index.html'));
  });
  console.log('[web] landing en', LANDING_HOSTS.join(', '), '· app en app.<dominio>');
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
