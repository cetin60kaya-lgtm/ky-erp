import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloudRemovalRequiresFullReconciliation } from "./file-hub-delta-removal.ts";

const source=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");

test("a previously indexed cloud file deletion never restarts the company tree scan",()=>{
  assert.equal(cloudRemovalRequiresFullReconciliation(true,false),false);
  assert.equal(cloudRemovalRequiresFullReconciliation(true,true),true);
});
test("unknown provider ID or deleted folder gets conservative full reconciliation",()=>{
  assert.equal(cloudRemovalRequiresFullReconciliation(false,false),true);
  assert.equal(cloudRemovalRequiresFullReconciliation(false,true),true);
});
test("both Google Changes and Graph delta look up indexed file before rescan",()=>{
  assert.match(source,/if\(change\.removed \|\| file\?\.trashed \|\| !file\)\{[\s\S]*?wasIndexedFile[\s\S]*?cloudRemovalRequiresFullReconciliation\(/);
  assert.match(source,/if\(item\.deleted\)\{[\s\S]*?wasIndexedFile[\s\S]*?cloudRemovalRequiresFullReconciliation\(/);
  assert.equal((source.match(/SELECT 1 AS known FROM file_hub_locations/g)||[]).length,2);
  assert.doesNotMatch(source,/if\(item\.deleted\)\{await remove\(\);folderChanges=true/);
});
