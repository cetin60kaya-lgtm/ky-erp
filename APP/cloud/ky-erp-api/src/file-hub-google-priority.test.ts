import test from "node:test";
import assert from "node:assert/strict";
import { googleFolderScanPriority, prioritizeGoogleScanQueue } from "./file-hub-google-priority.ts";
import { readFileSync } from "node:fs";
const cloud=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
test("2026 model dosyalari tarihsel binlerce klasor oncesinde indekslenir",()=>{
  const queue=[
    {id:"mod",path:"modeller",pageToken:"abc"},
    {id:"old",path:"görsel/2019",pageToken:"old-token"},
    {id:"current",path:"görsel/2026",pageToken:"next-page"},
    {id:"out",path:"giden desenler",pageToken:""},
    {id:"placement",path:"yerleşim dosyaları",pageToken:""},
  ];
  prioritizeGoogleScanQueue(queue);
  assert.deepEqual(queue.map(x=>x.id),["current","placement","out","old","mod"]);
  assert.equal(queue[0].pageToken,"next-page");
  assert.ok(googleFolderScanPriority("görsel")<googleFolderScanPriority("modeller"));
  assert.ok(googleFolderScanPriority("görsel\\2026")<googleFolderScanPriority("görsel/2025"));
  assert.match(cloud,/prioritizeGoogleScanQueue\(cursor\.queue\)/);
  assert.match(cloud,/cloudSyncCursor/);
});
test("hata sonrasi onceki sayfa imleci silinmez",()=>{
  assert.match(cloud,/await persist\(checkpoint, false,/);
  assert.match(cloud,/last_sync_at=CASE WHEN \?=1/);
});
