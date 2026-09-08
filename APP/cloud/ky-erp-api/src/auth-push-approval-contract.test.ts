import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const worker = (name: string) => readFileSync(resolve(here, name), "utf8");
const repoFile = (name: string) => readFileSync(resolve(root, name), "utf8");

const push = worker("auth-push-cloud.ts");
const policy = worker("auth-policy-cloud.ts");
const main = worker("main.ts");
const mailEntry = worker("main-entry-mail.ts");
const login = repoFile("APP/app/ky-erp-frontend/src/pages/LoginPage.jsx");
const authContext = repoFile("APP/app/ky-erp-frontend/src/context/AuthContext.jsx");
const serviceWorker = repoFile("APP/app/ky-erp-frontend/public/kyerp-push-sw.js");
const companySettings = repoFile("APP/app/ky-erp-frontend/src/pages/admin/AdminCompanySettings.jsx");
const phoneSetup = repoFile("APP/app/ky-erp-frontend/src/components/shell/PhoneApprovalSetup.jsx");
const phoneInbox = repoFile("APP/app/ky-erp-frontend/src/components/shell/PhoneApprovalInboxBridge.jsx");
const securityApp = repoFile("APP/app/ky-erp-frontend/public/security/app.js");
const securityHtml = repoFile("APP/app/ky-erp-frontend/public/security/index.html");
const securityWorker = repoFile("APP/app/ky-erp-frontend/public/security/sw.js");
const securityManifest = repoFile("APP/app/ky-erp-frontend/public/security/manifest.webmanifest");

test("phone approval uses existing tenant json_store and needs no new production migration", () => {
  assert.match(push, /AUTH_PUSH_DEVICE/);
  assert.match(push, /AUTH_PHONE_LOGIN/);
  assert.match(push, /AUTH_COMPANY_LOGIN_APPROVAL/);
  assert.match(push, /FROM json_store/);
  assert.match(push, /INSERT INTO json_store/);
  assert.match(push, /tableExists\(c, "json_store"\)/);
  assert.match(push, /if \(!\(await tableExists\(c, "json_store"\)\)\) return \[\]/);
  assert.doesNotMatch(push, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});

test("security-app enrollment requires password step-up, stores token hash and retires legacy browser enrollment", () => {
  assert.match(push, /compare\(password, text\(user\.password_hash\)\)/);
  assert.match(push, /deviceTokenHash/);
  assert.match(push, /await sha256\(deviceToken\)/);
  assert.doesNotMatch(push, /device_token\s+TEXT/i);
  assert.doesNotMatch(push, /p256dhKey|authKey/);
  assert.match(push, /PUSH_ENDPOINT_ALREADY_BOUND/);
  assert.match(push, /LEGACY_PHONE_APPROVAL_RETIRED/);
  assert.match(push, /securityAppUrl: "https:\/\/app\.kyerp\.net\/security\/"/);
});

test("VAPID signing key stays server-side and push uses standard VAPID authorization", () => {
  assert.match(push, /VAPID_P256_KEYPAIR_V1/);
  assert.match(push, /auth_system_secrets/);
  assert.match(push, /ECDSA/);
  assert.match(push, /namedCurve: "P-256"/);
  assert.match(push, /Authorization: auth\.value/);
  assert.match(push, /vapid t=/);
});

test("phone approval is primary while Authenticator remains an explicit fallback", () => {
  assert.match(policy, /startPhoneApprovalChallenge/);
  assert.match(policy, /PHONE_APPROVAL_PENDING/);
  assert.match(policy, /phone-approval\/:id\/fallback/);
  assert.match(policy, /skipPhone: true/);
  assert.match(login, /Telefonunuza bildirim gönderildi/);
  assert.match(login, /6 haneli kod ile devam et/);
  assert.match(authContext, /useAuthenticatorFallback/);
});

test("company owner is default approver and application owner notifications are optional", () => {
  assert.match(push, /notifyCompanyOwner: row \? row\.notifyCompanyOwner !== false : true/);
  assert.match(push, /notifyApplicationOwner: row \? Boolean\(row\.notifyApplicationOwner\) : false/);
  assert.match(push, /isCompanyAdmin\(actor\.role\)/);
  assert.match(push, /isSuper\(actor\.role\)/);
  assert.match(companySettings, /Firma Sahibi \/ İşveren telefonuna onay bildirimi gönder/);
  assert.match(companySettings, /Süper Yöneticiye de onay bildirimi gönder/);
});

test("service worker decisions use device capability headers and native approve deny actions", () => {
  assert.match(main, /X-KYERP-Push-Device/);
  assert.match(main, /X-KYERP-Push-Token/);
  assert.match(mailEntry, /X-KYERP-Push-Device/);
  assert.match(mailEntry, /X-KYERP-Push-Token/);
  assert.match(serviceWorker, /X-KYERP-Push-Device/);
  assert.match(serviceWorker, /X-KYERP-Push-Token/);
  assert.match(serviceWorker, /action: "approve"/);
  assert.match(serviceWorker, /action: "deny"/);
  assert.match(serviceWorker, /auth\/push\/device\/decision/);
  assert.match(serviceWorker, /stableNotificationTag/);
  assert.match(serviceWorker, /renotify: false/);
  assert.match(serviceWorker, /localUnlockRequired/);
  assert.doesNotMatch(serviceWorker, /kyerp-result-/);
});

test("authenticated shell creates one-time security-app enrollment while password step-up happens on the phone", () => {
  assert.match(phoneSetup, /security-enrollment\/start/);
  assert.match(phoneSetup, /Yeni Kurulum Kodu Oluştur/);
  assert.match(phoneSetup, /app\.kyerp\.net\/security/);
  assert.match(push, /security-enrollment\/complete/);
  assert.match(push, /compare\(password, text\(user\.password_hash\)\)/);
  assert.match(push, /AUTH_PUSH_SECURITY_ENROLLMENT/);
  assert.match(securityApp, /security-enrollment\/complete/);
  assert.match(securityHtml, /autocomplete="current-password"/);
});

test("dedicated iPhone and Android security app opens the app for approval instead of relying on notification action buttons", () => {
  assert.match(securityManifest, /"name": "KY ERP Güvenlik"/);
  assert.match(securityManifest, /"scope": "\/security\/"/);
  assert.match(securityWorker, /notificationclick/);
  assert.match(securityWorker, /focusOrOpen/);
  assert.doesNotMatch(securityWorker, /action:"approve"/);
  assert.doesNotMatch(securityWorker, /action:"deny"/);
  assert.match(securityApp, /navigator\.credentials\.create/);
  assert.match(securityApp, /navigator\.credentials\.get/);
  assert.match(securityApp, /userVerification:"required"/);
  assert.match(phoneSetup, /Ana Ekrana Ekle/);
});

test("json_store phone challenge uses camelCase while legacy manager approval stays SQL snake_case", () => {
  assert.match(policy, /phoneApprovalExpiresAt: approval\.expiresAt/);
  assert.match(policy, /approval\.consumedAt/);
  assert.match(policy, /approval\.userId/);
  assert.match(policy, /deviceLabel: approval\.deviceLabel/);
  assert.match(policy, /userAgent: approval\.userAgent/);
  assert.match(policy, /ipAddress: approval\.ipAddress/);
  assert.doesNotMatch(policy, /phoneApprovalExpiresAt: approval\.expires_at/);
  assert.match(policy, /approvalExpiresAt: approval\.expires_at/);
  assert.match(policy, /approval\.consumed_at/);
  assert.match(policy, /approval\.user_id/);
});

test("legacy direct MFA reset remains fail-closed", () => {
  assert.match(main, /MFA_REAUTH_REQUIRED/);
  assert.match(main, /reset-mfa/);
});


test("push approval hides raw browser ids and uses Android friendly device labels", () => {
  assert.match(push, /function friendlyDeviceLabel/);
  assert.match(push, /Android telefon/);
  assert.match(push, /Android tablet/);
  assert.match(push, /friendlyDeviceLabel\(current\.deviceLabel, current\.userAgent\)/);
  assert.match(push, /friendlyDeviceLabel\(row\.device_label, row\.user_agent\)/);
  assert.match(serviceWorker, /vibrate: \[180, 80, 180\]/);
  assert.match(push, /supersedeOlderSelfChallenges/);
  assert.match(push, /SUPERSEDED/);
  assert.match(policy, /PHONE_APPROVAL_SUPERSEDED/);
});


test("phone approval keeps one latest self request, one visible notification and serialized status checks", () => {
  assert.match(push, /let latestSelfPending = ""/);
  assert.match(push, /dedupeKey: `self:/);
  assert.match(push, /idempotent: true/);
  assert.match(serviceWorker, /stableNotificationTag/);
  assert.match(serviceWorker, /renotify: false/);
  assert.doesNotMatch(serviceWorker, /kyerp-result-/);
  assert.match(securityWorker, /tag:"kyerp-security-approval"/);
  assert.match(securityWorker, /renotify:false/);
  assert.match(securityApp, /createSigningKey/);
  assert.match(securityApp, /signDecision/);
  assert.match(securityApp, /navigator\.credentials\.get/);
  assert.match(login, /phoneApprovalCheckRef/);
  assert.match(login, /state\.busy \|\| state\.settled/);
});
