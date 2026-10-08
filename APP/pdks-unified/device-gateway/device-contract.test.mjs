import { test } from "node:test";
import assert from "node:assert/strict";
import {DEVICE_FAMILIES,parseLocalPunchTimestamp,normalizeDeviceEvidence,
  createDeviceRegistry} from "./device-contract.mjs";

const sample=()=>({companyId:"firm-1",deviceId:"terminal-1",sourceRecordId:"src-17",
 cardNo:"00003",localTimestamp:"2026-10-08T08:28",timezone:"Europe/Istanbul",
 rawSha256:"1".repeat(64)});

test("device catalog lists common vendor families without certifying unsupported models",()=>{
  assert.ok(DEVICE_FAMILIES.some((x)=>x.id==="zkteco-standalone"));
  assert.ok(DEVICE_FAMILIES.some((x)=>x.id==="suprema-biostar"));
  assert.ok(DEVICE_FAMILIES.some((x)=>x.id==="anviz-crosschex"));
  assert.ok(DEVICE_FAMILIES.every((x)=>x.availability!=="universal-certified"));
});

test("raw device evidence retains physical time and leading-zero card number",()=>{
  const row=normalizeDeviceEvidence(sample());
  assert.equal(row.cardNo,"00003");
  assert.equal(row.localTimestamp,"2026-10-08T08:28");
  assert.equal(row.kind,"PHYSICAL_TERMINAL_RAW");
  assert.equal(row.readonly,true);
  assert.equal(row.sourceKey.length,64);
  assert.equal(Object.isFrozen(row),true);
});

test("impossible dates, timezone gaps, missing source id and hash are rejected",()=>{
  assert.throws(()=>parseLocalPunchTimestamp("2026-02-31T08:20"),/INVALID_LOCAL/);
  assert.throws(()=>parseLocalPunchTimestamp("2026-10-08T25:20"),/INVALID_LOCAL/);
  for(const invalid of [
    {...sample(),cardNo:"A123"},{...sample(),timezone:""},
    {...sample(),rawSha256:"none"},{...sample(),sourceRecordId:""},
  ])assert.throws(()=>normalizeDeviceEvidence(invalid),/INVALID_DEVICE_EVIDENCE/);
});

test("uncertified adapters cannot pretend universal compatibility",()=>{
  const registry=createDeviceRegistry();
  assert.throws(()=>registry.register({id:"fake",certified:false}),/UNVERIFIED/);
  assert.rejects(()=>registry.readBatch("unknown"),/NOT_CERTIFIED/);
});

test("certified read-only adapter yields immutable evidence and no terminal deletion",async()=>{
  const adapter={
    id:"test-device",certified:true,healthCheck:async()=>({online:true}),
    getCapabilities:()=>({readRaw:true,deleteDeviceLogs:false}),
    readRawBatch:async()=>[sample()],
  };
  const blocked=createDeviceRegistry();
  assert.throws(()=>blocked.register(adapter),/DEVICE_ADAPTER_NOT_APPROVED/);
  const registry=createDeviceRegistry({approvedAdapterIds:["test-device"]});
  registry.register(adapter);
  const batch=await registry.readBatch("test-device");
  assert.equal(batch.length,1);
  assert.ok(Object.isFrozen(batch));
  await assert.rejects(()=>registry.readBatch("test-device",{deleteAfterRead:true}),/RAW_DELETE_FORBIDDEN/);
});
