import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "main-entry.ts"), "utf8");
const mail = readFileSync(resolve(here, "admin-management-cloud.ts"), "utf8");
const panel = readFileSync(resolve(here, "../../../app/ky-erp-frontend/src/pages/admin/AdminUsersPanelV2.jsx"), "utf8");
const transition = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_ENFORCE_MFA_AND_REVOKE_SESSIONS_V1.sql"), "utf8");
const securityRelease = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_SECURITY_RELEASE_V1.ps1"), "utf8");
const finalRelease = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_FINAL_ROUND_RELEASE_20260901_V3.ps1"), "utf8");

test("password-only login cannot be configured through canonical admin writes", () => {
  assert.match(entry, /MFA_LOGIN_POLICIES/);
  assert.match(entry, /normalizeMfaPolicy/);
  assert.match(entry, /isPolicyWrite/);
  assert.match(entry, /body\.loginPolicy = normalizeMfaPolicy\(body\.loginPolicy\)/);
  assert.match(entry, /enforceMfaBaselineForLogin/);
  assert.match(entry, /session_seconds=36000/);
});

test("login MFA baseline is fail-closed and verified before auth engine execution", () => {
  assert.match(entry, /AUTH_USER_SECURITY_ROW_MISSING/);
  assert.match(entry, /AUTH_MFA_BASELINE_VERIFY_FAILED/);
  assert.match(entry, /SELECT login_policy,session_seconds/);
  assert.match(entry, /AUTH_SECURITY_BASELINE_UNAVAILABLE/);
  assert.match(entry, /const mfaBaseline = await enforceMfaBaselineForLogin\(request, env\)/);
  assert.match(entry, /if \(mfaBaseline\.applicable && !mfaBaseline\.ok\)/);
  assert.match(entry, /const canonicalRequest = await canonicalizeAdminWrite\(request\)/);
  assert.match(entry, /const response = await shell\.fetch\(canonicalRequest, env, executionCtx\)/);
  assert.match(entry, /Access-Control-Allow-Origin/);
  assert.doesNotMatch(entry, /Access-Control-Allow-Origin", "\*"/);
});

test("technical role and module codes are canonicalized at write boundary", () => {
  assert.match(entry, /isUserWrite/);
  assert.match(entry, /body\.role = upper\(body\.role\)/);
  assert.match(entry, /body\.roleOverride = upper\(body\.roleOverride\)/);
  assert.match(entry, /moduleKey: upper\(row\.moduleKey\)/);
  assert.match(entry, /module_key: upper\(row\.module_key\)/);
});

test("admin UI exposes owner-wide session control and secure current-session logout", () => {
  assert.match(panel, /const LOGIN_POLICIES=\[\["GOOGLE"/);
  assert.doesNotMatch(panel, /\[\["PASSWORD_ONLY","Sadece parola"\]/);
  assert.match(panel, /sessionIdFromToken/);
  assert.match(panel, /visibleSessions=useMemo\(\(\)=>isOwner\?sessions:selectedSessions/);
  assert.match(panel, /Güvenli Çıkış/);
  assert.match(panel, /Oturumu Sonlandır/);
  assert.match(panel, /await logout\(\)/);
});

test("one-time MFA transition revokes only auth sessions and canonicalizes technical codes", () => {
  assert.match(transition, /UPDATE auth_users/);
  assert.match(transition, /UPDATE auth_user_security/);
  assert.match(transition, /UPDATE auth_user_module_permissions/);
  assert.match(transition, /REPLACE\(UPPER\(TRIM/);
  assert.match(transition, /UPDATE auth_sessions/);
  assert.match(transition, /GLOBAL_MFA_ENFORCED_V1/);
  assert.match(transition, /NOT EXISTS/);
  assert.doesNotMatch(transition, /DELETE\s+FROM/i);
  assert.doesNotMatch(transition, /DROP\s+TABLE/i);
});

test("security compatibility entry delegates to the canonical final release", () => {
  assert.match(securityRelease, /KYERP_FINAL_ROUND_RELEASE_20260901_V3\.ps1/);
  assert.match(securityRelease, /canonical final zincire yonlendiriliyor/);
});

test("canonical security release verifies missing security rows policies roles modules and tenant guards", () => {
  assert.match(finalRelease, /missing_security/);
  assert.match(finalRelease, /missing_company/);
  assert.match(finalRelease, /unsafe_policy/);
  assert.match(finalRelease, /unsafe_role/);
  assert.match(finalRelease, /unsafe_module/);
  assert.match(finalRelease, /global_isnet/);
  assert.match(finalRelease, /isnet_guard_triggers/);
  assert.match(finalRelease, /auth_guard_triggers/);
  assert.match(finalRelease, /auth_user_security kaydi eksik kullanici var/);
});

test("real Resend mail verification remains in the combined security release", () => {
  assert.match(mail, /https:\/\/api\.resend\.com\/emails/);
  assert.match(mail, /providerMessageId/);
  assert.match(mail, /USER_EMAIL_VERIFY/);
  assert.match(mail, /replace\(\/İ\/g, "I"\)/);
});
