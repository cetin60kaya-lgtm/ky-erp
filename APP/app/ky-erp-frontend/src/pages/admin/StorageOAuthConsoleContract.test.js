import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./AdminStorageCenter.jsx",import.meta.url),"utf8");
const style=readFileSync(new URL("./StorageOperationsPolish.css",import.meta.url),"utf8");

test("Google 400 redirect mismatch ve Microsoft OAuth eksikliği için gerçek dönüş adresi ve konsol yolu gösterilir",()=>{
 assert.match(source,/function OAuthRedirectHelp/);
 assert.match(source,/redirect_uri_mismatch/);
 assert.match(source,/info\?\.redirectUri/);
 assert.match(source,/https:\/\/console\.cloud\.google\.com\/auth\/clients/);
 assert.match(source,/https:\/\/entra\.microsoft\.com\//);
 assert.match(source,/kayıtlı olmalı/);
 assert.match(source,/OAuth anahtarları mevcut; sağlayıcı konsolundaki dönüş URI kaydı henüz doğrulanmadı/);
 assert.match(style,/storage-oauth-help/);
});
