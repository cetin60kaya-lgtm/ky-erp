// Multi-PC office egress coordination. Only server-owned settings and Cloudflare
// edge-observed IP are trusted. User login is intentionally independent of this IP.
import {normalizeLiveProbe,type LiveProbe} from "./isnet-live-contract.ts";
type DB={prepare(sql:string):{bind(...args:any[]):{run():Promise<{meta?:{changes?:number|bigint}}>;first<T=unknown>():Promise<T|null>}}};
export const OFFICE_LEASE_SCOPE="ISNET_OFFICE_LEASE_V1";
export const OFFICE_HEARTBEAT_SCOPE="ISNET_OFFICE_HEARTBEAT_V1";
export const OFFICE_LEASE_MS=90000;
const idOk=(s:unknown):s is string=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
const hex=(s:unknown):s is string=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const uuid=(s:unknown):s is string=>typeof s==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
export function isPublicIPv4(s:unknown):s is string{
 if(typeof s!=="string"||!/^(\d{1,3}\.){3}\d{1,3}$/.test(s))return false;
 const parts=s.split("."),a=parts.map(Number);if(a.some((n,i)=>n>255||String(n)!==parts[i]))return false;
 const [x,y,z]=a;
 return !(x===0||x===10||x===127||x>=224||x===169&&y===254||x===172&&y>=16&&y<=31||x===192&&(y===168||y===0||y===88&&z===99)||x===100&&y>=64&&y<=127||x===198&&(y===18||y===19||y===51&&z===100)||x===203&&y===0&&z===113);
}
type Device={tenant:string;deviceId:string;enabled:boolean;secretHash:string;allowedIp:string};
const brand=Symbol("office-device");
export type VerifiedOfficeDevice={tenant:string;deviceId:string;instanceId:string;[brand]:true};
export type OfficeFence={tenant:string;deviceId:string;instanceId:string;fence:string;expiresAt:number};
type AuthInput={tenant:string;deviceId:string;instanceId:string;presentedSecret:string;trustedEdgeIp:string};
/** Missing or malformed registry fails closed. Only the server secret binding can supply it. */
export function officeRegistry(raw:unknown):Device[]{
 if(typeof raw!=="string"||raw.length>100000||!raw)return [];
 try{
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.length>100||rows.some(d=>!d||!idOk(d.tenant)||!idOk(d.deviceId)||typeof d.enabled!=="boolean"||!hex(d.secretHash)||!isPublicIPv4(d.allowedIp)))return [];
  if(new Set(rows.map(d=>JSON.stringify([d.tenant,d.deviceId]))).size!==rows.length||new Set(rows.map(d=>d.secretHash)).size!==rows.length)return [];
  return rows as Device[];
 }catch{return []}
}
export async function authorizeOfficeDevice(rows:Device[],i:AuthInput):Promise<VerifiedOfficeDevice>{
 if(!idOk(i.tenant)||!idOk(i.deviceId)||!uuid(i.instanceId)||!isPublicIPv4(i.trustedEdgeIp)||!/^[A-Za-z0-9_-]{43}$/.test(i.presentedSecret))throw Error("OFFICE_DEVICE_DENIED");
 const d=rows.find(r=>r.tenant===i.tenant&&r.deviceId===i.deviceId&&r.enabled===true&&r.allowedIp===i.trustedEdgeIp);
 if(!d||!hex(d.secretHash))throw Error("OFFICE_DEVICE_DENIED");
 const h=await sha(i.presentedSecret);let diff=0;for(let k=0;k<64;k++)diff|=h.charCodeAt(k)^d.secretHash.charCodeAt(k);
 if(diff)throw Error("OFFICE_DEVICE_DENIED");
 return Object.freeze({tenant:d.tenant,deviceId:d.deviceId,instanceId:i.instanceId,[brand]:true as const});
}
export const officeLeaseKey=(tenant:string)=>OFFICE_LEASE_SCOPE+":"+tenant;
const hbKey=(d:VerifiedOfficeDevice)=>OFFICE_HEARTBEAT_SCOPE+":"+JSON.stringify([d.tenant,d.deviceId]);
type Row={data:string};
export async function heartbeatOfficeDevice(db:DB,d:VerifiedOfficeDevice,now=Date.now(),probe:LiveProbe|null=null):Promise<{role:"LEADER"|"STANDBY";lease:OfficeFence|null}>{
 if(d[brand]!==true||!Number.isSafeInteger(now)||now<0)throw Error("OFFICE_DEVICE_DENIED");
 const ts=new Date(now).toISOString(),id=officeLeaseKey(d.tenant),fence=crypto.randomUUID(),expiresAt=now+OFFICE_LEASE_MS;
 const hb=hbKey(d);
 await db.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE scope=excluded.scope AND main_company_slug=excluded.main_company_slug").bind(hb,OFFICE_HEARTBEAT_SCOPE,d.tenant,hb,JSON.stringify({deviceId:d.deviceId,instanceId:d.instanceId,lastSeenAt:now,liveProbe:normalizeLiveProbe(probe,now)}),ts,ts).run();
 // Keep a single active lease per tenant. Same running instance renews its fence;
 // expired or replaced instance receives a new fence. No check-then-write race.
 const value=JSON.stringify({tenant:d.tenant,deviceId:d.deviceId,instanceId:d.instanceId,fence,expiresAt});
 await db.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=CASE WHEN json_extract(data,'$.expiresAt')>? AND json_extract(data,'$.deviceId')=? AND json_extract(data,'$.instanceId')=? THEN json_set(data,'$.expiresAt',?) ELSE excluded.data END,updated_at=excluded.updated_at WHERE scope=excluded.scope AND main_company_slug=excluded.main_company_slug AND (json_extract(data,'$.expiresAt')<=? OR (json_extract(data,'$.deviceId')=? AND json_extract(data,'$.instanceId')=?))").bind(id,OFFICE_LEASE_SCOPE,d.tenant,id,value,ts,ts,now,d.deviceId,d.instanceId,expiresAt,now,d.deviceId,d.instanceId).run();
 const row=await db.prepare("SELECT data FROM json_store WHERE id=? AND scope=? AND main_company_slug=?").bind(id,OFFICE_LEASE_SCOPE,d.tenant).first<Row>();
 if(!row)return {role:"STANDBY",lease:null};
 const lease=JSON.parse(row.data) as OfficeFence;
 if(lease.tenant!==d.tenant||lease.deviceId!==d.deviceId||lease.instanceId!==d.instanceId||!uuid(lease.fence)||!Number.isSafeInteger(lease.expiresAt)||lease.expiresAt<=now)return {role:"STANDBY",lease:null};
 return {role:"LEADER",lease};
}
export async function officeStatus(db:DB,tenant:string,registry:Device[],now=Date.now()){
 const devices=registry.filter(d=>d.tenant===tenant&&d.enabled);
 const row=await db.prepare("SELECT data FROM json_store WHERE id=? AND scope=? AND main_company_slug=?").bind(officeLeaseKey(tenant),OFFICE_LEASE_SCOPE,tenant).first<Row>();
 let leader:OfficeFence|null=null;
 try{const v=JSON.parse(row?.data||"null");if(v?.tenant===tenant&&v.expiresAt>now&&devices.some(d=>d.deviceId===v.deviceId))leader=v;}catch{}
 const status=await Promise.all(devices.map(async d=>{
  const id=OFFICE_HEARTBEAT_SCOPE+":"+JSON.stringify([tenant,d.deviceId]);
  const row=await db.prepare("SELECT data FROM json_store WHERE id=? AND scope=? AND main_company_slug=?").bind(id,OFFICE_HEARTBEAT_SCOPE,tenant).first<Row>();
  let lastSeenAt:number|null=null,liveProbe:LiveProbe|null=null;try{const v=JSON.parse(row?.data||"null");if(v?.deviceId===d.deviceId&&Number.isSafeInteger(v.lastSeenAt)&&v.lastSeenAt<=now){lastSeenAt=v.lastSeenAt;liveProbe=normalizeLiveProbe(v.liveProbe,now);}}catch{}
  const online=lastSeenAt!==null&&now-lastSeenAt<OFFICE_LEASE_MS;
  return {deviceId:d.deviceId,online,lastSeenAt:lastSeenAt===null?null:new Date(lastSeenAt).toISOString(),role:online&&leader?.deviceId===d.deviceId?"LEADER":online?"STANDBY":"OFFLINE",liveProbe:online?liveProbe:null};
 }));
 return {configured:devices.length>0,online:status.some(d=>d.online),devices:status,providerAuthorized:false,sendEnabled:false,reason:"PROVIDER_LIVE_CONTRACT_PENDING"};
}
/** SQL guard for existing durable document claim, not an independent send journal.
 * Must be applied atomically in the same INSERT that claims the immutable draft. */
export function officeFenceCondition(f:OfficeFence,tenant:string,now:number){
 if(f.tenant!==tenant||!idOk(f.deviceId)||!uuid(f.instanceId)||!uuid(f.fence)||!Number.isSafeInteger(f.expiresAt)||f.expiresAt<=now)throw Error("OFFICE_LEASE_EXPIRED");
 return {sql:" AND EXISTS (SELECT 1 FROM json_store office WHERE office.id=? AND office.scope=? AND office.main_company_slug=? AND json_extract(office.data,'$.deviceId')=? AND json_extract(office.data,'$.instanceId')=? AND json_extract(office.data,'$.fence')=? AND json_extract(office.data,'$.expiresAt')>?)",args:[officeLeaseKey(tenant),OFFICE_LEASE_SCOPE,tenant,f.deviceId,f.instanceId,f.fence,now]};
}
