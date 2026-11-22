import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canReadOwnCompanyStorage, canManageOwnCompanyStorage } from "./file-hub-company-owner-access.ts";

const hub=readFileSync(new URL("./file-hub.ts",import.meta.url),"utf8");
const oauth=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
const agent=readFileSync(new URL("./file-hub-agent-public.ts",import.meta.url),"utf8");

test("user may read only their signed main company regardless of user role",()=>{
  const account={id:"person-a",role:"COMPANY_ADMIN",mainCompanySlug:"firma-a"};
  assert.equal(canReadOwnCompanyStorage(account,"firma-a"),true);
  assert.equal(canReadOwnCompanyStorage(account,"FIRMA-A"),true);
  assert.equal(canReadOwnCompanyStorage(account,"firma-b"),false);
  assert.equal(canReadOwnCompanyStorage(account,""),false);
  assert.equal(canReadOwnCompanyStorage(null,"firma-a"),false);
  assert.equal(canReadOwnCompanyStorage({role:"SUPER_ADMIN",mainCompanySlug:"firma-a"},"firma-b"),false);
  assert.equal(canReadOwnCompanyStorage({role:"EMPLOYEE",main_company_slug:"firma-a"},"firma-a"),true);
  assert.equal(canReadOwnCompanyStorage({role:"COMPANY_ADMIN",security:{main_company_slug:"firma-a"}},"firma-a"),true);
});
test("storage edits also belong to the authenticated user's own company",()=>{
  const a={role:"COMPANY_ADMIN",mainCompanySlug:"firma-a"};
  assert.equal(canManageOwnCompanyStorage(a,"firma-a"),true);
  assert.equal(canManageOwnCompanyStorage(a,"firma-b"),false);
  assert.equal(canManageOwnCompanyStorage({role:"EMPLOYEE",mainCompanySlug:"firma-a"},"firma-a"),false);
  assert.equal(canManageOwnCompanyStorage({role:"SUPER_ADMIN",mainCompanySlug:"firma-a"},"firma-b"),false);
});
test("File Hub every ordinary read must use tenant-scoped requireUser",()=>{
  const requiredPaths=[
    "/api/file-hub/diagnostics","/api/file-hub/overview","/api/file-hub/connections",
    "/api/file-hub/bindings","/api/file-hub/resolve-storage","/api/file-hub/files",
    "/api/file-hub/entity-files","/api/file-hub/search",
  ];
  for(const route of requiredPaths){
    const start=hub.indexOf('app.get("'+route+'"');
    assert.ok(start>=0,route+" not found");
    const segment=hub.slice(start,Math.min(start+260,hub.length));
    assert.match(segment,/requireUser\(c\)/,route+" skipped tenant check");
  }
  assert.match(hub,/canReadOwnCompanyStorage\(user,slugOf\(c,body\)\)/);
  assert.doesNotMatch(hub,/mecit-hakan/,"legacy hardcoded tenant must never be a default");
  assert.match(hub,/const b=await bodyOf\(c\),u=await requireUser\(c,b\)/,"relation write must validate body tenant");
});
test("OAuth list and folder routes check signed company before provider account lookup",()=>{
  for(const route of ["/api/file-hub/cloud/accounts","/api/file-hub/cloud/folders",
    "/api/file-hub/cloud/sharepoint/sites","/api/file-hub/cloud/sharepoint/drives"]){
    const start=oauth.indexOf('app.get("'+route+'"');
    assert.ok(start>=0,route+" missing");
    assert.match(oauth.slice(start,start+620),/canReadOwnCompanyStorage\(user,slug\)/,route+" unscoped");
  }
  assert.match(oauth,/oauthAccountId: accountId/,"persist account identity on every connection");
  assert.match(oauth,/AND main_company_slug=\?/,"tenant key missing in OAuth DB queries");
});
test("both legacy and public agents need explicit tenant & tenant-specific credential",()=>{
  assert.doesNotMatch(hub,/function agentAllowed/,"global shared secret must not authorize other tenants");
  assert.equal(hub.match(/await verifyFileHubAgentCredential\(c,slug\)/g)?.length,3);
  assert.doesNotMatch(agent,/mecit-hakan/,"agent may not silently default to another company");
  assert.match(agent,/verifyFileHubAgentCredential\(c,slug\)/);
});
