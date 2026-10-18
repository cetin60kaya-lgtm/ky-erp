import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseDailyExcelRows } from "./gunluk-excel-import.ts";

function workbook(rows: unknown[][]) {
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"Günlük");
  return new Uint8Array(XLSX.write(wb,{bookType:"xlsx",type:"array"}));
}
test("actual XLSX date-columns import marks day/night without silently deleting blanks",()=>{
  const file=workbook([
    ["Personel","Personel No","12.10.2026 Gündüz","12.10.2026 Gece","13.10.2026 Gündüz","13.10.2026 Gece"],
    ["ÖRNEK PERSONEL","TEST001",1,1,"",1],["GENEL TOPLAM","",1,1,0,1],
  ]);
  const parsed=parseDailyExcelRows(file,"2026-10-12","2026-10-18");
  assert.equal(parsed.length,2);
  assert.deepEqual(parsed.map(r=>[r.workDate,r.dayShift,r.nightShift]),[["2026-10-12",true,true],["2026-10-13",false,true]]);
});
test("Excel out-of-period data never becomes a shift",()=>{
  const file=workbook([["Personel No","12.10.2026 Gündüz","20.10.2026 Gece"],["TEST001",1,1]]);
  assert.equal(parseDailyExcelRows(file,"2026-10-12","2026-10-18").length,1);
});
test("Excel without a dated shift or person identifier is rejected",()=>{
  assert.throws(()=>parseDailyExcelRows(workbook([["Personel","Tutar"],["Örnek",5]]),"2026-10-12","2026-10-18"),/Gündüz\/Gece/);
});
