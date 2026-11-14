import test from "node:test";
import assert from "node:assert/strict";
import { parseStatementTables, compareWeeklyStatements } from "./accounting-weekly-cari-core.ts";

const line={invoiceNo:"HKN2026000000931",groupCode:"165-6",debit:null,credit:null,balance:null,occurrence:1};
test("Cari Excel: başlıksız XLSX HKN okunsa da tutar kaynağı belirsiz raporlanır",()=>{
 const report=parseStatementTables([["HKN2026000000931","165-6","1.234"],["HKN2026000000932","165-6","2.345"]].map(x=>x).length ? [[["HKN2026000000931","165-6","1.234"],["HKN2026000000932","165-6","2.345"]]] : []);
 assert.equal(report.lines.length,2);
 assert.equal(report.missingAmountSheets,1);
 assert.equal(report.lines[0].balance,null);
});
test("Cari Excel: iki haftada tutar sütunu bilinmiyorsa eşit kabul edilmez",()=>{
 const result=compareWeeklyStatements([line],[line],new Set([line.invoiceNo]),true);
 assert.equal(result.rows[0].state,"AMOUNT_UNVERIFIED_REVIEW");
 assert.equal(result.summary.amountUnverified,1);
 assert.equal(result.rows[0].paymentStatus,"NOT_DETERMINED");
});
test("Cari Excel: bilinen bakiye eşitse sırf yokluk ödeme sayılmaz",()=>{
 const known={...line,debit:500,credit:0,balance:500};
 const ok=compareWeeklyStatements([known],[known],new Set([known.invoiceNo]),true);
 assert.equal(ok.rows[0].state,"PRESENT_BOTH_REVIEW");
});
