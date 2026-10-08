import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_SECTIONS, ALL_PRODUCT_TABS, PRODUCT_PERSON_TABS,
  resolveProductRoute, inspectProductModel, isSensitiveProductTab,
  configuredProductSections } from "./productModel.js";
import {normalizePerson, normalizeAttendanceDay, csvForTable, getDataRequirement,
  toAttendanceRows } from "./productData.js";

test("KY PDKS has 9 complete top-level sections and unique, rendered subpages", () => {
  const result = inspectProductModel();
  assert.equal(result.sections, 9);
  assert.equal(result.tabs, 49);
  assert.deepEqual(result.duplicateSections, []);
  assert.deepEqual(result.duplicateTabs, []);
  assert.deepEqual(result.unsupportedViews, []);
  assert.deepEqual(result.missingColumns, []);
  assert.equal(ALL_PRODUCT_TABS.length,
    PRODUCT_SECTIONS.reduce((total,s)=>total+s.tabs.length,0));
});

test("each section has one valid primary view and stable route resolution", () => {
  for(const section of PRODUCT_SECTIONS) {
    assert.ok(section.tabs.length>=3,section.id);
    assert.equal(resolveProductRoute(section.id,section.tabs[0].id).tab.id,section.tabs[0].id);
    assert.equal(resolveProductRoute(section.id,"unknown").tab.id,section.tabs[0].id);
    for(const tab of section.tabs) {
      assert.ok(tab.description && tab.label && tab.columns);
    }
  }
  assert.equal(resolveProductRoute("not-known","not-known").section.id,"overview");
});

test("person 360 covers 9 distinct tabs and finance content remains sensitive", () => {
  assert.equal(PRODUCT_PERSON_TABS.length,9);
  assert.equal(new Set(PRODUCT_PERSON_TABS.map((x)=>x[0])).size,9);
  assert.equal(isSensitiveProductTab("salary"),true);
  assert.equal(isSensitiveProductTab("payroll"),true);
  assert.equal(isSensitiveProductTab("people"),false);
});

test("person and attendance adapters preserve source data and never invent time", () => {
  const original={id:"42",fullName:"Gerçek Kayıt",cardNo:"00003",status:"AKTIF",
    entryDate:"2026-01-12",exitDate:null};
  const person=normalizePerson(original);
  assert.equal(person.cardNo,"00003");
  assert.equal(person.fullName,"Gerçek Kayıt");
  assert.equal(person.startDate,"2026-01-12");
  const day=normalizeAttendanceDay({workDate:"2026-10-08",entryTime:"08:22"},person);
  assert.equal(day.entry,"08:22");
  assert.equal(day.exit,"—");
  assert.equal(day.source,"—");
  assert.equal(day.e,"—");
  assert.equal(toAttendanceRows([{}],person)[0]["Giriş"],"—");
  assert.equal(original.entryDate,"2026-01-12");
});

test("integration contract is explicit about unconnected screens", () => {
  assert.equal(getDataRequirement({section:"people",id:"people"}),"people");
  assert.equal(getDataRequirement({section:"attendance",id:"punches"}),"attendance");
  assert.equal(getDataRequirement({section:"payroll",id:"payments"}),"unconnected");
  assert.equal(getDataRequirement({section:"devices",id:"terminals"}),"unconnected");
});

test("CSV escapes formulas and dangerous contents", () => {
  const csv=csvForTable(["Personel","Değer"],[{"Personel":"=HYPERLINK(\"https://evil\")","Değer":"normal"},
    {"Personel":"Gerçek Kayıt","Değer":"+100"}]);
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv,/'=HYPERLINK/);
  assert.match(csv,/"'\+100"/);
  assert.doesNotMatch(csv,/^=HYPERLINK/m);
});

test("tenant menu customization only changes presentation and audit hides wage/admin",()=>{
  const customized=configuredProductSections({
    hiddenSections:["planning","fake"],sectionOrder:["devices","people"],
    labels:{people:"Personel 360",devices:"Senkron Yönetimi"},
  });
  assert.equal(customized[0].id,"devices");
  assert.equal(customized[1].id,"people");
  assert.equal(customized[1].label,"Personel 360");
  assert.equal(customized.some((s)=>s.id==="planning"),false);
  assert.equal(customized.some((s)=>s.id==="overview"),true);
  assert.equal(customized.flatMap((s)=>s.tabs).some((t)=>t.id==="salary"),true);
  const audit=configuredProductSections({}, {audit:true});
  assert.equal(audit.some((s)=>s.id==="payroll"),false);
  assert.equal(audit.some((s)=>s.id==="admin"),false);
  assert.equal(audit.flatMap((s)=>s.tabs).some((t)=>t.id==="payroll"),false);
});

test("date-aware personnel status uses selected period without rewriting actual hire/exit",()=>{
  const employee={id:"8",cardNo:"00056",fullName:"Historical Employee",
    entryDate:"2018-03-01",exitDate:"2026-08-04",status:"PASIF"};
  const august=normalizePerson(employee,{year:2026,month:8});
  assert.equal(august.status,"Çıkış Yapıldı");
  assert.equal(august.cardNo,"00056");
  const july=normalizePerson(employee,{year:2026,month:7});
  assert.equal(july.status,"Dönemde Çalıştı");
  const september=normalizePerson(employee,{year:2026,month:9});
  assert.equal(september.status,"Dönem Dışı");
  assert.equal(employee.status,"PASIF");
  const futureExit={...employee,exitDate:"2027-05-30",status:"AKTIF"};
  assert.equal(normalizePerson(futureExit,{year:2026,month:10}).status,"Dönemde Çalıştı");
});
