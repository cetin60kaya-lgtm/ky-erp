import {test} from "node:test";
import assert from "node:assert/strict";
import {validateOperation,advanceOperation,isFullySynchronized,statusForUi}
 from "./eventProtocol.mjs";

const raw=()=>({tenant:"hakan-emp",idempotencyKey:"a1",actorId:"admin",
 entityId:"00003",kind:"PHYSICAL_PUNCH_BATCH",reason:"Gerçek terminal hareketi",
 source:"KY_PDKS_WINDOWS_AGENT"});
test("cross-platform event remains pending until verified FDB/TNF + cloud ACK",()=>{
  let event=validateOperation(raw());
  assert.equal(isFullySynchronized(event),false);
  assert.equal(statusForUi(event),"BEKLİYOR");
  event=advanceOperation(event,"VALIDATED");
  event=advanceOperation(event,"AUTHORIZED",{approver:"admin",approvalId:"app-1"});
  event=advanceOperation(event,"LOCAL_APPLIED",{transactionId:"tx-1",backupId:"bk-1"});
  assert.throws(()=>advanceOperation(event,"RECONCILED",{fdbValidated:true,sourceValidated:true}),/MISSING_RECONCILIATION/);
  event=advanceOperation(event,"RECONCILED",{fdbValidated:true,sourceValidated:true,tnfValidated:true});
  assert.equal(isFullySynchronized(event),false);
  event=advanceOperation(event,"CLOUD_ACKED",{remoteRevision:17,ackId:"ack-1"});
  assert.equal(isFullySynchronized(event),true);
  assert.equal(statusForUi(event),"DOĞRULANDI");
  assert.throws(()=>advanceOperation(event,"CLOUD_ACKED",{remoteRevision:18,ackId:"ack-2"}),/ILLEGAL/);
});
test("company/actor/idempotency/reason and proof are mandatory",()=>{
  assert.throws(()=>validateOperation({...raw(),actorId:""}),/INVALID/);
  assert.throws(()=>validateOperation({...raw(),reason:""}),/INVALID/);
  const event=advanceOperation(validateOperation(raw()),"VALIDATED");
  assert.throws(()=>advanceOperation(event,"AUTHORIZED",{}),/MISSING_APPROVAL/);
  assert.throws(()=>advanceOperation(event,"CLOUD_ACKED",{ackId:"a"}),/ILLEGAL/);
});
test("conflicts never silently advance as committed or synchronized",()=>{
  const event=validateOperation(raw());
  const conflict=advanceOperation(event,"CONFLICT",{reason:"Çakışan kaynak"});
  assert.equal(statusForUi(conflict),"İNCELEME_GEREKLİ");
  assert.throws(()=>advanceOperation(conflict,"VALIDATED"),/ILLEGAL/);
});
