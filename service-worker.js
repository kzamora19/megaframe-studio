/* MegaFrame Studio PWA — application shell only. Never cache API calls, auth or credentials. */
const VERSION = 'mf-pwa-v12-template-previews-20261118';
const CACHE = 'megaframe-shell-' + VERSION;
// Resolve the shell relative to this worker, not the web origin root.
// Works at both / (legacy Vercel) and /megaframe-studio/ (GitHub Pages).
const APP_ROOT = new URL('./', self.location.href);
const APP_PATH = APP_ROOT.pathname;
const CORE = [
  './', './manifest.webmanifest', './pwa-client.js',
  './editor.js', './shared.js', './cloud-config.js',
  './sample_image-0.js', './sample_image-1.js', './sample_image-2.js',
  './sample_image-3.js', './sample_image-4.js', './sample_image-5.js',
  './gold_image-0.js', './gold_image-1.js', './gold_image-2.js', './gold_image-3.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
].map(path => new URL(path, APP_ROOT).pathname);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  // Do not skipWaiting automatically: an active editing session must not be interrupted.
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('megaframe-shell-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only our static app shell; Supabase, identity, uploaded images, and external websites
  // are always handled by the browser network layer, never service-worker cached.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_PATH) ||
      /^(api|auth|storage|functions|rest|\.env|\.vercel)(\/|$)/.test(url.pathname.slice(APP_PATH.length))) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) (await caches.open(CACHE)).put(APP_PATH, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return (await caches.match(APP_PATH)) || Response.error();
      }
    })());
    return;
  }
  if (!CORE.includes(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok && fresh.type === 'basic') {
        (await caches.open(CACHE)).put(url.pathname, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      return (await caches.match(url.pathname)) || Response.error();
    }
  })());
});
