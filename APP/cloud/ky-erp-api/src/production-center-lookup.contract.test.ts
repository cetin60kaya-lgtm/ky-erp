import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./production-center.ts", import.meta.url), "utf8");

test("İmalat havuz araması gerçek model ID/kodu/adı, firma, sipariş ve irsaliye no ile yapılır", () => {
  assert.match(source, /return normalized\(\x60\$\{card\.id \|\| ""\} \$\{card\.modelCode \|\| ""\}/);
  assert.match(source, /\$\{card\.modelName \|\| ""\}/);
  assert.match(source, /\$\{card\.companyName \|\| ""\}/);
  assert.match(source, /\$\{card\.orderNo \|\| ""\}/);
  assert.match(source, /\$\{card\.defaultDispatchNo \|\| ""\}/);
  assert.match(source, /matchesProductionPool\(card, pool\)/);
  assert.match(source, /poolContract: PRODUCTION_POOL_CONTRACT/);
});
