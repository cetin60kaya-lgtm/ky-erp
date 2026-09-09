import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (url: string) => readFileSync(new URL(url, import.meta.url), "utf8");

test("Daily Operations is a standalone module with its own permission key", () => {
  const registry = read("../../../app/ky-erp-frontend/src/app/moduleRegistryBase.js");
  const app = read("../../../app/ky-erp-frontend/src/AppV3.jsx");
  assert.match(registry, /key: "gunluk-operasyon"/);
  assert.match(registry, /permissionKey: "GUNLUK_OPERASYON"/);
  assert.match(registry, /label: "Günlük Operasyon"/);
  assert.match(registry, /["ana-ekran", "Ana Ekran"/);
  assert.match(app, /activeModule\?\.key === "gunluk-operasyon"/);
  assert.match(app, /GunlukOperasyonPage/);
});

test("Daily Operations dashboard covers today, day-night and weekly operations", () => {
  const page = read("../../../app/ky-erp-frontend/src/pages/modules/GunlukOperasyonPage.jsx");
  assert.match(page, /Operasyon Ana Ekranı/);
  assert.match(page, /Bugün Gelen/);
  assert.match(page, /Bugün Gündüz/);
  assert.match(page, /Bugün Gece/);
  assert.match(page, /Gün Gün Operasyon/);
  assert.match(page, /Haftalık Operasyon/);
  assert.match(page, /Günlük Hareket Özeti/);
  assert.match(page, /dailyOnly/);
});

test("Daily subviews do not load monthly HR sources", () => {
  const ikPage = read("../../../app/ky-erp-frontend/src/pages/modules/IkPage.jsx");
  assert.match(ikPage, /dailyOnly = false/);
  assert.match(ikPage, /sources: dailyOnly \? dailySources/);
  assert.match(ikPage, /dailyOnly \? "gunluk-operasyon" : "ik"/);
  assert.match(ikPage, /if \(!dailyOnly\) \{/);
});

test("Daily Operations permission is recognized end-to-end and audit role stays disabled", () => {
  const authUi = read("../../../app/ky-erp-frontend/src/context/AuthContext.jsx");
  const users = read("../../../app/ky-erp-frontend/src/pages/admin/AdminUsersPanelV2.jsx");
  const auth = read("./auth-cloud.ts");
  const policy = read("./auth-policy-cloud.ts");
  const admin = read("./admin-management-cloud.ts");
  assert.match(authUi, /GUNLUK_OPERASYON/);
  assert.match(users, /GUNLUK_OPERASYON:"Günlük Operasyon"/);
  assert.match(auth, /GUNLUK_OPERASYON/);
  assert.match(policy, /GUNLUK_OPERASYON/);
  assert.match(admin, /GUNLUK_OPERASYON/);
  assert.match(admin, /role === "DENETIM"[\s\S]*moduleKey === "IK"/);
  assert.doesNotMatch(admin, /role === "DENETIM"[\s\S]{0,500}moduleKey === "GUNLUK_OPERASYON"/);
});
