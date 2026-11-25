import test from "node:test";import assert from "node:assert/strict";import {buildEnvelope,submitVerifiedSoapTest,verifiedTestSendBinding} from "./isnet-soap-send-engine.ts";
const q=(local:string,ns="urn:fixture")=>({local,ns});const binding={"environment":"TEST","verified":true,"contractHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","endpoint":"https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc","operation":"SendInvoiceXml","soapVersion":"1.1","action":"https://example.invalid/fixture","operationElement":{"local":"SendInvoiceXml","ns":"urn:fixture"},"requestElement":{"local":"request","ns":"urn:fixture"},"listElement":{"local":"Invoices","ns":"urn:fixture"},"itemElement":{"local":"InvoiceXml","ns":"urn:fixture"},"receiverElement":{"local":"ReceiverTag","ns":"urn:fixture"},"contentElement":{"local":"InvoiceContent","ns":"urn:fixture"}};
test("verified TEST binding builds XML bytes payload; no guessed action",()=>{const req=buildEnvelope(binding,"QUJD","urn:mail:a&b","E_FATURA");assert.match(req.body,/a&amp;b/);assert.match(req.body,/InvoiceContent/);assert.equal(req.headers.SOAPAction,'"https://example.invalid/fixture"');});
test("unverified binding, wrong host, wrong kind or bad bytes fail closed",()=>{assert.throws(()=>buildEnvelope({...binding,verified:false},"QUJD","x","E_FATURA"));assert.throws(()=>buildEnvelope({...binding,endpoint:"https://example.invalid"},"QUJD","x","E_FATURA"));assert.throws(()=>buildEnvelope(binding,"QUJD","x","E_IRSALIYE"));assert.throws(()=>buildEnvelope(binding,"bad!","x","E_FATURA"));assert.throws(()=>buildEnvelope({...binding,contentElement:q("Wrong")},"QUJD","x","E_FATURA"));});

 test("Worker manual redirect is not followed and unknown outcome is settled",async()=>{
 const tenant="fixture",ettn="11111111-1111-1111-1111-111111111111",version="v1";const base64="QUJD";const contentSha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("ABC"))),n=>n.toString(16).padStart(2,"0")).join("");
 const profile={tenant,environment:"TEST",contractRevision:"fixture",endpoint:binding.endpoint,reviewedEndpoints:[binding.endpoint],credentialRef:"fixture",companyVerified:true,enabled:true,evidence:[{tenant,environment:"TEST",contractRevision:"fixture",companyVerified:true,providerVerified:true,evidenceId:"fixture",operation:"document.submit",kind:"E_FATURA",direction:"OUTGOING"}]};
 const draft={tenant,environment:"TEST",kind:"E_FATURA",direction:"OUTGOING",id:"d",ettn,contentSha256,version,status:"APPROVED"};
 const approval={tenant,environment:"TEST",draftId:"d",ettn,contentSha256,version,userId:"fixture",approvedAt:new Date().toISOString(),explicit:true};let calls=0,settled="";
 const result=await submitVerifiedSoapTest({profile,draft,approval,binding,validatedXml:{verified:true,schemaVerified:true,schematronVerified:true,ettn,sha256:contentSha256,contractHash:binding.contractHash,base64,receiverTag:"fixture"},claim:async()=>"claim",settle:async(v:{status:string})=>{settled=v.status;},parseResult:()=>{throw Error("redirect must not be parsed");},fetcher:async(_url,init)=>{calls++;assert.equal(init?.redirect,"manual");return new Response(null,{status:302,headers:{Location:"https://example.invalid/"}});}});
 assert.equal(calls,1);assert.equal(result.status,"UNKNOWN_REVIEW_REQUIRED");assert.equal(settled,"UNKNOWN_REVIEW_REQUIRED");
 });

 test("supplied singleWsdl exact SOAP 1.1 action, namespace and sequence for both documents",()=>{
 for(const [kind,operation,content] of [["E_FATURA","SendInvoiceXml","InvoiceContent"],["E_IRSALIYE","SendDespatchAdviceXml","DespatchAdviceContent"]]){
 const b=verifiedTestSendBinding(kind),r=buildEnvelope(b,"QUJD","urn:mail:fixture",kind);
 assert.equal(r.headers.SOAPAction,'"http://tempuri.org/IInvoiceService/'+operation+'"');
 assert.equal(b.contractHash,"d728e3eea7c05acb1c5ca2db85ec6741e9eff9aa19880d358f02e87a35aca67e");
 assert.ok(r.body.indexOf("<"+content+" ")>=0);assert.ok(r.body.indexOf("<"+content+" ")<r.body.indexOf("<ReceiverTag "));assert.match(r.body,/http:\/\/schemas.datacontract.org\/2004\/07\/EInvoice.Service.Model/);
 assert.throws(()=>buildEnvelope({...b,operation:operation.toUpperCase()},"QUJD","urn:mail:fixture",kind));
 }
 });
