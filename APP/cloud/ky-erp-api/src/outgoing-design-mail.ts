// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";
import { sendGmailSystemMessage } from "./mail-google-gmail";

type Row = Record<string, any>;
const SCOPE = "DESEN_OUTGOING_MAIL_CONFIG";
const FILE_NAME = "config";
const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/11CHAtYphe1VshRhDdMER6umgxHJ9a5wt";
const DEFAULT_SENDER = "hkndesen@gmail.com";
const DEFAULT_RECIPIENT = "film@maverditekstil.com";
const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toUpperCase().replace(/İ/g,"I");
const now=()=>new Date().toISOString();
const emailOk=(v:unknown)=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(v).toLowerCase());
const canManage=(role:unknown)=>["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(upper(role));
const err=(code:string,message:string,details?:unknown)=>({ok:false,error:{code,message,...(details===undefined?{}:{details})}});
function slugOf(c:any,b:Row={}){return text(b.mainCompanySlug||b.main_company_slug||c.req.header("X-KYERP-Tenant-Slug")||c.req.query("mainCompanySlug")||"mecit-hakan").toLocaleLowerCase("tr-TR");}
async function bodyOf(c:any){try{const v=await c.req.json();return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch{return{};}}
function parseJson(value:unknown){
  if(value&&typeof value==="object"&&!Array.isArray(value))return value as Row;
  try{const parsed=JSON.parse(text(value)||"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Row:{};}catch{return{};}
}
function recipientList(value:unknown){
  const raw=Array.isArray(value)?value:[];
  return raw.map((item)=>text(typeof item==="string"?item:item?.email).toLowerCase()).filter(emailOk);
}
function defaultConfig(){return{
  enabled:false,
  senderEmail:DEFAULT_SENDER,
  recipients:[DEFAULT_RECIPIENT],
  sendRevisions:false,
  subjectTemplate:"Yeni desen dosyası: {{DOSYA_ADI}}",
  bodyTemplate:"Merhaba,\n\n{{DOSYA_ADI}} isimli yeni desen dosyası giden desenler klasörüne eklendi.\n\nModel: {{MODEL}}\nTarih: {{TARIH}}\nGoogle Drive klasörü: {{DRIVE_URL}}\n\nKY ERP",
  armedAt:null,
};}
function normalizeConfig(row:Row={}){
  const base=defaultConfig();
  return{...base,...row,senderEmail:text(row.senderEmail||base.senderEmail).toLowerCase(),recipients:recipientList(row.recipients||base.recipients),enabled:Boolean(row.enabled),sendRevisions:Boolean(row.sendRevisions)};
}
async function configRow(c:any,slug:string){
  const row=await c.env.DB.prepare("SELECT id,data,created_at,updated_at FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? ORDER BY updated_at DESC LIMIT 1")
    .bind(SCOPE,slug,FILE_NAME).first<Row>();
  if(!row)return null;
  return{...normalizeConfig(parseJson(row.data)),storeId:text(row.id),createdAt:row.created_at||null,updatedAt:row.updated_at||null};
}
async function saveConfig(c:any,slug:string,input:Row,userId:string){
  const current=await configRow(c,slug),ts=now();
  const enabled=input.enabled===true||input.enabled===1||input.enabled==="1";
  const next=normalizeConfig({...current,...input,enabled,armedAt:enabled&&!current?.enabled?ts:(current?.armedAt||null),updatedAt:ts,updatedBy:userId});
  const id=text(current?.storeId)||crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`)
    .bind(id,SCOPE,slug,FILE_NAME,JSON.stringify(next),current?.createdAt||ts,ts).run();
  return{...next,storeId:id};
}
async function bindingStatus(c:any,slug:string){
  return c.env.DB.prepare(`SELECT b.storage_connection_id,b.root_path,b.sync_enabled,c.name connection_name,c.provider_type,c.local_root_path,c.connection_status,c.last_sync_at,c.last_error
    FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id AND c.main_company_slug=b.main_company_slug
    WHERE b.main_company_slug=? AND UPPER(b.module_code)='DESEN' AND UPPER(b.purpose_code)='OUTGOING_DESIGN' LIMIT 1`).bind(slug).first<Row>();
}
async function senderStatus(c:any,slug:string,email:string){
  if(!email)return null;
  return c.env.DB.prepare(`SELECT id,email_address,provider_type,status,approval_status,provider_connected
    FROM mail_accounts WHERE main_company_slug=? AND LOWER(email_address)=LOWER(?) LIMIT 1`).bind(slug,email).first<Row>();
}
function render(template:string,data:Row){return String(template||"").replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>text(data[key]));}
async function requireManager(c:any){const user=await getAuthenticatedUser(c);return user&&canManage(user.role)?user:null;}
export async function handleOutgoingDesignMailEvent(c:any,input:Row){
  const slug=text(input.slug).toLocaleLowerCase("tr-TR"),sourceEvent=upper(input.sourceEvent||"SCAN");
  if(sourceEvent!=="WATCH")return{skipped:true,reason:"NOT_WATCH_EVENT"};
  const cfg=await configRow(c,slug);
  if(!cfg?.enabled)return{skipped:true,reason:"AUTOMATION_DISABLED"};
  if(Boolean(input.revisionChanged)&&!cfg.sendRevisions)return{skipped:true,reason:"REVISION_DISABLED"};
  const to=recipientList(cfg.recipients),senderEmail=text(cfg.senderEmail).toLowerCase();
  if(!emailOk(senderEmail)||!to.length)return{skipped:true,reason:"MAIL_CONFIG_INVALID"};
  const assetId=text(input.fileAssetId),sha=text(input.sha256)||"NOHASH";
  if(!assetId)return{skipped:true,reason:"ASSET_REQUIRED"};
  const eventId=`OUTGOING_DESIGN:${assetId}:${sha}`;
  const vars={DOSYA_ADI:text(input.fileName),MODEL:text(input.modelName)||text(input.fileName).replace(/\.[^.]+$/,"").toUpperCase(),TARIH:new Date().toLocaleString("tr-TR"),DRIVE_URL:DRIVE_FOLDER_URL};
  const subject=render(text(cfg.subjectTemplate),vars),bodyText=render(text(cfg.bodyTemplate),vars);
  try{
    const sent=await sendGmailSystemMessage(c,{tenant:slug,senderEmail,to,subject,bodyText,logicalEventId:eventId});
    await c.env.DB.prepare(`INSERT INTO file_hub_events(id,main_company_slug,storage_connection_id,file_asset_id,event_type,actor_type,device_name,details,created_at)
      VALUES(?,?,?,?,?,'SYSTEM',?,?,?)`).bind(crypto.randomUUID(),slug,text(input.storageConnectionId)||null,assetId,"OUTGOING_MAIL_SENT",text(input.deviceName)||null,JSON.stringify({fileName:text(input.fileName),recipients:to,providerMessageId:text(sent?.providerMessageId),logicalEventId:eventId}),now()).run().catch(()=>{});
    return{ok:true,status:"ACCEPTED",providerMessageId:text(sent?.providerMessageId)||null};
  }catch(error:any){
    await c.env.DB.prepare(`INSERT INTO file_hub_events(id,main_company_slug,storage_connection_id,file_asset_id,event_type,actor_type,device_name,details,created_at)
      VALUES(?,?,?,?,?,'SYSTEM',?,?,?)`).bind(crypto.randomUUID(),slug,text(input.storageConnectionId)||null,assetId,"OUTGOING_MAIL_FAILED",text(input.deviceName)||null,JSON.stringify({fileName:text(input.fileName),error:text(error?.message),code:text(error?.code),logicalEventId:eventId}),now()).run().catch(()=>{});
    return{ok:false,status:"FAILED",error:text(error?.message)||"Otomatik desen maili gönderilemedi.",code:text(error?.code)};
  }
}

export function registerOutgoingDesignMailRoutes(app:any){
  app.get("/api/desen/outgoing-mail/config",async(c:any)=>{
    const user=await requireManager(c);if(!user)return c.json(err("OWNER_ONLY","Giden desen mail ayarlarına erişim yetkiniz yok."),403);
    const slug=slugOf(c),cfg=(await configRow(c,slug))||normalizeConfig(),binding=await bindingStatus(c,slug),sender=await senderStatus(c,slug,cfg.senderEmail);
    return c.json({ok:true,data:{...cfg,binding:binding||null,sender:sender||null,driveFolderUrl:DRIVE_FOLDER_URL,ready:Boolean(binding?.storage_connection_id&&sender?.provider_connected&&upper(sender?.status)==="ACTIVE"&&upper(sender?.approval_status)==="APPROVED"&&cfg.recipients.length)}});
  });
  app.put("/api/desen/outgoing-mail/config",async(c:any)=>{
    const user=await requireManager(c);if(!user)return c.json(err("OWNER_ONLY","Giden desen mail ayarlarını değiştirme yetkiniz yok."),403);
    const body=await bodyOf(c),slug=slugOf(c,body),senderEmail=text(body.senderEmail).toLowerCase(),to=recipientList(body.recipients);
    if(!emailOk(senderEmail))return c.json(err("SENDER_INVALID","Geçerli bir sistem mail adresi girin."),422);
    if(!to.length||to.length>5)return c.json(err("RECIPIENT_INVALID","1 ile 5 arasında geçerli alıcı mail adresi girin."),422);
    const sender=await senderStatus(c,slug,senderEmail);
    if(!sender)return c.json(err("SYSTEM_GMAIL_ACCOUNT_NOT_FOUND","Sistem Gmail hesabı önce KY ERP Mail Merkezi'ne eklenmelidir."),409);
    const saved=await saveConfig(c,slug,{...body,senderEmail,recipients:to},text(user.id));
    const binding=await bindingStatus(c,slug),senderNow=await senderStatus(c,slug,senderEmail);
    return c.json({ok:true,data:{...saved,binding:binding||null,sender:senderNow||null,driveFolderUrl:DRIVE_FOLDER_URL,ready:Boolean(binding?.storage_connection_id&&senderNow?.provider_connected&&upper(senderNow?.status)==="ACTIVE"&&upper(senderNow?.approval_status)==="APPROVED"&&to.length)}});
  });

  app.post("/api/desen/outgoing-mail/test",async(c:any)=>{
    const user=await requireManager(c);if(!user)return c.json(err("OWNER_ONLY","Test maili gönderme yetkiniz yok."),403);
    const body=await bodyOf(c),slug=slugOf(c,body),cfg=(await configRow(c,slug))||normalizeConfig();
    try{
      const result=await sendGmailSystemMessage(c,{tenant:slug,senderEmail:cfg.senderEmail,to:cfg.recipients,subject:"[TEST] KY ERP Giden Desen Otomasyonu",bodyText:`KY ERP giden desen klasör izleme testi başarılıdır.\n\nGönderen: ${cfg.senderEmail}\nAlıcı: ${cfg.recipients.join(", ")}\nGoogle Drive: ${DRIVE_FOLDER_URL}\nTarih: ${new Date().toLocaleString("tr-TR")}`,logicalEventId:`OUTGOING_DESIGN_TEST:${slug}:${crypto.randomUUID()}`});
      return c.json({ok:true,data:result});
    }catch(error:any){return c.json(err(text(error?.code)||"TEST_SEND_FAILED",text(error?.message)||"Test maili gönderilemedi."),Number(error?.status)||502);}
  });
  app.get("/api/desen/outgoing-mail/jobs",async(c:any)=>{
    const user=await requireManager(c);if(!user)return c.json(err("OWNER_ONLY","Giden desen gönderim geçmişine erişim yetkiniz yok."),403);
    const slug=slugOf(c),take=Math.min(100,Math.max(1,Number(c.req.query("take")||40)));
    const result=await c.env.DB.prepare(`SELECT id,logical_event_id,status,provider_message_id,attempt_count,last_error,created_at,updated_at
      FROM mail_send_jobs WHERE main_company_slug=? AND logical_event_id LIKE 'OUTGOING_DESIGN:%' ORDER BY created_at DESC LIMIT ?`).bind(slug,take).all<Row>();
    const rows=[];
    for(const job of result.results||[]){
      const parts=text(job.logical_event_id).split(":");
      const assetId=parts.length>=3&&parts[1]!=="TEST"?parts[1]:"";
      const asset=assetId?await c.env.DB.prepare("SELECT file_name FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1").bind(assetId,slug).first<Row>():null;
      rows.push({...job,fileName:text(asset?.file_name)||"Test maili",fileAssetId:assetId||null});
    }
    return c.json({ok:true,data:rows});
  });
}
