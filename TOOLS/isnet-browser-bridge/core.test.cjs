const C=require("./core.js"),assert=require("node:assert/strict"),fs=require("node:fs");
const enc=new TextEncoder(),b=s=>enc.encode(s);
(async()=>{
let pass=0;function test(name,fn){fn();pass++;console.log("PASS "+name)}
const s=C.source("/IncomingDespatchAdvice/IncomingDespatchAdviceList");
const row=C.normalize({IdIrsaliyeGelen:123,IrsaliyeNo:"TEST2026000000001"},s);
test("four source paths",()=>{for(const path of ["/IncomingInvoice/IncomingInvoiceList","/OutgoingInvoice/OutgoingInvoiceList","/IncomingDespatchAdvice/IncomingDespatchAdviceList","/OutgoingDespatch/OutgoingDespatchList"])assert.ok(C.source(path));assert.equal(C.source("/Account/Login"),null)});
test("visible row mapping and invalid ID",()=>{assert.equal(row.id,"123");assert.equal(C.normalize({IdIrsaliyeGelen:"../x",IrsaliyeNo:"A"},s),null)});
test("download allowlist",()=>{assert.equal(C.downloadPath(row,"pdf"),"/Despatch/GetDespatchPdf?InOrOut=true&DespatchId=123");assert.throws(()=>C.downloadPath({...row,id:"../x"},"xml"));assert.throws(()=>C.downloadPath(row,"html"))});
test("HTML rejected as PDF",()=>assert.throws(()=>C.validate(b("<html>"),"pdf","dispatch",row.number)));
test("real PDF signature accepted",()=>C.validate(b("%PDF-1.4\n%%EOF"),"pdf","dispatch",row.number));
test("wrong UBL root and entity rejected",()=>{assert.throws(()=>C.validate(b("<Invoice/>"),"xml","dispatch",row.number));assert.throws(()=>C.validate(b("<!DOCTYPE DespatchAdvice><DespatchAdvice/>"),"xml","dispatch",row.number))});
test("document number checked",()=>{const make=id=>()=>({getElementsByTagName:()=>[],documentElement:{localName:"DespatchAdvice",namespaceURI:"urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2",children:[{localName:"ID",namespaceURI:"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",textContent:id}]}});C.validate(b("<DespatchAdvice/>"),"xml","dispatch",row.number,make(row.number));assert.throws(()=>C.validate(b("<DespatchAdvice/>"),"xml","dispatch",row.number,make("DIFFERENT")))});
test("duplicate/traversal ZIP names blocked",()=>{assert.throws(()=>C.zip([{name:"../bad.xml",data:b("a")} ]));assert.throws(()=>C.zip([{name:"a.xml",data:b("a")},{name:"a.xml",data:b("b")}]))});
const blob=C.zip([{name:"fixture.xml",data:b("<DespatchAdvice/>")},{name:"fixture.pdf",data:b("%PDF-1.4\n%%EOF")}]);
fs.writeFileSync("synthetic-test.zip",Buffer.from(await blob.arrayBuffer()));console.log("TESTS="+pass+"/8");
})().catch(e=>{console.error(e);process.exitCode=1});
