import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Gmail full sync visits all enabled real labels with bounded resumable pagination",()=>{
  const source=read("./mail-google-gmail.ts");
  assert.match(source,/folderRows/);
  assert.match(source,/f\.sync_enabled=1/);
  assert.match(source,/folderMap\.has\(text\(row\.provider_folder_id\)\)/);
  assert.match(source,/s\.cursor_type='GMAIL_PAGE'/);
  assert.match(source,/gmailReadPageToken\(previous\)/);
  assert.match(source,/GMAIL_PAGE_SIZE/);
  assert.match(source,/GMAIL_FOLDERS_PER_PASS/);
  assert.match(source,/url\.searchParams\.set\("pageToken",pageToken\)/);
  assert.match(source,/includeSpamTrash/);
  assert.match(source,/gmailSyncPageState\(previous,nextPageToken,failed\)/);
  assert.match(source,/completedFolders!==totalFolders/);
  assert.match(source,/partial\?207:200/);
  assert.doesNotMatch(source,/const defs=\[\["INBOX","INCOMING"\],\["SENT","OUTGOING"\]\]/);
});

test("Multi-label Gmail replay keeps primary folder stable and File Hub attachment proof",()=>{
  const source=read("./mail-google-gmail.ts");
  assert.match(source,/gmailCanonicalLabel\(full\.labelIds,labelId,folderMap\.keys\(\)\)/);
  assert.match(source,/SELECT \* FROM mail_attachments WHERE main_company_slug=\? AND message_id=\?/);
  assert.match(source,/same\?old\.file_asset_id:null/);
  assert.match(source,/removed:true/);
  assert.doesNotMatch(source,/DELETE FROM mail_attachments WHERE/);
});

test("Provider health requires 15 of 15 genuine completed Gmail pages, not old history pointer",()=>{
  const core=read("./mail-communication-core.ts");
  assert.match(core,/gmail_completed_folder_count/);
  assert.match(core,/s\.cursor_type='GMAIL_PAGE'/);
  assert.match(core,/s\.cursor_value='DONE'/);
  assert.match(core,/completed===enabled/);
  assert.match(core,/a\.provider_type='GMAIL' AND s\.cursor_type='GMAIL_PAGE'/);
  assert.doesNotMatch(core,/const syncHealthy=enabled>0&&completed===enabled&&Number\(row\.sync_success_count/);
});

test("Gmail hızlı klasör yenilemesi çoklu etiketlerde aynı kanonik konumu korur",()=>{
  const source=read("./mail-google-gmail.ts");
  assert.match(source,/const canonical=gmailCanonicalLabel\(known,labelId,known\)/);
  assert.match(source,/const destination=canonical===labelId\?folder:await ensureFolder/);
});
