import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(resolve(here, name), "utf8");
const migration = readFileSync(resolve(here, "../migrations/0044_file_hub_cloud_oauth.sql"), "utf8");
const cloud = read("file-hub-cloud-oauth.ts");
const adminStorage = read("admin-storage-cloud.ts");
const main = read("main.ts");
const archive = read("accounting-document-archive.ts");
const eBelge = read("e-belge-center-cloud.ts");
const workflow = readFileSync(resolve(here, "../../../../.github/workflows/production-release.yml"), "utf8");
const deployContract = readFileSync(resolve(here, "../../../../DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md"), "utf8");

test("File Hub OAuth schema is additive and encrypted-token based", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS file_hub_oauth_accounts/);
  assert.match(migration, /access_token_cipher TEXT NOT NULL/);
  assert.match(migration, /refresh_token_cipher TEXT/);
  assert.doesNotMatch(migration, /\bDROP\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});

test("cloud OAuth uses AES-GCM and expiring one-time state", () => {
  assert.match(cloud, /FILE_HUB_OAUTH_KEY/);
  assert.match(cloud, /AES-GCM/);
  assert.match(cloud, /10 \* 60 \* 1000/);
  assert.match(cloud, /\/api\/auth\/file-hub\/oauth\/google\/callback/);
  assert.match(cloud, /\/api\/auth\/file-hub\/oauth\/microsoft\/callback/);
});

test("cloud OAuth provider readiness fails closed on missing credential pairs", () => {
  assert.match(cloud, /GOOGLE_DRIVE_CLIENT_ID/);
  assert.match(cloud, /GOOGLE_DRIVE_CLIENT_SECRET/);
  assert.match(cloud, /MICROSOFT_GRAPH_CLIENT_ID/);
  assert.match(cloud, /MICROSOFT_GRAPH_CLIENT_SECRET/);
  assert.match(cloud, /function providerReady/);
  assert.match(cloud, /cfg\.family && cfg\.clientId && cfg\.clientSecret && text\(c\.env\.FILE_HUB_OAUTH_KEY\)/);
});

test("cloud management is registered behind File Hub tenant-owner guard", () => {
  const guard = adminStorage.indexOf('app.use("/api/file-hub/*"');
  const register = adminStorage.indexOf("registerFileHubCloudOauthRoutes(app)");
  assert.ok(guard >= 0 && register > guard);
  assert.match(adminStorage, /path\.startsWith\("\/api\/file-hub\/cloud\/"\)/);
  assert.doesNotMatch(main, /registerFileHubPreviewRoutes/);
});

test("production deploy contract uses Cloudflare Git Integration and keeps GitHub Actions manual-only", () => {
  assert.match(deployContract, /Cloudflare Git Integration/);
  assert.match(deployContract, /GitHub Actions production deploy yolu değildir|Production deploy için GitHub Actions kullanılmaz/);
  assert.match(deployContract, /npm run typecheck && npm test && npm run build/);
  assert.match(deployContract, /remote production D1 full backup/);
  assert.match(deployContract, /yalnız hedefli ve additive migration/);

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request|schedule|workflow_run):/m);
});

test("direct cloud archive writer uses idempotent provider paths", () => {
  assert.match(cloud, /archiveFileToCloudConnection/);
  assert.match(cloud, /uploadType=resumable/);
  assert.match(cloud, /googleExistingFile/);
  assert.match(cloud, /method=updateId\?"PATCH":"POST"/);
  assert.match(cloud, /microsoftContentUrl/);
  assert.match(cloud, /method:"PUT"/);
});

test("e-Belge archive queue supports CLOUD_API and keeps AGENT path intact", () => {
  assert.match(archive, /upper\(c\.sync_mode\)='CLOUD_API'/);
  assert.match(archive, /processCloudArchiveJobs/);
  assert.match(archive, /archiveFileToCloudConnection/);
  assert.match(archive, /CANONICAL_CLOUD_ARCHIVED/);
  assert.match(archive, /status='COMPLETED'/);
  assert.match(archive, /sync_mode\)='AGENT'/);
});

test("final e-Belge approval schedules cloud archive without weakening accounting approval", () => {
  assert.match(eBelge, /processCloudArchiveJobs/);
  assert.match(eBelge, /postAccountingDocument/);
  assert.match(eBelge, /cloudArchiveQueued:true/);
  assert.match(eBelge, /executionCtx\.waitUntil/);
});

test("0046 canonical report controls are runtime-ready and keep fallback-safe readers", () => {
  const runtime = read("runtime-migration-0046.ts");
  assert.match(runtime, /MIGRATION_0046_PARTIAL_SCHEMA/);
  assert.match(runtime, /MIGRATION_0046_PARTIAL_INDEX/);
  assert.match(runtime, /await db\.batch\(statements\)/);
  assert.match(read("accounting-report-canonical.ts"), /tableExists\(c,"accounting_report_categories"\)/);
  assert.match(read("accounting-report-canonical.ts"), /ACCOUNTING_REPORT_OVERRIDE/);
  assert.match(read("e-belge-product-store.ts"), /tableExists\(c,"accounting_expense_rules"\)/);
  assert.match(read("e-belge-product-store.ts"), /ACCOUNTING_EXPENSE_RULE/);
});
