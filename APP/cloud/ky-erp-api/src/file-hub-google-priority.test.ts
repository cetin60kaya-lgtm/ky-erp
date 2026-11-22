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
  assert.match(cloud,/prioritizeGoogleScanQueue\(cursor\.queue, preferredPaths\)/);
  assert.match(cloud,/cloudSyncCursor/);
});
test("hata sonrasi onceki sayfa imleci silinmez",()=>{
  assert.match(cloud,/await persist\(checkpoint, false,/);
  assert.match(cloud,/last_sync_at=CASE WHEN \?=1/);
});


test("DESEN RGB taraması tüm sayfa ve alt klasörlerde D1 kuyruğuyla sürer, erken tamamlanmaz",()=>{
  assert.match(cloud,/Array\.isArray\(progress\.queue\)\&\&progress\.queue\.length>0/);
  assert.match(cloud,/const checkpoint=queue\.map\(f=>\(\{\.\.\.f\}\)\)/);
  assert.match(cloud,/const page=await googleChildrenPage\(accessToken,text\(current\.id\),text\(current\.pageToken\)\)/);
  assert.match(cloud,/if\(page\.nextPageToken\)queue\.push\(\{\.\.\.current,pageToken:page\.nextPageToken\}\)/);
  assert.match(cloud,/queue\.push\(\.\.\.discovered\)/);
  assert.match(cloud,/completed=queue\.length===0/);
  assert.match(cloud,/pendingFolders:queue\.length/);
  assert.match(cloud,/modelImageFastProgress',json\(\?\)/);
  assert.match(cloud,/hasMore:!completed,scannedTotal:priorScanned\+scanned,linkedTotal:priorLinked\+linked/);
});

test("DESEN RGB geçici sağlayıcı hatasında sayfa geri alınır ve D1 lease bırakılır",()=>{
  assert.match(cloud,/const checkpoint=queue\.map\(f=>\(\{\.\.\.f\}\)\)/);
  assert.match(cloud,/queue=checkpoint/);
  assert.match(cloud,/scannedTotal:priorScanned\+\(problem\?0:scanned\)/);
  assert.match(cloud,/linkedTotal:priorLinked\+\(problem\?0:linked\)/);
  assert.match(cloud,/cloudSyncLeaseId',NULL,'\$\.cloudSyncLeaseUntil',NULL/);
  assert.match(cloud,/MODEL_IMAGE_LEASE_CONFLICT/);
  assert.match(cloud,/if\(problem\)throw Object\.assign/);
});

test("firma bazlı e-Belge klasörü geçmiş büyük desen arşivini beklemez", () => {
  const queue = [
    {id:"design",path:"görsel/2026",pageToken:"design-next"},
    {id:"invoice",path:"Muhasebe/Özel Gelen Belgeler",pageToken:""},
    {id:"historic",path:"modeller",pageToken:"abc"},
    {id:"legacy",path:"KY-ISNET-BELGELER/GELEN-FATURA",pageToken:"continue"},
  ];
  prioritizeGoogleScanQueue(queue,["Muhasebe/Özel Gelen Belgeler"]);
  assert.equal(queue[0].id,"invoice");
  assert.equal(queue[1].id,"legacy");
  assert.equal(queue[1].pageToken,"continue");
  assert.ok(googleFolderScanPriority("MUHASEBE/e-Belgeler")<googleFolderScanPriority("görsel/2026"));
  assert.ok(googleFolderScanPriority("KY-ISNET-BELGELER/GIDEN-FATURA")<googleFolderScanPriority("giden desenler"));
});

test("özel firma klasör adının üst dizini önce sıraya alınır",()=>{
  const queue=[{path:"DESEN",id:"design"},{path:"Belgeler",id:"parent"}];
  prioritizeGoogleScanQueue(queue,["Belgeler/Muhasebe/2026"]);
  assert.equal(queue[0].id,"parent");
});
