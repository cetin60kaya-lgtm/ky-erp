import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { postAccountingDocumentAtomic } from "./accounting-document-posting-atomic.ts";

class TestD1 {
  sql:DatabaseSync;
  injectAt=-1;
  constructor({stock=false,vatTable=true,track=true}={}){
    this.sql=new DatabaseSync(":memory:");
    this.sql.exec("CREATE TABLE accounting_documents(id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL, status TEXT,posted_at TEXT,deleted_at TEXT,document_type TEXT,party_company_id TEXT,direction TEXT,payable_total REAL,tax_total REAL,subtotal REAL,record_scope TEXT,document_no TEXT,issue_date TEXT,currency TEXT,raw_metadata TEXT,updated_at TEXT)");
    this.sql.exec("CREATE TABLE companies(id TEXT PRIMARY KEY,main_company_slug TEXT,deleted_at TEXT,name TEXT,current_balance REAL,supplier_debt_tracking INTEGER,customer_receivable_tracking INTEGER,updated_at TEXT)");
    this.sql.exec("CREATE TABLE accounting_ledger_entries(id TEXT PRIMARY KEY,main_company_slug TEXT,source_document_id TEXT,entry_date TEXT,entry_type TEXT,record_scope TEXT,company_id TEXT,company_name TEXT,description TEXT,debit REAL,credit REAL,currency TEXT,payment_method TEXT,note TEXT,created_by TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT)");
    this.sql.exec("CREATE TABLE current_account_movements(id TEXT PRIMARY KEY,main_company_slug TEXT,company_id TEXT,document_id TEXT,movement_date TEXT,movement_type TEXT,source_type TEXT,document_no TEXT,description TEXT,debit REAL,credit REAL,amount REAL,effect REAL,balance_after REAL,raw TEXT,created_at TEXT,updated_at TEXT)");
    if(vatTable)this.sql.exec("CREATE TABLE vat_records(id TEXT PRIMARY KEY,main_company_slug TEXT,company_id TEXT,firm_id TEXT,document_id TEXT,date TEXT,period_year INTEGER,period_month INTEGER,incoming_vat REAL,outgoing_vat REAL,carry_vat REAL,raw TEXT,created_at TEXT,updated_at TEXT)");
    this.sql.prepare("INSERT INTO accounting_documents(id,main_company_slug,status,document_type,party_company_id,direction,payable_total,tax_total,subtotal,record_scope,document_no,issue_date,currency,raw_metadata,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
     .run("doc1","tenantA","APPROVED","GELEN_FATURA","companyA","INCOMING",120,20,100,"OFFICIAL","INVTEST","2026-10-25","TRY","{}","2026-10-25T00:00:00Z");
    this.sql.prepare("INSERT INTO companies(id,main_company_slug,name,current_balance,supplier_debt_tracking,customer_receivable_tracking) VALUES(?,?,?,?,?,?)").run("companyA","tenantA","Tedarikçi test",0,track?1:0,1);
  }
  prepare(query:string){
    const db=this.sql;
    return {bind(...args:any[]){
      return {query,args,first:async()=>db.prepare(query).get(...args)||null,
        all:async()=>({results:db.prepare(query).all(...args)}),
        run:async()=>({meta:{changes:db.prepare(query).run(...args).changes}})};
    },all:async()=>({results:db.prepare(query).all()})};
  }
  async batch(stmts:any[]){
    this.sql.exec("BEGIN IMMEDIATE");
    try{
      const r=[];
      for(const [i,q] of stmts.entries()){
        if(i===this.injectAt)throw Error("Injected DB failure");
        const value=this.sql.prepare(q.query).run(...q.args);
        r.push({meta:{changes:value.changes}});
      }
      this.sql.exec("COMMIT");return r;
    }catch(e){this.sql.exec("ROLLBACK");throw e;}
  }
  snapshot(){
    const count=(t:string)=>Number((this.sql.prepare("SELECT COUNT(*) AS n FROM "+t).get() as any).n);
    return {
      status:(this.sql.prepare("SELECT status FROM accounting_documents WHERE id='doc1'").get() as any)?.status,
      current:Number((this.sql.prepare("SELECT current_balance AS n FROM companies WHERE id='companyA'").get() as any).n),
      movements:count("current_account_movements"),ledger:count("accounting_ledger_entries"),
      vat:count("vat_records"),
    };
  }
}
const post=(d:TestD1,tenant="tenantA")=>postAccountingDocumentAtomic(d,tenant,"doc1","session-user-1");

test("Finans hizmet faturası: cari, bakiye, defter, KDV ve POSTED tek transaction",async()=>{
  const d=new TestD1();
  const r=await post(d);
  assert.equal(r.status,"POSTED");
  assert.deepEqual(d.snapshot(),{status:"POSTED",current:-120,movements:1,ledger:1,vat:1});
  assert.equal((await post(d)).idempotent,true);
  assert.deepEqual(d.snapshot(),{status:"POSTED",current:-120,movements:1,ledger:1,vat:1});
});
test("20 yarışan aynı belge: yalnız tek finans zinciri",async()=>{
  const d=new TestD1();
  const rs=await Promise.allSettled(Array.from({length:20},()=>post(d)));
  assert.equal(rs.filter(x=>x.status==="fulfilled"&&!x.value.idempotent).length,1);
  assert.deepEqual(d.snapshot(),{status:"POSTED",current:-120,movements:1,ledger:1,vat:1});
});
test("100 yarışan aynı belge: hiç mükerrer cari/defter/KDV yok",async()=>{
  const d=new TestD1();
  await Promise.allSettled(Array.from({length:100},()=>post(d)));
  assert.deepEqual(d.snapshot(),{status:"POSTED",current:-120,movements:1,ledger:1,vat:1});
});
test("KDV yazısında hata: her satır ROLLBACK, belge APPROVED kalır",async()=>{
  const d=new TestD1();d.injectAt=3;
  await assert.rejects(()=>post(d),(e:any)=>e.code==="DOCUMENT_ATOMIC_POST_FAILED");
  assert.deepEqual(d.snapshot(),{status:"APPROVED",current:0,movements:0,ledger:0,vat:0});
  d.injectAt=-1;await post(d);
  assert.deepEqual(d.snapshot(),{status:"POSTED",current:-120,movements:1,ledger:1,vat:1});
});
test("KDV tablosu eksikse hiçbir para/defter kaydı oluşturulmaz",async()=>{
  const d=new TestD1({vatTable:true});d.sql.exec("DROP TABLE vat_records");
  await assert.rejects(()=>post(d),(e:any)=>e.code==="FINANCIAL_SCHEMA_NOT_READY");
  assert.equal((d.sql.prepare("SELECT COUNT(*) n FROM accounting_ledger_entries").get() as any).n,0);
  assert.equal((d.sql.prepare("SELECT current_balance FROM companies WHERE id='companyA'").get() as any).current_balance,0);
});
test("Eski kısmi defter varsa otomatik ikinci kayıt yapılmaz",async()=>{
  const d=new TestD1();d.sql.prepare("INSERT INTO accounting_ledger_entries(id,main_company_slug,source_document_id,created_at) VALUES(?,?,?,?)").run("old1","tenantA","doc1","2026-10-25");
  await assert.rejects(()=>post(d),(e:any)=>e.code==="DOCUMENT_LEGACY_PARTIAL_REVIEW");
  assert.equal(d.snapshot().ledger,1);
  assert.equal(d.snapshot().status,"APPROVED");
});
test("Farklı tenant erişimi, yanlış company ve INVOICE önkoşulları",async()=>{
  const d=new TestD1();
  await assert.rejects(()=>post(d,"tenantB"),(e:any)=>e.code==="NOT_FOUND");
  d.sql.exec("UPDATE companies SET deleted_at='2026-10-25' WHERE id='companyA'");
  await assert.rejects(()=>post(d),(e:any)=>e.code==="COMPANY_NOT_FOUND");
  assert.deepEqual(d.snapshot(),{status:"APPROVED",current:0,movements:0,ledger:0,vat:0});
});
