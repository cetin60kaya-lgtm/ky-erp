import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page=readFileSync(new URL("./InvoiceMailWorkspace.jsx",import.meta.url),"utf8");

test("Outlook mail tek ekranda hazırlanır, taslak onay olmadan da kaydedilebilir",()=>{
 assert.match(page,/setSendAcknowledged/);
 assert.match(page,/Taslak Kaydet/);
 assert.match(page,/!sendNow/);
 assert.match(page,/setNotice\("Taslak KY ERP'de kaydedildi. Mail gönderilmedi."\)/);
 assert.doesNotMatch(page,/window\.location\.href\s*=/);
});
test("Gönder açık onay ve taze sunucu preflight olmadan Graph çağırmaz",()=>{
 const send=page.slice(page.indexOf("const processMail = async"),page.indexOf("return <section className=\"invoice-mail-workspace\""));
 assert.match(send,/sendNow && !sendAcknowledged/);
 assert.match(send,/apiPost\("\/muhasebe\/invoice-mail-preflight"/);
 assert.ok(send.indexOf("invoice-mail-preflight")<send.indexOf("sendMailDraft(prepared.id"));
 assert.match(page,/!sendAcknowledged \|\| working/);
 assert.match(page,/Alıcıları, HKN\/DDM PDF eklerini/);
});
test("Gönderim belirsizse tekrarı bloke ve kullanıcıya bildir",()=>{
 assert.match(page,/UNKNOWN_REVIEW_REQUIRED/);
 assert.match(page,/setDispatchLocked\(true\)/);
 assert.match(page,/Tekrar gönderim kilitlendi/);
});
