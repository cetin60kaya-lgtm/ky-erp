import test from "node:test";
import assert from "node:assert/strict";
import {CONFIRMED_LEGACY_TERMINAL,inspectImportedLegacyProfiles} from "./legacy-hedef-terminal-profile.mjs";
import {validateTerminalDefinition} from "./terminal-profiles.mjs";
test("previous working Hedef ethernet profile is preserved without writes",()=>{
 assert.equal(CONFIRMED_LEGACY_TERMINAL.ip,"192.168.1.224");
 assert.equal(CONFIRMED_LEGACY_TERMINAL.port,5005);
 assert.equal(CONFIRMED_LEGACY_TERMINAL.machineId,1);
 assert.equal(CONFIRMED_LEGACY_TERMINAL.adapter,"FP_CLOCK_ACTIVE_X86");
 assert.equal(CONFIRMED_LEGACY_TERMINAL.deleteTerminalLogs,false);
 const terminal=validateTerminalDefinition({
  terminalId:"HEDEF-CIHAZ-1",companyId:"stage-firma-1",
  vendor:"Generic",model:"HEDEF FP_CLOCK x86",
  connectorId:"HEDEF_FP_CLOCK",host:"192.168.1.224",port:5005,
  timezone:"Europe/Istanbul",inputMethods:["RFID_125KHZ"],
  directionMode:"EXPLICIT_IN",approvalState:"DRAFT",
 });
 assert.equal(terminal.connectorId,"HEDEF_FP_CLOCK");
 assert.equal(terminal.readOnly,true);
});
test("two locally imported legacy records retain distinct device identities",()=>{
 const rows=inspectImportedLegacyProfiles([
  {profileName:"Cihaz1",machineId:1,ip:"192.168.1.224",port:5005},
  {profileName:"Cihaz2",machineId:2,ip:"192.168.1.222",port:5005},
 ]);
 assert.equal(rows.length,2);assert.equal(rows[1].certified,false);
 assert.equal(rows[0].readOnly,true);
 assert.throws(()=>inspectImportedLegacyProfiles([rows[0],rows[0]]),/LEGACY_PROFILE_INVALID/);
});
test("unverified or unsafe old terminal definitions are rejected",()=>{
 assert.throws(()=>inspectImportedLegacyProfiles([{profileName:"Cihaz2",machineId:2,ip:"999.1.1.1",port:5005}]),/INVALID/);
 assert.throws(()=>inspectImportedLegacyProfiles([{profileName:"Cihaz2",machineId:2,ip:"192.168.1.22",port:0}]),/INVALID/);
});
