import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(url:string)=>readFileSync(new URL(url,import.meta.url),"utf8");

test("Gmail adapter only uses dedicated OAuth app and keeps explicit-send safety",()=>{
  const source=read("./mail-google-gmail.ts");
  assert.match(source,/gmailOAuthClientReadiness\(c.env\)/);
  assert.match(source,/GOOGLE_MAIL_CLIENT_ID/);
  assert.match(source,/GOOGLE_MAIL_CLIENT_SECRET/);
  assert.doesNotMatch(source,/GOOGLE_MAIL_CLIENT_ID\s*\|\|\s*c.env.GOOGLE_DRIVE_CLIENT_ID/);
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

test("Mail yönetimi artık Hakan'a sabit değil; seçili firma için hesap, bölüm ve provider seçilir",()=>{
  const source=read("../../../app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx");
  assert.doesNotMatch(source,/hkngursu@hotmail\.com|hkndesen@gmail\.com|HAKAN_PRESETS/);
  assert.match(source,/listMailAccounts\(slug\)/);
  assert.match(source,/loadedSlug === slug/);
  assert.match(source,/loadSequence\.current/);
  assert.match(source,/listMailApprovals\(slug\)/);
  assert.match(source,/mainCompanySlug: slug/);
  assert.match(source,/providerType: "MICROSOFT_365"/);
  assert.match(source,/value: "SHARED"/);
  assert.match(source,/value: "DEPARTMENT"/);
  assert.match(source,/departmentCode:/);
  assert.match(source,/isDefaultSend/);
  assert.match(source,/isDefaultReceive/);
});

test("worker source no longer contains the literal escaped import regression",()=>{
  const main=read("./main.ts");
  const wrangler=read("../wrangler.jsonc");
  const securityEntry=read("./main-entry-security.ts");
  assert.doesNotMatch(main,/;\\nimport \{ ensureMailCommunicationCore0050/);
  assert.match(wrangler,/"main": "src\/main-entry-security\.ts"/);
  assert.match(securityEntry,/import base from "\.\/main-entry-mail"/);
});


test("daily Mail Center handles Gmail inbox while OAuth stays in Storage",()=>{
  const source=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  const admin=read("../../../app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx");
  assert.doesNotMatch(source,/startGoogleMailOAuth|addAndConnectPreset/);
  assert.match(source,/tabKey: "depolama-mail"/);
  assert.match(admin,/startGoogleMailOAuth/);
  assert.match(admin,/Hesabı Bağla/);
  assert.match(source,/comm-modal-backdrop/);
  assert.match(source,/messageSearch/);
  assert.match(source,/replyToMessageId/);
});

test("Gmail account approval follows company-or-super-admin governance",()=>{
  const source=read("./mail-provider-overlay.ts");
  assert.match(source,/policy="COMPANY_OR_APP_OWNER"/);
  assert.doesNotMatch(source,/COMPANY_OWNER_AND_APP_OWNER/);
  assert.doesNotMatch(source,/"APP_OWNER",2,1,"PENDING"/);
  assert.match(source,/requestStatus=elevated\?"APPROVED":"PENDING"/);
  assert.match(source,/PRIVILEGED_OWNER_AUTO_APPROVAL/);
  assert.match(source,/approvalBypass:elevated/);
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


test("Günlük Mail OAuth işlemleri ortak ve firma bazlı E-Posta Hesapları ekranında kalır",()=>{
  const source=read("../../../app/ky-erp-frontend/src/pages/modules/CommunicationHubPage.jsx");
  const storage=read("../../../app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx");
  assert.match(source,/Hesap Bağlantıları/);
  assert.match(source,/tabKey: "depolama-mail"/);
  assert.doesNotMatch(source,/addAndConnectPreset|setMailAccountDefaults|requestMailAccount/);
  assert.doesNotMatch(storage,/HAKAN_PRESETS|hkngursu@hotmail\.com|hkndesen@gmail\.com/);
  assert.match(storage,/startGoogleMailOAuth/);
  assert.match(storage,/startMicrosoftMailOAuth/);
  assert.match(storage,/setMailAccountDefaults/);
  assert.match(storage,/updateMailAccountProfile/);
  assert.match(storage,/listMailAccounts\(slug\)/);
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
  assert.match(ui,/sandbox="allow-popups allow-popups-to-escape-sandbox allow-downloads"/);
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


test("Gmail sync preserves inline CID images and delete always moves local row to trash folder",()=>{
  const gmail=read("./mail-google-gmail.ts");
  assert.match(gmail,/Content-ID/);
  assert.match(gmail,/_contentId/);
  assert.match(gmail,/_isInline/);
  assert.match(gmail,/attachmentId/);
  assert.match(gmail,/ensureFolder\(c,tenant,text\(row\.account_id\),"TRASH","Çöp Kutusu","TRASH"\)/);
  assert.match(gmail,/UPDATE mail_messages SET folder_id=\?/);
});


test("Gmail partial sync keeps successful mail data usable instead of surfacing a false hard error",()=>{
  const gmail=read("./mail-google-gmail.ts");
  assert.match(gmail,/successfulFolders/);
  assert.match(gmail,/partial,total,folders:summary/);
  assert.match(gmail,/return \{accountId:account\.id,partial,total,folders:summary/);
  assert.match(gmail,/return c\.json\(\{ok:true,data:result\},result\.partial\?207:200\)/);
  assert.match(gmail,/failed\+\+/);
  assert.match(gmail,/failures\.length<5/);
  assert.match(gmail,/MAIL_SYNC_FAILED/);
  assert.doesNotMatch(gmail,/ok:!partial,data:\{accountId:account\.id/);
});

test("Gmail keeps inline body.data parts retrievable without storing raw image content",()=> {
  const gmail=read("./mail-google-gmail.ts");
  assert.match(gmail,/inlineData=text\(part\?\.body\?\.data\)/);
  assert.match(gmail,/INLINE_PART:/);
  assert.match(gmail,/\?format=full/);
  assert.match(gmail,/findPart/);
  assert.match(gmail,/inlineBodyData:Boolean/);
});

test("Microsoft department mailboxes request shared mailbox scopes",()=> {
  const microsoft=read("./mail-microsoft-graph.ts");
  assert.match(microsoft,/\["SHARED","DEPARTMENT"\]\.includes/);
  assert.match(microsoft,/Mail\.ReadWrite\.Shared/);
  assert.match(microsoft,/Mail\.Send\.Shared/);
});


test("Gmail folder sync supports a lightweight background mode",()=>{
  const gmail=read("./mail-google-gmail.ts");
  assert.match(gmail,/body\.quick/);
  assert.match(gmail,/maxResults=quick\?20:100/);
  assert.match(gmail,/quick,maxResults/);
});

test("Gmail delete is idempotent and posts explicit JSON to the trash endpoint",()=>{
  const gmail=read("./mail-google-gmail.ts");
  const wrapper=read("./main-entry-mail.ts");
  assert.match(gmail,/alreadyInTrash/);
  assert.match(gmail,/body:"\{\}"/);
  assert.match(gmail,/GOOGLE_TRASH_FAILED/);
  assert.match(gmail,/MAIL_PROVIDER_MESSAGE_ID_MISSING/);
  assert.match(wrapper,/rewriteJsonPostPath/);
  assert.match(wrapper,/JSON\.stringify\(payload\)/);
});

test("Gmail refresh invalid_grant kullanıcıyı yeniden yetkilendirmeye yönlendirir; transient hata yetkiyi silmez",()=>{
  const source=read("./mail-google-gmail.ts");
  const start=source.indexOf("async function usableToken(");
  const end=source.indexOf("async function audit(",start);
  const body=source.slice(start,end);
  assert.match(body,/providerCode\)===\"invalid_grant\"/);
  assert.match(body,/markGmailReconnectRequired\(c,tenant,text\(account.id\),\"REFRESH_GRANT_INVALID\"\)/);
  assert.match(body,/CREDENTIAL_MISSING/);
  assert.match(body,/REFRESH_TOKEN_MISSING/);
  assert.doesNotMatch(body,/DELETE FROM mail_account_credentials/);
  assert.match(body,/throw error;/);
});

test("Google re-consent must return a new refresh token before replacing encrypted credentials",()=>{
  const source=read("./mail-google-gmail.ts");
  assert.match(source,/access_type:\"offline\"/);
  assert.match(source,/prompt:\"consent\"/);
  assert.match(source,/GOOGLE_REFRESH_TOKEN_MISSING/);
  const callback=source.slice(source.indexOf('app.get("/api/auth/mail/oauth/google/callback"'),source.indexOf('app.post("/api/mail/accounts/:id/sync/google"'));
  assert.ok(callback.indexOf('if(!text(payload.refresh_token))') < callback.indexOf('await saveCredential('));
  assert.match(source,/GMAIL_PROVIDER_CONFIG_REQUIRED/);
  assert.match(source,/const reauth=providerCode===\"MAIL_REAUTH_REQUIRED\"/);
});

test("Firma posta kutusu kayıtlı bağlantıyı silmeden Yeniden Bağla seçeneği sunar",()=>{
  const source=read("../../../app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx");
  assert.match(source,/active === "REAUTH_REQUIRED" \? "Yeniden Bağla"/);
  assert.match(source,/Google Yetkisini Yenile/);
  assert.match(source,/startGoogleMailOAuth\(account.id, slug\)/);
  assert.match(source,/OAuth: \{active === "REAUTH_REQUIRED"/);
});

test("Gmail callback sonucunu yanlış Mail Merkezi yerine firma E-Posta Hesapları alanına yollar",()=>{
  const gmail=read("./mail-google-gmail.ts");
  assert.match(gmail,/const APP_RETURN = "https:\/\/kyerp\.net\/depolama\/depolama-mail";/);
  assert.match(gmail,/GMAIL_OAUTH_CALLBACK_FAILURE/);
  assert.match(gmail,/GMAIL_CREDENTIAL_SAVE_FAILED/);
  assert.match(gmail,/GMAIL_ACCOUNT_UPDATE_FAILED/);
  assert.match(gmail,/GOOGLE_GMAIL_API_DISABLED/);
  assert.match(gmail,/const safe=approved\.has\(codeValue\)\?codeValue:"GOOGLE_OAUTH_FAILED"/);
  assert.doesNotMatch(gmail,/codeValue\+":"\+message/);
});

test("Gmail historical and incremental mail sync are scheduled without new credentials or sending",()=>{
  const gmail=read("./mail-google-gmail.ts");
  const entry=read("./main-entry-security.ts");
  const wrangler=read("../wrangler.jsonc");
  assert.match(entry,/runGmailMailScheduledSync\(env\)/);
  assert.match(entry,/await runGmailMailScheduledSync\(env\)\.catch/);
  assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/);
  assert.match(gmail,/export async function runGmailMailScheduledSync/);
  assert.match(gmail,/syncGmailAccountStep\(c,tenant,account/);
  assert.match(gmail,/GMAIL_CRON/);
  assert.match(gmail,/GMAIL_HISTORY/);
  assert.match(gmail,/GMAIL_PAGE/);
  assert.match(gmail,/gmailHistoryQueuePage/);
  assert.match(gmail,/gmailHistoryAdvance/);
  assert.match(gmail,/if\(Number\(error\?\.status\)!==404\)throw error/);
  assert.match(gmail,/mail_folders WHERE main_company_slug=\? AND account_id=\?/);
  assert.doesNotMatch(gmail,/revokeToken|DELETE FROM mail_messages/);
});
test("Mail readiness requires both full Gmail archive and live history checkpoint",()=>{
  const core=read("./mail-communication-core.ts");
  assert.match(core,/gmail_history_cursor/);
  assert.match(core,/gmailHistoryLive/);
  assert.match(core,/microsoft\|\|gmailHistoryLive/);
  const ui=read("../../../app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx");
  assert.match(ui,/gmailAutoLastAt/);
  assert.match(ui,/Şimdi Tara \(isteğe bağlı\)/);
  assert.match(ui,/window\.setInterval/);
});

test("Gmail cron treats a failed page as ERROR, does not report a false zero-message success",()=>{
  const source=read("./mail-google-gmail.ts");
  assert.match(source,/if\(result\.folders\.some\(\(folder:any\)=>!folder\.ok\)\)/);
  assert.match(source,/await record\(reason,\{processed,completed,total,lastFolder,stage\}\)/);
  assert.match(source,/reason:code\|\|""/);
  assert.match(source,/gmailSafeFailure\(error\)/);
  assert.match(source,/lastError=failed\?/);
  assert.doesNotMatch(source,/lastError=errorText\|\| \(failed\?failed\+" mesaj işlenemedi\.":"SYNC_PENDING_PAGINATION"\)/);
});
test("Gmail UI exposes verified error state and stops calling bad pages 'automatic success'",()=>{
  const core=read("./mail-communication-core.ts");
  const page=read("../../../app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx");
  assert.match(core,/gmailAutoFailureReason/);
  assert.match(core,/gmailAutoStage/);
  assert.match(core,/gmailPageFailureReason/);
  assert.match(core,/SYNC_PENDING_PAGINATION/);
  assert.match(page,/gmailAutoStatus === "ERROR"/);
  assert.match(page,/Gmail otomatik senkronizasyonu ilerleyemedi/);
});
