import test from "node:test";
import assert from "node:assert/strict";
import {probeIsnetReadOnlyLists} from "./isnet-read-only-preview";

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
