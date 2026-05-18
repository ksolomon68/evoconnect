/**
 * Platform Service Worker
 * Strategy:
 *   - Static assets (CSS/JS/images/HTML):  Cache-first, fallback to network
 *   - API calls (/api/*):                  Network-first, fallback to cache
 *   - Navigations (HTML pages):            Network-first, fallback to cached page or offline shell
 *
 * REBRANDING: update AGENCY_STORAGE_PREFIX and AGENCY_APP_NAME below.
 * These are the only agency-specific values in this file.
 */

// ── Agency config (keep in sync with agency.config.js) ───────────────────────
const AGENCY_STORAGE_PREFIX = 'primereach';   // storagePrefix value from agency.config.js
const AGENCY_APP_NAME       = 'PrimeReach'; // name value from agency.config.js
const AGENCY_LOGO_PATH      = '/images/logo.png'; // logoPath from agency.config.js

const CACHE_VERSION = 'v1.2.1';
const STATIC_CACHE  = `${AGENCY_STORAGE_PREFIX}-static-${CACHE_VERSION}`;
const API_CACHE     = `${AGENCY_STORAGE_PREFIX}-api-${CACHE_VERSION}`;
const ALL_CACHES    = [STATIC_CACHE, API_CACHE];

// Core static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/index.html',
  '/login.html',
  '/search-opportunities.html',
  '/opportunities.html',
  '/resources.html',
  '/how-it-works.html',
  '/faq.html',
  '/contact.html',
  '/for-small-businesses.html',
  '/for-prime-contractors.html',
  '/offline.html',
  '/manifest.json',
  '/css/design-system.css',
  '/css/main.css',
  '/css/dashboard-new.css',
  '/css/dashboard-common.css',
  '/css/accessibility-widget.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/main.js',
  '/js/pwa.js',
  '/js/accessibility-widget.js',
  '/js/utils/data-resilience.js',
  '/js/components/navigation.js',
  '/js/components/filter-bar.js',
  '/assets/favicon.ico',
  '/assets/favicon-32.png',
  '/assets/favicon-16.png',
  AGENCY_LOGO_PATH,
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable.png',
  '/assets/apple-touch-icon.png'
];

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Cache individually so one 404 doesn't break the whole install
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(() => {
            // Silently skip missing assets (icons may not exist yet)
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !ALL_CACHES.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API calls → Network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // HTML navigation → Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // Static assets → Cache-first
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Network error', { status: 408 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─── Push Notifications (future-ready) ───────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || AGENCY_APP_NAME, {
      body: data.body || 'You have a new notification.',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: data.tag || AGENCY_STORAGE_PREFIX + '-notification',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
