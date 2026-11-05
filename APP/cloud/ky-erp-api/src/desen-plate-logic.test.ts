import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalPlateText, suggestedPlateSizes, suggestPlateMembership,
  validatePlateEntries, describeSharedPlate, scaleRelativeToReference, cm,
} from "./desen-plate-logic.ts";
const a="a741a328-9613-4dfe-9fd4-318301a9701a",b="b741a328-9613-4dfe-9fd4-318301a9701b";
const entry=(modelId:string, sizeCode:string, widthCm:number|null,heightCm:number|null, garments:string[]=[])=>({
  modelId,sizeCode,sizeLabel:sizeCode,printArea:"FRONT",artworkPart:"Ana desen",
  widthCm,heightCm,garmentSizes:garments,allGarmentSizes:false,isReferenceSize:false,
});
test("desen boyutu santimetre en x boy; ürün S/M/L/XL kalıp ölçüsü değildir",()=>{
  assert.deepEqual(suggestedPlateSizes("XS/S/M/L/XL"),[{sizeCode:"UNSPECIFIED",sizeLabel:"Desen ölçüsü doğrulanmadı"}]);
  assert.deepEqual(suggestedPlateSizes("3 BOY"),[{sizeCode:"UNSPECIFIED",sizeLabel:"Desen ölçüsü doğrulanmadı"}]);
  assert.deepEqual(suggestedPlateSizes("K-B_BOY").map(x=>x.sizeCode),["SMALL","LARGE"]);
});
test("çok sayıda baskı ebadı, iki model ve her boya farklı ürün bedenleri",()=>{
  const items=Array.from({length:80},(_,i)=>entry(a,"PRINT_"+(i+1),10+i/10,12+i/10,["3-4 yaş","4-5 yaş"]));
  items.push(entry(b,"ORIGINAL",15,20,["S","M"]));
  const result=validatePlateEntries(items);
  assert.equal(result.ok,true);
  if(result.ok){
    assert.equal(result.entries.length,81);
    assert.deepEqual(describeSharedPlate(result.entries,a),{modelSizeCount:80,sharedModelCount:2});
    assert.deepEqual(result.entries[0].garmentSizes,["3-4 yaş","4-5 yaş"]);
  }
});
test("tek baskı ebadı tüm ürün bedenlerinde kullanılabilir",()=>{
  const candidate={...entry(a,"ORIGINAL","26,6" as unknown as number,"5,01" as unknown as number),allGarmentSizes:true,isReferenceSize:true};
  const parsed=validatePlateEntries([candidate]);
  assert.equal(parsed.ok,true);
  if(parsed.ok)assert.deepEqual([parsed.entries[0].widthCm,parsed.entries[0].heightCm],[26.6,5.01]);
});
test("orijinal 10x12 cm ile %15 küçük 8.5x10.2 cm ilişkisi",()=>{
  const original=entry(a,"ORIGINAL",10,12);
  const small=entry(a,"SMALL",8.5,10.2);
  const actual=scaleRelativeToReference(original,small);
  assert.ok(actual);
  assert.equal(actual?.widthChangePercent,-15);
  assert.equal(actual?.heightChangePercent,-15);
  assert.equal(actual?.uniform,true);
  const large=entry(a,"LARGE",12,14.4);
  assert.equal(scaleRelativeToReference(original,large)?.widthChangePercent,20);
});
test("sonradan gelen büyük ölçü, önceki orijinali küçük hale getirir; referans değişebilir",()=>{
  const original={...entry(a,"SMALL",10,12),isReferenceSize:true};
  const larger=entry(a,"LARGE",12,14.4);
  const parsed=validatePlateEntries([original,larger]);
  assert.equal(parsed.ok,true);
  assert.equal(scaleRelativeToReference(original,larger)?.uniform,true);
});
test("bir model farklı ürün beden grubunda farklı desen ölçüsü kullanır",()=>{
  const rows=[
    entry(a,"PRINT_SMALL",17.93,23,["1-3 ay","3-6 ay"]),
    entry(a,"PRINT_LARGE",20.61,26.45,["6-9 ay","9-12 ay","12-18 ay"]),
    {...entry(a,"TAIL_SMALL",9,9.3,["1-3 ay","3-6 ay"]),artworkPart:"Kuyruk"},
    {...entry(a,"TAIL_LARGE",10.35,10.69,["6-9 ay","9-12 ay","12-18 ay"]),artworkPart:"Kuyruk"},
  ];
  assert.equal(validatePlateEntries(rows).ok,true);
  assert.notDeepEqual(rows[0].garmentSizes,rows[1].garmentSizes);
});
test("eksik tek boy ölçüsü, negatif değer, tekrar veya beden/ölçü karmaşası reddedilir",()=>{
  assert.equal(validatePlateEntries([{...entry(a,"SMALL",10,null)}]).ok,false);
  assert.equal(validatePlateEntries([{...entry(a,"SMALL",-1,10)}]).ok,false);
  assert.equal(validatePlateEntries([entry(a,"SMALL",10,12),entry(a,"SMALL",11,13)]).ok,false);
  assert.equal(validatePlateEntries([{...entry(a,"ONE",10,12),allGarmentSizes:true,garmentSizes:["S"]}]).ok,false);
  assert.equal(validatePlateEntries([{...entry(a,"SMALL",null,null),garmentSizes:["S","S"]}]).ok,false);
  assert.equal(cm("10,125"),10.125);
});
test("orijinal PSD dosya adı aynen kalır; sadece mevcut model isimleri aday olur",()=>{
  const name="TEDCOR K-B_BOY - FANTY ÖN + ARKA.psd";
  const results=suggestPlateMembership(name,[{modelId:a,modelName:"TEDCOR"},{modelId:b,modelName:"FANTY"}]);
  assert.deepEqual(new Set(results.map(x=>x.modelId)),new Set([a,b]));
  assert.equal(canonicalPlateText("Küçük"),"KUCUK");
  assert.equal(name,"TEDCOR K-B_BOY - FANTY ÖN + ARKA.psd");
});
