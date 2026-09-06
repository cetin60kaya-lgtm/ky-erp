import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(name:string)=>readFileSync(new URL(name,import.meta.url),"utf8");

test("File Hub mail attachments are tenant-scoped and no longer stop at provider pending",()=>{
  const hub=read("./file-hub-cloud-oauth.ts");
  const core=read("./mail-communication-core.ts");
  const gmail=read("./mail-google-gmail.ts");
  const microsoft=read("./mail-microsoft-graph.ts");
  assert.match(hub,/readFileHubAssetForMail/);
  assert.match(hub,/WHERE id=\? AND main_company_slug=\?/);
  assert.match(core,/can_attach/);
  assert.match(core,/validateDraftAttachments/);
  assert.match(gmail,/multipart\/mixed/);
  assert.match(gmail,/readFileHubAssetForMail/);
  assert.match(microsoft,/createUploadSession/);
  assert.match(microsoft,/contentBytes/);
  assert.match(microsoft,/syncMicrosoftDraftAttachments/);
  assert.doesNotMatch(gmail,/ATTACHMENT_PROVIDER_SYNC_PENDING/);
  assert.doesNotMatch(microsoft,/ATTACHMENT_PROVIDER_SYNC_PENDING/);
});

test("Mail account list reports approval, OAuth and sync readiness separately",()=>{
  const core=read("./mail-communication-core.ts");
  assert.match(core,/credential_present/);
  assert.match(core,/last_sync_success_at/);
  assert.match(core,/companyApproved/);
  assert.match(core,/oauthConnected/);
  assert.match(core,/syncHealthy/);
  assert.match(core,/complete:companyApproved&&oauthConnected&&syncHealthy/);
});
