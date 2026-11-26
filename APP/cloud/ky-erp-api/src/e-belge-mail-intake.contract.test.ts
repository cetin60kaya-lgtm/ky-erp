import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("./mail-microsoft-graph.ts",import.meta.url),"utf8");
const intake=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");
test("existing Outlook metadata is durable; intake is opted in, atomic claim, no automatic retry",()=>{
 assert.match(s,/scope_code=\? LIMIT 1/);assert.match(s,/intakeScope="EBELGE_INCOMING_DISPATCH"/);assert.match(s,/state:"PROCESSING"/);assert.match(s,/claim.meta.changes!==1/);assert.match(s,/companyAdminRole\(current.role\)/);assert.match(s,/state:"REVIEW"/);assert.match(s,/scheduledIncomingMailIntake/);
 assert.match(intake,/owner.taxNos.includes\(identity.recipientTax\)/);assert.match(intake,/incomingDispatchKey\(sourceIdentity\(slug,p\)\)/);assert.match(intake,/preserveIntakeFailure/);
});
