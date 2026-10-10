/**
 * Read-only bridge to the EXISTING KYERP.PDKS.Agent SQLite/WAL journal.
 * The legacy Windows Agent already supports FILE, TCP_SERVER, TCP_CLIENT,
 * SERIAL and HEDEF_TR500. We do not start another TCP/serial listener or
 * create a second personnel/attendance database.
 *
 * Aggregate only: no card, name, raw lines, payroll or credentials leave
 * this adapter. A source name is NOT a verified physical terminal identity.
 */
import {isAbsolute} from "node:path";
import {DatabaseSync} from "node:sqlite";

const SOURCES=new Set(["FILE","TCP_CLIENT","TCP_SERVER","SERIAL","HEDEF_TR500"]);
export function readLegacyAgentSnapshot(databasePath,{
  openDatabase=(p,options)=>new DatabaseSync(p,options),
  now=Date.now(),
}={}){
  if(typeof databasePath!=="string"||!isAbsolute(databasePath))
    return Object.freeze({status:"AGENT_DB_NOT_CONFIGURED",sources:[],running:false});
  let db;
  try{
    db=openDatabase(databasePath,{readOnly:true,timeout:2000});
    const states=db.prepare(
      "SELECT state_key,state_value,updated_at FROM agent_state WHERE state_key IN ('heartbeat','capture_mode','terminal_state')"
    ).all();
    const state=new Map(states.map(x=>[String(x.state_key),x]));
    const heartbeat=Date.parse(String(state.get("heartbeat")?.state_value??""));
    const running=Number.isFinite(heartbeat)&&heartbeat<=now&&now-heartbeat<=15000;
    const counts=db.prepare(
      "SELECT source,COUNT(*) AS total,MAX(event_at) AS last_at FROM raw_punches GROUP BY source"
    ).all();
    const rows=counts.filter(x=>SOURCES.has(String(x.source))).map(x=>
      Object.freeze({source:String(x.source),acceptedTotal:Number(x.total),
        lastPunchAt:String(x.last_at??"")||null,originVerified:false,
        firebirdReconciled:false,tnfReconciled:false}));
    return Object.freeze({status:running?"AGENT_HEARTBEAT_ONLINE":"AGENT_HEARTBEAT_OFFLINE",
      running,captureMode:String(state.get("capture_mode")?.state_value??"UNKNOWN").slice(0,40),
      terminalState:String(state.get("terminal_state")?.state_value??"UNKNOWN").slice(0,160),
      sources:Object.freeze(rows)});
  }catch{
    return Object.freeze({status:"AGENT_DB_READ_UNAVAILABLE",running:false,sources:[]});
  }finally{try{db?.close();}catch{}}
}
