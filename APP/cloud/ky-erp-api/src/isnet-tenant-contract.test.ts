import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const source = (name: string) => readFileSync(resolve(here, name), "utf8");
const migration = readFileSync(resolve(root, "APP/cloud/ky-erp-api/migrations/0027_isnet_tenant_scope_backfill.sql"), "utf8");

const main = source("main.ts");
const guard = source("isnet-tenant-guard.ts");

test("every IsNet API route is protected by one explicit tenant guard", () => {
  assert.match(main, /shell\.use\("\/api\/isnet\/\*", enforceIsnetTenant\)/);
  assert.match(guard, /MAIN_COMPANY_REQUIRED/);
  assert.match(guard, /MAIN_COMPANY_CONTEXT_MISSING/);
  assert.match(guard, /MAIN_COMPANY_FORBIDDEN/);
  assert.match(guard, /mainCompanySlug/);
  assert.match(guard, /X-KYERP-Tenant-Slug/);
  assert.doesNotMatch(guard, /mecit-hakan/);
  assert.doesNotMatch(guard, /mainCompanyId/);
});

test("non-owner IsNet access fails closed when user tenant context is missing or different", () => {
  assert.match(guard, /if \(!ownSlug\)/);
  assert.match(guard, /if \(requestedSlug !== ownSlug\)/);
  assert.match(guard, /return value === "SUPER_ADMIN" \|\| value === "ADMIN"/);
});

test("legacy global IsNet rows are bound once to Hakan tenant before multi-company operation", () => {
  assert.match(migration, /UPDATE json_store/);
  assert.match(migration, /main_company_slug = 'mecit-hakan'/);
  assert.match(migration, /main_company_slug IS NULL/);
  assert.match(migration, /scope LIKE 'ISNET_%'/);
});
