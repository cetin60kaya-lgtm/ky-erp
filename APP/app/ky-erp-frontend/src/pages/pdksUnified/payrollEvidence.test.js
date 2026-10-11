import test from "node:test";
import assert from "node:assert/strict";
import {payrollRowsForTab,paymentBalance,signatureRowsFromDays} from "./payrollEvidence.js";
import {rowsForTab,sourceForTab} from "./tabBindings.js";

const payroll={year:2026,month:9,lines:[
  {employeeId:"e1",fullName:"Örnek Çalışan",cardNo:"00009",
    salary:41000,roadAllowance:2200,roadAdjustmentAmount:300,
    mealAmount:1500,overtimeAmount:2500,advanceAmount:1000,
    deductionAmount:800,garnishmentAmount:150,besAmount:90,
    bankAmount:30000,cashAmount:16000,totalAmount:46000},
]};
const person={id:"e1",fullName:"Örnek Çalışan",cardNo:"00009"};

test("monthly payroll exposes every sourced component without deriving unknown gross",()=>{
  const result=rowsForTab("payroll",payroll,{year:2026,month:9});
  assert.equal(result.supported,true);
  const row=result.rows[0];
  assert.equal(row["Maaş"],"41000");
  assert.equal(row["Yol"],"2200");
  assert.equal(row["Ek Yol"],"300");
  assert.equal(row["Yemek"],"1500");
  assert.equal(row["Mesai"],"2500");
  assert.equal(row["Avans"],"1000");
  assert.equal(row["Kesinti"],"800");
  assert.equal(row["İcra/Haciz"],"150");
  assert.equal(row["BES"],"90");
  assert.equal(row["Brüt"],"—");
  assert.match(row["Durum"],/FDB\/TNF/);
  assert.equal(row["Dönem"],"2026-09");
  assert.deepEqual(payroll.lines.map(p=>p.employeeId),["e1"]);
});

test("authorized payment report checks amount balance but never marks payment completed",()=>{
  const result=rowsForTab("payments",payroll,{year:2026,month:9});
  assert.equal(result.rows[0]["Ödeme"],"Plan tutarlı · ödeme dekontu doğrulanmadı");
  assert.equal(result.rows[0]["Banka"],"30000");
  assert.equal(paymentBalance({bankAmount:1,cashAmount:2,totalAmount:4}),
    "TUTARSIZ: banka + elden, toplamla eşleşmiyor");
  assert.equal(paymentBalance({bankAmount:100,cashAmount:1,totalAmount:null}),
    "Ödeme dengesi doğrulanamadı");
  assert.equal(sourceForTab("payments",{audit:true}),"forbidden");
  assert.equal(sourceForTab("payroll",{audit:true}),"forbidden");
});

test("receipt is explicitly unsigned and cannot imply a settled payment",()=>{
  const receipt=rowsForTab("receipts",payroll,{year:2026,month:9});
  assert.equal(receipt.supported,true);
  assert.equal(receipt.rows[0]["İmza"],"");
  assert.match(receipt.rows[0]["Belge"],/Taslak/);
  assert.match(receipt.rows[0]["Durum"],/kanıtı bekleniyor/);
});

test("rejects a different period, duplicate employee and invalid payroll envelope",()=>{
  assert.equal(rowsForTab("salary",payroll,{year:2026,month:8}).supported,false);
  assert.equal(payrollRowsForTab("salary",{year:2026,month:9,lines:[]},{year:2026,month:13}).supported,false);
  assert.equal(payrollRowsForTab("salary",{...payroll,lines:[...payroll.lines,...payroll.lines]},{year:2026,month:9}).supported,false);
  assert.equal(payrollRowsForTab("salary",{year:2026,month:9,lines:[{employeeId:"x"}]},{year:2026,month:9}).supported,false);
});

test("missing payroll amount stays unknown rather than inferred from payroll bank/cash",()=>{
  const rows=payrollRowsForTab("salary",{year:2026,month:9,lines:[
    {employeeId:"e2",fullName:"İkinci Çalışan",bankAmount:25000,cashAmount:9000,totalAmount:null},
  ]},{year:2026,month:9}).rows;
  assert.equal(rows[0]["Net"],"—");
  assert.equal(rows[0]["Brüt"],"—");
  assert.equal(rows[0]["Ödeme"],"Ödeme dengesi doğrulanamadı");
});

test("two missing punches on one day require two separate blank signatures",()=>{
  const rows=signatureRowsFromDays(person,[{date:"2026-09-03",status:"KART_YOK",entry:"",exit:""}],{year:2026,month:9});
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(row=>row["Eksik Hareket"]),["Sabah giriş","Akşam çıkış"]);
  assert.ok(rows.every(row=>row["İmza"]===""));
  assert.ok(rows.every(row=>row["Saat"]==="—"));
});

test("single-sided punch preserves observed time, never invents missing time",()=>{
  const days=[{date:"2026-09-04",status:"EKSIK_BASIM",entry:"08:37",exit:""},
    {date:"2026-09-05",status:"EKSIK_BASIM",entry:"",exit:"19:12"}];
  const rows=signatureRowsFromDays(person,days,{year:2026,month:9});
  assert.equal(rows.length,2);
  assert.equal(rows[0]["Eksik Hareket"],"Akşam çıkış");
  assert.equal(rows[1]["Eksik Hareket"],"Sabah giriş");
  assert.match(rows[0]["Saat"],/08:37/);
  assert.doesNotMatch(rows[0]["Saat"],/19:00/);
  assert.match(rows[1]["Saat"],/19:12/);
});

test("approved/manual correction stays distinguished from physical card evidence",()=>{
  const rows=signatureRowsFromDays(person,[{
    date:"2026-09-06",status:"EKSIK_BASIM",entry:"08:30",exit:"",
    source:"MANUAL_OVERRIDE",
  }],{year:2026,month:9});
  assert.match(rows[0]["Saat"],/manuel düzeltme/);
  assert.equal(rows[0]["İmza"],"");
});

test("non-issue days are excluded, invalid/cross-month and repeated days fail closed",()=>{
  assert.equal(signatureRowsFromDays(person,[{
    date:"2026-09-03",status:"CALISTI",entry:"09:00",exit:"18:00",
  }],{year:2026,month:9}).length,0);
  assert.throws(()=>signatureRowsFromDays(person,[{date:"2026-08-31",status:"KART_YOK"}],{year:2026,month:9}),
    /PDKS_IMZA_TARIH_KAPSAM_HATASI/);
  assert.throws(()=>signatureRowsFromDays(person,[
    {date:"2026-09-03",status:"KART_YOK"},{date:"2026-09-03",status:"KART_YOK"},
  ],{year:2026,month:9}),/PDKS_IMZA_TARIH_KAPSAM_HATASI/);
});

test("full month signature report requires complete declared source shape",()=>{
  assert.equal(rowsForTab("signatures",{complete:true,signatureRows:[]}).supported,true);
  assert.equal(rowsForTab("signatures",{complete:false,signatureRows:[]}).supported,false);
  assert.equal(rowsForTab("signatures",{days:[]}).supported,false);
  assert.equal(sourceForTab("signatures",{audit:true}),"signature-month");
});
