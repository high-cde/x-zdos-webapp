const CACHE_NAME = 'zdos-enet-shell-v2';
const APP_SHELL = [
  '/', '/index.html', '/lab.html', '/lab-ide.html', '/specs.html',
  '/wallet.html', '/wallet-miner.js', '/dsn-miner.js', '/xcloud.html', '/velvet.html', '/admin.html', '/enet.html', '/account.html', '/downloads.html', '/offline.html',
  '/manifest.webmanifest', '/devhub24-80.png', '/b24devhub-header.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('zdos-enet-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    if (event.request.mode === 'navigate') return;
    event.respondWith(new Response('ZDOS eNET blocks external requests.', { status: 451, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    return;
  }

  if (event.request.method !== 'GET') return;
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/auth/') || requestUrl.pathname === '/health') {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'content-type': 'application/json' } })));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok && !response.headers.has('set-cookie')) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match('/offline.html'))));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && !response.headers.has('set-cookie')) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
