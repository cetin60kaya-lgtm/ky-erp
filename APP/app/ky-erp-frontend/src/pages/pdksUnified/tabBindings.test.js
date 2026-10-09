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
  assert.equal(tabBinding("live").source,"live-attendance");
  assert.equal(tabBinding("today").source,"live-attendance");
  assert.equal(sourceForTab("exceptions",{audit:true}),"live-attendance");
  assert.equal(tabBinding("holidays").source,"holidays");
  assert.equal(tabBinding("leave").source,"leaves");
  assert.equal(tabBinding("departments").source,"masters");
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

test("work groups, personnel groups and service assignments use verified actual counts",()=>{
  const masters={
    groups:[{id:"g1",name:"Gündüz",entryTime:"08:30",exitTime:"19:00",active:1}],
    personnelGroups:[{id:"p1",name:"Üretim",defaultShiftId:"g1",active:1}],
    groupAssignments:[{employeeId:"e1",groupId:"g1"},{employeeId:"e2",groupId:"g1"}],
    personnelGroupAssignments:[{employeeId:"e1",personnelGroupId:"p1"}],
    services:[{id:"s1",code:"A",routeNote:"Hat 1",active:1}],
    serviceAssignments:[{employeeId:"e1",serviceId:"s1"}],
  };
  const groups=rowsForTab("departments",masters);
  assert.equal(groups.supported,true);
  assert.equal(groups.rows.length,2);
  assert.equal(groups.rows[0]["Kişi"],"2");
  assert.equal(groups.rows[1]["Kişi"],"1");
  const services=rowsForTab("routes",masters);
  assert.equal(services.supported,true);
  assert.equal(services.rows[0]["Personel"],"1");
  assert.equal(rowsForTab("departments",{groups:[]}).supported,false);
});


test("Turkish dotted İ in mesai and kesinti never hides an approved source row",()=>{
  const month={adjustments:[
    {id:"m1",employeeName:"Kişi",date:"2026-10-05",
      adjustmentType:"Hafta İçi Mesai",hourOrDay:2,amount:500,
      note:"Mesai oranı: %50 | Onaylı fazla çalışma"},
    {id:"k1",employeeName:"Kişi",date:"2026-10-06",
      adjustmentType:"Kesinti",hourOrDay:0,amount:100,
      note:"Yazılı kesinti onayı"},
  ]};
  const overtime=rowsForTab("overtime",month);
  assert.equal(overtime.supported,true);
  assert.equal(overtime.rows.length,1);
  assert.equal(overtime.rows[0]["Oran"],"%50");
  assert.equal(overtime.rows[0]["Saat"],"2");
  const deduction=rowsForTab("deductions",month);
  assert.equal(deduction.rows.length,1);
  assert.equal(deduction.rows[0]["Tutar"],"100");
});


test("live roster maps person-by-person evidence without inventing absence or late",()=>{
  const payload={date:"2026-10-09",complete:true,roster:[
    {employeeId:"a",cardNo:"00003",fullName:"Ahmet",entry:"08:24",exit:"",
      status:"GIRIS_KAYDI",eventCount:1},
    {employeeId:"b",cardNo:"00009",fullName:"Mehmet",entry:"",exit:"",
      status:"KART_KAYDI_YOK",eventCount:0},
  ]};
  const overview=rowsForTab("today",payload);
  assert.equal(overview.supported,true);
  assert.equal(overview.rows.length,2);
  assert.equal(overview.rows[0]["Giriş"],"08:24");
  assert.equal(overview.rows[1]["Giriş"],"—");
  assert.equal(rowsForTab("exceptions",payload).rows.length,1);
  assert.equal(rowsForTab("live",{}).supported,false);
});
