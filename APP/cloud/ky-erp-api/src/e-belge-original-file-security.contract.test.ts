import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const api=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");
const source=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
test("original document file endpoint checks auth, tenant, accounting permission and linked asset",()=>{
 const start=api.indexOf('app.get("/api/e-belge/documents/:id/files/:fileId/original"');
 const end=api.indexOf('app.get("/api/e-belge/documents/:id"',start);
 assert.ok(start>=0&&end>start);
 const route=api.slice(start,end);
 assert.match(route,/await getAuthenticatedUser\(c\)/);
 assert.match(route,/accountingTenantReadAllowed\(user,slug\)/);
 assert.match(route,/accountingAccess\(user,"GET",c\.req\.path\)/);
 assert.match(route,/JOIN file_hub_relations r/);
 assert.match(route,/r\.entity_type='DOCUMENT'/);
 assert.match(route,/r\.entity_id=d\.id/);
 assert.match(route,/a\.id=\?/);
 assert.match(route,/d\.main_company_slug=\?/);
 assert.match(route,/readFileHubAssetForMail\(c,slug,fileId,MAX_FILE_BYTES\)/);
 assert.match(route,/Content-Type/);
 assert.match(route,/application\/pdf/);
 assert.match(route,/Cache-Control/);
 assert.match(route,/nosniff/);
 assert.doesNotMatch(route,/preview_storage_key|ensureCloudModelImagePreview/);
});
test("original provider R2 bytes are supported separately from image previews",()=>{
 assert.match(source,/\["ACCOUNTING_STAGING","E_DOCUMENT_PROVIDER"\]\.includes\(upper\(asset\.source_type\)\)/);
 assert.match(source,/return\{fileAssetId:assetId,fileName,mimeType,sizeBytes:buffer\.byteLength,bytes:new Uint8Array\(buffer\)/);
});
test("PDF original response rejects non-PDF thumbnails",()=>{
 const route=api.slice(api.indexOf('app.get("/api/e-belge/documents/:id/files/:fileId/original"'),api.indexOf('app.get("/api/e-belge/documents/:id"',api.indexOf('app.get("/api/e-belge/documents/:id/files/:fileId/original"')));
 assert.match(route,/bytes\[0\]!==37\|\|bytes\[1\]!==80/);
 assert.match(route,/ORIGINAL_PDF_INVALID/);
});
