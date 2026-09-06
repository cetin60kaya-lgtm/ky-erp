import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(url:string)=>readFileSync(new URL(url,import.meta.url),"utf8");

test("Gmail adapter reuses Google Drive OAuth app and keeps explicit-send safety",()=>{
  const source=read("./mail-google-gmail.ts");
  assert.match(source,/GOOGLE_DRIVE_CLIENT_ID/);
  assert.match(source,/GOOGLE_DRIVE_CLIENT_SECRET/);
  assert.match(source,/gmail\.modify/);
  assert.match(source,/gmail\.send/);
  assert.match(source,/code_challenge_method:"S256"/);
  assert.match(source,/GOOGLE_ACCOUNT_MISMATCH/);
  assert.match(source,/UNKNOWN_REVIEW_REQUIRED/);
  assert.match(source,/delivered:false/);
  assert.doesNotMatch(source,/password\s*[:=]/i);
});

test("mail provider wrapper bootstraps 0050 and routes Gmail generic sync/send",()=>{
  const source=read("./main-entry-mail.ts");
  assert.match(source,/ensureMailCommunicationCore0050/);
  assert.match(source,/providerForAccount/);
  assert.match(source,/providerForDraft/);
  assert.match(source,/sync\/google/);
  assert.match(source,/send\/google/);
  assert.match(source,/oauth\/google\/callback/);
});

test("Hakan Emprime mailbox presets are canonical and department-safe",()=>{
  const source=read("../../../app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx");
  assert.match(source,/hkngursu@hotmail\.com/);
  assert.match(source,/hkndesen@gmail\.com/);
  assert.match(source,/providerType: "MICROSOFT_365"/);
  assert.match(source,/providerType: "GMAIL"/);
  assert.match(source,/accountType: "DEPARTMENT"/);
  assert.match(source,/departmentCode: "DESEN"/);
  assert.match(source,/isDefaultSend: true/);
  assert.match(source,/isDefaultReceive: true/);
});

test("worker source no longer contains the literal escaped import regression",()=>{
  const main=read("./main.ts");
  const wrangler=read("../wrangler.jsonc");
  assert.doesNotMatch(main,/;\\nimport \{ ensureMailCommunicationCore0050/);
  assert.match(wrangler,/"main": "src\/main-entry-mail\.ts"/);
});


test("daily Mail Center can connect Gmail and keeps account setup out of the inbox flow",()=>{
  const source=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  assert.match(source,/startGoogleMailOAuth/);
  assert.match(source,/Google Hesabını Bağla/);
  assert.match(source,/comm-modal-backdrop/);
  assert.match(source,/messageSearch/);
  assert.match(source,/replyToMessageId/);
});

test("Gmail account approval follows current company-owner governance",()=>{
  const source=read("./mail-provider-overlay.ts");
  assert.match(source,/policy="COMPANY_OWNER"/);
  assert.doesNotMatch(source,/COMPANY_OWNER_AND_APP_OWNER/);
  assert.doesNotMatch(source,/"APP_OWNER",2,1,"PENDING"/);
});


test("reply-waiting view is server-derived instead of misusing incoming flags",()=>{
  const core=read("./mail-communication-core.ts");
  const ui=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  assert.match(core,/awaitingReply/);
  assert.match(core,/m\.direction='OUTGOING'/);
  assert.match(core,/NOT EXISTS \(SELECT 1 FROM mail_messages newer/);
  assert.match(ui,/awaitingReply: 1/);
  assert.doesNotMatch(ui,/mail-yanit-bekleyen\" \? list\.filter/);
});


test("Hakan mail center exposes direct Hotmail and Gmail OAuth onboarding",()=>{
  const source=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  assert.match(source,/hkngursu@hotmail\.com/);
  assert.match(source,/hkndesen@gmail\.com/);
  assert.match(source,/Direkt Ekle & Bağla/);
  assert.match(source,/addAndConnectPreset/);
  assert.match(source,/setMailAccountDefaults/);
});
