import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {getIsnetConnectionModePreference,saveIsnetConnectionModePreference} from "./isnetConnectionModePreference.js";
const ui=readFileSync(new URL("./EBelgeIntegrationsWorkspace.jsx",import.meta.url),"utf8");
const service=readFileSync(new URL("../../../services/isnetApi.js",import.meta.url),"utf8");

test("İşNet API ve NetteFatura portalı eski hata/sağlık göstergesini karıştırmaz",()=>{
  assert.match(ui,/notice\.connectionMode === connection\.connectionMode/);
  assert.match(ui,/connection\.connectionMode === "portal" && portalHealth/);
  assert.match(ui,/connection\.connectionMode === "portal" \? <button type="button" disabled=\{!!busy\}/);
  assert.match(ui,/connection\.connectionMode === "api" && <p className="ism-connection-help" role="status"/);
  assert.match(ui,/getIsnetEgressHealth/);
  assert.match(service,/apiGet\("\/health\/isnet-egress"/);
});
test("Tercih yalnız mod saklar; firma/şifre/token ya da kimlik saklamaz",()=>{
 const values=new Map();
 const storage={setItem:(k,v)=>values.set(k,v),getItem:(k)=>values.get(k)};
 assert.equal(saveIsnetConnectionModePreference("tenant-a","api",storage),true);
 assert.equal(getIsnetConnectionModePreference("tenant-a",storage),"api");
 assert.equal(getIsnetConnectionModePreference("tenant-b",storage),null);
 assert.deepEqual([...values.values()],["api"]);
 assert.equal(saveIsnetConnectionModePreference("tenant-a","UNKNOWN",storage),false);
 assert.equal(getIsnetConnectionModePreference("tenant-a",storage),"api");
});
test("API modu portal erişimini tekrar denemeden doğrudan gerçek API testine gider",()=>{
 const block=ui.slice(ui.indexOf("async function testConnection()"),ui.indexOf("async function saveConnection()"));
 assert.match(block,/if \(connection\.connectionMode === "portal"\)/);
 assert.match(block,/const result = await testIsnetSettings\(\{/);
 assert.match(block,/connectionMode: connection\.connectionMode/);
});
