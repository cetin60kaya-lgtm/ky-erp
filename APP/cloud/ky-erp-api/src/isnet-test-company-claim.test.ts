import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {buildTestCompanyRequest,parseTestCompanyResponse,queryTestCompany} from "./isnet-test-company.ts";
import {makeTestSendJournal} from "./isnet-test-send-journal.ts";
import type {Draft,Profile,Approval} from "./isnet-official-acceptance.ts";
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,"0")).join("");
const xml='<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://tempuri.org/" xmlns:m="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model"><s:Body><t:GetCompanyResponse><t:GetCompanyResult><m:Result>Success</m:Result><m:VknTckn>0000000000</m:VknTckn><m:FaturaKesebilir>true</m:FaturaKesebilir><m:EIrsaliyeEkleyebilir>false</m:EIrsaliyeEkleyebilir><m:Seri>ABC</m:Seri></t:GetCompanyResult></t:GetCompanyResponse></s:Body></s:Envelope>';
test("GetCompany response binds actual company, permissions and series, no raw company data",async()=>{
 const h=await sha("0000000000"),r=await parseTestCompanyResponse(xml,h);
 assert.equal(r.invoiceAllowed,true);assert.equal(r.invoiceSeries,"ABC");assert.equal(r.dispatchAllowed,false);assert.equal(r.dispatchSeries,null);assert.equal(r.companyTaxSha256,h);assert.equal(JSON.stringify(r).includes("0000000000"),false);
 const req=buildTestCompanyRequest("0000000000");assert.match(req.headers.SOAPAction,/GetCompany/);assert.doesNotMatch(req.body,/SendInvoice|SendDespatch/);
 await assert.rejects(()=>parseTestCompanyResponse(xml,"a".repeat(64)));
 await assert.rejects(()=>parseTestCompanyResponse(xml.replace("Success","Failed"),h));
 await assert.rejects(()=>parseTestCompanyResponse(xml.replace("true","unknown"),h));
 let calls=0;await assert.rejects(()=>queryTestCompany("0000000000",async()=>{calls++;return new Response(xml)}),/TEST_COMPANY_NOT_ALLOWED/);assert.equal(calls,0);
});
class DB{
 sql=new DatabaseSync(":memory:");
 constructor(){this.sql.exec("CREATE TABLE json_store (id TEXT PRIMARY KEY,scope TEXT,main_company_slug TEXT,file_name TEXT,data TEXT,created_at TEXT,updated_at TEXT)");}
 prepare(sql:string){return{bind:(...args:any[])=>({run:async()=>({meta:{changes:this.sql.prepare(sql).run(...args).changes}})})};}
}
const draft=(tenant="A",id="draft-1"):Draft=>({tenant,environment:"TEST",kind:"E_FATURA",direction:"OUTGOING",id,version:"1",ettn:"11111111-2222-3333-4444-555555555555",contentSha256:"a".repeat(64),status:"APPROVED"});
function ctx(db:DB,d:Draft){
 const endpoint="https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc";
 const p:Profile={tenant:d.tenant,environment:"TEST",contractRevision:"fixture",endpoint,reviewedEndpoints:[endpoint],credentialRef:"fixture",enabled:true,companyVerified:true,evidence:[{tenant:d.tenant,environment:"TEST",contractRevision:"fixture",companyVerified:true,providerVerified:true,evidenceId:"fixture",operation:"document.submit",kind:"E_FATURA",direction:"OUTGOING"}]};
 const a:Approval={tenant:d.tenant,environment:"TEST",draftId:d.id,ettn:d.ettn,contentSha256:d.contentSha256,version:d.version,userId:"fixture",approvedAt:new Date().toISOString(),explicit:true};
 const journal=makeTestSendJournal(db,p,d,a),input={tenant:d.tenant,environment:"TEST",draftId:d.id,version:d.version,ettn:d.ettn,contentSha256:d.contentSha256,expectedStatus:"APPROVED"};
 return {journal,input};
}
test("100 simultaneous reservations, duplicate ETTN across tenants, unknown outcome and settlement CAS",async()=>{
 const db=new DB(),d=draft(),{journal,input}=ctx(db,d);
 const claims=await Promise.all(Array.from({length:100},()=>journal.claim(input)));
 assert.equal(claims.filter(Boolean).length,1);
 const second=ctx(db,draft("B","draft-2"));assert.equal(await second.journal.claim(second.input),null);
 const claimId=claims.find(Boolean)!;
 const settled={claimId,tenant:d.tenant,draftId:d.id,version:d.version,ettn:d.ettn,status:"UNKNOWN_REVIEW_REQUIRED",providerResult:null};
 await journal.settle(settled);
 await assert.rejects(()=>journal.settle(settled),/SEND_SETTLE_CONFLICT/);
 assert.equal(await journal.claim(input),null);
 const row=db.sql.prepare("SELECT data FROM json_store").get() as {data:string};
 assert.equal(JSON.parse(row.data).status,"UNKNOWN_REVIEW_REQUIRED");
});
test("acceptance stores ETTN-bound evidence; false final and wrong tenant cannot settle",async()=>{
 const db=new DB(),d=draft(),{journal,input}=ctx(db,d);
 const claimId=(await journal.claim(input))!;
 const providerResult={transport:"RESPONSE" as const,explicitAcceptance:true,ettn:d.ettn,documentNo:"TST2026000000001",responseEvidenceSha256:"b".repeat(64),finalStatusVerified:true};
 const r={claimId,tenant:d.tenant,draftId:d.id,version:d.version,ettn:d.ettn,status:"PROVIDER_ACCEPTED",providerResult};
 await assert.rejects(()=>journal.settle({...r,status:"FINAL"}),/SEND_SETTLE_STATUS/);
 await assert.rejects(()=>journal.settle({...r,tenant:"B"}),/SEND_SETTLE_IDENTITY/);
 await journal.settle(r);
 const row=db.sql.prepare("SELECT data FROM json_store").get() as {data:string};
 assert.equal(JSON.parse(row.data).status,"PROVIDER_ACCEPTED");
 assert.equal(JSON.parse(row.data).documentNo,"TST2026000000001");
});
