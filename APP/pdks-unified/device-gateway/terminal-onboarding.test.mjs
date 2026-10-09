import test from "node:test";
import assert from "node:assert/strict";
import {TERMINAL_CONNECTIONS,TERMINAL_CREDENTIALS,TERMINAL_FAMILIES,
  buildTerminalDefinition,approvalForTerminal} from "./terminal-onboarding.mjs";
const input=()=>({family:"zkteco",transport:"tcp-sdk",name:"Fabrika Giriş",
  model:"Model-123",serial:"S123",host:"192.168.1.20",port:4370,credentials:["rfid","pin"]});
test("catalog covers LAN SDK, HTTPS, QR, serial and files but promises no universal driver",()=>{
  assert.ok(TERMINAL_CONNECTIONS.length>=7);assert.ok(TERMINAL_FAMILIES.length>=10);
  assert.ok(TERMINAL_CREDENTIALS.some(x=>x.id==="qr"));
  assert.ok(TERMINAL_CREDENTIALS.some(x=>x.id==="fingerprint"));
  assert.ok(TERMINAL_FAMILIES.every(x=>!x.certified));
});
test("onboarding retains device connection details without enabling reads or writes",()=>{
  const x=buildTerminalDefinition(input());
  assert.equal(x.certification,"NOT_CERTIFIED");
  assert.equal(x.canReadPunches,false);assert.equal(x.canWriteTerminal,false);
  assert.equal(x.biometricTemplatesStored,false);
  assert.equal(x.endpoint.port,4370);
  assert.deepEqual(x.credentials,["rfid","pin"]);
  assert.ok(Object.isFrozen(x));
});
test("missing model, invalid address, arbitrary QR modes and unsafe API URL rejected",()=>{
  for(const value of [
    {...input(),model:""},{...input(),port:65536},{...input(),host:"127.0.0.1/path"},
    {...input(),credentials:["unknown"]},
    {...input(),transport:"https-api",baseUrl:"http://example.com"},
    {...input(),transport:"https-api",baseUrl:"https://localhost"},
    {...input(),transport:"qr-reader",readerMode:"READ_ALL_HID"},
    {...input(),transport:"serial",comPort:"COM0"},
  ])assert.throws(()=>buildTerminalDefinition(value),/TERMINAL_/);
});
test("valid QR and serial definitions do not claim raw certified punches",()=>{
  const qr=buildTerminalDefinition({...input(),family:"generic-qr",
    transport:"qr-reader",readerMode:"HID_KEYBOARD",credentials:["qr"]});
  assert.equal(qr.canReadPunches,false);
  const serial=buildTerminalDefinition({...input(),family:"legacy-serial",
    transport:"serial",comPort:"COM4"});
  assert.equal(serial.endpoint.comPort,"COM4");
});
test("vendor self-certification cannot bypass model-specific signed test gate",()=>{
  const definition=buildTerminalDefinition(input());
  assert.throws(()=>approvalForTerminal({definition,driverProof:{approved:true}}),/UNVERIFIED/);
  const driverProof={model:definition.model,transport:definition.transport,
    approved:true,readRawTestPassed:true,duplicateTestPassed:true,
    timezoneTestPassed:true,rollbackTestPassed:true,testArtifactSha256:"a".repeat(64)};
  const ok=approvalForTerminal({definition,driverProof});
  assert.equal(ok.canReadPunches,true);
  assert.equal(ok.canWriteTerminal,false);
  assert.equal(ok.certification,"MODEL_READONLY_CERTIFIED");
});
