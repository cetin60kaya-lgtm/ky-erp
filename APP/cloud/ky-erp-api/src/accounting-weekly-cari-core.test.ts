import test from "node:test";
import assert from "node:assert/strict";
import { parseStatementTables,parseStatementMoney,compareWeeklyStatements } from "./accounting-weekly-cari-core";
test("Ekstre HKN tam numarayı seçer, farklı grup ve satırları birleştirmez",()=>{
 const t=[["Cari Kod","Evrak No","Borç","Alacak","Bakiye"],["165-6","HKN2026000000931",1234.5,0,1234.5],["165-7","HKN2026000000932",500,0,500]];
 const p=parseStatementTables([t]);assert.equal(p.lines.length,2);assert.equal(p.lines[0].groupCode,"165-6");assert.equal(p.lines[1].invoiceNo,"HKN2026000000932");
});
test("Türkçe tutar korunur, belirsiz binlik yazımı otomatik yorumlanmaz",()=>{
 assert.equal(parseStatementMoney("1.234,56"),1234.56);
 assert.equal(parseStatementMoney("100,50"),100.5);
 assert.equal(parseStatementMoney("1.234"),null);
});
test("Eski ekstrede var yenide yok ödenmiş değildir, değişmiş tutar incelemeye düşer",()=>{
 const a={invoiceNo:"HKN2026000000931",groupCode:"165-6",debit:100,credit:0,balance:100,occurrence:1};
 const b={...a,invoiceNo:"HKN2026000000932"};
 const c={...b,debit:50};
 const r=compareWeeklyStatements([a,b],[c],new Set([a.invoiceNo,b.invoiceNo]));
 assert.equal(r.rows.find(x=>x.invoiceNo===a.invoiceNo)?.state,"MISSING_ON_CURRENT_REVIEW");
 assert.equal(r.rows.find(x=>x.invoiceNo===a.invoiceNo)?.paymentStatus,"NOT_DETERMINED");
 assert.equal(r.rows.find(x=>x.invoiceNo===b.invoiceNo)?.state,"AMOUNT_CHANGED_REVIEW");
});
test("Bir HKN farklı gruba geçerse, veya iki kere varsa kesin eşleşme yapılmaz",()=>{
 const a={invoiceNo:"HKN2026000000931",groupCode:"165-6",debit:100,credit:0,balance:100,occurrence:1};
 const r=compareWeeklyStatements([a],[a,{...a,groupCode:"165-7"}],new Set([a.invoiceNo]));
 assert.equal(r.rows[0].state,"GROUP_CONFLICT_REVIEW");
 const d=compareWeeklyStatements([],[a,a],new Set());
 assert.equal(d.rows[0].occurrencesCurrent,2);
 assert.equal(d.rows[0].erpPresent,false);
});
