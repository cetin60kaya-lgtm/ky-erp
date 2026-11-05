import test from "node:test";
import assert from "node:assert/strict";
import { interpretPlacementText } from "./desen-placement-measurement.ts";

test("FANTY PDF: tüm bedenler aynı DESEN EN×BOY, ÇEKME ve DİKİŞ farklı",()=>{
  const data=interpretPlacementText(
    "2114748-FANTY-FT\nTÜM BEDENLERDE\nDESEN EN=26.6 CM\nDESEN BOY=5.01 CM\n" +
    "ÇEKME EN=2 CM\nÇEKME BOY=3.5 CM\nDİKİŞ PAYI=1 CM");
  assert.deepEqual(data,[{
    artworkPart:"Ana desen",widthCm:26.6,heightCm:5.01,
    garmentSizes:[],allGarmentSizes:true,source:"OCR_UNVERIFIED"
  }]);
});
test("SIMSAH: ay grupları ayrı, ana desen ile kuyruk kendi ölçülerinde",()=>{
  const data=interpretPlacementText(
    "1–3 / 3–6 AY İÇİN;\nTİMSAH EN:17.93CM\nTİMSAH BOY:23 CM\nKUYRUK EN:9 CM\nKUYRUK BOY:9.30 CM\n"+
    "6–9 / 9–12 / 12–18 AY İÇİN;\nTİMSAH EN:20.61CM\nTİMSAH BOY:26.45CM\n"+
    "KUYRUK EN:10.35CM\nKUYRUK BOY:10.69CM"
  );
  assert.equal(data.length,4);
  assert.deepEqual(data[0].garmentSizes,["1-3 ay","3-6 ay"]);
  assert.equal(data[0].widthCm,17.93);
  assert.equal(data[1].heightCm,9.3);
  assert.deepEqual(data[2].garmentSizes,["6-9 ay","9-12 ay","12-18 ay"]);
  assert.equal(data[3].widthCm,10.35);
});
test("yalnız ürün bedenleri ölçü üretmez, çekme boyu baskı sanılmaz",()=>{
  assert.deepEqual(interpretPlacementText("XS/S/M/L/XL\nDİKİŞ PAYI:1CM\nÇEKME EN:2 CM\nÇEKME BOY:3.5 CM"),[]);
});
