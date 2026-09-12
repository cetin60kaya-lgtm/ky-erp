import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Security Center exposes scoped operational tabs", async () => {
  const source = await read("pages/admin/SecurityCenterPanel.jsx");
  for (const label of ["Onaylar", "Oturumlar", "Güvenlik Akışı", "Bildirimler", "Firma Yetkilileri", "Sadece Ben Kalayım"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /scopeType/);
  assert.match(source, /runPhoneApprovedSecurityAction/);
  assert.match(source, /SESSION_TRUST_APPROVE/);
  assert.match(source, /SECURITY_CAPABILITY_SET/);
  assert.match(source, /SUPER_ADMIN_GRANT/);
});

test("normal user profile Security opens self center before device setup", async () => {
  const wrapper = await read("components/shell/PhoneApprovalSetup.jsx");
  assert.match(wrapper, /SecurityCenterPanel/);
  assert.match(wrapper, /PhoneApprovalDeviceSetup/);
  assert.match(wrapper, /Telefon \/ Cihaz Kurulumu/);
});

test("owner and company owner receive Security Center without a new left-menu security module", async () => {
  const admin = await read("pages/modules/AdminPage.jsx");
  const registry = await read("app/moduleRegistryBase.js");
  assert.match(admin, /AdminOwnerSecurity \/><SecurityCenterPanel/);
  assert.match(admin, /AdminCompanyUsersPanel[^\n]+SecurityCenterPanel/);
  assert.doesNotMatch(registry, /\["guvenlik-merkezi"/);
});

test("KY Security PWA labels every critical security action and refreshes cache", async () => {
  const actions = await read("../public/security/security-actions.js");
  const sw = await read("../public/security/sw.js");
  for (const operation of ["SESSION_TRUST_APPROVE", "SESSION_CLOSE", "SESSION_SUSPICIOUS", "SECURITY_CAPABILITY_SET", "SUPER_ADMIN_GRANT", "SUPER_ADMIN_REVOKE", "ONLY_ME"]) {
    assert.match(actions, new RegExp(operation));
  }
  assert.match(sw, /kyerp-security-shell-v12/);
});

test("notification center exposes direct scoped login and session approval actions", async () => {
  const shell = await read("layouts/AppShellV3.jsx");
  const notifications = await read("../../../cloud/ky-erp-api/src/notifications-cloud.ts");
  assert.match(shell, /decideSecurityCenterLoginApproval/);
  assert.match(shell, /runPhoneApprovedSecurityAction/);
  assert.match(shell, /SESSION_TRUST_APPROVE/);
  assert.match(shell, /SESSION_TRUST_REJECT/);
  assert.match(shell, /shell-v3-notification-inline-actions/);
  assert.match(shell, /"APPROVE"/);
  assert.match(shell, /"DENY"/);
  assert.match(notifications, /AUTH_SECURITY_CAPABILITY_GRANT/);
  assert.match(notifications, /LOGIN_APPROVE/);
  assert.match(notifications, /SESSION_APPROVE/);
  assert.match(notifications, /collectSessionTrustApprovals/);
  assert.match(notifications, /session-trust:/);
  assert.match(notifications, /actionable:\s*true/);
  assert.match(notifications, /securityCenter:\s*true/);
  assert.match(notifications, /NOT IN \('SUPER_ADMIN','ADMIN','COMPANY_ADMIN'\)/);
});
