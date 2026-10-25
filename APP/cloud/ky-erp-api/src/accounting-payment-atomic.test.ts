import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { postAccountingPaymentAtomic } from "./accounting-payment-atomic.ts";

// D1 API-compatible real SQLite fixture: SQL constraints + atomic db.batch(), no live D1.
class LocalD1 {
  sql: DatabaseSync;
  injectFailure = false;
  constructor() {
    this.sql = new DatabaseSync(":memory:");
    this.sql.exec("CREATE TABLE accounting_payment_plans (id TEXT PRIMARY KEY,main_company_slug TEXT,status TEXT,paid_amount REAL,amount REAL,currency TEXT,counterparty_id TEXT,counterparty_name TEXT,description TEXT,payment_method TEXT,bank_account_id TEXT,source_document_id TEXT,updated_at TEXT)");
    this.sql.exec("CREATE TABLE accounting_ledger_entries (id TEXT PRIMARY KEY,main_company_slug TEXT,entry_date TEXT,entry_type TEXT,record_scope TEXT,company_id TEXT,company_name TEXT,description TEXT,debit REAL,credit REAL,currency TEXT,payment_method TEXT,bank_account_id TEXT,source_document_id TEXT,source_payment_plan_id TEXT,file_asset_id TEXT,note TEXT,created_by TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT)");
    this.sql.prepare("INSERT INTO accounting_payment_plans (id,main_company_slug,status,paid_amount,amount,currency,counterparty_name) VALUES (?,?,?,?,?,?,?)").run("plan1","tenant1","PLANNED",0,100,"TRY","Firma Fixture");
  }
  prepare(query: string) {
    const db = this.sql;
    return {
      bind(...args: any[]) {
        return {
          query, args,
          first: async () => db.prepare(query).get(...args) || null,
          all: async () => ({ results: db.prepare(query).all(...args) }),
          run: async () => ({ meta: { changes: db.prepare(query).run(...args).changes } }),
        };
      },
    };
  }
  async batch(statements: any[]) {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const [index, stmt] of statements.entries()) {
        const out = this.sql.prepare(stmt.query).run(...stmt.args);
        results.push({ meta: { changes: out.changes } });
        if (this.injectFailure && index === 0) throw new Error("Injected second-write failure");
      }
      this.sql.exec("COMMIT");
      return results;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }
  snapshot() {
    const plan = this.sql.prepare("SELECT * FROM accounting_payment_plans WHERE id='plan1' AND main_company_slug='tenant1'").get() as any;
    const posted = this.sql.prepare("SELECT COALESCE(ROUND(SUM(debit),2),0) AS amount, COUNT(*) AS count FROM accounting_ledger_entries WHERE main_company_slug='tenant1' AND source_payment_plan_id='plan1' AND deleted_at IS NULL").get() as any;
    return { paid: plan.paid_amount, status:plan.status, amount:posted.amount, count:posted.count };
  }
}

const call = (db: LocalD1, target:number, extras:any={},slug="tenant1") =>
  postAccountingPaymentAtomic(db,slug,"plan1",{confirmed:true,paidAmount:target,currency:"TRY",...extras},"user-real-session");
test("aynı hedef için 20 eşzamanlı POST tam bir defter artışı üretir",async()=>{
  const db=new LocalD1();
  const results=await Promise.all(Array.from({length:20},()=>call(db,50)));
  assert.ok(results.every(r=>r.status===200),JSON.stringify(results.filter(r=>r.status!==200)));
  assert.deepEqual(db.snapshot(),{paid:50,status:"PARTIAL",amount:50,count:1});
  const retry=await call(db,50);
  assert.equal(retry.body.data.idempotent,true);
  assert.equal(db.snapshot().count,1);
});
test("100 rakip kümülatif hedef arasında bakiye doğruluğu, rollback 409 ve çift yazma yok",async()=>{
  const db=new LocalD1();
  const payments=Array.from({length:100},(_,i)=>(i+1)/100);
  const results=await Promise.all(payments.map(n=>call(db,n)));
  assert.equal(results.length,100);
  assert.ok(results.every(r=>[200,409].includes(r.status)),JSON.stringify(results.filter(r=>![200,409].includes(r.status))));
  assert.equal(db.snapshot().paid,1);
  assert.equal(db.snapshot().amount,1);
  assert.ok(db.snapshot().count>=1&&db.snapshot().count<=100);
  assert.equal((await call(db,0.01)).status,409);
});
test("farklı iki hedef yarışında defter=plan tutarı ve ikinci tekrar idempotent",async()=>{
  const db=new LocalD1();
  const first=await Promise.all([call(db,30),call(db,70)]);
  assert.ok(first.every(r=>[200,409].includes(r.status)));
  assert.equal(db.snapshot().paid,70);
  assert.equal(db.snapshot().amount,70);
  const count=db.snapshot().count;
  assert.equal((await call(db,70)).body.data.idempotent,true);
  assert.equal(db.snapshot().count,count);
});
test("batch ikinci yazmada hata olursa plan ve defter birlikte rollback olur; tekrar güvenli",async()=>{
  const db=new LocalD1();db.injectFailure=true;
  const failed=await call(db,25);
  assert.equal(failed.status,503);
  assert.deepEqual(db.snapshot(),{paid:0,status:"PLANNED",amount:0,count:0});
  db.injectFailure=false;
  assert.equal((await call(db,25)).status,200);
  assert.deepEqual(db.snapshot(),{paid:25,status:"PARTIAL",amount:25,count:1});
});
test("tenant, yetkili oturum, açık onay, cancelled, currency, 0.01 ve sahte para engeli",async()=>{
  const db=new LocalD1();
  assert.equal((await call(db,20,{},"tenant2")).status,404);
  assert.equal((await postAccountingPaymentAtomic(db,"tenant1","plan1",{confirmed:true,paidAmount:10},"")).status,403);
  assert.equal((await call(db,20,{confirmed:false})).status,400);
  assert.equal((await call(db,20,{currency:"USD"})).status,409);
  for(const n of [0,-1,NaN,Infinity,0.001,101]) assert.equal((await call(db,n)).status,400,String(n));
  assert.equal((await call(db,0.01)).status,200);
  assert.deepEqual(db.snapshot(),{paid:0.01,status:"PARTIAL",amount:0.01,count:1});
  db.sql.exec("UPDATE accounting_payment_plans SET status='CANCELLED' WHERE id='plan1'");
  assert.equal((await call(db,2)).status,409);
  assert.equal(db.snapshot().count,1);
});
test("eski bozuk defter-bakiye farkı otomatik tamamlanmaz",async()=>{
  const db=new LocalD1();
  db.sql.exec("UPDATE accounting_payment_plans SET paid_amount=8,status='PARTIAL' WHERE id='plan1'");
  const result=await call(db,10);
  assert.equal(result.status,409);
  assert.equal(result.body.error.code,"PAYMENT_LEDGER_OUT_OF_SYNC");
  assert.equal(db.snapshot().count,0);
});
