import test from "node:test";
import assert from "node:assert/strict";
import {listIsnetDocumentsReadOnly,downloadIsnetPdfReadOnly} from "./isnet-api-live-acceptance.ts";

const ETTN="11111111-2222-3333-4444-555555555555";
const START="2026-11-16",END="2026-11-23";
const json=(o:any,status=200)=>new Response(JSON.stringify(o),{
 status,headers:{"content-type":"application/json"}
});
const despatch={Ettn:ETTN,DespatchNumber:"QA2026000000001",
 DespatchDate:"2026-11-22",RecipientCompanyName:"TEST COMPANY",Status:"SENT"};
const invoice={Ettn:ETTN,InvoiceNumber:"QA2026000000002",
 InvoiceDate:"2026-11-22",RecipientCompanyName:"TEST COMPANY",Status:"SENT"};
const listPath=(kind:string,direction:string)=>kind==="invoice"
 ?direction==="incoming"?"GetIncomingEInvoiceList":"GetSentStagingInvoiceList"
 :direction==="incoming"?"GetIncomingDespatchList":"GetSentStagingDespatchList";
test("dört yönün her biri resmî İşNet listesiyle sadece 1. sayfayı okur",async()=>{
 for(const kind of ["invoice","despatch"] as const){
  for(const direction of ["incoming","outgoing"] as const){
   const calls:string[]=[];
   const fetcher=async(url:any,opts:any)=>{
    calls.push(String(url));assert.equal(opts.method,"POST");
    assert.equal(opts.redirect,"manual");
    assert.ok(String(url).endsWith(listPath(kind,direction)));
    assert.deepEqual(Object.keys(JSON.parse(opts.body)).includes("CompanyId"),true);
    return json(kind==="invoice"?{Result:0,Invoices:[invoice]}:{Result:0,Despatches:[despatch]});
   };
   const result=await listIsnetDocumentsReadOnly(fetcher as any,"MOCK_TOKEN",17,kind,direction,START,END);
   assert.equal(result.rows.length,1);
   assert.equal(result.rows[0].ettn,ETTN);
   assert.equal(result.readOnly,true);
   assert.equal(calls.length,1);
   assert.doesNotMatch(JSON.stringify(result),/MOCK_TOKEN|CompanyId|accessToken/);
  }
 }
});
test("gerçek PDF imzası ile sınırlı, tıklanan belgeye özel indirme",async()=>{
 const seen:string[]=[];
 const fetcher=async(url:any)=>{
  const target=String(url);seen.push(target);
  if(target.endsWith("/GetIncomingDespatchList"))
   return json({Result:0,Despatches:[despatch]});
  if(target.endsWith("/GetInvoiceExternalUrl"))
   return json({Result:0,ExternalLink:"https://files.isnet.net.tr/qa/test.pdf"});
  if(target==="https://files.isnet.net.tr/qa/test.pdf")
   return new Response(new TextEncoder().encode("%PDF-1.7 MOCK PDF DATA"),{
    status:200,headers:{"content-type":"application/pdf"}});
  throw Error("unexpected call");
 };
 const data=await downloadIsnetPdfReadOnly(fetcher as any,"MOCK_TOKEN",17,"despatch","incoming",START,END,ETTN);
 assert.equal(new TextDecoder().decode(data).startsWith("%PDF-"),true);
 assert.equal(seen.length,3);
 assert.ok(!seen.some(x=>/Send|Approve|Save|Submit/.test(x)));
});
test("HTML pdf diye indirilemez",async()=>{
 const fetcher=async(url:any)=>{
  const u=String(url);
  if(u.endsWith("/GetIncomingDespatchList"))return json({Result:0,Despatches:[despatch]});
  if(u.endsWith("/GetInvoiceExternalUrl"))
   return json({Result:0,ExternalLink:"https://files.isnet.net.tr/qa/notpdf"});
  return new Response("<html>not PDF</html>",{status:200,headers:{"content-type":"text/html"}});
 };
 await assert.rejects(downloadIsnetPdfReadOnly(fetcher as any,"MOCK",17,"despatch","incoming",START,END,ETTN),/ISNET_PROVIDER_DID_NOT_RETURN_PDF/);
});
test("yanlış belge kimliği ve İşNet dışı URL izin dışı kalır",async()=>{
 let calls=0;
 const fetcher=async(url:any)=>{
  calls++;
  if(String(url).endsWith("GetIncomingDespatchList"))return json({Result:0,Despatches:[despatch]});
  return json({Result:0,ExternalLink:"https://evil.example.com/not-allowed.pdf"});
 };
 await assert.rejects(downloadIsnetPdfReadOnly(fetcher as any,"MOCK",17,"despatch","incoming",START,END,
 "11111111-2222-3333-4444-999999999999"),/ISNET_DOCUMENT_NOT_ON_PAGE/);
 assert.equal(calls,1);
 await assert.rejects(downloadIsnetPdfReadOnly(fetcher as any,"MOCK",17,"despatch","incoming",START,END,ETTN),
 /ISNET_DOCUMENT_URL_NOT_ALLOWLISTED/);
 assert.equal(calls,3);
});
test("API 401 yetki hatası başarı değildir; şifre ve token loglanmaz",async()=>{
 const fetcher=async()=>json({},401);
 await assert.rejects(listIsnetDocumentsReadOnly(fetcher as any,"MOCK_TOKEN",17,"despatch","incoming",START,END),
  /ISNET_API_SESSION_INVALID/);
});
