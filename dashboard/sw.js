const CACHE = 'cafeto-shell-v3';
const assets = ['index.html', 'app.js', 'styles.css', 'data/cafeto.json', 'data/Acopio_Hernan_vinculado_repo.xlsx'];
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
  const navigation = request.mode === 'navigate' && (url.pathname === new URL(scope).pathname || shell.has(url.origin + url.pathname));
  if (!navigation && !shell.has(request.url)) return;
  const cachedUrl = navigation ? new URL('index.html', scope).href : request.url;
  event.respondWith(
    fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(cachedUrl, response.clone());
      }
      return response;
    }).catch(async () => (await caches.match(cachedUrl, { cacheName: CACHE })) ?? Response.error()),
  );
});
