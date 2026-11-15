import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accountingTenantCandidates } from "./accounting-access-policy.ts";
import { EBELGE_ADAPTERS,getEBELGEAdapter,classifyAdapterInstallation,decodeEBelgeSelections } from "./e-belge-adapter-registry.ts";
test("Katalog ile firmada seçilen adaptör ayrıdır ve hazır olmayan sürücüler PASS alamaz",()=>{
 assert.deepEqual(EBELGE_ADAPTERS.map(x=>x.key),["ISNET","MANUAL","LOGO","MIKRO","PARASUT"]);
 assert.equal(classifyAdapterInstallation("LOGO",true).canConnect,false);
 assert.equal(classifyAdapterInstallation("ISNET",true).status,"SELECTED_VERIFICATION_REQUIRED");
 assert.equal(classifyAdapterInstallation("MIKRO",false).status,"NOT_SELECTED");
 assert.equal(getEBELGEAdapter("untrusted"),null);
});
test("Firma kaldırma hiçbir belge, şifre veya platform adaptörünü silmez",()=>{
 const route=readFileSync(new URL("./e-belge-adapter-company-routes.ts",import.meta.url),"utf8");
 assert.match(route,/main_company_slug=\?/);
 assert.match(route,/accountingTenantReadAllowed/);
 assert.match(route,/accountingAccess/);
 assert.match(route,/typeof body.selected!=="boolean"/);
 assert.doesNotMatch(route,/DELETE FROM|delete.*accounting_documents|DROP TABLE|credentials\s*:/i);
 const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
 assert.match(main,/registerEBelgeAdapterCompanyRoutes\(app\)/);
});

test("İki firma veya çelişen tenant istemleri ayrı kalır, sessizce tek firmaya düşmez",()=>{
 assert.deepEqual(accountingTenantCandidates("firma-a","firma-b",{mainCompanySlug:"firma-a"}),["firma-a","firma-b"]);
 assert.deepEqual(accountingTenantCandidates("Firma-A","firma-a",{mainCompanySlug:"firma-a"}),["firma-a"]);
});
test("Aynı adaptörün birden fazla eski satırında öncelikli tek kayıt belirleyicidir",()=>{
 const rows=[
  {file_name:"ISNET",data:JSON.stringify({selected:false})},
  {file_name:"ISNET",data:JSON.stringify({selected:true})},
  {file_name:"MANUAL",data:JSON.stringify({selected:true})},
  {file_name:"LOGO",data:"not-json"},
  {file_name:"LOGO",data:JSON.stringify({selected:false})},
  {file_name:"OTHER",data:JSON.stringify({selected:true})}
 ];
 assert.deepEqual(decodeEBelgeSelections(rows),{ISNET:false,MANUAL:true,LOGO:false});
 const route=readFileSync(new URL("./e-belge-adapter-company-routes.ts",import.meta.url),"utf8");
 assert.match(route,/ON CONFLICT\(id\) DO UPDATE/);
 assert.match(route,/ORDER BY CASE WHEN id LIKE/);
 assert.match(route,/decodeEBelgeSelections\(list\)/);
});

test("Firma adaptörleri seçili ve etkin durumlarını ayrı taşır; eski İşNet ayarı yalnız firma kapsamındadır",()=>{
 const route=readFileSync(new URL("./e-belge-adapter-company-routes.ts",import.meta.url),"utf8");
 const guard=readFileSync(new URL("./isnet-adapter-activation-guard.ts",import.meta.url),"utf8");
 const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
 assert.match(route,/enabled:body.selected/);
 assert.match(route,/scope='ISNET_SETTINGS' AND main_company_slug=\?/);
 assert.match(route,/!Object\.prototype\.hasOwnProperty\.call\(selected,"ISNET"\)/);
 assert.match(route,/enabled:selected\[adapter.key\]===true/);
 assert.match(guard,/ISNET_ADAPTER_INACTIVE/);
 assert.match(guard,/configuredPath\(path\)/);
 assert.match(main,/shell\.use\("\/api\/isnet\/\*", enforceIsnetAdapterActivation\)/);
});
