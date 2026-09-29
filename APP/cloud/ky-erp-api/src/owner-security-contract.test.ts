import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

const owner = source("owner-security-cloud.ts");
const main = source("main.ts");
const adminApi = frontend("services/adminApi.js");
const ownerPage = frontend("pages/admin/AdminOwnerSecurity.jsx");
const usersPage = frontend("pages/admin/AdminUsersPanelV2.jsx");

test("owner challenge insert has one placeholder for every bound value", () => {
  const block = owner.slice(owner.indexOf("async function createChallenge"), owner.indexOf("async function challengeByToken"));
  const values = block.match(/VALUES\s*\(([^)]+)\)/)?.[1] || "";
  assert.equal((values.match(/\?/g) || []).length, 13);
  assert.match(values, /^\?,\?,\?,\?,\?,\?,\?,\?,\?,0,0,1,\?,\?,\?,\?$/);
});

test("MFA renewal is step-up scoped, staged and committed in one D1 batch", () => {
  const start = owner.slice(owner.indexOf("mfa-renew/:provider/start"), owner.indexOf("mfa-renew/:provider/confirm"));
  const confirm = owner.slice(owner.indexOf("mfa-renew/:provider/confirm"), owner.indexOf("email-verification/delivery"));
  assert.match(start, /!reauth \|\| !reauth\.verified_at/);
  assert.match(start, /REAUTH_SCOPE_INVALID/);
  assert.match(start, /purpose: "MFA_RENEW_PENDING"/);
  assert.doesNotMatch(start, /UPDATE auth_user_security SET (?:google|microsoft)_mfa_secret/);
  assert.match(confirm, /verifyTotp\(text\(meta\.pendingSecret\), body\.code\)/);
  assert.match(confirm, /await c\.env\.DB\.batch\(\[/);
  assert.match(confirm, /auth_owner_recovery_challenges SET verified_at=\?,consumed_at=\?/);
  assert.match(confirm, /revokeAfterMfaChangeStatements/);
});

test("owner MFA security flow cannot be crafted for another user", () => {
  assert.match(owner, /function ownerSelfTargetId\(current: AnyRow, requested: unknown\)/);
  assert.match(owner, /targetId === currentId \? currentId : ""/);
  assert.match(owner, /const targetId = ownerSelfTargetId\(current, body\.targetUserId\)/);
  assert.match(owner, /const targetId = ownerSelfTargetId\(current, c\.req\.param\("id"\)\)/);
  assert.match(owner, /OWNER_SELF_ONLY/);
  const emailVerify = owner.slice(owner.indexOf("reauth/email/verify"), owner.indexOf("mfa-renew/:provider/start"));
  assert.match(emailVerify, /text\(meta\.targetUserId\) !== text\(current\.id\)/);
});

test("legacy reset cannot bypass secure renewal", () => {
  assert.match(main, /const legacyReset =/);
  assert.match(main, /reset-mfa/);
  assert.match(main, /code: "MFA_REAUTH_REQUIRED"/);
  assert.match(main, /}, 409\)/);
  assert.match(adminApi, /Doğrudan Authenticator sıfırlama kapalıdır/);
  assert.doesNotMatch(usersPage, /resetUserMfa/);
});

test("application owner is removed from managed users on both server and client", () => {
  assert.match(owner, /app\.get\("\/api\/admin\/managed-users"/);
  assert.match(owner, /if \(isOwner\(role\)\) return false/);
  assert.match(adminApi, /apiGet\("\/admin\/managed-users"/);
  assert.match(adminApi, /withoutApplicationOwner/);
  assert.match(adminApi, /\["SUPER_ADMIN", "ADMIN"\]\.includes/);
});

test("mail verification uses the canonical sender and requires provider acceptance id", () => {
  const management = source("admin-management-cloud.ts");
  const policy = source("auth-policy-cloud.ts");
  for (const content of [management, owner, policy]) assert.match(content, /KY ERP <admin@kyerp\.net>/);
  assert.match(management, /if \(!messageId\) throw new Error/);
  assert.match(management, /deliveryStatus:"PROVIDER_ACCEPTED"/);
  assert.match(owner, /resendDelivery/);
  assert.match(owner, /DELIVERY_SCOPE_INVALID/);
  assert.match(policy, /const email = Boolean\(env\.RESEND_API_KEY \|\| env\.RECOVERY_EMAIL_WEBHOOK_URL\)/);
  assert.doesNotMatch(policy, /!env\.RESEND_API_KEY \|\| !env\.RECOVERY_EMAIL_FROM/);
});

test("technical roles never use Turkish locale uppercasing", () => {
  const names = [
    "auth-cloud.ts",
    "auth-policy-cloud.ts",
    "auth-policy-owner-guard.ts",
    "auth-policy-recovery-code.ts",
    "admin-core-cloud.ts",
    "owner-security-cloud.ts",
  ];
  for (const name of names) {
    const content = source(name);
    assert.doesNotMatch(content, /toLocaleUpperCase\("tr-TR"\)/, name);
    assert.match(content, /toUpperCase\(\)\.replace\(\/İ\/g, "I"\)/, name);
  }
});

test("owner page sends an explicit provider and renders the staged QR", () => {
  assert.match(ownerPage, /reauthOwnerWithPassword\(\{ password: reauthPassword, targetUserId: owner\.id, provider: renewProvider \}\)/);
  assert.match(ownerPage, /startOwnerEmailReauth\(\{ targetUserId: owner\.id, provider: renewProvider \}\)/);
  assert.match(ownerPage, /startSecureMfaRenewal\(owner\.id, renewProvider/);
  assert.match(ownerPage, /confirmSecureMfaRenewal\(owner\.id, renewProvider/);
  assert.match(ownerPage, /window\.QRCode/);
});
