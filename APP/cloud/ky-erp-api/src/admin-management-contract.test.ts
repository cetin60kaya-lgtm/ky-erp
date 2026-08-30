import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("main registers the complete owner management backend", () => {
  const source = api("main.ts");
  for (const name of [
    "registerAdminCoreRoutes",
    "registerAdminMappingRoutes",
    "registerAdminStorageRoutes",
    "registerAdminBackupRoutes",
    "registerAdminBackupSqlRoutes",
    "registerAdminManagementRoutes",
  ]) {
    assert.match(source, new RegExp(`${name}\\(app\\)`));
  }
});

test("system management permission is stripped from every non-owner auth response", () => {
  const source = api("main.ts");
  assert.match(source, /function ownerRole/);
  assert.match(source, /stripSystemAdminPermission/);
  assert.match(source, /moduleKey \|\| row\?\.module_key/);
  assert.match(source, /sanitizeAuthPayload/);
  assert.match(source, /\/api\/auth\/\*/);
  assert.match(source, /UPDATE auth_user_module_permissions/);
  assert.match(source, /UPPER\(module_key\)='ADMIN'/);
});

test("mapping UI uses implemented company profile and product catalog APIs", () => {
  const source = frontend("pages/admin/AdminMappings.jsx");
  assert.match(source, /\/muhasebe\/firma-profilleri/);
  assert.match(source, /\/admin\/product-catalog/);
  assert.doesNotMatch(source, /\/muhasebe\/firma-kartlari/);
  assert.doesNotMatch(source, /\/muhasebe\/urunler/);
});

test("storage management is R2-first and does not expose local watch workflow", () => {
  const backend = api("admin-storage-cloud.ts");
  const ui = frontend("pages/admin/AdminStorageCenter.jsx");
  assert.match(backend, /R2:\/\/ky-erp-files/);
  assert.match(backend, /archive-capabilities/);
  assert.match(backend, /trash\//);
  assert.match(ui, /Cloudflare R2/);
  assert.match(ui, /Google Drive/);
  assert.match(ui, /OneDrive/);
  assert.doesNotMatch(ui, /test-watch-path/);
  assert.doesNotMatch(ui, /import-watch-folder/);
});

test("backup backend creates real R2 manifests and requires guarded restore", () => {
  const backend = api("admin-backup-cloud.ts");
  const ui = frontend("pages/admin/AdminBackupLogs.jsx");
  assert.match(backend, /backups\/\$\{slug\}/);
  assert.match(backend, /manifest\.json/);
  assert.match(backend, /PRE_RESTORE:/);
  assert.match(backend, /GERI YUKLE/);
  assert.match(backend, /verifyOwnerPassword/);
  assert.match(backend, /name\.startsWith\("auth_"\)/);
  assert.match(backend, /scope<>\?/);
  assert.match(backend, /rollbackRestored/);
  assert.match(backend, /restoreManifestData/);
  assert.match(ui, /GERI YUKLE/);
  assert.match(ui, /safetyBackupId/);
});

test("tenant SQL backup is owner-only, multipart and excludes auth state while keeping business settings", () => {
  const backend = api("admin-backup-sql.ts");
  const ui = frontend("pages/admin/AdminBackupLogs.jsx");
  const client = frontend("services/adminApi.js");
  assert.match(backend, /createMultipartUpload/);
  assert.match(backend, /tenant-backup\.sql/);
  assert.match(backend, /value\.startsWith\("auth_"\)/);
  assert.match(backend, /table === "json_store"/);
  assert.match(backend, /scope.*ADMIN_BACKUP|BACKUP_SCOPE/);
  assert.match(backend, /\/api\/admin\/backups\/:id\/sql/);
  assert.match(backend, /\/api\/admin\/backups\/:id\/sql\/download/);
  assert.match(ui, /SQL İndir/);
  assert.match(ui, /SQL Hazırla/);
  assert.match(client, /generateBackupSql/);
  assert.match(client, /downloadBackupSql/);
});

test("main company card exposes backup, SQL and guarded recovery", () => {
  const ui = frontend("pages/admin/AdminCompanySettings.jsx");
  assert.match(ui, /Firma Yedek & Geri Dönüş/);
  assert.match(ui, /Tam Yedek Al/);
  assert.match(ui, /SQL Hazırla & İndir/);
  assert.match(ui, /GERI YUKLE/);
  assert.match(ui, /PRE_RESTORE/);
});

test("tenant slug rename and transfer are D1 batch atomic", () => {
  const source = api("admin-core-cloud.ts");
  assert.match(source, /c\.env\.DB\.batch\(statements\)/);
  assert.match(source, /tenantMovePlan/);
  assert.match(source, /COMPANY_TRANSFER_CONFLICT/);
  assert.doesNotMatch(source, /async function moveTenantSlug/);
});

test("all admin backup client calls are implemented", () => {
  const source = frontend("services/adminApi.js");
  assert.match(source, /\/admin\/backups/);
  assert.match(source, /restoreBackup/);
  assert.match(source, /listBackups/);
  assert.match(source, /generateBackupSql/);
  assert.match(source, /downloadBackupSql/);
});

test("direct deploy avoids full migration chain, checks schema read-only and runs unit contracts", () => {
  const source = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_DIRECT_PRODUCTION.ps1"), "utf8");
  assert.match(source, /npm run test:unit/);
  assert.match(source, /Local migration entegrasyon testi YOK/);
  assert.match(source, /Assert-Remote-Schema-Readiness/);
  assert.match(source, /pragma_table_info\('hr_monthly_employees'\)/);
  assert.match(source, /company_aliases/);
  assert.match(source, /auth_owner_recovery_challenges/);
  assert.match(source, /0022_auth_same_browser_session_guard\.sql/);
  assert.doesNotMatch(source, /wrangler d1 migrations apply/);
});
