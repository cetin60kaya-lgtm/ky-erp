import assert from "node:assert/strict";
import test from "node:test";
import { parseProductionHistoryCsv, HISTORY_COLUMNS } from "./productionHistoryCsv.js";

test("history CSV imports only ten authorized fields, never helpers or invoice totals", () => {
  const csv = "\uFEFFModel Adı,Tarih,Adet,Vardiya,Makina No,Zemin,Baskı Bölgesi,Baskı Sakatı,Kumaş Sakatı,Makinacı,Makine Yardımcı,Toplam Adet\r\n" +
    "HAPPYMICK,2026-04-29,2540,Gündüz,No: 6,EKRU,Ön,4,5,MURAT,PERSONEL,25000\r\n";
  const result = parseProductionHistoryCsv(csv,{startDate:"2026-04-29",endDate:"2026-10-29"});
  assert.equal(result.rows.length, 1);
  assert.deepEqual(Object.keys(result.rows[0]).filter((k) => k !== "clientId"), HISTORY_COLUMNS);
  assert.equal(result.rows[0].quantity,2540);
  assert.equal(result.rows[0].operatorName,"MURAT");
  assert.ok(!("Makine Yardımcı" in result.rows[0]));
  assert.ok(!("Toplam Adet" in result.rows[0]));
});

test("history CSV handles quoted cells, 6 month range and missing optional fields", () => {
  const csv = 'Model Adı,Tarih,Adet,Vardiya,Makina No,Zemin,Baskı Bölgesi,Baskı Sakatı,Kumaş Sakatı,Makinacı\n"A,B",2026-10-27,100,,,,,0,0,\nOLDER,2023-05-03,100,,,,,0,0,\n';
  const result = parseProductionHistoryCsv(csv,{startDate:"2026-04-29",endDate:"2026-10-29"});
  assert.equal(result.rows.length,1);
  assert.equal(result.rejected.length,1);
  assert.equal(result.rows[0].modelName,"A,B");
  assert.equal(result.rows[0].machineNo,"");
});
