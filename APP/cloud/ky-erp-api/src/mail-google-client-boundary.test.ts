import test from "node:test";
import assert from "node:assert/strict";
import {gmailOAuthClientReadiness} from "./mail-google-client-boundary.ts";
test("Gmail Drive kimlik bilgilerine fallback yapmaz",()=>{
  const state=gmailOAuthClientReadiness({GOOGLE_DRIVE_CLIENT_ID:"drive",GOOGLE_DRIVE_CLIENT_SECRET:"secret"});
  assert.equal(state.configured,false);
  assert.equal(state.configurationMode,"MISSING_DEDICATED_GMAIL");
});
test("Gmail Client ID ve Secret ikisi de gereklidir",()=>{
  assert.equal(gmailOAuthClientReadiness({GOOGLE_MAIL_CLIENT_ID:"mail"}).configured,false);
  assert.equal(gmailOAuthClientReadiness({GOOGLE_MAIL_CLIENT_SECRET:"secret"}).configured,false);
});
test("Drive ile aynı istemci Gmail'e bağlanamaz",()=>{
  const state=gmailOAuthClientReadiness({GOOGLE_MAIL_CLIENT_ID:"same",GOOGLE_MAIL_CLIENT_SECRET:"mail",GOOGLE_DRIVE_CLIENT_ID:"same"});
  assert.equal(state.configurationMode,"DRIVE_CLIENT_REUSED");
});
test("Ayrı Gmail kimlik bilgileri hazırdır",()=>{
  const state=gmailOAuthClientReadiness({GOOGLE_MAIL_CLIENT_ID:"mail-id",GOOGLE_MAIL_CLIENT_SECRET:"mail-secret",GOOGLE_DRIVE_CLIENT_ID:"drive-id"});
  assert.equal(state.configured,true); assert.equal(state.configurationMode,"DEDICATED_GMAIL");
});
