import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../../");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("final round: aktif giris yalniz MFA tabanlidir", () => {
  const entry = read("APP/cloud/ky-erp-api/src/main-entry.ts");
  const main = read("APP/cloud/ky-erp-api/src/main.ts");
  const adminUi = read("APP/app/ky-erp-frontend/src/pages/admin/AdminUsersPanelV2.jsx");
  const cutover = read("DEPLOY/KYERP_FINAL_ROUND_SECURITY_CUTOVER_V1.sql");
  const authGuard = read("APP/cloud/ky-erp-api/migrations/0029_auth_security_policy_guard.sql");

  assert.match(entry, /const MFA_LOGIN_POLICIES = new Set\(\["GOOGLE", "MICROSOFT", "ANY_MFA", "BOTH_MFA"\]\)/);
  assert.match(entry, /AUTH_SECURITY_BASELINE_UNAVAILABLE/);
  assert.match(main, /const PASSWORD_SESSION_SECONDS = 0/);
  assert.match(main, /passwordOnlyEnabled: false/);
  assert.match(adminUi, /const LOGIN_POLICIES=\[\["GOOGLE"/);
  assert.doesNotMatch(adminUi, /\["PASSWORD_ONLY","Sadece parola"\]/);
  assert.match(cutover, /login_policy[\s\S]*'ANY_MFA'/);
  assert.match(cutover, /session_seconds = 36000/);
  assert.match(cutover, /FINAL_SECURITY_MAIL_ISNET_CUTOVER_20260901_V1/);
  assert.match(authGuard, /AUTH_MFA_POLICY_REQUIRED/);
  assert.match(authGuard, /trg_auth_security_mfa_insert/);
  assert.match(authGuard, /trg_auth_security_mfa_update/);
  assert.match(authGuard, /'GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA'/);
});

test("final round: owner oturum ve gercek mail akisi korunur", () => {
  const ui = read("APP/app/ky-erp-frontend/src/pages/admin/AdminUsersPanelV2.jsx");
  const auth = read("APP/cloud/ky-erp-api/src/auth-cloud.ts");
  const mail = read("APP/cloud/ky-erp-api/src/admin-management-cloud.ts");
  const wrangler = JSON.parse(read("APP/cloud/ky-erp-api/wrangler.jsonc"));

  assert.match(ui, /Tum Aktif Oturumlar|Tüm Aktif Oturumlar/);
  assert.match(ui, /Guvenli Cikis|Güvenli Çıkış/);
  assert.match(ui, /Oturumu Sonlandir|Oturumu Sonlandır/);
  assert.match(auth, /\/api\/admin\/security\/sessions\/:id\/revoke/);
  assert.match(auth, /\/api\/admin\/security\/users\/:id\/revoke-all/);
  assert.match(auth, /\/api\/auth\/logout/);
  assert.match(mail, /https:\/\/api\.resend\.com\/emails/);
  assert.match(mail, /providerMessageId|messageId/);
  assert.deepEqual(wrangler?.secrets?.required, ["RESEND_API_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"]);
  assert.equal(wrangler?.vars?.RECOVERY_EMAIL_FROM, "KY ERP <admin@kyerp.net>");
});

test("final round: IsNet tenant, partial ve D1 guard sozlesmesi", () => {
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

test("final round: clean V4 release Worker'i secret put oncesi aktif eder ve maskeli key penceresi kullanir", () => {
  const release = read("DEPLOY/KYERP_FINAL_ROUND_RELEASE_20260901_V4.ps1");
  const prompt = read("DEPLOY/KYERP_RESEND_KEY_PROMPT_GUI.ps1");
  const repair = read("DEPLOY/KYERP_RESEND_ACTIVE_SECRET_REPAIR.ps1");
  const direct = read("DEPLOY/KYERP_DIRECT_PRODUCTION_V3.ps1");
  const bat = read("KY ERP FINAL TUR CANLIYA AL.bat");

  assert.match(release, /KYERP_DIRECT_PRODUCTION\.ps1/);
  assert.match(release, /KYERP_RESEND_KEY_PROMPT_GUI\.ps1/);
  assert.match(release, /wrangler secret put RESEND_API_KEY/);
  assert.match(release, /api\.resend\.com\/emails/);
  assert.match(release, /worker activation deploy/);
  assert.doesNotMatch(release, /versions secret put/);
  assert.ok(
    release.indexOf("wrangler deploy --config $CONFIG") < release.indexOf("wrangler secret put RESEND_API_KEY"),
    "latest Worker source must be deployed before standard secret put",
  );
  assert.match(prompt, /UseSystemPasswordChar = \$true/);
  assert.match(prompt, /StartsWith\("re_"\)/);
  assert.match(repair, /KYERP_RESEND_KEY_PROMPT_GUI\.ps1/);
  assert.match(repair, /worker activation deploy/);
  assert.match(repair, /wrangler secret put \$SECRET_NAME/);
  assert.doesNotMatch(repair, /versions secret put/);
  assert.ok(
    repair.indexOf("wrangler deploy --config $WRANGLER_CONFIG") < repair.indexOf("wrangler secret put $SECRET_NAME"),
    "repair must activate latest Worker before standard secret put",
  );
  assert.match(release, /0027_isnet_tenant_scope_backfill\.sql/);
  assert.match(release, /0028_isnet_tenant_scope_guard\.sql/);
  assert.match(release, /0029_auth_security_policy_guard\.sql/);
  assert.match(release, /unsafe_policy/);
  assert.match(release, /auth_guard_triggers/);
  assert.match(release, /global_isnet/);
  assert.match(release, /old_active_sessions/);
  assert.match(release, /api\/health/);
  assert.match(release, /api\/auth\/status/);
  assert.match(direct, /passwordOnlyEnabled/);
  assert.match(direct, /passwordOnlySeconds -ne 0/);
  assert.match(bat, /Language\.Parser/);
  assert.match(bat, /git pull --ff-only/);
  assert.match(bat, /chcp 65001/);
  assert.match(bat, /NO_COLOR=1/);
  assert.match(bat, /KYERP_FINAL_ROUND_RELEASE_20260901_V4\.ps1/);
});
