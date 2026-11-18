import test from "node:test";
import assert from "node:assert/strict";
import {model360Access, model360DeliveryForInvoice, model360LinkedInvoices, model360Warnings, model360QuantityReview} from "./model360Rules.js";

test("çok modelli fatura bir kez listelenir; sadece gerçek giden HKN kabul edilir", () => {
  const docs = [
    {id:"i1",number:"HKN2026000000989",kind:"FATURA",direction:"OUTGOING",date:"2026-11-18"},
    {id:"d1",number:"DDM2026000000974",kind:"IRSALIYE",direction:"OUTGOING"},
    {id:"i2",number:"HKN2026000000989",kind:"FATURA",direction:"INCOMING"},
  ];
  assert.deepEqual(model360LinkedInvoices(docs).map(x=>x.id),["i1"]);
});
test("birden fazla ilgili DDM varsa otomatik birinciyi seçmez", () => {
  const invoice={relatedDocuments:[{id:"d1"},{id:"d2"}]};
  const docs=[
    {id:"d1",kind:"IRSALIYE",direction:"OUTGOING",number:"DDM2026000000974"},
    {id:"d2",kind:"IRSALIYE",direction:"OUTGOING",number:"DDM2026000000975"},
  ];
  assert.equal(model360DeliveryForInvoice(invoice,docs),"");
  assert.equal(model360DeliveryForInvoice(invoice,[docs[0]]),"DDM2026000000974");
});
test("İmalat rolü muhasebe gönderimini ya da başka departmanın yazımını açmaz", () => {
  const user={role:"WORKER",permissions:[{moduleKey:"URETIM",canView:true,canCreate:true}]};
  assert.equal(model360Access(user,"production",true),true);
  assert.equal(model360Access(user,"mail",true),false);
  assert.equal(model360Access(user,"design",true),false);
  assert.equal(model360Access(user,"general",false),true);
  assert.equal(model360Access(null,"production",true),false);
});
test("görsel yok ve adet taşması kontrol gerektirir, adedi otomatik düzeltmez", () => {
  const warnings=model360Warnings({overProducedQty:20,isVirtual:false,imageUrl:""},null,[]);
  assert.ok(warnings.some(x=>x.includes("görseli eksik")));
  assert.ok(warnings.some(x=>x.includes("Üretilen")));
  assert.ok(warnings.some(x=>x.includes("belge")));
});

test("aynı HKN belgesindeki diğer modelin miktarı bu modelin faturasına eklenmez",()=>{
 const model={id:"model-A",incomingQty:1000,dispatchQty:1000,completedGrossQty:980,
  completedNetQty:940,invoicedQty:940,
  invoices:[{documentId:"hkn-1",lineId:"line-a",documentNo:"HKN2026000000989",quantity:940,unit:"AD"},
   {documentId:"hkn-1",lineId:"line-a",documentNo:"HKN2026000000989",quantity:940,unit:"AD"}]};
 const docs=[{id:"hkn-1",kind:"FATURA",direction:"OUTGOING",number:"HKN2026000000989"}];
 const review=model360QuantityReview(model,docs);
 assert.equal(review.ready,true);
 assert.equal(review.lines.length,1);
 assert.equal(review.invoiceLineTotal,940);
 assert.equal(review.invoiced,940);
 assert.equal(review.remainingFromProduction,0);
 assert.equal(review.documentCount,1);
});
test("fatura kalemi kimliği olmadan miktar ataması yapılmaz",()=>{
 const review=model360QuantityReview({incomingQty:100,dispatchQty:100,completedNetQty:80,completedGrossQty:90,invoicedQty:80,
  invoices:[{documentNo:"HKN2026000000990",quantity:80}]},[]);
 assert.equal(review.lines.length,0);
 assert.ok(review.checks.some(x=>x.message.includes("kimlik")));
});
test("üretim ve fatura fazlası yalnız uyarıdır, kayıt değiştirilmez",()=>{
 const model={incomingQty:80,dispatchQty:80,completedGrossQty:100,completedNetQty:92,invoicedQty:100,
  invoices:[{documentId:"h",lineId:"i",quantity:100,unit:"AD"}]};
 const snapshot=JSON.stringify(model);
 const review=model360QuantityReview(model,[{id:"h",kind:"FATURA",direction:"OUTGOING"}]);
 assert.ok(review.checks.some(x=>x.message.includes("Net üretim")));
 assert.ok(review.checks.some(x=>x.message.includes("Faturalanan")));
 assert.equal(JSON.stringify(model),snapshot);
});
test("sanal model fiş veya mali mutabakat için kalıcı model sayılmaz",()=>{
 assert.equal(model360QuantityReview({isVirtual:true,invoices:[]},[]).ready,false);
 assert.equal(model360QuantityReview(null,[]).ready,false);
});
