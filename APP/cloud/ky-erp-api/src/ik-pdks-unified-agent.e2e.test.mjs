import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { registerIkPdksUnifiedAgentRoutes } from "./ik-pdks-unified-agent.ts";

if(!globalThis.crypto?.subtle)globalThis.crypto=webcrypto;
const here=dirname(fileURLToPath(import.meta.url));
const migration=resolve(here,"../migrations/0060_pdks_unified_command_ledger.sql");
const sha=value=>createHash("sha256").update(value).digest("hex");

function openMockDatabase(){
  const sql=new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec("CREATE TABLE ik_audit_logs(main_company_id TEXT,source_screen TEXT,created_at TEXT)");
  return sql;
}
function d1(sqlite){
  return {
    prepare(query){
      const stmt=sqlite.prepare(query);
      let parameters=[];
      return {
        bind(...values){parameters=values;return this;},
        async first(){return stmt.get(...parameters)??null;},
        async run(){const result=stmt.run(...parameters);return {meta:{changes:result.changes}};},
        async all(){return {results:stmt.all(...parameters)};},
      };
    }
  };
}
function insert(sqlite,company,commandId,outboxId,action,commandData){
  const now=new Date().toISOString();
  sqlite.prepare(
    "INSERT INTO ik_pdks_unified_commands(id,main_company_id,actor_user_id,request_id,action,payload_sha256,result_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(commandId,company,"approved-demo-actor",randomUUID(),action,sha(JSON.stringify(commandData)),"{}","COMMITTED",now);
  sqlite.prepare(
    "INSERT INTO ik_pdks_unified_outbox(id,main_company_id,command_id,event_type,payload_json,state,created_at) VALUES(?,?,?,?,?,'PENDING',?)"
  ).run(outboxId,company,commandId,"PDKS_UNIFIED_APPLY",
    JSON.stringify({commandId,action,company,localCardNo:"",commandData}),now);
}
async function executeDotnet(dll,env){
  return new Promise((accept,reject)=>{
    let stdout="",stderr="";
    const child=spawn("dotnet.exe",[dll,"--agent-once"],{
      env:{...process.env,...env},
      stdio:["ignore","pipe","pipe"],
      windowsHide:true,
    });
    const timeout=setTimeout(()=>{child.kill();reject(new Error("DOTNET_AGENT_TIMEOUT"));},30000);
    child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
    child.stdout.on("data",v=>stdout+=v);
    child.stderr.on("data",v=>stderr+=v);
    child.on("error",error=>{clearTimeout(timeout);reject(error)});
    child.on("close",code=>{clearTimeout(timeout);accept({code,stdout:stdout.trim(),stderr:stderr.trim()})});
  });
}

test("Windows Agent end-to-end: Cloud HMAC -> staged Firebird -> local policy -> ACK and crash replay",{timeout:120000},async()=>{
  const dll=process.env.KY_PDKS_UNIFIED_DLL||"";
  const fdb=process.env.KY_PDKS_STAGE_FDB_PATH||"";
  assert.ok(dll.endsWith("KY.PDKS.Unified.dll"),"isolated Windows build DLL is required");
  assert.ok(fdb.toUpperCase().includes("\\_TEMP\\PDKS_COPY_STAGE_"),"only the isolated copied FDB may be used");
  assert.ok(fdb.toUpperCase().endsWith("\\KY_PDKS_STAGE.FDB"));
  const root=await mkdtemp(join(tmpdir(),"KY_PDKS_E2E_"));
  const sqlite=openMockDatabase();
  sqlite.exec(await readFile(migration,"utf8"));
  const app=new Hono();
  registerIkPdksUnifiedAgentRoutes(app);
  const company="isolated-tenant-"+randomUUID();
  const device="isolated-device-"+randomUUID();
  const secret="staging-device-"+randomUUID()+"-"+randomUUID();
  const signingKey="staging-hmac-"+randomUUID()+"-"+randomUUID();
  sqlite.prepare(
    "INSERT INTO ik_pdks_devices(id,main_company_id,secret_hash,active,created_at) VALUES(?,?,?,?,?)"
  ).run(device,company,sha(secret),1,new Date().toISOString());
  const env={DB:d1(sqlite),KY_PDKS_UNIFIED_SYNC_KEY:signingKey};
  let failOnceAck=false;
  let acceptedAckCount=0;
  const server=createServer(async(req,res)=>{
    try{
      const chunks=[];
      for await(const chunk of req)chunks.push(chunk);
      const bytes=Buffer.concat(chunks);
      if(failOnceAck && req.method==="POST" && req.url?.includes("/outbox/") && req.url.endsWith("/ack")){
        const body=JSON.parse(bytes.toString("utf8")||"{}");
        if(body.status==="ACKED"){
          failOnceAck=false;
          res.writeHead(503,{"content-type":"application/json"});
          res.end(JSON.stringify({ok:false,error:{message:"simulated lost ACK"}}));
          return;
        }
      }
      const response=await app.request(req.url,{
        method:req.method,
        headers:req.headers,
        body:bytes.length?bytes:undefined,
      },env);
      if(req.method==="POST"&&req.url?.endsWith("/ack")&&response.status===200)acceptedAckCount++;
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){
      res.writeHead(500,{"content-type":"application/json"});
      res.end(JSON.stringify({ok:false,error:{message:String(error)}}));
    }
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const winEnv={
    KY_PDKS_DEVICE_ID:device,
    KY_PDKS_DEVICE_SECRET:secret,
    KY_PDKS_DEVICE_COMPANY:company,
    KY_PDKS_UNIFIED_SYNC_KEY:signingKey,
    KY_PDKS_COMPANY_ROOT:root,
    KY_PDKS_DB_PATH:fdb,
    KY_PDKS_API_BASE:"http://127.0.0.1:"+port,
    KY_PDKS_UNIFIED_APPLY_ENABLED:"1",
  };
  try{
    const groupCommand="g-"+randomUUID(),groupOutbox="go-"+randomUUID();
    insert(sqlite,company,groupCommand,groupOutbox,"personnel-group",{
      code:"IDARI_01",name:"Idari Personel",
      personnelClass:"WHITE_COLLAR",requirePunch:false,
      reason:"Onaylı idari sınıf değişikliği"
    });
    const group=await executeDotnet(dll,winEnv);
    assert.equal(group.code,0,"Group Agent failed: "+group.stderr+" "+group.stdout);
    assert.match(group.stdout,/POLICY_MIRROR_AND_CLOUD_ACK_OK/);
    assert.equal(sqlite.prepare("SELECT state FROM ik_pdks_unified_outbox WHERE id=?").get(groupOutbox).state,"ACKED");

    const holidayCommand="h-"+randomUUID(),holidayOutbox="ho-"+randomUUID();
    insert(sqlite,company,holidayCommand,holidayOutbox,"holiday",{
      date:"2026-10-29",name:"Cumhuriyet Bayramı",halfDay:false,
      note:"Şirket tam gün tatil kararı onaylandı"
    });
    const holiday=await executeDotnet(dll,winEnv);
    assert.equal(holiday.code,0,"Holiday Agent failed: "+holiday.stderr+" "+holiday.stdout);
    assert.equal(sqlite.prepare("SELECT state FROM ik_pdks_unified_outbox WHERE id=?").get(holidayOutbox).state,"ACKED");

    const crashCommand="h-"+randomUUID(),crashOutbox="ho-"+randomUUID();
    insert(sqlite,company,crashCommand,crashOutbox,"holiday",{
      date:"2026-12-31",name:"Onaylı Özel Tatil",halfDay:false,
      note:"Uçtan uca ağ kesintisi denemesi için onay"
    });
    failOnceAck=true;
    const interrupted=await executeDotnet(dll,winEnv);
    assert.notEqual(interrupted.code,0,"Interrupted ACK must not be marked success");
    assert.equal(sqlite.prepare("SELECT state FROM ik_pdks_unified_outbox WHERE id=?").get(crashOutbox).state,"CLAIMED");
    const policyFile=join(root,"SISTEM","UnifiedPolicies","holidays","2026-12-31.json");
    const beforeHash=sha(await readFile(policyFile));
    const beforeStat=await stat(policyFile);
    sqlite.prepare("UPDATE ik_pdks_unified_outbox SET lease_until=? WHERE id=?")
      .run(new Date(Date.now()-60000).toISOString(),crashOutbox);
    const recovered=await executeDotnet(dll,winEnv);
    assert.equal(recovered.code,0,"Recovery Agent failed: "+recovered.stderr+" "+recovered.stdout);
    assert.match(recovered.stdout,/LOCAL_RECEIPT_ACK_REPLAYED/);
    assert.equal(sqlite.prepare("SELECT state FROM ik_pdks_unified_outbox WHERE id=?").get(crashOutbox).state,"ACKED");
    assert.equal(sha(await readFile(policyFile)),beforeHash);
    assert.equal((await stat(policyFile)).mtimeMs,beforeStat.mtimeMs);

    const groupDirectory=join(root,"SISTEM","UnifiedPolicies","personnel-groups");
    assert.equal((await readdir(groupDirectory)).filter(x=>x.endsWith(".json")).length,1);
    assert.equal(acceptedAckCount,3);
    const final=await executeDotnet(dll,winEnv);
    assert.equal(final.code,0);
    assert.match(final.stdout,/NO_PENDING_COMMAND/);
    const journals=(await readdir(join(root,"SISTEM","SyncJournal"))).filter(x=>x.endsWith(".applied.json"));
    assert.equal(journals.length,3);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM ik_pdks_unified_commands").get().total,3);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    sqlite.close();
    await rm(root,{recursive:true,force:true});
  }
});
