/* Service worker mínimo de DealFlow: hace la app instalable (PWA).
   No cachea el panel ni la API para que siempre veas datos frescos;
   solo guarda los íconos y el logo para el arranque. */
const CACHE = 'dealflow-v1';
const ESTATICOS = ['/logo.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESTATICOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo respondemos desde caché los estáticos conocidos; todo lo demás va a la red.
  if (e.request.method === 'GET' && ESTATICOS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
