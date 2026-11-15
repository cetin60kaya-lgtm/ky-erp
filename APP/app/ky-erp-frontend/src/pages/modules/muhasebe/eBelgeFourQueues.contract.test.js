import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("./EBelgeCenterPage.jsx",import.meta.url),"utf8");
const print=readFileSync(new URL("./EBelgeAccountingPrint.jsx",import.meta.url),"utf8");
const nav=readFileSync(new URL("../../../app/moduleRegistry.js",import.meta.url),"utf8");
const base=readFileSync(new URL("../../../app/moduleRegistryBase.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../../../AppV3.jsx",import.meta.url),"utf8");
test("Günlük listelerde dört ayrı sekme, canonical havuzda dört filtre",()=>{
 for(const key of ["gelen-faturalar","gelen-irsaliyeler","giden-faturalar","giden-irsaliyeler"]){
  assert.ok(nav.includes(key),key);
  assert.ok(base.includes(key),key);
  assert.ok(app.includes(key),key);
 }
 for(const key of ["INCOMING_INVOICE","OUTGOING_INVOICE","INCOMING_DISPATCH","OUTGOING_DISPATCH"])
  assert.ok(page.includes(key),key);
 assert.match(page,/getEBelgePool\(params\)/);
 assert.match(page,/FOUR_DOCUMENT_VIEWS\.map/);
 assert.match(page,/setSelectedId\(row\.id\)/);
});
test("Gelen faturada muhasebe çıktısı bekleyenler sunucuda filtrelenir ve listede gösterilir",()=>{
 assert.match(page,/printStatus:"PENDING"/);
 assert.match(page,/getEBelgeAccountingPrintStatuses/);
 assert.match(page,/printStatuses\[row\.id\]/);
 assert.match(page,/Yalnız Çıktı Bekleyenler/);
 assert.match(page,/EBelgeAccountingPrint/);
});
test("PDF görüntüleme kendiliğinden çıktı alındı sayılmaz",()=>{
 assert.match(print,/MARK_PRINTED/);
 assert.match(print,/RESET_PENDING/);
 assert.match(print,/onPdf/);
 assert.match(print,/Gerçek Çıktıyı Aldım/);
 assert.match(print,/printedBy/);
 assert.doesNotMatch(print,/useEffect\([\s\S]*?setStatus\("MARK_PRINTED"\)/);
});
test("Firma+fatura şablonu yoksa başka bir PDF uydurulmaz",()=>{
 assert.match(page,/parseUblForVisualOutput\(xml\)/);
 assert.match(page,/String\(detail\.document_no\)!==document\.number/);
 assert.match(page,/p\.issuerTaxNo===document\.supplier\.tax/);
 assert.match(page,/p\.kind==="INVOICE"&&p\.approved===true/);
 assert.match(page,/renderUblOutput\(xml,profile\.layout,"PDF"\)/);
});
