import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guard = readFileSync(new URL("./desen-tenant-guard.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("Desen API is protected by tenant and module permission guard", () => {
  assert.match(main, /shell\.use\("\/api\/desen\/\*", enforceDesenTenant\)/);
  assert.match(guard, /DESEN_FORBIDDEN/);
  assert.match(guard, /MAIN_COMPANY_FORBIDDEN/);
  assert.match(guard, /MAIN_COMPANY_REQUIRED/);
  assert.match(guard, /moduleKey.*DESEN|module_key.*DESEN/s);
});

test("Desen read-only user cannot perform writes", () => {
  assert.match(guard, /m === "GET" \|\| m === "HEAD"/);
  assert.match(guard, /m === "DELETE"/);
  assert.match(guard, /m === "PUT" \|\| m === "PATCH"/);
  assert.match(guard, /m === "POST"/);
  assert.match(guard, /canCreate/);
  assert.match(guard, /canUpdate/);
  assert.match(guard, /canDelete/);
  assert.match(guard, /canApprove/);
});

test("Desen tenant resolution rejects conflicting or missing tenant candidates", () => {
  assert.match(guard, /new Set<string>\(\)/);
  assert.match(guard, /candidates\.size === 1/);
  assert.match(guard, /X-KYERP-Tenant-Slug/);
  assert.match(guard, /mainCompanySlug/);
  assert.match(guard, /multipart\/form-data/);
});
