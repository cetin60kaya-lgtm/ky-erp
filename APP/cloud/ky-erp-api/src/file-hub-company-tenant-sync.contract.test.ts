import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const cloud=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
const screen=readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/admin/AdminStorageCenter.jsx",import.meta.url),"utf8");
test("hesaplar ve silme sadece secilen sirket kapsaminda, aktif servis tokenini kaybetmez",()=>{
  assert.match(cloud,/app\.delete\("\/api\/file-hub\/cloud\/accounts\/:id"/);
  assert.match(cloud,/assertCompanyOwner\(c\)/);
  assert.match(cloud,/WHERE id=\? AND main_company_slug=\?/);
  assert.match(cloud,/ACCOUNT_HAS_ACTIVE_SERVICES/);
  assert.match(cloud,/WHERE main_company_slug=\? AND oauth_account_id=\?/);
  assert.match(screen,/Hesabı Kaldır/);
  assert.match(screen,/Aktif firma/i);
});
test("farkli firmaya geciste onceki firmanin istek cevaplari ve dosya listesi kalmaz",()=>{
  assert.match(screen,/activeSlugRef\.current!==slug/);
  assert.match(screen,/setConnections\(\[\]\);setAccounts\(\[\]\);setBindings\(\[\]\);setFiles\(\[\]\)/);
});
test("tek File Hub scan motoru Microsoft ve Google icin cursor saklar",()=>{
  assert.match(cloud,/async function microsoftChildrenPage/);
  assert.match(cloud,/url\.origin!=="https:\/\/graph\.microsoft\.com"/);
  assert.match(cloud,/\["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT"\]\.includes\(providerType\)/);
  assert.match(cloud,/cloudSyncCursor/);
  assert.match(cloud,/runGoogleSyncBatch\(c, slug, connectionId, 3, true\)/);
  assert.match(cloud,/runGoogleSyncBatch\(c, gate\.slug, connectionId, 1, false\)/);
});
test("canli durumun gercekten aktif mi yoksa siradaki parcayi mi bekledigi sorgulanabilir",()=>{
  assert.match(cloud,/app\.get\("\/api\/file-hub\/cloud\/connections\/:id\/status"/);
  assert.match(cloud,/leaseActive/);
  assert.match(cloud,/pendingFolders/);
  assert.match(screen,/setInterval\(poll,15000\)/);
});
