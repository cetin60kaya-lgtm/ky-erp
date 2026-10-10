import test from "node:test";
import assert from "node:assert/strict";
import {createTerminalFleet,legacyTerminalDefinition} from "./terminal-fleet.mjs";
import {inspectImportedLegacyProfiles} from "./legacy-hedef-terminal-profile.mjs";
const profile=(terminalId,host)=>({
  terminalId,companyId:"stage-firm-1",vendor:"Generic",
  model:"Hedef FP_CLOCK x86",connectorId:"HEDEF_FP_CLOCK",host,port:5005,
  timezone:"Europe/Istanbul",inputMethods:["RFID_125KHZ"],
  directionMode:"EXPLICIT_IN",approvalState:"DRAFT",
});
const event=(deviceId,sourceRecordId,companyId="stage-firm-1")=>({
  companyId,deviceId,sourceRecordId,cardNo:"00027",
  localTimestamp:"2026-10-10T09:04:00",timezone:"Europe/Istanbul",
  rawSha256:"a".repeat(64),
});
const adapter=(id,readRawBatch)=>({
  id,certified:true,healthCheck:async()=>true,
  getCapabilities:()=>({readRaw:true,deleteDeviceLogs:false}),
  readRawBatch,close:async()=>{},
});
test("existing Hedef profile maps into safe draft; second is imported, not guessed",()=>{
  const rows=inspectImportedLegacyProfiles([
    {profileName:"Cihaz1",machineId:1,ip:"192.168.1.224",port:5005,direction:"IN"},
    {profileName:"Cihaz2",machineId:2,ip:"192.168.1.222",port:5005,direction:"OUT"},
  ]);
  assert.equal(legacyTerminalDefinition(rows[0],"stage-firm-1").terminalId,"HEDEF-Cihaz1");
  assert.equal(legacyTerminalDefinition(rows[1],"stage-firm-1").host,"192.168.1.222");
  assert.equal(legacyTerminalDefinition(rows[1],"stage-firm-1").directionMode,"EXPLICIT_OUT");
  assert.throws(()=>legacyTerminalDefinition({profileName:"Cihaz2",machineId:2,ip:"8.8.8.8",port:5005},"stage-firm-1"),/PRIVATE_IP/);
});
test("unapproved driver cannot read cards even when TCP is reachable",async()=>{
  let reads=0,connected=0;
  const fleet=createTerminalFleet({definitions:[profile("HEDEF-Cihaz1","192.168.1.224")],
    probe:async()=>({connectionReachable:true}),
    adapterFactory:async()=>{connected++;return adapter("HEDEF-Cihaz1",async()=>{reads++;return [];});},
  });
  assert.equal((await fleet.pollOnce())[0].status,"NETWORK_REACHABLE_DRIVER_NOT_APPROVED");
  assert.equal(reads,0);assert.equal(connected,0);
  assert.throws(()=>fleet.recentEvidence(),/TRUST_REQUIRED/);
  await fleet.stop();
});
test("two devices read independently, preserve RAW identity, deduplicate repeated scans",async()=>{
  const definition1=profile("HEDEF-Cihaz1","192.168.1.224");
  const definition2=profile("HEDEF-Cihaz2","192.168.1.223");
  const received=[],calls=[];
  const fleet=createTerminalFleet({definitions:[definition1,definition2],
    approvedAdapterIds:["HEDEF-Cihaz1","HEDEF-Cihaz2"],
    probe:async()=>({connectionReachable:true}),
    adapterFactory:async(d)=>adapter(d.terminalId,async(o)=>{
      calls.push({terminalId:d.terminalId,...o});
      return [event(d.terminalId,"source-1")];
    }),onEvidence:e=>received.push(e),
  });
  await fleet.pollOnce();await fleet.pollOnce();
  assert.equal(received.length,2);
  assert.equal(new Set(received.map(e=>e.sourceKey)).size,2);
  assert.ok(received.every(e=>e.readonly===true&&e.cardNo==="00027"));
  assert.ok(calls.every(c=>c.deleteAfterRead===false));
  const statuses=fleet.status();
  assert.ok(statuses.every(s=>s.status==="LIVE_RAW_READ_UNRECONCILED"));
  assert.ok(statuses.every(s=>s.accepted===1&&s.duplicates===1&&!s.firebirdReconciled&&!s.tnfReconciled));
  assert.equal(fleet.recentEvidence({trusted:true}).length,2);
  await fleet.stop();
});
test("bad tenant in a batch rejects all; no partial event acceptance",async()=>{
  const fleet=createTerminalFleet({definitions:[profile("HEDEF-Cihaz1","192.168.1.224")],
    approvedAdapterIds:["HEDEF-Cihaz1"],probe:async()=>({connectionReachable:true}),
    adapterFactory:async()=>adapter("HEDEF-Cihaz1",async()=>[
      event("HEDEF-Cihaz1","source-1"),
      event("HEDEF-Cihaz1","source-2","other-tenant"),
    ]),
  });
  const snapshot=(await fleet.pollOnce())[0];
  assert.equal(snapshot.status,"OFFLINE_RETRY_SCHEDULED");
  assert.equal(snapshot.lastError,"TERMINAL_TENANT_OR_DEVICE_MISMATCH");
  assert.equal(snapshot.accepted,0);
  await fleet.stop();
});
test("offline device has bounded exponential retry and does not block healthy peers",async()=>{
  let time=100000,retries=0;
  const fleet=createTerminalFleet({
    definitions:[profile("HEDEF-Cihaz1","192.168.1.224"),
      profile("HEDEF-Cihaz2","192.168.1.223")],
    now:()=>time,
    probe:async d=>{
      if(d.terminalId==="HEDEF-Cihaz1"){retries++;return {connectionReachable:retries>1};}
      return {connectionReachable:true};
    },
  });
  let statuses=await fleet.pollOnce();
  assert.equal(statuses[0].status,"OFFLINE_RETRY_SCHEDULED");
  assert.equal(statuses[1].status,"NETWORK_REACHABLE_DRIVER_NOT_APPROVED");
  assert.equal(statuses[0].nextAttemptAt,101000);
  time=100500;await fleet.pollOnce();assert.equal(retries,1);
  time=101100;statuses=await fleet.pollOnce();
  assert.equal(retries,2);
  assert.equal(statuses[0].status,"NETWORK_REACHABLE_DRIVER_NOT_APPROVED");
  await fleet.stop();await assert.rejects(()=>fleet.pollOnce(),/STOPPED/);
});
test("colliding terminal identity and endpoint are blocked",()=>{
  const d=profile("HEDEF-Cihaz1","192.168.1.224");
  assert.throws(()=>createTerminalFleet({definitions:[d,d]}),/DUPLICATE_ID/);
  assert.throws(()=>createTerminalFleet({definitions:[d,{...d,terminalId:"HEDEF-Cihaz2"}]}),/DUPLICATE_ENDPOINT/);
});
