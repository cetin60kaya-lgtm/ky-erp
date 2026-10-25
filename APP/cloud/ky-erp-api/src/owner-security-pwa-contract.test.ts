import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, name), "utf8");
const publicRoot = resolve(here, "../../../app/ky-erp-frontend/public");
const ui = (name: string) => readFileSync(resolve(publicRoot, "guvenlik", name), "utf8");

const guard = source("owner-security-device-guard.ts");
const entry = source("main-entry-security.ts");
const html = ui("index.html");
const app = ui("app.js");
const control = ui("security-control-center.js");
const manifest = JSON.parse(ui("manifest.webmanifest"));

test("owner server authorization and signed security device remains mandatory", () => {
  assert.match(entry, /X-KYERP-Owner-App/);
  assert.match(entry, /requireOwnerSecurityApp/);
  assert.match(entry, /X-KYERP-Push-Device/);
  assert.match(entry, /X-KYERP-Security-Signature/);
  assert.match(guard, /async function canonicalOwner/);
  assert.match(guard, /ORDER BY u\.created_at ASC,u\.id ASC LIMIT 1/);
  assert.match(guard, /deviceTokenHash/);
  assert.match(guard, /decisionPublicKeyJwk/);
  assert.match(guard, /KYERP-DEVICE-AUTH-V1/);
  assert.match(guard, /CANONICAL_OWNER_ONLY/);
});

test("single KY Guvenlik owner app retains guarded control center", () => {
  assert.equal(manifest.id, "/guvenlik/");
  assert.equal(manifest.start_url, "/guvenlik/");
  assert.equal(manifest.scope, "/guvenlik/");
  assert.equal(existsSync(resolve(publicRoot, "owner-security")), false);
  assert.equal(existsSync(resolve(publicRoot, "ky-sistem")), false);
  assert.match(app, /kyerp-security-fresh-v3/);
  assert.match(app, /ownerControlAuthorized/);
  assert.match(app, /APP_DISPLAY_VERSION="v4\.1\.1"/);
  for(const label of ["Sistem Onayları","Aktif Oturumlar","Sistem Cihazları","Denetim Logları"])assert.ok(html.includes(label));
  assert.match(control, /control-center\/session\/close/);
});
