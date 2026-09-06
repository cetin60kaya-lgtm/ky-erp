import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootPackage = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"));

test("repository-root Cloudflare proxy delegates Worker quality and deploy commands", () => {
  const scripts = rootPackage?.scripts || {};
  assert.match(String(scripts.typecheck || ""), /APP\/cloud\/ky-erp-api/);
  assert.match(String(scripts.test || ""), /APP\/cloud\/ky-erp-api/);
  assert.match(String(scripts.build || ""), /APP\/cloud\/ky-erp-api/);
  assert.match(String(scripts.deploy || ""), /APP\/cloud\/ky-erp-api/);
});
