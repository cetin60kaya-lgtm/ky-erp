import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const isnet=readFileSync(new URL("./isnet-runtime-v2.ts",import.meta.url),"utf8");
const drive=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
test("Bulut İşNet sağlık kontrolü yalnız imzalı firmaya hizmet eder",()=>{
 assert.match(isnet,/app\.get\("\/api\/isnet\/cloud-readiness"/);
 assert.match(isnet,/getAuthenticatedUser\(c\)/);
 assert.match(isnet,/canReadOwnCompanyStorage\(user,slug\)/);
 assert.match(isnet,/verifyIsnetReadOnlySession\(c,slug\)/);
 assert.match(isnet,/apiAuthorized:session\.connected===true/);
 assert.match(isnet,/requiresLocalSetup:false/);
});
test("Drive hazırlık kontrolü şifre veya kişisel hesap döndürmez",()=>{
 assert.match(drive,/app\.get\("\/api\/file-hub\/cloud\/tenant-readiness"/);
 assert.match(drive,/canReadOwnCompanyStorage\(user,slug\)/);
 assert.match(drive,/E_DOCUMENT_BINDING_REQUIRED/);
 assert.match(drive,/INDEX_PRESENT/);
 assert.match(drive,/requiresComputerIp:false/);
 const part=drive.split('app.get("/api/file-hub/cloud/tenant-readiness"')[1].split('app.get("/api/file-hub/cloud/providers"')[0];
 assert.doesNotMatch(part,/access_token_cipher|refresh_token_cipher|password_cipher/);
});
