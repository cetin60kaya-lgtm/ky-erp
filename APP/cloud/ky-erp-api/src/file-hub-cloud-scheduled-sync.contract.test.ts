import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("./main-entry-security.ts", import.meta.url), "utf8");

test("scheduled cloud sync includes enabled bindings or a previously started partial scan", () => {
  assert.match(cloud, /runFileHubCloudScheduledSync/);
  assert.match(cloud, /c\.sync_mode='CLOUD_API'/);
  assert.match(cloud, /c\.is_active=1/);
  assert.match(cloud, /LEFT JOIN file_hub_bindings/);
  assert.match(cloud, /b\.sync_enabled=1/);
  assert.match(cloud, /b\.id IS NOT NULL OR json_extract\(c\.metadata,'\$\.cloudSyncCursor'\) IS NOT NULL/);
  assert.match(cloud, /LIMIT 4/);
});

test("scheduled sync avoids rewriting unchanged cloud files", () => {
  assert.match(cloud, /needsModelSync:changed \|\| Number\(location\.model_relation_count\|\|0\)===0/);
  assert.match(cloud, /if\(indexed\.changed\) changedFiles\+=1/);
  assert.match(cloud, /if\(indexed\.needsModelSync\)/);
});

test("existing five minute Worker cron also runs File Hub cloud sync", () => {
  assert.match(entry, /runFileHubCloudScheduledSync/);
  assert.ok(entry.includes("runSecurityWorkspaceReminderSweep(env)"));
  assert.ok(entry.includes("runFileHubCloudScheduledSync(env)"));
  assert.ok(entry.includes("retryPhysicalOperations(env)"));
});

test("DESEN File Hub cron başka görevin hatasından etkilenmez ve gizli veri loglamaz",()=>{
  assert.doesNotMatch(entry, /ctx\.waitUntil\(Promise\.all\(/);
  assert.match(entry, /await runSecurityWorkspaceReminderSweep\(env\)\.catch/);
  assert.match(entry, /await runFileHubCloudScheduledSync\(env\)\.catch/);
  assert.match(entry, /await retryPhysicalOperations\(env\)\.then/);
  assert.match(entry, /FILE_HUB_CLOUD_CRON_FAILED/);
  assert.match(entry, /SECURITY_REMINDER_CRON_FAILED/);
  // Hata metni serbest provider/OAuth yanıtı değil, sabit gizli-verisiz kod.
  assert.doesNotMatch(entry, /FILE_HUB_CLOUD_CRON_FAILED.*\+.*error/);
});

test("full index runs once per company and provider delta, not per Desktop client", () => {
  assert.match(cloud, /runGoogleDeltaBatch/);
  assert.match(cloud, /cloudDeltaToken/);
  assert.match(cloud, /changes\/startPageToken/);
  assert.match(cloud, /\/drive\/v3\/changes\?/);
  assert.match(cloud, /cloudDeltaPageToken/);
  assert.match(cloud, /cloudSyncLeaseId/);
  assert.match(cloud, /provider_file_id=\? AND is_available=1/);
  assert.match(cloud, /runGoogleDeltaBatch\(c,slug,connectionId,link,accessToken,raw,meta\)/);
  assert.match(cloud, /meta\.cloudNeedsFullRescan/);
  assert.doesNotMatch(cloud, /DELETE FROM file_hub_assets/);
});

test("scan priority comes from tenant E_BELGE / E_DOCUMENT, never machine path",()=>{
  assert.match(cloud, /module_code='E_BELGE' AND purpose_code='E_DOCUMENT'/);
  assert.match(cloud, /prioritizeGoogleScanQueue\(cursor\.queue, preferredPaths\)/);
  assert.match(cloud, /pageSize: "30"/);
  assert.doesNotMatch(cloud, /D:\\\\Googledrive\\\\Drive/);
});

test("same account and root are reused; no duplicate D1 scan queue",()=>{
  assert.match(cloud, /a\.oauth_account_id=\? AND c\.remote_root_id=\?/);
  assert.match(cloud, /reused:true/);
  assert.match(cloud, /rootFolderId, driveId\)\.first<Row>\(\)/);
});

test("DESEN image queue no longer starves the common file index",()=>{
  assert.match(cloud, /await syncRecentBoundGoogleImages\(c,slug,connectionId,fresh\.link,fresh\.accessToken\)/);
  assert.match(cloud, /await runGoogleSyncBatch\(c, slug, connectionId, 1, true\)/);
  assert.doesNotMatch(cloud, /if \(priority\.ran\) continue/);
});

test("OneDrive and SharePoint use Graph delta on the same tenant-scoped D1 index",()=>{
  assert.match(cloud, /runMicrosoftDeltaBatch/);
  assert.match(cloud, /graphLatestDeltaUrl/);
  assert.match(cloud, /cloudGraphDeltaLink/);
  assert.match(cloud, /cloudGraphDeltaNextLink/);
  assert.match(cloud, /graphRelativeFolderPath/);
  assert.match(cloud, /validateGraphDeltaUrl/);
  assert.match(cloud, /odata.maxpagesize=25/);
  assert.match(cloud, /GRAPH_DELTA_TOKEN_EXPIRED/);
});

test("manual scan advances the shared checkpoint before any DESEN image-only scan", () => {
  const start = cloud.indexOf('app.post("/api/file-hub/cloud/connections/:id/sync"');
  const end = cloud.indexOf('app.get("/api/file-hub/cloud/files/:assetId/download"', start);
  assert.ok(start > 0 && end > start);
  const manual = cloud.slice(start, end);
  assert.match(manual, /await runGoogleSyncBatch\(c, gate\.slug, connectionId, 1, false\)/);
  assert.doesNotMatch(manual, /syncRecentBoundGoogleImages|designImagePriority/);
  // Scheduled fast image indexing remains independent of the central index.
  const cronStart = cloud.indexOf("export async function runFileHubCloudScheduledSync");
  const cronEnd = cloud.indexOf("export function registerFileHubCloudOauthRoutes", cronStart);
  const cron = cloud.slice(cronStart, cronEnd);
  const indexAt = cron.indexOf("await runGoogleSyncBatch(c, slug, connectionId, 1, true)");
  const imageAt = cron.indexOf("await syncRecentBoundGoogleImages(c,slug,connectionId,fresh.link,fresh.accessToken)");
  assert.ok(indexAt >= 0 && imageAt > indexAt);
});


test("Worker code-only release skips unrelated personnel preflight but retains D1 schema gate", () => {
  const workflow = readFileSync(new URL("../../../../.github/workflows/worker-production-release.yml", import.meta.url), "utf8");
  const preflightStart = workflow.indexOf("- name: Personel 0060 icin canli D1 on kosul dogrulamasi");
  const migrationStart = workflow.indexOf("- name: Personel 0060 hedefli eklemeli D1 migration", preflightStart);
  assert.ok(preflightStart > 0 && migrationStart > preflightStart);
  const preflight = workflow.slice(preflightStart, migrationStart);
  assert.match(preflight, /if: steps\.migration_gate\.outputs\.apply == 'true'/);
  assert.match(workflow, /- name: Canli D1 hedefli salt okunur schema dogrulamasi/);
  assert.match(workflow, /- name: Cloudflare D1 Time Travel geri donus noktasini dogrula/);
  assert.match(workflow, /- name: Worker'i api\.kyerp\.net adresine dagit/);
});

test("partial scan does not launch a second image scan in the same cron pass",()=>{assert.match(cloud,/provider === "GOOGLE_DRIVE" && !\("inProgress" in central && central\.inProgress\) && !\("busy" in central && central\.busy\)/);assert.match(cloud,/const fresh = await connectionAccount\(c,slug,connectionId\)/);});

test("maintenance tasks use one sequential D1 queue and keep all six jobs",()=>{const cron=entry.slice(entry.indexOf("async scheduled("),entry.indexOf("async fetch(",entry.indexOf("async scheduled(")));assert.equal((cron.match(/ctx\.waitUntil\(/g)||[]).length,1);for(const fn of ["runFileHubCloudScheduledSync","runFileHubAccountingDocumentIntake","retryPhysicalOperations","runSecurityWorkspaceReminderSweep","runMicrosoftMailScheduledSync","runGmailMailScheduledSync"])assert.ok(cron.includes("await "+fn+"(env)"));assert.match(cloud,/D1_RESOURCE_LIMIT \[\$\{phase\}\]/);assert.match(cloud,/EXISTS\(SELECT 1 FROM file_hub_relations/);});

test("unfinished server cursor continues without browser, with a globally bounded sequential budget",()=>{assert.match(cloud,/let extraSlices=2/);assert.match(cloud,/while\(extraSlices>0/);assert.match(cloud,/setTimeout\(resolve,10000\)/);assert.match(cloud,/runGoogleSyncBatch\(c,slug,connectionId,1,true,true\)/);});
