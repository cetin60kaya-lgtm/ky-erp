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
const login = repoFile("APP/app/ky-erp-frontend/src/pages/LoginPage.jsx");
const authContext = repoFile("APP/app/ky-erp-frontend/src/context/AuthContext.jsx");
const serviceWorker = repoFile("APP/app/ky-erp-frontend/public/kyerp-push-sw.js");
const companySettings = repoFile("APP/app/ky-erp-frontend/src/pages/admin/AdminCompanySettings.jsx");
const phoneSetup = repoFile("APP/app/ky-erp-frontend/src/components/shell/PhoneApprovalSetup.jsx");
const phoneInbox = repoFile("APP/app/ky-erp-frontend/src/components/shell/PhoneApprovalInboxBridge.jsx");

test("phone approval uses existing tenant json_store and needs no new production migration", () => {
  assert.match(push, /AUTH_PUSH_DEVICE/);
  assert.match(push, /AUTH_PHONE_LOGIN/);
  assert.match(push, /AUTH_COMPANY_LOGIN_APPROVAL/);
  assert.match(push, /FROM json_store/);
  assert.match(push, /INSERT INTO json_store/);
  assert.doesNotMatch(push, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});

test("trusted push device enrollment requires password step-up and stores only a token hash", () => {
  assert.match(push, /compare\(password, text\(user\.password_hash\)\)/);
  assert.match(push, /deviceTokenHash/);
  assert.match(push, /await sha256\(deviceToken\)/);
  assert.doesNotMatch(push, /device_token\s+TEXT/i);
  assert.match(push, /PUSH_ENDPOINT_ALREADY_BOUND/);
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
  assert.match(companySettings, /Uygulama Sahibine de onay bildirimi gönder/);
});

test("service worker decisions use device capability headers and native approve deny actions", () => {
  assert.match(main, /X-KYERP-Push-Device/);
  assert.match(main, /X-KYERP-Push-Token/);
  assert.match(serviceWorker, /X-KYERP-Push-Device/);
  assert.match(serviceWorker, /X-KYERP-Push-Token/);
  assert.match(serviceWorker, /action: "approve"/);
  assert.match(serviceWorker, /action: "deny"/);
  assert.match(serviceWorker, /auth\/push\/device\/decision/);
});

test("every user can register a phone from the authenticated shell but registration is not session-only", () => {
  assert.match(phoneSetup, /Mevcut şifreniz/);
  assert.match(phoneSetup, /Bildirimleri Aç ve Bu Cihazı Kaydet/);
  assert.match(phoneSetup, /auth\/push\/devices\/register/);
  assert.match(phoneSetup, /KYERP_PUSH_CREDENTIALS/);
});

test("iPhone fallback does not depend on notification action buttons", () => {
  assert.match(serviceWorker, /kyerpPhoneApproval=1/);
  assert.match(serviceWorker, /KYERP_PUSH_PENDING_WAKE/);
  assert.match(serviceWorker, /userVisibleOnly/);
  assert.match(phoneSetup, /Ana Ekrana Ekle/);
  assert.match(phoneSetup, /isStandaloneWebApp/);
  assert.match(phoneInbox, /visibilitychange/);
  assert.match(phoneInbox, /pageshow/);
  assert.match(phoneInbox, /auth\/push\/device\/pending/);
  assert.match(phoneInbox, /Onayla/);
  assert.match(phoneInbox, /Reddet/);
});

test("legacy direct MFA reset remains fail-closed", () => {
  assert.match(main, /MFA_REAUTH_REQUIRED/);
  assert.match(main, /reset-mfa/);
});
