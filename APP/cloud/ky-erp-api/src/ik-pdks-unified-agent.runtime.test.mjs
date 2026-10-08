import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, createHmac, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";
import { registerIkPdksUnifiedAgentRoutes } from "./ik-pdks-unified-agent.ts";

if (!globalThis.crypto?.subtle) globalThis.crypto=webcrypto;
const here=dirname(fileURLToPath(import.meta.url));
const migration=readFileSync(resolve(here,"../migrations/0060_pdks_unified_command_ledger.sql"),"utf8");
const sha=(value)=>createHash("sha256").update(value).digest("hex");

function makeDb(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("CREATE TABLE ik_audit_logs (main_company_id TEXT,source_screen TEXT,created_at TEXT)");
  sqlite.exec(migration);
  const db={
    prepare(sql){
      const stmt=sqlite.prepare(sql);
      const state={args:[]};
      return {
        bind(...args){state.args=args;return this;},
        async first(){return stmt.get(...state.args)??null;},
        async run(){
          const result=stmt.run(...state.args);
          return {meta:{changes:result.changes}};
        },
        async all(){return {results:stmt.all(...state.args)};},
      };
    },
  };
  return {sqlite,db};
}

function fixture(){
  const {sqlite,db}=makeDb();
  const deviceSecret="isolated-device-test-secret-do-not-use-in-production";
  const signingKey="isolated-hmac-secret-do-not-use-in-production";
  const company="company-A";
  const device="agent-A";
  const app=new Hono();
  registerIkPdksUnifiedAgentRoutes(app);
  sqlite.prepare(
    "INSERT INTO ik_pdks_devices(id,main_company_id,secret_hash,active,created_at) VALUES(?,?,?,?,?)"
  ).run(device,company,sha(deviceSecret),1,new Date().toISOString());
  const env={DB:db,KY_PDKS_UNIFIED_SYNC_KEY:signingKey};
  const credentials={
    "X-KYERP-PDKS-Device":device,
    "X-KYERP-PDKS-Secret":deviceSecret,
  };
  function addCommand(commandId="command-1",outboxId="outbox-1"){
    const stamp=new Date().toISOString();
    const normalizedPayload={employeeId:"employee-1",note:"approved test action"};
    sqlite.prepare(
      "INSERT INTO ik_pdks_unified_commands(id,main_company_id,actor_user_id,request_id,action,payload_sha256,result_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,?)"
    ).run(commandId,company,"actor-1","request-"+commandId,"holiday",sha(JSON.stringify(normalizedPayload)),"{}","COMMITTED",stamp);
    sqlite.prepare(
      "INSERT INTO ik_pdks_unified_outbox(id,main_company_id,command_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?,?)"
    ).run(outboxId,company,commandId,"PDKS_UNIFIED_APPLY",JSON.stringify({commandData:normalizedPayload}),stamp);
  }
  const api=(path,options={})=>app.request(path,{
    ...options,
    headers:{...credentials,...options.headers},
  },env);
  const get=()=>api("/api/auth/pdks-unified/outbox/next");
  const ack=(id,data)=>api("/api/auth/pdks-unified/outbox/"+id+"/ack",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(data),
  });
  return {sqlite,env,app,company,device,credentials,signingKey,addCommand,get,ack,api};
}
async function claim(f){
  const r=await f.get();
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.ok,true);
  assert.ok(body.data);
  return body.data;
}
function receipt(f,delivery){
  const data=JSON.parse(Buffer.from(delivery.signedPayload,"base64").toString("utf8"));
  return {
    journalId:"journal-1",
    appliedAt:new Date().toISOString(),
    commandId:data.commandId,
    outboxId:data.outboxId,
    deviceId:f.device,
    commandPayloadSha256:data.commandPayloadSha256,
    evidenceSha256:sha("fdb-and-local-evidence-1"),
    sourceValidated:true,
    fdbValidated:true,
    tnfTouched:false,
  };
}

function receiptSignature(f,delivery,proof){
  const fields=[
    "KY-PDKS-RECEIPT-V1",delivery.deliveryHash,
    proof.journalId||"",proof.appliedAt||"",
    proof.commandId||"",proof.outboxId||"",proof.deviceId||"",
    proof.commandPayloadSha256||"",proof.evidenceSha256||"",
    proof.sourceValidated===true?"1":"0",
    proof.fdbValidated===true?"1":"0",
    proof.tnfTouched===true?"1":"0",
    proof.tnfValidated===true?"1":"0",
    proof.policySha256||"",proof.fdbEvidenceSha256||"",
  ];
  return createHmac("sha256",f.signingKey).update(JSON.stringify(fields)).digest("base64");
}

test("staging D1 mock: device must belong to tenant and have valid credential",async()=>{
  const f=fixture();try{
    f.addCommand();
    const unauth=await f.api("/api/auth/pdks-unified/outbox/next",{
      headers:{"X-KYERP-PDKS-Secret":"wrong-secret"},
    });
    assert.equal(unauth.status,401);
    f.sqlite.prepare("UPDATE ik_pdks_devices SET active=0 WHERE id=?").run(f.device);
    assert.equal((await f.get()).status,401);
    f.sqlite.prepare("UPDATE ik_pdks_devices SET active=1 WHERE id=?").run(f.device);
    const item=await claim(f);
    const decoded=Buffer.from(item.signedPayload,"base64").toString("utf8");
    assert.equal(item.deliveryHash,sha(decoded));
    assert.equal(item.signature,createHmac("sha256",f.signingKey).update(decoded).digest("base64"));
    const envelope=JSON.parse(decoded);
    assert.equal(envelope.company,f.company);
    assert.equal(envelope.deviceId,f.device);
    assert.equal(envelope.outboxId,item.outboxId);
  }finally{f.sqlite.close()}
});

test("staging D1 mock: invalid ACK cannot bypass current claimed delivery",async()=>{
  const f=fixture();try{
    f.addCommand();
    const delivery=await claim(f);
    const base={status:"ACKED",deliveryHash:delivery.deliveryHash};
    assert.equal((await f.ack(delivery.outboxId,base)).status,409);
    const proof=receipt(f,delivery);
    const corruptedProof={...proof,commandPayloadSha256:sha("changed")};
    assert.equal((await f.ack(delivery.outboxId,{...base,localReceipt:corruptedProof,
      localReceiptHmac:receiptSignature(f,delivery,corruptedProof)})).status,409);
    assert.equal((await f.ack(delivery.outboxId,{...base,
      deliveryHash:sha("wrong"),localReceipt:proof})).status,409);
    assert.equal(f.sqlite.prepare("SELECT state FROM ik_pdks_unified_outbox WHERE id='outbox-1'").get().state,"CLAIMED");
    assert.equal((await f.ack(delivery.outboxId,{...base,localReceipt:proof,
      localReceiptHmac:"bad-proof"})).status,409);
    assert.equal((await f.ack(delivery.outboxId,{...base,localReceipt:proof,
      localReceiptHmac:receiptSignature(f,delivery,proof)})).status,200);
    assert.equal(f.sqlite.prepare("SELECT state FROM ik_pdks_unified_outbox WHERE id='outbox-1'").get().state,"ACKED");
    const repeated=await f.ack(delivery.outboxId,{...base,localReceipt:proof});
    assert.equal(repeated.status,200);
    assert.equal((await repeated.json()).data.replayed,true);
    assert.equal((await f.get()).status,200);
    assert.equal((await (await f.get()).json()).data,null);
  }finally{f.sqlite.close()}
});

test("staging D1 mock: expired lease, retry and parallel claims do not double apply",async()=>{
  const f=fixture();try{
    f.addCommand();
    const delivery=await claim(f);
    f.sqlite.prepare("UPDATE ik_pdks_unified_outbox SET lease_until=? WHERE id=?")
      .run(new Date(Date.now()-1000).toISOString(),delivery.outboxId);
    const expired=await f.ack(delivery.outboxId,{
      status:"ACKED",deliveryHash:delivery.deliveryHash,localReceipt:receipt(f,delivery)});
    assert.equal(expired.status,409);
    const [first,second]=await Promise.all([f.get(),f.get()]);
    const results=await Promise.all([first,second].map(async response=>{
      if(response.status===204)return null;
      return (await response.json()).data;
    }));
    assert.equal(results.filter(Boolean).length,1);
    const fresh=results.find(Boolean);
    const retry=await f.ack(fresh.outboxId,{
      status:"RETRY",deliveryHash:fresh.deliveryHash,reason:"COPY_FDB_NOT_READY"
    });
    assert.equal(retry.status,200);
    const row=f.sqlite.prepare("SELECT state,next_attempt_at FROM ik_pdks_unified_outbox WHERE id='outbox-1'").get();
    assert.equal(row.state,"PENDING");
    assert.ok(row.next_attempt_at);
    assert.equal((await (await f.get()).json()).data,null);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM ik_pdks_unified_commands").get().n,1);
  }finally{f.sqlite.close()}
});
