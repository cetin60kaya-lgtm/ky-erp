import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guard = readFileSync(new URL("./file-hub-tenant-guard.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("File Hub authenticated API is tenant guarded", () => {
  assert.match(main, /shell\.use\("\/api\/file-hub\/\*", enforceFileHubTenant\)/);
  assert.match(guard, /MAIN_COMPANY_REQUIRED/);
  assert.match(guard, /MAIN_COMPANY_FORBIDDEN/);
  assert.match(guard, /X-KYERP-Tenant-Slug/);
  assert.match(guard, /candidates\.size === 1/);
});

test("File Hub public agent transport stays outside authenticated guard", () => {
  assert.doesNotMatch(main, /shell\.use\("\/api\/auth\/file-hub-agent/);
});
