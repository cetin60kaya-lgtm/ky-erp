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
test("suspension invalidates old login artifacts and retains actor audit",()=>{
 const auth=read("./auth-cloud.ts");
 const block=auth.slice(auth.indexOf('app.post("/api/admin/users/:id/activate"'),auth.indexOf('app.get("/api/admin/users/:id/permissions"'));
 assert.ok(block.includes("if (!Boolean(target.is_active)) await invalidateUserLoginArtifacts"));
 assert.ok(block.includes('await audit(c, "USER_DEACTIVATED", current.id, target.id, target.mainCompanySlug'));
 assert.ok(block.includes("newActive: false"));
});
