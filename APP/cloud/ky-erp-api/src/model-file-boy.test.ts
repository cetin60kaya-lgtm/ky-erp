import test from "node:test";
import assert from "node:assert/strict";
import { normalizeModelBoy, normalizeModelPrintArea } from "./model-file-boy";
test("Küçük/büyük BOY yazımları aynı canonical değere döner",()=>{
  assert.equal(normalizeModelBoy("K_BOY"),"Küçük Boy");
  assert.equal(normalizeModelBoy("küçük boy"),"Küçük Boy");
  assert.equal(normalizeModelBoy("B_BOY"),"Büyük Boy");
  assert.equal(normalizeModelBoy("Büyük Boy"),"Büyük Boy");
});
test("Özel BOY ölçü ister ve eski özel açıklamayı korur",()=>{
  assert.equal(normalizeModelBoy("Özel Boy: 40x20 cm"),"Özel Boy: 40x20 cm");
  assert.equal(normalizeModelBoy("Başka ölçü"),"Başka ölçü");
  assert.throws(()=>normalizeModelBoy("Özel Boy"));
  assert.throws(()=>normalizeModelBoy("Özel Boy: ölçü"));
});
test("Baskı bölgesi tek kodda normalleşir, bilinmeyen bölge reddedilir",()=>{
  assert.equal(normalizeModelPrintArea("ön"),"FRONT");
  assert.equal(normalizeModelPrintArea("sol kol"),"LEFT_SLEEVE");
  assert.equal(normalizeModelPrintArea("LEFT_SLEEVE"),"LEFT_SLEEVE");
  assert.equal(normalizeModelPrintArea(""),"");
  assert.throws(()=>normalizeModelPrintArea("rastgele"));
});
