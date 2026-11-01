import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("DESEN model görseli sadece açıkça atanan alt klasörden eşleşir", () => {
  assert.match(cloud, /if\(purposeCode==="MODEL_IMAGE" && !normDesignPath\(binding\.root_path\)\) return null/);
  assert.match(cloud, /designImageBindingPresent: Boolean\(design && normDesignPath\(design\.root_path\)\)/);
});

test("Dosya arayüzü yarım taramayı tamamlandı diye göstermez", () => {
  assert.match(screen, /Son tamamlanan tarama/);
  assert.match(screen, /meta\.cloudSyncCursor/);
  assert.match(screen, /meta\.cloudSyncProgress/);
  assert.match(screen, /d\.inProgress/);
  assert.match(screen, /d\.completed/);
  assert.match(screen, /d\.totalFiles/);
});
