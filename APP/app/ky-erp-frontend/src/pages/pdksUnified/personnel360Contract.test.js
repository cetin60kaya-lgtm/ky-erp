import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceForTab,rowsForTab} from "./tabBindings.js";
import {normalizePerson} from "./productData.js";

const root=dirname(fileURLToPath(import.meta.url));
const file=name=>readFileSync(resolve(root,name),"utf8");

test("Personnel 360 uses the existing PDKS shell with a real personnel service",()=>{
  const page=file("PdksUnifiedApp.jsx");
  assert.match(page,/import Personnel360Manage/);
  assert.match(page,/\["people","cards","employment","documents"\]/);
  assert.match(page,/onSaved=\{\(\)=>setReloadToken/);
  assert.match(page,/detailVisible\?personTab:"identity"/);
  assert.match(file("readService.js"),/export const readAllPersonnel=async/);
  assert.match(file("readService.js"),/fresh\("\/ik\/personnel-control\/people"/);
  assert.match(file("useUnifiedPdksData.js"),/requirement==="people" \? api\.readAllPersonnel : api\.readPeople/);
});

test("real staff without a card remains selectable; missing evidence is not fabricated",()=>{
  const person=normalizePerson({
    id:"employee-1",fullName:"Example",cardNo:"",sgkStatus:"YOK",
    department:"Factory",title:"Operator",status:"Aktif",
  },{year:2026,month:10});
  assert.equal(person.cardState,"Atanmamış");
  assert.equal(person.role,"Operator");
  assert.equal(person.sgkStatus,"YOK");
  for(const tab of ["people","cards","employment","documents"]){
    assert.equal(sourceForTab(tab),"people");
    const {rows,supported}=rowsForTab(tab,null,{people:[person]});
    assert.equal(supported,true);
    assert.equal(rows.length,1);
    assert.equal(rows[0]._id,"employee-1");
  }
  assert.equal(rowsForTab("documents",null,{people:[person]}).rows[0]["Durum"],"—");
});

test("personnel mutations are explicit; no demo or automatic terminal writes",()=>{
  const code=file("Personnel360Manage.jsx");
  assert.match(code,/card-assignment/);
  assert.match(code,/expectedCardNo:assigned/);
  assert.match(code,/\/documents\/\$\{encodeURIComponent\(d\.id\)\}\/unlink/);
  assert.match(code,/onSaved\?\.\(\)/);
  assert.match(code,/FP_CLOCK, FDB ve TNF'ye yazmaz/);
  assert.match(code,/if\(previewOnly\)/);
  assert.match(code,/if\(isAuditAccount\)/);
  assert.match(code,/İstihdam Durumu/);
  assert.match(code,/expectedGroupId:/);
  assert.match(code,/\/documents\/\$\{encodeURIComponent\(id\)\}\/preview/);
  assert.match(code,/URL\.revokeObjectURL/);
  assert.match(file("PdksUnifiedApp.jsx"),/Kart atanmamış personele otomatik giriş\/çıkış ve puantaj üretilmez/);
});
