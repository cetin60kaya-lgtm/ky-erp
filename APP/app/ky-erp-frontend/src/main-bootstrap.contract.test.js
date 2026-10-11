import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");

test("public canonical host does not preload the heavy ERP runtime", () => {
  const start = source.indexOf("async function renderCanonicalHost()");
  const end = source.indexOf("async function renderErpApp()", start);
  assert.ok(start >= 0 && end > start, "canonical host block must exist");
  const block = source.slice(start, end);

  assert.match(block, /function AuthenticatedWorkspace/);
  assert.match(block, /if \(isAuthenticated\) return <AuthenticatedWorkspace user=\{user\} \/>/);
  assert.doesNotMatch(
    block.slice(0, block.indexOf("function AuthenticatedWorkspace")),
    /await loadErpRuntime\(\)/,
    "public landing/login must render without loading AppV3 and module chunks",
  );
});

test("authenticated workspace reports chunk-load failure without replacing public login bootstrap", () => {
  assert.match(source, /KY ERP authenticated workspace yuklenemedi/);
  assert.match(source, /Giriş oturumunuz korunuyor/);
});
