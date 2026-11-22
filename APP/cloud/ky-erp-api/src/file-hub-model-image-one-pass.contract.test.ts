import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
const design = readFileSync(new URL("./file-hub-design-sync.ts", import.meta.url), "utf8");
const accounting = readFileSync(new URL("./file-hub-accounting-intake.ts", import.meta.url), "utf8");
const eBelge = readFileSync(new URL("./e-belge-center-cloud.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/admin/StorageDocumentCatalog.js", import.meta.url), "utf8");

test("every firm uses the canonical e-Belge folder purpose, including saved legacy bindings", () => {
  assert.match(catalog, /\["E_BELGE","e-Belge \/ Fatura \/ İrsaliye"\]/);
  assert.match(catalog, /\bE_BELGE:\["E_INVOICE_XML"/);
  assert.doesNotMatch(catalog, /\bEBELGE:\[/);
  assert.match(accounting, /b\.module_code IN \('E_BELGE','EBELGE'\)/);
  assert.match(eBelge, /module_code IN \('E_BELGE','EBELGE'\)/);
});

test("bound Google model image folders are scanned recursively with a checkpoint", () => {
  assert.match(cloud, /async function syncRecentBoundGoogleImages/);
  assert.match(cloud, /module_code='DESEN' AND purpose_code='MODEL_IMAGE' AND read_enabled=1 AND sync_enabled=1/);
  assert.match(cloud, /Array\.isArray\(progress\.queue\)/);
  assert.match(cloud, /const checkpoint=queue\.map\(f=>\(\{\.\.\.f\}\)\)/);
  assert.match(cloud, /if\(item\.isFolder\)\{/);
  assert.match(cloud, /discovered\.push\(\{id:text\(item\.id\),path:relativePath,pageToken:""\}\)/);
  assert.match(cloud, /queue\.push\(\.\.\.discovered\)/);
  assert.match(cloud, /prioritizeGoogleScanQueue\(queue\)/);
  assert.match(cloud, /modelImageFastProgress/);
  assert.match(cloud, /queue=checkpoint/);
});

test("new JPEG/PNG creates model only through canonical model identity", () => {
  assert.match(cloud, /\["JPG","JPEG","PNG","WEBP"\]/);
  assert.match(cloud, /const indexed=await upsertCloudFile\(c,slug,connectionId,"GOOGLE_DRIVE",item,relativePath,now\(\)\)/);
  assert.match(cloud, /if\(!indexed\.needsModelSync\)continue/);
  assert.match(cloud, /await syncCloudDesignBinding\(c,slug,connectionId,indexed\.assetId,item,relativePath,"GOOGLE_DRIVE"\)/);
  assert.match(cloud, /if\(model\?\.modelId\)linked\+=1/);
  assert.match(design, /await ensureCanonicalModel\(c, slug,/);
  assert.match(design, /!current && !canonical && purposeCode !== "MODEL_IMAGE"/);
  assert.match(design, /return \{ companyId: "", companyName: "" \}/);
  assert.doesNotMatch(design, /TAHA GİYİM|TAHA GIYIM/);
});
