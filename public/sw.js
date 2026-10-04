// Offline support: keep everything the app fetched (shell, data, model,
// fonts) and serve it from the cache afterwards.
const CACHE = "ayet-nerede-v1"; // keep in sync with src/offline.ts
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;
  if (req.mode === "navigate") {
    // Network first for the page itself, so updates arrive; cache when offline.
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match("./"))));
    return;
  }
  const save = (res) => {
    if (res.ok || res.type === "opaque") {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };
  // Hashed build files and the model never change under the same name:
  // cache first. Everything else (icons, manifest, data) is served from the
  // cache at once and refreshed in the background, so updates still arrive.
  if (/\/(assets|models)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(save)));
    return;
  }
  // "no-cache": revalidate with the server (a cheap 304 when unchanged)
  // instead of taking the browser's HTTP cache copy.
  const fresh = fetch(new Request(req, { cache: "no-cache" })).then(save);
  e.waitUntil(fresh.catch(() => {}));
  e.respondWith(caches.match(req).then((hit) => hit || fresh));
});
