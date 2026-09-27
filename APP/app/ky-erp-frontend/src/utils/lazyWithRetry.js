import { lazy } from "react";

const DYNAMIC_IMPORT_ERROR_MARKERS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Failed to load module script",
  "ChunkLoadError",
  "Loading chunk",
  "Load failed",
];

function isDynamicImportError(error) {
  const message = String(error?.message || error || "");
  return DYNAMIC_IMPORT_ERROR_MARKERS.some((marker) =>
    message.includes(marker),
  );
}

export function lazyWithRetry(factory, key = "chunk") {
  return lazy(() =>
    factory()
      .then((module) => {
        try {
          window.sessionStorage.removeItem(`kyerp.lazy.retry.${key}`);
        } catch {
          // sessionStorage may be blocked; loading can continue normally.
        }
        return module;
      })
      .catch((error) => {
        if (isDynamicImportError(error) && typeof window !== "undefined") {
          const storageKey = `kyerp.lazy.retry.${key}`;
          try {
            if (window.sessionStorage.getItem(storageKey) !== "1") {
              window.sessionStorage.setItem(storageKey, "1");
              window.location.reload();
              return new Promise(() => {});
            }
          } catch {
            window.location.reload();
            return new Promise(() => {});
          }
        }
        throw error;
      }),
  );
}
