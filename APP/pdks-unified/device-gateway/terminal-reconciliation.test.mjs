import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm,readFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {issueQrCredential,verifyQrCredential,normalizedKioskEvent,
  normalizedWedgeCardEvent} from "./qr-terminal-core.mjs";
import {inspectLocalTerminalFact,reconcileLocalEvents,
  readLocalTerminalJournal} from "./terminal-reconciliation.mjs";
const now=Date.parse("2026-10-09T08:00:00Z");
const secret="only-for-disposable-QR-unit-tests-2026-123456789";
const terminal={terminalId:"term-001",companyId:"firm-1",
  connectorId:"KY_QR_LOCAL",timezone:"Europe/Istanbul",
  directionMode:"EXPLICIT_IN_OUT",inputMethods:["QR_SIGNED","BARCODE_WEDGE"]};
const signed=(nonce="disposable-nonce-1")=>{
  const token=issueQrCredential({companyId:"firm-1",employeeId:"emp-1",
    cardNo:"00003",issuer:"KY-ERP",secret,now,nonce});
  const credential=verifyQrCredential(token,{secret,companyId:"firm-1",now});
  return normalizedKioskEvent({terminal,credential,direction:"IN",now});
};
const wedge=()=>normalizedWedgeCardEvent({terminal,cardNo:"00027",direction:"OUT",now});
const reconcile=(events,tnfText="00003,11:00,091026,1,001\n")=>
  reconcileLocalEvents({companyId:"firm-1",terminalId:"term-001",
    events,tnfText,yearHint:2026});
test("one signed QR matches TNF reference by card+date+minute but never certifies a device",()=>{
  const result=reconcile([signed()]);
  assert.equal(result.matchedReference,1);
  assert.equal(result.acceptedPending,1);
  assert.equal(result.signedQrPending,1);
  assert.equal(result.firebirdVerified,false);
  assert.equal(result.terminalRawCertified,false);
  assert.equal(result.safeToApply,false);
  assert.equal(result.annualTnfWritten,false);
});
test("unmatched USB card remains unverified, no invented IN/OUT from TNF",()=>{
  const result=reconcile([wedge()]);
  assert.equal(result.notInReference,1);
  assert.equal(result.unsignedUsbPending,1);
  assert.equal(result.matchedReference,0);
  assert.equal(result.requiresHumanReview,true);
});
test("two QR facts in one minute never consume the same TNF line twice",()=>{
  const result=reconcile([signed("nonce-a"),signed("nonce-b")]);
  assert.equal(result.ambiguousDuplicateMinute,2);
  assert.equal(result.matchedReference,0);
});
test("modified card, fraudulent identity, crossed tenant or fake FDB flags fail closed",()=>{
  const fact=signed();
  const events=[
    {...fact,cardNo:"00004"},
    {...fact,companyId:"other"},
    {...fact,firebirdReconciled:true},
    {...fact,localTime:"11:05:00"},
    {...fact,sourceKey:"0".repeat(64)},
  ];
  for(const invalid of events){
    const result=reconcile([invalid]);
    assert.equal(result.rejectedFacts,1);
    assert.equal(result.matchedReference,0);
  }
  assert.equal(inspectLocalTerminalFact(fact,{companyId:"firm-1",
    terminalId:"term-001"}).valid,true);
});
test("TNF invalid source line cannot silently match or become a physical punch",()=>{
  const result=reconcile([signed()],"00003,11:00,321326,1,001\n");
  assert.equal(result.rejectedReferenceRows,1);
  assert.equal(result.matchedReference,0);
  assert.equal(result.notInReference,1);
});
test("read-only journal rejects filename mismatch and leaves input untouched",async()=>{
  const root=await mkdtemp(join(tmpdir(),"ky-terminal-reconcile-"));
  try{
    const dir=join(root,"events");await mkdir(dir);
    const fact=signed(),file=join(dir,fact.sourceKey+".json");
    const original=JSON.stringify(fact)+"\n";
    await writeFile(file,original,"utf8");
    const loaded=await readLocalTerminalJournal(root);
    assert.equal(loaded.length,1);
    assert.equal(reconcile(loaded).matchedReference,1);
    assert.equal(await readFile(file,"utf8"),original);
    await writeFile(join(dir,"f".repeat(64)+".json"),original,"utf8");
    await assert.rejects(()=>readLocalTerminalJournal(root),/FILENAME_HASH_MISMATCH/);
    await assert.rejects(()=>readLocalTerminalJournal(root,{limit:1}),/LIMIT_EXCEEDED/);
  }finally{await rm(root,{recursive:true,force:true});}
});
