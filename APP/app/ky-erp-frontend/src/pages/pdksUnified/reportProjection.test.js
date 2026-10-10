import test from "node:test";
import assert from "node:assert/strict";
import {dailyReportRows,projectMonthlyReport} from "./reportProjection.js";
const p={id:"e1",fullName:"Örnek Çalışan",cardNo:"00005"};
test("full month D1 daily source preserves physical time and leaves unknowns",()=>{
 const rows=dailyReportRows(p,[{date:"2026-09-01",status:"CALISTI",entry:"08:24",
  exit:"19:01",workedMinutes:560,eventCount:2},
  {date:"2026-09-02",status:"EKSIK_BASIM",entry:"08:24",exit:"",
   source:"MANUAL_OVERRIDE",eventCount:1}],{year:2026,month:9});
 assert.equal(rows.length,2);
 assert.equal(rows[0]["Giriş"],"08:24");
 assert.equal(rows[1]["Çıkış"],"—");
 assert.equal(rows[1]["E"],"İdari düzeltme");
 const report=projectMonthlyReport("violations",{complete:true,rows:[],dailyRows:rows});
 assert.equal(report.rows.length,1);
 assert.equal(report.rows[0].personId,"e1");
 assert.equal(report.rows[0]["İhlal"],"EKSIK_BASIM");
});
test("daily full report displays all source days, monthly report shows one line per person",()=>{
 const all=dailyReportRows(p,[{date:"2026-09-03",status:"KART_YOK"}],{year:2026,month:9});
 assert.equal(projectMonthlyReport("attendance",{complete:true,rows:[],dailyRows:all}).rows.length,1);
 const summary=projectMonthlyReport("timesheets",{complete:true,rows:[
  {_id:"e1",fullName:"Örnek Çalışan",period:"2026-09",workedDays:22,overtimeMinutes:120,annualLeaveDays:1}]});
 assert.equal(summary.rows[0]["Personel"],"Örnek Çalışan");
 assert.equal(summary.rows[0]["Gün"],"22");
 assert.match(summary.rows[0]["Durum"],/onayı bekleniyor/);
});
test("period and unique person/date are never guessed",()=>{
 assert.throws(()=>dailyReportRows(p,[{date:"2026-08-31"}],{year:2026,month:9}),/PDKS_GUNLUK_TARIH/);
 assert.throws(()=>dailyReportRows(p,[{date:"2026-09-01"},{date:"2026-09-01"}],{year:2026,month:9}),/PDKS_GUNLUK_TARIH/);
 assert.equal(projectMonthlyReport("attendance",{complete:false,rows:[],dailyRows:[]}).supported,false);
 assert.equal(projectMonthlyReport("attendance",{complete:true,rows:[]}).supported,false);
});
