import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const file=readFileSync(new URL("./file-hub-preview.ts",import.meta.url),"utf8");
test("belge orijinali için önce kullanıcı/tenant ve tüm ilişkilerin modül yetkisi kontrol edilir",()=>{
 const start=file.indexOf('app.get("/api/file-hub/files/:id/preview"');
 const body=file.slice(start);
 const auth=body.indexOf("getAuthenticatedUser(c)");
 const guards=body.indexOf("modules.every((moduleKey)");
 const orig=body.indexOf("const originalLink");
 assert.ok(start>=0&&auth>=0&&guards>auth&&orig>guards);
 assert.match(body,/main_company_slug=\? AND file_asset_id=\? AND entity_type='DOCUMENT'/);
});
test("gerçek XML ve PDF, R2 staging ya da mevcut Google/Graph arşivinden okunur",()=>{
 assert.match(file,/source === "E_DOCUMENT_PROVIDER" \|\| source === "ACCOUNTING_STAGING"/);
 assert.match(file,/readFileHubAssetForMail\(c,slug,id,MAX_ORIGINAL\)/);
 assert.match(file,/signature\.includes\("%PDF-"\)/);
 assert.match(file,/code:"ORIGINAL_NOT_PDF"/);
 assert.match(file,/headers\.set\("cache-control","private, no-store"\)/);
 assert.match(file,/headers\.set\("x-content-type-options","nosniff"\)/);
});
test("DESEN ve genel File Hub görüntüleri için eskiden var olan thumbnail yolu korunur",()=>{
 assert.match(file,/ensureCloudModelImagePreview\(c,slug,id\)/);
 assert.match(file,/\["JPG","JPEG","PNG","WEBP","AI","PDF","TIF","TIFF"\]/);
});
