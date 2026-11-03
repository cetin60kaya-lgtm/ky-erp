import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");

test("indexed image backfill is tenant, connection, folder and extension scoped", () => {
  assert.match(source, /async function backfillIndexedCloudModelImages/);
  assert.ok(source.includes("module_code='DESEN' AND purpose_code='MODEL_IMAGE' AND sync_enabled=1"));
  assert.ok(source.includes("l.main_company_slug=? AND l.storage_connection_id=? AND l.is_available=1"));
  assert.ok(source.includes("substr(l.relative_path,1,length(?))=? AND substr(l.relative_path,length(?)+1,1)='/'"));
  assert.ok(source.includes("lower(a.extension) IN ('jpg','jpeg','png','webp')"));
  assert.ok(source.includes("r.entity_type='MODEL' AND r.relation_type='MODEL_IMAGE'"));
  assert.ok(source.includes("ORDER BY l.relative_path LIMIT 25"));
  assert.ok(source.includes(").bind(slug, connectionId, root, root, root).all<Row>();"));
});

test("resumable cloud scan also picks up previously indexed model photos", () => {
  assert.ok(source.includes("const recoveredModelLinks = await backfillIndexedCloudModelImages(c, slug, connectionId, providerType);"));
  assert.ok(source.includes("cursor.modelSyncs += recoveredModelLinks;"));
});
