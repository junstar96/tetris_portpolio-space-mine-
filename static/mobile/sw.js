const CACHE_NAME = 'tetris-pirate-v2';
const ASSETS = [
  '/mobile/',
  '/mobile/index.html',
  '/mobile/mobile.css',
  '/mobile/mobile.js',
  '/mobile/manifest.json',
  '/mobile/icons/icon-192.png',
  '/mobile/icons/icon-512.png',
  '/bg-scroller.js',
  '/backgrounds/jewel_1.webp',
  '/backgrounds/jewel_2.webp',
  '/backgrounds/jewel_3.webp',
  '/backgrounds/jewel_4.webp',
  '/backgrounds/space_1.webp',
  '/backgrounds/space_2.webp',
  '/backgrounds/space_3.webp',
  '/backgrounds/space_4.webp',
  '/sounds/levelup.mp3',
  '/sounds/tile_put_on.mp3',
  '/sounds/button_click.mp3',
  '/sounds/line_destroy.mp3',
  '/sounds/warning.mp3',
  '/sounds/default_bgm1.mp3',
  '/sounds/default_bgm2.mp3',
  '/sounds/pirate_bgm1.mp3',
  '/sounds/pirate_bgm2.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return resp;
    }).catch(() => cached))
  );
});
