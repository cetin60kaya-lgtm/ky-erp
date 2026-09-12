import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const security = await readFile(new URL("./security-center-cloud.ts", import.meta.url), "utf8");
const notifications = await readFile(new URL("./notifications-cloud.ts", import.meta.url), "utf8");

test("trusted login device is persistent per user and browser id", () => {
  assert.match(security, /AUTH_TRUSTED_LOGIN_DEVICE/);
  assert.match(security, /trustedDeviceKey\(row\.user_id, deviceId\)/);
  assert.match(security, /deviceTrusted: Boolean\(deviceId\)/);
  assert.match(security, /trustSource: persistentTrusted \? "DEVICE"/);
});

test("trusted devices suppress repeated session approval notifications", () => {
  assert.match(notifications, /AUTH_TRUSTED_LOGIN_DEVICE/);
  assert.match(notifications, /trustedKeys\.has/);
  assert.match(notifications, /pendingRows/);
});

test("self company and system scopes can only manage allowed trusted devices", () => {
  assert.match(security, /Yalnız kendi onaylı cihazınızı yönetebilirsiniz/);
  assert.match(security, /CROSS_TENANT_FORBIDDEN/);
  assert.match(security, /TRUSTED_DEVICE_REVOKE/);
  assert.match(security, /isCompanyAdmin\(targetRole\)/);
});
