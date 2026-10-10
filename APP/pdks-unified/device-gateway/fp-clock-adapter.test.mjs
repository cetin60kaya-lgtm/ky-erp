import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {parseFpClockReadout,createFpClockAdapter,runFpClockProcess}
  from "./fp-clock-adapter.mjs";
const line="LOG|00027|2026-10-10T09:18:02|0|1|1|1";
const good="STATUS|OK|2026-10-10T09:20:00|39|39|39\n"+line+"\nEND|1\n";
const scope={companyId:"stage-firm-1",terminalId:"HEDEF-Cihaz1"};

test("real legacy bridge LOG parser retains card/time and does not infer directions",()=>{
 const r=parseFpClockReadout(good,scope);
 assert.equal(r.status.deviceLogCount,39);
 assert.equal(r.status.registeredCards,39);
 assert.equal(r.events.length,1);
 assert.equal(r.events[0].cardNo,"00027");
 assert.equal(r.events[0].localTimestamp,"2026-10-10T09:18:02");
 assert.equal(r.events[0].kind,"PHYSICAL_TERMINAL_RAW");
 assert.equal(r.events[0].readonly,true);
 assert.equal(r.events[0].sourceKey.length,64);
});
test("corrupt or partial SDK readout never becomes verified RAW",()=>{
 for(const result of [
  "STATUS|OK|2026-10-10T09:20:00|39|39|39\n"+line+"\n",
  "STATUS|OK|2026-10-10T09:20:00|39|39|39\n"+line+"\nEND|2",
  "STATUS|OK|2026-10-10T09:20:00|39|39|39\nLOG|ABC|2026-10-10T09:18:02|0|1|1|1\nEND|1",
  "ERROR|FP_CLOCK_OFFLINE",
  "STATUS|OK|2026-10-10T09:20:00|39|39|39\n"+line+"\nEND|1\nCLEARLOGS|OK",
 ])assert.throws(()=>parseFpClockReadout(result,scope),/FP_CLOCK|DEVICE/);
});
test("reader executable SHA and operator consent required, never uses legacy command bridge",async()=>{
 const root=await mkdtemp(join(tmpdir(),"pdks-fpclock-"));
 const exe=join(root,"KyPdks.FpClock.Reader.exe");
 try{
  await writeFile(exe,"isolated-fixture");
  const sha=createHash("sha256").update("isolated-fixture").digest("hex");
  const profile={ip:"192.168.1.224",port:5005,machineId:1};
  await assert.rejects(()=>createFpClockAdapter(profile,{...scope,
   executable:exe,approvedSha256:sha}),/OPT_IN_REQUIRED/);
  await assert.rejects(()=>createFpClockAdapter(profile,{...scope,enabled:true,
   executable:exe,approvedSha256:"0".repeat(64)}),/HASH_MISMATCH/);
  const calls=[];
  const adapter=await createFpClockAdapter(profile,{...scope,enabled:true,
   executable:exe,approvedSha256:sha,
   run:async(path,mode,config)=>{calls.push({path,mode,config});return good;},
  });
  assert.equal(adapter.getCapabilities().deleteDeviceLogs,false);
  assert.equal(await adapter.healthCheck(),true);
  assert.equal(adapter.getDeviceReport().registeredUsers,39);
  const events=await adapter.readRawBatch({maxRecords:200});
  assert.equal(events.length,1);assert.equal(events[0].cardNo,"00027");
  assert.equal(calls.length,1);assert.equal(calls[0].mode,"--read");
  await assert.rejects(()=>adapter.readRawBatch({deleteAfterRead:true}),/DELETE_FORBIDDEN/);
  await assert.rejects(()=>adapter.readRawBatch(),/READ_FIRST_REQUIRED/);
  await adapter.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
test("zero-event read requires END marker and backlog is drained without loss",async()=>{
 assert.throws(()=>parseFpClockReadout(
   "STATUS|OK|2026-10-10T09:20:00|0|39|39",scope),/END_MISSING/);
 const root=await mkdtemp(join(tmpdir(),"pdks-backlog-"));
 const exe=join(root,"KyPdks.FpClock.Reader.exe");
 try{
  await writeFile(exe,"backlog-fixture");
  const sha=createHash("sha256").update("backlog-fixture").digest("hex");
  const samples=Array.from({length:205},(_,i)=>
    "LOG|"+String(i).padStart(5,"0")+"|2026-10-10T09:18:02|0|1|1|1");
  const output="STATUS|OK|2026-10-10T09:20:00|205|39|39\n"+
    samples.join("\n")+"\nEND|205";
  let calls=0;
  const adapter=await createFpClockAdapter({
    ip:"192.168.1.224",port:5005,machineId:1,
  },{...scope,enabled:true,executable:exe,approvedSha256:sha,
    run:async()=>{calls++;return output;},
  });
  await adapter.healthCheck();
  assert.equal((await adapter.readRawBatch({maxRecords:200})).length,200);
  await adapter.healthCheck();
  assert.equal((await adapter.readRawBatch({maxRecords:200})).length,5);
  assert.equal(calls,1);
  await adapter.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
test("only dedicated reader path and explicit safe modes accepted",async()=>{
 await assert.rejects(()=>runFpClockProcess("/tmp/Hedef.exe","clearlogs",{
   ip:"192.168.1.224",port:5005,machineId:1,
 }),/READER_PATH_INVALID|WINDOWS_ONLY/);
});
