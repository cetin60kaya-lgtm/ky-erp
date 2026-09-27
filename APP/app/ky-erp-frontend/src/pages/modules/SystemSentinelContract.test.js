import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./SystemSentinelPage.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../AppV3.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../../app/moduleRegistry.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../layouts/AppShellV3.jsx", import.meta.url), "utf8");

test("System Center is a responsive standalone module with Wake and remote control actions", () => {
  assert.match(page, /KY ERP Sistem Merkezi/);
  assert.match(page, /Aç \/ Uyandır/);
  assert.match(page, /Aç ve Bağlan/);
  assert.match(page, /Uzak Masaüstü/);
  assert.match(page, /REMOTE_CONTROL/);
  assert.match(page, /WAKE/);
});

test("delegated Sentinel access is independent from ADMIN module permission", () => {
  assert.match(app, /getSystemSentinelAccess/);
  assert.match(app, /item\.key === "sistem-merkezi"/);
  assert.match(registry, /key: "sistem-merkezi"/);
  assert.match(registry, /permissionKey: "SYSTEM_SENTINEL"/);
  assert.match(shell, /"sistem-merkezi"/);
});

test("mobile remote launch opens synchronously before async API result", () => {
  assert.match(page, /window\.open\("about:blank", "_blank"\)/);
  assert.match(page, /placeholder\.location\.replace/);
});

test("owner grant UI supports temporary one-time and permanent access", () => {
  assert.match(page, /TEMPORARY/);
  assert.match(page, /ONE_TIME/);
  assert.match(page, /PERMANENT/);
  assert.match(page, /Yetki Ver/);
});
