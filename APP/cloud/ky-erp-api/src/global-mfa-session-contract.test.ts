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

test("password-only login cannot be configured through canonical admin writes", () => {
  assert.match(entry, /MFA_LOGIN_POLICIES/);
  assert.match(entry, /normalizeMfaPolicy/);
  assert.match(entry, /isPolicyWrite/);
  assert.match(entry, /body\.loginPolicy = normalizeMfaPolicy\(body\.loginPolicy\)/);
  assert.match(entry, /enforceMfaBaselineForLogin/);
  assert.match(entry, /session_seconds=36000/);
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

test("one-time MFA transition revokes only auth sessions and is idempotent", () => {
  assert.match(transition, /UPDATE auth_user_security/);
  assert.match(transition, /UPDATE auth_sessions/);
  assert.match(transition, /GLOBAL_MFA_ENFORCED_V1/);
  assert.match(transition, /NOT EXISTS/);
  assert.doesNotMatch(transition, /DELETE\s+FROM/i);
  assert.doesNotMatch(transition, /DROP\s+TABLE/i);
});

test("real Resend mail verification remains in the combined security release", () => {
  assert.match(mail, /https:\/\/api\.resend\.com\/emails/);
  assert.match(mail, /providerMessageId/);
  assert.match(mail, /USER_EMAIL_VERIFY/);
  assert.match(mail, /replace\(\/İ\/g, "I"\)/);
});
