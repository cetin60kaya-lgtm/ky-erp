import test from "node:test";
import assert from "node:assert/strict";
import {buildEBelgeArchiveRelativePath,modelArchiveFileStem,safeArchiveSegment} from "./e-belge-model-archive-path.ts";
const base={root:"Hakan Emp/e-Belge",date:"2026-11-15",party:"Taha Giyim",direction:"INCOMING",
 documentType:"GELEN_IRSALIYE",documentNo:"THA2026000123",modelNames:["SEK-2","SEK-3","WILD-19"]};
test("Tek irsaliye 3 model, bir XML ve bir PDF ayrı dosyalarda aynı isimle arşivlenir",()=>{
 const xml=buildEBelgeArchiveRelativePath({...base,originalFileName:"reference.xml"});
 const pdf=buildEBelgeArchiveRelativePath({...base,originalFileName:"reference.pdf"});
 assert.equal(xml,"Hakan Emp/e-Belge/2026/Taha Giyim/GELEN/IRSALIYE/THA2026000123 SEK-2 - SEK-3 - WILD-19.xml");
 assert.equal(pdf,xml.replace(/\.xml$/,".pdf"));
 assert.notEqual(xml,pdf);
});
test("Gelen-giden ve fatura-irsaliye belgeleri ayrı klasörlerde arşivlenir",()=>{
 for(const direction of ["INCOMING","OUTGOING"]){
  for(const documentType of ["GELEN_FATURA","GELEN_IRSALIYE"]){
   const output=buildEBelgeArchiveRelativePath({...base,direction,documentType,modelNames:["SEK-2"],
    originalFileName:"fatura.PDF"});
   assert.ok(output.includes(direction==="INCOMING"?"/GELEN/":"/GIDEN/"));
   assert.ok(output.includes(documentType.includes("IRSALIYE")?"/IRSALIYE/":"/FATURA/"));
   assert.ok(output.endsWith("THA2026000123 SEK-2.pdf"));
  }
 }
});
test("Model adı kesin değilse belge numarası saklanır, uydurma model adı eklenmez",()=>{
 const path=buildEBelgeArchiveRelativePath({...base,modelNames:[],originalFileName:"d.XML"});
 assert.ok(path.endsWith("/THA2026000123.xml"));
});
test("Windows için geçersiz karakterler/tekrarlı modeller temizlenir, fazlalar ERP'de kalır",()=>{
 assert.equal(safeArchiveSegment("A/B\\C:*?\"<>|"),"A-B-C-------");
 assert.equal(modelArchiveFileStem("THA 1",["SEK-2","SEK-2","SEK-3","WILD-19","EXTRA"]),
  "THA 1 SEK-2 - SEK-3 - WILD-19 - +1 MODEL");
 assert.ok(modelArchiveFileStem("DOC",Array.from({length:30},(_,i)=>"LONGMODEL"+i)).length<=188);
 assert.equal(safeArchiveSegment("CON"),"BELIRTILMEDI");
});
