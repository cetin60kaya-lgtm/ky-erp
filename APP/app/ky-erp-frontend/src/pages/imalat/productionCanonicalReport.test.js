import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionCanonicalReport } from "./productionCanonicalReport.js";

const cards = [{
  id: "m-1", modelName: "MODEL A", companyName: "Taha", incomingQty: 100,
  status: "PRODUCTION_OPEN", printRegions: [{ regionName: "Ön" }, { regionName: "Arka" }],
  productionEntries: [
    { id: "p-1", date: "2026-10-28", printArea: "Ön", grossQty: 100, netQty: 96,
      printDefectQty: 3, fabricDefectQty: 1, machineId: "6", machineName: "Oval 6",
      shift: "Gündüz", operatorName: "Ahmet", batchNo: "P1", raw: { ground: "Ekru" } },
    { id: "p-2", date: "2026-10-28", printArea: "Arka", grossQty: 90, netQty: 89,
      printDefectQty: 1, fabricDefectQty: 0, machineId: "6", machineName: "Oval 6",
      shift: "Gece", operatorName: "Mehmet", batchNo: "P1" },
  ],
}];

test("canonical report groups regional production without double-counting the incoming quantity", () => {
  const data = buildProductionCanonicalReport({ rows: cards, machines: [
    { machineNo: "6", isActive: true }, { machineNo: "7", isActive: false },
  ] }, {});
  assert.equal(data.audit.rows.length, 2);
  assert.deepEqual(data.audit.rows.map((row) => [row.baskiBolgesi, row.planlanan, row.basilan, row.eksik]), [
    ["Ön", 100, 100, 0], ["Arka", 100, 90, 10],
  ]);
  assert.equal(data.report.rows.length, 2);
  assert.equal(data.report.summary.aktifMakine, 1);
  assert.equal(data.report.machineRows[0].operasyonAdedi, 2);
  assert.equal(data.report.summary.tamamlananModelAdedi, 0, "Ön tamam, arka eksikken model tamamlanmış sayılamaz");
  assert.equal(data.report.operatorRows[0].basilanBolgeAdedi, 1);
  assert.equal(data.report.operatorRows.length, 2);
});
test("canonical report respects day/shift/region/model filters and does not invent old data", () => {
  const selected = buildProductionCanonicalReport({ rows: cards }, {
    baslangic: "2026-10-01", bitis: "2026-10-31",
    vardiya: "Gece", model: "model a", baskiBolgesi: "Arka",
  });
  assert.equal(selected.audit.rows.length, 1);
  assert.equal(selected.report.rows.length, 1);
  assert.equal(selected.report.rows[0].basilan, 90);
  const old = buildProductionCanonicalReport({ rows: cards }, {
    baslangic: "2022-01-01", bitis: "2022-12-31",
  });
  assert.equal(old.audit.rows.length, 0);
  assert.equal(old.report.rows.length, 0);
});

test("tarihsel tamamlanan iş rapora girer ancak aktif açık parti/fatura borcu oluşturmaz", () => {
  const historical = [{
    id: "legacy-1", modelName: "GEÇMİŞ 2026", companyName: "Taha",
    legacyApproved: true, status: "MODEL_WAITING", incomingQty: 500,
    printRegions: [{ regionName: "Ön" }], productionEntries: [],
  }];
  const data = buildProductionCanonicalReport({ rows: historical }, {});
  assert.equal(data.audit.rows.length, 1);
  assert.equal(data.audit.rows[0].durum, "Geçmiş Tamamlandı");
  assert.equal(data.audit.rows[0].eksik, 0);
  assert.equal(data.audit.rows[0].gecmisPlanFarki, 500, "tarihsel adet farkı kaybolmaz");
  assert.equal(data.audit.summary.acikParti, 0);
  assert.equal(data.audit.summary.kontrolGereken, 0);
  assert.equal(data.report.summary.tamamlananModelAdedi, 1);
});
test("yeni açık üretim tarihsel sınıfa alınmaz, gerçek eksik adet gösterir", () => {
  const data = buildProductionCanonicalReport({ rows: [{
    id: "new-1", modelName: "YENİ", companyName: "Taha", legacyApproved: false,
    status: "PRODUCTION_OPEN", incomingQty: 100,
    printRegions: [{regionName:"Ön"}],
    productionEntries:[{id:"p1",date:"2026-11-08",printArea:"Ön",grossQty:60,netQty:59}],
  }]}, {});
  assert.equal(data.audit.rows[0].eksik, 40);
  assert.equal(data.audit.rows[0].durum, "Eksik Operasyon");
  assert.equal(data.report.summary.tamamlananModelAdedi, 0);
});
