import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { storeSnapshot,storeGuard,storeUpdate,storeInsert,stableStoreId,commitStoreBatch } from "./atomic-json-store.ts";
class LocalD1 {
  sql=new DatabaseSync(":memory:");
  failAt=-1;
  constructor(){this.sql.exec("CREATE TABLE json_store(id TEXT PRIMARY KEY NOT NULL,scope TEXT NOT NULL,main_company_slug TEXT,file_name TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT,updated_at TEXT)");}
  prepare(query:string){const db=this.sql;return {bind(...args:any[]){return {query,args,all:async()=>({success:true,results:db.prepare(query).all(...args)})};}};}
  async batch(statements:any[]){this.sql.exec("BEGIN IMMEDIATE");try{const result=[];for(const [i,s] of statements.entries()){this.sql.prepare(s.query).run(...s.args);if(i===this.failAt)throw Error("fault injection");result.push({success:true});}this.sql.exec("COMMIT");return result;}catch(e){this.sql.exec("ROLLBACK");throw e;}}
  count(scope:string){return Number(this.sql.prepare("SELECT COUNT(*) n FROM json_store WHERE scope=?").get(scope)?.n);}
}
const at="2026-11-25T10:00:00Z",slug="fixture";
async function fixture(){const db=new LocalD1();await commitStoreBatch(db,[],[storeInsert(db,"LOT",slug,"lot",{remainingKg:10},at),storeInsert(db,"COLOR",slug,"color",{status:"WAITING"},at)]);return db;}
async function batch(db:LocalD1,requestId:string,amount:number){
 const [lot,color]=await Promise.all([storeSnapshot(db,"LOT",slug,"lot"),storeSnapshot(db,"COLOR",slug,"color")]);
 assert.ok(lot&&color);
 const id=await stableStoreId("P:",[slug,requestId]);
 await commitStoreBatch(db,[storeGuard(db,lot),storeGuard(db,color)],[storeUpdate(db,lot,{...lot.value,remainingKg:lot.value.remainingKg-amount},at),storeInsert(db,"MOVEMENT",slug,id+":M",{quantity:amount},at),storeInsert(db,"PRODUCTION",slug,id,{quantity:amount},at),storeUpdate(db,color,{status:"COMPLETED"},at),storeInsert(db,"EXPENSE",slug,id+":E",{quantity:amount},at)]);
}
test("production, stock, color, movement and expense all commit together",async()=>{const db=await fixture();await batch(db,"one",4);assert.equal((await storeSnapshot(db,"LOT",slug,"lot"))?.value.remainingKg,6);for(const scope of ["MOVEMENT","PRODUCTION","EXPENSE"])assert.equal(db.count(scope),1);assert.equal((await storeSnapshot(db,"COLOR",slug,"color"))?.value.status,"COMPLETED");});
test("failure at each of seven batch statements rolls back all changes",async()=>{for(let i=0;i<7;i++){const db=await fixture();db.failAt=i;await assert.rejects(batch(db,"one",4));assert.equal((await storeSnapshot(db,"LOT",slug,"lot"))?.value.remainingKg,10);assert.equal((await storeSnapshot(db,"COLOR",slug,"color"))?.value.status,"WAITING");for(const scope of ["MOVEMENT","PRODUCTION","EXPENSE"])assert.equal(db.count(scope),0);}});
test("independent concurrent requests sharing one stock snapshot: exactly one commit",async()=>{const db=await fixture();const result=await Promise.allSettled([batch(db,"one",6),batch(db,"two",6)]);assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal((await storeSnapshot(db,"LOT",slug,"lot"))?.value.remainingKg,4);assert.equal(db.count("PRODUCTION"),1);});
test("duplicate deterministic production ID rolls back stock even on a fresh snapshot",async()=>{const db=await fixture();await batch(db,"same",4);await assert.rejects(batch(db,"same",4));assert.equal((await storeSnapshot(db,"LOT",slug,"lot"))?.value.remainingKg,6);assert.equal(db.count("PRODUCTION"),1);});
test("tenant snapshot cannot see another company or unassigned legacy LOT",async()=>{const db=await fixture();assert.equal(await storeSnapshot(db,"LOT","other","lot"),null);db.sql.prepare("INSERT INTO json_store VALUES(?,?,?,?,?,?,?)").run("legacy","LOT",null,"legacy","{}",at,at);assert.equal(await storeSnapshot(db,"LOT",slug,"legacy"),null);});
test("duplicate logical keys require review",async()=>{const db=await fixture();db.sql.prepare("INSERT INTO json_store VALUES(?,?,?,?,?,?,?)").run("different","LOT",slug,"lot","{}",at,at);await assert.rejects(storeSnapshot(db,"LOT",slug,"lot"),/STORE_DUPLICATE_REVIEW/);});
