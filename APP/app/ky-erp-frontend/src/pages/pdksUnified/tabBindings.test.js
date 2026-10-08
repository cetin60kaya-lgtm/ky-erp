import test from "node:test";
import assert from "node:assert/strict";
import {TAB_BINDINGS, tabBinding, sourceForTab, rowsForTab,
  integrationCoverage} from "./tabBindings.js";
import {ALL_PRODUCT_TABS} from "./productModel.js";

test("all 49 KY PDKS tabs have one explicit, unique read capability",()=>{
  assert.equal(TAB_BINDINGS.length,49);
  assert.equal(new Set(TAB_BINDINGS.map((t)=>t.id)).size,49);
  assert.deepEqual(TAB_BINDINGS.map((t)=>t.id),ALL_PRODUCT_TABS.map((t)=>t.id));
  assert.equal(integrationCoverage().total,49);
  assert.ok(TAB_BINDINGS.every((t)=>t.safeToWrite===false));
  assert.ok(TAB_BINDINGS.every((t)=>typeof t.source==="string" && !!t.source));
});
test("terminal, FDB/TNF and cloud not claimed connected without Windows Agent",()=>{
  for(const id of ["terminals","transfer","tnf","cloud","reconciliation","incidents"]){
    assert.equal(sourceForTab(id),"unconnected",id);
  }
  assert.equal(sourceForTab("payroll",{audit:true}),"forbidden");
  assert.equal(sourceForTab("salary",{audit:true}),"forbidden");
  assert.equal(sourceForTab("salary",{audit:false}),"payroll");
  assert.equal(sourceForTab("unknown"),"unconnected");
});
test("existing PDKS read endpoints map to relevant visible sections",()=>{
  assert.equal(tabBinding("people").source,"people");
  assert.equal(tabBinding("live").source,"attendance");
  assert.equal(tabBinding("holidays").source,"holidays");
  assert.equal(tabBinding("leave").source,"leaves");
  assert.equal(tabBinding("departments").source,"masters");
  assert.equal(tabBinding("monthly").source,"month");
  assert.equal(tabBinding("earnings").source,"payroll");
  assert.equal(tabBinding("audit").source,"audit");
});
test("real source data fields are preserved and missing hours never invented",()=>{
  const p={id:"p1",cardNo:"00003",fullName:"Source Employee",
    department:"Dept",role:"Role",group:"Shift",startDate:"2024-06-01",status:"Aktif"};
  const row=rowsForTab("people",null,{people:[p]}).rows[0];
  assert.equal(row["Kart No"],"00003");
  const attendance=rowsForTab("punches",{days:[{date:"2026-10-08",entry:"08:28"}]},
    {selectedPerson:p}).rows;
  assert.equal(attendance.length,1);
  assert.equal(attendance[0]["Giriş"],"08:28");
  assert.equal(attendance[0]["Çıkış"],"—");
  assert.equal(attendance[0]["E"],"—");
});
test("months, leave and holiday arrays use declared API shapes",()=>{
  const leave=rowsForTab("leave",{plans:[{fullName:"Person",startDate:"2026-10-04",status:"PENDING"}]});
  assert.equal(leave.rows[0]["Personel"],"Person");
  const holidays=rowsForTab("holidays",[{date:"2026-10-29",name:"Holiday",halfDay:false}]);
  assert.equal(holidays.rows[0]["Tarih"],"2026-10-29");
  const monthly=rowsForTab("monthly",{rows:[{cardNo:"00013",workedDays:22}]});
  assert.equal(monthly.rows[0]["Kart No"],"00013");
  assert.equal(monthly.rows[0]["Çalışılan"],"22");
  assert.equal(monthly.rows[0]["Mesai"],"—");
});
