import { test } from "node:test";
import assert from "node:assert/strict";
import { exactPackageKg, chooseExactEBelgeProduct } from "./e-belge-exact-product";
import { packageWeightFromItem } from "./e-belge-document-automation";

test("Paket 30 KG, 60 kilogram, kesirsiz ve Türkçe biçimlerde tanınır",()=>{
  assert.equal(exactPackageKg("SÜPER BEYAZ 30 kg"),30);
  assert.equal(exactPackageKg("SÜPER BEYAZ (60 KİLOGRAM)"),60);
  assert.equal(exactPackageKg("SÜPER BEYAZ NET AĞIRLIK: 30,5 KG"),30.5);
  assert.equal(exactPackageKg("SÜPER BEYAZ"),0);
  assert.deepEqual(packageWeightFromItem("MALZEME 60 kilogram",2,"C62"),{
    packageWeightKg:60,packageCount:2,calculatedKg:120,requiresStockUnitReview:true
  });
  const kgLine=packageWeightFromItem("MALZEME 30 kg",60,"KGM");
  assert.equal(kgLine.packageWeightKg,30);
  assert.equal(kgLine.calculatedKg,0);
  assert.equal(kgLine.requiresStockUnitReview,false);
});

test("Ürün benzer adıyla değil yalnız kesin kodu veya tam adıyla eşleşir",()=>{
  const products=[
    {id:"30",name:"BOYA 30 KG",code:"B-30",raw:{packageWeightKg:30}},
    {id:"60",name:"BOYA 60 KG",code:"B-60",raw:{packageWeightKg:60}},
    {id:"other",name:"BOYA BENZER",code:"B-30-OTHER"}
  ];
  const a=chooseExactEBelgeProduct(products,{description:"BOYA 30 KG",productCode:"B-30",packageWeightKg:30});
  assert.equal(a.product?.id,"30");
  const b=chooseExactEBelgeProduct(products,{description:"BOYA 60 KG",productCode:"B-60",packageWeightKg:60});
  assert.equal(b.product?.id,"60");
  assert.equal(chooseExactEBelgeProduct(products,{description:"BOYA",productCode:"B-3"}).product,null);
  assert.equal(chooseExactEBelgeProduct(products,{description:"BOYA 30 KG",productCode:"B-60",packageWeightKg:30}).source,"PACKAGE_CONFLICT");
});

test("Aynı kodu taşıyan 30/60 kg varyantlar ambalaja göre ayrılır; belirsiz otomatik seçilmez",()=>{
  const items=[{id:"p30",name:"FİKSATÖR 30 KG",code:"FIX",raw:{packageWeightKg:30}},
    {id:"p60",name:"FİKSATÖR 60 KG",code:"FIX",raw:{packageWeightKg:60}}];
  assert.equal(chooseExactEBelgeProduct(items,{description:"FİKSATÖR 30 KG",productCode:"FIX"}).product?.id,"p30");
  assert.equal(chooseExactEBelgeProduct(items,{description:"FİKSATÖR 60 kilogram",productCode:"FIX"}).product?.id,"p60");
  assert.equal(chooseExactEBelgeProduct(items,{description:"FİKSATÖR",productCode:"FIX"}).source,"AMBIGUOUS");
});

test("Alıcı ürün kodu ile satıcı kodu iki farklı ürüne işaret ederse onay gerekir",()=>{
  const items=[{id:"a",code:"A",name:"A"},{id:"b",code:"B",name:"B"}];
  assert.equal(chooseExactEBelgeProduct(items,{description:"A",productCode:"A",supplierProductCode:"B"}).source,"AMBIGUOUS");
});

test("Katalog ürünü ambalajsızsa ürün tekil olsa bile stok birimi teyidi gerekir",()=>{
  const a=chooseExactEBelgeProduct([{id:"base",name:"BOYA",code:"P"}],{
    description:"BOYA 30kg",productCode:"P",packageWeightKg:30});
  assert.equal(a.product?.id,"base");
  assert.equal(a.source,"PACKAGING_REVIEW");
});
