/* Couch Board — service worker.
 *
 * Strategy
 *   - install:   precache the app shell (index.html, app.js, style.css, manifest, icons). Tolerant: a missing
 *                optional file never blocks install; the shell core is retried on every navigation anyway.
 *   - navigate:  network-first (3.5 s timeout) -> cached /index.html. The server serves index.html for every
 *                /b/<CODE>, so any board URL opens offline and y-indexeddb fills in the strokes.
 *   - shell:     /app.js /style.css /release.js /index.html -> NETWORK-FIRST (timeout) -> cache, so a refresh
 *                always runs the newest release when online (stale-while-revalidate here pinned old bundles).
 *   - assets:    other same-origin GET -> stale-while-revalidate from the versioned cache.
 *   - never:     /yjs, /signal, /healthz, non-GET, cross-origin (pass straight through, never cached).
 *   - update:    CACHE_VERSION is stamped on every build (build.mjs; prepare-pages.mjs for Pages). A new version
 *                activates immediately (skipWaiting + clients.claim) instead of waiting for every tab to close.
 */

const CACHE_VERSION = 'pages-20261125T005619501Z';
const CACHE = `swhiteboard-shell-${CACHE_VERSION}`;
const CACHE_PREFIX = 'swhiteboard-shell-';

const SHELL = [
  '/index.html',
  '/app.js',
  '/style.css',
  '/release.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/icons/favicon-16.png',
];

const NEVER_CACHE = [/^\/yjs(\/|$)/, /^\/signal(\/|$)/, /^\/healthz$/, /^\/api(\/|$)/];
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const results = await Promise.allSettled(
        SHELL.map(async (url) => {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (!res.ok) throw new Error(`${url} -> ${res.status}`);
          await cache.put(url, res);
        })
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) console.warn('[sw] precache: some files missing', failed.map((f) => String(f.reason)));
      // take over right away: shell files are network-first, so the new worker never serves a mixed old/new app
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch {}
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg === 'SKIP_WAITING' || (msg && msg.type === 'SKIP_WAITING')) self.skipWaiting();
  if (msg && msg.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage(CACHE_VERSION);
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function shellFallback() {
  const cache = await caches.open(CACHE);
  return (
    (await cache.match('/index.html')) ||
    (await caches.match('/index.html', { ignoreSearch: true })) ||
    new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Couch Board</title><body style="background:#0f1020;color:#e2e8f0;font:18px system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
        '<div dir="rtl"><h1>אין חיבור</h1><p>Couch Board עוד לא נשמר במכשיר הזה. התחבר פעם אחת לרשת ונסה שוב.</p>' +
        '<p dir="ltr" style="opacity:.7">Offline — open once while online so the app can be saved.</p></div>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  );
}

async function handleNavigate(event) {
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const res = preload || (await Promise.race([fetch(event.request), timeout(NAV_TIMEOUT_MS)]));
    if (res && res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      // every navigation answer is index.html (SPA) — keep the cached shell fresh
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {}));
    }
    return res;
  } catch {
    return shellFallback();
  }
}

const SHELL_FRESH = new Set(['/app.js', '/style.css', '/release.js', '/index.html', '/manifest.webmanifest']);
async function handleShell(event, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(event.request, { cache: 'no-cache' }), timeout(NAV_TIMEOUT_MS)]);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(cache.put(url.pathname, copy).catch(() => {}));
      return res;
    }
    if (res) return res;
  } catch {}
  return (await cache.match(url.pathname)) || new Response('', { status: 504, statusText: 'offline' });
}

async function handleAsset(event, url) {
  const cache = await caches.open(CACHE);
  const key = url.pathname + url.search;
  const cached = (await cache.match(key)) || (await cache.match(url.pathname));
  const network = fetch(event.request)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  return res || new Response('', { status: 504, statusText: 'offline' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;
  if (req.headers.get('upgrade') === 'websocket') return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }
  // source maps / range requests: don't cache, just pass through
  if (url.pathname.endsWith('.map') || req.headers.has('range')) return;
  if (SHELL_FRESH.has(url.pathname)) { event.respondWith(handleShell(event, url)); return; }
  event.respondWith(handleAsset(event, url));
});
