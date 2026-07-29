import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalModelFlowService } from "./canonical-model-flow.service";

const service = new CanonicalModelFlowService({} as any, {} as any);
const calculate = (input: any) => (service as any).calculateRow(input);

const totals = (rows: Array<[string, number]>) =>
  new Map(
    rows.map(([region, gross]) => [
      region,
      { gross, printDefect: 0, fabricDefect: 0, waste: 0 },
    ]),
  );

test("ön ve arka operasyonlarını toplamak yerine en düşük ortak adedi kullanır", () => {
  const row = calculate({
    expectedQty: 1000,
    requiredRegions: ["Ön", "Arka"],
    regionTotals: totals([
      ["Ön", 1000],
      ["Arka", 980],
    ]),
    printDefectQty: 10,
    fabricDefectQty: 5,
    wasteQty: 15,
  });

  assert.equal(row.completedGrossQty, 980);
  assert.equal(row.remainingQty, 20);
  assert.equal(row.netGoodQty, 965);
  assert.equal(row.status, "EKSİK");
});

test("gelen adedi aşan üretimi fazla olarak işaretler", () => {
  const row = calculate({
    expectedQty: 1000,
    requiredRegions: ["Ön"],
    regionTotals: totals([["Ön", 1020]]),
    printDefectQty: 0,
    fabricDefectQty: 0,
    wasteQty: 0,
  });

  assert.equal(row.completedGrossQty, 1020);
  assert.equal(row.overQty, 20);
  assert.equal(row.status, "FAZLA");
});

test("eksik baskı bölgesini tamamlanmış model saymaz", () => {
  const row = calculate({
    expectedQty: 800,
    requiredRegions: ["Ön", "Arka"],
    regionTotals: totals([["Ön", 800]]),
    printDefectQty: 0,
    fabricDefectQty: 0,
    wasteQty: 0,
  });

  assert.equal(row.completedGrossQty, 0);
  assert.deepEqual(row.missingRegions, ["Arka"]);
  assert.equal(row.status, "EKSİK BÖLGE");
});

test("tam üretimde baskı ve kumaş sakatını net sağlam adetten düşer", () => {
  const row = calculate({
    expectedQty: 500,
    requiredRegions: ["Ön"],
    regionTotals: totals([["Ön", 500]]),
    printDefectQty: 8,
    fabricDefectQty: 2,
    wasteQty: 10,
  });

  assert.equal(row.completedGrossQty, 500);
  assert.equal(row.netGoodQty, 490);
  assert.equal(row.status, "SAKATLI TAMAM");
});
