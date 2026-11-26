import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
test("dashboard SQL selected tenant and deleted-document isolation",()=>{
 const source=readFileSync(new URL("./e-belge-center-cloud.ts",import.meta.url),"utf8");
 const sql=source.match(/const summary=await c\.env\.DB\.prepare\(`(SELECT COUNT\(\*\) total,[\s\S]*?)`\)/)?.[1];assert.ok(sql);
 const db=new DatabaseSync(":memory:");
 try{db.exec("CREATE TABLE accounting_documents(main_company_slug TEXT,deleted_at TEXT,created_at TEXT,issue_date TEXT,direction TEXT,payable_total REAL); INSERT INTO accounting_documents VALUES ('one',NULL,'2026-11-26T00:00:00','2026-11-26','INCOMING',100),('one',NULL,'2026-11-26T00:00:00','2026-11-26','OUTGOING',200),('one',NULL,'2026-10-20','2026-10-20','INCOMING',300),('two',NULL,'2026-11-26','2026-11-26','INCOMING',999),('one','2026-11-26','2026-11-26','2026-11-26','OUTGOING',999)");
 const args=["2026-11-26","2026-11-26","2026-11-26",...Array.from({length:5},()=>["2026-11-01","2026-11-26"]).flat(),...Array.from({length:5},()=>["2026-10-01","2026-10-31"]).flat(),"one"];
 const result=db.prepare(sql).get(...args);assert.equal(result?.total,3);assert.equal(result?.monthTotal,2);assert.equal(result?.monthIncomingAmount,100);assert.equal(result?.monthOutgoingAmount,200);assert.equal(result?.previousMonthTotal,1);assert.equal(result?.previousMonthIncomingAmount,300);assert.equal(result?.todayTotal,2);
 }finally{db.close()}
});