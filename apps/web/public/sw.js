/* KindaMoving service worker: makes previously visited app pages and static assets
 * available offline. API responses are never cached here (they are private and
 * no-store); offline data comes from IndexedDB (saved routes, drafts, outbox).
 * Caches are deleted on logout/account deletion via the 'purge' message. */
const VERSION = 'km-v1';
const PAGES = VERSION + '-pages';
const STATIC = VERSION + '-static';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (e) => {
  if (e.data === 'purge')
    e.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    url.origin !== location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  )
    return;
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches
        .open(STATIC)
        .then((c) =>
          c
            .match(e.request)
            .then(
              (hit) =>
                hit ||
                fetch(e.request).then(
                  (r) => (r.ok && c.put(e.request, r.clone()), r),
                ),
            ),
        ),
    );
    return;
  }
  if (e.request.mode === 'navigate' && url.pathname.startsWith('/app')) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok && !r.redirected)
            caches.open(PAGES).then((c) => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() =>
          caches
            .match(e.request)
            .then(
              (hit) =>
                hit ||
                caches.match('/app') ||
                new Response(
                  '<h1>You are offline</h1><p>Open a page you visited before, or reconnect.</p>',
                  { headers: { 'Content-Type': 'text/html' } },
                ),
            ),
        ),
    );
  }
});
