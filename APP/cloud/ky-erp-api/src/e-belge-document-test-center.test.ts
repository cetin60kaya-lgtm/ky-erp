import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {defaultAdapterProfile,normalizeAdapterProfile} from "./e-belge-adapter-profile-core.ts";
import {isTestType,queryIsnetDocumentTest} from "./isnet-document-test-core.ts";

test("Firma profili tüm kayıtlı entegratörler için aynı şemayı kullanır",()=>{
 for(const key of ["ISNET","MANUAL","LOGO","MIKRO","PARASUT"]){
  const p=defaultAdapterProfile(key);
  assert.equal(p?.key,key);
  const changed=normalizeAdapterProfile(key,{...p,displayName:key+" şirket servisi",defaultDays:14,
   workflow:"MANUAL_REVIEW",output:"PDF",fileNamePattern:"{direction}-{type}-{date}"});
  assert.equal(changed.defaultDays,14);
  assert.equal(changed.output,"PDF");
 }
 assert.equal(defaultAdapterProfile("UNKNOWN"),null);
});
test("Şüpheli link, token, program kodu, yerel IP ve yetkisiz İşNet hostu engellenir",()=>{
 const baseline=defaultAdapterProfile("ISNET");
 assert.ok(baseline);
 const bad=[
  {serviceUrl:"http://einvoiceapi.isnet.net.tr"},
  {serviceUrl:"https://localhost"},
  {serviceUrl:"https://127.0.0.1"},
  {serviceUrl:"https://example.com"},
  {serviceUrl:"https://user:pass@einvoiceapi.isnet.net.tr"},
  {serviceUrl:"https://einvoiceapi.isnet.net.tr:443"},
  {serviceUrl:"https://einvoiceapi.isnet.net.tr/?token=test"},
  {fileNamePattern:"../../{number}"},
  {fileNamePattern:"{unknown}"},
  {defaultDays:100},
  {workflow:"EXECUTE_SCRIPT"}
 ];
 for(const fields of bad)assert.throws(()=>normalizeAdapterProfile("ISNET",{...baseline,...fields}));
 assert.throws(()=>normalizeAdapterProfile("MANUAL",{...defaultAdapterProfile("MANUAL"),serviceUrl:"https://example.com"}));
 const route=readFileSync(new URL("./e-belge-adapter-profile-routes.ts",import.meta.url),"utf8");
 assert.match(route,/accountingTenantCandidates/);
 assert.match(route,/accountingTenantReadAllowed/);
 assert.match(route,/UNSUPPORTED_FIELD/);
 assert.match(route,/ON CONFLICT\(id\)/);
 assert.doesNotMatch(route,/eval\(|new Function|fetch\(/);
});
test("Gelen/giden dört belge türü yalnız belgelenmiş liste endpointlerine gider",async()=>{
 const defs=[
  ["incoming-invoice","GetIncomingEInvoiceList","Invoices"],
  ["outgoing-invoice","GetSentStagingInvoiceList","Invoices"],
  ["incoming-despatch","GetIncomingDespatchList","Despatches"],
  ["outgoing-despatch","GetSentStagingDespatchList","Despatches"]
 ];
 for(const [type,segment,list] of defs){
  assert.equal(isTestType(type),true);
  const fake=(async(url:string,options:RequestInit)=>{
   assert.equal(options.method,"POST");
   assert.ok(url.startsWith("https://einvoiceapi.isnet.net.tr/api/Invoice/"));
   assert.ok(url.endsWith(segment));
   const payload=JSON.parse(String(options.body));
   assert.equal(payload.CompanyId,17);
   assert.equal(payload.PageSize,25);
   assert.equal(new Headers(options.headers).get("Authorization"),"Bearer synthetic-token");
   return Response.json({Result:0,[list]:[{
    InvoiceNumber:"OUT-1",InvoiceDate:"2026-11-15",DespatchNumber:"DES-1",DespatchDate:"2026-11-14",
    Ettn:"12345678-1234-1234-1234-123456789012",Status:"Accepted"
   }]});
  }) as typeof fetch;
  const r=await queryIsnetDocumentTest(fake,"synthetic-token",17,type as never,"2026-11-01","2026-11-15");
  assert.equal(r.status,"VERIFIED_READ_ONLY");
  assert.equal(r.firstPageCount,1);
  assert.ok(r.items[0].number);
  assert.equal(r.coverage,type.startsWith("outgoing")?"SENT_STAGING_ONLY":"PROVIDER_INCOMING");
  assert.equal(r.hasMore,false);
  assert.doesNotMatch(JSON.stringify(r),/synthetic-token/);
 }
});
test("İşNet 200 HTML ve 401 hiçbir zaman belge okundu sonucu vermez",async()=>{
 const html=(async()=>new Response("<html>LOGIN</html>",{status:200,headers:{"Content-Type":"text/html"}})) as typeof fetch;
 const result=await queryIsnetDocumentTest(html,"synthetic",17,"incoming-invoice","2026-11-01","2026-11-15");
 assert.equal(result.status,"UNVERIFIED_RESPONSE");
 const forbidden=(async()=>Response.json({}, {status:401})) as typeof fetch;
 const invalid=await queryIsnetDocumentTest(forbidden,"synthetic",17,"outgoing-despatch","2026-11-01","2026-11-15");
 assert.equal(invalid.status,"SESSION_INVALID");
 const api=readFileSync(new URL("./isnet-document-test-routes.ts",import.meta.url),"utf8");
 assert.match(api,/ISNET_API_SESSION_REQUIRED/);
 assert.match(api,/countIsFirstPageOnly:true/);
 assert.match(api,/accountingTenantReadAllowed/);
 assert.doesNotMatch(api,/\.run\(|FILES\.put|ingestProviderEBelgeXml/);
});
