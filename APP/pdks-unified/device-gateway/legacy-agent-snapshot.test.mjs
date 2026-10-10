import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readLegacyAgentSnapshot} from "./legacy-agent-snapshot.mjs";
test("legacy Windows Agent TCP/serial/file snapshot is readonly and redacted",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE agent_state(state_key TEXT,state_value TEXT,updated_at TEXT)");
 db.exec("CREATE TABLE raw_punches(source TEXT,event_at TEXT,card_no TEXT,raw_line TEXT)");
 const now=Date.parse("2026-10-10T15:00:00Z");
 db.prepare("INSERT INTO agent_state VALUES(?,?,?)").run(
   "heartbeat",new Date(now-4000).toISOString(),new Date(now-4000).toISOString());
 db.prepare("INSERT INTO agent_state VALUES(?,?,?)").run("capture_mode","SERIAL","");
 db.prepare("INSERT INTO raw_punches VALUES(?,?,?,?)").run(
   "SERIAL","2026-10-10T17:42:00","00127","SENSITIVE-RAW");
 db.prepare("INSERT INTO raw_punches VALUES(?,?,?,?)").run(
   "SERIAL","2026-10-10T18:42:00","00128","SENSITIVE-RAW-2");
 let mode;
 const status=readLegacyAgentSnapshot("/stage-only/pdks.db",{
   now,openDatabase:(path,options)=>{mode=options;return db;},
 });
 assert.equal(mode.readOnly,true);
 assert.equal(status.running,true);
 assert.equal(status.captureMode,"SERIAL");
 assert.equal(status.sources[0].acceptedTotal,2);
 assert.equal(status.sources[0].originVerified,false);
 assert.equal(JSON.stringify(status).includes("SENSITIVE-RAW"),false);
 assert.equal(JSON.stringify(status).includes("00127"),false);
});
test("missing or unauthorized local DB is shown as unavailable",()=>{
 assert.equal(readLegacyAgentSnapshot("relative.db").status,"AGENT_DB_NOT_CONFIGURED");
 assert.equal(readLegacyAgentSnapshot("/stage/missing.db",{
   openDatabase:()=>{throw Error("secret file IO");},
 }).status,"AGENT_DB_READ_UNAVAILABLE");
});
