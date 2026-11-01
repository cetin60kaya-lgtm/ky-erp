import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const cloud=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
const preview=readFileSync(new URL("./file-hub-preview.ts",import.meta.url),"utf8");
const hub=readFileSync(new URL("./file-hub.ts",import.meta.url),"utf8");
test("Google Drive raw dosya indirmesi yalnız kendi ana firmasını yöneten hesap için",()=>{
 const part=cloud.split('app.get("/api/file-hub/cloud/files/:assetId/download"')[1];
 assert.ok(part);
 assert.match(part,/assertCompanyOwner\(c\)/);
 assert.match(part,/if \(gate.error\) return gate.error/);
 assert.match(part,/const slug = gate.slug!/);
 assert.doesNotMatch(part,/const user = await currentUser\(c\); if \(!user\)/);
});
test("birden çok modüle bağlı hassas dosya herkesin görebildiği bir ilişkiyle açılamaz",()=>{
 assert.match(preview,/modules.every\(\(moduleKey\) => moduleKey && permission\(user, moduleKey\)\?\.canView\)/);
 assert.doesNotMatch(preview,/modules.some\(\(moduleKey\) => permission/);
 assert.match(preview,/main_company_slug=\?/);
});
test("kanonik kayıt ve saklama ilişkileri çoklu modüllere ayrı kopya yerine tek File Hub üzerinden bağlıdır",()=>{
 assert.match(hub,/file_hub_relations/);
 assert.match(hub,/file_hub_bindings/);
 assert.match(hub,/storage_connection_id/);
 assert.match(hub,/main_company_slug/);
 assert.match(hub,/restrictedPurposes\.has\(purposeCode\)/);
 assert.match(hub,/SENSITIVE_BINDING_REQUIRED/);
});
test("tanimsiz dosya iliskisi normal personelde erisime acik kalmaz",()=>{const admin=readFileSync(new URL("./admin-storage-cloud.ts",import.meta.url),"utf8");assert.match(admin,/if\(!moduleKey\|\|!permissionFor\(user,moduleKey\)\?\.canView\)/);assert.match(admin,/AUDIT_REPORT:"DENETIM"/);assert.match(admin,/CHEQUE:"MUHASEBE"/);});
