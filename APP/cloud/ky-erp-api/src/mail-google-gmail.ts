// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud.ts";
import { openMailCredential, sealMailCredential } from "./mail-communication-core.ts";

type AnyRow = Record<string, any>;

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALLBACK = "https://api.kyerp.net/api/auth/mail/oauth/google/callback";
const APP_RETURN = "https://app.kyerp.net/iletisim/mail-gelen";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

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
function unb64url(value:string){const normalized=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);const raw=atob(normalized);return Uint8Array.from(raw,(ch)=>ch.charCodeAt(0));}
async function sha256Hex(value:string){const bytes=await sha256Bytes(value);return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");}
function headerSafe(value:unknown){return text(value).replace(/[\r\n]+/g," ").trim();}

function clientConfig(c:any){
  const clientId=text(c.env.GOOGLE_MAIL_CLIENT_ID||c.env.GOOGLE_DRIVE_CLIENT_ID);
  const clientSecret=text(c.env.GOOGLE_MAIL_CLIENT_SECRET||c.env.GOOGLE_DRIVE_CLIENT_SECRET);
  if(!clientId||!clientSecret)throw Object.assign(new Error("Google OAuth uygulama bilgileri production secret olarak tanımlı değil."),{code:"GOOGLE_MAIL_CONFIG_MISSING"});
  return{clientId,clientSecret};
}
async function tokenPost(c:any,values:Record<string,string>){
  const cfg=clientConfig(c);
  const response=await fetch(TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:new URLSearchParams({...values,client_id:cfg.clientId,client_secret:cfg.clientSecret})});
  const payload=await response.json().catch(()=>({})) as AnyRow;
  if(!response.ok||!text(payload.access_token))throw Object.assign(new Error(text(payload.error_description||payload.error)||"Google token isteği reddedildi."),{code:"GOOGLE_TOKEN_FAILED",status:response.status});
  return payload;
}
async function googleJson(url:string,accessToken:string,init:RequestInit={}){
  const headers=new Headers(init.headers||{});headers.set("Authorization","Bearer "+accessToken);headers.set("Accept","application/json");
  if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const response=await fetch(url,{...init,headers});
  const payload=await response.json().catch(()=>({})) as AnyRow;
  if(!response.ok)throw Object.assign(new Error(text(payload?.error?.message||payload?.error_description||payload?.error)||"Google Gmail isteği başarısız."),{code:"GOOGLE_GMAIL_FAILED",status:response.status});
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
  if(!packed)throw Object.assign(new Error("Gmail bağlantı anahtarı bulunamadı."),{code:"MAIL_REAUTH_REQUIRED"});
  let cred=packed.credential;
  const expires=Date.parse(text(cred.expiresAt));
  if(Number.isFinite(expires)&&expires>Date.now()+120000)return{text:cred.accessToken,credential:cred};
  if(!text(cred.refreshToken))throw Object.assign(new Error("Google yenileme anahtarı bulunamadı; hesabı yeniden bağlayın."),{code:"MAIL_REAUTH_REQUIRED"});
  const payload=await tokenPost(c,{grant_type:"refresh_token",refresh_token:text(cred.refreshToken)});
  cred={...cred,accessToken:text(payload.access_token),refreshToken:text(payload.refresh_token)||text(cred.refreshToken),expiresAt:new Date(Date.now()+Math.max(60,Number(payload.expires_in||3600))*1000).toISOString(),scope:text(payload.scope)||text(cred.scope),tokenType:text(payload.token_type)||"Bearer"};
  await saveCredential(c,tenant,text(account.id),cred,{provider:"GMAIL",refreshedAt:nowIso()});
  return{text:cred.accessToken,credential:cred};
}
async function audit(c:any,tenant:string,currentId:string,accountId:string,action:string,detail:AnyRow={}){
  await c.env.DB.prepare("INSERT INTO mail_audit_log(id,main_company_slug,actor_user_id,account_id,message_id,action,detail,ip_address,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),tenant,currentId||null,accountId||null,null,action,JSON.stringify(detail||{}),text(c.req.header("CF-Connecting-IP"))||null,nowIso()).run().catch(()=>{});
}
async function ensureFolder(c:any,tenant:string,accountId:string,providerId:string,name:string,type:string){
  const ts=nowIso();
  let row=await c.env.DB.prepare("SELECT * FROM mail_folders WHERE main_company_slug=? AND account_id=? AND provider_folder_id=? LIMIT 1").bind(tenant,accountId,providerId).first<AnyRow>();
  if(!row){
    const id=crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO mail_folders(id,main_company_slug,account_id,provider_folder_id,parent_folder_id,folder_type,name,sync_enabled,provider_metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenant,accountId,providerId,null,type,name,1,JSON.stringify({provider:"GMAIL"}),ts,ts).run();
    row={id,main_company_slug:tenant,account_id:accountId,provider_folder_id:providerId,folder_type:type,name};
  }else{
    await c.env.DB.prepare("UPDATE mail_folders SET name=?,folder_type=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(name,type,ts,row.id,tenant).run();
  }
  return row;
}
async function ensureThread(c:any,tenant:string,accountId:string,providerThreadId:string,subject:string,stamp:string){
  if(!providerThreadId)return"";
  const ts=nowIso();
  let row=await c.env.DB.prepare("SELECT id FROM mail_threads WHERE main_company_slug=? AND account_id=? AND provider_thread_id=? LIMIT 1").bind(tenant,accountId,providerThreadId).first<AnyRow>();
  if(!row){
    const id=crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO mail_threads(id,main_company_slug,account_id,provider_thread_id,subject,last_message_at,message_count,is_archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenant,accountId,providerThreadId,subject||null,stamp||null,1,0,ts,ts).run();
    return id;
  }
  await c.env.DB.prepare("UPDATE mail_threads SET subject=COALESCE(NULLIF(?,''),subject),last_message_at=CASE WHEN COALESCE(last_message_at,'')<? THEN ? ELSE last_message_at END,updated_at=? WHERE id=?")
    .bind(subject||"",stamp||"",stamp||null,ts,row.id).run();
  return text(row.id);
}
function gmailHeaders(payload:AnyRow){
  const result:Record<string,string>={};
  for(const row of Array.isArray(payload?.headers)?payload.headers:[]){const key=upper(row?.name);if(key&&!result[key])result[key]=text(row?.value);}
  return result;
}
function decodeGmailPart(value:unknown){
  const source=text(value);if(!source)return"";
  try{return new TextDecoder().decode(unb64url(source));}catch{return"";}
}
function messageBodies(part:AnyRow,result:{plain:string;html:string}){
  const mime=text(part?.mimeType).toLowerCase(),data=text(part?.body?.data);
  if(data&&mime==="text/plain"&&!result.plain)result.plain=decodeGmailPart(data);
  if(data&&mime==="text/html"&&!result.html)result.html=decodeGmailPart(data);
  for(const child of Array.isArray(part?.parts)?part.parts:[])messageBodies(child,result);
}
function splitAddresses(value:unknown){
  const source=text(value);if(!source)return[];
  return source.split(",").map((part)=>part.trim()).filter(Boolean).map((part)=>{
    const match=part.match(/^(.*)<([^>]+)>$/);return match?{name:text(match[1]).replace(/^"|"$/g,""),email:text(match[2]).toLowerCase()}:{name:"",email:part.toLowerCase()};
  }).filter((row)=>row.email.includes("@"));
}
async function persistMessage(c:any,tenant:string,account:AnyRow,folder:AnyRow,item:AnyRow,direction:string){
  const providerMessageId=text(item.id);if(!providerMessageId)return;
  const headers=gmailHeaders(item.payload||{}),bodies={plain:"",html:""};messageBodies(item.payload||{},bodies);
  if(!bodies.plain&&!bodies.html&&text(item?.payload?.body?.data)){
    const root=decodeGmailPart(item.payload.body.data);if(text(item?.payload?.mimeType).toLowerCase()==="text/html")bodies.html=root;else bodies.plain=root;
  }
  const from=splitAddresses(headers.FROM)[0]||{name:"",email:""};
  const stamp=Number(item.internalDate)>0?new Date(Number(item.internalDate)).toISOString():nowIso();
  const threadId=await ensureThread(c,tenant,text(account.id),text(item.threadId),headers.SUBJECT,stamp),ts=nowIso();
  const existing=await c.env.DB.prepare("SELECT id FROM mail_messages WHERE main_company_slug=? AND account_id=? AND provider_message_id=? LIMIT 1").bind(tenant,account.id,providerMessageId).first<AnyRow>();
  const id=text(existing?.id)||crypto.randomUUID();
  const values=[threadId||null,folder.id||null,headers["MESSAGE-ID"]||null,direction,from.email||null,from.name||null,headers.SUBJECT||null,bodies.plain||text(item.snippet)||null,bodies.html||null,direction==="OUTGOING"?stamp:null,direction==="INCOMING"?stamp:null,(Array.isArray(item.labelIds)&&item.labelIds.includes("UNREAD"))?0:1,(Array.isArray(item.labelIds)&&item.labelIds.includes("STARRED"))?1:0,Number(item?.payload?.parts?.length||0)>0&&JSON.stringify(item.payload.parts).includes("filename")?1:0,JSON.stringify({provider:"GMAIL",labelIds:item.labelIds||[],historyId:text(item.historyId)}),ts,id,tenant];
  if(existing?.id){
    await c.env.DB.prepare("UPDATE mail_messages SET thread_id=?,folder_id=?,internet_message_id=?,direction=?,sender_email=?,sender_name=?,subject=?,body_text=?,body_html=?,sent_at=?,received_at=?,is_read=?,is_flagged=?,has_attachments=?,provider_metadata=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(...values).run();
  }else{
    await c.env.DB.prepare("INSERT INTO mail_messages(id,main_company_slug,account_id,thread_id,folder_id,provider_message_id,internet_message_id,direction,sender_email,sender_name,subject,body_text,body_html,sent_at,received_at,is_read,is_flagged,has_attachments,provider_metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenant,account.id,threadId||null,folder.id||null,providerMessageId,headers["MESSAGE-ID"]||null,direction,from.email||null,from.name||null,headers.SUBJECT||null,bodies.plain||text(item.snippet)||null,bodies.html||null,direction==="OUTGOING"?stamp:null,direction==="INCOMING"?stamp:null,(Array.isArray(item.labelIds)&&item.labelIds.includes("UNREAD"))?0:1,(Array.isArray(item.labelIds)&&item.labelIds.includes("STARRED"))?1:0,Number(item?.payload?.parts?.length||0)>0&&JSON.stringify(item.payload.parts).includes("filename")?1:0,JSON.stringify({provider:"GMAIL",labelIds:item.labelIds||[],historyId:text(item.historyId)}),ts,ts).run();
  }
  await c.env.DB.prepare("DELETE FROM mail_recipients WHERE main_company_slug=? AND message_id=?").bind(tenant,id).run();
  for(const [kind,value] of [["TO",headers.TO],["CC",headers.CC],["BCC",headers.BCC]] as any){
    for(const recipient of splitAddresses(value))await c.env.DB.prepare("INSERT INTO mail_recipients(id,main_company_slug,message_id,recipient_type,email_address,display_name,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),tenant,id,kind,recipient.email,recipient.name||null,ts).run();
  }
}
function parseRecipients(raw:unknown){try{const v=typeof raw==="string"?JSON.parse(raw):raw;return v&&typeof v==="object"?v:{};}catch{return{};}}
function parseAttachments(raw:unknown){try{const v=typeof raw==="string"?JSON.parse(raw):raw;return Array.isArray(v)?v:[];}catch{return[];}}
function recipientEmails(value:any){return (Array.isArray(value)?value:[]).map((item:any)=>typeof item==="string"?item:text(item?.email||item?.address)).map(headerSafe).filter((email:string)=>email.includes("@"));}
function mimeMessage(account:AnyRow,draft:AnyRow){
  const recipients=parseRecipients(draft.recipients_json),to=recipientEmails(recipients.to),cc=recipientEmails(recipients.cc),bcc=recipientEmails(recipients.bcc);
  if(!to.length&&!cc.length&&!bcc.length)throw Object.assign(new Error("En az bir alıcı gereklidir."),{code:"RECIPIENT_REQUIRED"});
  const subject=headerSafe(draft.subject),content=text(draft.body_html||draft.body_text),isHtml=Boolean(text(draft.body_html));
  const lines=[`From: ${headerSafe(account.email_address)}`,`To: ${to.join(", ")}`];
  if(cc.length)lines.push(`Cc: ${cc.join(", ")}`);if(bcc.length)lines.push(`Bcc: ${bcc.join(", ")}`);
  lines.push(`Subject: ${subject}`,"MIME-Version: 1.0",`Content-Type: ${isHtml?"text/html":"text/plain"}; charset=UTF-8`,"Content-Transfer-Encoding: 8bit","",content);
  return b64url(new TextEncoder().encode(lines.join("\r\n")));
}

export function registerGoogleMailRoutes(app:any){
  app.post("/api/mail/accounts/:id/oauth/google/start",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!perm(current,"canCreate"))return c.json(err("MAIL_CONNECT_FORBIDDEN","Mail hesabı bağlama yetkiniz yok."),403);
    const account=await accountForUser(c,current,tenant,text(c.req.param("id")));
    if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Mail hesabı bulunamadı veya erişim yok."),404);
    if(upper(account.provider_type)!=="GMAIL")return c.json(err("PROVIDER_MISMATCH","Bu hesap Gmail sağlayıcısına ait değil."),409);
    const cfg=clientConfig(c),state=randomToken(40),verifier=randomToken(64),challenge=b64url(await sha256Bytes(verifier)),sealed=await sealMailCredential(c,verifier),ts=nowIso();
    await c.env.DB.prepare("DELETE FROM mail_oauth_states WHERE expires_at<?").bind(ts).run();
    await c.env.DB.prepare("INSERT INTO mail_oauth_states(state_hash,main_company_slug,account_id,user_id,provider_type,code_verifier_ciphertext,code_verifier_nonce,return_path,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(await sha256Hex(state),tenant,account.id,text(current.id),"GMAIL",sealed.ciphertext,sealed.nonce,APP_RETURN,new Date(Date.now()+10*60*1000).toISOString(),ts).run();
    const qs=new URLSearchParams({client_id:cfg.clientId,response_type:"code",redirect_uri:CALLBACK,scope:SCOPES,state,code_challenge:challenge,code_challenge_method:"S256",access_type:"offline",include_granted_scopes:"true",prompt:"consent"});
    await audit(c,tenant,text(current.id),text(account.id),"MAIL_GOOGLE_OAUTH_STARTED",{});
    return c.json({ok:true,data:{authorizeUrl:AUTHORIZE+"?"+qs.toString(),expiresAt:new Date(Date.now()+10*60*1000).toISOString()}});
  });

  app.get("/api/auth/mail/oauth/google/callback",async(c:any)=>{
    const state=text(c.req.query("state")),code=text(c.req.query("code")),providerError=text(c.req.query("error")),providerDescription=text(c.req.query("error_description"));
    const fail=(message:string,codeValue="GOOGLE_OAUTH_FAILED")=>c.redirect(APP_RETURN+"?mailProvider=GMAIL&mailError="+encodeURIComponent(codeValue+":"+message),302);
    if(providerError)return fail(providerDescription||providerError,"GOOGLE_OAUTH_DENIED");
    if(!state||!code)return fail("OAuth state veya code eksik.");
    const stateHash=await sha256Hex(state),row=await c.env.DB.prepare("SELECT s.*,a.email_address,a.account_type,a.approval_status,a.provider_type FROM mail_oauth_states s JOIN mail_accounts a ON a.id=s.account_id AND a.main_company_slug=s.main_company_slug WHERE s.state_hash=? LIMIT 1").bind(stateHash).first<AnyRow>();
    if(!row||Date.parse(text(row.expires_at))<=Date.now())return fail("OAuth state geçersiz veya süresi dolmuş.","GOOGLE_OAUTH_STATE_INVALID");
    await c.env.DB.prepare("DELETE FROM mail_oauth_states WHERE state_hash=?").bind(stateHash).run();
    try{
      const verifier=await openMailCredential(c,{ciphertext:text(row.code_verifier_ciphertext),nonce:text(row.code_verifier_nonce)}),cfg=clientConfig(c);
      const payload=await tokenPost(c,{grant_type:"authorization_code",code,redirect_uri:CALLBACK,code_verifier:verifier});
      const accessToken=text(payload.access_token),profile=(await googleJson(USERINFO,accessToken)).payload,connectedEmail=text(profile.email).toLowerCase(),mailbox=text(row.email_address).toLowerCase();
      if(!connectedEmail||connectedEmail!==mailbox)return fail("Seçilen Google hesabı talep edilen posta kutusuyla eşleşmiyor.","GOOGLE_ACCOUNT_MISMATCH");
      await googleJson(GMAIL+"/profile",accessToken);
      const cred={accessToken,refreshToken:text(payload.refresh_token),expiresAt:new Date(Date.now()+Math.max(60,Number(payload.expires_in||3600))*1000).toISOString(),scope:text(payload.scope)||SCOPES,tokenType:text(payload.token_type)||"Bearer",connectedUserId:text(profile.sub)||connectedEmail,connectedEmail,mailboxAddress:mailbox};
      await saveCredential(c,text(row.main_company_slug),text(row.account_id),cred,{provider:"GMAIL",connectedEmail,mailboxAddress:mailbox});
      const ts=nowIso(),active=upper(row.approval_status)==="APPROVED";
      await c.env.DB.prepare("UPDATE mail_accounts SET provider_connected=1,provider_account_id=?,status=?,updated_at=? WHERE id=? AND main_company_slug=?")
        .bind(text(profile.sub)||connectedEmail,active?"ACTIVE":"PENDING",ts,row.account_id,row.main_company_slug).run();
      return c.redirect(APP_RETURN+"?mailProvider=GMAIL&mailConnected=1&accountId="+encodeURIComponent(text(row.account_id)),302);
    }catch(error:any){return fail(text(error?.message)||"Gmail hesabı bağlanamadı.",text(error?.code)||"GOOGLE_OAUTH_FAILED");}
  });

  app.post("/api/mail/accounts/:id/sync/google",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!perm(current,"canView"))return c.json(err("MAIL_SYNC_FORBIDDEN","Mail senkronizasyon yetkiniz yok."),403);
    const account=await accountForUser(c,current,tenant,text(c.req.param("id")));
    if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Mail hesabı bulunamadı veya erişim yok."),404);
    if(upper(account.provider_type)!=="GMAIL"||!account.provider_connected)return c.json(err("MAIL_REAUTH_REQUIRED","Gmail hesabı bağlı değil."),409);
    const token=(await usableToken(c,tenant,account)).text,labelPayload=(await googleJson(GMAIL+"/labels",token)).payload,labels=Array.isArray(labelPayload.labels)?labelPayload.labels:[],folderMap=new Map<string,AnyRow>();
    const typeOf=(id:string)=>({INBOX:"INBOX",SENT:"SENT",DRAFT:"DRAFTS",SPAM:"JUNK",TRASH:"TRASH",STARRED:"STARRED",IMPORTANT:"IMPORTANT"}[id]||"CUSTOM");
    for(const label of labels){
      const id=text(label.id);if(!id)continue;
      const folder=await ensureFolder(c,tenant,text(account.id),id,text(label.name)||id,typeOf(id));
      folderMap.set(id,{...folder,folder_type:typeOf(id)});
    }
    const defs=[["INBOX","INCOMING"],["SENT","OUTGOING"]],summary:any[]=[];
    for(const [labelId,direction] of defs){
      const folder=folderMap.get(labelId)||await ensureFolder(c,tenant,text(account.id),labelId,labelId==="INBOX"?"Gelen Kutusu":"Gönderilenler",typeOf(labelId));
      let count=0;
      try{
        const list=(await googleJson(GMAIL+"/messages?maxResults=100&labelIds="+encodeURIComponent(labelId),token)).payload;
        for(const item of Array.isArray(list.messages)?list.messages:[]){
          const full=(await googleJson(GMAIL+"/messages/"+encodeURIComponent(text(item.id))+"?format=full",token)).payload;
          await persistMessage(c,tenant,account,folder,full,direction);count++;
        }
        const ts=nowIso(),profile=(await googleJson(GMAIL+"/profile",token)).payload;
        await c.env.DB.prepare("INSERT INTO mail_sync_cursors(id,main_company_slug,account_id,folder_id,cursor_type,cursor_value,last_sync_at,last_success_at,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_slug,account_id,folder_id,cursor_type) DO UPDATE SET cursor_value=excluded.cursor_value,last_sync_at=excluded.last_sync_at,last_success_at=excluded.last_success_at,last_error=NULL,updated_at=excluded.updated_at")
          .bind(crypto.randomUUID(),tenant,account.id,folder.id,"GMAIL_HISTORY",text(profile.historyId)||null,ts,ts,null,ts).run();
        summary.push({folder:folder.folder_type||typeOf(labelId),name:folder.name,count,ok:true});
      }catch(error:any){summary.push({folder:folder.folder_type||typeOf(labelId),name:folder.name,count,ok:false,error:text(error?.message)});}
    }
    const partial=summary.some(r=>!r.ok);await audit(c,tenant,text(current.id),text(account.id),"MAIL_GOOGLE_SYNC",{summary,partial,discoveredLabels:labels.length});
    return c.json({ok:!partial,data:{accountId:account.id,partial,folders:summary,discoveredFolders:labels.length},...(partial?{error:{code:"MAIL_SYNC_PARTIAL",message:"Bazı Gmail klasörleri senkronize edilemedi."}}:{})},partial?207:200);
  });

  app.post("/api/mail/accounts/:id/folders/:folderId/sync/google",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a;
    const account=await accountForUser(c,current,tenant,text(c.req.param("id")));if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Mail hesabı bulunamadı veya erişim yok."),404);
    if(upper(account.provider_type)!=="GMAIL"||!account.provider_connected)return c.json(err("MAIL_REAUTH_REQUIRED","Gmail hesabı bağlı değil."),409);
    const folder=await c.env.DB.prepare("SELECT * FROM mail_folders WHERE id=? AND account_id=? AND main_company_slug=? LIMIT 1").bind(text(c.req.param("folderId")),account.id,tenant).first<AnyRow>();
    if(!folder)return c.json(err("MAIL_FOLDER_NOT_FOUND","Posta klasörü bulunamadı."),404);
    const token=(await usableToken(c,tenant,account)).text,labelId=text(folder.provider_folder_id),list=(await googleJson(GMAIL+"/messages?maxResults=100&labelIds="+encodeURIComponent(labelId),token)).payload;
    let count=0;
    for(const item of Array.isArray(list.messages)?list.messages:[]){
      const full=(await googleJson(GMAIL+"/messages/"+encodeURIComponent(text(item.id))+"?format=full",token)).payload;
      await persistMessage(c,tenant,account,folder,full,upper(folder.folder_type)==="SENT"?"OUTGOING":"AUTO");count++;
    }
    return c.json({ok:true,data:{accountId:account.id,folderId:folder.id,count}});
  });

  app.post("/api/mail/messages/:id/action/google",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a,messageId=text(c.req.param("id"));
    if(!perm(current,"canUpdate"))return c.json(err("MAIL_UPDATE_FORBIDDEN","Mail düzenleme yetkiniz yok."),403);
    const row=await c.env.DB.prepare("SELECT m.*,a.provider_type,a.provider_connected,a.email_address FROM mail_messages m JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE m.id=? AND m.main_company_slug=? LIMIT 1").bind(messageId,tenant).first<AnyRow>();
    if(!row)return c.json(err("MAIL_MESSAGE_NOT_FOUND","Mail bulunamadı."),404);
    const account=await accountForUser(c,current,tenant,text(row.account_id));if(!account)return c.json(err("MAIL_ACCOUNT_FORBIDDEN","Bu posta kutusuna erişim yok."),403);
    if(upper(row.provider_type)!=="GMAIL"||!row.provider_connected)return c.json(err("MAIL_REAUTH_REQUIRED","Gmail hesabı bağlı değil."),409);
    const token=(await usableToken(c,tenant,account)).text,providerMessageId=text(row.provider_message_id),action=upper(body.action),url=GMAIL+"/messages/"+encodeURIComponent(providerMessageId),ts=nowIso();
    const modify=async(addLabelIds:string[]=[],removeLabelIds:string[]=[])=>googleJson(url+"/modify",token,{method:"POST",body:JSON.stringify({addLabelIds,removeLabelIds})});
    if(action==="MARK_READ"||action==="MARK_UNREAD"){
      const isRead=action==="MARK_READ";await modify(isRead?[]:["UNREAD"],isRead?["UNREAD"]:[]);
      await c.env.DB.prepare("UPDATE mail_messages SET is_read=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(isRead?1:0,ts,messageId,tenant).run();
      return c.json({ok:true,data:{messageId,action,isRead}});
    }
    if(action==="FLAG"||action==="UNFLAG"){
      const flagged=action==="FLAG";await modify(flagged?["STARRED"]:[],flagged?[]:["STARRED"]);
      await c.env.DB.prepare("UPDATE mail_messages SET is_flagged=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(flagged?1:0,ts,messageId,tenant).run();
      return c.json({ok:true,data:{messageId,action,flagged}});
    }
    if(action==="ARCHIVE"){
      await modify([],["INBOX"]);
      await c.env.DB.prepare("UPDATE mail_messages SET folder_id=NULL,updated_at=? WHERE id=? AND main_company_slug=?").bind(ts,messageId,tenant).run();
      return c.json({ok:true,data:{messageId,action}});
    }
    if(action==="DELETE"){
      await googleJson(url+"/trash",token,{method:"POST"});
      const target=await c.env.DB.prepare("SELECT id FROM mail_folders WHERE account_id=? AND main_company_slug=? AND UPPER(folder_type)='TRASH' LIMIT 1").bind(row.account_id,tenant).first<AnyRow>();
      await c.env.DB.prepare("UPDATE mail_messages SET folder_id=COALESCE(?,folder_id),updated_at=? WHERE id=? AND main_company_slug=?").bind(text(target?.id)||null,ts,messageId,tenant).run();
      return c.json({ok:true,data:{messageId,action}});
    }
    if(action==="MOVE"){
      const folderId=text(body.folderId),target=await c.env.DB.prepare("SELECT * FROM mail_folders WHERE id=? AND account_id=? AND main_company_slug=? LIMIT 1").bind(folderId,row.account_id,tenant).first<AnyRow>();
      if(!target)return c.json(err("MAIL_FOLDER_NOT_FOUND","Hedef posta klasörü bulunamadı."),404);
      const labelId=text(target.provider_folder_id);await modify([labelId],labelId==="INBOX"?[]:["INBOX"]);
      await c.env.DB.prepare("UPDATE mail_messages SET folder_id=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(target.id,ts,messageId,tenant).run();
      return c.json({ok:true,data:{messageId,action,folderId:target.id}});
    }
    return c.json(err("MAIL_ACTION_INVALID","Desteklenmeyen mail işlemi."),422);
  });

  app.post("/api/mail/drafts/:id/send/google",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAccess(c,body);if(a.error)return a.error;const{current,tenant}=a,draftId=text(c.req.param("id"));
    const draft=await c.env.DB.prepare("SELECT d.*,a.provider_type,a.status account_status,a.provider_connected,a.email_address,a.account_type FROM mail_drafts d JOIN mail_accounts a ON a.id=d.account_id AND a.main_company_slug=d.main_company_slug WHERE d.id=? AND d.main_company_slug=? LIMIT 1").bind(draftId,tenant).first<AnyRow>();
    if(!draft)return c.json(err("DRAFT_NOT_FOUND","Mail taslağı bulunamadı."),404);
    if(!(await memberCanSend(c,current,tenant,text(draft.account_id))))return c.json(err("MAIL_SEND_FORBIDDEN","Bu posta kutusundan gönderim yetkiniz yok."),403);
    if(upper(draft.provider_type)!=="GMAIL"||upper(draft.account_status)!=="ACTIVE"||!draft.provider_connected)return c.json(err("MAIL_ACCOUNT_NOT_ACTIVE","Gmail posta kutusu aktif ve onaylı değil."),409);
    const attachments=parseAttachments(draft.attachment_refs_json);if(attachments.length)return c.json(err("ATTACHMENT_PROVIDER_SYNC_PENDING","File Hub ekleri Gmail taslağına aktarılmadan gönderim yapılamaz."),409);
    const logicalEventId=text(body.logicalEventId)||"MAIL_DRAFT_SEND:"+draftId,existingJob=await c.env.DB.prepare("SELECT * FROM mail_send_jobs WHERE main_company_slug=? AND logical_event_id=? LIMIT 1").bind(tenant,logicalEventId).first<AnyRow>();
    if(existingJob){
      if(upper(existingJob.status)==="ACCEPTED")return c.json({ok:true,data:{idempotent:true,status:"ACCEPTED",sendJobId:existingJob.id,providerMessageId:existingJob.provider_message_id}});
      if(upper(existingJob.status)==="UNKNOWN_REVIEW_REQUIRED")return c.json(err("UNKNOWN_REVIEW_REQUIRED","Önceki gönderimin sonucu belirsiz. Çift mail riskine karşı otomatik tekrar gönderim kapalıdır.",{sendJobId:existingJob.id}),409);
    }
    const account=await c.env.DB.prepare("SELECT * FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1").bind(draft.account_id,tenant).first<AnyRow>(),token=(await usableToken(c,tenant,account)).text,jobId=text(existingJob?.id)||crypto.randomUUID(),ts=nowIso();
    if(existingJob)await c.env.DB.prepare("UPDATE mail_send_jobs SET status='SENDING',attempt_count=attempt_count+1,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?").bind(ts,jobId,tenant).run();
    else await c.env.DB.prepare("INSERT INTO mail_send_jobs(id,main_company_slug,account_id,draft_id,logical_event_id,status,provider_message_id,provider_acceptance_id,attempt_count,last_error,requested_by,approved_request_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(jobId,tenant,draft.account_id,draftId,logicalEventId,"SENDING",null,null,1,null,text(current.id),null,ts,ts).run();
    try{
      const raw=mimeMessage(account,draft),sent=(await googleJson(GMAIL+"/messages/send",token,{method:"POST",body:JSON.stringify({raw})})).payload,done=nowIso(),providerMessageId=text(sent.id),acceptance=text(sent.threadId||sent.historyId);
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE mail_send_jobs SET status='ACCEPTED',provider_message_id=?,provider_acceptance_id=?,last_error=NULL,updated_at=? WHERE id=? AND main_company_slug=?").bind(providerMessageId||null,acceptance||null,done,jobId,tenant),
        c.env.DB.prepare("UPDATE mail_drafts SET status='SENT',updated_at=? WHERE id=? AND main_company_slug=?").bind(done,draftId,tenant)
      ]);
      await audit(c,tenant,text(current.id),text(draft.account_id),"MAIL_PROVIDER_ACCEPTED",{provider:"GMAIL",draftId,sendJobId:jobId,providerMessageId,acceptance});
      return c.json({ok:true,data:{status:"PROVIDER_ACCEPTED",provider:"GMAIL",sendJobId:jobId,providerMessageId:providerMessageId||null,providerAcceptanceId:acceptance||null,delivered:false}});
    }catch(error:any){
      const detail=text(error?.message)||"Gmail gönderim sonucu doğrulanamadı.",failedAt=nowIso();
      if(Number(error?.status)>=400&&Number(error?.status)<500){
        await c.env.DB.prepare("UPDATE mail_send_jobs SET status='FAILED',last_error=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(detail,failedAt,jobId,tenant).run();
        return c.json(err("GOOGLE_SEND_FAILED",detail,{sendJobId:jobId}),502);
      }
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE mail_send_jobs SET status='UNKNOWN_REVIEW_REQUIRED',last_error=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(detail,failedAt,jobId,tenant),
        c.env.DB.prepare("UPDATE mail_drafts SET status='SEND_REVIEW_REQUIRED',updated_at=? WHERE id=? AND main_company_slug=?").bind(failedAt,draftId,tenant)
      ]);
      await audit(c,tenant,text(current.id),text(draft.account_id),"MAIL_SEND_UNKNOWN_REVIEW_REQUIRED",{provider:"GMAIL",draftId,sendJobId:jobId,error:detail});
      return c.json(err("UNKNOWN_REVIEW_REQUIRED","Gmail gönderim sonucu belirsiz. Çift gönderimi önlemek için otomatik retry yapılmadı.",{sendJobId:jobId}),409);
    }
  });
}
