import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const intake=readFileSync(new URL("./file-hub-accounting-intake.ts",import.meta.url),"utf8");
const agent=readFileSync(new URL("./file-hub-agent-public.ts",import.meta.url),"utf8");

test("İşNet alternatif PDF, durum ve uygulama klasörleri finansal e-belge ithalatına girmez",()=>{
  for(const internal of ["_inceleme","_durum","_uygulama"]){
    const expected="INSTR('/'||LOWER(REPLACE(l.relative_path,";
    assert.ok(intake.includes(expected), "folder segments must be checked");
    assert.ok(intake.includes("'/"+internal+"/')=0"),internal+" must be excluded");
    assert.ok(agent.includes('"'+internal+'"'),internal+" must not create document auto-links");
  }
  assert.match(intake,/b\.purpose_code='E_DOCUMENT'/);
  assert.match(agent,/internalParts\.some/);
  assert.match(agent,/\["ISNET","E_BELGE","EBELGE"\]/);
});
