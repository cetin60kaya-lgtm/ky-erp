const SOURCE_ORIGIN = "https://kyerp.net";
const CANONICAL_PREFIX = "/ky-guvenlik";
const CANONICAL_URL = `${CANONICAL_PREFIX}/`;
const LEGACY_ROOT_ASSETS = new Set([
  "/app.css",
  "/app.js",
  "/install-helper.js",
  "/ios-safari.js",
  "/security-actions.js",
  "/security-control-center.js",
  "/security-foreground-sync.js",
  "/kyerp-security-192.png",
  "/kyerp-security-512.png",
  "/kyerp-security-apple-touch.png",
  "/kyerp-security-icon.svg",
]);

const RETIRE_LEGACY_SW = `const TARGET="/ky-guvenlik/";self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil((async()=>{try{for(const key of await caches.keys())if(key.startsWith("kyerp-security-")||key.startsWith("kyerp-ky-guvenlik-"))await caches.delete(key)}catch{}try{for(const n of await self.registration.getNotifications())n.close()}catch{}try{await self.registration.unregister()}catch{}try{for(const c of await self.clients.matchAll({type:"window",includeUncontrolled:true}))await c.navigate(TARGET)}catch{}})()));self.addEventListener("fetch",e=>{if(e.request.mode==="navigate")e.respondWith(Response.redirect(new URL(TARGET,self.location.origin),308))});`;

function noStoreHeaders(sourceHeaders = new Headers()) {
  const headers = new Headers(sourceHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-KYERP-Security-App", "canonical-ky-guvenlik");
  return headers;
}

function isNavigation(request) {
  return request.mode === "navigate" || String(request.headers.get("accept") || "").includes("text/html");
}

function redirectToCanonical(incoming, pathname = CANONICAL_URL) {
  const target = new URL(incoming.toString());
  target.pathname = pathname;
  return Response.redirect(target.toString(), 308);
}

function isLegacyNavigation(pathname) {
  return pathname === "/" ||
    pathname === "/security" || pathname.startsWith("/security/") ||
    pathname === "/ky-guvenlik-recover" || pathname.startsWith("/ky-guvenlik-recover/");
}

async function proxyCanonical(request, incoming) {
  const method = String(request.method || "GET").toUpperCase();
  const readable = method === "GET" || method === "HEAD";
  const upstream = new URL(incoming.pathname, SOURCE_ORIGIN);
  upstream.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  const init = { method, headers, redirect: "manual" };
  if (!readable) init.body = request.body;

  const response = await fetch(new Request(upstream, init), { cache: "no-store" });
  const outHeaders = noStoreHeaders(response.headers);
  if (incoming.pathname === `${CANONICAL_PREFIX}/sw.js`) {
    outHeaders.set("Service-Worker-Allowed", CANONICAL_URL);
  }
  return new Response(method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const method = String(request.method || "GET").toUpperCase();
    const readable = method === "GET" || method === "HEAD";
    const navigation = readable && isNavigation(request);

    if (readable && (incoming.pathname === "/sw.js" || incoming.pathname === "/security/sw.js")) {
      return new Response(method === "HEAD" ? null : RETIRE_LEGACY_SW, {
        status: 200,
        headers: noStoreHeaders(new Headers({
          "Content-Type": "application/javascript; charset=UTF-8",
          "Service-Worker-Allowed": "/",
        })),
      });
    }

    if (navigation && (isLegacyNavigation(incoming.pathname) || incoming.pathname === CANONICAL_PREFIX)) {
      return redirectToCanonical(incoming);
    }

    if (readable && incoming.pathname === "/manifest.webmanifest") {
      return redirectToCanonical(incoming, `${CANONICAL_PREFIX}/manifest.webmanifest`);
    }

    if (readable && LEGACY_ROOT_ASSETS.has(incoming.pathname)) {
      return redirectToCanonical(incoming, `${CANONICAL_PREFIX}${incoming.pathname}`);
    }

    if (incoming.pathname === CANONICAL_URL || incoming.pathname.startsWith(`${CANONICAL_PREFIX}/`)) {
      return proxyCanonical(request, incoming);
    }

    if (navigation) return redirectToCanonical(incoming);
    return new Response("Not Found", { status: 404, headers: noStoreHeaders() });
  },
};
