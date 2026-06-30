// Simple Service Worker to enable PWA installation
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Basic fetch handler needed for PWA
  event.respondWith(fetch(event.request));
});
