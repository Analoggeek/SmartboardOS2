/* SmartBoardOS service worker — offline first */
const VERSION = `sbos-offline:${self.registration.scope}:1.4.16`;
const CORE = [
  './',
  './index.html',
  './install.html',
  './js/install.js',
  './js/archive.js',
  './js/class-widget.js',
  './js/board-render.js',
  './js/board-checkpoints.js',
  './js/lesson-pack.js',
  './js/apps/lessons.js',
  './js/eraser.js',
  './js/document-import.js',
  './js/pptx-import.js',
  './js/map-data.js',
  './js/map-cities.js',
  './js/map-india.js',
  './js/app-art.js',
  './js/map-states.js',
  './js/map-physical.js',
  './js/chroma.js',
  './js/apps/maps.js',
  './js/apps/recording.js',
  './vendor/fflate/fflate.js',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js',
  './js/utils.js',
  './js/db.js',
  './js/wm.js',
  './js/icons.js',
  './js/apps/whiteboard.js',
  './js/pen.js',
  './js/camera.js',
  './js/camera-layout.js',
  './js/emoji-data.js',
  './js/board-document.js',
  './js/control-layout.js',
  './js/board-templates.js',
  './js/apps/media.js',
  './js/apps/class.js',
  './js/apps/notes.js',
  './js/apps/calculator.js',
  './js/apps/settings.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/jspdf/jspdf.umd.min.js',
  './assets/branding/classroom-hero.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-64.png',
];

const CACHE_PREFIX = `sbos-offline:${self.registration.scope}:`;
const assets = new Set(CORE.map((file) => new URL(file, self.registration.scope).href));

self.addEventListener('install', (event) => {
  // Do not activate a partial cache; an existing install keeps using its last good one.
  event.waitUntil(caches.open(VERSION).then((cache) =>
    cache.addAll(CORE.map((file) => new Request(file, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key !== VERSION && (key.startsWith(CACHE_PREFIX) || /^sbos-v\d+\.\d+\.\d+$/.test(key)))
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = '';
  const home = url.href === self.registration.scope || url.href === new URL('index.html', self.registration.scope).href;
  if (!assets.has(url.href)) return;
  event.respondWith(caches.open(VERSION)
    .then((cache) => cache.match(req.mode === 'navigate' ? home ? self.registration.scope : url.href : req))
    .then((cached) => cached || fetch(req)));
});
