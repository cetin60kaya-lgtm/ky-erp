import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { writeProductionEntryAtomic } from "./production-idempotency.ts";

class LocalD1 {
  sql:DatabaseSync;
  breakAfterRecord=false;
  constructor() {
    this.sql=new DatabaseSync(":memory:");
    this.sql.exec("CREATE TABLE production_records (id TEXT PRIMARY KEY,main_company_slug TEXT,model_id TEXT,model_name TEXT,total_quantity INTEGER,raw TEXT,created_at TEXT)");
    this.sql.exec("CREATE TABLE model_production_links (id TEXT PRIMARY KEY,main_company_slug TEXT,model_id TEXT,production_record_id TEXT,raw TEXT,created_at TEXT)");
  }
  prepare(query:string){
    const db=this.sql;
    return { bind(...args:any[]){ return {
      query,args,
      first: async()=>db.prepare(query).get(...args)||null,
      all: async()=>({results:db.prepare(query).all(...args)}),
      run: async()=>({meta:{changes:db.prepare(query).run(...args).changes}}),
    }; },
    all: async()=>({results:db.prepare(query).all()}) };
  }
  async batch(statements:any[]){
    this.sql.exec("BEGIN IMMEDIATE");
    try{
      const out=[];
      for(const [index,stmt] of statements.entries()){
        out.push({meta:{changes:this.sql.prepare(stmt.query).run(...stmt.args).changes}});
        if(index===0 && this.breakAfterRecord)throw Error("Fault injected after production record");
      }
      this.sql.exec("COMMIT");return out;
    }catch(e){this.sql.exec("ROLLBACK");throw e}
  }
  snapshot(){
    const rows=this.sql.prepare("SELECT id,main_company_slug,model_id,raw FROM production_records ORDER BY id").all() as any[];
    const links=this.sql.prepare("SELECT * FROM model_production_links").all();
    return {rows,links};
  }
}
const payload={modelId:"model1",date:"2026-10-25",grossQty:25,printArea:"Ön",machineId:"M1",shift:"Gündüz",operatorName:"Usta",note:"fixture"};
const commit=(d:LocalD1,requestId="req1",input:any=payload,tenant="tenant1")=>
  writeProductionEntryAtomic(d,tenant,requestId,"0",input,{
    model_id:input.modelId,total_quantity:input.grossQty,model_name:"TEST MODEL",
    raw:{source:"PRODUCTION_CENTER"},
  },{model_id:input.modelId});
test("aynı requestId ile 20 paralel çağrı: tek fiş ve tek model link",async()=>{
  const d=new LocalD1();
  const outputs=await Promise.all(Array.from({length:20},()=>commit(d)));
  assert.equal(outputs.filter(x=>!x.idempotent).length,1);
  assert.equal(new Set(outputs.map(x=>x.id)).size,1);
  assert.equal(d.snapshot().rows.length,1);
  assert.equal(d.snapshot().links.length,1);
});
test("100 paralel POST: tek fiziksel kayıt/link ve 99 idempotent dönüş",async()=>{
  const d=new LocalD1();
  const outputs=await Promise.all(Array.from({length:100},()=>commit(d)));
  assert.equal(outputs.filter(x=>x.idempotent).length,99);
  assert.equal(d.snapshot().rows.length,1);
  assert.equal(d.snapshot().links.length,1);
});
test("aynı requestId farklı model/tarih/adet/operatör: 409 sınıfı çakışma",async()=>{
  const d=new LocalD1();
  await commit(d);
  await assert.rejects(()=>commit(d,"req1",{...payload,grossQty:26}), (error:any)=>error.code==="PRODUCTION_REQUEST_PAYLOAD_CONFLICT");
  assert.equal(d.snapshot().rows.length,1);
});
test("aynı özellikte iki meşru fiş farklı requestId ile iki kayıt oluşturur",async()=>{
  const d=new LocalD1();
  await commit(d,"req1");
  await commit(d,"req2");
  assert.equal(d.snapshot().rows.length,2);
  assert.equal(d.snapshot().links.length,2);
});
test("farklı tenant aynı requestId birbirinin kaydını görmez",async()=>{
  const d=new LocalD1();
  await commit(d,"same",payload,"tenant1");
  await commit(d,"same",payload,"tenant2");
  assert.equal(d.snapshot().rows.length,2);
  assert.equal(new Set(d.snapshot().rows.map(x=>x.id)).size,2);
});
test("link yazma hatasında D1 rollback: yetim production kayıt yok; retry güvenli",async()=>{
  const d=new LocalD1();d.breakAfterRecord=true;
  await assert.rejects(()=>commit(d), (e:any)=>e.code==="PRODUCTION_ATOMIC_WRITE_FAILED");
  assert.equal(d.snapshot().rows.length,0);
  assert.equal(d.snapshot().links.length,0);
  d.breakAfterRecord=false;await commit(d);
  assert.equal(d.snapshot().rows.length,1);
  assert.equal(d.snapshot().links.length,1);
});
test("model link tablosu yoksa json_store'a sessiz yazılmaz",async()=>{
  const d=new LocalD1();d.sql.exec("DROP TABLE model_production_links");
  await assert.rejects(()=>commit(d),(e:any)=>e.code==="PRODUCTION_SCHEMA_NOT_READY"||e.code==="PRODUCTION_ATOMIC_WRITE_FAILED");
  assert.equal(d.sql.prepare("SELECT COUNT(*) AS n FROM production_records").get().n,0);
});
