import test from "node:test";
import assert from "node:assert/strict";
import { reviewAccountingOcr } from "./accounting-document-ocr-quality.ts";

const good=(overrides:any={})=>({
  documentNo:"HKN2026000001001",partyName:"ÖRNEK TEKSTİL",
  partyTaxNo:"1234567890",issueDate:"2026-11-11",
  subtotal:100,taxTotal:20,discountTotal:0,payableTotal:120,
  extractionConfidence:.94,lines:[{description:"Baskı",quantity:10}],...overrides,
});
test("OCR iyi fatura - güvenli ve tutarlı",()=>assert.deepEqual(reviewAccountingOcr(good()),[]));
test("OCR belirsiz kritik alanlar onay bekletir",()=>{
  assert.ok(reviewAccountingOcr(good({partyTaxNo:""})).includes("COUNTERPARTY_VKN_REVIEW"));
  assert.ok(reviewAccountingOcr(good({partyName:""})).includes("COUNTERPARTY_NAME_MISSING"));
  assert.ok(reviewAccountingOcr(good({documentNo:"??"})).includes("DOCUMENT_NO_REVIEW"));
  assert.ok(reviewAccountingOcr(good({issueDate:"2026-02-30"})).includes("ISSUE_DATE_REVIEW"));
  assert.ok(reviewAccountingOcr(good({payableTotal:0})).includes("INVOICE_PAYABLE_REVIEW"));
  assert.ok(reviewAccountingOcr(good({payableTotal:150})).includes("INVOICE_ARITHMETIC_REVIEW"));
  assert.ok(reviewAccountingOcr(good({lines:[{description:"",quantity:0}]})).includes("LINE_QUANTITY_OR_DESCRIPTION_REVIEW"));
  assert.ok(reviewAccountingOcr(good({extractionConfidence:.2})).includes("OCR_CONFIDENCE_LOW"));
});
test("İrsaliyede tutar olmayabilir ama adet ve OCR güveni denetlenir",()=>{
  const dispatch=good({documentNo:"DDM2026000001001",subtotal:0,taxTotal:0,payableTotal:0});
  assert.deepEqual(reviewAccountingOcr(dispatch,"IRSALIYE"),[]);
  assert.ok(reviewAccountingOcr({...dispatch,extractionConfidence:0},"IRSALIYE").includes("OCR_CONFIDENCE_LOW"));
});
