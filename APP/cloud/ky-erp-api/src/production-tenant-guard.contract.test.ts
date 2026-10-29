import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const guard = readFileSync(new URL("./production-tenant-guard.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("all production and model flow API routes have independent auth/tenant middleware", () => {
  for (const route of ["/api/production-center", "/api/production-center/*",
    "/api/model-flow/*", "/api/production/*", "/api/imalat/kayitlar", "/api/uretim/seri/*"]) {
    assert.ok(main.includes('"' + route + '"'), route);
  }
  assert.match(main, /shell\.use\(productionRoute, enforceProductionTenant\)/);
  assert.match(main, /import \{ enforceProductionTenant \} from "\.\/production-tenant-guard"/);
});

test("non-owner production permissions distinguish view, create, update and delete", () => {
  assert.match(guard, /module_key\) === "IMALAT"/);
  assert.match(guard, /canView/);
  assert.match(guard, /canCreate/);
  assert.match(guard, /canUpdate/);
  assert.match(guard, /canDelete/);
  assert.match(guard, /IMALAT_FORBIDDEN/);
  assert.match(guard, /UNAUTHORIZED/);
});

test("production rejects missing or conflicting tenant and cross-company access", () => {
  assert.match(guard, /new Set<string>\(\)/);
  assert.match(guard, /candidates\.size === 1/);
  assert.match(guard, /c\.req\.raw\.clone\(\)\.json\(\)/);
  assert.match(guard, /MAIN_COMPANY_REQUIRED/);
  assert.match(guard, /MAIN_COMPANY_CONTEXT_MISSING/);
  assert.match(guard, /MAIN_COMPANY_FORBIDDEN/);
  assert.match(guard, /X-KYERP-Tenant-Slug/);
});
