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
  assert.match(source,/Ekle & Bağla/);
  assert.match(source,/Posta Kutusunu Aç/);
  assert.match(source,/Bağlantı servisi hazırlanıyor/);
  assert.doesNotMatch(source,/Sağlayıcı production OAuth ayarı henüz doğrulanmadı/);
  assert.match(source,/addAndConnectPreset/);
  assert.match(source,/setMailAccountDefaults/);
});


test("mail workspace final includes per-user pinning and provider folders",()=>{
  const core=read("./mail-communication-core.ts");
  const migration=read("./runtime-migration-mail-ux.ts");
  const ui=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  const registry=read("../../../app/ky-erp-frontend/src/app/moduleRegistry.js");
  assert.match(migration,/mail_message_user_state/);
  assert.match(core,/\/api\/mail\/folders/);
  assert.match(core,/\/api\/mail\/messages\/:id\/pin/);
  assert.match(core,/COALESCE\(us\.is_pinned,0\) DESC/);
  assert.match(ui,/mail-sabitlenen/);
  assert.match(ui,/📌 Sabitle/);
  assert.match(ui,/syncMailFolder/);
  assert.match(registry,/Sabitlenenler/);
});

test("Outlook and Gmail expose user mail actions without conflating pin and flag",()=>{
  const microsoft=read("./mail-microsoft-graph.ts");
  const gmail=read("./mail-google-gmail.ts");
  const wrapper=read("./main-entry-mail.ts");
  assert.match(microsoft,/MAIL_MICROSOFT_MESSAGE_/);
  assert.match(microsoft,/MARK_READ/);
  assert.match(microsoft,/ARCHIVE/);
  assert.match(microsoft,/deleteditems/);
  assert.match(gmail,/\/modify/);
  assert.match(gmail,/STARRED/);
  assert.match(gmail,/\/trash/);
  assert.match(wrapper,/providerForMessage/);
  assert.match(wrapper,/messageActionMatch/);
});

test("Microsoft sync discovers standard and custom folder tree",()=>{
  const source=read("./mail-microsoft-graph.ts");
  assert.match(source,/discoverMicrosoftFolders/);
  assert.match(source,/childFolders/);
  assert.match(source,/folder_type:type/);
  assert.match(source,/CUSTOM/);
  assert.match(source,/syncMicrosoftFolder/);
});

test("provider replies keep their conversation and in-flight sends cannot be repeated",()=>{
  const microsoft=read("./mail-microsoft-graph.ts"),gmail=read("./mail-google-gmail.ts");
  for(const source of [microsoft,gmail]) {
    assert.match(source,/mailReplyContext\(c\.env\.DB,tenant,text\(draft\.account_id\),text\(draft\.reply_to_message_id\)\)/);
    assert.match(source,/\["SENDING","UNKNOWN_REVIEW_REQUIRED"\]\.includes/);
  }
  assert.match(microsoft,/\/createReply/);
  assert.match(microsoft,/scope:scopesForAccount\(account\)/);
  assert.match(gmail,/threadId:original\.provider_thread_id/);
  assert.match(gmail,/gmailReplyHeaders\(original\)/);
});

test("compose final supports explicit send-now and rich HTML preview stays sandboxed",()=>{
  const ui=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  assert.match(ui,/saveDraft\(true\)/);
  assert.match(ui,/Taslağı Kaydet/);
  assert.match(ui,/comm-html-body/);
  assert.match(ui,/sandbox=""/);
  assert.match(ui,/Klasöre taşı/);
});


test("mail attachment metadata and secure provider download are wired end to end",()=>{
  const core=read("./mail-communication-core.ts");
  const microsoft=read("./mail-microsoft-graph.ts");
  const gmail=read("./mail-google-gmail.ts");
  const wrapper=read("./main-entry-mail.ts");
  const api=read("../../../app/ky-erp-frontend/src/services/mailApi.js");
  const ui=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  assert.match(core,/messages\/:id\/attachments/);
  assert.match(microsoft,/syncMicrosoftAttachments/);
  assert.match(microsoft,/attachments\/:attachmentId\/download\/microsoft/);
  assert.match(gmail,/provider_attachment_id/);
  assert.match(gmail,/attachments\/:attachmentId\/download\/google/);
  assert.match(wrapper,/attachmentDownloadMatch/);
  assert.match(api,/downloadMailAttachment/);
  assert.match(ui,/comm-attachments/);
});
