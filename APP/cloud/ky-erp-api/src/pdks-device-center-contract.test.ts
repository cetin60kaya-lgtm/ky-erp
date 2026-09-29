import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontendRoot = resolve(here, "../../../app/ky-erp-frontend/src");
const frontend = (name: string) => readFileSync(resolve(frontendRoot, name), "utf8");

const device = api("ik-pdks-device.ts");
const guard = api("ik-pdks-guard.ts");
const page = frontend("pages/modules/PdksPage.jsx");
const center = frontend("pages/pdks/PdksDeviceCenter.jsx");
const service = frontend("services/pdksDeviceApi.js");

test("PDKS terminal admin routes stay behind the central tenant guard", () => {
  assert.match(guard, /app\.use\("\/api\/ik\/personnel-control\/\*", enforcePdksTenantAndPermission\)/);
  assert.match(guard, /registerIkPdksDeviceRoutes\(app\)/);
  assert.match(device, /app\.get\("\/api\/ik\/personnel-control\/devices"/);
  assert.match(device, /app\.get\("\/api\/ik\/personnel-control\/device-sync-logs"/);
  assert.match(device, /app\.patch\("\/api\/ik\/personnel-control\/devices\/:id"/);
  assert.match(device, /\(c as any\)\.get\?\.\("pdksCompany"\)/);
});

test("PDKS device secret is hashed at rest and only returned by enrollment", () => {
  assert.match(device, /const secretHash = await sha256\(secret\)/);
  assert.match(device, /secret_hash/);
  assert.match(device, /return ok\(c, \{ deviceId: id, secret,/);
  const listRoute = device.slice(device.indexOf('app.get("/api/ik/personnel-control/devices"'), device.indexOf('app.get("/api/ik/personnel-control/device-sync-logs"'));
  assert.doesNotMatch(listRoute, /secret_hash AS/);
});

test("PDKS public agent heartbeat and import remain available without SGK gating", () => {
  assert.match(device, /\/api\/auth\/pdks-device\/heartbeat/);
  assert.match(device, /\/api\/auth\/pdks-device\/time-events\/import/);
  assert.match(device, /PDKS_DEVICE_UNAUTHORIZED/);
  assert.match(device, /active_passive,e\.status,'AKTIF'/);
  assert.doesNotMatch(device, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\)='VAR'/);
  assert.match(device, /Aktif kartlı personel \+ tarih\/saat eşleşmedi/);
});

test("PDKS five-group navigation keeps dedicated device and sync center", () => {
  for (const label of ["Günlük", "Personel & İK", "Tanımlar", "Terminal & Sistem", "Rapor & Denetim"]) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(page, /"cihaz-baglantilari", "senkron"/);
  assert.match(page, /<PdksDeviceCenter/);
  assert.match(center, /Son Heartbeat/);
  assert.match(center, /Senkronizasyon Geçmişi/);
  assert.match(center, /Bu bilgi yalnız şimdi gösterilir/);
  assert.match(service, /device-sync-logs/);
});
