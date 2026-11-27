import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {authorizeOfficeDevice,heartbeatOfficeDevice,officeRegistry,officeStatus,officeFenceCondition,isPublicIPv4,OFFICE_LEASE_MS} from "./isnet-office-coordinator.ts";
import {makeTestSendJournal} from "./isnet-test-send-journal.ts";
import type {Approval,Draft,Profile} from "./isnet-official-acceptance.ts";
class DB{
 sql=new DatabaseSync(":memory:");
 constructor(){this.sql.exec("CREATE TABLE json_store (id TEXT PRIMARY KEY,scope TEXT,main_company_slug TEXT,file_name TEXT,data TEXT,created_at TEXT,updated_at TEXT)");}
 prepare(sql:string){return{bind:(...args:any[])=>({run:async()=>({meta:{changes:this.sql.prepare(sql).run(...args).changes}}),first:async<T=unknown>()=>(this.sql.prepare(sql).get(...args) as T|undefined)||null})};}
}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
const ip="8.8.8.8"; // Synthetic comparison only; no network request.
const secretA="a".repeat(43),secretB="b".repeat(43),instanceA="11111111-1111-1111-1111-111111111111",instanceB="22222222-2222-2222-2222-222222222222";
async function fixture(){
 const registry=officeRegistry(JSON.stringify([{tenant:"firm-a",deviceId:"PC1",enabled:true,allowedIp:ip,secretHash:await hash(secretA)},{tenant:"firm-a",deviceId:"PC2",enabled:true,allowedIp:ip,secretHash:await hash(secretB)}]));
 const first={tenant:"firm-a",deviceId:"PC1",instanceId:instanceA,presentedSecret:secretA,trustedEdgeIp:ip};
 const second={...first,deviceId:"PC2",instanceId:instanceB,presentedSecret:secretB};
 return {registry,first,second,a:await authorizeOfficeDevice(registry,first),b:await authorizeOfficeDevice(registry,second)};
}
test("IP is an additional device gate, not a shared LAN authorization; no fallback on bad registry",async()=>{
 const {registry,first}=await fixture();
 for(const bad of ["192.168.1.1","10.0.0.1","100.64.0.1","127.0.0.1","203.0.113.3","08.8.8.8","1.1.1.256","::1"])assert.equal(isPublicIPv4(bad),false);
 assert.equal(isPublicIPv4(ip),true);
 for(const x of [{...first,tenant:"firm-b"},{...first,deviceId:"PC2"},{...first,presentedSecret:secretB},{...first,trustedEdgeIp:"1.1.1.1"},{...first,instanceId:"bad"}])await assert.rejects(()=>authorizeOfficeDevice(registry,x),/OFFICE_DEVICE_DENIED/);
 await assert.rejects(()=>authorizeOfficeDevice(registry.map(d=>({...d,enabled:false})),first),/OFFICE_DEVICE_DENIED/);
 assert.deepEqual(officeRegistry("bad"),[]);assert.deepEqual(officeRegistry(JSON.stringify([registry[0],registry[0]])),[]);
});
test("two office PCs share a single fenced leader; standby takes over after expiry; stale process cannot renew another instance",async()=>{
 const db=new DB(),{registry,a,b,first}=await fixture(),now=Date.now();
 const both=await Promise.all([heartbeatOfficeDevice(db,a,now),heartbeatOfficeDevice(db,b,now)]);
 assert.equal(both.filter(v=>v.role==="LEADER").length,1);
 const leader=both[0].role==="LEADER"?a:b,standby=leader===a?b:a,old=both.find(v=>v.lease)!.lease!;
 const next=await heartbeatOfficeDevice(db,leader,now+30000);assert.equal(next.lease?.fence,old.fence);
 assert.equal((await heartbeatOfficeDevice(db,standby,now+30001)).role,"STANDBY");
 const newer=await heartbeatOfficeDevice(db,standby,now+30000+OFFICE_LEASE_MS+1);
 assert.equal(newer.role,"LEADER");assert.notEqual(newer.lease?.fence,old.fence);
 assert.equal((await heartbeatOfficeDevice(db,leader,now+30000+OFFICE_LEASE_MS+2)).role,"STANDBY");
 assert.equal((await officeStatus(db,"firm-b",registry,now+30000+OFFICE_LEASE_MS+3)).configured,false);
 const status=await officeStatus(db,"firm-a",registry,now+30000+OFFICE_LEASE_MS+3);
 assert.equal(status.devices.filter(v=>v.role==="LEADER").length,1);assert.equal(status.sendEnabled,false);assert.equal(status.providerAuthorized,false);
 assert.doesNotMatch(JSON.stringify(status),/8\.8\.8\.8|secretHash|fence|instanceId/);
 const restarted=await authorizeOfficeDevice(registry,{...first,instanceId:crypto.randomUUID()});
 assert.equal((await heartbeatOfficeDevice(db,restarted,now+30000+OFFICE_LEASE_MS+4)).role,"STANDBY");
});
test("the existing TEST journal atomically checks office fence, blocks old PC and duplicate sends after takeover",async()=>{
 const db=new DB(),{a,b}=await fixture();
 const now=Date.now(),lease=(await heartbeatOfficeDevice(db,a,now)).lease!;
 // Simulate lease replacement without waiting. A still carries an unexpired local copy.
 db.sql.prepare("UPDATE json_store SET data=json_set(data,'$.expiresAt',?) WHERE scope='ISNET_OFFICE_LEASE_V1'").run(now-1);
 const newLease=(await heartbeatOfficeDevice(db,b,now)).lease!;
 const d:Draft={tenant:"firm-a",environment:"TEST",kind:"E_FATURA",direction:"OUTGOING",id:"d1",version:"1",ettn:"33333333-3333-3333-3333-333333333333",contentSha256:"a".repeat(64),status:"APPROVED"};
 const endpoint="https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc";
 const p:Profile={tenant:d.tenant,environment:"TEST",contractRevision:"fixture",endpoint,reviewedEndpoints:[endpoint],credentialRef:"fixture",enabled:true,companyVerified:true,evidence:[{tenant:d.tenant,environment:"TEST",contractRevision:"fixture",companyVerified:true,providerVerified:true,evidenceId:"fixture",operation:"document.submit",kind:d.kind,direction:"OUTGOING"}]};
 const approval:Approval={tenant:d.tenant,environment:"TEST",draftId:d.id,ettn:d.ettn,contentSha256:d.contentSha256,version:d.version,userId:"fixture",approvedAt:new Date().toISOString(),explicit:true};
 const input={tenant:d.tenant,environment:"TEST",draftId:d.id,version:d.version,ettn:d.ettn,contentSha256:d.contentSha256,expectedStatus:"APPROVED"};
 assert.throws(()=>officeFenceCondition({...lease,tenant:"firm-b"},d.tenant,now),/OFFICE_LEASE_EXPIRED/);
 assert.equal(await makeTestSendJournal(db,p,d,approval,"CLIENT_NUMBERED",lease).claim(input),null);
 const journal=makeTestSendJournal(db,p,d,approval,"CLIENT_NUMBERED",newLease);
 const claims=await Promise.all(Array.from({length:50},()=>journal.claim(input)));assert.equal(claims.filter(Boolean).length,1);
 await journal.settle({claimId:claims.find(Boolean)!,tenant:d.tenant,draftId:d.id,version:d.version,ettn:d.ettn,status:"UNKNOWN_REVIEW_REQUIRED",providerResult:null});
 // Even if the other machine becomes leader, unresolved external side effects are never retried.
 db.sql.prepare("UPDATE json_store SET data=json_set(data,'$.expiresAt',?) WHERE scope='ISNET_OFFICE_LEASE_V1'").run(now-1);
 const third=(await heartbeatOfficeDevice(db,a,now)).lease!;
 assert.equal(await makeTestSendJournal(db,p,d,approval,"CLIENT_NUMBERED",third).claim(input),null);
});
