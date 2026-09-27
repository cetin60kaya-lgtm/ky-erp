import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");
const migration = (name: string) => readFileSync(resolve(here, "../migrations", name), "utf8");

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

test("DENETIM is route-locked to owner-granted read-only PDKS", () => {
  const main = api("main.ts");
  const guard = api("ik-pdks-guard.ts");
  const audit = api("ik-audit-readonly.ts");
  const app = frontend("AppV3.jsx");
  const seed = migration("0024_denetime_pdks_system_user.sql");
  const deploy = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_DIRECT_PRODUCTION_V3.ps1"), "utf8");
  assert.match(main, /function auditRole/);
  assert.match(main, /auditPermissionRows/);
  assert.match(main, /=== "PDKS"/);
  assert.match(main, /moduleKey: "PDKS"/);
  assert.match(main, /canCreate: false, canUpdate: false, canDelete: false, canApprove: false/);
  assert.match(main, /const pdksRead = path\.startsWith\("\/api\/ik\/personnel-control\/"\)/);
  assert.match(main, /CASE WHEN UPPER\(module_key\)='PDKS' THEN can_view ELSE 0 END/);
  assert.match(guard, /strictAuditEmployeeIds/);
  assert.match(guard, /ik_person_monthly_compliance/);
  assert.match(guard, /mc\.sgk_covered=1/);
  assert.match(guard, /attendance\(\?:-v2\)\?/);
  assert.match(audit, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\) = 'VAR'/);
  assert.match(audit, /TRIM\(COALESCE\(s\.card_no,''\)\) <> ''/);
  assert.doesNotMatch(audit, /salary:/);
  assert.match(app, /const IK_AUDIT_TABS/);
  assert.match(seed, /'denetim'/);
  assert.match(deploy, /Assert-Denetime-System-User/);
});

test("mapping UI uses implemented company profile and product catalog APIs", () => {
  const source = frontend("pages/admin/AdminMappings.jsx");
  assert.match(source, /\/muhasebe\/firma-profilleri/);
  assert.match(source, /\/admin\/product-catalog/);
  assert.doesNotMatch(source, /\/muhasebe\/firma-kartlari/);
  assert.doesNotMatch(source, /\/muhasebe\/urunler/);
});

test("storage management is provider-neutral File Hub and R2 remains preview/cache only", () => {
  const backend = api("admin-storage-cloud.ts");
  const hub = api("file-hub.ts");
  const agent = api("file-hub-agent-public.ts");
  const ui = frontend("pages/admin/AdminStorageCenter.jsx");
  assert.match(backend, /storageMode:"FILE_HUB"/);
  assert.match(backend, /R2 yalnız preview\/cache katmanıdır/);
  assert.match(hub, /GOOGLE_DRIVE/);
  assert.match(hub, /ONEDRIVE/);
  assert.match(hub, /LOCAL_FOLDER/);
  assert.match(hub, /SHAREPOINT/);
  assert.match(agent, /X-KYERP-Agent-Key/);
  assert.match(ui, /Depolama Merkezi/);
  assert.match(ui, /Google Drive/);
  assert.match(ui, /OneDrive/);
  assert.match(ui, /activeConnections\.map/);
  assert.match(ui, /tek File Hub içinde çalışır/);
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

test("canonical deploy entrypoint delegates to v3", () => {
  const wrapper = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_DIRECT_PRODUCTION.ps1"), "utf8");
  assert.match(wrapper, /KYERP_DIRECT_PRODUCTION_V3\.ps1/);
});

test("v3 deploy runs all code tests before any live D1 or Worker write", () => {
  const source = readFileSync(resolve(here, "../../../../DEPLOY/KYERP_DIRECT_PRODUCTION_V3.ps1"), "utf8");
  assert.match(source, /npm run test:unit/);
  assert.match(source, /npm run lint/);
  assert.match(source, /npm test/);
  assert.match(source, /npm run build/);
  assert.match(source, /0023_admin_company_alias_schema\.sql/);
  assert.match(source, /0024_denetime_pdks_system_user\.sql/);
  assert.match(source, /0022_auth_same_browser_session_guard\.sql/);
  assert.match(source, /Assert-Remote-Schema-Readiness/);
  assert.match(source, /Assert-Denetime-System-User/);
  assert.match(source, /function Remote-Column-Exists/);
  assert.match(source, /Table = "hr_monthly_employees"; Column = "sgk_status"/);
  assert.match(source, /\$transportSmokeCount\s*=\s*3/);
  assert.match(source, /preflight-free login transport kontrolu/);
  assert.match(source, /for \(\$i = 1; \$i -le \$transportSmokeCount; \$i\+\+\)/);
  assert.doesNotMatch(source, /wrangler d1 migrations apply/);
  const workerPreflight = source.indexOf("=== 3/11 WORKER PREFLIGHT ===");
  const frontendPreflight = source.indexOf("=== 4/11 FRONTEND PREFLIGHT ===");
  const d1WriteStage = source.indexOf("=== 5/11 D1 YEDEK + HEDEFLI UYUMLULUK ===");
  const workerDeploy = source.indexOf("=== 6/11 WORKER PRODUCTION DEPLOY ===");
  assert.ok(workerPreflight >= 0 && frontendPreflight > workerPreflight);
  assert.ok(d1WriteStage > frontendPreflight);
  assert.ok(workerDeploy > d1WriteStage);
});
