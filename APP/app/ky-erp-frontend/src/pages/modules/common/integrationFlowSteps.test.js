import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INTEGRATION_CONNECTION_STEPS } from "./IntegrationFlowSteps.jsx";
const read=(relative)=>readFileSync(new URL(relative,import.meta.url),"utf8");

test("Tüm entegrasyon ekranlarında bağlantı adımları tek bileşendir",()=>{
  assert.equal(INTEGRATION_CONNECTION_STEPS.ISNET.length,3);
  assert.equal(INTEGRATION_CONNECTION_STEPS.MAIL.length,3);
  assert.equal(INTEGRATION_CONNECTION_STEPS.STORAGE.length,3);
  assert.match(read("../muhasebe/EBelgeIntegrationsWorkspace.jsx"),/<IntegrationFlowSteps kind="ISNET"/);
  assert.match(read("../../../admin/AdminMailConnectionsV2.jsx"),/<IntegrationFlowSteps kind="MAIL"/);
  assert.match(read("../../../admin/AdminStorageCenter.jsx"),/<IntegrationFlowSteps kind="STORAGE"/);
});

test("Mail OAuth güvenliği korunur: şifre aktarımı ve sahte bağlandı etiketi yok",()=>{
 const mail=read("../../../admin/AdminMailConnectionsV2.jsx");
 assert.match(mail,/startMicrosoftMailOAuth/);
 assert.match(mail,/startGoogleMailOAuth/);
 assert.match(mail,/Aktif \+ OAuth bağlı/);
 assert.doesNotMatch(mail,/password:\s*account\./);
});
