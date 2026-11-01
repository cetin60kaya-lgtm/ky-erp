import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const cloud=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");

test("Google ve Microsoft OAuth callback sunucu tarafında tek canonical kaynakla üretildi",()=>{
 assert.match(cloud,/const apiBaseUrl = "https:\/\/api\.kyerp\.net";/);
 assert.ok(cloud.includes('redirectUri: `${apiBaseUrl}/api/auth/file-hub/oauth/google/callback`'));
 assert.ok(cloud.includes('redirectUri: `${apiBaseUrl}/api/auth/file-hub/oauth/microsoft/callback`'));
 assert.match(cloud,/redirect_uri: cfg\.redirectUri/);
});
test("provider API doğru redirectUri'yi gösterir ama sağlayıcı kaydını doğrulandı saymaz",()=>{
 for(const p of ["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT","DROPBOX"]){
  const pattern=new RegExp('providerType: "'+p+'".*redirectUri: providerConfig\\(c, "'+p+'"\\)\\.redirectUri, registrationVerified: false');
  assert.match(cloud,pattern);
 }
 assert.match(cloud,/configured: providerReady\(c, "GOOGLE_DRIVE"\)/);
});
