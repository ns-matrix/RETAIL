// sw.js — Service Worker for PWA offline shell caching

const CACHE_NAME = 'workflow-pay-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/assets/styles.css',
  '/js/config.js',
  '/js/supabase-client.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/router.js',
  '/js/realtime.js',
  '/components/modal.js',
  '/components/status-badge.js',
  '/components/progress-bar.js',
  '/components/order-card.js',
  '/js/user/onboarding.js',
  '/js/user/dashboard.js',
  '/js/user/orders.js',
  '/js/user/earnings.js',
  '/js/user/payments.js',
  '/js/user/profile.js',
  '/js/admin/products.js',
  '/js/admin/orders.js',
  '/js/admin/verification-queue.js',
  '/js/admin/payouts.js',
  '/js/admin/users.js',
  '/js/admin/analytics.js',
  '/manifest.json',
];

// Install — cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch — cache-first for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Network-first for Supabase API calls
  if (url.hostname.includes('supabase')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache new static assets
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
