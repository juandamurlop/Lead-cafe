const CACHE = '__CAFETO_CACHE__';
const assets = __CAFETO_ASSETS__;
const scope = self.registration.scope;
const shell = new Set(assets.map((asset) => new URL(asset, scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(
    [...shell].map((url) => new Request(url, { cache: 'reload' })),
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('cafeto-shell-') && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const cafeto = new URL('cafeto', scope);
  const navigation = request.mode === 'navigate' && url.origin === cafeto.origin &&
    (url.pathname === cafeto.pathname || url.pathname === cafeto.pathname + '/');
  if (!navigation && !shell.has(request.url)) return;
  const cachedUrl = navigation ? new URL('index.html', scope).href : request.url;
  event.respondWith(
    fetch(request).then(async (response) => {
      if (response.ok && !navigation) {
        const cache = await caches.open(CACHE);
        await cache.put(cachedUrl, response.clone());
      }
      return response;
    }).catch(async () => (await caches.match(cachedUrl, { cacheName: CACHE })) ?? Response.error()),
  );
});
