import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { claimEBelgeFinalization, markEBelgeFinalization } from "./e-belge-finalize-guard.ts";

class LocalD1 {
  sql:DatabaseSync;
  constructor(){
    this.sql=new DatabaseSync(":memory:");
    this.sql.exec("CREATE TABLE accounting_documents (id TEXT PRIMARY KEY,main_company_slug TEXT NOT NULL,status TEXT NOT NULL,approved_by TEXT,approved_at TEXT,updated_at TEXT NOT NULL,posted_at TEXT,deleted_at TEXT)");
    this.sql.prepare("INSERT INTO accounting_documents (id,main_company_slug,status,updated_at) VALUES (?,?,?,?)").run("doc1","tenant1","REVIEW_REQUIRED","2026-10-25T10:00:00.000Z");
  }
  prepare(sql:string){const db=this.sql;return {bind(...args:any[]){return {
    first:async()=>db.prepare(sql).get(...args)||null,
    run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}}),
  }}}}
  snapshot(){return this.sql.prepare("SELECT * FROM accounting_documents WHERE id='doc1'").get() as any}
}
const claim=(db:LocalD1,slug="tenant1",version="2026-10-25T10:00:00.000Z")=>
  claimEBelgeFinalization(db,slug,"doc1",version,"session-user-id");
test("20 eşzamanlı finalize CAS talebinde yalnız tek yetkili istek kazanır",async()=>{
  const d=new LocalD1();const results=await Promise.all(Array.from({length:20},()=>claim(d)));
  assert.equal(results.filter(x=>x.ok).length,1);
  assert.equal(results.filter(x=>!x.ok && x.code==="FINALIZE_CONFLICT").length,19);
  assert.equal(d.snapshot().status,"FINALIZING");
});
test("100 eşzamanlı finalize yalnız tek onay rezervasyonu oluşturur",async()=>{
  const d=new LocalD1();const results=await Promise.all(Array.from({length:100},()=>claim(d)));
  assert.equal(results.filter(x=>x.ok).length,1);
  assert.equal(results.filter(x=>!x.ok).length,99);
  assert.equal(d.snapshot().approved_by,"session-user-id");
});
test("farklı tenant/sürüm, çift gönderim, geçersiz oturum kapalı",async()=>{
  const d=new LocalD1();
  assert.equal((await claim(d,"tenant2")).code,"NOT_FOUND");
  assert.equal((await claim(d,"tenant1","old")).code,"FINALIZE_CONFLICT");
  assert.equal((await claimEBelgeFinalization(d,"tenant1","doc1","","session-user-id")).code,"FINALIZE_CONTEXT_REQUIRED");
  assert.equal((await claim(d)).ok,true);
  assert.equal((await claim(d)).code,"FINALIZE_CONFLICT");
});
test("stok veya KDV hata evresinde görünür retry durumu, posted değil",async()=>{
  const d=new LocalD1();await claim(d);
  const response=await markEBelgeFinalization(d,"tenant1","doc1","FINALIZE_RETRY");
  assert.equal(Number(response.meta.changes),1);
  assert.equal(d.snapshot().status,"FINALIZE_RETRY");
  assert.equal(d.snapshot().posted_at,null);
  assert.equal((await claim(d,"tenant1",d.snapshot().updated_at)).code,"FINALIZE_CONFLICT");
});
test("posted belge kullanıcı tekrarına rağmen değişmez",async()=>{
  const d=new LocalD1();d.sql.exec("UPDATE accounting_documents SET status='POSTED',posted_at='2026-10-25T12:00:00.000Z' WHERE id='doc1'");
  const value=await claim(d);
  assert.equal(value.code,"DOCUMENT_ALREADY_POSTED");
  assert.equal(d.snapshot().status,"POSTED");
});
