import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {retiredIsnetMutation} from "./isnet-retired-mutations.ts";
const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
const guard=readFileSync(new URL("./isnet-tenant-guard.ts",import.meta.url),"utf8");
const activation=readFileSync(new URL("./isnet-adapter-activation-guard.ts",import.meta.url),"utf8");
test("old invoice and despatch writes blocked; historical reads and intake preserved",()=>{
 for(const path of ["/api/isnet/invoice-preparation/dispatches/d/draft","/api/isnet/invoice-drafts/d/submit","/api/isnet/drafts/d/submit","/api/isnet/drafts/invoice","/api/isnet/dispatches/d/create-invoice","/api/isnet/source-workflow/d/outgoing-dispatch","/api/isnet/source-intakes/d/quantities","/api/isnet/source-intakes/d/outgoing-dispatch/x/complete","/api/isnet/auto-flows/d/outgoing-draft","/api/isnet/auto-flows/d/invoice-state","/api/isnet/documents/d/complete"]){
  assert.equal(retiredIsnetMutation(path,"POST"),true,path);
  assert.equal(retiredIsnetMutation(path+"/","PATCH"),true,path);
  assert.equal(retiredIsnetMutation(path,"GET"),false,path);
 }
 for(const path of ["/api/isnet/local/intake","/api/isnet/settings/test","/api/isnet/full-sync","/api/isnet/office/heartbeat","/api/isnet/read-only-xml-download","/api/e-belge/operator-drafts"])assert.equal(retiredIsnetMutation(path,"POST"),false,path);
 assert.match(main,/retiredIsnetMutation\(c.req.path,c.req.method\)\?c.json\(retiredIsnetResponse,410\)/);
});
test("native office heartbeat is exempt only at its exact route; independent machine auth",()=>{
 assert.match(main,/isOfficeHeartbeatRequest\(path, c.req.method\)/);
 assert.match(guard,/isOfficeHeartbeatRequest\(c.req.path,c.req.method\)/);
 assert.match(activation,/isOfficeHeartbeatRequest\(path,method\)/);
 const routes=readFileSync(new URL("./isnet-office-routes.ts",import.meta.url),"utf8");
 assert.match(routes,/path===OFFICE_HEARTBEAT_PATH&&method==="POST"/);
 assert.match(routes,/enabled.selected.ISNET!==true\|\|enabled.enabled.ISNET!==true/);
 assert.match(routes,/providerAuthorized:false,sendEnabled:false/);
});
test("legacy readers no longer read global rows or use hardcoded company fallback",()=>{
 for(const name of ["isnet-cloud.ts","isnet-runtime-v2.ts","isnet-live-sync.ts","isnet-business-settings-cloud.ts","isnet-invoice-runtime.ts","isnet-file-runtime.ts","isnet-outgoing-recovery.ts"]){
  const code=readFileSync(new URL("./"+name,import.meta.url),"utf8");
  assert.doesNotMatch(code,/\bOR main_company_slug IS NULL\b/,name);
  assert.match(code,/scopedIsnetTenant\(c\)/,name);
 }
});
