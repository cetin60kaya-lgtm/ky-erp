import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPlateText, suggestedPlateSizes, suggestPlateMembership, validatePlateEntries, describeSharedPlate } from "./desen-plate-logic.ts";
const modelA = "a741a328-9613-4dfe-9fd4-318301a9701a";
const modelB = "b741a328-9613-4dfe-9fd4-318301a9701b";

test("kalıpta boy sayısı sınırsız: 1, 3, 80 boy aynı modelde ayrı kayıt", () => {
  for (const count of [1, 3, 80]) {
    const raw = Array.from({length:count}, (_,i) => ({
      modelId:modelA,sizeCode:"BOY_"+String(i+1),sizeLabel:String(i+1)+". boy",printArea:"FRONT",
    }));
    const result = validatePlateEntries(raw);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.entries.length, count);
      assert.equal(describeSharedPlate(result.entries,modelA).modelSizeCount,count);
    }
  }
});

test("ortak PSD: A üç boy, B yalnız büyük; model ve boylar karışmaz", () => {
  const raw = [
    ...["1. boy","2. boy","3. boy"].map((sizeLabel,i)=>({modelId:modelA,sizeLabel,sizeCode:"BOY_"+(i+1),printArea:"FRONT"})),
    {modelId:modelB,sizeLabel:"Büyük boy",sizeCode:"LARGE",printArea:"BACK"},
  ];
  const result = validatePlateEntries(raw);
  assert.equal(result.ok,true);
  if (result.ok) {
    assert.deepEqual(describeSharedPlate(result.entries,modelA),{modelSizeCount:3,sharedModelCount:2});
    assert.deepEqual(describeSharedPlate(result.entries,modelB),{modelSizeCount:1,sharedModelCount:2});
  }
});

test("dosya adı asla yeniden adlandırılmaz, yalnız mevcut modeller önerilir", () => {
  const file = "TEDCOR K-B_BOY - FANTY ÖN + ARKA.psd";
  const suggestion = suggestPlateMembership(file,[{modelId:modelA,modelName:"TEDCOR"},{modelId:modelB,modelName:"FANTY"}]);
  assert.equal(file,"TEDCOR K-B_BOY - FANTY ÖN + ARKA.psd");
  assert.deepEqual(new Set(suggestion.map(x=>x.modelId)),new Set([modelA,modelB]));
  assert.equal(canonicalPlateText("Büyük"),"BUYUK");
});

test("üçten fazla açıkça yazılmış boy ismi önerilebilir; salt sayı 3 BOY kesin boya çevrilmez", () => {
  assert.deepEqual(suggestedPlateSizes("XS/S/M/L/XL").map(x=>x.sizeCode),["XS","S","M","L","XL"]);
  assert.deepEqual(suggestedPlateSizes("1.BOY 2.BOY 3.BOY").map(x=>x.sizeCode),["BOY_1","BOY_2","BOY_3"]);
  assert.equal(suggestedPlateSizes("3 BOY")[0].sizeCode,"UNSPECIFIED");
});

test("tekrarlanan model-boy-bölge reddedilir, aynı boy başka baskı bölgesinde olabilir", () => {
  const row = {modelId:modelA,sizeCode:"BOY_9",sizeLabel:"9. boy",printArea:"FRONT"};
  assert.equal(validatePlateEntries([row,row]).ok,false);
  assert.equal(validatePlateEntries([row,{...row,printArea:"BACK"}]).ok,true);
  assert.equal(validatePlateEntries([{...row,sizeCode:"KALIP_XL_4"}]).ok,true);
});
