import assert from "node:assert/strict";
import test from "node:test";
import { HISTORICAL_PRODUCTION_CUTOVER, PRODUCTION_POOL_CONTRACT,
  isHistoricalProduction, isProductionComplete, matchesProductionPool } from "./production-pool-classification.ts";

test("2026 XLSM fişleri ve model kartları yalnız geçmiş / tamamlanan olur", () => {
  const history = isHistoricalProduction({
    modelSource: "XLSM_IMPORT", modelSourceYear: 2026,
    productionEntries: [{ date: "2026-02-02", raw: { source: "XLSM_IMPORT" } }],
  });
  assert.equal(history, true);
  const card = { legacyApproved: true, productionEntryCount: 1, completedGrossQty: 2960,
    incomingQty: 0, dispatchCount: 0, invoiceRemainingQty: 2960 };
  assert.equal(matchesProductionPool(card, "TAMAMLANAN"), true);
  assert.equal(matchesProductionPool(card, "ARSIV"), true);
  for (const pool of ["IMALATTA", "IRSALIYE", "FATURA"]) {
    assert.equal(matchesProductionPool(card, pool), false, pool);
  }
  assert.equal(isHistoricalProduction({
    modelSource: "XLSM_IMPORT", modelSourceYear: "2026", productionEntries: [],
  }), true, "Excel'den gelen görselli fakat henüz fişsiz eski kart da arşiv");
  assert.equal(HISTORICAL_PRODUCTION_CUTOVER, "2026-11-08");
  assert.equal(PRODUCTION_POOL_CONTRACT, "kyerp-production-pools-v3");
});

test("yeni fiş eklendiğinde eski model yeniden aktif olabilir", () => {
  assert.equal(isHistoricalProduction({
    modelSource: "XLSM_IMPORT", modelSourceYear: 2026,
    productionEntries: [
      { date: "2026-02-02", raw: { source: "XLSM_IMPORT" } },
      { date: "2026-11-08", raw: { source: "UI_ENTRY" } },
    ],
  }), false);
  assert.equal(isHistoricalProduction({
    modelSource: "XLSM_IMPORT", modelSourceYear: 2026,
    dispatches: [{ date: "2026-11-08" }],
  }), false);
  assert.equal(isHistoricalProduction({ modelSource: "DESEN", productionEntries: [] }), false);
});

test("5200 plan, 3000 avans faturası, henüz üretim başlamadı: aktif ve fatura havuzunda", () => {
  const card = { productionEntryCount: 0, expectedQty: 5200, incomingQty: 5200,
    completedGrossQty: 0, productionRemainingQty: 5200, invoicedQty: 3000,
    invoiceRemainingQty: 2200, dispatchCount: 0, status: "PRODUCTION_OPEN" };
  assert.equal(isProductionComplete(card), false);
  assert.equal(matchesProductionPool(card, "IMALATTA"), true);
  assert.equal(matchesProductionPool(card, "IRSALIYE"), true);
  assert.equal(matchesProductionPool(card, "FATURA"), true);
  assert.equal(matchesProductionPool(card, "TAMAMLANAN"), false);
});

test("irsaliye eşleşince bekleyenlerden düşer, aktif üretimden düşmez", () => {
  const card = { productionEntryCount: 2, expectedQty: 5200, incomingQty: 5200,
    completedGrossQty: 3000, productionRemainingQty: 2200, dispatchCount: 1,
    invoicedQty: 3000, invoiceRemainingQty: 2200 };
  assert.equal(matchesProductionPool(card, "IRSALIYE"), false);
  assert.equal(matchesProductionPool(card, "IMALATTA"), true);
  assert.equal(matchesProductionPool(card, "FATURA"), true);
});

test("üretim fişi tamamlandı ama fatura eksik: tamamlananda ve fatura kontrolünde", () => {
  const card = { productionEntryCount: 2, expectedQty: 5200, incomingQty: 5200,
    completedGrossQty: 5200, productionRemainingQty: 0, dispatchCount: 1,
    invoicedQty: 3000, invoiceRemainingQty: 2200 };
  assert.equal(isProductionComplete(card), true);
  assert.equal(matchesProductionPool(card, "IMALATTA"), false);
  assert.equal(matchesProductionPool(card, "TAMAMLANAN"), true);
  assert.equal(matchesProductionPool(card, "FATURA"), true);
});

test("salt Desen modeli imalat başlamadan imalat/fatura/irsaliye listelerine girmez", () => {
  const card = { productionEntryCount: 0, expectedQty: 0, dispatchCount: 0,
    completedGrossQty: 0, invoiceRemainingQty: 0 };
  for (const pool of ["IMALATTA", "IRSALIYE", "TAMAMLANAN", "FATURA", "ARSIV", "UNKNOWN"]) {
    assert.equal(matchesProductionPool(card, pool), false, pool);
  }
  assert.equal(matchesProductionPool({ ...card, isVirtual: true, productionEntryCount: 1 },
    "IMALATTA"), false);
});
