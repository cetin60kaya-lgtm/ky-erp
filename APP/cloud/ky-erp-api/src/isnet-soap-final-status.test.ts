import test from "node:test";
import assert from "node:assert/strict";
import {parseVerifiedTestFinalStatus,queryVerifiedTestFinalStatus} from "./isnet-soap-final-status.ts";
const q={kind:"E_FATURA" as const,companyTaxCode:"0000000000",from:"2026-11-25",to:"2026-11-26",ettn:"11111111-2222-3333-4444-555555555555",documentNo:"TST2026000000001"};
function fixture(kind:"E_FATURA"|"E_IRSALIYE"=q.kind,detail="Basariyla_Tamamlandi",status="Gonderildi"){
 const inv=kind==="E_FATURA",op=inv?"SearchInvoice":"SearchDespatchAdvice",list=inv?"Invoices":"DespatchAdvices",item=inv?"Invoice":"DespatchAdvice",num=inv?"InvoiceNumber":"DespatchAdviceNumber";
 return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://tempuri.org/" xmlns:m="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model"><s:Body><t:'+op+'Response><t:'+op+'Result><m:Result>Success</m:Result><m:'+list+'><m:'+item+'><m:DetailStatus>'+detail+'</m:DetailStatus><m:ETTN>'+q.ettn+'</m:ETTN><m:'+num+'>'+q.documentNo+'</m:'+num+'><m:Status>'+status+'</m:Status></m:'+item+'></m:'+list+'><m:PagingResponse><m:PageNumber>1</m:PageNumber><m:RecordsPerPage>1</m:RecordsPerPage><m:TotalNumberOfPages>1</m:TotalNumberOfPages><m:TotalNumberOfRecords>1</m:TotalNumberOfRecords></m:PagingResponse></t:'+op+'Result></t:'+op+'Response></s:Body></s:Envelope>';
}
test("only exact matching final status 1300 is a technical acceptance",async()=>{
 for(const kind of ["E_FATURA","E_IRSALIYE"] as const){const r=await parseVerifiedTestFinalStatus(fixture(kind),{...q,kind});assert.equal(r.state,"FINAL");assert.equal(r.code,1300);assert.match(r.responseEvidenceSha256||"",/^[a-f0-9]{64}$/);}
 for(const [detail,code] of [["Schematron_Kontrol_Sonucu_Hatali",1150],["Xml_Sema_Kontrolundan_Gecemedi",1160]] as const){const r=await parseVerifiedTestFinalStatus(fixture(q.kind,detail),q);assert.equal(r.state,"VALIDATION_ERROR");assert.equal(r.code,code);}
 assert.equal((await parseVerifiedTestFinalStatus(fixture(q.kind,"Zarf_Basariyla_Islendi"),q)).state,"PENDING_OR_REVIEW");
 assert.equal((await parseVerifiedTestFinalStatus(fixture(q.kind,"Basariyla_Tamamlandi","Sistem_Hatasi"),q)).state,"PENDING_OR_REVIEW");
});
test("wrong document, duplicated status, bad pagination or namespace cannot grant final",async()=>{
 for(const xml of [fixture().replace(q.documentNo,"TST2026000000002"),fixture().replace(q.ettn,"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),fixture().replace("TotalNumberOfRecords>1","TotalNumberOfRecords>2"),fixture().replace("</m:DetailStatus>","</m:DetailStatus><m:DetailStatus>Basariyla_Tamamlandi</m:DetailStatus>"),fixture().replace("http://schemas.datacontract.org/2004/07/EInvoice.Service.Model","urn:wrong"),fixture("E_IRSALIYE"),"<!DOCTYPE x>"+fixture()])assert.equal((await parseVerifiedTestFinalStatus(xml,q)).state,"UNKNOWN_REVIEW_REQUIRED");
});
test("query uses outgoing TEST search, not submit; no redirect or retry",async()=>{
 let calls=0;
 const mock:typeof fetch=async(input,init)=>{calls++;assert.match(String(input),/^https:\/\/einvoiceservicetest\.isnet\.net\.tr\//);assert.equal(init?.redirect,"manual");assert.match(String(init?.body),/SearchInvoice/);assert.match(String(init?.body),/Outgoing/);assert.doesNotMatch(String(init?.body),/SendInvoice/);return new Response(null,{status:302,headers:{Location:"https://example.invalid"}});};
 assert.equal((await queryVerifiedTestFinalStatus(q,mock)).state,"UNKNOWN_REVIEW_REQUIRED");assert.equal(calls,1);
});
