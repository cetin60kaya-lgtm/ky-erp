import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectCloudModelBinding, canUseModelImageFolder } from "./file-hub-cloud-model-binding.ts";

const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
const screen = readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/admin/AdminStorageCenter.jsx", import.meta.url), "utf8");

test("Google Drive büyük klasör taraması sayfalı ve D1 checkpoint'li", () => {
  assert.match(cloud, /async function googleChildrenPage/);
  assert.match(cloud, /pageSize: "15"/);
  assert.match(cloud, /nextPageToken/);
  assert.match(cloud, /cloudSyncCursor/);
  assert.match(cloud, /cloudSyncProgress/);
  assert.match(cloud, /await persist\(cursor\)/);
  assert.match(cloud, /checkpoint = JSON\.parse\(JSON\.stringify\(cursor\)\)/);
  assert.match(cloud, /await persist\(checkpoint, false,/);
});

test("Büyük klasör ağaçlarında konum kökte sıfırlanmaz, alt klasörlere öncelik verilir", () => {
  assert.match(cloud, /const resumed = meta\.cloudSyncCursor/);
  assert.match(cloud, /const discoveredFolders: Row\[\] = \[\]/);
  assert.match(cloud, /cursor\.queue\.unshift\(\.\.\.discoveredFolders\)/);
  assert.match(cloud, /if \(page\.nextPageToken\) folder\.pageToken = page\.nextPageToken/);
});

test("Senkronizasyon kilidi tenant kapsamında ve tek bağlantıya özeldir", () => {
  assert.match(cloud, /cloudSyncLeaseId/);
  assert.match(cloud, /main_company_slug=\? AND COALESCE\(metadata/);
  assert.match(cloud, /json_extract\(metadata,'\$\.cloudSyncLeaseId'\)/);
  assert.match(cloud, /last_sync_at=CASE WHEN \?=1/);
  assert.match(cloud, /runGoogleSyncBatch\(c, slug, connectionId, 3, true\)/);
  assert.match(cloud, /runGoogleSyncBatch\(c, gate\.slug, connectionId, 1, false\)/);
});

test("DESEN model görseli sadece açıkça atanan klasörden ve uygun türden eşleşir", () => {
  const image={module_code:"DESEN",purpose_code:"MODEL_IMAGE",root_path:"görsel/2026"};
  const generic={module_code:"DESEN",purpose_code:"GENERIC",root_path:""};
  const employee={module_code:"IK",purpose_code:"EMPLOYEE_ID",root_path:"personel"};
  assert.equal(canUseModelImageFolder(""),false);
  assert.equal(canUseModelImageFolder("görsel/2026"),true);
  assert.equal(selectCloudModelBinding([image,generic,employee],"görsel/2026/Model-1.JPG","Model-1.JPG"),image);
  assert.equal(selectCloudModelBinding([image,generic,employee],"görsel/2026/Model-1.PDF","Model-1.PDF"),null);
  assert.equal(selectCloudModelBinding([image,generic,employee],"görsel/2025/Model-1.JPG","Model-1.JPG"),null);
  assert.equal(selectCloudModelBinding([image,generic,employee],"görsel/2026-sahte/Model-1.JPG","Model-1.JPG"),null);
  assert.equal(selectCloudModelBinding([image,generic,employee],"personel/kimlik.JPG","kimlik.JPG"),null);
  assert.equal(selectCloudModelBinding([generic],"görsel/2026/Model-1.JPG","Model-1.JPG"),null);
  assert.match(cloud,/selectCloudModelBinding\(result\.results\|\|\[\],relativePath,text\(item\.name\)\)/);
  assert.match(cloud,/designImageBindingPresent: Boolean\(design && canUseModelImageFolder\(design\.root_path\)\)/);
});

test("Dosya arayüzü yarım taramayı tamamlandı diye göstermez", () => {
  assert.match(screen, /Son tamamlanan tarama/);
  assert.match(screen, /meta\.cloudSyncCursor/);
  assert.match(screen, /meta\.cloudSyncProgress/);
  assert.match(screen, /d\.inProgress/);
  assert.match(screen, /d\.completed/);
  assert.match(screen, /d\.totalFiles/);
});
