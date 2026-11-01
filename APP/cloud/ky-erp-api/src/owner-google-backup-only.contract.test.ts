import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const recovery=readFileSync(new URL("./auth-external-recovery.ts",import.meta.url),"utf8");
const policy=readFileSync(new URL("./auth-policy-cloud.ts",import.meta.url),"utf8");
const drive=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");

test("Google yedek kimlik doğrulaması yalnız SUPER_ADMIN ve iki tarafta zorunlu",()=>{
 assert.match(recovery,/function googleRecoveryAllowed\(user: AnyRow\)/);
 assert.match(recovery,/role_override \|\| user\?\.role\) === "SUPER_ADMIN"/);
 assert.equal((recovery.match(/provider === "google" && !googleRecoveryAllowed\(user\)/g)||[]).length,2);
 assert.match(recovery,/GOOGLE_RECOVERY_SUPER_ADMIN_REQUIRED/);
});
test("yedek Google, parola-güvenlik kanıtı ve doğrulanmış iş e-postasını atlamaz",()=>{
 assert.match(recovery,/challengeProof\(c, body\)/);
 assert.match(recovery,/sourceStillPending\(c, row\)/);
 assert.match(recovery,/EXTERNAL_RECOVERY_EMAIL_NOT_VERIFIED/);
 assert.match(recovery,/identity\.email !== accountEmail/);
 assert.match(recovery,/code_challenge_method: "S256"/);
});
test("Google kimliği, Google Drive izni ve günlük login aynı akış değildir",()=>{
 assert.match(recovery,/GOOGLE_OAUTH_CLIENT_ID/);
 assert.match(drive,/GOOGLE_DRIVE_CLIENT_ID/);
 assert.match(policy,/\/api\/auth\/login/);
 assert.doesNotMatch(recovery,/\/api\/auth\/login/);
});
