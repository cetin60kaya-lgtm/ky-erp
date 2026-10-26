import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { physicalIdentity, postPhysicalReceipt, postPhysicalCostLink, readPhysicalDocumentStatus } from "./accounting-physical-journal.ts";

class D1Fixture {
  sql: DatabaseSync;
  failStep=-1;
  constructor() {
    this.sql=new DatabaseSync(":memory:");
    this.sql.exec("CREATE TABLE json_store(id TEXT PRIMARY KEY,scope TEXT NOT NULL,main_company_slug TEXT,file_name TEXT,data TEXT,created_at TEXT,updated_at TEXT)");
    this.sql.exec("CREATE TABLE stock_movements(id TEXT PRIMARY KEY,main_company_slug TEXT,product_id TEXT,firm_id TEXT,document_id TEXT,document_line_id TEXT,movement_type TEXT,source_type TEXT,date TEXT,quantity REAL,unit TEXT,unit_price REAL,total_amount REAL,lot_no TEXT,active INTEGER,raw TEXT,created_at TEXT,updated_at TEXT)");
    const migration=readFileSync(resolve(process.cwd(),"migrations/0062_accounting_physical_receipt_journal.sql"),"utf8");
    this.sql.exec(migration);
    this.sql.exec(migration); // additive idempotency
  }
  prepare(query:string) {
    const db=this.sql;
    return { bind(...args:any[]) {return {
      query,args,
      first:async()=>db.prepare(query).get(...args)||null,
      all:async()=>({results:db.prepare(query).all(...args)}),
      run:async()=>({meta:{changes:db.prepare(query).run(...args).changes}}),
    }}, all:async()=>({results:db.prepare(query).all()}) };
  }
  async batch(statements:any[]) {
    this.sql.exec("BEGIN IMMEDIATE");
    try{
      const result=[];
      for(const [i,s] of statements.entries()){
        if(i===this.failStep)throw Error("Injected SQL failure");
        result.push({meta:{changes:this.sql.prepare(s.query).run(...s.args).changes}});
      }
      this.sql.exec("COMMIT");return result;
    }catch(e){this.sql.exec("ROLLBACK");throw e;}
  }
  count(table:string,clause="") {
    return Number((this.sql.prepare("SELECT COUNT(*) n FROM "+table+" "+clause).get() as any).n);
  }
}
const sample=(overrides:any={})=>({
  tenant:"taha",documentId:"dispatch1",documentLineId:"line1",
  physicalDocumentId:"dispatch1",physicalLineId:"line1",
  productId:"chemical1",supplierCompanyId:"sup1",route:"BOYAHANE",
  lotNo:"LOT-A",lotPolicy:"REQUIRED",quantity:100,unit:"KG",sourceType:"E_BELGE_DISPATCH",
  ...overrides,
});

test("0062 migration iki defa çalışır, archived queue yerine fiziksel journal",()=>{
  const db=new D1Fixture();
  assert.equal(db.count("accounting_physical_operations"),0);
  const ix=db.sql.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_accounting_physical%'").all();
  assert.ok(ix.length>=3);
});
test("tek irsaliye Boyahane REQUIRED LOT: bir hareket/LOT, 20 paralelde artış yok",async()=>{
  const db=new D1Fixture(),arr=await Promise.allSettled(Array.from({length:20},()=>postPhysicalReceipt(db,sample())));
  assert.ok(arr.some(x=>x.status==="fulfilled"),"En az bir Worker ilk işlemi kaydetmeli.");
  assert.ok(arr.every(x=>x.status==="fulfilled" || x.reason?.code==="PHYSICAL_IN_PROGRESS" ||
    x.reason?.code==="PHYSICAL_LEASE_CONFLICT"),"Diğer Worker yalnız lease çakışması alabilir.");
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_LOT'"),1);
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_STOCK_MOVEMENT'"),1);
  const lot=db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").get() as any;
  assert.equal(JSON.parse(lot.data).remainingKg,100);
  assert.equal(arr.filter(x=>x.status==="fulfilled" && !x.value.idempotent).length,1);
  assert.equal((await readPhysicalDocumentStatus(db,"taha","dispatch1")).filter(x=>x.state==="DONE").length,1);
});
test("100 eşzamanlı retry: tek generic stok kaydı",async()=>{
  const db=new D1Fixture();
  const p=sample({route:"STOCK"});
  const rows=await Promise.allSettled(Array.from({length:100},()=>postPhysicalReceipt(db,p)));
  assert.ok(rows.some(x=>x.status==="fulfilled"));
  assert.equal(db.count("stock_movements"),1);
  assert.equal(db.count("accounting_physical_operations","WHERE state='DONE'"),1);
});
test("aynı fiziksel anahtar farklı yük: açık 409 benzeri PAYLOAD_CONFLICT, ikinci miktar yok",async()=>{
  const db=new D1Fixture();await postPhysicalReceipt(db,sample());
  await assert.rejects(()=>postPhysicalReceipt(db,sample({quantity:101})),(e:any)=>e.code==="PHYSICAL_PAYLOAD_CONFLICT");
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_STOCK_MOVEMENT'"),1);
});
test("LOT-A 60 + LOT-B 40, toplam 100; ayrı tekillik",async()=>{
  const db=new D1Fixture();
  await postPhysicalReceipt(db,sample({lotNo:"LOT-A",quantity:60}));
  await postPhysicalReceipt(db,sample({lotNo:"LOT-B",quantity:40}));
  const rows=db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").all() as any[];
  assert.equal(rows.length,2);
  assert.equal(rows.reduce((sum,x)=>sum+JSON.parse(x.data).entryKg,0),100);
});
test("aynı LOT farklı tenant, ürün, tedarikçi birbirine karışmaz",async()=>{
  const db=new D1Fixture();
  for(const patch of [{},{tenant:"t2"},{productId:"chemical2",physicalLineId:"line2",documentLineId:"line2"},
    {supplierCompanyId:"sup2",physicalLineId:"line3",documentLineId:"line3"}])
    await postPhysicalReceipt(db,sample(patch));
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_LOT'"),4);
});
test("aynı LOT ve farklı fiziksel irsaliyeler miktarı SQL json_set ile biriktirir",async()=>{
  const db=new D1Fixture();
  await postPhysicalReceipt(db,sample({quantity:60}));
  await postPhysicalReceipt(db,sample({physicalDocumentId:"dispatch2",physicalLineId:"line2",
    documentId:"dispatch2",documentLineId:"line2",quantity:40}));
  const lot=db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").get() as any;
  assert.equal(JSON.parse(lot.data).entryKg,100);
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_STOCK_MOVEMENT'"),2);
});
test("LOT yazımı ve stok hareketinde SQL hata: stock 0, journal RETRY",async()=>{
  const db=new D1Fixture();db.failStep=1;
  await assert.rejects(()=>postPhysicalReceipt(db,sample()),(e:any)=>e.code==="PHYSICAL_DB_RETRY");
  assert.equal(db.count("json_store"),0);
  assert.equal(db.count("accounting_physical_operations","WHERE state='RETRY'"),1);
});
test("PROCESSING süresi dolunca Worker restart/reclaim yeniden yürür, ikinci etki yok",async()=>{
  const db=new D1Fixture();db.failStep=0;
  await assert.rejects(()=>postPhysicalReceipt(db,sample()));
  db.sql.exec("UPDATE accounting_physical_operations SET state='PROCESSING',lease_until='2020-01-01',lease_token='old' ");
  db.failStep=-1;
  assert.equal((await postPhysicalReceipt(db,sample())).status,"DONE");
  assert.equal((await postPhysicalReceipt(db,sample())).idempotent,true);
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_STOCK_MOVEMENT'"),1);
});
test("Legacy izsiz fiziksel hareket sessiz yeniden giriş yapmaz",async()=>{
  const db=new D1Fixture();
  db.sql.prepare("INSERT INTO stock_movements(id,main_company_slug,product_id,document_line_id,lot_no,quantity) VALUES(?,?,?,?,?,?)")
    .run("legacy","taha","chemical1","line1","LOT-A",100);
  await assert.rejects(()=>postPhysicalReceipt(db,sample({route:"STOCK"})),(e:any)=>e.code==="LEGACY_PHYSICAL_REVIEW");
  assert.equal(db.count("stock_movements"),1);
});
test("miktar/LOT politikası ve tenant doğrulaması fail closed",async()=>{
  for(const p of [
    {quantity:0},{quantity:-1},{quantity:NaN},{lotNo:""},{lotPolicy:"NONE"},
    {tenant:""},{productId:""},{route:"OTHER"},
  ]){
    const db=new D1Fixture();
    await assert.rejects(()=>postPhysicalReceipt(db,sample(p)));
    assert.equal(db.count("stock_movements")+db.count("json_store"),0);
  }
});
test("0062 şeması olmayan DB'de canlı stok sessizce yazılmaz",async()=>{
  const db=new D1Fixture();db.sql.exec("DROP TABLE accounting_physical_operations");
  await assert.rejects(()=>postPhysicalReceipt(db,sample()),(e:any)=>e.code==="PHYSICAL_SCHEMA_APPROVAL_REQUIRED");
  assert.equal(db.count("json_store"),0);
});

test("fatura sonrası Boyahane maliyet bağlar, ikinci stok girişi yok",async()=>{
  const db=new D1Fixture();
  await postPhysicalReceipt(db,sample({quantity:100}));
  const cost={...sample({quantity:100}),invoiceId:"fatura1",invoiceLineId:"fatura-line1",
    invoiceNo:"F2026001",allocatedQuantity:100,allocatedTotal:240,currency:"TRY"};
  const first=await postPhysicalCostLink(db,cost);
  assert.equal(first.idempotent,false);
  assert.equal((await postPhysicalCostLink(db,cost)).idempotent,true);
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_STOCK_MOVEMENT'"),1);
  const lot=JSON.parse((db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").get() as any).data);
  assert.equal(lot.entryKg,100);
  assert.equal(lot.remainingKg,100);
  assert.equal(lot.totalCost,240);
  assert.equal(lot.costedQuantity,100);
  assert.equal(lot.financialDocuments.length,1);
});
test("fatura maliyeti 60 LOT A + 40 LOT B, çift fiyat yok",async()=>{
  const db=new D1Fixture();
  await postPhysicalReceipt(db,sample({lotNo:"LOT-A",quantity:60}));
  await postPhysicalReceipt(db,sample({lotNo:"LOT-B",quantity:40}));
  for(const [lot,qty] of [["LOT-A",60],["LOT-B",40]] as const){
    const x=sample({lotNo:lot,quantity:qty});
    await postPhysicalCostLink(db,{...x,invoiceId:"inv",invoiceLineId:"invline",
      allocatedQuantity:qty,allocatedTotal:qty*5,currency:"TRY"});
  }
  const rows=db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").all() as any[];
  assert.equal(rows.reduce((sum,x)=>sum+JSON.parse(x.data).totalCost,0),500);
  assert.equal(rows.reduce((sum,x)=>sum+JSON.parse(x.data).entryKg,0),100);
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_STOCK_MOVEMENT'"),2);
});
test("fatura bağlı irsaliye yoksa maliyet yazmaz, LOT fiziksel miktar aşımı bloke",async()=>{
  const db=new D1Fixture(),data={...sample(),invoiceId:"inv",invoiceLineId:"lineX",allocatedQuantity:50,allocatedTotal:25};
  await assert.rejects(()=>postPhysicalCostLink(db,data),(e:any)=>e.code==="PHYSICAL_RECEIPT_PENDING");
  assert.equal(db.count("accounting_physical_operations"),0);
  await postPhysicalReceipt(db,sample({quantity:40}));
  await assert.rejects(()=>postPhysicalCostLink(db,{...data,quantity:40,allocatedQuantity:45}),(e:any)=>e.code==="COST_ALLOCATION_INVALID"||e.code==="COST_QUANTITY_OVER_ALLOCATED");
});
test("100 paralel maliyet retry: aynı fatura satırı LOT'a yalnız bir kez fiyat bağlar",async()=>{
  const db=new D1Fixture();await postPhysicalReceipt(db,sample());
  const data={...sample(),invoiceId:"fatura1",invoiceLineId:"line1",allocatedQuantity:100,allocatedTotal:450};
  const results=await Promise.allSettled(Array.from({length:100},()=>postPhysicalCostLink(db,data)));
  assert.ok(results.some(x=>x.status==="fulfilled"));
  const lot=JSON.parse((db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").get() as any).data);
  assert.equal(lot.totalCost,450);
  assert.equal(lot.financialDocuments.length,1);
});
test("Stok 100 adet kayıt bir kez, fatura maliyeti eklenir ama miktar değişmez",async()=>{
  const db=new D1Fixture(),data=sample({route:"STOCK",quantity:100});
  await postPhysicalReceipt(db,data);
  await postPhysicalCostLink(db,{...data,invoiceId:"fatura1",invoiceLineId:"line1",
    allocatedQuantity:100,allocatedTotal:300});
  await postPhysicalCostLink(db,{...data,invoiceId:"fatura1",invoiceLineId:"line1",
    allocatedQuantity:100,allocatedTotal:300});
  const s=db.sql.prepare("SELECT * FROM stock_movements").get() as any;
  assert.equal(s.quantity,100);assert.equal(s.total_amount,300);
  assert.equal(JSON.parse(s.raw).financialDocuments.length,1);
});

test("iki fatura aynı fiziksel LOT'u toplamda 100 üstüne maliyetlendiremez; trigger 409",async()=>{
  const db=new D1Fixture();await postPhysicalReceipt(db,sample({quantity:100}));
  await postPhysicalCostLink(db,{...sample(),invoiceId:"inv1",invoiceLineId:"a",allocatedQuantity:60,allocatedTotal:120});
  await assert.rejects(()=>postPhysicalCostLink(db,{...sample(),invoiceId:"inv2",invoiceLineId:"b",allocatedQuantity:41,allocatedTotal:82}),
    (e:any)=>e.code==="COST_QUANTITY_OVER_ALLOCATED");
  const lot=JSON.parse((db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").get() as any).data);
  assert.equal(lot.costedQuantity,60);
  assert.equal(lot.totalCost,120);
  assert.equal(db.count("accounting_physical_operations","WHERE operation_type='COST_LINK'"),1);
});
test("iki ayrı fatura toplam 60+40=100 sınırında doğru, ikinci stok girişi yok",async()=>{
  const db=new D1Fixture();await postPhysicalReceipt(db,sample());
  await Promise.all([
    postPhysicalCostLink(db,{...sample(),invoiceId:"invA",invoiceLineId:"a",allocatedQuantity:60,allocatedTotal:240}),
    postPhysicalCostLink(db,{...sample(),invoiceId:"invB",invoiceLineId:"b",allocatedQuantity:40,allocatedTotal:160}),
  ]);
  const lot=JSON.parse((db.sql.prepare("SELECT data FROM json_store WHERE scope='BOYAHANE_LOT'").get() as any).data);
  assert.equal(lot.costedQuantity,100);assert.equal(lot.totalCost,400);
  assert.equal(lot.financialDocuments.length,2);
  assert.equal(db.count("json_store","WHERE scope='BOYAHANE_STOCK_MOVEMENT'"),1);
});
