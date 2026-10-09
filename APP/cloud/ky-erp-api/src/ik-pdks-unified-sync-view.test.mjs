import test from "node:test";
import assert from "node:assert/strict";
import {projectUnifiedSyncStatus} from "./ik-pdks-unified-sync-view.mjs";
const company="company-01";
const make=(overrides={})=>({
  company,asOf:"2026-10-09T09:00:00Z",
  counts:[{state:"PENDING",total:2},{state:"CLAIMED",total:1},
    {state:"ACKED",total:4},{state:"FAILED",total:3}],
  devices:[{main_company_id:company,active:1},
    {main_company_id:company,active:0}],
  rows:[{
    id:"outbox-123",main_company_id:company,action:"holiday",
    event_type:"IK_PDKS_UNIFIED_COMMAND",state:"FAILED",
    delivery_attempts:2,created_at:"2026-10-09T08:00:00Z",
    last_error:"SOURCE_PROOF_MISMATCH",payload_json:"DO NOT SHOW",
    secret_hash:"DO NOT SHOW",employee_id:"DO NOT SHOW",
  }],...overrides,
});
test("tenant-scoped sync summary shows command states but does not prove hardware",()=>{
  const result=projectUnifiedSyncStatus(make());
  assert.deepEqual(result.status,{PENDING:2,CLAIMED:1,ACKED:4,FAILED:3});
  assert.equal(result.totalCommands,10);
  assert.deepEqual(result.devices,{registered:2,enabled:1});
  assert.equal(result.localAgentOnline,false);
  assert.equal(result.terminalRawCertified,false);
  assert.equal(result.annualTnfVerified,false);
  assert.equal(result.recent[0].errorCode,"SOURCE_PROOF_MISMATCH");
  const resultJson=JSON.stringify(result);
  assert.equal(resultJson.includes("DO NOT SHOW"),false);
  assert.equal(resultJson.includes("secret_hash"),false);
});
test("free text errors are redacted from display and payload discarded",()=>{
  const row={...make().rows[0],last_error:"Card 00003 failed for user A"};
  const result=projectUnifiedSyncStatus(make({rows:[row]}));
  assert.equal(result.recent[0].errorCode,"DETAIL_REDACTED");
});
test("cross-tenant outbox or enrolled device rejects full response",()=>{
  assert.throws(()=>projectUnifiedSyncStatus(make({rows:[
    {...make().rows[0],main_company_id:"other-company"},
  ]})),/TENANT_OR_ROW_INVALID/);
  assert.throws(()=>projectUnifiedSyncStatus(make({devices:[
    {main_company_id:"other-company",active:1},
  ]})),/DEVICE_TENANT_INVALID/);
});
test("untrusted outbox state/count/attempt never silently claims healthy sync",()=>{
  for(const counts of [[{state:"DONE",total:1}],[{state:"ACKED",total:-1}],
    [{state:"ACKED",total:"NaN"}]])
    assert.throws(()=>projectUnifiedSyncStatus(make({counts})),/COUNT_INVALID/);
  assert.throws(()=>projectUnifiedSyncStatus(make({rows:[
    {...make().rows[0],state:"DELETED"},
  ]})),/TENANT_OR_ROW_INVALID/);
});
test("unapplied migration or unavailable database must not appear as empty queue",()=>{
  assert.throws(()=>projectUnifiedSyncStatus(make({devices:"unavailable"})),/SHAPE_INVALID/);
  assert.throws(()=>projectUnifiedSyncStatus(make({company:""})),/SHAPE_INVALID/);
});
