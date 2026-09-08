import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const worker = (name: string) => readFileSync(resolve(here, name), "utf8");
const repoFile = (name: string) => readFileSync(resolve(root, name), "utf8");

const auth = worker("auth-cloud.ts");
const push = worker("auth-push-cloud.ts");
const notifications = worker("notifications-cloud.ts");
const shell = repoFile("APP/app/ky-erp-frontend/src/layouts/AppShellV3.jsx");
const serviceWorker = repoFile("APP/app/ky-erp-frontend/public/kyerp-push-sw.js");

test("every signed-in user can only read and revoke own profile sessions", () => {
  assert.match(auth, /app\.get\("\/api\/auth\/security\/sessions"/);
  assert.match(auth, /WHERE s\.user_id=\?/);
  assert.match(auth, /String\(session\.user_id\) !== String\(current\.id\)/);
  assert.match(auth, /SESSION_SELF_REVOKED/);
});

test("notification feed marks login and mail approvals as actionable", () => {
  assert.match(notifications, /type: "LOGIN"/);
  assert.match(notifications, /type: "MAIL_ACCOUNT"/);
  assert.match(notifications, /actions: \["APPROVE", "REJECT"\]/);
  assert.match(notifications, /ownerRole\(current\?\.role\)/);
  assert.match(notifications, /companyAdminRole\(current\?\.role\)/);
  assert.match(notifications, /friendlyDeviceLabel\(row\.device_label, row\.user_agent\)/);
  assert.match(notifications, /Android telefon/);
  assert.match(notifications, /Windows bilgisayar/);
});

test("platform admin module remains routable but is removed from left navigation", () => {
  assert.match(shell, /modules\.filter\(\(module\) => module\.key !== "admin"\)/);
  assert.match(shell, /onOpenTab\("admin", "admin-yonetim-ozeti"\)/);
});

test("phone push uses one replaceable notification and one pending challenge per browser", () => {
  assert.match(push, /PHONE_LOGIN_APPROVAL_REUSED/);
  assert.match(push, /text\(row\.deviceLabel\) === sourceDeviceLabel/);
  assert.match(serviceWorker, /tag: "kyerp-security-pending"/);
  assert.match(serviceWorker, /renotify: false/);
  assert.match(serviceWorker, /closeLegacyApprovalNotifications/);
  assert.doesNotMatch(serviceWorker, /kyerp-result-\$\{data\.id\}/);
});


test("cross-user active sessions and session history are super-admin only", () => {
  const history = worker("auth-admin-history.ts");
  const companyOverview = repoFile("APP/app/ky-erp-frontend/src/pages/admin/AdminCompanyOverview.jsx");
  assert.match(auth, /Tüm kullanıcı oturumlarını yalnız Süper Yönetici görüntüleyebilir/);
  assert.match(auth, /Başka kullanıcı oturumlarını yalnız Süper Yönetici sonlandırabilir/);
  assert.match(history, /Tüm kullanıcı oturum geçmişini yalnız Süper Yönetici görüntüleyebilir/);
  assert.doesNotMatch(companyOverview, /listActiveSessions/);
  assert.doesNotMatch(companyOverview, /Aktif Oturum/);
});
