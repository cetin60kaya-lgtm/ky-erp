import test from "node:test";
import assert from "node:assert/strict";
import { sgkDetectLayout, sgkResolveColumns, sgkOfficialRowError, sgkStrictAmount } from "./ik-sgk-flexible-columns.ts";

test("September/October accountant structure: row ten, Turkish headers and multiple workbooks",()=>{
 const create = (title:string) => [
  ["",title,"2026"],["İşyeri","ÖRNEK"],[],[],[],[],[],[],[],
  ["ADI SOYADI","GÜN","T.C. KİMLİK NO","NORMAL KAZANÇ","NET İSTİHKAK"],
  ["KİŞİ ÖRNEK",30,"00000000000",15000,12000],
  ["Normal Gün:",30],["Günlük Ücreti:"]
 ];
 for(const month of ["EYLÜL","EKİM"]){
  const first=sgkDetectLayout([{sheetName:"Sheet1",matrix:create(month+" 2026 ÜCRET BORDROSU")}]);
  assert.equal(first.needsMapping,false);
  assert.equal(first.headerRow,9);assert.equal(first.columns.name,0);assert.equal(first.columns.net,4);
  assert.equal(first.columns.days,1);assert.equal(first.columns.identity,2);
 }
});
test("future accountant columns can be renamed, reordered and mapped without code changes",()=>{
 const matrix=[["İnsan Kaynağı","Ödenecek Net","Prim Günleri"],["Örnek",1250,30]];
 const unmapped=sgkDetectLayout([{sheetName:"YeniProgram",matrix}]);
 assert.equal(unmapped.needsMapping,true);
 const mapped=sgkDetectLayout([{sheetName:"YeniProgram",matrix}],{
  sheetName:"YeniProgram",headerRow:0,
  columns:{name:"İnsan Kaynağı",net:"Ödenecek Net",days:"Prim Günleri"},
 });
 assert.equal(mapped.needsMapping,false);
 assert.equal(mapped.columns.name,0);assert.equal(mapped.columns.net,1);
 assert.equal(mapped.columns.days,2);
});
test("NET column cannot be confused with employer NET COST",()=>{
 const cols=sgkResolveColumns(["ADI SOYADI","İŞVEREN NET MALİYET","BRÜT","BANKA"]);
 assert.equal(cols.name,0);assert.equal(cols.net,-1);assert.equal(cols.employerCost,1);
});
test("strict money accepts Turkish/English and rejects missing or invalid official net",()=>{
 assert.equal(sgkStrictAmount("12.345,67"),12345.67);
 assert.equal(sgkStrictAmount("12,345.67"),12345.67);
 assert.equal(sgkStrictAmount("12345,67"),12345.67);
 assert.equal(sgkStrictAmount("₺ 450,10"),450.1);
 assert.equal(sgkStrictAmount(""),null);
 assert.equal(sgkStrictAmount("geçersiz"),null);
 assert.equal(sgkOfficialRowError({employeeId:"example-id",net:null,sgkDays:30}),"SGK_NET_INVALID");
 assert.equal(sgkOfficialRowError({employeeId:"example-id",net:15000,sgkDays:32}),"SGK_DAYS_INVALID");
 assert.equal(sgkOfficialRowError({employeeId:"example-id",net:15000,sgkDays:30}),null);
});
