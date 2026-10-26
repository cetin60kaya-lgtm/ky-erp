import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { postPhysicalReceipt,postPhysicalCostLink } from "./accounting-physical-journal.ts";
import { postAccountingDocumentAtomic } from "./accounting-document-posting-atomic.ts";
class RealSQLiteD1 {
  db:DatabaseSync;breakFinance=false;
  constructor(){
    this.db=new DatabaseSync(":memory:");
    this.db.exec("CREATE TABLE json_store (id TEXT PRIMARY KEY,scope TEXT,main_company_slug TEXT,file_name TEXT,data TEXT,created_at TEXT,updated_at TEXT)");
    this.db.exec("CREATE TABLE stock_movements (id TEXT PRIMARY KEY,main_company_slug TEXT,product_id TEXT,firm_id TEXT,document_id TEXT,document_line_id TEXT,quantity REAL,lot_no TEXT,raw TEXT,total_amount REAL,unit_price REAL,created_at TEXT,updated_at TEXT)");
    const sql=readFileSync(resolve(process.cwd(),"migrations/0062_accounting_physical_receipt_journal.sql"),"utf8");
    this.db.exec(sql);this.db.exec(sql);
    this.db.exec("CREATE TABLE accounting_documents (id TEXT PRIMARY KEY,main_company_slug TEXT,deleted_at TEXT,status TEXT,posted_at TEXT,document_type TEXT,party_company_id TEXT,direction TEXT,payable_total REAL,tax_total REAL,subtotal REAL,record_scope TEXT,document_no TEXT,issue_date TEXT,currency TEXT,raw_metadata TEXT,updated_at TEXT)");
    this.db.exec("CREATE TABLE companies(id TEXT PRIMARY KEY,main_company_slug TEXT,deleted_at TEXT,name TEXT,current_balance REAL,supplier_debt_tracking INTEGER,customer_receivable_tracking INTEGER,updated_at TEXT)");
    this.db.exec("CREATE TABLE current_account_movements(id TEXT PRIMARY KEY,main_company_slug TEXT,company_id TEXT,document_id TEXT,movement_date TEXT,movement_type TEXT,source_type TEXT,document_no TEXT,description TEXT,debit REAL,credit REAL,amount REAL,effect REAL,balance_after REAL,raw TEXT,created_at TEXT,updated_at TEXT)");
    this.db.exec("CREATE TABLE accounting_ledger_entries(id TEXT PRIMARY KEY,main_company_slug TEXT,source_document_id TEXT,entry_date TEXT,entry_type TEXT,record_scope TEXT,company_id TEXT,company_name TEXT,description TEXT,debit REAL,credit REAL,currency TEXT,payment_method TEXT,note TEXT,created_by TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT)");
    this.db.exec("CREATE TABLE vat_records(id TEXT PRIMARY KEY,main_company_slug TEXT,company_id TEXT,firm_id TEXT,document_id TEXT,date TEXT,period_year INTEGER,period_month INTEGER,incoming_vat REAL,outgoing_vat REAL,carry_vat REAL,raw TEXT,created_at TEXT,updated_at TEXT)");
    this.db.prepare("INSERT INTO companies(id,main_company_slug,name,current_balance,supplier_debt_tracking,customer_receivable_tracking) VALUES(?,?,?,?,1,1)")
      .run("sup1","tenant","Tedarikçi",0);
    this.db.prepare("INSERT INTO accounting_documents(id,main_company_slug,status,document_type,party_company_id,direction,payable_total,tax_total,subtotal,record_scope,document_no,issue_date,currency,raw_metadata,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("invoice","tenant","APPROVED","GELEN_FATURA","sup1","INCOMING",600,100,500,"OFFICIAL","F-1","2026-10-26","TRY","{}","2026-10-26T00:00:00Z");
  }
  prepare(q:string){
    const db=this.db;
    return {bind(...args:any[]){return {query:q,args,
      first:async()=>db.prepare(q).get(...args)||null,
      all:async()=>({results:db.prepare(q).all(...args)}),
      run:async()=>({meta:{changes:db.prepare(q).run(...args).changes}})};},
      all:async()=>({results:db.prepare(q).all()})};
  }
  async batch(stmts:any[]){
    this.db.exec("BEGIN IMMEDIATE");
    try{const result=[];for(const [i,stmt] of stmts.entries()){
      if(this.breakFinance && stmt.query.includes("vat_records"))throw Error("KDV test injected failure");
      const data=this.db.prepare(stmt.query).run(...stmt.args);result.push({meta:{changes:data.changes}});
    }this.db.exec("COMMIT");return result;
    }catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  n(t:string){return Number((this.db.prepare("SELECT COUNT(*) n FROM "+t).get() as any).n)}
  lot(){
    const r=this.db.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT' ORDER BY file_name").all() as any[];
    return r.map(x=>JSON.parse(x.data));
  }
}
const base={tenant:"tenant",documentId:"dispatch",documentLineId:"line",
 physicalDocumentId:"dispatch",physicalLineId:"line",
 productId:"chemical",supplierCompanyId:"sup1",route:"BOYAHANE",
 lotNo:"LOT-A",lotPolicy:"REQUIRED",quantity:100,unit:"KG",sourceType:"E_BELGE_DISPATCH"};

test("İrsaliye önce, fatura sonra: tek stok, doğru LOT maliyet, KDV ve cari bir kez",async()=>{
  const db=new RealSQLiteD1();
  await postPhysicalReceipt(db,base);
  await postPhysicalCostLink(db,{...base,invoiceId:"invoice",invoiceLineId:"invoice-line",
    allocatedQuantity:100,allocatedTotal:500,currency:"TRY"});
  const posting=await postAccountingDocumentAtomic(db,"tenant","invoice","user1");
  assert.equal(posting.status,"POSTED");assert.equal(db.n("json_store"),2);
  assert.equal(db.n("accounting_ledger_entries"),1);
  assert.equal(db.n("vat_records"),1);
  assert.equal(db.n("current_account_movements"),1);
  assert.equal(db.lot()[0].remainingKg,100);
  assert.equal(db.lot()[0].totalCost,500);
  assert.equal((db.db.prepare("SELECT current_balance FROM companies WHERE id='sup1'").get() as any).current_balance,-600);
  assert.equal((await postPhysicalReceipt(db,base)).idempotent,true);
  assert.equal((await postAccountingDocumentAtomic(db,"tenant","invoice","user1")).idempotent,true);
  assert.equal(db.n("json_store"),2);assert.equal(db.n("accounting_ledger_entries"),1);
});
test("Finans KDV hatası stok journal DONE'a dokunmaz, retry finans bir kez",async()=>{
  const db=new RealSQLiteD1();await postPhysicalReceipt(db,base);
  await postPhysicalCostLink(db,{...base,invoiceId:"invoice",invoiceLineId:"invoice-line",allocatedQuantity:100,allocatedTotal:500});
  db.breakFinance=true;
  await assert.rejects(()=>postAccountingDocumentAtomic(db,"tenant","invoice","user1"));
  assert.equal(db.n("accounting_ledger_entries"),0);
  assert.equal((db.db.prepare("SELECT status FROM accounting_documents WHERE id='invoice'").get() as any).status,"APPROVED");
  assert.equal(db.lot()[0].entryKg,100);
  db.breakFinance=false;
  await postAccountingDocumentAtomic(db,"tenant","invoice","user1");
  assert.equal(db.n("accounting_ledger_entries"),1);
  assert.equal(db.lot()[0].entryKg,100);
});
test("100 eşzamanlı finanse etme sonrası tek cari/defter/KDV, tek fiziksel",async()=>{
  const db=new RealSQLiteD1();await postPhysicalReceipt(db,base);
  await postPhysicalCostLink(db,{...base,invoiceId:"invoice",invoiceLineId:"invoice-line",allocatedQuantity:100,allocatedTotal:500});
  const results=await Promise.allSettled(Array.from({length:100},()=>postAccountingDocumentAtomic(db,"tenant","invoice","user1")));
  assert.ok(results.some(x=>x.status==="fulfilled"));
  assert.equal(db.n("accounting_ledger_entries"),1);
  assert.equal(db.n("vat_records"),1);
  assert.equal(db.n("current_account_movements"),1);
  assert.equal(db.lot()[0].entryKg,100);
  assert.equal(db.lot()[0].totalCost,500);
});
