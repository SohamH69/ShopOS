/*
 * ShopOS service worker (SPEC §7).
 *
 * - Precaches the app shell: "/", "/index.html", the manifest and the icons, plus the hashed
 *   entry script and stylesheet that index.html points at, so the app opens offline after one visit.
 * - /assets/* (hashed, immutable): cache first.
 * - Page navigations: network first; offline, falls back to the cached /index.html (the SPA
 *   router then shows the right screen).
 * - Never touches /api/*, Vite dev-server paths or non-GET requests: money data is always live.
 * - A new version takes over at once (skipWaiting + clients.claim) and deletes older caches.
 *
 * Bump VERSION whenever this file's caching rules change.
 */

const VERSION = "v1";
const CACHE_PREFIX = "shopos-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

/** Hashed files from old builds pile up in the asset cache; keep at most this many. */
const MAX_ASSET_ENTRIES = 200;

const SHELL_URL = "/index.html";

const PRECACHE_URLS = [
  "/",
  SHELL_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/shortcut-new-order.png",
  "/icons/shortcut-pickups.png",
];

/** Small static files served from the shell cache and refreshed in the background. */
const STATIC_PATHS = new Set(PRECACHE_URLS.filter((url) => url !== "/" && url !== SHELL_URL));

/** Live data and the Vite dev server (/@vite, /@react-refresh, /@fs, /src/, /node_modules/). */
function isNeverCached(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/src/") ||
    pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/__vite") ||
    pathname === "/sw.js"
  );
}

function isHtml(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

function isCacheableAsset(response) {
  return response.ok && response.status === 200 && response.type === "basic" && !isHtml(response);
}

/** The /assets/* files a built index.html loads up front (entry script, preloads, stylesheet). */
function assetUrlsIn(html) {
  const urls = new Set();
  const pattern = /(?:src|href)="(\/assets\/[^"?#]+)"/g;
  let match = pattern.exec(html);
  while (match) {
    urls.add(match[1]);
    match = pattern.exec(html);
  }
  return [...urls];
}

async function trimAssetCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ASSET_ENTRIES;
  for (let index = 0; index < excess; index += 1) {
    await cache.delete(keys[index]);
  }
}

async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  // One file failing (say, offline mid-install) must not block the rest.
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok) await shell.put(url, response);
      } catch {
        // Cached on a later visit instead.
      }
    }),
  );

  const index = await shell.match(SHELL_URL);
  if (!index) return;
  const assets = await caches.open(ASSET_CACHE);
  const urls = assetUrlsIn(await index.text());
  await Promise.all(
    urls.map(async (url) => {
      try {
        if (await assets.match(url)) return;
        const response = await fetch(url);
        if (isCacheableAsset(response)) await assets.put(url, response);
      } catch {
        // Cached when the page requests it.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // Not supported here; navigations simply use fetch().
        }
      }
      await self.clients.claim();
    })(),
  );
});

/** Network first. Every good page load refreshes the cached shell; offline, the shell answers. */
async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    if (response.ok && !response.redirected && isHtml(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy)));
    }
    return response;
  } catch {
    const shell = await caches.open(SHELL_CACHE);
    const cached = (await shell.match(SHELL_URL)) || (await shell.match("/"));
    return cached || offlinePage();
  }
}

/** Hashed bundles never change, so a cached copy is always right. */
async function cacheFirst(event) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheableAsset(response)) {
    const copy = response.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trimAssetCache(cache)));
  }
  return response;
}

/** Manifest and icons: answer from the cache, refresh it in the background. */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  const refresh = fetch(event.request)
    .then(async (response) => {
      if (response.ok) await cache.put(new URL(event.request.url).pathname, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

function offlinePage() {
  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · ShopOS</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6fa;color:#161a23;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif">
<main style="max-width:360px;padding:24px;text-align:center">
<h1 style="margin:0 0 8px;font-size:22px">You're offline</h1>
<p style="margin:0;color:#4a5162">ShopOS needs an internet connection the first time it opens on this device. Connect and reload the page.</p>
</main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isNeverCached(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(event));
  } else if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
