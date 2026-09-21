const SOURCE_ORIGIN = "https://kyerp.net";
const SOURCE_PREFIX = "/ky-guvenlik";
const ROOT_ASSETS = new Set([
  "/app.css",
  "/app.js",
  "/install-helper.js",
  "/ios-safari.js",
  "/security-actions.js",
  "/security-control-center.js",
  "/security-foreground-sync.js",
  "/sw.js",
  "/kyerp-security-192.png",
  "/kyerp-security-512.png",
  "/kyerp-security-apple-touch.png",
  "/kyerp-security-icon.svg",
]);

const ROOT_MANIFEST = JSON.stringify({
  name: "KY ERP Güvenlik",
  short_name: "KY Güvenlik",
  id: "/",
  description: "KY ERP telefon ve tablet giriş onayı uygulaması",
  lang: "tr",
  dir: "ltr",
  start_url: "/",
  scope: "/",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "portrait-primary",
  background_color: "#eef4fb",
  theme_color: "#10284d",
  categories: ["business", "security", "productivity"],
  prefer_related_applications: false,
  icons: [
    { src: "/kyerp-security-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/kyerp-security-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    { src: "/kyerp-security-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
  ],
});

const RETIRE_LEGACY_SW = `self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));self.addEventListener("activate",event=>event.waitUntil((async()=>{try{for(const key of await caches.keys())if(key.startsWith("kyerp-security-")||key.startsWith("kyerp-ky-guvenlik-"))await caches.delete(key)}catch{}try{await self.registration.unregister()}catch{}try{for(const client of await self.clients.matchAll({type:"window",includeUncontrolled:true}))client.postMessage({type:"KYERP_SECURITY_LEGACY_RETIRED"})}catch{}})()));`;

function isNavigation(request) {
  return request.mode === "navigate" || String(request.headers.get("accept") || "").includes("text/html");
}

function isLegacyAppPath(pathname) {
  return pathname === "/security" || pathname.startsWith("/security/") ||
    pathname === "/ky-guvenlik" || pathname.startsWith("/ky-guvenlik/") ||
    pathname === "/ky-guvenlik-recover" || pathname.startsWith("/ky-guvenlik-recover/");
}

function publicRootSourcePath(pathname) {
  if (pathname === "/") return `${SOURCE_PREFIX}/`;
  if (ROOT_ASSETS.has(pathname)) return `${SOURCE_PREFIX}${pathname}`;
  return "";
}

function transformRootText(text) {
  return text
    .replaceAll("/ky-guvenlik/", "/")
    .replaceAll("security-v2.9", "security-v3.0-root")
    .replaceAll("v2.9", "v3.0");
}

function noStoreHeaders(sourceHeaders = new Headers()) {
  const headers = new Headers(sourceHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-KYERP-Security-App", "root-v3");
  return headers;
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const method = String(request.method || "GET").toUpperCase();
    const readable = method === "GET" || method === "HEAD";

    if (readable && isLegacyAppPath(incoming.pathname) && isNavigation(request)) {
      const target = new URL(request.url);
      target.pathname = "/";
      return Response.redirect(target.toString(), 308);
    }

    if (readable && (incoming.pathname === "/ky-guvenlik/sw.js" || incoming.pathname === "/security/sw.js")) {
      return new Response(method === "HEAD" ? null : RETIRE_LEGACY_SW, {
        status: 200,
        headers: noStoreHeaders(new Headers({
          "Content-Type": "application/javascript; charset=UTF-8",
          "Service-Worker-Allowed": "/",
        })),
      });
    }

    if (readable && incoming.pathname === "/manifest.webmanifest") {
      return new Response(method === "HEAD" ? null : ROOT_MANIFEST, {
        status: 200,
        headers: noStoreHeaders(new Headers({
          "Content-Type": "application/manifest+json; charset=UTF-8",
        })),
      });
    }

    const rootSourcePath = publicRootSourcePath(incoming.pathname);
    const upstream = new URL(rootSourcePath || incoming.pathname, SOURCE_ORIGIN);
    upstream.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.delete("host");
    const init = { method, headers, redirect: "manual" };
    if (!readable) init.body = request.body;

    const response = await fetch(new Request(upstream, init), { cache: "no-store" });
    const outHeaders = noStoreHeaders(response.headers);

    if (!rootSourcePath || !readable || method === "HEAD" || !response.ok) {
      return new Response(method === "HEAD" ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: outHeaders,
      });
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const textLike = contentType.includes("text/") || contentType.includes("javascript") || contentType.includes("json") || contentType.includes("manifest") || contentType.includes("svg");
    if (!textLike) {
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
    }

    const transformed = transformRootText(await response.text());
    outHeaders.delete("content-length");
    outHeaders.delete("content-encoding");
    if (incoming.pathname === "/sw.js") outHeaders.set("Service-Worker-Allowed", "/");
    return new Response(transformed, { status: response.status, statusText: response.statusText, headers: outHeaders });
  },
};
