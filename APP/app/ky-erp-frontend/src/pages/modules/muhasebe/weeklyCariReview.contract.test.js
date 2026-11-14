import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page=readFileSync(new URL("./ReconciliationPanel.jsx",import.meta.url),"utf8");
test("Haftalık XLSX tutar kaynağı eksikse belirsiz etiketi ve uyarı çıkar",()=>{
 assert.match(page,/AMOUNT_UNVERIFIED_REVIEW/);
 assert.match(page,/currentMissingAmountSheets/);
 assert.match(page,/Tutar sütunu doğrulanamayan belge/);
 assert.match(page,/tahsilat eşleşmesini kesinleştirmeyin/);
});
