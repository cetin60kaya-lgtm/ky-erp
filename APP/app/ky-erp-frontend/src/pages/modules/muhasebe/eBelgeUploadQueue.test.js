import test from "node:test";
import assert from "node:assert/strict";
import {splitEBelgeUploadQueue,EBELGE_BATCH_FILES,EBELGE_BATCH_BYTES,eBelgeFileKey} from "./eBelgeUploadQueue.js";

test("Unlimited selection is sent in safe sequential batches",()=>{
 const files=Array.from({length:103},(_,i)=>({name:"bill-"+i+".pdf",size:5*1024*1024,lastModified:i}));
 const groups=splitEBelgeUploadQueue(files);
 assert.equal(groups.flat().length,103);
 assert.deepEqual(groups.flat(),files);
 assert.ok(groups.length>10);
 for(const group of groups){
  assert.ok(group.length<=EBELGE_BATCH_FILES);
  assert.ok(group.reduce((sum,row)=>sum+row.size,0)<=EBELGE_BATCH_BYTES);
 }
});
test("Large files split by byte budget even when count is small",()=>{
 const groups=splitEBelgeUploadQueue(Array.from({length:5},(_,i)=>({name:String(i),size:19*1024*1024,lastModified:i})));
 assert.deepEqual(groups.map(group=>group.length),[2,2,1]);
});
test("File selection key deduplicates identical picker/drop events",()=>{
 const file={name:"doc.xml",size:120,lastModified:1000};
 assert.equal(eBelgeFileKey(file),eBelgeFileKey({...file}));
 assert.notEqual(eBelgeFileKey(file),eBelgeFileKey({...file,size:121}));
});
