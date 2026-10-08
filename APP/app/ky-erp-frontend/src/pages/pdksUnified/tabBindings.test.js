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
  assert.equal(sourceForTab("holidays",{audit:true}),"forbidden");
  assert.equal(sourceForTab("leave",{audit:true}),"forbidden");
  assert.equal(sourceForTab("closing",{audit:true}),"forbidden");
  assert.equal(sourceForTab("punches",{audit:true}),"attendance");
  assert.equal(sourceForTab("unknown"),"unconnected");
});
test("existing PDKS read endpoints map to relevant visible sections",()=>{
  assert.equal(tabBinding("people").source,"people");
  assert.equal(tabBinding("live").source,"unconnected");
  assert.equal(tabBinding("holidays").source,"holidays");
  assert.equal(tabBinding("leave").source,"leaves");
  assert.equal(tabBinding("departments").source,"people");
  assert.equal(tabBinding("monthly").source,"monthly-attendance");
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
  assert.equal(rowsForTab("monthly",{rows:[{cardNo:"00013",workedDays:22}]}).supported,false);
  const monthly=rowsForTab("monthly",{complete:true,rows:[{cardNo:"00013",workedDays:22}]});
  assert.equal(monthly.rows[0]["Kart No"],"00013");
  assert.equal(monthly.rows[0]["Çalışılan"],"22");
  assert.equal(monthly.rows[0]["Mesai"],"—");
});

test("Cloudflare real month payload is NOT mistaken for monthly attendance",()=>{
  const month={year:2026,month:10,adjustments:[{
    employeeName:"Person",adjustmentType:"AVANS",amount:400,date:"2026-10-04"
  }],close:{isLocked:true}};
  assert.equal(rowsForTab("monthly",month).supported,false);
  const advance=rowsForTab("advances",month);
  assert.equal(advance.rows[0]["Tutar"],"400");
  const close=rowsForTab("closing",month,{year:2026,month:10});
  assert.equal(close.rows[0]["Kilit"],"Kilitli");
  assert.equal(close.rows[0]["Eksik"],"—"); // absence of closed-month evidence
});
test("Cloudflare payroll lines use exact backend fields and never infer gross/meal",()=>{
  const data={year:2026,month:10,lines:[{
    employeeId:"p1",fullName:"Person",salary:40000,
    overtimeAmount:500,advanceAmount:100,bankAmount:35000,cashAmount:4000,
    deductionAmount:0,totalAmount:39900,status:"D1_VIEW",
  }]};
  const earnings=rowsForTab("earnings",data);
  assert.equal(earnings.rows[0]["Maaş"],"40000");
  assert.equal(earnings.rows[0]["Yol"],undefined);
  const payroll=rowsForTab("payments",data);
  assert.equal(payroll.rows[0]["Banka"],"35000");
  assert.equal(payroll.rows[0]["Elden"],"4000");
  const report=rowsForTab("payroll",data,{year:2026,month:10});
  assert.equal(report.rows[0]["Dönem"],"2026-10");
});
test("unrelated or unknown response shapes are not silently shown as zero records",()=>{
  assert.equal(rowsForTab("salary",{salary:44}).supported,false);
  assert.equal(rowsForTab("holidays",{}).supported,false);
  assert.equal(rowsForTab("leave",{plans:[]}).supported,true);
  assert.equal(rowsForTab("shift",{}).supported,false);
});
