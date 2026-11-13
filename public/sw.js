const CACHE = "apna-vyapar-v6";
self.addEventListener("install", (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(["/", "/index.html", "/manifest.webmanifest"])).then(() => self.skipWaiting())
));
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (event) => event.respondWith(
  (new URL(event.request.url).pathname.startsWith("/src/") || new URL(event.request.url).pathname.startsWith("/@vite/") || new URL(event.request.url).pathname.startsWith("/node_modules/"))
    ? fetch(event.request)
    :
  caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match("/index.html")))
));
