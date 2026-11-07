import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { isDynamicImportError, openFreshFrontendVersion, tryRecoverStaleChunk } from "./lazyWithRetry.js";

test("stale Vite chunk MIME fallback and failed dynamic import are recognized", () => {
  assert.equal(isDynamicImportError(new TypeError("Failed to fetch dynamically imported module: https://kyerp.net/assets/UretimPage-missing.js")), true);
  assert.equal(isDynamicImportError(new TypeError('Failed to load module script: Expected a JavaScript-or-Wasm module script but server responded with a MIME type of "text/html".')), true);
  assert.equal(isDynamicImportError(new Error("Unable to preload CSS for /assets/UretimPage.css")), true);
  assert.equal(isDynamicImportError(new Error("Production service returned 503")), false);
});

test("one fresh HTML navigation, never a crash/reload loop; auth route is preserved", () => {
  const previous = globalThis.window;
  const stored = new Map();
  const navigations = [];
  globalThis.window = {
    location: {
      href: "https://kyerp.net/uretim/irsaliye-bekleyen",
      replace: (url) => navigations.push(url),
    },
    sessionStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
  };
  try {
    const chunkError = new TypeError("Failed to fetch dynamically imported module");
    assert.equal(tryRecoverStaleChunk(chunkError), true);
    assert.equal(navigations.length, 1);
    const next = new URL(navigations[0]);
    assert.equal(next.pathname, "/uretim/irsaliye-bekleyen");
    assert.ok(Number(next.searchParams.get("ky_refresh")) > 0);
    assert.equal(tryRecoverStaleChunk(chunkError), false);
    assert.equal(navigations.length, 1);
    assert.equal(tryRecoverStaleChunk(new Error("Unrelated error")), false);
    assert.equal(openFreshFrontendVersion(), true);
    assert.equal(navigations.length, 2);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test("authenticated module error and Vite preload failure have a safe recovery path", () => {
  const root = readFileSync(new URL("../AppV3.jsx", import.meta.url), "utf8");
  const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(root, /tryRecoverStaleChunk\(error\)/);
  assert.match(root, /openFreshFrontendVersion\(\)/);
  assert.match(main, /vite:preloadError/);
  assert.match(main, /tryRecoverStaleChunk\(event\.payload\)/);
});
