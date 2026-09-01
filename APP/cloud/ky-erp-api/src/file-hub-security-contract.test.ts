import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const storage = readFileSync(resolve(here, "admin-storage-cloud.ts"), "utf8");
const hub = readFileSync(resolve(here, "file-hub.ts"), "utf8");

test("File Hub admin listing and search are owner-only", () => {
  assert.match(storage, /path==="\/api\/file-hub\/files"/);
  assert.match(storage, /path==="\/api\/file-hub\/search"/);
  assert.match(storage, /OWNER_ONLY/);
});

test("entity file reads honor existing ERP module permissions", () => {
  assert.match(storage, /entityModule/);
  assert.match(storage, /permissionFor\(user,moduleKey\)\?\.canView/);
  assert.match(storage, /\/api\/file-hub\/entity-files/);
});

test("all canonical File Hub queries carry tenant scoping", () => {
  assert.match(hub, /main_company_slug/g);
  assert.match(hub, /X-KYERP-Tenant-Slug/);
  assert.doesNotMatch(hub, /WHERE\s+1=1\s+ORDER BY/i);
});
