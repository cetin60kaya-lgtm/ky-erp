import test from "node:test";
import assert from "node:assert/strict";
import { folderSubpath, modelSourceFileType, modelFileCategory } from "./model-folder-path.js";

test("Drive model klasöründeki tek veya çoklu dosyalar tek model paketi kalır",()=>{
  assert.equal(folderSubpath("MAMBI/MAMBI.pdf"),"");
  assert.equal(folderSubpath("MAMBI/MAMBI FT ÖLÇÜ.pdf"),"");
  assert.equal(folderSubpath("MAMBI/teknik/2026/MAMBI FT ÖLÇÜ.pdf"),"teknik/2026");
  assert.equal(modelSourceFileType("MAMBI FT ÖLÇÜ.pdf"),"TECHNICAL_SHEET");
  assert.equal(modelSourceFileType("MAMBI.pdf"),"MODEL_PDF");
  assert.equal(modelSourceFileType("MAMBI.psd"),"SOURCE_ARTWORK");
});
test("Klasör modu içindeki PSD'yi giden PSD'ye otomatik yönlendirmez",()=>{
  assert.equal(modelFileCategory("MAMBI.psd",true),"MODEL_SOURCE");
  assert.equal(modelFileCategory("MAMBI.psd",false),"OUTGOING_DESIGN");
  assert.equal(modelFileCategory("DDM2026000000001.pdf"),"DELIVERY_NOTE");
  assert.equal(modelFileCategory("HKN2026000000001.pdf"),"INVOICE");
  assert.equal(modelFileCategory("MAMBI FT ÖLÇÜ.pdf",true),"MODEL_SOURCE");
});
