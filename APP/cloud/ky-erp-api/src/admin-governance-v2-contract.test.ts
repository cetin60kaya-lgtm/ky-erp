import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (url) => readFileSync(new URL(url, import.meta.url), "utf8");

test("admin navigation is corporate and has no standalone login approval tab", () => {
  const registry = read("../../../app/ky-erp-frontend/src/app/moduleRegistry.js");
  const base = read("../../../app/ky-erp-frontend/src/app/moduleRegistryBase.js");
  assert.doesNotMatch(registry, /withLoginApprovals/);
  assert.match(registry, /"giris-onaylari": "admin-yonetim-ozeti"/);
  assert.match(base, /"Süper Yönetici & Güvenlik"/);
  assert.match(base, /"Kullanıcı & Yetkiler"/);
  assert.match(base, /"Firmalar & Organizasyon"/);
});

test("management console contains the compact decision center", () => {
  const overview = read("../../../app/ky-erp-frontend/src/pages/admin/AdminSystemOverview.jsx");
  const page = read("../../../app/ky-erp-frontend/src/pages/modules/AdminPage.jsx");
  assert.match(overview, /<AdminLoginApprovals compact \/>/);
  assert.match(overview, /KY ERP Süper Yönetim Konsolu/);
  assert.doesNotMatch(page, /<AdminLoginApprovals \/>/);
});

test("Super Admin and company owner labels are consistent", () => {
  const shell = read("../../../app/ky-erp-frontend/src/layouts/AppShellV3.jsx");
  const users = read("../../../app/ky-erp-frontend/src/pages/admin/AdminUsersPanelV2.jsx");
  const owner = read("../../../app/ky-erp-frontend/src/pages/admin/AdminOwnerSecurity.jsx");
  assert.match(shell, /SUPER_ADMIN:"Süper Yönetici"/);
  assert.match(shell, /COMPANY_ADMIN:"Firma Sahibi \/ İşveren"/);
  assert.match(users, /SUPER_ADMIN:"Süper Yönetici"/);
  assert.match(users, /COMPANY_ADMIN:"Firma Sahibi \/ İşveren"/);
  assert.doesNotMatch(owner, /Uygulama Sahibi|Uygulama sahibi/);
});

test("company card exposes people and responsibilities", () => {
  const source = read("../../../app/ky-erp-frontend/src/pages/admin/AdminCompanySettings.jsx");
  assert.match(source, /Firma Kartı/);
  assert.match(source, /Firma Sahibi \/ İşveren/);
  assert.match(source, /Muhasebe/);
  assert.match(source, /selectedPeople/);
});

test("mail decisions allow company owner or Super Admin and keep owner self-requests out of approval queue", () => {
  const mail = read("./mail-communication-core.ts");
  const notifications = read("./notifications-cloud.ts");
  assert.match(mail, /policy="COMPANY_OR_APP_OWNER"/);
  assert.match(mail, /companyOwner\|\|appOwner/);
  assert.match(mail, /MAIL_APPROVAL_OWNER_REQUIRED/);
  assert.match(mail, /autoApprovePrivilegedRequesterMailRequests/);
  assert.match(mail, /PRIVILEGED_REQUESTER_AUTO_APPROVAL/);
  assert.match(notifications, /collectMailApprovals/);
  assert.match(notifications, /category: "APPROVAL"/);
  assert.match(notifications, /Mail hesabı firma sahibi \/ Süper Yönetici onayı bekliyor/);
});

test("File Hub and cloud OAuth writes are owned by the company owner", () => {
  const hub = read("./file-hub.ts");
  const oauth = read("./file-hub-cloud-oauth.ts");
  const storage = read("./admin-storage-cloud.ts");
  assert.match(hub, /requireCompanyOwner/);
  assert.match(oauth, /assertCompanyOwner/);
  assert.match(storage, /isCompanyOwner/);
  assert.match(storage, /Firma sahibi \/ işveren/);
});


test("company owner can actually reach storage module and user center has no approval duplicate", () => {
  const auth = read("../../../app/ky-erp-frontend/src/context/AuthContext.jsx");
  const usersWrapper = read("../../../app/ky-erp-frontend/src/pages/admin/AdminUsersPanel.jsx");
  const authCloud = read("./auth-cloud.ts");
  const authPolicy = read("./auth-policy-cloud.ts");
  assert.match(auth, /STORAGE_ADMIN/);
  assert.match(auth, /COMPANY_ADMIN"[\s\S]*\["ADMIN","STORAGE_ADMIN"\]/);
  assert.match(authCloud, /moduleKey: "STORAGE_ADMIN"/);
  assert.match(authPolicy, /moduleKey: "STORAGE_ADMIN"/);
  assert.doesNotMatch(usersWrapper, /AdminLoginApprovals/);
  assert.match(usersWrapper, /<AdminUsersPanelV2/);
});
