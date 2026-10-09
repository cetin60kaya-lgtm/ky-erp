import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CONNECTORS,INPUT_METHODS,validateTerminalDefinition,installationPlan}
  from "./terminal-profiles.mjs";
import {issueQrCredential,verifyQrCredential,normalizedKioskEvent}
  from "./qr-terminal-core.mjs";
import {startQrKiosk} from "./terminal-kiosk.mjs";
const now=Date.parse("2026-10-09T08:00:00Z");
const secret="ky-pdks-signing-key-example-do-not-use-production-123";
const operatorKey="ky-pdks-local-operator-secret-example-only-456";
const sample=()=>({terminalId:"term-001",companyId:"firm-1",vendor:"KY",
  model:"QR USB Kiosk",connectorId:"KY_QR_LOCAL",timezone:"Europe/Istanbul",
  inputMethods:["QR_SIGNED","BARCODE_WEDGE"],
  directionMode:"EXPLICIT_IN_OUT",approvalState:"DRAFT"});
const credential=(extra={})=>issueQrCredential({
  companyId:"firm-1",employeeId:"person-1",cardNo:"00003",issuer:"KY-ERP",
  secret,now,ttlSeconds:90,nonce:"demo-nonce-for-test-1",...extra});
test("multi-vendor transport definitions cover SDK, API, Wiegand, OSDP, QR, NFC",()=>{
  for(const id of ["KY_QR_LOCAL","ZK_PULL","ZK_PUSH","BIOSTAR_2","BIOSTAR_X",
    "HIKVISION_ISAPI","ANVIZ_CROSSCHEX","DAHUA_SDK","OSDP_CONTROLLER",
    "WIEGAND_CONTROLLER","CSV_TNF_FILE","GENERIC_HTTPS_WEBHOOK"]){
    assert.ok(CONNECTORS.some(c=>c.id===id));
  }
  for(const id of ["RFID_125KHZ","RFID_13_56MHZ","NFC_SECURE","QR_SIGNED",
    "QR_VENDOR","BARCODE_WEDGE","FINGERPRINT","FACE","PIN","MOBILE_NFC"])
    assert.ok(INPUT_METHODS.some(m=>m.id===id));
  assert.ok(CONNECTORS.every(x=>x.status!=="UNIVERSAL_CERTIFIED"));
});
test("terminal setup validates restricted LAN, explicit driver state and no secrets",()=>{
  const profile=validateTerminalDefinition(sample());
  assert.equal(profile.readOnly,true);
  assert.equal(installationPlan(sample()).readyForProduction,false);
  assert.equal(profile.collectBiometricTemplates,false);
  const sdk={...sample(),connectorId:"ZK_PULL",host:"192.168.1.57",port:4370};
  assert.equal(validateTerminalDefinition(sdk).driverStatus,"SDK_REQUIRED");
  for(const host of ["127.0.0.1","0.0.0.0","8.8.8.8","192.168.1.256",
    "192.168.1.57:4370"]){
    assert.throws(()=>validateTerminalDefinition({...sdk,host}),/PRIVATE_IP/);
  }
  assert.throws(()=>validateTerminalDefinition({...sdk,password:"secret"}),/SECRET_IN_DEFINITION/);
  assert.throws(()=>validateTerminalDefinition({...sdk,approvalState:"CERTIFIED"}),/DRIVER_PROOF/);
});
test("signed QR preserves leading zero card and expires; tampering and wrong company fail",()=>{
  const token=credential();
  const verified=verifyQrCredential(token,{secret,companyId:"firm-1",now});
  assert.equal(verified.cardNo,"00003");
  assert.equal(verified.employeeId,"person-1");
  assert.equal(verified.credentialHash.length,64);
  assert.equal(verified.biometricDataStored,false);
  assert.throws(()=>verifyQrCredential(token,{secret,companyId:"firm-2",now}),/CLAIMS_INVALID/);
  assert.throws(()=>verifyQrCredential(token,{secret,companyId:"firm-1",now:now+93000}),/EXPIRED/);
  assert.throws(()=>verifyQrCredential(token.slice(0,-1)+"Z",{secret,companyId:"firm-1",now}),/SIGNATURE_INVALID/);
  assert.throws(()=>issueQrCredential({companyId:"firm-1",employeeId:"a",
    cardNo:"00003",issuer:"x",secret,ttlSeconds:400,now}),/ISSUANCE_INVALID/);
});
test("QR attendance is local pending evidence, not physical device or FDB/TNF ACK",()=>{
  const verified=verifyQrCredential(credential(),{secret,companyId:"firm-1",now});
  const e=normalizedKioskEvent({terminal:validateTerminalDefinition(sample()),
    credential:verified,direction:"IN",now});
  assert.equal(e.localTime,"11:00:00");
  assert.equal(e.workDate,"2026-10-09");
  assert.equal(e.status,"PENDING_RECONCILIATION");
  assert.equal(e.physicalHardwareProven,false);
  assert.equal(e.firebirdReconciled,false);
  assert.equal(e.tnfReconciled,false);
  assert.throws(()=>normalizedKioskEvent({terminal:validateTerminalDefinition(sample()),
    credential:verified,direction:"AUTO",now}),/DIRECTION/);
});
test("real localhost HTTP kiosk records exactly once, survives restart and rejects other origins",async()=>{
  const root=await mkdtemp(join(tmpdir(),"ky-qr-device-gateway-"));
  let port=0,server=null;
  for(const p of [5197,5198,5199,5200,5201,5202,5203,5204,5205]){
    try{
      server=await startQrKiosk({terminal:sample(),secret,operatorKey,
        journalRoot:root,now:()=>now,bindPort:p});port=p;break;
    }catch(error){if(error?.code!=="EADDRINUSE")throw error;}
  }
  assert.ok(server,"No unused local QR test port");
  const base="http://127.0.0.1:"+port;
  const request=(key,token=credential(),direction="IN",origin=base)=>
    fetch(base+"/scan",{method:"POST",headers:{
      "content-type":"application/json","x-ky-pdks-terminal-key":key,origin,
    },body:JSON.stringify({token,direction})});
  try{
    assert.equal((await fetch(base+"/health")).status,200);
    assert.equal((await request("invalid")).status,401);
    assert.equal((await request(operatorKey,credential(),"IN","https://evil.example")).status,403);
    const first=await request(operatorKey);assert.equal(first.status,202);
    assert.equal((await first.json()).status,"PENDING_RECONCILIATION");
    const again=await request(operatorKey);assert.equal(again.status,409);
    assert.equal((await request(operatorKey,credential(),"AUTO")).status,422);
    const files=(await readdir(join(root,"events"))).filter(x=>x.endsWith(".json"));
    assert.equal(files.length,1);
    const stored=JSON.parse(await readFile(join(root,"events",files[0]),"utf8"));
    assert.equal(stored.cardNo,"00003");
    assert.equal(stored.status,"PENDING_RECONCILIATION");
    assert.equal(stored.cloudAcked,false);
    assert.equal((await fetch(base+"/events",{headers:{
      "x-ky-pdks-terminal-key":operatorKey}})).status,200);
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    server=await startQrKiosk({terminal:sample(),secret,operatorKey,
      journalRoot:root,now:()=>now,bindPort:port});
    assert.equal((await request(operatorKey)).status,409,
      "After process restart the same QR must not write second physical event");
  }finally{
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
  }
});
