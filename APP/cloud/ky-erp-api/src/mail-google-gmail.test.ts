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
