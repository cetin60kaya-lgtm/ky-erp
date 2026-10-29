import assert from "node:assert/strict";
import test from "node:test";
import { validCount, validProductionDate, validateDirectProduction } from "./productionDirectEntryValidation.js";

const valid = { modelId: "model-1", date: "2026-10-29", quantity: "2540", shift: "Gece", machineId: "6",
  printRegion: "Ön", ground: "EKRU", printDefectQty: "6", fabricDefectQty: "4", operatorName: "Ahmet" };

test("Excel 10 alanı geçerli bir üretim fişi oluşturur", () => {
  assert.equal(validateDirectProduction(valid), "");
  assert.equal(validCount(valid.quantity, true) - validCount(valid.printDefectQty) - validCount(valid.fabricDefectQty), 2530);
});
test("makine, model, baskı bölgesi ve makinacı boşken kayıt olmaz", () => {
  for (const field of ["modelId", "machineId", "printRegion", "operatorName"]) {
    assert.notEqual(validateDirectProduction({ ...valid, [field]: "" }), "", field);
  }
});
test("fazla sakat, negatif, virgüllü, kesirli, sıfır adet reddedilir", () => {
  for (const qty of ["", "0", "-5", "1.5", "2,5", "1e9"]) assert.notEqual(validateDirectProduction({ ...valid, quantity: qty }), "");
  assert.match(validateDirectProduction({ ...valid, printDefectQty: "2600" }), /aşamaz/);
  assert.match(validateDirectProduction({ ...valid, fabricDefectQty: "-2" }), /tam sayı/);
});
test("gerçek takvim tarihi denetlenir", () => {
  assert.equal(validProductionDate("2026-02-29"), false);
  assert.equal(validProductionDate("2024-02-29"), true);
  assert.notEqual(validateDirectProduction({ ...valid, date: "2026-02-30" }), "");
});
test("gündüz ve gece vardiyası ayrı; geçersiz vardiya kaydedilemez", () => {
  assert.equal(validateDirectProduction({ ...valid, shift: "Gece" }), "");
  assert.equal(validateDirectProduction({ ...valid, shift: "Gündüz" }), "");
  assert.notEqual(validateDirectProduction({ ...valid, shift: "Akşam" }), "");
});
