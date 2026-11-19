import test from "node:test";
import assert from "node:assert/strict";
import {GMAIL_SYNC_STEPS_PER_CLICK,runGmailSyncBatch} from "./mailGmailSyncBatch.js";

const page=(total=3,completed=0,partial=true,folders=[{name:"Gelen Kutusu",ok:true,completed:false}])=>({
  total,completedFolders:completed,totalFolders:15,partial,folders
});

test("Tek tık en fazla sekiz küçük Worker isteği gönderir ve toplam işlenen sayısını gösterir",async()=>{
  let calls=0;
  const progress=[];
  const result=await runGmailSyncBatch({syncStep:async()=>{calls++;return page();},onProgress:v=>progress.push(v)});
  assert.equal(calls,GMAIL_SYNC_STEPS_PER_CLICK);
  assert.equal(result.steps,GMAIL_SYNC_STEPS_PER_CLICK);
  assert.equal(result.processed,3*GMAIL_SYNC_STEPS_PER_CLICK);
  assert.equal(result.completedFolders,0);
  assert.equal(result.reason,"limit");
  assert.equal(progress.length,GMAIL_SYNC_STEPS_PER_CLICK);
});
test("Son klasör tamamlanınca hemen sonlanır ve tam senkronu ancak API doğrular",async()=>{
  let calls=0;
  const r=await runGmailSyncBatch({syncStep:async()=>{calls++;return page(2,15,false,[{name:"Son",ok:true,completed:true}]);}});
  assert.equal(r.reason,"completed");assert.equal(calls,1);assert.equal(r.partial,false);
});
test("İlk başarısız klasör veya sıfır ilerlemede sonsuz retry yapılmaz",async()=>{
  const bad=await runGmailSyncBatch({syncStep:async()=>page(0,0,true,[{name:"INBOX",failed:1,ok:false,completed:false}])});
  assert.equal(bad.reason,"folder-error");assert.equal(bad.steps,1);
  const stuck=await runGmailSyncBatch({syncStep:async()=>page(0,0,true,[{name:"INBOX",ok:true,completed:false}])});
  assert.equal(stuck.reason,"no-progress");assert.equal(stuck.steps,1);
});
test("Boş ama tamamlanan Gmail etiketi sonraki küçük sayfaya devam eder",async()=>{
  let calls=0;
  const result=await runGmailSyncBatch({syncStep:async()=>{
    calls++;return calls===1?page(0,1,true,[{name:"Boş",ok:true,completed:true}]):page(0,15,false,[{name:"Son",ok:true,completed:true}]);
  }});
  assert.equal(calls,2);assert.equal(result.reason,"completed");
});
test("Kullanıcı durdurduğunda mevcut tamamlanan isteğin ardından yenisi gönderilmez",async()=>{
  let calls=0,stop=false;
  const result=await runGmailSyncBatch({syncStep:async()=>{calls++;return page();},
    onProgress:()=>{stop=true;},shouldStop:()=>stop});
  assert.equal(calls,1);assert.equal(result.reason,"cancelled");
});
