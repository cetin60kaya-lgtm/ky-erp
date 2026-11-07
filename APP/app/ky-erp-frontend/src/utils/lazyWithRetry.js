import { lazy } from "react";

// Cloudflare Pages deploys replace the active asset manifest. An already-open ERP
// tab can request a removed Vite chunk and receive SPA fallback HTML instead.
// Recover by fetching fresh HTML exactly once per short window; never loop.
const DYNAMIC_IMPORT_ERROR_MARKERS = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "error loading dynamically imported module",
  "failed to load module script",
  "chunkloaderror",
  "loading chunk",
  "load failed",
  "failed to fetch",
  "unable to preload css",
  "unable to preload",
  "expected a javascript module script",
  "expected a javascript-or-wasm module script",
  "text/html",
];

export function isDynamicImportError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return DYNAMIC_IMPORT_ERROR_MARKERS.some((marker) => message.includes(marker));
}

const RELOAD_GUARD_KEY = "kyerp.frontend.chunk-reload-at";
const RELOAD_WINDOW_MS = 120000;

export function openFreshFrontendVersion() {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  url.searchParams.set("ky_refresh", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export function tryRecoverStaleChunk(error) {
  if (!isDynamicImportError(error) || typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (last > 0 && Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return openFreshFrontendVersion();
  } catch {
    // No storage / navigation permission: report the original failure rather
    // than repeatedly reloading an authenticated workspace.
    return false;
  }
}

export function lazyWithRetry(factory, key = "chunk") {
  return lazy(() => factory()
    .then((module) => {
      try { window.sessionStorage.removeItem(`kyerp.lazy.retry.${key}`); } catch { /* optional */ }
      return module;
    })
    .catch((error) => {
      if (tryRecoverStaleChunk(error)) return new Promise(() => {});
      throw error;
    }));
}
