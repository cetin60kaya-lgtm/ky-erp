import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ISNET_DOCUMENT_BYTES, verifyIsnetDownloadedFile } from "./isnet-file-validation.ts";

const buf=(text:string)=>new TextEncoder().encode(text).buffer as ArrayBuffer;
test("İşNet indirme: gerçek PDF başlığı kabul edilir, login HTML/JSON reddedilir",()=>{
  assert.equal(verifyIsnetDownloadedFile("pdf",buf("%PDF-1.7\n1 0 obj\nendobj"),"application/pdf"),"application/pdf");
  for(const content of ["<html><form>Giriş</form></html>",'{"error":"session expired"}',"<?xml version='1.0'?><Invoice/>"]) {
    assert.throws(()=>verifyIsnetDownloadedFile("pdf",buf(content),"application/octet-stream"));
  }
  assert.throws(()=>verifyIsnetDownloadedFile("pdf",buf("%PDF-1.7\n"),"text/html"));
});
test("İşNet indirme: UBL-TR fatura ve irsaliye XML kökü kabul, sahte içerik reddedilir",()=>{
  for(const content of [
    '<?xml version="1.0" encoding="utf-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>',
    '\uFEFF<?xml version="1.0"?>\n<ubl:DespatchAdvice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"/>'
  ]) assert.equal(verifyIsnetDownloadedFile("xml",buf(content),"application/octet-stream"),"application/xml");
  for(const content of ["<html>Login</html>","<Error>Authentication</Error>",'{"error":"timeout"}',"<CreditNote></CreditNote>","PK\u0003\u0004","\n<!DOCTYPE Invoice><Invoice/>"]) {
    assert.throws(()=>verifyIsnetDownloadedFile("xml",buf(content),"application/xml"));
  }
});
test("İşNet indirme: boş/aşırı büyük dosya reddedilir",()=>{
  assert.throws(()=>verifyIsnetDownloadedFile("pdf",new ArrayBuffer(0),"application/pdf"));
  assert.throws(()=>verifyIsnetDownloadedFile("pdf",new ArrayBuffer(MAX_ISNET_DOCUMENT_BYTES+1),"application/pdf"));
});
