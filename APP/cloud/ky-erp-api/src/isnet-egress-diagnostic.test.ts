import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { measureIsnetWorkerEgress } from "./isnet-egress-diagnostic.ts";
test("İşNet Worker egress yalnız sabit üç public GET hedefini kontrol eder",async()=>{
 const urls:string[]=[];
 const token="SYNTHETIC_TEST_ONLY_VALUE";
 const form='<form><input name="VknTckn"><input name="__RequestVerificationToken" value="'+token+'"></form>';
 const fake=async (url:any, options:any)=>{
   urls.push(String(url));
   assert.equal(options.method,"GET");
   assert.equal(options.redirect,"manual");
   assert.equal(options.body,undefined);
   assert.equal(options.headers.Cookie,undefined);
   if(String(url).includes("nettefatura")) throw Object.assign(new Error("simulated timeout"),{name:"AbortError"});
   return new Response(String(url).includes("einvoiceapi")?"<html>Help</html>":form,{status:200});
 };
 const result=await measureIsnetWorkerEgress(fake as any);
 assert.deepEqual(urls.sort(),[
  "https://nettefatura.isnet.net.tr/Account/Login",
  "https://efatura.isnet.net.tr/Account/Login",
  "https://einvoiceapi.isnet.net.tr/Help",
 ].sort());
 assert.equal(result.nettefatura.status,"TIMEOUT");
 assert.equal(result.efatura.status,"READY");
 assert.equal(result.einvoiceapi.status,"READY");
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_TEST_ONLY_VALUE|VknTckn|Cookie|Password/i);
});
test("Şifresiz tanılama sadece tek public URL için ve cache'li",()=>{
 const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
 const api=readFileSync(new URL("./index.ts",import.meta.url),"utf8");
 assert.match(main,/path === "\/api\/health\/isnet-egress"/);
 assert.match(api,/app\.get\("\/api\/health\/isnet-egress"/);
 assert.match(api,/cache\?\.match/);
 assert.match(api,/cache\?\.put/);
 assert.match(api,/max-age=300/);
 const segment=api.slice(api.indexOf('app.get("/api/health/isnet-egress"'),api.indexOf('app.get("/api/health/db"'));
 assert.doesNotMatch(segment,/Authorization|Cookie:|password|c\.req\.query/i);
});
