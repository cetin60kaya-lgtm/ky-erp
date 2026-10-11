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
