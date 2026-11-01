import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const cloud=readFileSync(new URL("./file-hub-cloud-oauth.ts",import.meta.url),"utf8");
const hub=readFileSync(new URL("./file-hub.ts",import.meta.url),"utf8");

test("Dropbox altyapısı gerçek OAuth kimlik doğrulama ve refresh API'sine bağlıdır",()=>{
 assert.match(cloud,/providerFamily.*DROPBOX/);
 assert.match(cloud,/DROPBOX_CLIENT_ID/);
 assert.match(cloud,/DROPBOX_CLIENT_SECRET/);
 assert.match(cloud,/FILE_HUB_OAUTH_KEY/);
 assert.match(cloud,/api\/auth\/file-hub\/oauth\/dropbox\/callback/);
 assert.match(cloud,/token_access_type:"offline"/);
 assert.match(cloud,/https:\/\/api\.dropboxapi\.com\/oauth2\/token/);
 assert.match(cloud,/users\/get_current_account/);
 assert.match(cloud,/account_info\.read files\.metadata\.read files\.content\.read files\.content\.write/);
});

test("Dropbox klasörleri, sayfalama ve dosya download gerçek API v2 üzerinden yapılır",()=>{
 assert.match(cloud,/function dropboxRootPath/);
 assert.match(cloud,/async function listDropboxChildren/);
 assert.match(cloud,/files\/list_folder\/continue/);
 assert.match(cloud,/DROPBOX_LIST_LIMIT/);
 assert.match(cloud,/listDropboxChildren\(accessToken,parentId,false\)/);
 assert.match(cloud,/listDropboxChildren\(accessToken,current\.id,true\)/);
 assert.match(cloud,/content\.dropboxapi\.com\/2\/files\/download/);
 assert.match(cloud,/Dropbox-API-Arg/);
});

test("Dropbox klasör oluşturma, mevcut yol çakışması ve upload gerçek API ile korunur",()=>{
 assert.match(cloud,/files\/create_folder_v2/);
 assert.match(cloud,/files\/get_metadata/);
 assert.match(cloud,/DROPBOX_FOLDER_CONFLICT/);
 assert.match(cloud,/content\.dropboxapi\.com\/2\/files\/upload/);
 assert.match(cloud,/DROPBOX_LARGE_UPLOAD_UNSUPPORTED/);
 assert.match(cloud,/mode:"add",autorename:true/);
 assert.match(cloud,/providerType:provider/);
});

test("Dropbox yalnız seçilirse aktif cloud provider olur, Google Drive ve OneDrive korunur",()=>{
 assert.match(cloud,/providerType: "GOOGLE_DRIVE"/);
 assert.match(cloud,/providerType: "ONEDRIVE"/);
 assert.match(cloud,/providerType: "DROPBOX".*configured: providerReady\(c, "DROPBOX"\).*optional: true/);
 assert.match(hub,/\["GOOGLE_DRIVE","ONEDRIVE","LOCAL_FOLDER","NAS","SHAREPOINT","DROPBOX"\]/);
});
