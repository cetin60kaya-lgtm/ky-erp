import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const gate = readFileSync(resolve(here, "security-device-enrollment-gate.ts"), "utf8");
const entry = readFileSync(resolve(here, "main-entry-security.ts"), "utf8");
const securityRoot = resolve(here, "../../../app/ky-erp-frontend/public/guvenlik");
const index = readFileSync(resolve(securityRoot, "index.html"), "utf8");
const pairUi = readFileSync(resolve(securityRoot, "security-enrollment-pair.js"), "utf8");

test("device enrollment requires backup code and admin password", () => {
  assert.match(gate, /SECURITY_BACKUP_CODE_REQUIRED/);
  assert.match(gate, /SECURITY_ADMIN_PASSWORD_REQUIRED/);
  assert.match(gate, /safeEqual\(text\(enrollment\.codeHash\), codeHash\)/);
  assert.match(gate, /compare\(adminPassword, text\(user\.password_hash\)\)/);
});

test("subscription-only password relink is retired", () => {
  assert.match(gate, /security-relink\/by-subscription/);
  assert.match(gate, /SECURITY_RELINK_PAIR_REQUIRED/);
  assert.match(gate, /Yedek Kod ve Admin Şifresi birlikte gereklidir/);
});

test("API entry enforces gate before legacy auth router", () => {
  const gateIndex = entry.indexOf("guardSecurityDeviceEnrollment(request, env)");
  const baseIndex = entry.indexOf("return base.fetch(request, env, ctx)");
  assert.ok(gateIndex >= 0);
  assert.ok(baseIndex > gateIndex);
});

test("security PWA shows and requires the same credential pair", () => {
  assert.match(index, /Yedek Kod \+ Admin Şifresi/);
  assert.match(index, /security-enrollment-pair\.js/);
  assert.match(pairUi, /#enrollmentCode/);
  assert.match(pairUi, /#password/);
  assert.match(pairUi, /event\.stopImmediatePropagation\(\)/);
});
