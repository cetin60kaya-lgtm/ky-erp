import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),"utf8");
test("self phone MFA does not depend on manager approval and preserves BOTH_MFA",()=>{
 const policy=read("./auth-policy-cloud.ts");
 assert.ok(policy.includes('policy !== "PASSWORD_ONLY" || Boolean(refreshed?.approval_required)'));
 assert.ok(policy.includes('phoneFactorAllowed && policy !== "BOTH_MFA"'));
 const push=read("./auth-push-cloud.ts");
 assert.ok(push.includes("if (challenge.selfOnly === true) return false;"));
 assert.ok(push.includes("return !selfOnly && endpoint"));
 assert.ok(push.includes("return approval.selfOnly !== true && endpoint"));
});
test("account suspension and reactivation share atomic status, revoke and audit",()=>{
 const auth=read("./auth-cloud.ts");
 const block=auth.slice(auth.indexOf("async function setAccountActive("),auth.indexOf("export function registerAuthManagementRoutes("));
 for(const fragment of ["OWNER_SECURITY_ACTION_REQUIRED","!active || !Boolean(target.is_active)","AUTH_PHONE_LOGIN","auth_login_challenges","auth_login_approvals","UPDATE auth_sessions","INSERT INTO auth_security_audit","await db.batch(statements)","auditId"]) assert.ok(block.includes(fragment),fragment);
 assert.ok(auth.includes("return setAccountActive(c, current, target, true)"));
 assert.ok(auth.includes("return setAccountActive(c, current, target, false)"));
});
test("permissions preserve before/after audit and revoke within one batch",()=>{
 const auth=read("./auth-cloud.ts");
 assert.ok(auth.includes("JSON.stringify({oldPermissions,newPermissions:nextPermissions})"));
 assert.ok(auth.includes("await db.batch(statements)"));
});
