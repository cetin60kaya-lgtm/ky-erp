import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const workspace=readFileSync(new URL("./EBelgeIntegrationsWorkspace.jsx",import.meta.url),"utf8");
const service=readFileSync(new URL("../../../services/isnetApi.js",import.meta.url),"utf8");
test("İşNet şifresiz Worker çıkış kontrolü ve ayrı doğrulama kapısı",()=>{
 assert.match(service,/getIsnetPortalHealth/);
 assert.match(service,/\/isnet\/provider-login-health/);
 assert.match(workspace,/Sunucu Erişimini Kontrol Et \(Şifresiz\)/);
 const start=workspace.indexOf("async function testConnection()");
 const end=workspace.indexOf("async function saveConnection()",start);
 const flow=workspace.slice(start,end);
 assert.ok(flow.indexOf("getIsnetPortalHealth()") < flow.indexOf("testIsnetSettings("));
 assert.match(flow,/status\?\.reachable !== true/);
});
