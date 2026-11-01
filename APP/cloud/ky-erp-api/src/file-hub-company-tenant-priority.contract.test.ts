import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const cloud=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
const screen=readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/admin/AdminStorageCenter.jsx",import.meta.url),"utf8");
test("mevcut kismi Drive kuyrugu korunur ve 2026 giris klasoru once gelir",()=>{
 assert.match(cloud,/prioritizeGoogleScanQueue\(cursor\.queue\)/);
 assert.match(cloud,/await persist\(cursor\)/);
 assert.match(cloud,/cloudSyncCursor/);
});
test("firma degisikligindeki eski cevaplar yeni firmaya yazilamaz",()=>{
 assert.match(screen,/activeSlugRef\.current!==slug/);
 assert.match(screen,/setConnections\(\[\]\);setAccounts\(\[\]\);setBindings\(\[\]\);setFiles\(\[\]\)/);
});
test("OneDrive destekli mevcut devam motoru ve hesap kaldirma geri alinmaz",()=>{
 assert.match(cloud,/async function microsoftChildrenPage/);
 assert.match(cloud,/app\.delete\("\/api\/file-hub\/cloud\/accounts\/:id"/);
 assert.match(cloud,/ACCOUNT_HAS_ACTIVE_SERVICES/);
 assert.match(cloud,/cloudSyncLeaseId/);
});
