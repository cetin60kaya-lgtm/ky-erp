// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud.ts";
import { mailProviderRegistry, normalizeMailProvider } from "./mail-connection-broker.ts";

type AnyRow = Record<string, any>;

const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const ownerRole = (v: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(v));
const companyAdminRole = (v: unknown) => upper(v) === "COMPANY_ADMIN";
const jsonError = (code: string, message: string, details?: unknown) => ({ ok:false, error:{ code, message, ...(details===undefined?{}:{details}) } });

async function bodyOf(c:any) {
  try { const v=await c.req.json(); return v && typeof v==="object" && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
}
function permissionRow(current:AnyRow,moduleKey:string) {
  return (Array.isArray(current?.permissions)?current.permissions:[]).find((r:AnyRow)=>upper(r?.moduleKey||r?.module_key)===upper(moduleKey));
}
function hasMailPermission(current:AnyRow,flag="canView") {
  if(ownerRole(current?.role)||companyAdminRole(current?.role)) return true;
  const r=permissionRow(current,"MAIL"); if(!r) return false;
  const map:any={canCreate:"can_create",canUpdate:"can_update",canDelete:"can_delete",canApprove:"can_approve",canView:"can_view"};
  return Boolean(r[flag] ?? r[map[flag]]);
}
function ownTenant(current:AnyRow) { return text(current?.mainCompanySlug||current?.security?.main_company_slug); }
function requestedTenant(c:any,body:AnyRow,current:AnyRow) {
  const requested=text(body?.mainCompanySlug||body?.main_company_slug||c.req.header("X-KYERP-Tenant-Slug")||c.req.query("mainCompanySlug"));
  const own=ownTenant(current);
  if(ownerRole(current?.role)) return requested||own;
  if(!own) return "";
  if(requested && requested!==own) return "";
  return own;
}
function clientIp(c:any) { return text(c.req.header("CF-Connecting-IP")||c.req.header("X-Forwarded-For")?.split(",")[0]); }
async function tableExists(c:any,table:string) {
  const r=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<AnyRow>();
  return Boolean(r?.name);
}
async function audit(c:any,tenant:string,current:AnyRow,action:string,detail:AnyRow={},accountId="",messageId="") {
  if(!(await tableExists(c,"mail_audit_log"))) return;
  await c.env.DB.prepare("INSERT INTO mail_audit_log (id,main_company_slug,actor_user_id,account_id,message_id,action,detail,ip_address,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),tenant,text(current?.id)||null,accountId||null,messageId||null,action,JSON.stringify(detail||{}),clientIp(c)||null,nowIso()).run();
}

function b64url(bytes:Uint8Array){let raw="";for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function unb64url(value:string){const n=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);const raw=atob(n);return Uint8Array.from(raw,ch=>ch.charCodeAt(0));}
async function credentialKey(c:any){
  const secret=text(c.env.MAIL_CREDENTIAL_KEY || c.env.FILE_HUB_OAUTH_KEY);
  if(!secret) throw Object.assign(new Error("MAIL_CREDENTIAL_KEY veya FILE_HUB_OAUTH_KEY tanımlı değil."),{code:"MAIL_CREDENTIAL_KEY_MISSING"});
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw",digest,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
export async function sealMailCredential(c:any,value:unknown){
  const plain=typeof value==="string"?value:JSON.stringify(value??{});
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},await credentialKey(c),new TextEncoder().encode(plain));
  return {ciphertext:b64url(new Uint8Array(cipher)),nonce:b64url(nonce),keyVersion:"v1"};
}
export async function openMailCredential(c:any,payload:{ciphertext:string;nonce:string}){
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64url(payload.nonce)},await credentialKey(c),unb64url(payload.ciphertext));
  return new TextDecoder().decode(plain);
}

function providerRuntimeReady(c:any, provider:unknown){
  const normalized=normalizeMailProvider(provider);
  const vaultReady=Boolean(text(c.env.MAIL_CREDENTIAL_KEY || c.env.FILE_HUB_OAUTH_KEY));
  if(normalized==="MICROSOFT_365"){
    const clientId=text(c.env.MICROSOFT_MAIL_CLIENT_ID || c.env.MICROSOFT_GRAPH_CLIENT_ID);
    const clientSecret=text(c.env.MICROSOFT_MAIL_CLIENT_SECRET || c.env.MICROSOFT_GRAPH_CLIENT_SECRET);
    return {configured:Boolean(vaultReady&&clientId&&clientSecret),adapterReady:true,reason:vaultReady&&clientId&&clientSecret?"":"Microsoft Graph OAuth production ayarı eksik."};
  }
  return {configured:false,adapterReady:false,reason:"Bu sağlayıcının KY ERP bağlantı adapterı henüz aktif değil."};
}

function accountType(v:unknown){const n=upper(v||"PERSONAL");return ["PERSONAL","SHARED","DEPARTMENT"].includes(n)?n:"";}
function dualApprovalRequired(type:string,department:unknown){
  const d=upper(department).replace(/[\s-]+/g,"_");
  return type==="SHARED"||type==="DEPARTMENT"||["MUHASEBE","ACCOUNTING","E_BELGE","EBELGE","E_DOCUMENT"].includes(d);
}
async function currentAndTenant(c:any,body:AnyRow={}){
  const current=await getAuthenticatedUser(c);
  if(!current)return{error:c.json(jsonError("UNAUTHORIZED","Oturum gereklidir."),401)};
  const tenant=requestedTenant(c,body,current);
  if(!tenant)return{error:c.json(jsonError("TENANT_FORBIDDEN","Bu firma Mail Merkezi erişimine izin verilmiyor."),403)};
  return{current,tenant};
}
async function canAccessAccount(c:any,current:AnyRow,tenant:string,accountId:string,flag="can_view"){
  if(ownerRole(current?.role)||companyAdminRole(current?.role)){
    const r=await c.env.DB.prepare("SELECT id FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1").bind(accountId,tenant).first<AnyRow>();
    return Boolean(r?.id);
  }
  const allowed=new Set(["can_view","can_compose","can_send","can_reply","can_forward","can_attach","can_link_entity"]);
  const column=allowed.has(flag)?flag:"can_view";
  const sql="SELECT m.id FROM mail_account_members m JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE m.account_id=? AND m.main_company_slug=? AND m.user_id=? AND m."+column+"=1 LIMIT 1";
  const r=await c.env.DB.prepare(sql).bind(accountId,tenant,text(current?.id)).first<AnyRow>();
  return Boolean(r?.id);
}

export function registerMailCommunicationRoutes(app:any){
  app.get("/api/mail/providers",async(c:any)=>{
    const a:any=await currentAndTenant(c);if(a.error)return a.error;
    if(!hasMailPermission(a.current))return c.json(jsonError("MAIL_FORBIDDEN","Mail Merkezi görüntüleme yetkiniz yok."),403);
    return c.json({ok:true,data:{providers:mailProviderRegistry().map((row:any)=>({...row,...providerRuntimeReady(c,row.provider)})),credentialVaultReady:Boolean(text(c.env.MAIL_CREDENTIAL_KEY || c.env.FILE_HUB_OAUTH_KEY)),rules:{providerIndependent:true,systemMailSeparate:true,aiMaySendAutomatically:false,plaintextCredentialsAllowed:false}}});
  });

  app.get("/api/mail/overview",async(c:any)=>{
    const a:any=await currentAndTenant(c);if(a.error)return a.error;const{current,tenant}=a;
    if(!hasMailPermission(current))return c.json(jsonError("MAIL_FORBIDDEN","Mail Merkezi görüntüleme yetkiniz yok."),403);
    const elevated=ownerRole(current?.role)||companyAdminRole(current?.role),userId=text(current?.id);
    const accountWhere=elevated?"a.main_company_slug=?":"a.main_company_slug=? AND EXISTS (SELECT 1 FROM mail_account_members mm WHERE mm.main_company_slug=a.main_company_slug AND mm.account_id=a.id AND mm.user_id=? AND mm.can_view=1)";
    const args=elevated?[tenant]:[tenant,userId];
    const accounts=await c.env.DB.prepare("SELECT COUNT(*) n,SUM(CASE WHEN a.status='ACTIVE' THEN 1 ELSE 0 END) active_n,SUM(CASE WHEN a.approval_status='PENDING' THEN 1 ELSE 0 END) pending_n FROM mail_accounts a WHERE "+accountWhere).bind(...args).first<AnyRow>();
    const messages=await c.env.DB.prepare("SELECT COUNT(*) n,SUM(CASE WHEN m.direction='INCOMING' AND m.is_read=0 THEN 1 ELSE 0 END) unread_n FROM mail_messages m JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE "+accountWhere).bind(...args).first<AnyRow>();
    const drafts=await c.env.DB.prepare("SELECT COUNT(*) n FROM mail_drafts d JOIN mail_accounts a ON a.id=d.account_id AND a.main_company_slug=d.main_company_slug WHERE d.status='DRAFT' AND "+accountWhere).bind(...args).first<AnyRow>();
    return c.json({ok:true,data:{accountCount:Number(accounts?.n||0),activeAccountCount:Number(accounts?.active_n||0),pendingAccountCount:Number(accounts?.pending_n||0),messageCount:Number(messages?.n||0),unreadCount:Number(messages?.unread_n||0),draftCount:Number(drafts?.n||0),tenant}});
  });

  app.get("/api/mail/accounts",async(c:any)=>{
    const a:any=await currentAndTenant(c);if(a.error)return a.error;const{current,tenant}=a;
    if(!hasMailPermission(current))return c.json(jsonError("MAIL_FORBIDDEN","Mail hesabı görüntüleme yetkiniz yok."),403);
    const elevated=ownerRole(current?.role)||companyAdminRole(current?.role);
    const result=elevated
      ?await c.env.DB.prepare("SELECT a.* FROM mail_accounts a WHERE a.main_company_slug=? ORDER BY CASE a.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,a.email_address").bind(tenant).all<AnyRow>()
      :await c.env.DB.prepare("SELECT a.*,m.can_view,m.can_compose,m.can_send,m.can_reply,m.can_forward,m.can_attach,m.can_link_entity FROM mail_account_members m JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE m.main_company_slug=? AND m.user_id=? AND m.can_view=1 ORDER BY CASE a.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,a.email_address").bind(tenant,text(current?.id)).all<AnyRow>();
    return c.json({ok:true,data:result.results||[]});
  });

  app.post("/api/mail/accounts/request",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAndTenant(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!hasMailPermission(current,"canCreate"))return c.json(jsonError("MAIL_CREATE_FORBIDDEN","Mail hesabı ekleme talebi oluşturma yetkiniz yok."),403);
    const provider=normalizeMailProvider(body.providerType||body.provider),type=accountType(body.accountType),email=text(body.emailAddress||body.email).toLowerCase();
    if(!provider)return c.json(jsonError("PROVIDER_INVALID","Desteklenen bir mail sağlayıcısı seçin."),422);
    const runtime=providerRuntimeReady(c,provider);
    if(!runtime.adapterReady||!runtime.configured)return c.json(jsonError("MAIL_PROVIDER_NOT_READY",runtime.reason||"Bu mail sağlayıcısı henüz bağlantıya hazır değil.",{provider,configured:runtime.configured,adapterReady:runtime.adapterReady}),503);
    if(!type)return c.json(jsonError("ACCOUNT_TYPE_INVALID","Mail hesap türü geçersiz."),422);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return c.json(jsonError("EMAIL_INVALID","Geçerli bir iş e-posta adresi girin."),422);
    const existing=await c.env.DB.prepare("SELECT id,status,approval_status FROM mail_accounts WHERE main_company_slug=? AND provider_type=? AND LOWER(email_address)=LOWER(?) LIMIT 1").bind(tenant,provider,email).first<AnyRow>();
    if(existing?.id)return c.json(jsonError("MAIL_ACCOUNT_EXISTS","Bu mail hesabı için mevcut bir kayıt veya talep bulunuyor.",existing),409);

    const ts=nowIso(),accountId=crypto.randomUUID(),requestId=crypto.randomUUID(),dual=dualApprovalRequired(type,body.departmentCode),policy=dual?"COMPANY_OWNER_AND_APP_OWNER":"COMPANY_OWNER";
    const statements=[
      c.env.DB.prepare("INSERT INTO mail_accounts (id,main_company_slug,provider_type,account_type,email_address,display_name,department_code,provider_account_id,status,approval_status,provider_connected,is_default_send,is_default_receive,created_by,approved_by_company,approved_by_owner,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(accountId,tenant,provider,type,email,text(body.displayName)||email,text(body.departmentCode)||null,null,"PENDING","PENDING",0,0,0,text(current?.id),null,null,ts,ts),
      c.env.DB.prepare("INSERT INTO mail_account_members (id,main_company_slug,account_id,user_id,can_view,can_compose,can_send,can_reply,can_forward,can_attach,can_link_entity,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),tenant,accountId,text(current?.id),1,1,type==="PERSONAL"?1:0,type==="PERSONAL"?1:0,type==="PERSONAL"?1:0,1,1,ts,ts), // MAIL_REQUESTER_INITIAL_MEMBER
      c.env.DB.prepare("INSERT INTO mail_approval_requests (id,main_company_slug,request_type,target_type,target_id,status,approval_policy,requested_by,request_payload,decided_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(requestId,tenant,"MAIL_ACCOUNT_CONNECT","MAIL_ACCOUNT",accountId,"PENDING",policy,text(current?.id),JSON.stringify({provider,accountType:type,emailAddress:email,departmentCode:text(body.departmentCode)}),null,ts,ts),
      c.env.DB.prepare("INSERT INTO mail_approval_steps (id,main_company_slug,request_id,step_type,step_order,required,status,decided_by,decided_at,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),tenant,requestId,"COMPANY_OWNER",1,1,"PENDING",null,null,null,ts,ts)
    ];
    if(dual)statements.push(c.env.DB.prepare("INSERT INTO mail_approval_steps (id,main_company_slug,request_id,step_type,step_order,required,status,decided_by,decided_at,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),tenant,requestId,"APP_OWNER",2,1,"PENDING",null,null,null,ts,ts));
    await c.env.DB.batch(statements);
    await audit(c,tenant,current,"MAIL_ACCOUNT_REQUESTED",{requestId,provider,type,email,policy},accountId);
    return c.json({ok:true,data:{accountId,requestId,status:"PENDING",approvalPolicy:policy,provider,accountType:type,emailAddress:email}},201);
  });

  app.get("/api/mail/accounts/:id/members",async(c:any)=>{
    const a:any=await currentAndTenant(c);if(a.error)return a.error;const{current,tenant}=a,accountId=text(c.req.param("id"));
    if(!(ownerRole(current?.role)||companyAdminRole(current?.role)))return c.json(jsonError("MAIL_MEMBER_ADMIN_FORBIDDEN","Posta kutusu kullanıcı yetkilerini yalnız firma sahibi veya uygulama sahibi yönetebilir."),403);
    if(!(await canAccessAccount(c,current,tenant,accountId)))return c.json(jsonError("MAIL_ACCOUNT_FORBIDDEN","Bu posta kutusu bu firmaya ait değil."),403);
    const r=await c.env.DB.prepare("SELECT m.*,u.username,u.full_name,s.email FROM mail_account_members m LEFT JOIN auth_users u ON u.id=m.user_id LEFT JOIN auth_user_security s ON s.user_id=m.user_id WHERE m.main_company_slug=? AND m.account_id=? ORDER BY COALESCE(u.full_name,u.username,m.user_id)").bind(tenant,accountId).all<AnyRow>();
    return c.json({ok:true,data:r.results||[]});
  });

  app.put("/api/mail/accounts/:id/members",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAndTenant(c,body);if(a.error)return a.error;const{current,tenant}=a,accountId=text(c.req.param("id")),userId=text(body.userId);
    if(!(ownerRole(current?.role)||companyAdminRole(current?.role)))return c.json(jsonError("MAIL_MEMBER_ADMIN_FORBIDDEN","Posta kutusu kullanıcı yetkilerini yalnız firma sahibi veya uygulama sahibi yönetebilir."),403);
    if(!userId)return c.json(jsonError("USER_REQUIRED","Kullanıcı seçilmelidir."),422);
    if(!(await canAccessAccount(c,current,tenant,accountId)))return c.json(jsonError("MAIL_ACCOUNT_FORBIDDEN","Bu posta kutusu bu firmaya ait değil."),403);
    const target=await c.env.DB.prepare("SELECT u.id,s.main_company_slug FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? LIMIT 1").bind(userId).first<AnyRow>();
    if(!target?.id||text(target.main_company_slug)!==tenant)return c.json(jsonError("USER_TENANT_FORBIDDEN","Kullanıcı bu firmaya ait değil."),403);
    const ts=nowIso(),bool=(v:any)=>v===true||v===1||v==="1";
    await c.env.DB.prepare("INSERT INTO mail_account_members (id,main_company_slug,account_id,user_id,can_view,can_compose,can_send,can_reply,can_forward,can_attach,can_link_entity,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_slug,account_id,user_id) DO UPDATE SET can_view=excluded.can_view,can_compose=excluded.can_compose,can_send=excluded.can_send,can_reply=excluded.can_reply,can_forward=excluded.can_forward,can_attach=excluded.can_attach,can_link_entity=excluded.can_link_entity,updated_at=excluded.updated_at")
      .bind(crypto.randomUUID(),tenant,accountId,userId,bool(body.canView)?1:0,bool(body.canCompose)?1:0,bool(body.canSend)?1:0,bool(body.canReply)?1:0,bool(body.canForward)?1:0,bool(body.canAttach)?1:0,bool(body.canLinkEntity)?1:0,ts,ts).run();
    await audit(c,tenant,current,"MAIL_ACCOUNT_MEMBER_UPDATED",{userId,permissions:{canView:bool(body.canView),canCompose:bool(body.canCompose),canSend:bool(body.canSend),canReply:bool(body.canReply),canForward:bool(body.canForward),canAttach:bool(body.canAttach),canLinkEntity:bool(body.canLinkEntity)}},accountId);
    return c.json({ok:true,data:{accountId,userId,updatedAt:ts}});
  });

  app.get("/api/mail/approvals",async(c:any)=>{
    const a:any=await currentAndTenant(c);if(a.error)return a.error;const{current,tenant}=a;
    if(!(ownerRole(current?.role)||companyAdminRole(current?.role)||hasMailPermission(current,"canApprove")))return c.json(jsonError("MAIL_APPROVAL_FORBIDDEN","Mail bağlantı onaylarını görme yetkiniz yok."),403);
    const r=await c.env.DB.prepare("SELECT r.*,a.email_address,a.display_name,a.provider_type,a.account_type,a.department_code,(SELECT COUNT(*) FROM mail_approval_steps s WHERE s.request_id=r.id AND s.required=1 AND s.status='PENDING') pending_steps FROM mail_approval_requests r JOIN mail_accounts a ON a.id=r.target_id AND a.main_company_slug=r.main_company_slug WHERE r.main_company_slug=? ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200").bind(tenant).all<AnyRow>();
    return c.json({ok:true,data:r.results||[]});
  });

  app.post("/api/mail/approvals/:id/decision",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAndTenant(c,body);if(a.error)return a.error;const{current,tenant}=a;
    const requestId=text(c.req.param("id")),decision=upper(body.decision);
    if(!["APPROVE","REJECT"].includes(decision))return c.json(jsonError("DECISION_INVALID","Karar APPROVE veya REJECT olmalıdır."),422);
    const request=await c.env.DB.prepare("SELECT * FROM mail_approval_requests WHERE id=? AND main_company_slug=? LIMIT 1").bind(requestId,tenant).first<AnyRow>();
    if(!request)return c.json(jsonError("NOT_FOUND","Mail onay talebi bulunamadı."),404);
    if(upper(request.status)!=="PENDING")return c.json(jsonError("REQUEST_ALREADY_DECIDED","Bu mail onay talebi daha önce sonuçlandırılmış."),409);
    const stepType=ownerRole(current?.role)?"APP_OWNER":companyAdminRole(current?.role)?"COMPANY_OWNER":"";
    if(!stepType)return c.json(jsonError("MAIL_APPROVAL_FORBIDDEN","Bu onay adımını sonuçlandırma yetkiniz yok."),403);
    const step=await c.env.DB.prepare("SELECT * FROM mail_approval_steps WHERE request_id=? AND main_company_slug=? AND step_type=? AND required=1 LIMIT 1").bind(requestId,tenant,stepType).first<AnyRow>();
    if(!step&&ownerRole(current?.role))return c.json(jsonError("COMPANY_OWNER_APPROVAL_REQUIRED","Önce firma sahibi onayı gereklidir."),409);
    if(!step)return c.json(jsonError("APPROVAL_STEP_NOT_FOUND","Bu rol için bekleyen onay adımı yok."),409);
    if(upper(step.status)!=="PENDING")return c.json(jsonError("APPROVAL_STEP_ALREADY_DECIDED","Bu onay adımı daha önce sonuçlandırılmış."),409);
    if(stepType==="APP_OWNER"){
      const companyStep=await c.env.DB.prepare("SELECT status FROM mail_approval_steps WHERE request_id=? AND main_company_slug=? AND step_type='COMPANY_OWNER' AND required=1 LIMIT 1").bind(requestId,tenant).first<AnyRow>();
      if(upper(companyStep?.status)!=="APPROVED")return c.json(jsonError("COMPANY_OWNER_STEP_PENDING","Önce firma sahibi bu mail bağlantısını onaylamalıdır."),409);
    }
    const ts=nowIso(),next=decision==="APPROVE"?"APPROVED":"REJECTED";
    await c.env.DB.prepare("UPDATE mail_approval_steps SET status=?,decided_by=?,decided_at=?,note=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(next,text(current?.id),ts,text(body.note)||null,ts,step.id,tenant).run();

    if(decision==="REJECT"){
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE mail_approval_requests SET status='REJECTED',decided_at=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(ts,ts,requestId,tenant),
        c.env.DB.prepare("UPDATE mail_accounts SET approval_status='REJECTED',status='DISCONNECTED',updated_at=? WHERE id=? AND main_company_slug=?").bind(ts,request.target_id,tenant)
      ]);
      await audit(c,tenant,current,"MAIL_ACCOUNT_APPROVAL_REJECTED",{requestId,stepType,note:text(body.note)},text(request.target_id));
      return c.json({ok:true,data:{requestId,status:"REJECTED"}});
    }

    const pending=await c.env.DB.prepare("SELECT COUNT(*) n FROM mail_approval_steps WHERE request_id=? AND main_company_slug=? AND required=1 AND status<>'APPROVED'").bind(requestId,tenant).first<AnyRow>();
    if(Number(pending?.n||0)===0){
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE mail_approval_requests SET status='APPROVED',decided_at=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(ts,ts,requestId,tenant),
        c.env.DB.prepare("UPDATE mail_accounts SET approval_status='APPROVED',approved_by_company=COALESCE(approved_by_company,(SELECT decided_by FROM mail_approval_steps WHERE request_id=? AND step_type='COMPANY_OWNER' AND status='APPROVED' LIMIT 1)),approved_by_owner=COALESCE(approved_by_owner,(SELECT decided_by FROM mail_approval_steps WHERE request_id=? AND step_type='APP_OWNER' AND status='APPROVED' LIMIT 1)),status=CASE WHEN provider_connected=1 THEN 'ACTIVE' ELSE 'DISCONNECTED' END,updated_at=? WHERE id=? AND main_company_slug=?").bind(requestId,requestId,ts,request.target_id,tenant)
      ]);
      await audit(c,tenant,current,"MAIL_ACCOUNT_APPROVED",{requestId},text(request.target_id));
      return c.json({ok:true,data:{requestId,status:"APPROVED",connectionStatus:"DISCONNECTED"}});
    }
    await audit(c,tenant,current,"MAIL_ACCOUNT_APPROVAL_STEP_APPROVED",{requestId,stepType},text(request.target_id));
    return c.json({ok:true,data:{requestId,status:"PENDING",approvedStep:stepType}});
  });

  app.get("/api/mail/messages",async(c:any)=>{
    const a:any=await currentAndTenant(c);if(a.error)return a.error;const{current,tenant}=a;
    if(!hasMailPermission(current))return c.json(jsonError("MAIL_FORBIDDEN","Mail görüntüleme yetkiniz yok."),403);
    const accountId=text(c.req.query("accountId"));if(!accountId)return c.json(jsonError("ACCOUNT_REQUIRED","Mail hesabı seçilmelidir."),422);
    if(!(await canAccessAccount(c,current,tenant,accountId,"can_view")))return c.json(jsonError("MAIL_ACCOUNT_FORBIDDEN","Bu posta kutusunu görüntüleme yetkiniz yok."),403);
    const take=Math.min(200,Math.max(1,Number(c.req.query("take")||100))),folderId=text(c.req.query("folderId")),direction=upper(c.req.query("direction")),where=["m.main_company_slug=?","m.account_id=?"],args:any[]=[tenant,accountId];
    if(folderId){where.push("m.folder_id=?");args.push(folderId)}if(["INCOMING","OUTGOING"].includes(direction)){where.push("m.direction=?");args.push(direction)}args.push(take);
    const r=await c.env.DB.prepare("SELECT m.* FROM mail_messages m WHERE "+where.join(" AND ")+" ORDER BY COALESCE(m.received_at,m.sent_at,m.created_at) DESC LIMIT ?").bind(...args).all<AnyRow>();
    return c.json({ok:true,data:r.results||[]});
  });

  app.get("/api/mail/drafts",async(c:any)=>{
    const a:any=await currentAndTenant(c);if(a.error)return a.error;const{current,tenant}=a;
    if(!hasMailPermission(current))return c.json(jsonError("MAIL_FORBIDDEN","Mail taslaklarını görüntüleme yetkiniz yok."),403);
    const r=ownerRole(current?.role)||companyAdminRole(current?.role)
      ?await c.env.DB.prepare("SELECT d.* FROM mail_drafts d WHERE d.main_company_slug=? AND d.status='DRAFT' ORDER BY d.updated_at DESC LIMIT 200").bind(tenant).all<AnyRow>()
      :await c.env.DB.prepare("SELECT d.* FROM mail_drafts d JOIN mail_account_members m ON m.account_id=d.account_id AND m.main_company_slug=d.main_company_slug WHERE d.main_company_slug=? AND d.status='DRAFT' AND m.user_id=? AND m.can_view=1 ORDER BY d.updated_at DESC LIMIT 200").bind(tenant,text(current?.id)).all<AnyRow>();
    return c.json({ok:true,data:r.results||[]});
  });

  app.post("/api/mail/drafts",async(c:any)=>{
    const body=await bodyOf(c),a:any=await currentAndTenant(c,body);if(a.error)return a.error;const{current,tenant}=a;
    if(!hasMailPermission(current,"canCreate"))return c.json(jsonError("MAIL_COMPOSE_FORBIDDEN","Mail taslağı oluşturma yetkiniz yok."),403);
    const accountId=text(body.accountId);
    if(!accountId||!(await canAccessAccount(c,current,tenant,accountId,"can_compose")))return c.json(jsonError("MAIL_ACCOUNT_COMPOSE_FORBIDDEN","Bu posta kutusundan taslak oluşturma yetkiniz yok."),403);
    const ts=nowIso(),id=crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO mail_drafts (id,main_company_slug,account_id,provider_draft_id,reply_to_message_id,subject,body_text,body_html,recipients_json,attachment_refs_json,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tenant,accountId,null,text(body.replyToMessageId)||null,text(body.subject),text(body.bodyText)||null,text(body.bodyHtml)||null,JSON.stringify(body.recipients||{}),JSON.stringify(body.attachmentRefs||[]),"DRAFT",text(current?.id),ts,ts).run();
    await audit(c,tenant,current,"MAIL_DRAFT_CREATED",{subject:text(body.subject)},accountId);
    return c.json({ok:true,data:{id,status:"DRAFT",accountId}},201);
  });
}
