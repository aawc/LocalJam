/**
 * LocalJam - Progressive Web App Service Worker
 * Cache-First App Shell Strategy with explicit audio stream bypass.
 */

const CACHE_NAME = 'localjam-v2026.09.047';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './404.html',
  './v2/index.html',
  './version.json',
  './manifest.webmanifest',
  './favicon.svg',
  './public/icons/icon-192.svg',
  './public/icons/icon-512.svg',
  './src/main.js',
  './src/version.js',
  './src/ui/theme.css',
  './src/ui/app.css',
  './src/ui/gestures.js',
  './src/ui/browse-model.js',
  './src/ui/library-source.js',
  './src/ui/stage.js',
  './src/ui/layers.js',
  './src/ui/keyboard.js',
  './src/ui/components/browse-sheet.js',
  './src/ui/components/overflow-menu.js',
  './src/ui/components/toast.js',
  './src/ui/components/eq-modal.js',
  './src/ui/components/release-notes-modal.js',
  './src/ui/components/feedback-modal.js',
  './src/ui/components/update-banner.js',
  './src/player/audio-engine.js',
  './src/player/equalizer.js',
  './src/player/queue.js',
  './src/radio/stations.js',
  './src/visualizer/visualizer.js',
  './src/storage/db.js',
  './src/storage/reconciler.js',
  './src/storage/session-registry.js',
  './src/metadata/index.js',
  './src/metadata/id3v2.js',
  './src/metadata/flac.js',
  './src/metadata/m4a.js',
  './src/metadata/filename-parser.js',
  './src/utils/sanitize.js',
  './src/utils/diagnostics.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (
    event.data &&
    (event.data.type === 'SKIP_WAITING' ||
      event.data === 'SKIP_WAITING' ||
      event.data.action === 'skipWaiting')
  ) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only process GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 2. Network-First strategy for version metadata, version.js, and sw.js to ensure immediate update detection
  if (
    url.pathname.endsWith('version.json') ||
    url.pathname.endsWith('version.js') ||
    url.pathname.endsWith('sw.js')
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' }).catch(() => caches.match(request))
    );
    return;
  }

  // 3. Bypass live radio streams, HTTP audio, range requests, and blob URLs
  if (
    request.destination === 'audio' ||
    request.headers.has('range') ||
    url.protocol === 'blob:' ||
    url.protocol === 'data:' ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.flac') ||
    url.pathname.endsWith('.m4a') ||
    url.pathname.endsWith('.aac') ||
    url.pathname.endsWith('.ogg') ||
    url.hostname.includes('radioparadise.com') ||
    url.hostname.includes('somafm.com') ||
    url.hostname.includes('streamguys1.com') ||
    url.hostname.includes('streamguys.com') ||
    url.hostname.includes('bbci.co.uk') ||
    url.hostname.includes('bbcmedia.co.uk') ||
    url.hostname.includes('wnyc.org') ||
    url.hostname.includes('wostreaming.net')
  ) {
    return;
  }

  // 4. Cache-First with Network Fallback for App Shell Assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback to app shell for navigation requests when offline
        if (request.mode === 'navigate') {
          if (url.pathname.includes('/v2')) {
            return caches.match('./v2/index.html');
          }
          return caches.match('./index.html');
        }
      });
    })
  );
});
