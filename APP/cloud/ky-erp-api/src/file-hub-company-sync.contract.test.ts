import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cloud=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/admin/AdminStorageCenter.jsx",import.meta.url),"utf8");

test("Ana firma bazinda hesap silinir, aktif baglanti varsa silinmez; dosya indeksi korunur",()=>{
  const section=cloud.split('app.delete("/api/file-hub/cloud/accounts/:id"')[1]?.split('app.get("/api/file-hub/cloud/connections/:id/status"')[0]||"";
  assert.ok(section);
  assert.match(section,/assertCompanyOwner\(c\)/);
  assert.match(section,/main_company_slug=\?/);
  assert.match(section,/ACCOUNT_HAS_ACTIVE_SERVICES/);
  assert.match(section,/DELETE FROM file_hub_cloud_connection_accounts/);
  assert.match(section,/DELETE FROM file_hub_oauth_accounts/);
  assert.doesNotMatch(section,/DELETE FROM file_hub_assets|DELETE FROM file_hub_locations|DELETE FROM file_hub_relations/);
});

test("Salt-okunur firma baglantisi durum API'si tarama baslatmaz",()=>{
  const section=cloud.split('app.get("/api/file-hub/cloud/connections/:id/status"')[1]?.split('app.post("/api/file-hub/cloud/authorize"')[0]||"";
  assert.match(section,/assertCompanyOwner\(c\)/);
  assert.match(section,/main_company_slug=\?/);
  assert.match(section,/cloudSyncProgress/);
  assert.match(section,/leaseActive/);
  assert.doesNotMatch(section,/runGoogleSyncBatch|upsertCloudFile/);
});

test("Google Drive ve OneDrive tam sayfa tokeniyle checkpoint'li taranir",()=>{
  assert.match(cloud,/async function microsoftChildrenPage/);
  assert.match(cloud,/url\.origin!=="https:\/\/graph\.microsoft\.com"/);
  assert.match(cloud,/\$top=15/);
  assert.match(cloud,/\["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT"\]\.includes\(provider\)/);
  assert.match(cloud,/await persist\(cursor\)/);
  assert.match(cloud,/cursor\.pages = Number\(cursor\.pages \|\| 0\) \+ 1/);
  assert.match(cloud,/CASE WHEN json_extract\(c\.metadata,'\$\.cloudSyncCursor'\) IS NOT NULL THEN 0 ELSE 1 END/);
});

test("Bulut hesap islemleri ve tarama gosterimi secili ana firma bazinda",()=>{
  assert.match(ui,/onRemoveAccount=\{removeAccount\}/);
  assert.match(ui,/mainCompanySlug:slug/);
  assert.match(ui,/Hesabı Kaldır/);
  assert.match(ui,/15 saniyede yenilenir/);
  assert.match(ui,/setInterval\(poll,15000\)/);
  assert.match(ui,/Yönetilen ana firma/);
});
