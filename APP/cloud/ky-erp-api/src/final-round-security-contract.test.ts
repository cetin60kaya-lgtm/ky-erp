import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../../");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("final round: aktif giriş yalnız MFA tabanlıdır", () => {
  const entry = read("APP/cloud/ky-erp-api/src/main-entry.ts");
  const adminUi = read("APP/app/ky-erp-frontend/src/pages/admin/AdminUsersPanelV2.jsx");
  const cutover = read("DEPLOY/KYERP_FINAL_ROUND_SECURITY_CUTOVER_V1.sql");

  assert.match(entry, /const MFA_LOGIN_POLICIES = new Set\(\["GOOGLE", "MICROSOFT", "ANY_MFA", "BOTH_MFA"\]\)/);
  assert.match(entry, /AUTH_SECURITY_BASELINE_UNAVAILABLE/);
  assert.match(adminUi, /const LOGIN_POLICIES=\[\["GOOGLE"/);
  assert.doesNotMatch(adminUi, /\["PASSWORD_ONLY","Sadece parola"\]/);
  assert.match(cutover, /login_policy[\s\S]*'ANY_MFA'/);
  assert.match(cutover, /session_seconds = 36000/);
  assert.match(cutover, /FINAL_SECURITY_MAIL_ISNET_CUTOVER_20260901_V1/);
});

test("final round: owner oturum ve gerçek mail akışı korunur", () => {
  const ui = read("APP/app/ky-erp-frontend/src/pages/admin/AdminUsersPanelV2.jsx");
  const auth = read("APP/cloud/ky-erp-api/src/auth-cloud.ts");
  const mail = read("APP/cloud/ky-erp-api/src/admin-management-cloud.ts");
  const wrangler = JSON.parse(read("APP/cloud/ky-erp-api/wrangler.jsonc"));

  assert.match(ui, /Tüm Aktif Oturumlar/);
  assert.match(ui, /Güvenli Çıkış/);
  assert.match(ui, /Oturumu Sonlandır/);
  assert.match(auth, /\/api\/admin\/security\/sessions\/:id\/revoke/);
  assert.match(auth, /\/api\/admin\/security\/users\/:id\/revoke-all/);
  assert.match(auth, /\/api\/auth\/logout/);
  assert.match(mail, /https:\/\/api\.resend\.com\/emails/);
  assert.match(mail, /providerMessageId|messageId/);
  assert.deepEqual(wrangler?.secrets?.required, ["RESEND_API_KEY"]);
  assert.equal(wrangler?.vars?.RECOVERY_EMAIL_FROM, "KY ERP <admin@kyerp.net>");
});

test("final round: İşNet tenant, partial ve D1 guard sözleşmesi", () => {
  const tenant = read("APP/cloud/ky-erp-api/src/isnet-tenant-guard.ts");
  const outgoing = read("APP/cloud/ky-erp-api/src/isnet-outgoing-recovery.ts");
  const frontend = read("APP/app/ky-erp-frontend/src/services/isnetApi.js");
  const backfill = read("APP/cloud/ky-erp-api/migrations/0027_isnet_tenant_scope_backfill.sql");
  const guard = read("APP/cloud/ky-erp-api/migrations/0028_isnet_tenant_scope_guard.sql");

  assert.match(tenant, /MAIN_COMPANY_REQUIRED/);
  assert.match(tenant, /MAIN_COMPANY_FORBIDDEN/);
  assert.match(outgoing, /PARTIAL_REVIEW_REQUIRED/);
  assert.match(outgoing, /transportComplete/);
  assert.match(outgoing, /persistenceErrors/);
  assert.match(frontend, /resolveMainCompanySlug/);
  assert.match(frontend, /PARTIAL_REVIEW_REQUIRED/);
  assert.match(frontend, /outgoingInvoices/);
  assert.match(frontend, /outgoingDispatches/);
  assert.match(backfill, /scope LIKE 'ISNET_%'/);
  assert.match(guard, /trg_isnet_json_store_tenant_insert/);
  assert.match(guard, /trg_isnet_json_store_tenant_update/);
  assert.match(guard, /ISNET_TENANT_REQUIRED/);
});
