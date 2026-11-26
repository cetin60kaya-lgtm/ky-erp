import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const intake=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");
const draft=readFileSync(new URL("./e-belge-draft-routes.ts",import.meta.url),"utf8");
test("incoming XML reconciliation cannot overwrite mismatched lines, identity or locked posting",()=>{
 assert.match(intake,/identity==="SAME_ETTN"&&knownRecipient&&sameLines/);
 assert.match(intake,/xml_file_asset_id IS NULL/);
 assert.match(intake,/EARLY_DISPATCH_SOURCE_CONFLICT/);
 assert.match(intake,/SOURCE_RECONCILIATION_REQUIRED/);
 assert.match(intake,/record\.sourceConflict/);
});
test("draft CHECK fails closed if second opinion fails; SAVE does not call model",()=>{
 assert.match(draft,/if\(body\.action==="CHECK"\)\{const result=await mandatoryDraftAiReview/);
 assert.match(draft,/ledger\.recorded/);
 assert.match(draft,/skipCache:true,collectLog:false/);
 assert.match(draft,/parsed\.status!=="PASS"/);
 assert.match(draft,/sendAllowed:false/);
});
