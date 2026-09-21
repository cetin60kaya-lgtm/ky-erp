import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("./pages/admin/SecurityCenterPanel.jsx", import.meta.url), "utf8");
const api = await readFile(new URL("./services/securityCenterApi.js", import.meta.url), "utf8");
const actions = await readFile(new URL("../public/ky-guvenlik/security-actions.js", import.meta.url), "utf8");

test("users see persistent approved devices and can revoke their own trust", () => {
  assert.match(panel, /Onaylı Cihazlarım/);
  assert.match(panel, /revokeOwnTrustedLoginDevice/);
  assert.match(api, /security-center\/trusted-devices/);
});

test("company and system scopes manage approved devices with phone approval", () => {
  assert.match(panel, /Firma Kullanıcılarının Onaylı Cihazları/);
  assert.match(panel, /Tüm Kullanıcıların Onaylı Cihazları/);
  assert.match(panel, /TRUSTED_DEVICE_REVOKE/);
  assert.match(actions, /TRUSTED_DEVICE_REVOKE/);
});
