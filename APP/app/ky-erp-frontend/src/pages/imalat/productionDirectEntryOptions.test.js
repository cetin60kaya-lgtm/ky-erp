import assert from "node:assert/strict";
import test from "node:test";
import { availableProductionRegions, filterProductionModels, productionLineNet } from "./productionDirectEntryOptions.js";

const models = [
  { id: "m1", modelName: "L CARFACE ÖN", companyName: "TAHA GİYİM", printRegions: [{ regionName: "Göğüs" }] },
  { id: "m2", modelName: "TEDDY 2B", companyName: "TAHA GİYİM", printRegions: [] },
  { id: "m3", modelName: "TEDDY 2B", companyName: "MÜŞTERİ 2", printRegions: [] },
  { id: "m4", modelName: "TEDDY SAHTE", isVirtual: true },
];

test("modeli adını yazdıkça bulur; sahte/virtual modele üretim önermez", () => {
  assert.deepEqual(filterProductionModels(models, "carface").map((m) => m.id), ["m1"]);
  assert.deepEqual(filterProductionModels(models, "teddy").map((m) => m.id), ["m2", "m3"]);
  assert.deepEqual(filterProductionModels(models, "teddy", 1).map((m) => m.id), ["m2"]);
});
test("hazır baskı bölgeleri ve modelin özel baskı bölgeleri birlikte açılır", () => {
  const options = availableProductionRegions(models[0]);
  for (const value of ["Göğüs", "Ön", "Arka", "Kol", "Sağ Kol", "Sol Kol", "Yan"]) {
    assert.ok(options.includes(value), value);
  }
  assert.equal(options.filter((n) => n === "Ön").length, 1);
});
test("seri satırdaki net = adet - baskı sakatı - kumaş sakatı", () => {
  assert.equal(productionLineNet({ quantity: 250, printDefectQty: 5, fabricDefectQty: 3 }), 242);
});
