import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const migration=readFileSync(resolve(here,"../migrations/0060_pdks_unified_command_ledger.sql"),"utf8");
const dbForTest=()=>{
  const db=new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE ik_audit_logs(
      id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,employee_id TEXT NOT NULL DEFAULT '',
      period TEXT NOT NULL DEFAULT '',action_type TEXT NOT NULL,source_screen TEXT NOT NULL DEFAULT '',
      old_json TEXT NOT NULL DEFAULT '{}',new_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT NOT NULL DEFAULT '',user_name TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL
    );
    CREATE TABLE ik_pdks_services(
      id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,code TEXT NOT NULL,
      name TEXT NOT NULL,route_note TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,
      UNIQUE(main_company_id,code)
    );`);
  db.exec(migration);
  return db;
};
const n=(db,table)=>db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;
function atomicCommand(db,{id="c1",requestId="req001-valid-key",actor="actor1",company="tenant1",auditValid=true}={}){
  db.exec("BEGIN IMMEDIATE");
  try{
    db.prepare(`INSERT INTO ik_pdks_unified_commands
      (id,main_company_id,actor_user_id,request_id,action,payload_sha256,
       target_employee_id,result_json,state,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,company,actor,requestId,"service","hash1","","{}","COMMITTED","2026-10-08");
    db.prepare(`INSERT INTO ik_pdks_services
      (id,main_company_id,code,name,route_note,updated_at) VALUES(?,?,?,?,?,?)`)
      .run(id,company,"S-"+id,"Servis","Servis yolu","2026-10-08");
    db.prepare(`INSERT INTO ik_audit_logs
      (id,main_company_id,action_type,source_screen,created_at) VALUES(?,?,?,?,?)`)
      .run("a-"+id,company,auditValid?"PDKS_SERVICE":null,"KY_PDKS_UNIFIED","2026-10-08");
    db.prepare(`INSERT INTO ik_pdks_unified_outbox
      (id,main_company_id,command_id,event_type,payload_json,state,created_at)
      VALUES(?,?,?,?,?,'PENDING',?)`)
      .run("o-"+id,company,id,"PDKS_CLOUD_ADMIN_CHANGE","{}","2026-10-08");
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
}
test("0060 migration creates exact ledger and outbox on existing canonical audit schema",()=>{
  const db=dbForTest();
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='ik_pdks_unified_commands'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='ik_pdks_unified_outbox'").get());
  db.close();
});
test("atomic successful service writes receipt, business, audit, outbox together",()=>{
  const db=dbForTest();
  atomicCommand(db);
  for(const table of ["ik_pdks_unified_commands","ik_pdks_services","ik_audit_logs","ik_pdks_unified_outbox"])
    assert.equal(n(db,table),1,table);
  assert.equal(db.prepare("SELECT state FROM ik_pdks_unified_outbox").get().state,"PENDING");
  db.close();
});
test("same user/tenant requestId cannot create duplicate business operation",()=>{
  const db=dbForTest();
  atomicCommand(db);
  assert.throws(()=>atomicCommand(db,{id:"c2"}),/UNIQUE constraint failed/);
  assert.equal(n(db,"ik_pdks_services"),1);
  assert.equal(n(db,"ik_pdks_unified_commands"),1);
  db.close();
});
test("audit SQL failure rolls back both business mutation and command receipt",()=>{
  const db=dbForTest();
  assert.throws(()=>atomicCommand(db,{auditValid:false}),/NOT NULL constraint failed/);
  for(const table of ["ik_pdks_unified_commands","ik_pdks_services","ik_audit_logs","ik_pdks_unified_outbox"])
    assert.equal(n(db,table),0,table);
  db.close();
});
test("outbox missing foreign key target is rejected instead of silently losing proof",()=>{
  const db=dbForTest();
  assert.throws(()=>db.prepare(`INSERT INTO ik_pdks_unified_outbox
    (id,main_company_id,command_id,event_type,payload_json,state,created_at)
    VALUES('orphan','tenant1','does-not-exist','x','{}','PENDING','2026-10-08')`).run(),
    /FOREIGN KEY constraint failed/);
  assert.equal(n(db,"ik_pdks_unified_outbox"),0);
  db.close();
});
test("two actors or tenants have distinct idempotency namespaces",()=>{
  const db=dbForTest();
  atomicCommand(db);
  atomicCommand(db,{id:"c2",actor:"actor2"});
  atomicCommand(db,{id:"c3",company:"tenant2"});
  assert.equal(n(db,"ik_pdks_unified_commands"),3);
  assert.equal(n(db,"ik_pdks_services"),3);
  db.close();
});

test("outbox claim, retry and ack states preserve one durable command",()=>{
  const db=dbForTest();
  atomicCommand(db);
  db.prepare(`UPDATE ik_pdks_unified_outbox
    SET state='CLAIMED',delivery_owner='agent-1',lease_until='2026-10-08T21:00:00Z',
        delivery_attempts=delivery_attempts+1,delivery_hash='delivery-hash'
    WHERE id='o-c1' AND state='PENDING'`).run();
  let row=db.prepare("SELECT * FROM ik_pdks_unified_outbox WHERE id='o-c1'").get();
  assert.equal(row.state,"CLAIMED");
  assert.equal(row.delivery_attempts,1);
  assert.equal(row.delivery_owner,"agent-1");
  db.prepare(`UPDATE ik_pdks_unified_outbox
    SET state='PENDING',delivery_owner=NULL,lease_until=NULL,next_attempt_at='2026-10-08T21:15:00Z',
        last_error='LOCAL_MAPPING_NOT_READY' WHERE id='o-c1' AND state='CLAIMED'`).run();
  row=db.prepare("SELECT * FROM ik_pdks_unified_outbox WHERE id='o-c1'").get();
  assert.equal(row.state,"PENDING");
  assert.equal(row.next_attempt_at,"2026-10-08T21:15:00Z");
  db.prepare(`UPDATE ik_pdks_unified_outbox
    SET state='CLAIMED',delivery_owner='agent-1',lease_until='2026-10-08T21:30:00Z',
        delivery_attempts=delivery_attempts+1,delivery_hash='delivery-hash-2' WHERE id='o-c1'`).run();
  db.prepare(`UPDATE ik_pdks_unified_outbox
    SET state='ACKED',delivery_owner=NULL,lease_until=NULL,ack_payload_json='{"journalId":"j1"}',
        ack_sha256='ack-hash',acknowledged_at='2026-10-08T21:20:00Z'
    WHERE id='o-c1' AND state='CLAIMED'`).run();
  row=db.prepare("SELECT * FROM ik_pdks_unified_outbox WHERE id='o-c1'").get();
  assert.equal(row.state,"ACKED");
  assert.equal(row.delivery_attempts,2);
  assert.equal(row.ack_sha256,"ack-hash");
  assert.throws(()=>db.prepare("UPDATE ik_pdks_unified_outbox SET state='UNKNOWN' WHERE id='o-c1'").run(),/CHECK constraint failed/);
  assert.equal(n(db,"ik_pdks_unified_commands"),1);
  db.close();
});
