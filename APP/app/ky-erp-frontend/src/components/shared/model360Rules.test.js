import test from "node:test";
import assert from "node:assert/strict";
import {model360Access, model360DeliveryForInvoice, model360LinkedInvoices, model360Warnings} from "./model360Rules.js";

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
