/* Hilograma MyD - service worker.
 * Solo guarda en cache los archivos de la propia app para que funcione sin
 * conexion. Nunca guarda imagenes, proyectos ni datos del usuario, y nunca
 * intercepta peticiones a otros origenes. */
'use strict';
const VERSION = 'hmyd-v1.4.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/engine.js', 'js/storage.js', 'js/i18n.js', 'js/flags.js', 'js/ui.js', 'js/examples.js',
  'js/frame.js', 'js/editor.js', 'js/manual.js', 'js/app.js', 'js/worker.js',
  'fonts/Present.ttf', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(ASSETS.map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para recibir actualizaciones) y cache como respaldo sin conexion.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })   // revalida siempre: las actualizaciones llegan de inmediato
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
