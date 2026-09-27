import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mailReplyContext, gmailReplyHeaders } from "./mail-reply-context.ts";

test("reply target is isolated by tenant and mailbox and preserves provider conversation", async () => {
  const sqlite=new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE mail_messages(id,main_company_slug,account_id,thread_id,provider_message_id,internet_message_id,subject); CREATE TABLE mail_threads(id,main_company_slug,account_id,provider_thread_id)");
    sqlite.prepare("INSERT INTO mail_messages VALUES(?,?,?,?,?,?,?)").run("message","tenant","account","thread","provider-message","<message@example.invalid>","Subject");
    sqlite.prepare("INSERT INTO mail_threads VALUES(?,?,?,?)").run("thread","tenant","account","provider-thread");
    const db={prepare(sql:string){return {bind(...values:string[]){return {async first(){return sqlite.prepare(sql).get(...values)||null;}}}}}} as unknown as D1Database;
    const original=await mailReplyContext(db,"tenant","account","message");
    assert.equal(original?.provider_thread_id,"provider-thread");
    assert.deepEqual(gmailReplyHeaders(original),["In-Reply-To: <message@example.invalid>","References: <message@example.invalid>"]);
    await assert.rejects(mailReplyContext(db,"other-tenant","account","message"),/bu posta kutusunda bulunamadı/);
    await assert.rejects(mailReplyContext(db,"tenant","other-account","message"),/bu posta kutusunda bulunamadı/);
    assert.equal(await mailReplyContext(db,"tenant","account",""),null);
    assert.throws(()=>gmailReplyHeaders({internet_message_id:"<id>\r\nBcc: attacker@example.invalid",provider_thread_id:"thread"}),/Yanıt ilişkisi eksik/);
    assert.throws(()=>gmailReplyHeaders({internet_message_id:"<id>",provider_thread_id:""}),/Yanıt ilişkisi eksik/);
  } finally { sqlite.close(); }
});
