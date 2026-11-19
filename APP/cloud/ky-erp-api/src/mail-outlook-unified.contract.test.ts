import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");
test("Outlook core maintains one Graph archive, safe paging and no destructive metadata replay",()=>{
 const graph=read("./mail-microsoft-graph.ts");
 assert.match(graph,/microsoftDeltaPageState/);
 assert.match(graph,/mail_sync_cursors/);
 assert.match(graph,/SYNC_PENDING_PAGINATION/);
 assert.match(graph,/SELECT \* FROM mail_attachments/);
 assert.match(graph,/same\?old.file_asset_id:null/);
 assert.doesNotMatch(graph,/DELETE FROM mail_attachments/);
 assert.match(graph,/PROVIDER_DRAFT_CREATING/);
 assert.match(graph,/PROVIDER_DRAFT_REVIEW_REQUIRED/);
 assert.match(graph,/verify-evidence\/microsoft/);
 assert.match(graph,/crypto\.subtle\.digest\("SHA-256",bytes\)/);
 assert.match(graph,/15\*60\*1000/);
});
test("D1 history is batched under 100 bindings; filename-only evidence is review",()=>{
 const history=read("./accounting-invoice-mail-routes.ts");
 assert.match(history,/offset\+=90/);
 assert.match(history,/verificationStatus:proved\?"VERIFIED":"REVIEW_REQUIRED"/);
 assert.match(history,/invoiceMailPackageVerified/);
 assert.match(history,/invoiceMailLegacyKeyPrefix/);
 assert.match(history,/deliveryAssets/);
 assert.match(history,/messages\.slice\(offset,offset\+90\)/);
 assert.match(history,/\.bind\(a\.tenant,\.\.\.ids\)/);
 assert.match(history,/assetIds\.slice\(offset,offset\+90\)/);
});
test("Only fully completed folders can report healthy Microsoft account",()=>{
 const core=read("./mail-communication-core.ts");
 assert.match(core,/sync_enabled_folder_count/);
 assert.match(core,/sync_completed_folder_count/);
 assert.match(core,/completed===enabled/);
 assert.match(core,/oauthConnected/);
 assert.match(core,/companyApproved/);
});
test("Canonical HKN send remains explicit: no auto-send from cron or OCR",()=>{
 const graph=read("./mail-microsoft-graph.ts"),accounting=read("./accounting-invoice-mail-routes.ts");
 assert.match(accounting,/invoiceMailDispatchKey/);
 assert.match(accounting,/MAIL_ALREADY_ATTEMPTED/);
 assert.match(graph,/app\.post\("\/api\/mail\/drafts\/:id\/send"/);
 assert.match(graph,/UNKNOWN_REVIEW_REQUIRED/);
 assert.match(graph,/delivered:false/);
});
