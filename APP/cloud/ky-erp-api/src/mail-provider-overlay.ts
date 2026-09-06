// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud.ts";
import { mailProviderRegistry, normalizeMailProvider } from "./mail-connection-broker.ts";

type AnyRow = Record<string, any>;

const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toUpperCase().replace(/İ/g,"I");
const nowIso=()=>new Date().toISOString();
const ownerRole=(v:unknown)=>["SUPER_ADMIN","ADMIN"].includes(upper(v));
const companyAdminRole=(v:unknown)=>upper(v)==="COMPANY_ADMIN";
const err=(code:string,message:string,details?:unknown)=>({ok:false,error:{code,message,...(details===undefined?{}:{details})}});

async function bodyOf(c:any){try{const v=await c.req.json();return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch{return{};}}
function permissionRow(current:AnyRow,moduleKey:string){return (Array.isArray(current?.permissions)?current.permissions:[]).find((r:AnyRow)=>upper(r?.moduleKey||r?.module_key)===upper(moduleKey));}
function hasMailPermission(current:AnyRow,flag="canView"){
  if(ownerRole(current?.role)||companyAdminRole(current?.role))return true;
  const row=permissionRow(current,"MAIL");if(!row)return false;
  const legacy:any={canView:"can_view",canCreate:"can_create",canUpdate:"can_update",canDelete:"can_delete",canApprove:"can_approve"};
  return Boolean(row[flag]??row[legacy[flag]]);
}
function ownTenant(current:AnyRow){return text(current?.mainCompanySlug||current?.security?.main_company_slug);}
function requestedTenant(c:any,body:AnyRow,current:AnyRow){
  const requested=text(body?.mainCompanySlug||body?.main_company_slug||c.req.header("X-KYERP-Tenant-Slug")||c.req.query("mainCompanySlug"));
  const own=ownTenant(current);
  if(ownerRole(current?.role))return requested||own;
  if(!own||requested&&requested!==own)return"";
  return own;
}
async function access(c:any,body:AnyRow={}){
  const current=await getAuthenticatedUser(c);if(!current)return{error:c.json(err("UNAUTHORIZED","Oturum gereklidir."),401)};
  const tenant=requestedTenant(c,body,current);if(!tenant)return{error:c.json(err("TENANT_FORBIDDEN","Bu firma Mail Merkezi erişimine izin verilmiyor."),403)};
  return{current,tenant};
}
async function tableExists(c:any,table:string){const row=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<AnyRow>();return Boolean(row?.name);}
async function schemaReady(c:any){for(const table of ["mail_accounts","mail_account_members","mail_approval_requests","mail_approval_steps"])if(!(await tableExists(c,table)))return false;return true;}
function runtime(c:any,provider:unknown){
  const p=normalizeMailProvider(provider),vault=Boolean(text(c.env.MAIL_CREDENTIAL_KEY||c.env.FILE_HUB_OAUTH_KEY));
  if(p==="MICROSOFT_365"){
    const id=text(c.env.MICROSOFT_MAIL_CLIENT_ID||c.env.MICROSOFT_GRAPH_CLIENT_ID),secret=text(c.env.MICROSOFT_MAIL_CLIENT_SECRET||c.env.MICROSOFT_GRAPH_CLIENT_SECRET);
    return{configured:Boolean(vault&&id&&secret),adapterReady:true,reason:vault&&id&&secret?"":"Microsoft Graph OAuth production ayarı eksik."};
  }
  if(p==="GMAIL"){
    const id=text(c.env.GOOGLE_MAIL_CLIENT_ID||c.env.GOOGLE_DRIVE_CLIENT_ID),secret=text(c.env.GOOGLE_MAIL_CLIENT_SECRET||c.env.GOOGLE_DRIVE_CLIENT_SECRET);
    return{configured:Boolean(vault&&id&&secret),adapterReady:true,reason:vault&&id&&secret?"":"Google OAuth / Gmail API production ayarı eksik."};
  }
  return{configured:false,adapterReady:false,reason:"Bu sağlayıcının KY ERP bağlantı adapterı henüz aktif değil."};
}
function accountType(v:unknown){const n=upper(v||"PERSONAL");return["PERSONAL","SHARED","DEPARTMENT"].includes(n)?n:"";}
function dualApproval(type:string,department:unknown){const d=upper(department).replace(/[\s-]+/g,"_");return type==="SHARED"||type==="DEPARTMENT"||["MUHASEBE","ACCOUNTING","E_BELGE","EBELGE","E_DOCUMENT"].includes(d);}
function bool(v:unknown){return v===true||v===1||v==="1"||upper(v)==="TRUE";}

export function registerMailProviderOverlayRoutes(app:any){
  app.get("/api/mail/providers",async(c:any)=>{
    const a:any=await access(c);if(a.error)return a.error;
    if(!hasMailPermission(a.current))return c.json(err("MAIL_FORBIDDEN","Mail Merkezi görüntüleme yetkiniz yok."),403);
    const ready=await schemaReady(c);
    return c.json({ok:true,data:{providers:mailProviderRegistry().map((row:any)=>({...row,...runtime(c,row.provider)})),schemaReady:ready,setupRequired:!ready,credentialVaultReady:Boolean(text(c.env.MAIL_CREDENTIAL_KEY||c.env.FILE_HUB_OAUTH_KEY)),rules:{providerIndependent:true,systemMailSeparate:true,aiMaySendAutomatically:false,plaintextCredentialsAllowed:false}}});
  });

  // Gmail request is intercepted here because the legacy core only knew Microsoft readiness.
  app.post("/api/mail/accounts/request",async(c:any,next:any)=>{
    const body=await bodyOf(c),provider=normalizeMailProvider(body.providerType||body.provider);
    if(provider!=="GMAIL")return next();
    const a:any=await access(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!hasMailPermission(current,"canCreate"))return c.json(err("MAIL_CREATE_FORBIDDEN","Mail hesabı ekleme talebi oluşturma yetkiniz yok."),403);
    if(!(await schemaReady(c)))return c.json(err("MAIL_SCHEMA_NOT_READY","Mail Core kurulumu tamamlanmadan Gmail hesabı açılamaz."),503);
    const providerState=runtime(c,"GMAIL");if(!providerState.configured)return c.json(err("MAIL_PROVIDER_NOT_READY",providerState.reason,{provider:"GMAIL"}),503);
    const type=accountType(body.accountType),email=text(body.emailAddress||body.email).toLowerCase();
    if(!type)return c.json(err("ACCOUNT_TYPE_INVALID","Mail hesap türü geçersiz."),422);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return c.json(err("EMAIL_INVALID","Geçerli bir e-posta adresi girin."),422);
    const existing=await c.env.DB.prepare("SELECT id,status,approval_status FROM mail_accounts WHERE main_company_slug=? AND provider_type='GMAIL' AND LOWER(email_address)=LOWER(?) LIMIT 1").bind(tenant,email).first<AnyRow>();
    if(existing?.id)return c.json(err("MAIL_ACCOUNT_EXISTS","Bu Gmail hesabı için mevcut kayıt veya talep bulunuyor.",existing),409);
    const ts=nowIso(),accountId=crypto.randomUUID(),requestId=crypto.randomUUID(),dual=dualApproval(type,body.departmentCode),policy=dual?"COMPANY_OWNER_AND_APP_OWNER":"COMPANY_OWNER",elevated=ownerRole(current?.role)||companyAdminRole(current?.role),defaultSend=elevated&&bool(body.isDefaultSend),defaultReceive=elevated&&bool(body.isDefaultReceive);
    const statements:any[]=[];
    if(defaultSend)statements.push(c.env.DB.prepare("UPDATE mail_accounts SET is_default_send=0,updated_at=? WHERE main_company_slug=?").bind(ts,tenant));
    if(defaultReceive)statements.push(c.env.DB.prepare("UPDATE mail_accounts SET is_default_receive=0,updated_at=? WHERE main_company_slug=?").bind(ts,tenant));
    statements.push(
      c.env.DB.prepare("INSERT INTO mail_accounts(id,main_company_slug,provider_type,account_type,email_address,display_name,department_code,provider_account_id,status,approval_status,provider_connected,is_default_send,is_default_receive,created_by,approved_by_company,approved_by_owner,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(accountId,tenant,"GMAIL",type,email,text(body.displayName)||email,text(body.departmentCode)||null,null,"PENDING","PENDING",0,defaultSend?1:0,defaultReceive?1:0,text(current?.id),null,null,ts,ts),
      c.env.DB.prepare("INSERT INTO mail_account_members(id,main_company_slug,account_id,user_id,can_view,can_compose,can_send,can_reply,can_forward,can_attach,can_link_entity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),tenant,accountId,text(current?.id),1,1,type==="PERSONAL"?1:0,type==="PERSONAL"?1:0,type==="PERSONAL"?1:0,1,1,ts,ts),
      c.env.DB.prepare("INSERT INTO mail_approval_requests(id,main_company_slug,request_type,target_type,target_id,status,approval_policy,requested_by,request_payload,decided_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(requestId,tenant,"MAIL_ACCOUNT_CONNECT","MAIL_ACCOUNT",accountId,"PENDING",policy,text(current?.id),JSON.stringify({provider:"GMAIL",accountType:type,emailAddress:email,departmentCode:text(body.departmentCode),isDefaultSend:defaultSend,isDefaultReceive:defaultReceive}),null,ts,ts),
      c.env.DB.prepare("INSERT INTO mail_approval_steps(id,main_company_slug,request_id,step_type,step_order,required,status,decided_by,decided_at,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),tenant,requestId,"COMPANY_OWNER",1,1,"PENDING",null,null,null,ts,ts)
    );
    if(dual)statements.push(c.env.DB.prepare("INSERT INTO mail_approval_steps(id,main_company_slug,request_id,step_type,step_order,required,status,decided_by,decided_at,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),tenant,requestId,"APP_OWNER",2,1,"PENDING",null,null,null,ts,ts));
    await c.env.DB.batch(statements);
    return c.json({ok:true,data:{accountId,requestId,status:"PENDING",approvalPolicy:policy,provider:"GMAIL",accountType:type,emailAddress:email,isDefaultSend:defaultSend,isDefaultReceive:defaultReceive}},201);
  });

  app.put("/api/mail/accounts/:id/defaults",async(c:any)=>{
    const body=await bodyOf(c),a:any=await access(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!(ownerRole(current?.role)||companyAdminRole(current?.role)))return c.json(err("MAIL_DEFAULT_ADMIN_FORBIDDEN","Varsayılan mail hesabını yalnız firma sahibi veya uygulama sahibi değiştirebilir."),403);
    const accountId=text(c.req.param("id")),account=await c.env.DB.prepare("SELECT id FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1").bind(accountId,tenant).first<AnyRow>();
    if(!account)return c.json(err("NOT_FOUND","Mail hesabı bulunamadı."),404);
    const ts=nowIso(),send=bool(body.isDefaultSend),receive=bool(body.isDefaultReceive),statements:any[]=[];
    if(send)statements.push(c.env.DB.prepare("UPDATE mail_accounts SET is_default_send=0,updated_at=? WHERE main_company_slug=?").bind(ts,tenant));
    if(receive)statements.push(c.env.DB.prepare("UPDATE mail_accounts SET is_default_receive=0,updated_at=? WHERE main_company_slug=?").bind(ts,tenant));
    statements.push(c.env.DB.prepare("UPDATE mail_accounts SET is_default_send=?,is_default_receive=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(send?1:0,receive?1:0,ts,accountId,tenant));
    await c.env.DB.batch(statements);
    return c.json({ok:true,data:{accountId,isDefaultSend:send,isDefaultReceive:receive}});
  });
}
