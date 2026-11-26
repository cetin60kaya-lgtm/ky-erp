import test from "node:test";
import assert from "node:assert/strict";
import {parseVerifiedTestSendResponse} from "./isnet-soap-response.ts";
import {classifySendResult,type Draft} from "./isnet-official-acceptance.ts";
const ettn="11111111-2222-3333-4444-555555555555";
const model="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
const fixture=(kind:"E_FATURA"|"E_IRSALIYE",result="Success",id=ettn,number="TST2026000000001")=>{
 const inv=kind==="E_FATURA",op=inv?"SendInvoiceXml":"SendDespatchAdviceXml",list=inv?"Invoices":"DespatchAdvices",item=inv?"InvoiceReturn":"DespatchAdviceReturn",no=inv?"InvoiceNumber":"DespatchAdviceNumber";
 return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="'+model+'" xmlns:t="http://tempuri.org/"><s:Body><t:'+op+'Response><t:'+op+'Result><m:Result>'+result+'</m:Result><m:'+list+'><m:'+item+'><m:Ettn>'+id+'</m:Ettn><m:'+no+'>'+number+'</m:'+no+'></m:'+item+'></m:'+list+'></t:'+op+'Result></t:'+op+'Response></s:Body></s:Envelope>';
};
test("actual WSDL shape: one matching return, no invented provider receipt, never final on submission",async()=>{
 for(const kind of ["E_FATURA","E_IRSALIYE"] as const){
 const r=await parseVerifiedTestSendResponse(fixture(kind),kind,ettn);
 assert.equal(r.explicitAcceptance,true);assert.equal(r.ettn,ettn);assert.equal(r.documentNo,"TST2026000000001");assert.equal(r.receiptId,undefined);assert.match(r.responseEvidenceSha256||"",/^[a-f0-9]{64}$/);
 const d:Draft={tenant:"fixture",environment:"TEST",kind,direction:"OUTGOING",id:"d",version:"1",ettn,contentSha256:"a".repeat(64),status:"SUBMITTING"};
 assert.equal(classifySendResult(d,r),"PROVIDER_ACCEPTED");assert.notEqual(r.finalStatusVerified,true);
 }
});
test("ambiguous, failed, malformed and wrong identities never grant acceptance",async()=>{
 const valid=fixture("E_FATURA");
 for(const xml of [fixture("E_FATURA","Failed"),fixture("E_FATURA","Success","aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),fixture("E_FATURA","Success",ettn,"INVALID"),fixture("E_IRSALIYE"),valid.replace(model,"urn:wrong"),valid.replace("<m:Result>Success</m:Result>","<m:Result>Success</m:Result><m:Result>Success</m:Result>"),valid.replace("</s:Body>","<s:Fault/></s:Body>"),valid.replace("</m:Invoices>","<m:InvoiceReturn/></m:Invoices>"),"<!DOCTYPE x>"+valid,"<broken"]){
 const r=await parseVerifiedTestSendResponse(xml,"E_FATURA",ettn);assert.equal(r.explicitAcceptance,undefined);assert.equal(r.explicitRejection,undefined);
 }
});
