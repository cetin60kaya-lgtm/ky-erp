import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {buildProviderNumberedTestEnvelope,parseProviderNumberedTestResponse,requireProviderUnsignedStructure,classifyProviderNumberedTestResult,PROVIDER_NUMBERING} from "./isnet-soap-provider-numbering.ts";
import {makeTestSendJournal} from "./isnet-test-send-journal.ts";
import type {Profile,Draft,Approval} from "./isnet-official-acceptance.ts";
const local="11111111-2222-3333-4444-555555555555",assigned="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model",U="urn:oasis:names:specification:ubl:schema:xsd:";
const response=(inv:boolean,ettn=assigned,result="Success")=>{
 const op=inv?"SendInvoiceXmlWithoutInvoiceNumber":"SendDespatchAdviceXmlWithoutDespatchAdviceNumber",list=inv?"Invoices":"DespatchAdvices",item=inv?"InvoiceReturn":"DespatchAdviceReturn",num=inv?"InvoiceNumber":"DespatchAdviceNumber";
 return '<s:Envelope xmlns:s="'+S+'" xmlns:t="'+T+'" xmlns:m="'+M+'"><s:Body><t:'+op+'Response><t:'+op+'Result><m:Result>'+result+'</m:Result><m:'+list+'><m:'+item+'><m:Ettn>'+ettn+'</m:Ettn><m:'+num+'>TST2026000000001</m:'+num+'></m:'+item+'></m:'+list+'></t:'+op+'Result></t:'+op+'Response></s:Body></s:Envelope>';
};
const draft:Draft={tenant:"fixture",environment:"TEST",kind:"E_FATURA",direction:"OUTGOING",id:"one",version:"1",ettn:local,contentSha256:"a".repeat(64),status:"APPROVED"};
test("pinned numberless envelope and provider assigned ETTN, not final status",async()=>{
 for(const kind of ["E_FATURA","E_IRSALIYE"] as const){
  const inv=kind==="E_FATURA",op=inv?"SendInvoiceXmlWithoutInvoiceNumber":"SendDespatchAdviceXmlWithoutDespatchAdviceNumber",req=buildProviderNumberedTestEnvelope(kind,"QUJD","urn:mail:a&b");
  assert.equal(req.headers.SOAPAction,'"'+T+'IInvoiceService/'+op+'"');
  assert.ok(req.body.indexOf("Content>QUJD")<req.body.indexOf("<m:ReceiverTag>"));assert.match(req.body,/a&amp;b/);assert.doesNotMatch(req.body,/CompanyVendorNumber/);
  const r=await parseProviderNumberedTestResponse(response(inv),kind);
  assert.equal(r.ettn,assigned);assert.equal(r.documentNo,"TST2026000000001");assert.notEqual(r.ettn,local);
  assert.equal(classifyProviderNumberedTestResult({...draft,kind,status:"SUBMITTING"},r),"PROVIDER_ACCEPTED");
  assert.equal(classifyProviderNumberedTestResult({...draft,kind,status:"SUBMITTING"},{...r,finalStatusVerified:true}),"PROVIDER_ACCEPTED");
  for(const bad of [response(inv,"invalid"),response(inv,assigned,"Failed"),response(!inv),response(inv).replace(M,"urn:wrong"),response(inv).replace("</m:Ettn>","</m:Ettn><m:Ettn>"+assigned+"</m:Ettn>")]){
   assert.equal(classifyProviderNumberedTestResult({...draft,kind,status:"SUBMITTING"},await parseProviderNumberedTestResponse(bad,kind)),"UNKNOWN_REVIEW_REQUIRED");
  }
 }
 assert.throws(()=>buildProviderNumberedTestEnvelope("E_FATURA","bad!","urn:mail:fixture"));
});
const bytes=(s:string)=>new TextEncoder().encode(s);
const input=(goods:string,extension="")=>'<DespatchAdvice xmlns="'+U+'DespatchAdvice-2" xmlns:b="'+U+'CommonBasicComponents-2" xmlns:a="'+U+'CommonAggregateComponents-2" xmlns:e="'+U+'CommonExtensionComponents-2"><e:UBLExtensions><e:UBLExtension><e:ExtensionContent>'+extension+'</e:ExtensionContent></e:UBLExtension></e:UBLExtensions><a:Signature><b:ID>0000000000</b:ID><a:DigitalSignatureAttachment><a:ExternalReference><b:URI>#Signature</b:URI></a:ExternalReference></a:DigitalSignatureAttachment></a:Signature><a:Shipment>'+goods+'<a:Delivery><a:Despatch><b:ActualDespatchDate>2026-11-26</b:ActualDespatchDate></a:Despatch></a:Delivery></a:Shipment></DespatchAdvice>';
test("provider requires empty signing extension and shipment GoodsItem ValueAmount",()=>{
 const g='<a:GoodsItem><b:ValueAmount currencyID="TRY">50000.00</b:ValueAmount></a:GoodsItem>';
 assert.doesNotThrow(()=>requireProviderUnsignedStructure(bytes(input(g)),"E_IRSALIYE"));
 assert.throws(()=>requireProviderUnsignedStructure(bytes(input("")),"E_IRSALIYE"),/PROVIDER_SHIPMENT_VALUE_REQUIRED/);
 assert.throws(()=>requireProviderUnsignedStructure(bytes(input(g,"<qa/>")),"E_IRSALIYE"),/PROVIDER_UNSIGNED_EXTENSION_REQUIRED/);
 assert.throws(()=>requireProviderUnsignedStructure(bytes(input(g.replace("50000.00","-1"))),"E_IRSALIYE"),/PROVIDER_SHIPMENT_VALUE_REQUIRED/);
});
class DB{
 sql=new DatabaseSync(":memory:");
 constructor(){this.sql.exec("CREATE TABLE json_store (id TEXT PRIMARY KEY,scope TEXT,main_company_slug TEXT,file_name TEXT,data TEXT,created_at TEXT,updated_at TEXT)");}
 prepare(s:string){return {bind:(...args:any[])=>({run:async()=>({meta:{changes:this.sql.prepare(s).run(...args).changes}})})};}
}
function context(db:DB,d:Draft,mode:"CLIENT_NUMBERED"|"PROVIDER_NUMBERED"=PROVIDER_NUMBERING){
 const endpoint="https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc";
 const p:Profile={tenant:d.tenant,environment:"TEST",contractRevision:"fixture",endpoint,reviewedEndpoints:[endpoint],credentialRef:"fixture",enabled:true,companyVerified:true,evidence:[{tenant:d.tenant,environment:"TEST",contractRevision:"fixture",companyVerified:true,providerVerified:true,evidenceId:"fixture",operation:"document.submit",kind:d.kind,direction:"OUTGOING"}]};
 const approval:Approval={tenant:d.tenant,environment:"TEST",draftId:d.id,ettn:d.ettn,contentSha256:d.contentSha256,version:d.version,userId:"fixture",approvedAt:new Date().toISOString(),explicit:true};
 const journal=makeTestSendJournal(db,p,d,approval,mode);
 const input={tenant:d.tenant,environment:"TEST",draftId:d.id,version:d.version,ettn:d.ettn,contentSha256:d.contentSha256,expectedStatus:"APPROVED",numberingMode:mode};
 return {journal,input};
}
test("immutable local ETTN, separate provider ETTN, cross-mode duplicate protection",async()=>{
 const db=new DB(),c=context(db,draft),claimId=(await c.journal.claim(c.input))!;
 assert.ok(claimId);assert.equal(await c.journal.claim(c.input),null);
 const r=await parseProviderNumberedTestResponse(response(true),"E_FATURA");
 const settled={claimId,tenant:draft.tenant,draftId:draft.id,version:draft.version,ettn:draft.ettn,status:"PROVIDER_ACCEPTED",providerResult:r,numberingMode:PROVIDER_NUMBERING};
 await assert.rejects(()=>c.journal.settle({...settled,status:"FINAL"}),/SEND_SETTLE_STATUS/);
 await c.journal.settle(settled);
 const x=JSON.parse((db.sql.prepare("SELECT data FROM json_store").get() as {data:string}).data);
 assert.equal(x.ettn,local);assert.equal(x.providerEttn,assigned);assert.equal(x.status,"PROVIDER_ACCEPTED");
 const other=context(db,{...draft,id:"another",tenant:"other",ettn:assigned},"CLIENT_NUMBERED");
 assert.equal(await other.journal.claim(other.input),null);
 await assert.rejects(()=>c.journal.settle(settled),/SEND_SETTLE_CONFLICT/);
});
