import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page=readFileSync(new URL("./AdminStorageCenter.jsx",import.meta.url),"utf8");
const mail=readFileSync(new URL("./AdminMailConnectionsV2.jsx",import.meta.url),"utf8");
const css=readFileSync(new URL("./StorageOperationsPolish.css",import.meta.url),"utf8");

test("bağlantılar bölümünün altı gerçek çalışma alanı bağlıdır",()=>{
 for(const tab of ["overview","connections","mail","bindings","files","sync","logs"]){
  assert.match(page,new RegExp('tab==="'+tab+'"'));
 }
 assert.match(page,/AdminMailConnectionsV2 activeMainCompany=/);
 assert.match(mail,/startGoogleMailOAuth/);
 assert.match(mail,/startMicrosoftMailOAuth/);
 assert.match(mail,/listMailApprovals/);
});

test("bölüm ataması düzenleme, okuma yazma senkron seçenekleri ve gerçek klasör seçimi",()=>{
 assert.match(page,/function selectBinding\(row\)/);
 assert.match(page,/PURPOSES_BY_MODULE/);
 assert.match(page,/folderSelected/);
 assert.match(page,/rootPath:v\.path\?\?""/);
 for(const flag of ["readEnabled","writeEnabled","syncEnabled"])assert.match(page,new RegExp('checked=\\{binding\\.'+flag));
});
test("dosya indeksi limit ve sayfalama görünür, filtreler kontrollü",()=>{
 assert.match(page,/take:100,offset:fileOffset/);
 assert.match(page,/setFileTotal\(f\?\.page\?\.total\?\?null\)/);
 assert.match(page,/storage-pagination/);
 assert.match(page,/setSearch\(searchDraft\.trim\(\)\)/);
});
test("sistem olayı güvenli alanlarla özetlenir ve agent anahtarı yenileme onay ister",()=>{
 assert.match(page,/const keys=\["provider","providerType"/);
 assert.match(page,/window\.confirm\("File Agent anahtarı yenilenecek/);
 assert.match(page,/credential\?\.configured/);
 assert.match(page,/D1 yedek ve yayın kayıtları/);
 assert.match(css,/storage-binding-choice\.selected/);
});

test("Google Drive ve OneDrive iki bağımsız aktif bağlantı olarak görülebilir",()=>{
 assert.match(page,/type:"GOOGLE_DRIVE",name:"Google Drive"/);
 assert.match(page,/type:"ONEDRIVE",name:"Microsoft OneDrive"/);
 assert.match(page,/cloudConnections\.filter\(c=>c\.provider_type===item\.type\)/);
 assert.match(page,/setWizard\(\{provider:item\.type\}\)/);
 assert.match(page,/initialProvider\?"account":"provider"/);
 assert.match(css,/storage-dual-providers/);
});
