const CACHE_NAME = 'chronopulse-cache-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Web Push (FCM) — required for iOS Home-Screen PWAs (iOS 16.4+).
//
// iOS WebKit revokes the push subscription if a `push` event arrives without a
// notification being shown, so this handler MUST always call showNotification()
// via event.waitUntil() — even for data-only or empty payloads.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — fall back to whatever text was sent.
    payload = { title: 'SSchedule', body: event.data ? event.data.text() : '' };
  }

  // FCM can deliver the fields at the top level or nested under `data` /
  // `notification`. Normalize defensively so a shape change never silences iOS.
  const data = payload.data || payload;
  const notification = payload.notification || {};
  const title =
    data.title || notification.title || payload.title || 'SSchedule';
  const body =
    data.body || notification.body || payload.body || notification.body || '';
  const url = data.url || payload.url || '/';
  const tag = data.tag || payload.tag || undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      renotify: false,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an already-open window of the app if one exists.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            void client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }
      // Otherwise open the app fresh.
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never serve cached assets in local development — always hit the
  // dev server so source edits (and fresh bundles) show up immediately.
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1'
  ) {
    return;
  }
  if (
    url.pathname.startsWith('/api') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('puter')
  ) {
    return;
  }

  // App-shell navigations (the HTML that bootstraps the bundle) are
  // NETWORK-FIRST so a freshly deployed Vercel build is always used.
  // Serving a cached index.html would keep pointing the app at an OLD
  // hashed JS bundle (e.g. after a deploy), which is exactly the stale
  // "update available" / wrong-version symptom. Hashed assets themselves
  // stay cache-first below (their names change every build, so they are
  // naturally cache-busted).
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        fetch(event.request)
          .then((fresh) => {
            if (fresh && fresh.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, fresh));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') {
            return res;
          }
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('/'));
    })
  );
});
