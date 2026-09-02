import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");
const migration = (name: string) => readFileSync(resolve(here, "../migrations", name), "utf8");

test("company billing uses account plus immutable usage and billing ledgers", () => {
  const sql = migration("0039_company_billing_ledger.sql");
  const backend = api("admin-billing-cloud.ts");
  const wrapper = api("admin-management-cloud.ts");
  assert.match(sql, /company_billing_accounts/);
  assert.match(sql, /company_ai_usage_ledger/);
  assert.match(sql, /company_billing_ledger/);
  assert.match(backend, /availableCredits:\s*included \+ usageCredit \+ billingCredit/);
  assert.match(backend, /Paket, fiyat ve kredi değişikliği yalnız uygulama sahibine açıktır/);
  assert.match(backend, /requested !== ownTenant|company !== tenant/);
  assert.match(backend, /COMPANY_BILLING_ACCOUNT_UPDATED/);
  assert.match(backend, /COMPANY_BILLING_CREDIT_MOVEMENT/);
  assert.match(wrapper, /registerAdminBillingRoutes\(app\)/);
});

test("billing UI separates technical token usage from customer credit pricing", () => {
  const ui = frontend("pages/admin/AdminCompanyBilling.jsx");
  const route = frontend("pages/modules/AdminPage.jsx");
  const registry = frontend("app/moduleRegistryBase.js");
  assert.match(ui, /Girdi Token/);
  assert.match(ui, /Çıktı Token/);
  assert.match(ui, /Kullanılabilir Kredi/);
  assert.match(ui, /Kalan hak doğrudan elle yazılmaz/);
  assert.match(ui, /AI Kullanım Defteri/);
  assert.match(route, /firma-ucretlendirme/);
  assert.match(registry, /Firma Paket \/ Kullanım/);
});

test("user session management is selected-user scoped and manager-only", () => {
  const ui = frontend("pages/admin/AdminUserSessionsScoped.jsx");
  const shell = frontend("pages/admin/AdminUsersPanel.jsx");
  const css = frontend("pages/admin/AdminUserSessionsScoped.css");
  const auth = api("auth-cloud.ts");
  assert.match(ui, /SUPER_ADMIN/);
  assert.match(ui, /ADMIN/);
  assert.match(ui, /COMPANY_ADMIN/);
  assert.match(ui, /sessions\.filter\(\(row\) => String\(row\.userId \|\| row\.user_id/);
  assert.match(ui, /revokeAllUserSessions\(selected\.id\)/);
  assert.match(shell, /AdminUserSessionsScoped/);
  assert.match(css, /auc2-tabs button:nth-child\(4\)/);
  assert.match(auth, /adminCanManage/);
  assert.match(auth, /SESSION_REVOKED/);
  assert.match(auth, /ALL_SESSIONS_REVOKED/);
});

test("owner security bootstrap retries only the same protected endpoint once", () => {
  const client = frontend("services/adminApi.js");
  assert.match(client, /await sleep\(300\)/);
  assert.match(client, /application-owner/);
  assert.match(client, /_ownerRetry:\s*1/);
  assert.doesNotMatch(client, /OWNER_ONLY.*return true/);
});

test("PDKS has exactly the five requested workflow groups and real device routes", () => {
  const registry = frontend("app/pdksModuleRegistryPatch.js");
  const shell = frontend("pages/modules/PdksPage.jsx");
  const deviceUi = frontend("pages/pdks/PdksDeviceCenter.jsx");
  const master = api("ik-pdks-master.ts");
  const deviceAdmin = api("ik-pdks-device-admin.ts");
  for (const label of ["Günlük", "Personel & İK", "Tanımlar", "Terminal & Sistem", "Rapor & Denetim"]) {
    assert.match(registry, new RegExp(`label: \\"${label.replace(/[&]/g, "&")}\\"`));
  }
  assert.match(registry, /cihaz-baglantilari/);
  assert.match(registry, /\["senkron", "Senkronizasyon"/);
  assert.doesNotMatch(shell, /const NAV_GROUPS/);
  assert.doesNotMatch(shell, /pdks-command-nav/);
  assert.match(shell, /PdksDeviceCenter/);
  assert.match(master, /registerIkPdksDeviceAdminRoutes\(app\)/);
  assert.match(master, /registerIkPdksDeviceRoutes\(app\)/);
  assert.match(deviceAdmin, /\/api\/ik\/personnel-control\/devices/);
  assert.match(deviceAdmin, /device-sync-logs/);
  assert.match(deviceAdmin, /Başka firmanın PDKS cihazları yönetilemez/);
  assert.match(deviceUi, /Son Heartbeat/);
  assert.match(deviceUi, /Senkronizasyon Geçmişi/);
});
