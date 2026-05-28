/* HIVE CONTROL — Service Worker (PWA)
 * Estrategia network-first: siempre intenta traer contenido fresco; si no hay
 * red, sirve lo cacheado. NO cachea /api/* ni /auth/* (deben ser siempre
 * frescos y nunca servirse offline para no exponer datos desactualizados ni
 * romper la sesión). Mantiene la app instalable y utilizable con red débil.
 */
const CACHE = "hive-control-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Nunca interceptar API / auth / server actions: siempre red directa.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        // Solo cachear respuestas OK del mismo origen.
        if (fresh && fresh.status === 200 && fresh.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
