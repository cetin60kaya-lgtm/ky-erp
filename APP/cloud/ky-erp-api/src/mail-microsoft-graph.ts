// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud.ts";
import { openMailCredential, sealMailCredential } from "./mail-communication-core.ts";
import { readFileHubAssetForMail } from "./file-hub-cloud-oauth.ts";
import { mailReplyContext } from "./mail-reply-context.ts";
import {microsoftDeltaPageState,microsoftDeltaSafeUrl,microsoftDeltaComplete} from "./mail-microsoft-delta-core.ts";
import {invoiceMailDocumentFromFile,invoiceMailDispatchKey,invoiceMailLegacyKeyPrefix} from "./invoice-mail-model-evidence.ts";
import {ingestIncomingMailDispatch} from "./e-belge-center-cloud";
import {accountingAccess,accountingTenantReadAllowed} from "./accounting-access-policy";

type AnyRow = Record<string, any>;

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTHORIZE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const CALLBACK = "https://api.kyerp.net/api/auth/mail/oauth/microsoft/callback";
const APP_RETURN = "https://kyerp.net/iletisim/mail-gelen";
const SCOPES = [
  "openid","profile","email","offline_access","User.Read",
  "Mail.ReadWrite","Mail.Send"
].join(" ");
const scopesForAccount=(account:AnyRow)=>["SHARED","DEPARTMENT"].includes(String(account?.account_type||"").toUpperCase().replace(/İ/g,"I"))
  ? SCOPES+" Mail.ReadWrite.Shared Mail.Send.Shared" : SCOPES;

const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toUpperCase().replace(/İ/g,"I");
const nowIso=()=>new Date().toISOString();
const ownerRole=(v:unknown)=>["SUPER_ADMIN","ADMIN"].includes(upper(v));
const companyAdminRole=(v:unknown)=>upper(v)==="COMPANY_ADMIN";
const err=(code:string,message:string,details?:unknown)=>({ok:false,error:{code,message,...(details===undefined?{}:{details})}});

async function bodyOf(c:any){try{const v=await c.req.json();return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch{return{};}}
function ownTenant(current:AnyRow){return text(current?.mainCompanySlug||current?.security?.main_company_slug);}
function tenantOf(c:any,body:AnyRow,current:AnyRow){
  const requested=text(body?.mainCompanySlug||body?.main_company_slug||c.req.header("X-KYERP-Tenant-Slug")||c.req.query("mainCompanySlug"));
  const own=ownTenant(current);
  if(ownerRole(current?.role))return requested||own;
  if(!own||requested&&requested!==own)return"";
  return own;
}
function perm(current:AnyRow,flag="canView"){
  if(ownerRole(current?.role)||companyAdminRole(current?.role))return true;
  const row=(Array.isArray(current?.permissions)?current.permissions:[]).find((r:AnyRow)=>upper(r?.moduleKey||r?.module_key)==="MAIL");
  if(!row)return false;
  const legacy:any={canView:"can_view",canCreate:"can_create",canUpdate:"can_update",canApprove:"can_approve"};
  return Boolean(row[flag]??row[legacy[flag]]);
}
async function currentAccess(c:any,body:AnyRow={}){
  const current=await getAuthenticatedUser(c);
  if(!current)return{error:c.json(err("UNAUTHORIZED","Oturum gereklidir."),401)};
  const tenant=tenantOf(c,body,current);
  if(!tenant)return{error:c.json(err("TENANT_FORBIDDEN","Bu firma mail hesabına erişim yok."),403)};
  return{current,tenant};
}
function randomToken(bytes=48){const a=new Uint8Array(bytes);crypto.getRandomValues(a);let raw="";for(const b of a)raw+=String.fromCharCode(b);return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256Bytes(value:string){return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));}
function b64url(bytes:Uint8Array){let raw="";for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256Hex(value:string){const bytes=await sha256Bytes(value);return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");}
function clientConfig(c:any){
  const clientId=text(c.env.MICROSOFT_MAIL_CLIENT_ID || c.env.MICROSOFT_GRAPH_CLIENT_ID),clientSecret=text(c.env.MICROSOFT_MAIL_CLIENT_SECRET || c.env.MICROSOFT_GRAPH_CLIENT_SECRET);
  if(!clientId||!clientSecret)throw Object.assign(new Error("Microsoft Graph OAuth uygulama bilgileri production secret olarak tanımlı değil."),{code:"MICROSOFT_MAIL_CONFIG_MISSING"});
  return{clientId,clientSecret};
}
async function tokenPost(c:any,values:Record<string,string>){
  const cfg=clientConfig(c);
  const response=await fetch(TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:new URLSearchParams({...values,client_id:cfg.clientId,client_secret:cfg.clientSecret})});
  const payload=await response.json().catch(()=>({})) as AnyRow;
  if(!response.ok||!text(payload.access_token))throw Object.assign(new Error(text(payload.error_description||payload.error)||"Microsoft token isteği reddedildi."),{code:"MICROSOFT_TOKEN_FAILED",status:response.status});
  return payload;
}
async function graphJson(url:string,accessToken:string,init:RequestInit={}){
  const headers=new Headers(init.headers||{});headers.set("Authorization","Bearer "+accessToken);headers.set("Accept","application/json");
  if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const response=await fetch(url,{...init,headers});
  const payload=await response.json().catch(()=>({})) as AnyRow;
  if(!response.ok)throw Object.assign(new Error(text(payload?.error?.message)||"Microsoft Graph isteği başarısız."),{code:"MICROSOFT_GRAPH_FAILED",status:response.status});
  return{payload,response};
}
async function accountForUser(c:any,current:AnyRow,tenant:string,accountId:string){
  const account=await c.env.DB.prepare("SELECT * FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1").bind(accountId,tenant).first<AnyRow>();
  if(!account)return null;
  if(ownerRole(current?.role)||companyAdminRole(current?.role)||text(account.created_by)===text(current?.id))return account;
  const member=await c.env.DB.prepare("SELECT * FROM mail_account_members WHERE main_company_slug=? AND account_id=? AND user_id=? AND can_view=1 LIMIT 1").bind(tenant,accountId,text(current?.id)).first<AnyRow>();
  return member?account:null;
}
async function memberCanSend(c:any,current:AnyRow,tenant:string,accountId:string){
  if(ownerRole(current?.role)||companyAdminRole(current?.role))return true;
  const row=await c.env.DB.prepare("SELECT can_send FROM mail_account_members WHERE main_company_slug=? AND account_id=? AND user_id=? LIMIT 1").bind(tenant,accountId,text(current?.id)).first<AnyRow>();
  return Boolean(row?.can_send);
}
async function credentialRow(c:any,tenant:string,accountId:string){
  const row=await c.env.DB.prepare("SELECT * FROM mail_account_credentials WHERE main_company_slug=? AND account_id=? LIMIT 1").bind(tenant,accountId).first<AnyRow>();
  if(!row)return null;
  const decoded=JSON.parse(await openMailCredential(c,{ciphertext:text(row.ciphertext),nonce:text(row.nonce)})||"{}");
  return{row,credential:decoded};
}
async function saveCredential(c:any,tenant:string,accountId:string,value:AnyRow,metadata:AnyRow={}){
  const sealed=await sealMailCredential(c,value),ts=nowIso();
  await c.env.DB.prepare("INSERT INTO mail_account_credentials(account_id,main_company_slug,ciphertext,nonce,key_version,provider_metadata,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET main_company_slug=excluded.main_company_slug,ciphertext=excluded.ciphertext,nonce=excluded.nonce,key_version=excluded.key_version,provider_metadata=excluded.provider_metadata,updated_at=excluded.updated_at")
    .bind(accountId,tenant,sealed.ciphertext,sealed.nonce,sealed.keyVersion,JSON.stringify(metadata||{}),ts).run();
}
async function usableToken(c:any,tenant:string,account:AnyRow){
  const packed=await credentialRow(c,tenant,text(account.id));
  if(!packed)throw Object.assign(new Error("Microsoft mail bağlantı anahtarı bulunamadı."),{code:"MAIL_REAUTH_REQUIRED"});
  let cred=packed.credential;
  const expires=Date.parse(text(cred.expiresAt));
  if(Number.isFinite(expires)&&expires>Date.now()+120000)return{text:cred.accessToken,credential:cred};
  if(!text(cred.refreshToken))throw Object.assign(new Error("Microsoft yenileme anahtarı bulunamadı; hesabı yeniden bağlayın."),{code:"MAIL_REAUTH_REQUIRED"});
  const payload=await tokenPost(c,{grant_type:"refresh_token",refresh_token:text(cred.refreshToken),scope:scopesForAccount(account)});
  cred={...cred,accessToken:text(payload.access_token),refreshToken:text(payload.refresh_token)||text(cred.refreshToken),expiresAt:new Date(Date.now()+Math.max(60,Number(payload.expires_in||3600))*1000).toISOString(),scope:text(payload.scope)||text(cred.scope),tokenType:text(payload.token_type)||"Bearer"};
  await saveCredential(c,tenant,text(account.id),cred,{provider:"MICROSOFT_365",refreshedAt:nowIso()});
  return{text:cred.accessToken,credential:cred};
}
function mailboxBase(account:AnyRow){
  const address=encodeURIComponent(text(account.email_address));
  return upper(account.account_type)==="PERSONAL"?GRAPH+"/me":GRAPH+"/users/"+address;
}
function recipientRows(value:any){
  return Array.isArray(value)?value.map((r:any)=>({emailAddress:{address:text(r?.emailAddress?.address||r?.address||r?.email),name:text(r?.emailAddress?.name||r?.name)}})).filter((r:any)=>r.emailAddress.address):[];
}
function localRecipients(value:any){
  const list=Array.isArray(value)?value:[];
  return list.map((item:any)=>typeof item==="string"?item:text(item?.email||item?.address)).filter(Boolean).map((address:string)=>({emailAddress:{address}}));
}
async function audit(c:any,tenant:string,currentId:string,accountId:string,action:string,detail:AnyRow={}){
  await c.env.DB.prepare("INSERT INTO mail_audit_log(id,main_company_slug,actor_user_id,account_id,message_id,action,detail,ip_address,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),tenant,currentId||null,accountId||null,null,action,JSON.stringify(detail||{}),text(c.req.header("CF-Connecting-IP"))||null,nowIso()).run().catch(()=>{});
}
async function ensureFolder(c:any,tenant:string,accountId:string,providerId:string,name:string,type:string,parentId=""){
  const ts=nowIso();
  let row=await c.env.DB.prepare("SELECT * FROM mail_folders WHERE main_company_slug=? AND account_id=? AND provider_folder_id=? LIMIT 1").bind(tenant,accountId,providerId).first<AnyRow>();
  if(!row){
    const id=crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO mail_folders(id,main_company_slug,account_id,provider_folder_id,parent_folder_id,folder_type,name,sync_enabled,provider_metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenant,accountId,providerId,parentId||null,type,name,1,"{}",ts,ts).run();
    row={id,main_company_slug:tenant,account_id:accountId,provider_folder_id:providerId,folder_type:type,name};
  }else{
    await c.env.DB.prepare("UPDATE mail_folders SET name=?,folder_type=?,parent_folder_id=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(name,type,parentId||null,ts,row.id,tenant).run();
  }
  return row;
}
async function ensureThread(c:any,tenant:string,accountId:string,providerThreadId:string,subject:string,stamp:string,isNew:boolean){
  if(!providerThreadId)return"";
  const ts=nowIso();
  let row=await c.env.DB.prepare("SELECT id FROM mail_threads WHERE main_company_slug=? AND account_id=? AND provider_thread_id=? LIMIT 1").bind(tenant,accountId,providerThreadId).first<AnyRow>();
  if(!row){
    const id=crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO mail_threads(id,main_company_slug,account_id,provider_thread_id,subject,last_message_at,message_count,is_archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenant,accountId,providerThreadId,subject||null,stamp||null,1,0,ts,ts).run();
    return id;
  }
  await c.env.DB.prepare("UPDATE mail_threads SET subject=COALESCE(NULLIF(?,''),subject),last_message_at=CASE WHEN COALESCE(last_message_at,'')<? THEN ? ELSE last_message_at END,message_count=message_count+?,updated_at=? WHERE id=?").bind(subject||"",stamp||"",stamp||null,isNew?1:0,ts,row.id).run();
  return text(row.id);
}
async function persistMessage(c:any,tenant:string,account:AnyRow,folder:AnyRow,item:AnyRow,direction:string){
  const providerMessageId=text(item.id);if(!providerMessageId)return;
  const stamp=text(item.receivedDateTime||item.sentDateTime||nowIso()),ts=nowIso();
  const removed=Boolean(item["@removed"]);
  const existing=await c.env.DB.prepare("SELECT id FROM mail_messages WHERE main_company_slug=? AND account_id=? AND provider_message_id=? LIMIT 1").bind(tenant,account.id,providerMessageId).first<AnyRow>();
  if(removed){
    if(existing?.id)await c.env.DB.prepare("UPDATE mail_messages SET provider_metadata=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(JSON.stringify({provider:"MICROSOFT_365",removed:item["@removed"]}),ts,existing.id,tenant).run();
    return;
  }
  const threadId=await ensureThread(c,tenant,text(account.id),text(item.conversationId),text(item.subject),stamp,!existing?.id);
  const id=text(existing?.id)||crypto.randomUUID(),from=item?.from?.emailAddress||{},body=item?.body||{};
  const bodyHtml=upper(body.contentType)==="HTML"&&!removed?text(body.content):null;
  const bodyText=upper(body.contentType)!=="HTML"&&!removed?text(body.content):null;
  const actualDirection=direction==="AUTO"?(text(from.address).toLowerCase()===text(account.email_address).toLowerCase()?"OUTGOING":"INCOMING"):direction;
  const values=[threadId||null,folder.id||null,text(item.internetMessageId)||null,actualDirection,text(from.address)||null,text(from.name)||null,removed?"[Provider'da silindi]":text(item.subject)||null,bodyText,bodyHtml,text(item.sentDateTime)||null,text(item.receivedDateTime)||null,item.isRead?1:0,upper(item?.flag?.flagStatus)==="FLAGGED"?1:0,item.hasAttachments?1:0,JSON.stringify({provider:"MICROSOFT_365",removed:removed?item["@removed"]:null}),ts,id,tenant];
  if(existing?.id){
    await c.env.DB.prepare("UPDATE mail_messages SET thread_id=?,folder_id=?,internet_message_id=?,direction=?,sender_email=?,sender_name=?,subject=?,body_text=?,body_html=?,sent_at=?,received_at=?,is_read=?,is_flagged=?,has_attachments=?,provider_metadata=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(...values).run();
  }else{
    await c.env.DB.prepare("INSERT INTO mail_messages(id,main_company_slug,account_id,thread_id,folder_id,provider_message_id,internet_message_id,direction,sender_email,sender_name,subject,body_text,body_html,sent_at,received_at,is_read,is_flagged,has_attachments,provider_metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenant,account.id,threadId||null,folder.id||null,providerMessageId,text(item.internetMessageId)||null,actualDirection,text(from.address)||null,text(from.name)||null,removed?"[Provider'da silindi]":text(item.subject)||null,bodyText,bodyHtml,text(item.sentDateTime)||null,text(item.receivedDateTime)||null,item.isRead?1:0,upper(item?.flag?.flagStatus)==="FLAGGED"?1:0,item.hasAttachments?1:0,JSON.stringify({provider:"MICROSOFT_365",removed:removed?item["@removed"]:null}),ts,ts).run();
  }
  if(!removed){
    await c.env.DB.prepare("DELETE FROM mail_recipients WHERE main_company_slug=? AND message_id=?").bind(tenant,id).run();
    for(const [kind,rows] of [["TO",recipientRows(item.toRecipients)],["CC",recipientRows(item.ccRecipients)],["BCC",recipientRows(item.bccRecipients)]] as any){
      for(const r of rows)await c.env.DB.prepare("INSERT INTO mail_recipients(id,main_company_slug,message_id,recipient_type,email_address,display_name,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),tenant,id,kind,text(r.emailAddress.address),text(r.emailAddress.name)||null,ts).run();
    }
  }
}
function parseRecipients(raw:unknown){try{const v=typeof raw==="string"?JSON.parse(raw):raw;return v&&typeof v==="object"?v:{};}catch{return{};}}
function parseAttachments(raw:unknown){try{const v=typeof raw==="string"?JSON.parse(raw):raw;return Array.isArray(v)?v:[];}catch{return[];}}
function attachmentAssetId(value:any){return text(typeof value==="string"?value:value?.fileAssetId||value?.file_asset_id||value?.assetId||value?.id);}
function standardBase64(bytes:Uint8Array){
  let raw="";
  for(let offset=0;offset<bytes.length;offset+=0x8000){
    const part=bytes.subarray(offset,Math.min(bytes.length,offset+0x8000));
    raw+=String.fromCharCode(...part);
  }
  return btoa(raw);
}
async function resolveDraftAttachments(c:any,tenant:string,refs:any[]){
  if(refs.length>10)throw Object.assign(new Error("Bir mailde en fazla 10 File Hub eki kullanılabilir."),{code:"MAIL_ATTACHMENT_COUNT_LIMIT",status:413});
  const resolved:any[]=[];let total=0;
  for(const ref of refs){
    const assetId=attachmentAssetId(ref);
    if(!assetId)throw Object.assign(new Error("Mail eki File Hub kimliği eksik."),{code:"MAIL_ATTACHMENT_REF_INVALID",status:422});
    const asset=await readFileHubAssetForMail(c,tenant,assetId,25*1024*1024);
    total+=Number(asset.sizeBytes||asset.bytes?.byteLength||0);
    if(total>25*1024*1024)throw Object.assign(new Error("Mail eklerinin toplamı 25 MB sınırını aşıyor."),{code:"MAIL_ATTACHMENTS_TOO_LARGE",status:413,totalBytes:total});
    resolved.push(asset);
  }
  return resolved;
}
async function attachMicrosoftAsset(base:string,providerDraftId:string,token:string,asset:any,existing:Set<string>){
  const name=text(asset.fileName)||"ek",size=Number(asset.sizeBytes||asset.bytes?.byteLength||0),key=name.toLowerCase()+"\u0000"+size;
  if(existing.has(key))return;
  const messageBase=base+"/messages/"+encodeURIComponent(providerDraftId);
  if(size<3*1024*1024){
    await graphJson(messageBase+"/attachments",token,{method:"POST",body:JSON.stringify({
      "@odata.type":"#microsoft.graph.fileAttachment",
      name,
      contentType:text(asset.mimeType)||"application/octet-stream",
      contentBytes:standardBase64(asset.bytes),
    })});
    existing.add(key);
    return;
  }
  const session=(await graphJson(messageBase+"/attachments/createUploadSession",token,{method:"POST",body:JSON.stringify({
    AttachmentItem:{attachmentType:"file",name,size,contentType:text(asset.mimeType)||"application/octet-stream"}
  })})).payload;
  const uploadUrl=text(session.uploadUrl);
  if(!uploadUrl)throw Object.assign(new Error("Microsoft büyük ek yükleme oturumu oluşturmadı."),{code:"MICROSOFT_ATTACHMENT_UPLOAD_SESSION_MISSING",status:502});
  const chunkSize=10*320*1024;
  for(let start=0;start<size;start+=chunkSize){
    const end=Math.min(size,start+chunkSize),chunk=asset.bytes.slice(start,end);
    const response=await fetch(uploadUrl,{method:"PUT",headers:{
      "Content-Length":String(chunk.byteLength),
      "Content-Range":`bytes ${start}-${end-1}/${size}`,
      "Content-Type":"application/octet-stream",
    },body:chunk});
    if(!response.ok){
      const detail=await response.text().catch(()=>"");
      throw Object.assign(new Error(detail||`Microsoft büyük ek yüklemesi HTTP ${response.status} ile başarısız oldu.`),{code:"MICROSOFT_ATTACHMENT_UPLOAD_FAILED",status:502});
    }
  }
  existing.add(key);
}
async function syncMicrosoftDraftAttachments(base:string,providerDraftId:string,token:string,assets:any[]){
  if(!assets.length)return;
  const listed=await graphCollection(base+"/messages/"+encodeURIComponent(providerDraftId)+"/attachments?$top=50&$select=id,name,size",token,10);
  const existing=new Set(listed.map((row:any)=>text(row.name).toLowerCase()+"\u0000"+Number(row.size||0)));
  for(const asset of assets)await attachMicrosoftAsset(base,providerDraftId,token,asset,existing);
}


const MS_FOLDER_DEFS=[
  ["inbox","INBOX","INCOMING"],
  ["drafts","DRAFTS","AUTO"],
  ["sentitems","SENT","OUTGOING"],
  ["archive","ARCHIVE","AUTO"],
  ["junkemail","JUNK","AUTO"],
  ["deleteditems","TRASH","AUTO"],
] as const;

async function graphCollection(url:string,token:string,maxPages=5){
  const rows:any[]=[];let next=url,pages=0;
  while(next&&pages<maxPages){
    const payload=(await graphJson(next,token)).payload;pages++;
    rows.push(...(Array.isArray(payload.value)?payload.value:[]));
    next=text(payload["@odata.nextLink"]);
  }
  return rows;
}
async function discoverMicrosoftFolders(c:any,tenant:string,account:AnyRow,token:string){
  const base=mailboxBase(account),standard=new Map<string,{type:string;direction:string}>(),seen=new Map<string,AnyRow>();
  for(const [wellKnown,type,direction] of MS_FOLDER_DEFS){
    try{
      const p=(await graphJson(base+"/mailFolders/"+wellKnown+"?$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount",token)).payload;
      if(text(p.id)){standard.set(text(p.id),{type,direction});seen.set(text(p.id),p);}
    }catch{}
  }
  const queue=await graphCollection(base+"/mailFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount",token,5);
  for(let index=0;index<queue.length&&index<400;index++){
    const p=queue[index];const id=text(p.id);if(!id)continue;seen.set(id,p);
    if(Number(p.childFolderCount||0)>0){
      try{
        const children=await graphCollection(base+"/mailFolders/"+encodeURIComponent(id)+"/childFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount",token,5);
        for(const child of children){if(text(child.id)&&!seen.has(text(child.id)))queue.push(child);}
      }catch{}
    }
  }
  const local:any[]=[];
  for(const [providerId,p] of seen){
    const def=standard.get(providerId),type=def?.type||"CUSTOM",direction=def?.direction||"AUTO";
    const folder=await ensureFolder(c,tenant,text(account.id),providerId,text(p.displayName)||"Klasör",type,text(p.parentFolderId));
    local.push({...folder,folder_type:type,direction,total_item_count:Number(p.totalItemCount||0),unread_item_count:Number(p.unreadItemCount||0)});
  }
  return local;
}
async function syncMicrosoftAttachments(c:any,tenant:string,account:AnyRow,token:string,item:AnyRow){
  const providerMessageId=text(item.id);if(!providerMessageId||item["@removed"]||!item.hasAttachments)return;
  const local=await c.env.DB.prepare("SELECT id FROM mail_messages WHERE main_company_slug=? AND account_id=? AND provider_message_id=? LIMIT 1").bind(tenant,account.id,providerMessageId).first<AnyRow>();
  if(!local?.id)return;
  const base=mailboxBase(account),initial=base+"/messages/"+encodeURIComponent(providerMessageId)+"/attachments?$top=50&$select=id,name,contentType,size,isInline,contentId";
  const rows:any[]=[];let next=initial,pages=0;
  while(next&&pages<10){
    const payload=(await graphJson(next,token)).payload;
    rows.push(...(Array.isArray(payload.value)?payload.value:[]));
    next=text(payload["@odata.nextLink"]);pages++;
    if(next){const u=new URL(next);if(u.protocol!=="https:"||u.host!=="graph.microsoft.com")throw new Error("MICROSOFT_ATTACHMENT_CURSOR_INVALID");}
  }
  if(next)throw new Error("MICROSOFT_ATTACHMENT_PAGE_LIMIT");
  // Atomic metadata refresh; don't destroy previously hash-verified attachments on a failed Graph page.
  const stored=await c.env.DB.prepare("SELECT * FROM mail_attachments WHERE main_company_slug=? AND message_id=?").bind(tenant,local.id).all<AnyRow>();
  const previous=new Map((stored.results||[]).filter(row=>text(row.provider_attachment_id)).map(row=>[text(row.provider_attachment_id),row]));
  const seen=new Set<string>(),statements:any[]=[],ts=nowIso();
  for(const row of rows){
    const id=text(row.id),name=text(row.name),size=Number(row.size||0);if(!id||!name)continue;
    seen.add(id);const old=previous.get(id);
    const same=old&&text(old.file_name)===name&&Number(old.size_bytes||0)===size;
    if(old)statements.push(c.env.DB.prepare("UPDATE mail_attachments SET file_name=?,mime_type=?,size_bytes=?,is_inline=?,content_id=?,file_asset_id=?,provider_metadata=? WHERE id=? AND main_company_slug=?")
      .bind(name,text(row.contentType)||null,size||null,row.isInline?1:0,text(row.contentId)||null,same?old.file_asset_id:null,same?old.provider_metadata:JSON.stringify({provider:"MICROSOFT_365"}),old.id,tenant));
    else statements.push(c.env.DB.prepare("INSERT INTO mail_attachments(id,main_company_slug,message_id,provider_attachment_id,file_asset_id,file_name,mime_type,size_bytes,is_inline,content_id,provider_metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),tenant,local.id,id,null,name,text(row.contentType)||null,size||null,row.isInline?1:0,text(row.contentId)||null,JSON.stringify({provider:"MICROSOFT_365"}),ts));
  }
  for(const old of stored.results||[]){
    if(!text(old.provider_attachment_id)||seen.has(text(old.provider_attachment_id)))continue;
    statements.push(c.env.DB.prepare("UPDATE mail_attachments SET file_asset_id=NULL,provider_metadata=? WHERE id=? AND main_company_slug=?").bind(JSON.stringify({provider:"MICROSOFT_365",removed:true}),old.id,tenant));
  }
  if(statements.length)await c.env.DB.batch(statements);
}

async function syncMicrosoftFolder(c:any,tenant:string,account:AnyRow,token:string,folder:AnyRow,maxPages=4){
  const base=mailboxBase(account),folderId=text(folder.provider_folder_id);
  const cursor=await c.env.DB.prepare("SELECT * FROM mail_sync_cursors WHERE main_company_slug=? AND account_id=? AND folder_id=? AND cursor_type='MICROSOFT_DELTA' LIMIT 1")
    .bind(tenant,account.id,folder.id).first<AnyRow>();
  const defaultUrl=base+"/mailFolders/"+encodeURIComponent(folderId)+"/messages/delta?$top=50&$select=id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,bccRecipients,body,receivedDateTime,sentDateTime,isRead,hasAttachments,flag";
  let url=text(cursor?.cursor_value)||defaultUrl,checkpoint=text(cursor?.cursor_value);
  let count=0,pages=0,complete=false;
  const direction=upper(folder.folder_type)==="SENT"?"OUTGOING":upper(folder.folder_type)==="INBOX"?"INCOMING":"AUTO";
  try{
    while(url&&pages<maxPages&&count<200){
      url=microsoftDeltaSafeUrl(url,base,folderId);
      const payload=(await graphJson(url,token)).payload;
      const next=microsoftDeltaPageState(payload);
      const nextUrl=microsoftDeltaSafeUrl(next.cursor,base,folderId);
      for(const item of Array.isArray(payload.value)?payload.value:[]){
        await persistMessage(c,tenant,account,folder,item,direction);
        if(item.hasAttachments||item["@removed"])await syncMicrosoftAttachments(c,tenant,account,token,item);
        count++;
      }
      // Advance only after every item and attachment metadata in this page persisted.
      checkpoint=nextUrl;complete=next.complete;pages++;
      url=complete?"":nextUrl;
    }
    const ts=nowIso(),pending=complete?null:"SYNC_PENDING_PAGINATION";
    await c.env.DB.prepare("INSERT INTO mail_sync_cursors(id,main_company_slug,account_id,folder_id,cursor_type,cursor_value,last_sync_at,last_success_at,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_slug,account_id,folder_id,cursor_type) DO UPDATE SET cursor_value=excluded.cursor_value,last_sync_at=excluded.last_sync_at,last_success_at=excluded.last_success_at,last_error=excluded.last_error,updated_at=excluded.updated_at")
      .bind(text(cursor?.id)||crypto.randomUUID(),tenant,account.id,folder.id,"MICROSOFT_DELTA",checkpoint||null,ts,complete?ts:text(cursor?.last_success_at)||null,pending,ts).run();
    return {folderId:folder.id,folder:folder.folder_type,name:folder.name,count,pages,ok:true,completed:complete,hasMore:!complete};
  }catch(error:any){
    const ts=nowIso();
    // A failed page is safe to replay from the last fully committed cursor.
    await c.env.DB.prepare("INSERT INTO mail_sync_cursors(id,main_company_slug,account_id,folder_id,cursor_type,cursor_value,last_sync_at,last_success_at,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_slug,account_id,folder_id,cursor_type) DO UPDATE SET cursor_value=excluded.cursor_value,last_sync_at=excluded.last_sync_at,last_error=excluded.last_error,updated_at=excluded.updated_at")
      .bind(text(cursor?.id)||crypto.randomUUID(),tenant,account.id,folder.id,"MICROSOFT_DELTA",checkpoint||null,ts,text(cursor?.last_success_at)||null,text(error?.message)||"Sync failed",ts).run();
    return {folderId:folder.id,folder:folder.folder_type,name:folder.name,count,pages,ok:false,completed:false,hasMore:true,error:text(error?.message)};
  }
}


const intakeScope="EBELGE_INCOMING_DISPATCH";
const intakeMeta="CASE WHEN json_valid(ma.provider_metadata) THEN ma.provider_metadata ELSE '{}' END";
const intakeState="COALESCE(json_extract("+intakeMeta+",'$.ebelgeIntake.state'),'WAITING')";
const intakeSource="FROM mail_attachments ma JOIN mail_messages m ON m.id=ma.message_id AND m.main_company_slug=ma.main_company_slug JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE ma.main_company_slug=? AND m.direction='INCOMING' AND COALESCE(ma.is_inline,0)=0 AND (LOWER(ma.file_name) LIKE '%.pdf' OR LOWER(ma.file_name) LIKE '%.xml') AND a.provider_type='MICROSOFT_365' AND a.status='ACTIVE' AND a.approval_status='APPROVED'";
async function processIncomingMailAttachment(c:any,tenant:string,account:AnyRow,token:string,row:AnyRow){
 const ts=nowIso(),id=text(row.id);
 const claim=await c.env.DB.prepare("UPDATE mail_attachments SET provider_metadata=json_set(CASE WHEN json_valid(provider_metadata) THEN provider_metadata ELSE '{}' END,'$.ebelgeIntake',json(?)) WHERE main_company_slug=? AND id=? AND COALESCE(json_extract(CASE WHEN json_valid(provider_metadata) THEN provider_metadata ELSE '{}' END,'$.ebelgeIntake.state'),'WAITING')='WAITING'").bind(JSON.stringify({state:"PROCESSING",claimedAt:ts}),tenant,id).run();
 if(claim.meta.changes!==1)return {state:"ALREADY_CLAIMED"};
 let result:AnyRow;
 try{
  if(Number(row.size_bytes||0)>20*1024*1024||!text(row.provider_attachment_id)||!text(row.provider_message_id))throw new Error("MAIL_ATTACHMENT_REVIEW");
  const payload=(await graphJson(mailboxBase(account)+"/messages/"+encodeURIComponent(text(row.provider_message_id))+"/attachments/"+encodeURIComponent(text(row.provider_attachment_id))+"?$select=id,name,size,contentBytes",token)).payload;
  if(text(payload.name)!==text(row.file_name)||Number(payload.size||0)!==Number(row.size_bytes||0)||!text(payload.contentBytes))throw new Error("MAIL_ATTACHMENT_CHANGED");
  const bytes=Uint8Array.from(atob(text(payload.contentBytes).replace(/\s+/g,"")),ch=>ch.charCodeAt(0));
  if(!bytes.length||bytes.length>20*1024*1024)throw new Error("MAIL_ATTACHMENT_REVIEW");
  const xml=/\.xml$/i.test(row.file_name);
  if(!xml&&new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new Error("MAIL_ATTACHMENT_REVIEW");
  const context={env:c.env,req:{query:(k:string)=>k==="mainCompanySlug"?tenant:"",header:()=>""},get:()=>""};
  const imported=await ingestIncomingMailDispatch(context as any,tenant,new File([bytes],text(row.file_name),{type:xml?"application/xml":"application/pdf"}));
  result={state:imported.sourceConflict?"REVIEW":"ATTACHED",documentId:imported.documentId,assetId:imported.assetId,code:imported.sourceConflict?"SOURCE_CONFLICT":"",checkedAt:nowIso()};
 }catch(e:any){result={state:"REVIEW",code:["MAIL_ATTACHMENT_REVIEW","MAIL_ATTACHMENT_CHANGED","MAIL_OCR_UNAVAILABLE","SOURCE_SCOPE_CONFLICT","SOURCE_IDENTITY_AMBIGUOUS","SOURCE_VERSION_CONFLICT"].includes(text(e?.code||e?.message))?text(e?.code||e?.message):"INTAKE_UNCERTAIN",checkedAt:nowIso()};}
 // Never retry uncertain writes automatically, never advance a financial state.
 await c.env.DB.prepare("UPDATE mail_attachments SET provider_metadata=json_set(CASE WHEN json_valid(provider_metadata) THEN provider_metadata ELSE '{}' END,'$.ebelgeIntake',json(?)),file_asset_id=COALESCE(?,file_asset_id) WHERE main_company_slug=? AND id=? AND json_extract(CASE WHEN json_valid(provider_metadata) THEN provider_metadata ELSE '{}' END,'$.ebelgeIntake.claimedAt')=?").bind(JSON.stringify(result),result.assetId||null,tenant,id,ts).run();
 return result;
}
async function scheduledIncomingMailIntake(c:any,tenant:string,account:AnyRow,token:string){
 const scope=await c.env.DB.prepare("SELECT id FROM mail_account_scopes WHERE main_company_slug=? AND account_id=? AND scope_code=? LIMIT 1").bind(tenant,account.id,intakeScope).first();
 if(!scope)return;
 const row=await c.env.DB.prepare("SELECT ma.*,m.provider_message_id "+intakeSource+" AND a.id=? AND "+intakeState+"='WAITING' AND COALESCE(json_extract("+intakeMeta+",'$.removed'),0)=0 ORDER BY m.received_at ASC,ma.id LIMIT 1").bind(tenant,account.id).first<AnyRow>();
 if(row)await processIncomingMailAttachment(c,tenant,account,token,row);
}

export async function runMicrosoftMailScheduledSync(env:Cloudflare.Env){
  // Fair, bounded scheduling. An invalid token pauses only this account for 15 minutes.
  const cutoff=new Date(Date.now()-15*60*1000).toISOString();
  const account=await env.DB.prepare(
    "SELECT a.* FROM mail_accounts a WHERE a.provider_type='MICROSOFT_365' AND a.status='ACTIVE' AND a.approval_status='APPROVED' AND a.provider_connected=1 "+
    "AND EXISTS(SELECT 1 FROM mail_folders f WHERE f.main_company_slug=a.main_company_slug AND f.account_id=a.id AND f.sync_enabled=1) "+
    "AND NOT EXISTS(SELECT 1 FROM mail_sync_cursors s WHERE s.main_company_slug=a.main_company_slug AND s.account_id=a.id AND s.cursor_type='MICROSOFT_DELTA' AND s.last_sync_at>? AND COALESCE(s.last_error,'') NOT IN ('','SYNC_PENDING_PAGINATION')) "+
    "ORDER BY COALESCE((SELECT MIN(COALESCE(s.last_sync_at,'')) FROM mail_folders f LEFT JOIN mail_sync_cursors s ON s.main_company_slug=f.main_company_slug AND s.account_id=f.account_id AND s.folder_id=f.id AND s.cursor_type='MICROSOFT_DELTA' WHERE f.main_company_slug=a.main_company_slug AND f.account_id=a.id AND f.sync_enabled=1),'') ASC LIMIT 1"
  ).bind(cutoff).first<AnyRow>();
  if(!account)return {processed:0,accountCount:0};
  const folders=await env.DB.prepare(
    "SELECT f.* FROM mail_folders f LEFT JOIN mail_sync_cursors s ON s.main_company_slug=f.main_company_slug AND s.account_id=f.account_id AND s.folder_id=f.id AND s.cursor_type='MICROSOFT_DELTA' WHERE f.main_company_slug=? AND f.account_id=? AND f.sync_enabled=1 ORDER BY COALESCE(s.last_sync_at,'') ASC, CASE f.folder_type WHEN 'INBOX' THEN 0 WHEN 'SENT' THEN 1 ELSE 2 END LIMIT 2"
  ).bind(account.main_company_slug,account.id).all<AnyRow>();
  try{
    const c={env},token=(await usableToken(c,text(account.main_company_slug),account)).text,results=[];
    for(const folder of folders.results||[])results.push(await syncMicrosoftFolder(c,text(account.main_company_slug),account,token,folder,1));
    try{await scheduledIncomingMailIntake(c,text(account.main_company_slug),account,token)}catch{ /* Metadata queue remains visible; never advance a financial record. */ }
    return {processed:results.reduce((n,r)=>n+r.count,0),accountCount:1,folders:results.length,partial:results.some(r=>!r.completed)};
  }catch(error:any){
    const ts=nowIso(),code=["MAIL_REAUTH_REQUIRED","MICROSOFT_TOKEN_FAILED"].includes(text(error?.code))?text(error.code):"MAIL_SYNC_ACCOUNT_FAILED";
    const operations=(folders.results||[]).map(folder=>env.DB.prepare("INSERT INTO mail_sync_cursors(id,main_company_slug,account_id,folder_id,cursor_type,cursor_value,last_sync_at,last_success_at,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_slug,account_id,folder_id,cursor_type) DO UPDATE SET last_sync_at=excluded.last_sync_at,last_error=excluded.last_error,updated_at=excluded.updated_at")
      .bind(crypto.randomUUID(),account.main_company_slug,account.id,folder.id,"MICROSOFT_DELTA",null,ts,null,code,ts));
    if(operations.length)await env.DB.batch(operations);
    return {processed:0,accountCount:1,failed:true,code};
  }
}

export function registerMicrosoftMailRoutes(app:any){
  app.get("/api/mail/ebelge-inbox/microsoft",async(c:any)=>{
    const a:any=await currentAccess(c);if(a.error)return a.error;const{current,tenant}=a;
    if(!perm(current)||!accountingTenantReadAllowed(current,tenant)||!accountingAccess(current,"GET","/api/e-belge/file-inbox"))return c.json(err("MAIL_FORBIDDEN","Mail ve muhasebe görüntüleme yetkisi gerekli."),403);
    const elevated=ownerRole(current.role)||companyAdminRole(current.role);
    const member=elevated?"":" AND (a.created_by=? OR EXISTS(SELECT 1 FROM mail_account_members mm WHERE mm.main_company_slug=a.main_company_slug AND mm.account_id=a.id AND mm.user_id=? AND mm.can_view=1))";
    const args=elevated?[tenant]:[tenant,text(current.id),text(current.id)];
    const page=Math.min(100000,Math.max(1,Math.trunc(Number(c.req.query("page"))||1))),filter=text(c.req.query("state"))||"ALL";
    if(!["ALL","WAITING","PROCESSING","REVIEW","ATTACHED"].includes(filter))return c.json(err("INVALID_STATE","Geçersiz durum."),400);
    const where=intakeSource+member+(filter==="ALL"?"":" AND "+intakeState+"=?"),params=filter==="ALL"?args:[...args,filter];
    const total=await c.env.DB.prepare("SELECT COUNT(*) n "+where).bind(...params).first<AnyRow>();
    const rows=await c.env.DB.prepare("SELECT ma.id,ma.file_name,m.received_at,a.id account_id,a.display_name,"+intakeState+" intake_state,json_extract("+intakeMeta+",'$.ebelgeIntake.documentId') document_id,json_extract("+intakeMeta+",'$.ebelgeIntake.code') issue_code "+where+" ORDER BY m.received_at DESC,ma.id LIMIT 50 OFFSET ?").bind(...params,(page-1)*50).all<AnyRow>();
    const accounts=await c.env.DB.prepare("SELECT a.id,a.display_name,a.email_address,EXISTS(SELECT 1 FROM mail_account_scopes s WHERE s.main_company_slug=a.main_company_slug AND s.account_id=a.id AND s.scope_code='EBELGE_INCOMING_DISPATCH') auto_enabled FROM mail_accounts a WHERE a.main_company_slug=? AND a.provider_type='MICROSOFT_365' AND a.status='ACTIVE' AND a.approval_status='APPROVED'"+member).bind(...args).all<AnyRow>();
    c.header("Cache-Control","no-store");
    return c.json({ok:true,data:{mainCompanySlug:tenant,items:rows.results||[],total:Number(total?.n||0),page,pageSize:50,accounts:accounts.results||[],canManage:companyAdminRole(current.role)&&ownTenant(current)===tenant}});
  });
  app.post("/api/mail/ebelge-inbox/microsoft/:id/intake",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(body.confirmed!==true||!perm(current)||!accountingTenantReadAllowed(current,tenant)||!accountingAccess(current,"POST","/api/e-belge/upload"))return c.json(err("MAIL_INTAKE_FORBIDDEN","Açık aktarım onayı ve muhasebe yetkisi gerekli."),403);
    const row=await c.env.DB.prepare("SELECT ma.*,m.provider_message_id,a.id account_id "+intakeSource+" AND ma.id=? LIMIT 1").bind(tenant,text(c.req.param("id"))).first<AnyRow>();
    if(!row)return c.json(err("MAIL_ATTACHMENT_NOT_FOUND","Uygun gelen ek bulunamadı."),404);
    const account=await accountForUser(c,current,tenant,text(row.account_id));
    if(!account||!account.provider_connected)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Posta hesabı erişimi doğrulanamadı."),403);
    const token=(await usableToken(c,tenant,account)).text,result=await processIncomingMailAttachment(c,tenant,account,token,row);
    return c.json({ok:true,data:{mainCompanySlug:tenant,...result}});
  });
  app.post("/api/mail/accounts/:id/ebelge-intake-policy/microsoft",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(body.confirmed!==true||typeof body.enabled!=="boolean"||!companyAdminRole(current.role)||ownTenant(current)!==tenant||!accountingTenantReadAllowed(current,tenant))return c.json(err("OWNER_APPROVAL_REQUIRED","Firma yöneticisinin açık posta kutusu aktarım onayı gerekir."),403);
    const account=await accountForUser(c,current,tenant,text(c.req.param("id")));
    if(!account||upper(account.provider_type)!=="MICROSOFT_365"||upper(account.status)!=="ACTIVE"||upper(account.approval_status)!=="APPROVED"||!account.provider_connected)return c.json(err("MAIL_ACCOUNT_NOT_READY","Onaylı ve bağlı Outlook hesabı gerekli."),409);
    if(body.enabled)await c.env.DB.prepare("INSERT OR IGNORE INTO mail_account_scopes(id,main_company_slug,account_id,scope_code,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),tenant,account.id,intakeScope,nowIso()).run();
    else await c.env.DB.prepare("DELETE FROM mail_account_scopes WHERE main_company_slug=? AND account_id=? AND scope_code=?").bind(tenant,account.id,intakeScope).run();
    await audit(c,tenant,text(current.id),text(account.id),body.enabled?"EBELGE_MAIL_INTAKE_ENABLED":"EBELGE_MAIL_INTAKE_DISABLED",{});
    return c.json({ok:true,data:{mainCompanySlug:tenant,enabled:body.enabled}});
  });
  app.post("/api/mail/accounts/:id/oauth/microsoft/start",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!perm(current,"canCreate"))return c.json(err("MAIL_CONNECT_FORBIDDEN","Mail hesabı bağlama yetkiniz yok."),403);
    const account=await accountForUser(c,current,tenant,text(c.req.param("id")));
    if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Mail hesabı bulunamadı veya erişim yok."),404);
    if(upper(account.provider_type)!=="MICROSOFT_365")return c.json(err("PROVIDER_MISMATCH","Bu hesap Microsoft 365 sağlayıcısına ait değil."),409);
    const cfg=clientConfig(c),state=randomToken(40),verifier=randomToken(64),challenge=b64url(await sha256Bytes(verifier)),sealed=await sealMailCredential(c,verifier),ts=nowIso();
    await c.env.DB.prepare("DELETE FROM mail_oauth_states WHERE expires_at<?").bind(ts).run();
    await c.env.DB.prepare("INSERT INTO mail_oauth_states(state_hash,main_company_slug,account_id,user_id,provider_type,code_verifier_ciphertext,code_verifier_nonce,return_path,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(await sha256Hex(state),tenant,account.id,text(current.id),"MICROSOFT_365",sealed.ciphertext,sealed.nonce,APP_RETURN,new Date(Date.now()+10*60*1000).toISOString(),ts).run();
    const qs=new URLSearchParams({client_id:cfg.clientId,response_type:"code",redirect_uri:CALLBACK,response_mode:"query",scope:scopesForAccount(account),state,code_challenge:challenge,code_challenge_method:"S256",prompt:"select_account"});
    await audit(c,tenant,text(current.id),text(account.id),"MAIL_MICROSOFT_OAUTH_STARTED",{accountType:account.account_type});
    return c.json({ok:true,data:{authorizeUrl:AUTHORIZE+"?"+qs.toString(),expiresAt:new Date(Date.now()+10*60*1000).toISOString()}});
  });

  app.get("/api/auth/mail/oauth/microsoft/callback",async(c:any)=>{
    const state=text(c.req.query("state")),code=text(c.req.query("code")),providerError=text(c.req.query("error")),providerDescription=text(c.req.query("error_description"));
    const fail=(message:string,codeValue="MICROSOFT_OAUTH_FAILED")=>c.redirect(APP_RETURN+"?mailError="+encodeURIComponent(codeValue+":"+message),302);
    if(providerError)return fail(providerDescription||providerError,"MICROSOFT_OAUTH_DENIED");
    if(!state||!code)return fail("OAuth state veya code eksik.");
    const stateHash=await sha256Hex(state),row=await c.env.DB.prepare("SELECT s.*,a.email_address,a.account_type,a.approval_status,a.provider_type FROM mail_oauth_states s JOIN mail_accounts a ON a.id=s.account_id AND a.main_company_slug=s.main_company_slug WHERE s.state_hash=? LIMIT 1").bind(stateHash).first<AnyRow>();
    if(!row||Date.parse(text(row.expires_at))<=Date.now())return fail("OAuth state geçersiz veya süresi dolmuş.","MICROSOFT_OAUTH_STATE_INVALID");
    await c.env.DB.prepare("DELETE FROM mail_oauth_states WHERE state_hash=?").bind(stateHash).run();
    try{
      const verifier=await openMailCredential(c,{ciphertext:text(row.code_verifier_ciphertext),nonce:text(row.code_verifier_nonce)});
      const payload=await tokenPost(c,{grant_type:"authorization_code",code,redirect_uri:CALLBACK,code_verifier:verifier,scope:scopesForAccount(row)});
      const accessToken=text(payload.access_token);
      const profile=(await graphJson(GRAPH+"/me?$select=id,displayName,mail,userPrincipalName",accessToken)).payload;
      const connectedEmail=text(profile.mail||profile.userPrincipalName).toLowerCase(),mailbox=text(row.email_address).toLowerCase();
      if(upper(row.account_type)==="PERSONAL"&&connectedEmail!==mailbox)return fail("Seçilen Microsoft hesabı talep edilen posta kutusuyla eşleşmiyor.","MICROSOFT_ACCOUNT_MISMATCH");
      if(upper(row.account_type)!=="PERSONAL")await graphJson(GRAPH+"/users/"+encodeURIComponent(mailbox)+"/mailFolders/inbox?$select=id,displayName",accessToken);
      const cred={accessToken,refreshToken:text(payload.refresh_token),expiresAt:new Date(Date.now()+Math.max(60,Number(payload.expires_in||3600))*1000).toISOString(),scope:text(payload.scope),tokenType:text(payload.token_type)||"Bearer",connectedUserId:text(profile.id),connectedEmail,mailboxAddress:mailbox};
      await saveCredential(c,text(row.main_company_slug),text(row.account_id),cred,{provider:"MICROSOFT_365",connectedEmail,mailboxAddress:mailbox});
      const ts=nowIso(),active=upper(row.approval_status)==="APPROVED";
      await c.env.DB.prepare("UPDATE mail_accounts SET provider_connected=1,provider_account_id=?,status=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(upper(row.account_type)==="PERSONAL"?text(profile.id):mailbox,active?"ACTIVE":"PENDING",ts,row.account_id,row.main_company_slug).run();
      return c.redirect(APP_RETURN+"?mailConnected=1&accountId="+encodeURIComponent(text(row.account_id)),302);
    }catch(error:any){
      return fail(text(error?.message)||"Microsoft hesabı bağlanamadı.",text(error?.code)||"MICROSOFT_OAUTH_FAILED");
    }
  });

  app.get("/api/mail/accounts/:id/connection",async(c:any)=>{
    const a:any=await currentAccess(c);if(a.error)return a.error;const{current,tenant}=a,account=await accountForUser(c,current,tenant,text(c.req.param("id")));
    if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Mail hesabı bulunamadı veya erişim yok."),404);
    return c.json({ok:true,data:{id:account.id,providerType:account.provider_type,status:account.status,approvalStatus:account.approval_status,providerConnected:Boolean(account.provider_connected),emailAddress:account.email_address}});
  });

  app.post("/api/mail/accounts/:id/sync",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!perm(current,"canView"))return c.json(err("MAIL_SYNC_FORBIDDEN","Mail senkronizasyon yetkiniz yok."),403);
    const account=await accountForUser(c,current,tenant,text(c.req.param("id")));
    if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Mail hesabı bulunamadı veya erişim yok."),404);
    if(upper(account.provider_type)!=="MICROSOFT_365"||!account.provider_connected)return c.json(err("MAIL_REAUTH_REQUIRED","Microsoft mail hesabı bağlı değil."),409);
    const token=(await usableToken(c,tenant,account)).text,folders=await discoverMicrosoftFolders(c,tenant,account,token),summary:any[]=[];
    const priority=folders.sort((left,right)=>{
      const rank=(v:any)=>({INBOX:0,SENT:1,ARCHIVE:2,DRAFTS:3,CUSTOM:4,JUNK:5,TRASH:6}[upper(v)]??9);
      return rank(left.folder_type)-rank(right.folder_type)||String(left.name||"").localeCompare(String(right.name||""),"tr");
    });
    let total=0;
    for(const folder of priority){
      if(total>=800)break;
      const result=await syncMicrosoftFolder(c,tenant,account,token,folder,upper(folder.folder_type)==="CUSTOM"?2:4);
      summary.push(result);total+=Number(result.count||0);
    }
    const partial=!microsoftDeltaComplete(summary,folders.length,total>=800);await audit(c,tenant,text(current.id),text(account.id),"MAIL_MICROSOFT_SYNC",{summary,partial,discoveredFolders:folders.length,total});
    return c.json({ok:!partial,data:{accountId:account.id,partial,folders:summary,discoveredFolders:folders.length,total},...(partial?{error:{code:"MAIL_SYNC_PARTIAL",message:"Bazı klasörlerde sayfa devamı veya senkronizasyon hatası var."}}:{})},partial?207:200);
  });

  app.post("/api/mail/accounts/:id/folders/:folderId/sync/microsoft",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    const account=await accountForUser(c,current,tenant,text(c.req.param("id")));if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Mail hesabı bulunamadı veya erişim yok."),404);
    if(upper(account.provider_type)!=="MICROSOFT_365"||!account.provider_connected)return c.json(err("MAIL_REAUTH_REQUIRED","Microsoft mail hesabı bağlı değil."),409);
    const folder=await c.env.DB.prepare("SELECT * FROM mail_folders WHERE id=? AND account_id=? AND main_company_slug=? LIMIT 1").bind(text(c.req.param("folderId")),account.id,tenant).first<AnyRow>();
    if(!folder)return c.json(err("MAIL_FOLDER_NOT_FOUND","Posta klasörü bulunamadı."),404);
    const token=(await usableToken(c,tenant,account)).text,result=await syncMicrosoftFolder(c,tenant,account,token,folder,5);
    return c.json({ok:Boolean(result.ok),data:result,...(!result.ok?{error:{code:"MAIL_FOLDER_SYNC_FAILED",message:result.error||"Klasör senkronize edilemedi."}}:{})},!result.ok?502:result.completed?200:207);
  });

  app.post("/api/mail/messages/:id/action/microsoft",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a,messageId=text(c.req.param("id"));
    if(!perm(current,"canView"))return c.json(err("MAIL_UPDATE_FORBIDDEN","Mail işlemi yetkiniz yok."),403);
    const row=await c.env.DB.prepare("SELECT m.*,a.provider_type,a.provider_connected,a.account_type,a.email_address FROM mail_messages m JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE m.id=? AND m.main_company_slug=? LIMIT 1").bind(messageId,tenant).first<AnyRow>();
    if(!row)return c.json(err("MAIL_MESSAGE_NOT_FOUND","Mail bulunamadı."),404);
    const account=await accountForUser(c,current,tenant,text(row.account_id));if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Bu posta kutusuna erişim yok."),403);
    if(upper(row.provider_type)!=="MICROSOFT_365"||!row.provider_connected)return c.json(err("MAIL_REAUTH_REQUIRED","Microsoft hesabı bağlı değil."),409);
    const action=upper(body.action),token=(await usableToken(c,tenant,account)).text,base=mailboxBase(account),providerMessageId=text(row.provider_message_id);
    if(!providerMessageId)return c.json(err("PROVIDER_MESSAGE_ID_MISSING","Provider mail kimliği bulunamadı."),409);
    const messageUrl=base+"/messages/"+encodeURIComponent(providerMessageId),ts=nowIso();
    if(action==="MARK_READ"||action==="MARK_UNREAD"){
      const isRead=action==="MARK_READ";
      await graphJson(messageUrl,token,{method:"PATCH",body:JSON.stringify({isRead})});
      await c.env.DB.prepare("UPDATE mail_messages SET is_read=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(isRead?1:0,ts,messageId,tenant).run();
      return c.json({ok:true,data:{messageId,action,isRead}});
    }
    if(action==="FLAG"||action==="UNFLAG"){
      const flagged=action==="FLAG";
      await graphJson(messageUrl,token,{method:"PATCH",body:JSON.stringify({flag:{flagStatus:flagged?"flagged":"notFlagged"}})});
      await c.env.DB.prepare("UPDATE mail_messages SET is_flagged=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(flagged?1:0,ts,messageId,tenant).run();
      return c.json({ok:true,data:{messageId,action,flagged}});
    }
    if(["ARCHIVE","DELETE","MOVE"].includes(action)){
      let target:any=null;
      if(action==="MOVE"){
        const folderId=text(body.folderId);if(!folderId)return c.json(err("MAIL_FOLDER_REQUIRED","Hedef klasör seçilmelidir."),422);
        target=await c.env.DB.prepare("SELECT * FROM mail_folders WHERE id=? AND account_id=? AND main_company_slug=? LIMIT 1").bind(folderId,row.account_id,tenant).first<AnyRow>();
      }else{
        const type=action==="ARCHIVE"?"ARCHIVE":"TRASH";
        target=await c.env.DB.prepare("SELECT * FROM mail_folders WHERE account_id=? AND main_company_slug=? AND UPPER(folder_type)=? ORDER BY updated_at DESC LIMIT 1").bind(row.account_id,tenant,type).first<AnyRow>();
      }
      const destinationId=text(target?.provider_folder_id)||(action==="ARCHIVE"?"archive":action==="DELETE"?"deleteditems":"");
      if(!destinationId)return c.json(err("MAIL_FOLDER_NOT_FOUND","Hedef posta klasörü bulunamadı."),404);
      const moved=(await graphJson(messageUrl+"/move",token,{method:"POST",body:JSON.stringify({destinationId})})).payload;
      await c.env.DB.prepare("UPDATE mail_messages SET provider_message_id=COALESCE(NULLIF(?,''),provider_message_id),folder_id=COALESCE(?,folder_id),updated_at=? WHERE id=? AND main_company_slug=?")
        .bind(text(moved.id)||null,text(target?.id)||null,ts,messageId,tenant).run();
      await audit(c,tenant,text(current.id),text(row.account_id),"MAIL_MICROSOFT_MESSAGE_"+action,{messageId,targetFolderId:text(target?.id),providerMessageId:text(moved.id)||providerMessageId});
      return c.json({ok:true,data:{messageId,action,folderId:text(target?.id)||null,providerMessageId:text(moved.id)||providerMessageId}});
    }
    return c.json(err("MAIL_ACTION_INVALID","Desteklenmeyen mail işlemi."),422);
  });

  app.get("/api/mail/messages/:messageId/attachments/:attachmentId/download/microsoft",async(c:any)=>{
    const a:any=await currentAccess(c);if(a.error)return a.error;const{current,tenant}=a,messageId=text(c.req.param("messageId")),attachmentId=text(c.req.param("attachmentId"));
    const row=await c.env.DB.prepare("SELECT ma.*,m.account_id,m.provider_message_id,a.provider_type,a.provider_connected FROM mail_attachments ma JOIN mail_messages m ON m.id=ma.message_id AND m.main_company_slug=ma.main_company_slug JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE ma.id=? AND ma.message_id=? AND ma.main_company_slug=? LIMIT 1").bind(attachmentId,messageId,tenant).first<AnyRow>();
    if(!row)return c.json(err("MAIL_ATTACHMENT_NOT_FOUND","Mail eki bulunamadı."),404);
    const account=await accountForUser(c,current,tenant,text(row.account_id));if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Bu posta kutusuna erişim yok."),403);
    if(upper(row.provider_type)!=="MICROSOFT_365"||!row.provider_connected)return c.json(err("MAIL_REAUTH_REQUIRED","Microsoft hesabı bağlı değil."),409);
    const token=(await usableToken(c,tenant,account)).text,base=mailboxBase(account),payload=(await graphJson(base+"/messages/"+encodeURIComponent(text(row.provider_message_id))+"/attachments/"+encodeURIComponent(text(row.provider_attachment_id)),token)).payload,encoded=text(payload.contentBytes);
    if(!encoded)return c.json(err("MAIL_ATTACHMENT_CONTENT_UNAVAILABLE","Bu ek türünün içeriği Microsoft tarafından doğrudan indirilebilir biçimde dönmedi."),409);
    const raw=atob(encoded.replace(/\s+/g,"")),bytes=Uint8Array.from(raw,(ch)=>ch.charCodeAt(0));
    if(bytes.byteLength>25*1024*1024)return c.json(err("MAIL_ATTACHMENT_TOO_LARGE","25 MB üzerindeki ekler KY ERP içinden indirilemez."),413);
    const headers=new Headers({"Content-Type":text(row.mime_type)||"application/octet-stream","Cache-Control":"private, no-store"});
    headers.set("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(text(row.file_name)||"ek")}`);
    return new Response(bytes,{status:200,headers});
  });

  // On-demand, hash-based verification of historical Outlook SENT PDF attachments.
  // Only evidence links are written; no mail, invoice or financial records are created.
  app.post("/api/mail/messages/:id/verify-evidence/microsoft",async(c:any)=>{
    const a:any=await currentAccess(c);if(a.error)return a.error;
    const{current,tenant}=a,messageId=text(c.req.param("id"));
    if(!perm(current,"canView"))return c.json(err("MAIL_FORBIDDEN","Mail görüntüleme yetkisi gerekli."),403);
    const mail=await c.env.DB.prepare("SELECT m.id,m.account_id,m.provider_message_id FROM mail_messages m JOIN mail_folders f ON f.id=m.folder_id AND f.main_company_slug=m.main_company_slug WHERE m.id=? AND m.main_company_slug=? AND m.direction='OUTGOING' AND m.sent_at IS NOT NULL AND UPPER(f.folder_type)='SENT' LIMIT 1")
      .bind(messageId,tenant).first<AnyRow>();
    if(!mail)return c.json(err("MAIL_SENT_EVIDENCE_NOT_FOUND","Gerçek Outlook Gönderilenler mesajı bulunamadı."),404);
    const account=await accountForUser(c,current,tenant,text(mail.account_id));
    if(!account||upper(account.provider_type)!=="MICROSOFT_365"||!account.provider_connected)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Posta kutusu erişimi bulunamadı."),403);
    const items=await c.env.DB.prepare("SELECT * FROM mail_attachments WHERE main_company_slug=? AND message_id=?").bind(tenant,messageId).all<AnyRow>();
    const pdfs=(items.results||[]).filter(row=>invoiceMailDocumentFromFile(row.file_name,"HKN")||invoiceMailDocumentFromFile(row.file_name,"DDM"));
    if(!pdfs.length||pdfs.length>10)return c.json(err("MAIL_PDF_EVIDENCE_INVALID","HKN/DDM PDF listesi geçersiz."),409);
    const token=(await usableToken(c,tenant,account)).text,base=mailboxBase(account),results:any[]=[];
    for(const row of pdfs){
      const name=text(row.file_name),attachmentId=text(row.provider_attachment_id);
      if(!attachmentId||Number(row.size_bytes||0)>15*1024*1024){results.push({fileName:name,status:"REVIEW_REQUIRED"});continue;}
      try{
        const payload=(await graphJson(base+"/messages/"+encodeURIComponent(text(mail.provider_message_id))+"/attachments/"+encodeURIComponent(attachmentId)+"?$select=id,name,size,contentBytes",token)).payload;
        if(text(payload.name)!==name||Number(payload.size||0)!==Number(row.size_bytes||0)||!text(payload.contentBytes))throw new Error("MAIL_ATTACHMENT_CHANGED");
        const raw=atob(text(payload.contentBytes).replace(/\s+/g,""));
        if(raw.length>15*1024*1024)throw new Error("MAIL_ATTACHMENT_TOO_LARGE");
        const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
        const digest=await crypto.subtle.digest("SHA-256",bytes);
        const hash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
        const matched=await c.env.DB.prepare("SELECT id,file_name,sha256,size_bytes FROM file_hub_assets WHERE main_company_slug=? AND LOWER(sha256)=? AND size_bytes=? AND UPPER(status)='AVAILABLE' LIMIT 30")
          .bind(tenant,hash,bytes.length).all<AnyRow>();
        const kind=invoiceMailDocumentFromFile(name,"HKN")?"HKN":"DDM",number=invoiceMailDocumentFromFile(name,kind);
        const exact=(matched.results||[]).filter(asset=>invoiceMailDocumentFromFile(asset.file_name,kind)===number);
        if(exact.length!==1){results.push({fileName:name,status:"REVIEW_REQUIRED"});continue;}
        await c.env.DB.prepare("UPDATE mail_attachments SET file_asset_id=?,provider_metadata=? WHERE id=? AND main_company_slug=? AND message_id=?")
          .bind(exact[0].id,JSON.stringify({provider:"MICROSOFT_365",sha256:hash,verifiedAt:nowIso()}),row.id,tenant,messageId).run();
        results.push({fileName:name,status:"HASH_VERIFIED"});
      }catch{results.push({fileName:name,status:"REVIEW_REQUIRED"});}
    }
    return c.json({ok:true,data:{messageId,results,complete:results.every(row=>row.status==="HASH_VERIFIED")}});
  });

  // Explicit user "Taslak Kaydet": save the same draft in Outlook's Drafts.
  // This does NOT send a message and does not create a second ERP mail record.
  app.post("/api/mail/drafts/:id/provider-draft/microsoft",async(c:any)=>{
    const a:any=await currentAccess(c);if(a.error)return a.error;
    const{current,tenant}=a,draftId=text(c.req.param("id"));
    if(!perm(current,"canCreate"))return c.json(err("MAIL_DRAFT_FORBIDDEN","Taslak oluşturma yetkisi yok."),403);
    const draft=await c.env.DB.prepare(
      "SELECT d.*,a.provider_type,a.status account_status,a.provider_connected,a.account_type,a.email_address FROM mail_drafts d JOIN mail_accounts a ON a.id=d.account_id AND a.main_company_slug=d.main_company_slug WHERE d.id=? AND d.main_company_slug=? LIMIT 1"
    ).bind(draftId,tenant).first<AnyRow>();
    if(!draft)return c.json(err("DRAFT_NOT_FOUND","Taslak bulunamadı."),404);
    if(!(await memberCanSend(c,current,tenant,text(draft.account_id))))return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Bu posta kutusunda taslak hazırlama yetkiniz yok."),403);
    if(upper(draft.provider_type)!=="MICROSOFT_365"||upper(draft.account_status)!=="ACTIVE"||!draft.provider_connected)
      return c.json(err("MAIL_ACCOUNT_NOT_ACTIVE","Outlook hesabı bağlı ve onaylı değil."),409);
    if(["SENT","SEND_REVIEW_REQUIRED","PROVIDER_DRAFT_CREATING","PROVIDER_DRAFT_REVIEW_REQUIRED"].includes(upper(draft.status)))
      return c.json(err("MAIL_DRAFT_ALREADY_PROCESSED","Gönderilmiş veya incelenecek taslak Outlook'ta yeniden oluşturulamaz."),409);
    let assets:any[]=[];
    try{assets=await resolveDraftAttachments(c,tenant,parseAttachments(draft.attachment_refs_json));}
    catch(error:any){return c.json(err(text(error?.code)||"MAIL_ATTACHMENT_LOAD_FAILED",text(error?.message)||"Taslak ekleri doğrulanamadı."),Number(error?.status)||502);}
    const recipients=parseRecipients(draft.recipients_json),account=await c.env.DB.prepare(
      "SELECT * FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1"
    ).bind(draft.account_id,tenant).first<AnyRow>();
    try{
      const token=(await usableToken(c,tenant,account)).text,base=mailboxBase(account);
      // If a previous request persisted a provider ID but attachment transfer
      // failed, retry against the same Outlook draft. Never claim mirrored
      // attachments succeeded without checking Graph again.
      const existingProviderDraftId=text(draft.provider_draft_id);
      let providerDraftId=existingProviderDraftId;
      if(!providerDraftId){
        if(upper(draft.status)!=="DRAFT")return c.json(err("MAIL_DRAFT_REVIEW_REQUIRED","Önceki Outlook taslak isteği belirsiz; otomatik yeniden oluşturma kapalı."),409);
        const claimed=await c.env.DB.prepare("UPDATE mail_drafts SET status='PROVIDER_DRAFT_CREATING',updated_at=? WHERE id=? AND main_company_slug=? AND status='DRAFT' AND provider_draft_id IS NULL")
          .bind(nowIso(),draftId,tenant).run();
        if(!Number(claimed.meta?.changes||0))return c.json(err("MAIL_DRAFT_IN_PROGRESS","Taslak başka bir işlemde oluşturuluyor."),409);
        try{
          const message={subject:text(draft.subject),body:{contentType:text(draft.body_html)?"HTML":"Text",content:text(draft.body_html||draft.body_text)},
            toRecipients:localRecipients(recipients.to),ccRecipients:localRecipients(recipients.cc),bccRecipients:localRecipients(recipients.bcc),transactionId:draftId};
          const original=await mailReplyContext(c.env.DB,tenant,text(draft.account_id),text(draft.reply_to_message_id));
          const endpoint=original?base+"/messages/"+encodeURIComponent(original.provider_message_id)+"/createReply":base+"/messages";
          const created=(await graphJson(endpoint,token,{method:"POST",headers:{Prefer:'IdType="ImmutableId"'},body:JSON.stringify(original?{message}:message)})).payload;
          providerDraftId=text(created.id);
          if(!providerDraftId)throw Object.assign(new Error("Outlook taslak kimliği alınamadı."),{code:"MICROSOFT_PROVIDER_DRAFT_MISSING"});
          await c.env.DB.prepare("UPDATE mail_drafts SET provider_draft_id=?,status='PROVIDER_DRAFT',updated_at=? WHERE id=? AND main_company_slug=? AND status='PROVIDER_DRAFT_CREATING'")
            .bind(providerDraftId,nowIso(),draftId,tenant).run();
        }catch(error){
          // A timeout may mean a remote draft exists: don't create another automatically.
          await c.env.DB.prepare("UPDATE mail_drafts SET status='PROVIDER_DRAFT_REVIEW_REQUIRED',updated_at=? WHERE id=? AND main_company_slug=? AND status='PROVIDER_DRAFT_CREATING'")
            .bind(nowIso(),draftId,tenant).run();
          throw error;
        }
      }
      await syncMicrosoftDraftAttachments(base,providerDraftId,token,assets);
      return c.json({ok:true,data:{draftId,providerDraftId,status:"PROVIDER_DRAFT",idempotent:Boolean(existingProviderDraftId),sent:false}});
    }catch(error:any){
      return c.json(err(text(error?.code)||"MICROSOFT_DRAFT_SYNC_FAILED",text(error?.message)||"Outlook taslağı kaydedilemedi."),Number(error?.status)||502);
    }
  });

  app.post("/api/mail/drafts/:id/send",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a,draftId=text(c.req.param("id"));
    const draft=await c.env.DB.prepare("SELECT d.*,a.provider_type,a.status account_status,a.provider_connected,a.email_address,a.account_type FROM mail_drafts d JOIN mail_accounts a ON a.id=d.account_id AND a.main_company_slug=d.main_company_slug WHERE d.id=? AND d.main_company_slug=? LIMIT 1").bind(draftId,tenant).first<AnyRow>();
    if(!draft)return c.json(err("DRAFT_NOT_FOUND","Mail taslağı bulunamadı."),404);
    if(!(await memberCanSend(c,current,tenant,text(draft.account_id))))return c.json(err("MAIL_SEND_FORBIDDEN","Bu posta kutusundan gönderim yetkiniz yok."),403);
    if(["PROVIDER_DRAFT_CREATING","PROVIDER_DRAFT_REVIEW_REQUIRED"].includes(upper(draft.status)))return c.json(err("MAIL_DRAFT_REVIEW_REQUIRED","Taslak sonucu belirsiz; gönderim kilitli."),409);
    if(upper(draft.provider_type)!=="MICROSOFT_365"||upper(draft.account_status)!=="ACTIVE"||!draft.provider_connected)return c.json(err("MAIL_ACCOUNT_NOT_ACTIVE","Microsoft posta kutusu aktif ve onaylı değil."),409);
    let original=null;
    try { original=await mailReplyContext(c.env.DB,tenant,text(draft.account_id),text(draft.reply_to_message_id)); }
    catch(error:any){return c.json(err(error.code,error.message),error.status||422);}

    const attachments=parseAttachments(draft.attachment_refs_json);
    let resolvedAttachments:any[]=[];
    try{resolvedAttachments=await resolveDraftAttachments(c,tenant,attachments);}
    catch(error:any){return c.json(err(text(error?.code)||"MAIL_ATTACHMENT_LOAD_FAILED",text(error?.message)||"Mail eki File Hub'dan alınamadı."),Number(error?.status)||502);}
    const logicalEventId=text(body.logicalEventId)||"MAIL_DRAFT_SEND:"+draftId;
    // The invariant is enforced by the Worker too, not only the browser preflight.
    const hknDocs=resolvedAttachments.map(a=>invoiceMailDocumentFromFile(a.fileName,"HKN")).filter(Boolean);
    const ddmDocs=resolvedAttachments.map(a=>invoiceMailDocumentFromFile(a.fileName,"DDM")).filter(Boolean);
    if(hknDocs.length||ddmDocs.length){
      if(hknDocs.length!==1||!ddmDocs.length||new Set(ddmDocs).size!==ddmDocs.length||
        logicalEventId!==invoiceMailDispatchKey(tenant,hknDocs[0]))
        return c.json(err("MAIL_INVOICE_PACKAGE_INVALID","HKN başına tek gönderim anahtarı ve doğrulanmış DDM PDF paketi zorunludur."),422);
      const legacy=invoiceMailLegacyKeyPrefix(tenant,hknDocs[0]);
      const past=await c.env.DB.prepare("SELECT id FROM mail_send_jobs WHERE main_company_slug=? AND substr(logical_event_id,1,?)=? LIMIT 1")
        .bind(tenant,legacy.length,legacy).first<AnyRow>();
      if(past)return c.json(err("MAIL_INVOICE_LEGACY_ATTEMPT","Bu HKN'nin eski DDM gönderim kaydı var; yeniden gönderim engellendi."),409);
    }
    const existingJob=await c.env.DB.prepare("SELECT * FROM mail_send_jobs WHERE main_company_slug=? AND logical_event_id=? LIMIT 1").bind(tenant,logicalEventId).first<AnyRow>();
    // An idempotency key belongs to exactly one immutable draft.
    // Never attribute another draft's accepted send to a new recipient/attachment set.
    if(existingJob && text(existingJob.draft_id)!==draftId)
      return c.json(err("MAIL_EVENT_ALREADY_USED","Bu HKN/DDM gönderimi başka bir taslak ile daha önce başlatılmış. Önce mevcut gönderimin geçmişini kontrol edin.",{sendJobId:existingJob.id}),409);
    if(upper(draft.status)==="SENT"){
      if(existingJob && upper(existingJob.status)==="ACCEPTED")
        return c.json({ok:true,data:{idempotent:true,status:"ACCEPTED",sendJobId:existingJob.id,providerMessageId:existingJob.provider_message_id,delivered:false}});
      return c.json(err("MAIL_SEND_RECONCILIATION_REQUIRED","Gönderilmiş taslağın iş anahtarı doğrulanamadı; yeniden gönderim kapalı."),409);
    }
    if(existingJob){
      if(upper(existingJob.status)==="ACCEPTED")return c.json({ok:true,data:{idempotent:true,status:"ACCEPTED",sendJobId:existingJob.id,providerMessageId:existingJob.provider_message_id,delivered:false}});
      if(["SENDING","UNKNOWN_REVIEW_REQUIRED"].includes(upper(existingJob.status)))return c.json(err("UNKNOWN_REVIEW_REQUIRED","Önceki gönderimin sonucu belirsiz. Çift mail riskine karşı otomatik tekrar gönderim kapalıdır.",{sendJobId:existingJob.id}),409);
    }
    const account=await c.env.DB.prepare("SELECT * FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1").bind(draft.account_id,tenant).first<AnyRow>(),token=(await usableToken(c,tenant,account)).text,base=mailboxBase(account),recipients=parseRecipients(draft.recipients_json);
    const message={subject:text(draft.subject),body:{contentType:text(draft.body_html)?"HTML":"Text",content:text(draft.body_html||draft.body_text)},toRecipients:localRecipients(recipients.to),ccRecipients:localRecipients(recipients.cc),bccRecipients:localRecipients(recipients.bcc)};
    let providerDraftId=text(draft.provider_draft_id);
    if(!providerDraftId){
      const endpoint=original?base+"/messages/"+encodeURIComponent(original.provider_message_id)+"/createReply":base+"/messages";
      const created=(await graphJson(endpoint,token,{method:"POST",headers:{Prefer:'IdType="ImmutableId"'},body:JSON.stringify(original?{message}:message)})).payload;providerDraftId=text(created.id);
      if(!providerDraftId)return c.json(err("PROVIDER_DRAFT_MISSING","Microsoft taslak kimliği dönmedi."),502);
      await c.env.DB.prepare("UPDATE mail_drafts SET provider_draft_id=?,status='PROVIDER_DRAFT',updated_at=? WHERE id=? AND main_company_slug=?").bind(providerDraftId,nowIso(),draftId,tenant).run();
    }
    try{await syncMicrosoftDraftAttachments(base,providerDraftId,token,resolvedAttachments);}
    catch(error:any){return c.json(err(text(error?.code)||"MICROSOFT_ATTACHMENT_SYNC_FAILED",text(error?.message)||"File Hub ekleri Microsoft taslağına aktarılamadı."),Number(error?.status)||502);}
    const jobId=text(existingJob?.id)||crypto.randomUUID(),ts=nowIso();
    if(existingJob){const claim=await c.env.DB.prepare("UPDATE mail_send_jobs SET status='SENDING',attempt_count=attempt_count+1,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=? AND status='FAILED'").bind(ts,jobId,tenant).run();if(!claim.meta?.changes)return c.json(err("SEND_IN_PROGRESS","Gönderim zaten işleniyor; tekrar gönderilmedi."),409);}
    else {
      // SQLite/D1 atomic claim: concurrent tabs cannot create two SENDING jobs
      // for the same invoice event even if their read checks both saw no job.
      const claim=await c.env.DB.prepare("INSERT INTO mail_send_jobs(id,main_company_slug,account_id,draft_id,logical_event_id,status,provider_message_id,provider_acceptance_id,attempt_count,last_error,requested_by,approved_request_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM mail_send_jobs WHERE main_company_slug=? AND logical_event_id=?)")
        .bind(jobId,tenant,draft.account_id,draftId,logicalEventId,"SENDING",providerDraftId,null,1,null,text(current.id),null,ts,ts,tenant,logicalEventId).run();
      if(!Number(claim.meta?.changes||0))
        return c.json(err("MAIL_EVENT_ALREADY_USED","Başka bir oturum bu gönderimi başlattı. Sonucu doğrulamadan yeniden gönderim yapmayın."),409);
    }
    try{
      const response=await fetch(base+"/messages/"+encodeURIComponent(providerDraftId)+"/send",{method:"POST",headers:{Authorization:"Bearer "+token}});
      if(response.status>=500)throw new Error("Microsoft gönderim sonucu doğrulanamadı.");
      if(!response.ok){
        const payload=await response.json().catch(()=>({})) as AnyRow,detail=text(payload?.error?.message)||"Microsoft gönderimi reddetti.";
        await c.env.DB.prepare("UPDATE mail_send_jobs SET status='FAILED',last_error=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(detail,nowIso(),jobId,tenant).run();
        return c.json(err("MICROSOFT_SEND_FAILED",detail,{sendJobId:jobId}),502);
      }
      const acceptance=text(response.headers.get("request-id")||response.headers.get("client-request-id")),done=nowIso();
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE mail_send_jobs SET status='ACCEPTED',provider_message_id=?,provider_acceptance_id=?,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?").bind(providerDraftId,acceptance||null,done,jobId,tenant),
        c.env.DB.prepare("UPDATE mail_drafts SET status='SENT',updated_at=? WHERE id=? AND main_company_slug=?").bind(done,draftId,tenant)
      ]);
      await audit(c,tenant,text(current.id),text(draft.account_id),"MAIL_PROVIDER_ACCEPTED",{draftId,sendJobId:jobId,providerDraftId,acceptance});
      return c.json({ok:true,data:{status:"PROVIDER_ACCEPTED",sendJobId:jobId,providerMessageId:providerDraftId,providerAcceptanceId:acceptance||null,delivered:false}});
    }catch(error:any){
      const detail=text(error?.message)||"Microsoft gönderim sonucu doğrulanamadı.",failedAt=nowIso();
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE mail_send_jobs SET status='UNKNOWN_REVIEW_REQUIRED',last_error=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(detail,failedAt,jobId,tenant),
        c.env.DB.prepare("UPDATE mail_drafts SET status='SEND_REVIEW_REQUIRED',updated_at=? WHERE id=? AND main_company_slug=?").bind(failedAt,draftId,tenant)
      ]);
      await audit(c,tenant,text(current.id),text(draft.account_id),"MAIL_SEND_UNKNOWN_REVIEW_REQUIRED",{draftId,sendJobId:jobId,error:detail});
      return c.json(err("UNKNOWN_REVIEW_REQUIRED","Microsoft gönderim sonucu belirsiz. Çift gönderimi önlemek için otomatik retry yapılmadı.",{sendJobId:jobId}),409);
    }
  });
}
