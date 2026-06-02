const CACHE = "vinylscan-v1";
const OFFLINE_QUEUE_KEY = "vinylscan-offline-queue";

// Cache app shell on install
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(["/", "/scan", "/dashboard", "/history"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Serve cached pages when offline
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Only intercept same-origin navigation requests for offline fallback
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  // Pass through all other requests normally
});

// Background sync for offline scan queue
self.addEventListener("sync", (e) => {
  if (e.tag === "vinylscan-sync") {
    e.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: "SYNC_START" }));
}
