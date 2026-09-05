/**
 * LocalJam - Progressive Web App Service Worker
 * Cache-First App Shell Strategy with explicit audio stream bypass.
 */

const CACHE_NAME = 'localjam-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './version.json',
  './manifest.webmanifest',
  './favicon.svg',
  './public/icons/icon-192.svg',
  './public/icons/icon-512.svg',
  './src/main.js',
  './src/version.js',
  './src/ui/theme.css',
  './src/ui/app.css',
  './src/ui/router.js',
  './src/ui/keyboard.js',
  './src/ui/components/player-bar.js',
  './src/ui/components/app-footer.js',
  './src/ui/components/update-banner.js',
  './src/ui/components/station-modal.js',
  './src/ui/components/eq-modal.js',
  './src/ui/components/visualizer-overlay.js',
  './src/ui/components/queue-drawer.js',
  './src/ui/views/home-view.js',
  './src/ui/views/songs-view.js',
  './src/ui/views/albums-view.js',
  './src/ui/views/artists-view.js',
  './src/ui/views/playlists-view.js',
  './src/ui/views/favorites-view.js',
  './src/ui/views/history-view.js',
  './src/ui/views/radio-view.js',
  './src/ui/views/settings-view.js',
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
  './src/metadata/filename-parser.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    }).then(() => self.skipWaiting())
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
  if (event.data && event.data.type === 'SKIP_WAITING') {
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

  // 2. Network-First strategy for version.json to ensure immediate update detection
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
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
        // Fallback to index.html for navigation requests when offline
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
