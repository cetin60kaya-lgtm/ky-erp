import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
const design = readFileSync(new URL("./file-hub-design-sync.ts", import.meta.url), "utf8");
const preview = readFileSync(new URL("./file-hub-preview.ts", import.meta.url), "utf8");

test("Drive JPEG filename is preserved as the canonical model name without its extension", () => {
  assert.match(cloud, /function designModelIdentity\(value: unknown\)/);
  assert.match(cloud, /return text\(value\)\.replace\(/);
  assert.doesNotMatch(cloud, /replace\(\/\\b\(YERLEŞİM\|YERLESIM\|KALIP\|PLACEMENT/);
  assert.match(cloud, /if\(purposeCode==="MODEL_IMAGE" && !\["JPG","JPEG","PNG","WEBP"\]/);
});

test("Drive File Hub MODEL relation refers to the actual saved model ID", () => {
  assert.match(cloud, /const synced = await syncFileHubDesignModel/);
  assert.match(cloud, /insertCloudDesignRelation\(c,slug,fileAssetId,synced\.modelId/);
  assert.doesNotMatch(cloud, /insertCloudDesignRelation\(c,slug,fileAssetId,modelName/);
  assert.match(cloud, /JOIN model_records m ON m\.id=r\.entity_id/);
});

test("only unambiguous TAHA GIYIM company ID can be assigned by default", () => {
  assert.match(design, /const candidates = \(result\.results \|\| \[\]\)\.filter/);
  assert.match(design, /normalize\(row\.name\)\.startsWith\("TAHA GIYIM"\)/);
  assert.match(design, /candidates\.length === 1 \? candidates\[0\] : null/);
  assert.match(design, /companyId: text\(matched\?\.id\)/);
  assert.match(design, /existingCanonicalModel\(c, slug, modelName\)/);
  assert.match(design, /id: text\(canonical\?\.id\) \|\| crypto\.randomUUID\(\)/);
});

test("Cloud JPG preview caches a provider thumbnail, not the original PSD or JPEG", () => {
  assert.match(cloud, /export async function ensureCloudModelImagePreview/);
  assert.match(cloud, /fields=thumbnailLink,mimeType/);
  assert.match(cloud, /bytes\.byteLength > 2_000_000/);
  assert.match(cloud, /preview_status='READY'/);
  assert.match(preview, /await ensureCloudModelImagePreview\(c,slug,id\)/);
  assert.match(cloud, /previewChanged \? 1 : 0/);
});
