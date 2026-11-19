import test from "node:test";
import assert from "node:assert/strict";
import { gmailOAuthFeedback } from "./mailGoogleOAuthFeedback.js";

const params=(input)=>new URLSearchParams(input);
test("Google OAuth success means saved credential, not completed sync",()=>{
  assert.deepEqual(gmailOAuthFeedback(params("mailProvider=GMAIL&mailConnected=1")).ok,true);
  assert.match(gmailOAuthFeedback(params("mailProvider=GMAIL&mailConnected=1")).text,/senkronu henüz ayrıca/);
});
test("Callback uses exact error code, avoids provider descriptions and unknown codes",()=>{
  const failure=gmailOAuthFeedback(params("mailProvider=GMAIL&mailError=GOOGLE_GMAIL_API_DISABLED"));
  assert.equal(failure.code,"GOOGLE_GMAIL_API_DISABLED");
  assert.match(failure.text,/Gmail API/);
  const unknown=gmailOAuthFeedback(params("mailProvider=GMAIL&mailError=UNKNOWN:secret-provider-description"));
  assert.equal(unknown.code,"GOOGLE_OAUTH_FAILED");
  assert.doesNotMatch(unknown.text,/secret-provider-description/);
});
test("Wrong Google mailbox and missing refresh permission have distinct messages",()=>{
  assert.match(gmailOAuthFeedback(params("mailProvider=GMAIL&mailError=GOOGLE_ACCOUNT_MISMATCH")).text,/eşleşmiyor/);
  assert.match(gmailOAuthFeedback(params("mailProvider=GMAIL&mailError=GOOGLE_REFRESH_TOKEN_MISSING")).text,/kalıcı yenileme izni/);
});
test("Microsoft OAuth callback is not consumed by Google control",()=>{
  assert.equal(gmailOAuthFeedback(params("mailProvider=MICROSOFT&mailError=GOOGLE_OAUTH_FAILED")),null);
});
