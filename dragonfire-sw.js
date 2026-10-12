const CACHE_NAME = "dragonfire-protocol-v2";
const ASSETS = [
  "./dragonfire-protocol.html",
  "./dragonfire-manifest.webmanifest",
  "./vite.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
});

// QA-5b: only Dragonfire traffic is served cache-first. Any other page this
// worker may still control (old root-scope registrations) goes straight to
// the network, so the main site never gets stale cached files.
const DRAGONFIRE_PATH = /\/dragonfire-protocol(\.html)?$/;

async function isDragonfireRequest(event) {
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    return DRAGONFIRE_PATH.test(url.pathname);
  }
  if (!event.clientId) {
    return false;
  }
  const client = await self.clients.get(event.clientId);
  return Boolean(client && DRAGONFIRE_PATH.test(new URL(client.url).pathname));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    isDragonfireRequest(event).then((own) =>
      own
        ? caches.match(event.request).then((cached) => cached || fetch(event.request))
        : fetch(event.request),
    ),
  );
});