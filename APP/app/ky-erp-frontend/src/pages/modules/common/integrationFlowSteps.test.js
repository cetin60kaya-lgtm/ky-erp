import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(relative)=>readFileSync(new URL(relative,import.meta.url),"utf8");

test("Tüm entegrasyon ekranlarında bağlantı adımları tek bileşendir",()=>{
  const common=read("./IntegrationFlowSteps.jsx");
  assert.match(common,/ISNET: \["Hesap ve giriş"/);
  assert.match(common,/MAIL: \["Posta hesabı tanımla"/);
  assert.match(common,/STORAGE: \["Dosya sağlayıcısını seç"/);
  assert.match(read("../muhasebe/EBelgeIntegrationsWorkspace.jsx"),/<IntegrationFlowSteps kind="ISNET"/);
  assert.match(read("../../admin/AdminMailConnectionsV2.jsx"),/<IntegrationFlowSteps kind="MAIL"/);
  assert.match(read("../../admin/AdminStorageCenter.jsx"),/<IntegrationFlowSteps kind="STORAGE"/);
});

test("Mail OAuth güvenliği korunur: şifre aktarımı ve sahte bağlandı etiketi yok",()=>{
 const mail=read("../../admin/AdminMailConnectionsV2.jsx");
 assert.match(mail,/startMicrosoftMailOAuth/);
 assert.match(mail,/startGoogleMailOAuth/);
 assert.match(mail,/Aktif \+ OAuth bağlı/);
 assert.doesNotMatch(mail,/password:\s*account\./);
});
