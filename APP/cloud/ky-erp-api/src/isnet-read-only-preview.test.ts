import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {probeIsnetReadOnlyLists,fetchOneIsnetXmlReadOnly} from "./isnet-read-only-probe.ts";

test("İşNet resmî API gelen belge kontrolü yalnız ilk sayfa sayısını döndürür",async()=>{
 const calls: Array<{url:string;body:Record<string,any>}>=[];
 const fake=(async (url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body));
  calls.push({url,body});
  assert.equal(init.method,"POST");
  assert.equal(new Headers(init.headers).get("Authorization"),"Bearer private-test-placeholder");
  return Response.json(url.includes("GetIncomingDespatchList")
   ?{Result:0,Despatches:[{Ettn:"PRIVATE_SHOULD_NOT_LEAK"}]}
   :{Result:0,Invoices:[{Ettn:"PRIVATE_SHOULD_NOT_LEAK"},{Ettn:"OTHER"}]});
 }) as typeof fetch;
 const v=await probeIsnetReadOnlyLists(fake,"private-test-placeholder",7,"2026-11-01","2026-11-08");
 assert.equal(v.verified,true);
 assert.equal(v.results.incomingInvoices.firstPageCount,2);
 assert.equal(v.results.incomingDespatches.firstPageCount,1);
 assert.doesNotMatch(JSON.stringify(v),/PRIVATE_SHOULD_NOT_LEAK|Bearer|OTHER/);
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.body.CompanyId===7&&x.body.PageSize===25&&x.url.startsWith("https://einvoiceapi.isnet.net.tr/")));
});

test("İşNet API ret veya HTML 200 asla canlı oturum başarısı sayılmaz",async()=>{
 const fake=(async (url:string)=>url.includes("GetIncomingDespatchList")
  ?new Response("<html>login</html>",{status:200,headers:{"content-type":"text/html"}})
  :Response.json({ErrorMessage:"not authorized"}, {status:401})) as typeof fetch;
 const v=await probeIsnetReadOnlyLists(fake,"fake",1,"2026-11-01","2026-11-08");
 assert.equal(v.verified,false);
 assert.equal(v.results.incomingInvoices.status,"SESSION_INVALID");
 assert.equal(v.results.incomingDespatches.firstPageCount,null);
});

const sampleEttn="12345678-1234-1234-1234-123456789012";
const sampleInvoice='<?xml version="1.0" encoding="utf-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>TEST-XML-1</ID></Invoice>';
const sampleDespatch='<?xml version="1.0" encoding="utf-8"?><DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"><ID>TEST-XML-2</ID></DespatchAdvice>';

test("İşNet gelen fatura/irsaliye ETTN ile yalnız bir gerçek UBL XML örneğini indirir",async()=>{
 for(const kind of ["invoice","despatch"] as const){
  const hits:string[]=[];
  const fake=(async(url:string,init:RequestInit)=>{
   hits.push(url);
   if(url.endsWith("GetIncomingEInvoiceList")||url.endsWith("GetIncomingDespatchList")){
    const b=JSON.parse(String(init.body));
    assert.equal(b.CompanyId,42);
    return Response.json({Result:0,Invoices:[{Ettn:sampleEttn}],Despatches:[{Ettn:sampleEttn}]});
   }
   if(url.endsWith("GetInvoiceExternalXmlUrl")){
    const body=JSON.parse(String(init.body));
    assert.equal(body.Ettn,sampleEttn);
    assert.equal(body.InvoiceDirection,1);
    assert.equal(body.InvoiceDocumentType,kind==="invoice"?1:4);
    return Response.json({Result:0,ExternalLink:"https://files.isnet.net.tr/download/sample.xml"});
   }
   assert.equal(url,"https://files.isnet.net.tr/download/sample.xml");
   assert.equal(init.method,"GET");
   return new Response(kind==="invoice"?sampleInvoice:sampleDespatch,{headers:{"content-type":"application/xml"}});
  }) as typeof fetch;
  const result=await fetchOneIsnetXmlReadOnly(fake,"synthetic-test-token",42,kind,"2026-11-01","2026-11-08");
  assert.equal(result.kind,kind);
  assert.match(new TextDecoder().decode(result.bytes),kind==="invoice"?/<Invoice /:/<DespatchAdvice /);
  assert.equal(hits.length,3);
 }
});
test("İşNet örnek XML doğrulaması harici host/HTML 200 yanıtını kesinlikle indirmez",async()=>{
 const fake=(async(url:string)=>{
  if(url.endsWith("GetIncomingEInvoiceList"))return Response.json({Result:0,Invoices:[{Ettn:sampleEttn}]});
  if(url.endsWith("GetInvoiceExternalXmlUrl"))return Response.json({Result:0,ExternalLink:"https://evil.example/steal.xml"});
  throw new Error("Harici adrese gidilmemeli.");
 }) as typeof fetch;
 await assert.rejects(
  fetchOneIsnetXmlReadOnly(fake,"synthetic",42,"invoice","2026-11-01","2026-11-08"),
  /ISNET_XML_URL_NOT_ALLOWLISTED/,
 );
 const failHtml=(async(url:string)=>{
  if(url.endsWith("GetIncomingEInvoiceList"))return Response.json({Result:0,Invoices:[{Ettn:sampleEttn}]});
  if(url.endsWith("GetInvoiceExternalXmlUrl"))return Response.json({Result:0,ExternalLink:"https://files.isnet.net.tr/download/sample.xml"});
  return new Response("<html>Login</html>",{headers:{"content-type":"text/html"}});
 }) as typeof fetch;
 await assert.rejects(
  fetchOneIsnetXmlReadOnly(failHtml,"synthetic",42,"invoice","2026-11-01","2026-11-08"),
  /ISNET_XML_NON_XML_RESPONSE/,
 );
});
test("Salt okunur XML endpointi tenant/rol ve kayıtlı API gerektirir, D1/R2 yazmaz",()=>{
 const route=readFileSync(new URL("./isnet-read-only-xml-download.ts",import.meta.url),"utf8");
 const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
 assert.match(route,/accountingTenantReadAllowed/);
 assert.match(route,/accountingAccess/);
 assert.match(route,/accountingTenantCandidates/);
 assert.match(route,/ISNET_API_SESSION_REQUIRED/);
 assert.match(route,/ISNET_ADAPTER_INACTIVE/);
 assert.match(route,/Cache-Control/);
 assert.match(main,/registerIsnetReadOnlyXmlDownloadRoutes\(app\)/);
 assert.doesNotMatch(route,/\.put\(|\.run\(|\.delete\(|\/send|ingestProviderEBelgeXml/);
});
