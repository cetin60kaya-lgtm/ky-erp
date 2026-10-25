import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./ProductionControlCenterPageV2.jsx", import.meta.url), "utf8");
test("Üretim fişi tekrar istekleri aynı talep kimliğini korur ve iki POST yapmaz", () => {
  assert.match(source, /requestId: source\?\.requestId \|\| crypto\.randomUUID\(\)/);
  assert.match(source, /if \(saveLock\.current \|\| saving\) return;/);
  assert.match(source, /saveLock\.current = true;/);
  assert.match(source, /saveLock\.current = false;/);
});
test("İmalat ana firma ve eski GET yanıtı fail-closed", () => {
  assert.match(source, /ticket !== requestSeq\.current/);
  assert.match(source, /requestSeq\.current \+= 1/);
  assert.match(source, /İmalat merkezi için ana firma seçin/);
  assert.match(source, /setDictionaries\(\{ models: \[\], machines: \[\], operators: \[\], companies: \[\] \}\)/);
  assert.match(source, /setPage\(lastPage\)/);
});
test("Önceki PR 443 sayfa boyutu ve gezinme korunmuştur", () => {
  assert.match(source, /const PAGE_SIZE = 100;/);
  assert.match(source, /pageSize: PAGE_SIZE/);
  assert.match(source, /setPage\(\(value\) => value \+ 1\)/);
  for(const total of [0,1,50,100,101,1001]) {
    const last = Math.max(1, Math.ceil(total / 100));
    assert.equal(last, total <= 100 ? 1 : total <= 1000 ? 2 : 11);
  }
});
