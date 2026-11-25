import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("PRO company management uses existing user endpoints and verifies status and audit",()=>{
 const source=read("./ProCompanyCenter.jsx");
 for(const fragment of ["activateUser(row.id)","deactivateUser(row.id)","revokeAllUserSessions(row.id)","rows(await listUsers())","listSecurityAuditLog(250)","event.actorUserId === user.id","OWNER_ROLES.has","window.confirm"])assert.ok(source.includes(fragment),fragment);
});
test("mobile quick modules derive from authorized canonical registry",()=>{
 const source=read("./main.jsx");
 assert.ok(source.includes("preferredKeys.map(key=>allowed.find"));
 assert.ok(source.includes("gunluk-operasyon"));
 assert.ok(source.includes("getVisibleModuleTabs(m)[0]"));
 assert.ok(read("../../public/ky-firma/index.html").includes('href="/guvenlik/pro/"'));
});
