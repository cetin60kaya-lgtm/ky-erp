import type { Context, Hono } from "hono";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string;pdksCompany?:string}};
type Row=Record<string,any>;
const text=(value:unknown)=>value==null?"":String(value).trim();
const upper=(value:unknown)=>text(value).toUpperCase().replace(/İ/g,"I");
const nowIso=()=>new Date().toISOString();
const fail=(c:Context<AppEnv>,status:number,code:string,message:string)=>
  c.json({ok:false,error:{code,message}},status as any);
const ok=(c:Context<AppEnv>,data:unknown,status=200)=>c.json({ok:true,data},status as any);

async function sha256(value:string){
  const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(raw),v=>v.toString(16).padStart(2,"0")).join("");
}
function safeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function bytesToBase64(bytes:Uint8Array){
  let binary="";
  for(const value of bytes)binary+=String.fromCharCode(value);
  return btoa(binary);
}
async function hmacSha256Base64(secret:string,payload:string){
  const key=await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));
  return bytesToBase64(new Uint8Array(signed));
}
async function first(c:Context<AppEnv>,sql:string,params:unknown[]=[]){
  return c.env.DB.prepare(sql).bind(...params).first<Row>();
}
async function hasUnifiedSchema(c:Context<AppEnv>){
  const rows=await Promise.all(["ik_pdks_unified_commands","ik_pdks_unified_outbox","ik_pdks_devices"]
    .map((name)=>first(c,"SELECT name FROM sqlite_master WHERE type='table' AND name=?",[name])));
  return rows.every(Boolean);
}
function syncSigningKey(c:Context<AppEnv>){
  return text((c.env as any).KY_PDKS_UNIFIED_SYNC_KEY);
}
async function resolveDevice(c:Context<AppEnv>){
  const deviceId=text(c.req.header("X-KYERP-PDKS-Device"));
  const secret=text(c.req.header("X-KYERP-PDKS-Secret"));
  if(!deviceId||!secret)return null;
  const row=await first(c,
    "SELECT id,main_company_id,secret_hash,active FROM ik_pdks_devices WHERE id=? AND active=1 LIMIT 1",
    [deviceId]).catch(()=>null);
  if(!row)return null;
  const actual=await sha256(secret);
  return safeEqual(actual,text(row.secret_hash).toLowerCase())?row:null;
}
function addMinutes(iso:string,minutes:number){
  return new Date(Date.parse(iso)+minutes*60000).toISOString();
}
async function jsonBody(c:Context<AppEnv>){
  try{
    const body=await c.req.json();
    return body&&typeof body==="object"&&!Array.isArray(body)?body as Row:{};
  }catch{return {};}
}
function localReceiptValid(receipt:Row){
  if(!receipt||typeof receipt!=="object"||Array.isArray(receipt))return false;
  if(!text(receipt.journalId)||!text(receipt.appliedAt))return false;
  if(!/^[a-f0-9]{64}$/.test(text(receipt.commandPayloadSha256)))return false;
  if(!text(receipt.commandId)||!text(receipt.outboxId)||!text(receipt.deviceId))return false;
  if(!/^[a-f0-9]{64}$/.test(text(receipt.evidenceSha256)))return false;
  if(receipt.sourceValidated!==true||receipt.fdbValidated!==true)return false;
  if(typeof receipt.tnfTouched!=="boolean")return false;
  if(receipt.tnfTouched===true&&receipt.tnfValidated!==true)return false;
  return true;
}

export function registerIkPdksUnifiedAgentRoutes(app:Hono<AppEnv>){
  app.get("/api/auth/pdks-unified/outbox/next",async(c)=>{
    if(!(await hasUnifiedSchema(c)))
      return fail(c,503,"PDKS_MIGRATION_0060_REQUIRED","Unified PDKS outbox şeması hazır değil.");
    const device=await resolveDevice(c);
    if(!device)return fail(c,401,"PDKS_DEVICE_UNAUTHORIZED","Windows Agent cihaz yetkisi geçersiz.");
    const signingKey=syncSigningKey(c);
    if(!signingKey)return fail(c,503,"PDKS_SYNC_SIGNING_KEY_REQUIRED","Unified sync imzalama anahtarı yapılandırılmadı.");

    const company=text(device.main_company_id);
    const stamp=nowIso();
    const row=await first(c,`SELECT o.id,o.command_id,o.event_type,o.payload_json,o.delivery_attempts,
      o.created_at,c.action,c.payload_sha256,c.request_id,c.actor_user_id
      FROM ik_pdks_unified_outbox o
      JOIN ik_pdks_unified_commands c ON c.id=o.command_id AND c.main_company_id=o.main_company_id
      WHERE o.main_company_id=?
        AND (o.next_attempt_at IS NULL OR o.next_attempt_at<=?)
        AND (o.state='PENDING' OR (o.state='CLAIMED' AND (o.lease_until IS NULL OR o.lease_until<=?)))
      ORDER BY o.created_at,o.id LIMIT 1`,[company,stamp,stamp]);
    if(!row)return ok(c,null);

    const leaseUntil=addMinutes(stamp,5);
    const claimed=await c.env.DB.prepare(`UPDATE ik_pdks_unified_outbox
      SET state='CLAIMED',delivery_owner=?,lease_until=?,delivery_attempts=delivery_attempts+1,
          last_error=NULL,next_attempt_at=NULL,delivery_hash=NULL
      WHERE id=? AND main_company_id=?
        AND (state='PENDING' OR (state='CLAIMED' AND (lease_until IS NULL OR lease_until<=?)))`)
      .bind(text(device.id),leaseUntil,text(row.id),company,stamp).run();
    if(Number((claimed as any)?.meta?.changes||0)!==1)return c.body(null,204);

    let payload:unknown={};
    try{payload=JSON.parse(text(row.payload_json)||"{}");}
    catch{
      await c.env.DB.prepare(`UPDATE ik_pdks_unified_outbox SET state='FAILED',
        delivery_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND main_company_id=?`)
        .bind("INVALID_OUTBOX_JSON",text(row.id),company).run();
      return fail(c,409,"PDKS_OUTBOX_INVALID","Outbox içeriği okunamadı; kayıt başarısız olarak işaretlendi.");
    }

    const signed={
      version:1,outboxId:text(row.id),commandId:text(row.command_id),eventType:text(row.event_type),
      company,deviceId:text(device.id),action:text(row.action),requestId:text(row.request_id),
      actorUserId:text(row.actor_user_id),commandPayloadSha256:text(row.payload_sha256),
      payload,issuedAt:stamp,leaseUntil,
    };
    const canonical=JSON.stringify(signed);
    const deliveryHash=await sha256(canonical);
    const signature=await hmacSha256Base64(signingKey,canonical);
    const locked=await c.env.DB.prepare(`UPDATE ik_pdks_unified_outbox SET delivery_hash=?
      WHERE id=? AND main_company_id=? AND delivery_owner=?
      AND state='CLAIMED' AND lease_until=? AND delivery_hash IS NULL`)
      .bind(deliveryHash,text(row.id),company,text(device.id),leaseUntil).run();
    if(Number((locked as any)?.meta?.changes||0)!==1)
      return fail(c,409,"PDKS_DELIVERY_CLAIM_CHANGED","Outbox lease değişti; eski teslim reddedildi.");
    return ok(c,{
      outboxId:text(row.id),commandId:text(row.command_id),deliveryHash,leaseUntil,
      signatureAlg:"HMAC-SHA256",signedPayload:bytesToBase64(new TextEncoder().encode(canonical)),signature,
      deliveryAttempt:Number(row.delivery_attempts||0)+1,
    });
  });

  app.post("/api/auth/pdks-unified/outbox/:id/ack",async(c)=>{
    if(!(await hasUnifiedSchema(c)))
      return fail(c,503,"PDKS_MIGRATION_0060_REQUIRED","Unified PDKS outbox şeması hazır değil.");
    const device=await resolveDevice(c);
    if(!device)return fail(c,401,"PDKS_DEVICE_UNAUTHORIZED","Windows Agent cihaz yetkisi geçersiz.");
    const id=text(c.req.param("id")),company=text(device.main_company_id),body=await jsonBody(c);
    const status=upper(body.status);
    if(!["ACKED","FAILED","RETRY"].includes(status))
      return fail(c,400,"PDKS_AGENT_RESULT_INVALID","Agent sonucu ACKED, FAILED veya RETRY olmalıdır.");
    const row=await first(c,`SELECT o.*,c.payload_sha256,c.action FROM ik_pdks_unified_outbox o
      JOIN ik_pdks_unified_commands c ON c.id=o.command_id AND c.main_company_id=o.main_company_id
      WHERE o.id=? AND o.main_company_id=? LIMIT 1`,[id,company]);
    if(!row)return fail(c,404,"PDKS_OUTBOX_NOT_FOUND","Unified outbox kaydı bulunamadı.");
    if(text(row.state)==="ACKED"){
      return ok(c,{id,state:"ACKED",replayed:true,acknowledgedAt:row.acknowledged_at});
    }
    if(text(row.state)!=="CLAIMED"||text(row.delivery_owner)!==text(device.id))
      return fail(c,409,"PDKS_OUTBOX_LEASE_MISMATCH","Outbox kaydı bu Windows Agent tarafından kiralanmamış.");
    if(!text(body.deliveryHash)||!safeEqual(text(body.deliveryHash),text(row.delivery_hash)))
      return fail(c,409,"PDKS_OUTBOX_HASH_MISMATCH","Teslim edilen outbox özeti eşleşmiyor.");

    const stamp=nowIso();
    if(!text(row.lease_until)||text(row.lease_until)<stamp)
      return fail(c,409,"PDKS_OUTBOX_LEASE_EXPIRED","Teslim süresi doldu; yeniden teslim alınmalı.");
    if(status==="RETRY"){
      const reason=text(body.reason)||"AGENT_RETRY_REQUESTED";
      const next=addMinutes(stamp,15);
      await c.env.DB.prepare(`UPDATE ik_pdks_unified_outbox
        SET state='PENDING',delivery_owner=NULL,lease_until=NULL,next_attempt_at=?,last_error=?
        WHERE id=? AND main_company_id=? AND state='CLAIMED'
          AND delivery_owner=? AND delivery_hash=? AND lease_until>=?`)
        .bind(next,reason.slice(0,1000),id,company,text(device.id),text(body.deliveryHash),stamp).run();
      const updated=await first(c,"SELECT state,next_attempt_at FROM ik_pdks_unified_outbox WHERE id=? AND main_company_id=?",[id,company]);
      if(text(updated?.state)!=="PENDING"||text(updated?.next_attempt_at)!==next)
        return fail(c,409,"PDKS_OUTBOX_RETRY_RACE","Outbox retry başka işlemle çakıştı.");
      return ok(c,{id,state:"PENDING",nextAttemptAt:next});
    }
    if(status==="FAILED"){
      const reason=text(body.reason)||"LOCAL_APPLY_FAILED";
      await c.env.DB.prepare(`UPDATE ik_pdks_unified_outbox
        SET state='FAILED',delivery_owner=NULL,lease_until=NULL,next_attempt_at=NULL,last_error=?
        WHERE id=? AND main_company_id=? AND state='CLAIMED'
          AND delivery_owner=? AND delivery_hash=? AND lease_until>=?`)
        .bind(reason.slice(0,1000),id,company,text(device.id),text(body.deliveryHash),stamp).run();
      const updated=await first(c,"SELECT state FROM ik_pdks_unified_outbox WHERE id=? AND main_company_id=?",[id,company]);
      if(text(updated?.state)!=="FAILED")
        return fail(c,409,"PDKS_OUTBOX_FAIL_RACE","Outbox fail başka işlemle çakıştı.");
      return ok(c,{id,state:"FAILED"});
    }

    const receipt=body.localReceipt as Row;
    if(!localReceiptValid(receipt))
      return fail(c,409,"PDKS_LOCAL_RECEIPT_INVALID","FDB/TNF mutabakat kanıtı eksik; ACK verilmedi.");
    // Device ID/secret alone must not forge a local-apply ACK. Require
    // independent Agent HMAC bound to this exact lease hash and receipt.
    const signingKey=syncSigningKey(c);
    if(!signingKey)return fail(c,503,"PDKS_SYNC_SIGNING_KEY_REQUIRED","ACK imza doğrulama anahtarı eksik.");
    const hmacProof=text(body.localReceiptHmac);
    const expectedHmac=await hmacSha256Base64(signingKey,
      text(body.deliveryHash)+"."+await sha256(JSON.stringify(receipt)));
    if(!hmacProof||!safeEqual(hmacProof,expectedHmac))
      return fail(c,409,"PDKS_LOCAL_RECEIPT_HMAC_INVALID","Yerel uygulama kanıt imzası geçersiz.");
    if(!safeEqual(text(receipt.commandPayloadSha256),text(row.payload_sha256)) ||
       !safeEqual(text(receipt.commandId),text(row.command_id)) ||
       !safeEqual(text(receipt.outboxId),id) ||
       !safeEqual(text(receipt.deviceId),text(device.id)))
      return fail(c,409,"PDKS_LOCAL_RECEIPT_PAYLOAD_MISMATCH","Yerel fiş Cloud komut/cihaz özetiyle eşleşmiyor.");
    const ackJson=JSON.stringify({
      ...receipt,deviceId:text(device.id),outboxId:id,commandId:text(row.command_id),
      action:text(row.action),acknowledgedAt:stamp,
    });
    const ackSha=await sha256(ackJson);
    const changed=await c.env.DB.prepare(`UPDATE ik_pdks_unified_outbox
      SET state='ACKED',delivery_owner=NULL,lease_until=NULL,next_attempt_at=NULL,last_error=NULL,
          ack_payload_json=?,ack_sha256=?,acknowledged_at=?
      WHERE id=? AND main_company_id=? AND state='CLAIMED'
        AND delivery_owner=? AND delivery_hash=? AND lease_until>=?`)
      .bind(ackJson,ackSha,stamp,id,company,text(device.id),text(body.deliveryHash),stamp).run();
    if(Number((changed as any)?.meta?.changes||0)!==1)
      return fail(c,409,"PDKS_OUTBOX_ACK_RACE","Outbox ACK başka işlemle çakıştı.");
    return ok(c,{id,state:"ACKED",ackSha256:ackSha,acknowledgedAt:stamp});
  });
}
