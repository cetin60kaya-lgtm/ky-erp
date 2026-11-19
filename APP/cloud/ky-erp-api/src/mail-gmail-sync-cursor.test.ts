import test from "node:test";
import assert from "node:assert/strict";
import {gmailCanonicalLabel,gmailSyncPageState,gmailReadPageToken,GMAIL_PAGE_SIZE,GMAIL_FOLDERS_PER_PASS} from "./mail-gmail-sync-cursor.ts";

test("Gmail çoklu etiket: gelen mesaj iki kez farklı klasöre taşınmaz",()=>{
  const labels=["INBOX","MUSTERI","STARRED","UNREAD"];
  const known=["INBOX","MUSTERI","STARRED"];
  assert.equal(gmailCanonicalLabel(labels,"MUSTERI",known),"INBOX");
  assert.equal(gmailCanonicalLabel(labels,"STARRED",known),"INBOX");
});
test("Gmail çoklu özel etiketlerde aynı kanonik klasör seçilir",()=>{
  const labels=["BASKI","MUSTERI","IMPORTANT"];
  assert.equal(gmailCanonicalLabel(labels,"BASKI",labels),"BASKI");
  assert.equal(gmailCanonicalLabel(labels,"MUSTERI",labels),"BASKI");
});
test("Gmail sayfa tokenı bittiğinde yalnız başarılı son sayfa tamamlanır",()=>{
  assert.equal(gmailSyncPageState("","opaque-next",0).complete,false);
  assert.equal(gmailReadPageToken("PAGE:opaque-next"),"opaque-next");
  assert.deepEqual(gmailSyncPageState("PAGE:opaque-next","",0),{cursor:"DONE",complete:true,error:false});
  assert.deepEqual(gmailSyncPageState("PAGE:opaque-next","another",1),{cursor:"PAGE:opaque-next",complete:false,error:true});
  assert.equal(gmailSyncPageState("","",1).complete,false);
});
test("Gmail istek başına sayfa ve klasör sınırları belirli",()=>{
  assert.ok(GMAIL_PAGE_SIZE>0&&GMAIL_PAGE_SIZE<=100);
  assert.ok(GMAIL_FOLDERS_PER_PASS>0&&GMAIL_FOLDERS_PER_PASS<=5);
});
