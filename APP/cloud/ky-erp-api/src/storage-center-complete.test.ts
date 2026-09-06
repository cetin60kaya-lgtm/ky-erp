import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "../../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Depolama is a first-class owner module with all storage screens", () => {
  const registry = read("APP/app/ky-erp-frontend/src/app/moduleRegistry.js");
  const auth = read("APP/app/ky-erp-frontend/src/context/AuthContext.jsx");
  const adminPage = read("APP/app/ky-erp-frontend/src/pages/modules/AdminPage.jsx");
  const depolamaPage = read("APP/app/ky-erp-frontend/src/pages/modules/DepolamaPage.jsx");

  assert.match(registry, /key:\s*"depolama"/);
  assert.match(registry, /permissionKey:\s*"STORAGE_ADMIN"/);
  assert.match(auth, /if \(isSuperAdmin\(user\?\.role\)\) return true/);
  assert.match(auth, /COMPANY_ADMIN" && \["ADMIN","STORAGE_ADMIN"\]\.includes\(key\)/);
  for (const tab of [
    "depolama-genel",
    "depolama-kaynaklar",
    "depolama-atamalar",
    "depolama-dosyalar",
    "depolama-senkronizasyon",
    "depolama-yedekleme",
  ]) {
    assert.match(registry, new RegExp(tab));
  }

  assert.match(adminPage, /import DepolamaPage/);
  assert.match(adminPage, /startsWith\("depolama-"\)/);
  assert.match(depolamaPage, /AdminStorageCenter/);
  assert.match(depolamaPage, /AdminBackupLogs/);
  assert.match(depolamaPage, /showToolbar=\{false\}/);
});

test("Depolama screen exposes provider-neutral connection, routing and index management", () => {
  const screen = read("APP/app/ky-erp-frontend/src/pages/admin/AdminStorageCenter.jsx");

  for (const provider of [
    "GOOGLE_DRIVE",
    "ONEDRIVE",
    "SHAREPOINT",
    "LOCAL_FOLDER",
    "NAS",
  ]) {
    assert.match(screen, new RegExp(provider));
  }

  for (const moduleCode of [
    "DESEN",
    "IMALAT",
    "BOYAHANE",
    "MUHASEBE",
    "ISNET",
    "IK",
    "DTF",
    "STOK",
  ]) {
    assert.match(screen, new RegExp(moduleCode));
  }

  for (const purpose of [
    "MODEL_IMAGE",
    "MODEL_SOURCE",
    "PLACEMENT",
    "OUTGOING_DESIGN",
    "RIP_PDF",
    "INVOICE",
    "DELIVERY_NOTE",
    "E_DOCUMENT",
    "PAYMENT_DOCUMENT",
    "PERSONNEL_DOCUMENT",
    "CONTRACT",
    "RECIPE",
    "TECHNICAL_SHEET",
    "QUALITY",
    "PRODUCTION_PHOTO",
    "CUSTOMER_REFERENCE",
    "GENERIC",
  ]) {
    assert.match(screen, new RegExp(purpose));
  }

  assert.match(screen, /\/file-hub\/overview/);
  assert.match(screen, /\/file-hub\/connections/);
  assert.match(screen, /\/file-hub\/bindings/);
  assert.match(screen, /\/file-hub\/files/);
  assert.match(screen, /R2 yalnız web önizleme\/cache katmanıdır/);
});

test("Cloud storage registration includes management, preview, agent, scan and accounting archive routes", () => {
  const routes = read("APP/cloud/ky-erp-api/src/admin-storage-cloud.ts");
  const scan = read("APP/cloud/ky-erp-api/src/file-hub-agent-scan.ts");
  const archive = read("APP/cloud/ky-erp-api/src/accounting-document-archive.ts");
  const agentRoutes = read("APP/cloud/ky-erp-api/src/file-hub-agent-public.ts");

  for (const registration of [
    "registerFileHubRoutes",
    "registerFileHubPreviewRoutes",
    "registerPublicFileHubAgentRoutes",
    "registerPublicFileHubScanRoutes",
    "registerAccountingDocumentArchiveRoutes",
  ]) {
    assert.match(routes, new RegExp(`${registration}\\(app\\)`));
  }

  assert.match(scan, /\/api\/auth\/file-hub-agent\/config/);
  assert.match(scan, /UPPER\(sync_mode\)='AGENT'/);
  assert.match(archive, /MUHASEBE/);
  assert.match(archive, /INVOICE/);
  assert.match(archive, /DELIVERY_NOTE|purpose_code/);
  assert.match(agentRoutes, /\["INVOICE","DELIVERY_NOTE","PAYMENT_DOCUMENT","E_DOCUMENT"\]\.includes\(purposeCode\)/);
  assert.match(agentRoutes, /insertRelation\(c,slug,fileAssetId,"DOCUMENT",logical,purposeCode/);
});

test("Desen storage status resolves File Hub instead of owning a second storage system", () => {
  const desenBar = read("APP/app/ky-erp-frontend/src/pages/desen/DesenFolderSettingsBar.jsx");
  const desenPage = read("APP/app/ky-erp-frontend/src/pages/desen/DesenPage.jsx");

  assert.match(desenBar, /resolveFileHubStorage/);
  assert.match(desenBar, /MODEL_IMAGE/);
  assert.match(desenBar, /MODEL_SOURCE/);
  assert.match(desenBar, /PLACEMENT/);
  assert.match(desenBar, /OUTGOING_DESIGN/);
  assert.doesNotMatch(desenBar, /getDesenFolderSettings/);
  assert.match(desenPage, /Desen Depolama Ayarları/);
});

test("Windows File Hub Agent can auto-configure and auto-start without storing secrets in repo", () => {
  const agent = read("tools/file-hub-agent/file-hub-agent.mjs");
  const starter = read("tools/file-hub-agent/start-file-hub-agent.cmd");
  const installer = read("tools/file-hub-agent/install-file-hub-agent.ps1");
  const hidden = read("tools/file-hub-agent/start-file-hub-agent-hidden.vbs");
  const docs = read("tools/file-hub-agent/README.md");

  assert.match(agent, /\/api\/auth\/file-hub-agent\/config/);
  assert.match(agent, /\/api\/auth\/file-hub-agent\/ingest/);
  assert.match(agent, /scan-begin/);
  assert.match(agent, /scan-complete/);
  assert.match(starter, /accounting-archive-worker\.mjs/);
  assert.match(starter, /file-hub-agent\.mjs/);
  assert.match(installer, /Register-ScheduledTask/);
  assert.match(installer, /KYERP_AGENT_KEY/);
  assert.match(hidden, /start-file-hub-agent\.cmd/);
  assert.match(docs, /Depolama > Bağlantılar/);
  assert.match(docs, /Secret değerini script, config veya repoya yazmayın/);
});
