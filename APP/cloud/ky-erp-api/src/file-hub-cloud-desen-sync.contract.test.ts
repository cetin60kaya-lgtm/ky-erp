import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
const design = readFileSync(new URL("./file-hub-design-sync.ts", import.meta.url), "utf8");

test("direct cloud sync routes files through Desen binding logic", () => {
  assert.match(cloud, /syncFileHubDesignModel/);
  assert.match(cloud, /syncCloudDesignBinding/);
  assert.match(cloud, /file_hub_bindings/);
  assert.match(cloud, /storage_connection_id=\?/);
  assert.match(cloud, /sync_enabled=1/);
  assert.match(cloud, /MODEL_IMAGE/);
  assert.match(cloud, /\["JPG","JPEG","PNG","WEBP"\]/);
  assert.match(cloud, /insertCloudDesignRelation/);
  assert.match(cloud, /source.*CLOUD_RULE/s);
});

test("direct cloud file scan invokes model sync for new changed or unlinked files", () => {
  assert.match(
    cloud,
    /const indexed=await upsertCloudFile[\s\S]*if\(indexed\.needsModelSync\)[\s\S]*syncCloudDesignBinding[\s\S]*files\+=1/,
  );
  assert.match(
    cloud,
    /needsModelSync:changed \|\| Number\(location\.model_relation_count\|\|0\)===0/,
  );
});

test("File Hub model sync keeps workflow and canonical model_records aligned", () => {
  assert.match(design, /defaultDesignCompany/);
  assert.match(design, /TAHA GİYİM SAN\. VE TİC\./);
  assert.match(design, /upsertCanonicalModelRecord/);
  assert.match(design, /PRAGMA table_info\("model_records"\)/);
  assert.match(design, /await upsertCanonicalModelRecord\(c, slug, saved\)/);
  assert.match(design, /customer_id:text\(model\.companyId\)/);
});


test("kaynak PSD/PDF/AI bağlanırken var olan RGB model görseli silinmez", () => {
  assert.match(design, /SELECT id,image_url FROM model_records/);
  assert.match(design, /const canonicalImage = preserveCanonicalImageUrl\(/);
  assert.match(design, /image_url:canonicalImage/);
  assert.match(design, /imageUrl:canonicalImage \|\| ""/);
  assert.match(design, /\["PSD","PSB"\]\.includes\(extension\)/);
});

test("RGB görsel koruma, mevcut canonical veriyi ve yeni görseli doğru seçer", async () => {
  const { preserveCanonicalImageUrl } = await import("./file-hub-design-sync.ts");
  assert.equal(preserveCanonicalImageUrl("", "/api/file-hub/files/mevcut/preview"), "/api/file-hub/files/mevcut/preview");
  assert.equal(preserveCanonicalImageUrl(null, "/api/eski.jpg"), "/api/eski.jpg");
  assert.equal(preserveCanonicalImageUrl("/api/yeni.jpg", "/api/eski.jpg"), "/api/yeni.jpg");
  assert.equal(preserveCanonicalImageUrl("", ""), null);
});
