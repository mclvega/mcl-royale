/*
 * Service worker para jugar sin conexión.
 * Al instalarse guarda en caché TODOS los archivos del build (la lista la escribe el plugin
 * `offline` de Vite en la constante ARCHIVOS), así el juego funciona offline desde la primera visita.
 * Archivos: primero la caché y, en segundo plano, se actualiza desde la red.
 * Páginas: primero la red (para recibir versiones nuevas) y, sin conexión, la copia guardada.
 */
const VERSION = '__VERSION__';
const CACHE = `__NOMBRE__-${VERSION}`;
const ARCHIVOS = __ARCHIVOS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) caches.open(CACHE).then((cache) => cache.put('/index.html', respuesta.clone()));
          return respuesta;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((guardada) => {
      const red = fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copia));
          }
          return respuesta;
        })
        .catch(() => guardada);
      return guardada || red;
    }),
  );
});
