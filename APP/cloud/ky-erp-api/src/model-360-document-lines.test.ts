import assert from "node:assert/strict";
import test from "node:test";
import {model360CanonicalLineAudit} from "./model-360-document-lines-core.ts";
const row=(extra:Record<string,any>={})=>({document_id:"hkn1",document_no:"HKN2026000000989",
 line_id:"line-a",model_id:"model-a",document_type:"OUTGOING_INVOICE",direction:"OUTGOING",
 party_company_id:"firm-a",quantity:940,unit_code:"C62",link_count:1,...extra});
test("tek HKN üç model olsa bile yalnız seçilen modelin kesin kalemi sayılır",()=>{
 const res=model360CanonicalLineAudit([row(),row()], "firm-a");
 assert.equal(res.totals.invoiced,940);
 assert.equal(res.verifiedLineCount,1);
 assert.equal(res.linkedDocumentCount,1);
});
test("bir satır birden fazla modelle bağlandıysa tam miktar hiçbir modele yazılmaz",()=>{
 const res=model360CanonicalLineAudit([row({link_count:2})],"firm-a");
 assert.equal(res.status,"REVIEW_REQUIRED");
 assert.equal(res.totals.invoiced,null);
 assert.equal(res.items[0].status,"MULTI_MODEL_LINE_REVIEW");
});
test("yalnız belge başlığı modele bağlandıysa kalem adedi hesaplanmaz",()=>{
 const res=model360CanonicalLineAudit([row({line_id:null})],"firm-a");
 assert.equal(res.totals.invoiced,null);
 assert.equal(res.items[0].status,"DOCUMENT_ONLY_REVIEW");
});
test("müşteri firması uyuşmazsa miktar izlenir ama toplanmaz",()=>{
 const res=model360CanonicalLineAudit([row({party_company_id:"firm-b"})],"firm-a");
 assert.equal(res.items[0].status,"COMPANY_CONFLICT");
 assert.equal(res.totals.invoiced,null);
});
test("gelen, giden ve fatura aynı modelde ayrı sayılır",()=>{
 const res=model360CanonicalLineAudit([
 row({document_id:"incoming",line_id:"a",document_type:"INCOMING_DISPATCH",direction:"INCOMING",quantity:1000}),
 row({document_id:"outgoing",line_id:"b",document_type:"OUTGOING_DISPATCH",direction:"OUTGOING",quantity:940}),
 row({document_id:"hkn",line_id:"c",quantity:940}),
 ],"firm-a");
 assert.deepEqual(res.totals,{received:1000,shipped:940,invoiced:940});
});
test("adet olmayan birim, bilinmeyen yön ve taşmış sorgu kesin hesap sayılmaz",()=>{
 const res=model360CanonicalLineAudit([
 row({document_id:"kg",line_id:"kg",unit_code:"KGM"}),
 row({document_id:"wrong",line_id:"wrong",direction:"OTHER",unit_code:"C62"}),
 ],"firm-a",true);
 assert.equal(res.totals.invoiced,null);
 assert.equal(res.reviewLineCount,2);
 assert.equal(res.status,"TRUNCATED");
});
