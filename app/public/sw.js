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

// Web Push: muestra la notificación aunque la app esté cerrada.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { titulo: 'DealFlow', cuerpo: e.data ? e.data.text() : '' }; }
  const titulo = d.titulo || 'DealFlow';
  const opciones = {
    body: d.cuerpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tipo || 'dealflow',
    data: (d.data && d.data.url) ? d.data : { url: '/' },
  };
  e.waitUntil(self.registration.showNotification(titulo, opciones));
});

// Al tocar la notificación, enfoca la app (o la abre).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cli) => {
      for (const c of cli) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    }),
  );
});
