import test from "node:test";
import assert from "node:assert/strict";
import {gmailSafeStage,gmailSafeFailure,gmailCronVisibleState} from "./mail-gmail-diagnostics.ts";
test("Sensitive provider messages never enter a public sync error code",()=>{
  const error={code:"GOOGLE_TOKEN_FAILED",providerCode:"invalid_client",message:"token=sensitive"};
  assert.equal(gmailSafeFailure(error),"GMAIL_OAUTH_CLIENT_INVALID");
  assert.equal(gmailSafeFailure({code:"OTHER",message:"token=sensitive"}),"GMAIL_SYNC_STEP_FAILED");
});
test("Recognized Gmail and D1 failures are explicit yet secret-free",()=>{
  assert.equal(gmailSafeFailure({status:429}),"GMAIL_RATE_LIMITED");
  assert.equal(gmailSafeFailure({code:"GOOGLE_GMAIL_API_DISABLED"}),"GMAIL_API_DISABLED");
  assert.equal(gmailSafeFailure({message:"Too many API requests by single worker invocation"}),"GMAIL_D1_LIMIT_OR_DATABASE_ERROR");
  assert.equal(gmailSafeStage("GMAIL_TOKEN"),"GMAIL_TOKEN");
  assert.equal(gmailSafeStage("token=sensitive"),"UNKNOWN");
});
test("Only safe fixed-format error codes are exposed to readiness",()=>{
  const state=gmailCronVisibleState(JSON.stringify({state:"ERROR",reason:"GMAIL_RATE_LIMITED",stage:"GMAIL_PAGES",processed:0,completed:2,total:15,lastFolder:"INBOX"}));
  assert.equal(state.reason,"GMAIL_RATE_LIMITED");
  assert.equal(state.completed,2);
  assert.equal(state.status,"ERROR");
  assert.equal(gmailCronVisibleState(JSON.stringify({state:"ERROR",reason:"token-is-secret",stage:"abc"})).reason,"");
});
