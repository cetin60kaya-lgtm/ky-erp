import assert from "node:assert/strict";
import test from "node:test";
import { normalizePsdModelLinks, mergePsdModelMetadata } from "./desen-psd-model-links.ts";

test("tek PSD farkli modellere ve farkli boylara baglanir", () => {
  const list = normalizePsdModelLinks([
    { modelId:"model-A",boyCode:"K_BOY",printAreaCode:"FRONT" },
    { modelId:"model-A",boyCode:"BUYUK_BOY",printAreaCode:"FRONT" },
    { modelId:"model-B",boyCode:"BUYUK_BOY",printAreaCode:"BACK" },
  ]);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((row)=>row.boyCode), ["KUCUK_BOY","BUYUK_BOY","BUYUK_BOY"]);
  assert.equal(list[1].modelId, "model-A");
});
test("mukerrer link ayni boy/baski icin iki kez olusmaz", () => {
  const list = normalizePsdModelLinks([
    {modelId:"model-A",boyCode:"KUCUK_BOY",printAreaCode:"FRONT"},
    {modelId:"model-A",boyCode:"KUCUK_BOY",printAreaCode:"FRONT"},
  ]);
  assert.equal(list.length,1);
  const first=mergePsdModelMetadata({ source:"MANUAL" },list);
  const again=mergePsdModelMetadata(first,list);
  assert.equal(again.placements.length,1);
  assert.equal(again.source,"MANUAL");
});
test("yanlis boy, bolge veya bossa kaydetmez", () => {
  assert.throws(()=>normalizePsdModelLinks([]));
  assert.throws(()=>normalizePsdModelLinks([{modelId:"model-A",boyCode:"XL",printAreaCode:"FRONT"}]));
  assert.throws(()=>normalizePsdModelLinks([{modelId:"model-A",boyCode:"KUCUK_BOY",printAreaCode:"UNKNOWN"}]));
  assert.throws(()=>normalizePsdModelLinks([{modelId:"model-A",boyCode:"OZEL_BOY",printAreaCode:"BACK"}]));
});
test("mevcut metadata ve boylar korunur, sadece yeni baglar eklenir", () => {
  const old={notes:"kalip v2",placements:[{boyCode:"KUCUK_BOY",printAreaCode:"FRONT"}]};
  const next=mergePsdModelMetadata(old,[{modelId:"model-A",boyCode:"BUYUK_BOY",printAreaCode:"FRONT"}]);
  assert.deepEqual(next.placements.map(x=>x.boyCode),["KUCUK_BOY","BUYUK_BOY"]);
  assert.equal(next.notes,"kalip v2");
  assert.equal(old.placements.length,1);
});
